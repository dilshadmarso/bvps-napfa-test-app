const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyjiK1MWx30tV0wxZsTf5k5OLaGbQsvbCNacuBO8Ypa7lNTDMK46BRZY0T3Vn3dgP3X/exec";

const PENDING_SAVE_STORAGE_KEY = "BVPS_NAPFA_RUN_PENDING_SAVES_V2";

const STATUS = {
  UNASSIGNED: "Unassigned",
  WAVE_1: "Wave 1",
  WAVE_2: "Wave 2",
  NOT_RUNNING: "Not Running"
};

let students = [];
let sessionId = "";
let currentWave = "Wave 1";

let waveStartPerformanceTime = null;
let timerInterval = null;

let finishRecords = [];
let finishPositionCounter = 0;

let saveQueue = [];
let saveQueueRunning = false;
let cancelledQueueIds = new Set();

let assignmentTapTrackers = {};
let currentReviewWave = "Wave 1";

window.addEventListener("load", initialisePage);


/* =====================================================
   INITIALISATION
===================================================== */

async function initialisePage() {
  setTodayDate();
  installCloseWarning();

  await loadLevels();
  await retryStoredPendingSaves();
}


function setTodayDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  document.getElementById("testDate").value =
    `${year}-${month}-${day}`;
}


function installCloseWarning() {
  window.addEventListener("beforeunload", event => {
    if (hasUnsafeWork()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}


function hasUnsafeWork() {
  return (
    waveStartPerformanceTime !== null ||
    saveQueue.length > 0 ||
    saveQueueRunning ||
    readStoredPendingSaves().length > 0
  );
}


/* =====================================================
   LOADING OVERLAY
===================================================== */

function showLoading(message) {
  document.getElementById("loadingText").textContent =
    message || "Loading...";

  document
    .getElementById("loadingOverlay")
    .classList.remove("hidden");
}


function hideLoading() {
  document
    .getElementById("loadingOverlay")
    .classList.add("hidden");
}


/* =====================================================
   BACKEND
===================================================== */

async function callBackend(payload) {
  const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  const rawText = await response.text();

  let result;

  try {
    result = JSON.parse(rawText);
  } catch (error) {
    throw new Error("Backend returned an invalid response.");
  }

  return result;
}


/* =====================================================
   PROGRESS / PAGE NAVIGATION
===================================================== */

function showOnlySection(sectionId) {
  const sections = [
    "stepSetup",
    "stepWave1Assignment",
    "stepWave2Assignment",
    "stepTiming",
    "stepWaveReview",
    "stepFinalReview"
  ];

  sections.forEach(id => {
    document.getElementById(id).classList.add("hidden");
  });

  document.getElementById(sectionId).classList.remove("hidden");

  window.scrollTo({
    top: 0,
    behaviour: "smooth"
  });
}


function updateProgress(stage) {
  const setup = document.getElementById("progressSetup");
  const assign = document.getElementById("progressAssign");
  const run = document.getElementById("progressRun");
  const review = document.getElementById("progressReview");

  [setup, assign, run, review].forEach(item => {
    item.classList.remove("active", "done");
  });

  if (stage === "setup") {
    setup.classList.add("active");
  }

  if (stage === "assign") {
    setup.classList.add("done");
    assign.classList.add("active");
  }

  if (stage === "run") {
    setup.classList.add("done");
    assign.classList.add("done");
    run.classList.add("active");
  }

  if (stage === "review") {
    setup.classList.add("done");
    assign.classList.add("done");
    run.classList.add("done");
    review.classList.add("active");
  }
}


/* =====================================================
   SETUP
===================================================== */

async function loadLevels() {
  showLoading("Loading levels...");

  try {
    const result = await callBackend({
      action: "getLevels"
    });

    if (!result.success) {
      throw new Error(result.error || "Unable to load levels.");
    }

    const select = document.getElementById("levelSelect");

    select.innerHTML =
      `<option value="">Select level</option>`;

    result.levels.forEach(level => {
      const option = document.createElement("option");

      option.value = level;
      option.textContent = level;

      select.appendChild(option);
    });

    document.getElementById("setupMessage").textContent =
      "Levels loaded.";

  } catch (error) {
    document.getElementById("setupMessage").textContent =
      "Failed to load levels: " + error.message;

  } finally {
    hideLoading();
  }
}


async function loadClasses() {
  const level = document.getElementById("levelSelect").value;
  const classSelect = document.getElementById("classSelect");

  classSelect.innerHTML =
    `<option value="">Select class</option>`;

  resetSessionState();

  if (!level) {
    return;
  }

  showLoading("Loading classes...");

  try {
    const result = await callBackend({
      action: "getClasses",
      level
    });

    if (!result.success) {
      throw new Error(result.error || "Unable to load classes.");
    }

    result.classes.forEach(className => {
      const option = document.createElement("option");

      option.value = className;
      option.textContent = className;

      classSelect.appendChild(option);
    });

    document.getElementById("setupMessage").textContent =
      "Classes loaded.";

  } catch (error) {
    document.getElementById("setupMessage").textContent =
      "Failed to load classes: " + error.message;

  } finally {
    hideLoading();
  }
}


async function loadStudents() {
  const className =
    document.getElementById("classSelect").value;

  resetSessionState();

  if (!className) {
    return;
  }

  showLoading("Loading pupils...");

  try {
    const result = await callBackend({
      action: "getRunStudentsByClass",
      className
    });

    if (!result.success) {
      throw new Error(result.error || "Unable to load pupils.");
    }

    students = result.students.map(student => ({
      ...student,
      RunAssignment: STATUS.UNASSIGNED,
      RunStatus: STATUS.UNASSIGNED,
      NotRunningReason: ""
    }));

    const testDate =
      document.getElementById("testDate").value;

    sessionId =
      `${className}-RUN-${testDate}`;

    document.getElementById("setupMessage").textContent =
      `${students.length} pupils loaded.`;

  } catch (error) {
    document.getElementById("setupMessage").textContent =
      "Failed to load pupils: " + error.message;

  } finally {
    hideLoading();
  }
}


function goToWave1Selection() {
  if (students.length === 0) {
    alert("Please select a class and load pupils first.");
    return;
  }

  renderWave1Assignment();
  showOnlySection("stepWave1Assignment");
  updateProgress("assign");
}


/* =====================================================
   ASSIGNMENT TAP HANDLING
===================================================== */

function registerAssignmentTap(studentIndex, phase) {
  const trackerKey = `${phase}-${studentIndex}`;

  if (!assignmentTapTrackers[trackerKey]) {
    assignmentTapTrackers[trackerKey] = {
      count: 0,
      timer: null
    };
  }

  const tracker = assignmentTapTrackers[trackerKey];

  tracker.count += 1;

  if (tracker.timer) {
    clearTimeout(tracker.timer);
  }

  if (tracker.count >= 3) {
    tracker.count = 0;
    tracker.timer = null;

    handleTripleTap(studentIndex, phase);
    return;
  }

  tracker.timer = setTimeout(() => {
    const count = tracker.count;

    tracker.count = 0;
    tracker.timer = null;

    if (count === 1) {
      handleSingleTap(studentIndex, phase);
    }
  }, 430);
}


function handleSingleTap(studentIndex, phase) {
  const student = students[studentIndex];

  if (student.RunAssignment === STATUS.NOT_RUNNING) {
    return;
  }

  if (phase === "wave1") {
    student.RunAssignment =
      student.RunAssignment === STATUS.WAVE_1
        ? STATUS.UNASSIGNED
        : STATUS.WAVE_1;
  }

  if (phase === "wave2") {
    student.RunAssignment =
      student.RunAssignment === STATUS.WAVE_2
        ? STATUS.UNASSIGNED
        : STATUS.WAVE_2;
  }

  student.RunStatus = student.RunAssignment;

  if (phase === "wave1") {
    renderWave1Assignment();
  } else {
    renderWave2Assignment();
  }
}


function handleTripleTap(studentIndex, phase) {
  const student = students[studentIndex];

  if (student.RunAssignment === STATUS.NOT_RUNNING) {
    student.RunAssignment = STATUS.UNASSIGNED;
    student.RunStatus = STATUS.UNASSIGNED;
  } else {
    student.RunAssignment = STATUS.NOT_RUNNING;
    student.RunStatus = STATUS.NOT_RUNNING;
  }

  if (phase === "wave1") {
    renderWave1Assignment();
  } else {
    renderWave2Assignment();
  }
}


/* =====================================================
   WAVE 1 ASSIGNMENT
===================================================== */

function renderWave1Assignment() {
  const grid =
    document.getElementById("wave1AssignmentGrid");

  grid.innerHTML = "";

  students.forEach((student, index) => {
    const circle =
      createAssignmentCircle(student, index, "wave1");

    grid.appendChild(circle);
  });

  updateAssignmentCounts();
}


function confirmWave1Selection() {
  const selected =
    students.filter(
      student =>
        student.RunAssignment === STATUS.WAVE_1
    );

  if (selected.length === 0) {
    alert("Please select at least one pupil for Wave 1.");
    return;
  }

  renderWave2Assignment();
  showOnlySection("stepWave2Assignment");
}


function returnToWave1Selection() {
  renderWave1Assignment();
  showOnlySection("stepWave1Assignment");
}


/* =====================================================
   WAVE 2 ASSIGNMENT
===================================================== */

function renderWave2Assignment() {
  const grid =
    document.getElementById("wave2AssignmentGrid");

  grid.innerHTML = "";

  students.forEach((student, index) => {
    if (student.RunAssignment === STATUS.WAVE_1) {
      return;
    }

    const circle =
      createAssignmentCircle(student, index, "wave2");

    grid.appendChild(circle);
  });

  updateAssignmentCounts();
}


async function confirmAllAssignments() {
  const unassigned =
    students.filter(
      student =>
        student.RunAssignment === STATUS.UNASSIGNED
    );

  if (unassigned.length > 0) {
    alert(
      `${unassigned.length} pupil(s) are still unassigned. ` +
      "Assign them to Wave 2 or triple-tap to mark Not Running."
    );

    return;
  }

  const wave2Pupils =
    students.filter(
      student =>
        student.RunAssignment === STATUS.WAVE_2
    );

  if (wave2Pupils.length === 0) {
    const continueWithoutWave2 = confirm(
      "No pupils are assigned to Wave 2. Continue with only Wave 1?"
    );

    if (!continueWithoutWave2) {
      return;
    }
  }

  showLoading("Saving run assignments...");

  try {
    const testDate =
      document.getElementById("testDate").value;

    const className =
      document.getElementById("classSelect").value;

    const result = await callBackend({
      action: "saveRunSession",
      sessionId,
      testDate,
      className,
      mode: "1.6km Run",
      students: students.map(student => ({
        No: student.No,
        ID: student.ID,
        Name: student.Name,
        Wave: student.RunAssignment,
        RunStatus: student.RunStatus
      }))
    });

    if (!result.success) {
      throw new Error(
        result.error || "Unable to save assignments."
      );
    }

    prepareWaveForTiming("Wave 1");

  } catch (error) {
    alert("Unable to save assignments: " + error.message);

  } finally {
    hideLoading();
  }
}


function createAssignmentCircle(student, index, phase) {
  const circle = document.createElement("div");

  circle.className =
    "assignment-circle " +
    assignmentClass(student.RunAssignment);

  circle.addEventListener("click", () => {
    registerAssignmentTap(index, phase);
  });

  circle.innerHTML = `
    <div class="circle-no">${escapeHtml(student.No)}</div>
    <div class="circle-name">${formatName(student.Name)}</div>
    <div class="circle-state">
      ${escapeHtml(student.RunAssignment)}
    </div>
  `;

  return circle;
}


function assignmentClass(assignment) {
  if (assignment === STATUS.WAVE_1) {
    return "selected-wave1";
  }

  if (assignment === STATUS.WAVE_2) {
    return "selected-wave2";
  }

  if (assignment === STATUS.NOT_RUNNING) {
    return "not-running";
  }

  return "";
}


function updateAssignmentCounts() {
  const wave1Count =
    students.filter(
      student =>
        student.RunAssignment === STATUS.WAVE_1
    ).length;

  const wave2Count =
    students.filter(
      student =>
        student.RunAssignment === STATUS.WAVE_2
    ).length;

  const unassignedCount =
    students.filter(
      student =>
        student.RunAssignment === STATUS.UNASSIGNED
    ).length;

  const notRunningCount =
    students.filter(
      student =>
        student.RunAssignment === STATUS.NOT_RUNNING
    ).length;

  document.getElementById("wave1Count").textContent =
    wave1Count;

  document.getElementById("wave2Count").textContent =
    wave2Count;

  document.getElementById("unassignedCount1").textContent =
    unassignedCount;

  document.getElementById("unassignedCount2").textContent =
    unassignedCount;

  document.getElementById("notRunningCount1").textContent =
    notRunningCount;

  document.getElementById("notRunningCount2").textContent =
    notRunningCount;
}


/* =====================================================
   TIMING
===================================================== */

function prepareWaveForTiming(wave) {
  currentWave = wave;

  waveStartPerformanceTime = null;
  finishPositionCounter =
    finishRecords.filter(record => record.wave === wave).length;

  clearInterval(timerInterval);
  timerInterval = null;

  document.getElementById("timerDisplay").textContent =
    "00:00";

  document.getElementById("currentWaveLabel").textContent =
    wave;

  document.getElementById("startWaveButton").disabled =
    false;

  renderRunnerCircles();
  renderRecentFinishes();
  updateQueueMessage();

  showOnlySection("stepTiming");
  updateProgress("run");
}


function getCurrentWaveStudents() {
  return students.filter(
    student =>
      student.RunAssignment === currentWave
  );
}


function renderRunnerCircles() {
  const grid =
    document.getElementById("runnerGrid");

  grid.innerHTML = "";

  const waveStudents = getCurrentWaveStudents();

  document.getElementById("runnerCountLabel").textContent =
    `${waveStudents.length} pupils`;

  waveStudents.forEach(student => {
    const item = document.createElement("div");
    item.className = "runner-item";

    const circle = document.createElement("div");
    circle.className = "runner-circle";

    const captured =
      findFinishRecord(student.ID, currentWave);

    if (captured) {
      if (captured.saveState === "failed") {
        circle.classList.add("failed");
      } else if (captured.saveState === "saving") {
        circle.classList.add("saving");
      } else {
        circle.classList.add("captured");
      }

      circle.innerHTML = `
        <div class="circle-no">${escapeHtml(student.No)}</div>
        <div class="runner-position">
          POS ${escapeHtml(captured.position)}
        </div>
        <div class="runner-time">
          ${escapeHtml(captured.displayTime)}
        </div>
      `;

      circle.addEventListener("click", () => {
        requestUndoFinish(student.ID, currentWave);
      });

    } else {
      circle.innerHTML = `
        <div class="circle-no">${escapeHtml(student.No)}</div>
        <div class="circle-name">${formatName(student.Name)}</div>
      `;

      circle.addEventListener("click", () => {
        captureFinish(student);
      });
    }

    const nameLabel = document.createElement("div");
    nameLabel.className = "runner-name-label";
    nameLabel.innerHTML = formatName(student.Name);

    item.appendChild(circle);
    item.appendChild(nameLabel);

    grid.appendChild(item);
  });
}


function startCurrentWave() {
  if (waveStartPerformanceTime !== null) {
    alert("This wave is already running.");
    return;
  }

  const runners = getCurrentWaveStudents();

  if (runners.length === 0) {
    alert("No pupils are assigned to this wave.");
    return;
  }

  const alreadyCaptured =
    finishRecords.filter(
      record => record.wave === currentWave
    );

  if (alreadyCaptured.length > 0) {
    const restart = confirm(
      "This wave already has captured results. Start the timer again?"
    );

    if (!restart) {
      return;
    }
  }

  waveStartPerformanceTime = performance.now();

  finishPositionCounter =
    alreadyCaptured.length;

  timerInterval = setInterval(updateTimer, 100);

  document.getElementById("startWaveButton").disabled =
    true;

  updateQueueMessage();
}


function updateTimer() {
  if (waveStartPerformanceTime === null) {
    return;
  }

  const elapsedMilliseconds =
    performance.now() - waveStartPerformanceTime;

  const elapsedSeconds =
    Math.floor(elapsedMilliseconds / 1000);

  document.getElementById("timerDisplay").textContent =
    secondsToTime(elapsedSeconds);
}


function captureFinish(student) {
  if (waveStartPerformanceTime === null) {
    alert("Press Start before recording finishers.");
    return;
  }

  if (findFinishRecord(student.ID, currentWave)) {
    return;
  }

  const capturedAt =
    performance.now();

  const elapsedSeconds =
    Math.round(
      (capturedAt - waveStartPerformanceTime) / 1000
    );

  finishPositionCounter += 1;

  const record = {
    studentId: String(student.ID),
    no: student.No,
    name: student.Name,
    className: student.Class,
    wave: currentWave,
    elapsedSeconds,
    displayTime: secondsToTime(elapsedSeconds),
    position: finishPositionCounter,
    saveState: "queued",
    queueId:
      `${sessionId}-${student.ID}-${currentWave}-1`
  };

  finishRecords.push(record);

  renderRunnerCircles();
  renderRecentFinishes();

  enqueueFinishSave(student, record);
}


function enqueueFinishSave(student, finishRecord) {
  const testDate =
    document.getElementById("testDate").value;

  const className =
    document.getElementById("classSelect").value;

  const queueItem = {
    queueId: finishRecord.queueId,
    studentId: String(student.ID),
    wave: finishRecord.wave,
    payload: {
      action: "saveRunFinish",
      sessionId,
      testDate,
      className,
      wave: finishRecord.wave,
      student,
      elapsedSeconds: finishRecord.elapsedSeconds,
      attemptNo: 1,
      remarks: `Position ${finishRecord.position}`
    }
  };

  saveQueue.push(queueItem);
  storePendingSave(queueItem);

  setFinishSaveState(
    student.ID,
    finishRecord.wave,
    "saving"
  );

  processSaveQueue();
  updateQueueMessage();
}


async function processSaveQueue() {
  if (saveQueueRunning) {
    return;
  }

  saveQueueRunning = true;
  updateQueueMessage();

  while (saveQueue.length > 0) {
    const queueItem = saveQueue.shift();

    try {
      const result =
        await callBackend(queueItem.payload);

      const wasCancelled =
        cancelledQueueIds.has(queueItem.queueId);

      if (result.success && wasCancelled) {
        await callBackend({
          action: "deleteRunResult",
          sessionId,
          studentId: queueItem.studentId,
          attemptNo: 1
        });

        cancelledQueueIds.delete(queueItem.queueId);
        removeStoredPendingSave(queueItem.queueId);

        continue;
      }

      if (!result.success) {
        throw new Error(
          result.error || "Unable to save timing."
        );
      }

      removeStoredPendingSave(queueItem.queueId);

      setFinishSaveState(
        queueItem.studentId,
        queueItem.wave,
        "saved"
      );

    } catch (error) {
      setFinishSaveState(
        queueItem.studentId,
        queueItem.wave,
        "failed"
      );
    }

    renderRunnerCircles();
    renderRecentFinishes();
    updateQueueMessage();
  }

  saveQueueRunning = false;
  updateQueueMessage();
}


function findFinishRecord(studentId, wave) {
  return finishRecords.find(record => (
    String(record.studentId) === String(studentId) &&
    record.wave === wave
  ));
}


function setFinishSaveState(studentId, wave, state) {
  const record =
    findFinishRecord(studentId, wave);

  if (record) {
    record.saveState = state;
  }
}


function renderRecentFinishes() {
  const container =
    document.getElementById("recentFinishList");

  const records =
    finishRecords
      .filter(record => record.wave === currentWave)
      .sort((a, b) => b.position - a.position)
      .slice(0, 5);

  if (records.length === 0) {
    container.textContent = "No finishers yet.";
    return;
  }

  container.innerHTML =
    records.map(record => `
      <div class="recent-entry">
        <strong>Pos ${escapeHtml(record.position)}</strong>
        — No. ${escapeHtml(record.no)}
        ${escapeHtml(record.name)}
        — ${escapeHtml(record.displayTime)}
      </div>
    `).join("");
}


function updateQueueMessage() {
  const storedCount =
    readStoredPendingSaves().length;

  const message =
    document.getElementById("queueMessage");

  if (
    saveQueue.length === 0 &&
    !saveQueueRunning &&
    storedCount === 0
  ) {
    message.textContent =
      "No pending saves";
    return;
  }

  message.textContent =
    `${saveQueue.length} waiting, ` +
    `${storedCount} pending locally. Do not close the page.`;
}


/* =====================================================
   UNDO
===================================================== */

function requestUndoFinish(studentId, wave) {
  const record =
    findFinishRecord(studentId, wave);

  if (!record) {
    return;
  }

  const confirmed = confirm(
    `Undo position ${record.position} for ${record.name}?`
  );

  if (!confirmed) {
    return;
  }

  undoFinish(studentId, wave);
}


function undoLastFinish() {
  const records =
    finishRecords
      .filter(record => record.wave === currentWave)
      .sort((a, b) => b.position - a.position);

  if (records.length === 0) {
    alert("There is no finish timing to undo.");
    return;
  }

  requestUndoFinish(
    records[0].studentId,
    currentWave
  );
}


async function undoFinish(studentId, wave) {
  const record =
    findFinishRecord(studentId, wave);

  if (!record) {
    return;
  }

  finishRecords =
    finishRecords.filter(item => !(
      String(item.studentId) === String(studentId) &&
      item.wave === wave
    ));

  const pendingQueueItem =
    saveQueue.find(item =>
      String(item.studentId) === String(studentId) &&
      item.wave === wave
    );

  saveQueue =
    saveQueue.filter(item => !(
      String(item.studentId) === String(studentId) &&
      item.wave === wave
    ));

  removeStoredPendingSave(record.queueId);

  if (pendingQueueItem || record.saveState === "saving") {
    cancelledQueueIds.add(record.queueId);
  }

  if (record.saveState === "saved") {
    try {
      await callBackend({
        action: "deleteRunResult",
        sessionId,
        studentId,
        attemptNo: 1
      });
    } catch (error) {
      alert(
        "The timing was removed from the screen, but the backend deletion may have failed."
      );
    }
  }

  renumberWavePositions(wave);

  renderRunnerCircles();
  renderRecentFinishes();
  updateQueueMessage();
}


function renumberWavePositions(wave) {
  const records =
    finishRecords
      .filter(record => record.wave === wave)
      .sort(
        (a, b) =>
          a.elapsedSeconds - b.elapsedSeconds ||
          a.position - b.position
      );

  records.forEach((record, index) => {
    record.position = index + 1;
  });

  finishPositionCounter = records.length;
}


/* =====================================================
   END WAVE AND REVIEW
===================================================== */

function endCurrentWave() {
  if (waveStartPerformanceTime === null) {
    alert("The wave has not started.");
    return;
  }

  clearInterval(timerInterval);
  timerInterval = null;

  waveStartPerformanceTime = null;

  document.getElementById("startWaveButton").disabled =
    false;

  currentReviewWave = currentWave;

  renderCurrentWaveReview();
  showOnlySection("stepWaveReview");
  updateProgress("review");
}


function renderCurrentWaveReview() {
  const heading =
    document.getElementById("waveReviewHeading");

  heading.textContent =
    `${currentReviewWave} Review`;

  const waveStudents =
    students.filter(
      student =>
        student.RunAssignment === currentReviewWave
    );

  const finishIds =
    new Set(
      finishRecords
        .filter(record => record.wave === currentReviewWave)
        .map(record => String(record.studentId))
    );

  const remaining =
    waveStudents.filter(
      student =>
        !finishIds.has(String(student.ID))
    );

  document.getElementById("waveReviewMessage").textContent =
    `${finishIds.size} finished. ${remaining.length} without timing.`;

  renderRemainingPupils(remaining);
  renderWaveTable(
    currentReviewWave,
    "currentWaveReviewBody"
  );

  const button =
    document.getElementById("reviewNextButton");

  if (currentReviewWave === STATUS.WAVE_1) {
    button.textContent =
      "Confirm Review and Proceed to Wave 2";

    button.onclick =
      confirmReadyForWave2;
  } else {
    button.textContent =
      "Confirm Review and View All Results";

    button.onclick =
      confirmReadyForFinalReview;
  }
}


function renderRemainingPupils(remaining) {
  const container =
    document.getElementById("remainingPupils");

  container.innerHTML = "";

  if (remaining.length === 0) {
    container.innerHTML =
      "<p>All pupils have a finish time.</p>";

    return;
  }

  remaining.forEach(student => {
    const row =
      document.createElement("div");

    row.className = "remaining-row";

    row.innerHTML = `
      <div class="remaining-no">
        ${escapeHtml(student.No)}
      </div>

      <div class="remaining-name">
        ${escapeHtml(student.Name)}
      </div>

      <select
        class="status-select"
        id="status-${escapeAttribute(student.ID)}"
      >
        <option value="">Select status</option>
        <option value="DNF">DNF</option>
        <option value="Did Not Start">Did Not Start</option>
        <option value="Medical">Medical</option>
        <option value="Injured">Injured</option>
        <option value="Retest Needed">Retest Needed</option>
        <option value="Removed from Wave">Removed from Wave</option>
        <option value="Still Running">Still Running</option>
      </select>

      <button
        class="btn btn-secondary"
        onclick="saveRemainingStatus('${escapeAttribute(student.ID)}')"
      >
        Save
      </button>
    `;

    container.appendChild(row);
  });
}


async function saveRemainingStatus(studentId) {
  const student =
    students.find(
      item =>
        String(item.ID) === String(studentId)
    );

  const select =
    document.getElementById(`status-${studentId}`);

  if (!student || !select || !select.value) {
    alert("Please select a status.");
    return;
  }

  showLoading("Saving status...");

  try {
    const result = await callBackend({
      action: "markRunStatus",
      sessionId,
      testDate:
        document.getElementById("testDate").value,
      className:
        document.getElementById("classSelect").value,
      wave: currentReviewWave,
      student,
      status: select.value,
      remarks: "",
      attemptNo: 1
    });

    if (!result.success) {
      throw new Error(
        result.error || "Unable to save status."
      );
    }

    select.disabled = true;

  } catch (error) {
    alert("Unable to save status: " + error.message);

  } finally {
    hideLoading();
  }
}


async function confirmReadyForWave2() {
  const ready = confirm(
    "Wave 1 review is complete. Proceed to Wave 2?"
  );

  if (!ready) {
    return;
  }

  await waitForSaveQueue();

  prepareWaveForTiming("Wave 2");
}


async function confirmReadyForFinalReview() {
  const ready = confirm(
    "Wave 2 review is complete. View all run results?"
  );

  if (!ready) {
    return;
  }

  await waitForSaveQueue();

  renderFinalReview();
  showOnlySection("stepFinalReview");
  updateProgress("review");
}


async function waitForSaveQueue() {
  if (
    saveQueue.length === 0 &&
    !saveQueueRunning &&
    readStoredPendingSaves().length === 0
  ) {
    return;
  }

  showLoading("Finishing pending saves...");

  while (
    saveQueue.length > 0 ||
    saveQueueRunning
  ) {
    await delay(250);
  }

  hideLoading();

  if (readStoredPendingSaves().length > 0) {
    alert(
      "Some timings are still stored locally and could not be saved. Do not close the page."
    );
  }
}


/* =====================================================
   FINAL REVIEW
===================================================== */

function renderFinalReview() {
  renderWaveTable("Wave 1", "finalWave1Body");
  renderWaveTable("Wave 2", "finalWave2Body");
  renderNotRunningPupils();

  updateFinishSessionButton();
}


function renderWaveTable(wave, bodyId) {
  const tbody =
    document.getElementById(bodyId);

  tbody.innerHTML = "";

  const records =
    finishRecords
      .filter(record => record.wave === wave)
      .sort((a, b) => a.position - b.position);

  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">No results recorded.</td>
      </tr>
    `;

    return;
  }

  records.forEach(record => {
    const row =
      document.createElement("tr");

    row.innerHTML = `
      <td>${escapeHtml(record.name)}</td>
      <td>${escapeHtml(record.className)}</td>
      <td>${escapeHtml(record.wave)}</td>
      <td>${escapeHtml(record.displayTime)}</td>
      <td>${escapeHtml(record.position)}</td>
    `;

    tbody.appendChild(row);
  });
}


function renderNotRunningPupils() {
  const container =
    document.getElementById("notRunningList");

  const notRunning =
    students.filter(
      student =>
        student.RunAssignment === STATUS.NOT_RUNNING
    );

  container.innerHTML = "";

  if (notRunning.length === 0) {
    container.innerHTML =
      "<p>No pupils were marked Not Running.</p>";

    return;
  }

  notRunning.forEach(student => {
    const row =
      document.createElement("div");

    row.className = "remaining-row";

    row.innerHTML = `
      <div class="remaining-no">
        ${escapeHtml(student.No)}
      </div>

      <div class="remaining-name">
        ${escapeHtml(student.Name)}
      </div>

      <select
        class="status-select"
        id="not-running-reason-${escapeAttribute(student.ID)}"
      >
        <option value="">Select reason</option>
        <option value="Did Not Start">Did Not Start</option>
        <option value="Medical">Medical</option>
        <option value="Injured">Injured</option>
        <option value="Retest Needed">Retest Needed</option>
        <option value="Not Running">Not Running</option>
      </select>

      <button
        class="btn btn-secondary"
        onclick="saveNotRunningReason('${escapeAttribute(student.ID)}')"
      >
        Save
      </button>
    `;

    container.appendChild(row);
  });
}


async function saveNotRunningReason(studentId) {
  const student =
    students.find(
      item =>
        String(item.ID) === String(studentId)
    );

  const select =
    document.getElementById(
      `not-running-reason-${studentId}`
    );

  if (!student || !select || !select.value) {
    alert("Please select a reason.");
    return;
  }

  showLoading("Saving Not Running reason...");

  try {
    const result = await callBackend({
      action: "markRunStatus",
      sessionId,
      testDate:
        document.getElementById("testDate").value,
      className:
        document.getElementById("classSelect").value,
      wave: "Not Running",
      student,
      status: select.value,
      remarks: "",
      attemptNo: 1
    });

    if (!result.success) {
      throw new Error(
        result.error || "Unable to save reason."
      );
    }

    student.NotRunningReason = select.value;
    select.disabled = true;

  } catch (error) {
    alert("Unable to save reason: " + error.message);

  } finally {
    hideLoading();
  }
}


function updateFinishSessionButton() {
  const button =
    document.getElementById("finishSessionButton");

  button.disabled =
    hasUnsafeWork();
}


async function finishRunSession() {
  await waitForSaveQueue();

  if (hasUnsafeWork()) {
    alert(
      "Some saves are still pending. Keep this page open."
    );

    return;
  }

  const confirmed = confirm(
    "Confirm that the run session is complete?"
  );

  if (!confirmed) {
    return;
  }

  const message =
    document.getElementById("finalSaveMessage");

  message.textContent =
    "Run session completed. All finish timings have been saved.";

  message.classList.remove("hidden");

  document.getElementById("finishSessionButton").disabled =
    true;
}


/* =====================================================
   LOCAL PENDING SAVE STORAGE
===================================================== */

function storePendingSave(queueItem) {
  const stored =
    readStoredPendingSaves();

  const filtered =
    stored.filter(
      item =>
        item.queueId !== queueItem.queueId
    );

  filtered.push(queueItem);

  localStorage.setItem(
    PENDING_SAVE_STORAGE_KEY,
    JSON.stringify(filtered)
  );
}


function removeStoredPendingSave(queueId) {
  const stored =
    readStoredPendingSaves();

  const filtered =
    stored.filter(
      item =>
        item.queueId !== queueId
    );

  localStorage.setItem(
    PENDING_SAVE_STORAGE_KEY,
    JSON.stringify(filtered)
  );
}


function readStoredPendingSaves() {
  try {
    const raw =
      localStorage.getItem(
        PENDING_SAVE_STORAGE_KEY
      );

    if (!raw) {
      return [];
    }

    const parsed =
      JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed
      : [];

  } catch (error) {
    return [];
  }
}


async function retryStoredPendingSaves() {
  const stored =
    readStoredPendingSaves();

  if (stored.length === 0) {
    updateQueueMessage();
    return;
  }

  const retry = confirm(
    `${stored.length} unsaved timing record(s) were found. Retry saving now?`
  );

  if (!retry) {
    updateQueueMessage();
    return;
  }

  showLoading("Retrying unsaved timings...");

  try {
    for (const queueItem of stored) {
      try {
        const result =
          await callBackend(queueItem.payload);

        if (result.success) {
          removeStoredPendingSave(
            queueItem.queueId
          );
        }

      } catch (error) {
        console.error(
          "Pending save retry failed:",
          error
        );
      }
    }

  } finally {
    hideLoading();
    updateQueueMessage();
  }
}


/* =====================================================
   RESET
===================================================== */

function resetSessionState() {
  students = [];
  sessionId = "";
  currentWave = "Wave 1";

  waveStartPerformanceTime = null;

  clearInterval(timerInterval);
  timerInterval = null;

  finishRecords = [];
  finishPositionCounter = 0;

  saveQueue = [];
  saveQueueRunning = false;
  cancelledQueueIds = new Set();

  assignmentTapTrackers = {};

  document.getElementById("wave1AssignmentGrid").innerHTML = "";
  document.getElementById("wave2AssignmentGrid").innerHTML = "";
  document.getElementById("runnerGrid").innerHTML = "";
  document.getElementById("remainingPupils").innerHTML = "";

  document.getElementById("timerDisplay").textContent = "00:00";
  document.getElementById("recentFinishList").textContent =
    "No finishers yet.";

  updateAssignmentCounts();
  updateQueueMessage();
}


/* =====================================================
   UTILITIES
===================================================== */

function secondsToTime(totalSeconds) {
  const safeSeconds =
    Math.max(0, Math.round(totalSeconds));

  const minutes =
    Math.floor(safeSeconds / 60);

  const seconds =
    safeSeconds % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0")
  );
}


function formatName(name) {
  const words =
    String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (words.length === 0) {
    return "";
  }

  if (words.length === 1) {
    return escapeHtml(words[0]);
  }

  const midpoint =
    Math.ceil(words.length / 2);

  const firstLine =
    words.slice(0, midpoint).join(" ");

  const secondLine =
    words.slice(midpoint).join(" ");

  return (
    escapeHtml(firstLine) +
    "<br>" +
    escapeHtml(secondLine)
  );
}


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function escapeAttribute(value) {
  return escapeHtml(value);
}


function delay(milliseconds) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}
