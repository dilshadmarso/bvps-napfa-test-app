const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyjiK1MWx30tV0wxZsTf5k5OLaGbQsvbCNacuBO8Ypa7lNTDMK46BRZY0T3Vn3dgP3X/exec";

const PENDING_SAVE_STORAGE_KEY =
  "BVPS_NAPFA_RUN_PENDING_SAVES_V3";

const STATUS = {
  UNASSIGNED: "Unassigned",
  WAVE_1: "Wave 1",
  WAVE_2: "Wave 2",
  NOT_RUNNING: "Not Running"
};

let students = [];
let sessionId = "";
let currentWave = STATUS.WAVE_1;
let currentReviewWave = STATUS.WAVE_1;

let waveStartPerformanceTime = null;
let timerInterval = null;

let finishRecords = [];
let finishPositionCounter = 0;

let saveQueue = [];
let saveQueueRunning = false;
let cancelledQueueIds = new Set();

let assignmentTapTrackers = {};

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
  const month =
    String(now.getMonth() + 1).padStart(2, "0");
  const day =
    String(now.getDate()).padStart(2, "0");

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
   LOADING
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
  const response = await fetch(
    GOOGLE_APPS_SCRIPT_URL,
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );

  const rawText = await response.text();

  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new Error("Backend returned an invalid response.");
  }
}


/* =====================================================
   NAVIGATION
===================================================== */

function showOnlySection(sectionId) {
  const sectionIds = [
    "stepSetup",
    "stepWave1Assignment",
    "stepWave2Assignment",
    "stepTiming",
    "stepWaveReview",
    "stepFinalReview"
  ];

  sectionIds.forEach(id => {
    document.getElementById(id).classList.add("hidden");
  });

  document.getElementById(sectionId).classList.remove("hidden");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


function updateProgress(stage) {
  const setup =
    document.getElementById("progressSetup");
  const assign =
    document.getElementById("progressAssign");
  const run =
    document.getElementById("progressRun");
  const review =
    document.getElementById("progressReview");

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
      throw new Error(
        result.error || "Unable to load levels."
      );
    }

    const select =
      document.getElementById("levelSelect");

    select.innerHTML =
      `<option value="">Select level</option>`;

    result.levels.forEach(level => {
      const option =
        document.createElement("option");

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
  const level =
    document.getElementById("levelSelect").value;

  const classSelect =
    document.getElementById("classSelect");

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
      throw new Error(
        result.error || "Unable to load classes."
      );
    }

    result.classes.forEach(className => {
      const option =
        document.createElement("option");

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
      throw new Error(
        result.error || "Unable to load pupils."
      );
    }

    students = result.students.map(student => ({
      ...student,
      RunAssignment: STATUS.UNASSIGNED,
      RunStatus: STATUS.UNASSIGNED,
      NotRunningReason: "",
      RemainingStatus: ""
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
    alert("Please select a class first.");
    return;
  }

  renderWave1Assignment();
  showOnlySection("stepWave1Assignment");
  updateProgress("assign");
}


/* =====================================================
   ASSIGNMENT TAPS
===================================================== */

function registerAssignmentTap(studentIndex, phase) {
  const key =
    `${phase}-${studentIndex}`;

  if (!assignmentTapTrackers[key]) {
    assignmentTapTrackers[key] = {
      count: 0,
      timer: null
    };
  }

  const tracker =
    assignmentTapTrackers[key];

  tracker.count++;

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
    const tapCount = tracker.count;

    tracker.count = 0;
    tracker.timer = null;

    if (tapCount === 1) {
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

  student.RunStatus =
    student.RunAssignment;

  phase === "wave1"
    ? renderWave1Assignment()
    : renderWave2Assignment();
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

  phase === "wave1"
    ? renderWave1Assignment()
    : renderWave2Assignment();
}


/* =====================================================
   ASSIGNMENT RENDERING
===================================================== */

function renderWave1Assignment() {
  const grid =
    document.getElementById("wave1AssignmentGrid");

  grid.innerHTML = "";

  students.forEach((student, index) => {
    grid.appendChild(
      createAssignmentCircle(
        student,
        index,
        "wave1"
      )
    );
  });

  updateAssignmentCounts();
}


function confirmWave1Selection() {
  const selectedCount =
    students.filter(
      student =>
        student.RunAssignment === STATUS.WAVE_1
    ).length;

  if (selectedCount === 0) {
    alert("Please select at least one Wave 1 pupil.");
    return;
  }

  renderWave2Assignment();
  showOnlySection("stepWave2Assignment");
}


function returnToWave1Selection() {
  renderWave1Assignment();
  showOnlySection("stepWave1Assignment");
}


function renderWave2Assignment() {
  const grid =
    document.getElementById("wave2AssignmentGrid");

  grid.innerHTML = "";

  students.forEach((student, index) => {
    if (student.RunAssignment === STATUS.WAVE_1) {
      return;
    }

    grid.appendChild(
      createAssignmentCircle(
        student,
        index,
        "wave2"
      )
    );
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
      "Select Wave 2 or triple-tap Not Running."
    );

    return;
  }

  showLoading("Saving assignments...");

  try {
    const result = await callBackend({
      action: "saveRunSession",
      sessionId,
      testDate:
        document.getElementById("testDate").value,
      className:
        document.getElementById("classSelect").value,
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

    prepareWaveForTiming(STATUS.WAVE_1);

  } catch (error) {
    alert(
      "Unable to save assignments: " +
      error.message
    );

  } finally {
    hideLoading();
  }
}


function createAssignmentCircle(student, index, phase) {
  const circle =
    document.createElement("div");

  circle.className =
    "assignment-circle " +
    assignmentClass(student.RunAssignment);

  circle.addEventListener("click", () => {
    registerAssignmentTap(index, phase);
  });

  circle.innerHTML = `
    <div class="circle-no">
      No. ${escapeHtml(student.No)}
    </div>

    <div class="circle-name">
      ${formatName(student.Name)}
    </div>

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

  setText("wave1Count", wave1Count);
  setText("wave2Count", wave2Count);
  setText("unassignedCount1", unassignedCount);
  setText("unassignedCount2", unassignedCount);
  setText("notRunningCount1", notRunningCount);
  setText("notRunningCount2", notRunningCount);
}


/* =====================================================
   TIMING
===================================================== */

function prepareWaveForTiming(wave) {
  currentWave = wave;

  waveStartPerformanceTime = null;

  finishPositionCounter =
    finishRecords.filter(
      record => record.wave === wave
    ).length;

  clearInterval(timerInterval);
  timerInterval = null;

  setText("timerDisplay", "00:00");
  setText("currentWaveLabel", wave);

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

  const waveStudents =
    getCurrentWaveStudents();

  setText(
    "runnerCountLabel",
    `${waveStudents.length} pupils`
  );

  waveStudents.forEach(student => {
    const item =
      document.createElement("div");

    item.className = "runner-item";

    const circle =
      document.createElement("div");

    circle.className = "runner-circle";

    const captured =
      findFinishRecord(
        student.ID,
        currentWave
      );

    if (captured) {
      if (captured.saveState === "failed") {
        circle.classList.add("failed");
      } else if (
        captured.saveState === "saving" ||
        captured.saveState === "queued"
      ) {
        circle.classList.add("saving");
      } else {
        circle.classList.add("captured");
      }

      circle.innerHTML = `
        <div class="circle-no">
          No. ${escapeHtml(student.No)}
        </div>

        <div class="runner-position">
          #${escapeHtml(captured.position)}
        </div>

        <div class="runner-time">
          ${escapeHtml(captured.displayTime)}
        </div>
      `;

      circle.addEventListener("click", () => {
        requestUndoFinish(
          student.ID,
          currentWave
        );
      });

    } else {
      circle.innerHTML = `
        <div class="circle-no">
          No. ${escapeHtml(student.No)}
        </div>

        <div class="circle-name">
          ${formatName(student.Name)}
        </div>
      `;

      circle.addEventListener("click", () => {
        captureFinish(student);
      });
    }

    const nameLabel =
      document.createElement("div");

    nameLabel.className =
      "runner-name-label";

    nameLabel.innerHTML =
      formatName(student.Name);

    item.appendChild(circle);
    item.appendChild(nameLabel);

    grid.appendChild(item);
  });
}


function startCurrentWave() {
  if (waveStartPerformanceTime !== null) {
    alert("The wave is already running.");
    return;
  }

  if (getCurrentWaveStudents().length === 0) {
    alert("No pupils are assigned to this wave.");
    return;
  }

  waveStartPerformanceTime =
    performance.now();

  finishPositionCounter =
    finishRecords.filter(
      record => record.wave === currentWave
    ).length;

  timerInterval =
    setInterval(updateTimer, 100);

  document.getElementById("startWaveButton").disabled =
    true;

  updateQueueMessage();
}


function updateTimer() {
  if (waveStartPerformanceTime === null) {
    return;
  }

  const elapsedSeconds =
    Math.floor(
      (
        performance.now() -
        waveStartPerformanceTime
      ) / 1000
    );

  setText(
    "timerDisplay",
    secondsToTime(elapsedSeconds)
  );
}


function captureFinish(student) {
  if (waveStartPerformanceTime === null) {
    alert("Press Start before recording finishers.");
    return;
  }

  if (findFinishRecord(student.ID, currentWave)) {
    return;
  }

  const elapsedSeconds =
    Math.round(
      (
        performance.now() -
        waveStartPerformanceTime
      ) / 1000
    );

  finishPositionCounter++;

  const record = {
    studentId: String(student.ID),
    no: student.No,
    name: student.Name,
    className: student.Class,
    wave: currentWave,
    elapsedSeconds,
    displayTime:
      secondsToTime(elapsedSeconds),
    position:
      finishPositionCounter,
    saveState: "queued",
    queueId:
      `${sessionId}-${student.ID}-${currentWave}-1`
  };

  finishRecords.push(record);

  renderRunnerCircles();
  renderRecentFinishes();

  enqueueFinishSave(student, record);
}


function enqueueFinishSave(student, record) {
  const queueItem = {
    queueId: record.queueId,
    studentId: String(student.ID),
    wave: record.wave,
    payload: {
      action: "saveRunFinish",
      sessionId,
      testDate:
        document.getElementById("testDate").value,
      className:
        document.getElementById("classSelect").value,
      wave: record.wave,
      student,
      elapsedSeconds:
        record.elapsedSeconds,
      attemptNo: 1,
      remarks:
        `Position ${record.position}`
    }
  };

  saveQueue.push(queueItem);
  storePendingSave(queueItem);

  setFinishSaveState(
    student.ID,
    record.wave,
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
    const queueItem =
      saveQueue.shift();

    try {
      const result =
        await callBackend(
          queueItem.payload
        );

      const cancelled =
        cancelledQueueIds.has(
          queueItem.queueId
        );

      if (result.success && cancelled) {
        await callBackend({
          action: "deleteRunResult",
          sessionId,
          studentId:
            queueItem.studentId,
          attemptNo: 1
        });

        cancelledQueueIds.delete(
          queueItem.queueId
        );

        removeStoredPendingSave(
          queueItem.queueId
        );

        continue;
      }

      if (!result.success) {
        throw new Error(
          result.error ||
          "Unable to save timing."
        );
      }

      removeStoredPendingSave(
        queueItem.queueId
      );

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
    String(record.studentId) ===
      String(studentId) &&
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
      .filter(
        record =>
          record.wave === currentWave
      )
      .sort(
        (a, b) =>
          b.position - a.position
      )
      .slice(0, 5);

  if (records.length === 0) {
    container.textContent =
      "No finishers yet.";

    return;
  }

  container.innerHTML =
    records.map(record => `
      <div class="recent-entry">
        <strong>#${escapeHtml(record.position)}</strong>
        — No. ${escapeHtml(record.no)}
        ${escapeHtml(record.name)}
        — ${escapeHtml(record.displayTime)}
      </div>
    `).join("");
}


function updateQueueMessage() {
  const storedCount =
    readStoredPendingSaves().length;

  if (
    saveQueue.length === 0 &&
    !saveQueueRunning &&
    storedCount === 0
  ) {
    setText(
      "queueMessage",
      "No pending saves"
    );

    return;
  }

  setText(
    "queueMessage",
    `${saveQueue.length} waiting, ` +
    `${storedCount} stored locally. ` +
    "Do not close the page."
  );
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

  const confirmed =
    confirm(
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
      .filter(
        record =>
          record.wave === currentWave
      )
      .sort(
        (a, b) =>
          b.position - a.position
      );

  if (records.length === 0) {
    alert("There is no timing to undo.");
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
      String(item.studentId) ===
        String(studentId) &&
      item.wave === wave
    ));

  const pendingQueueItem =
    saveQueue.find(item => (
      String(item.studentId) ===
        String(studentId) &&
      item.wave === wave
    ));

  saveQueue =
    saveQueue.filter(item => !(
      String(item.studentId) ===
        String(studentId) &&
      item.wave === wave
    ));

  removeStoredPendingSave(
    record.queueId
  );

  if (
    pendingQueueItem ||
    record.saveState === "saving"
  ) {
    cancelledQueueIds.add(
      record.queueId
    );
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
        "The timing was removed from the screen, but backend deletion may have failed."
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
      .filter(
        record =>
          record.wave === wave
      )
      .sort(
        (a, b) =>
          a.elapsedSeconds -
          b.elapsedSeconds ||
          a.position -
          b.position
      );

  records.forEach((record, index) => {
    record.position = index + 1;
  });

  finishPositionCounter =
    records.length;
}


/* =====================================================
   REVIEW
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

  currentReviewWave =
    currentWave;

  renderCurrentWaveReview();

  showOnlySection("stepWaveReview");
  updateProgress("review");
}


function renderCurrentWaveReview() {
  setText(
    "waveReviewHeading",
    `${currentReviewWave} Review`
  );

  const waveStudents =
    students.filter(
      student =>
        student.RunAssignment ===
        currentReviewWave
    );

  const finishIds =
    new Set(
      finishRecords
        .filter(
          record =>
            record.wave ===
            currentReviewWave
        )
        .map(
          record =>
            String(record.studentId)
        )
    );

  const remaining =
    waveStudents.filter(
      student =>
        !finishIds.has(
          String(student.ID)
        )
    );

  setText(
    "waveReviewMessage",
    `${finishIds.size} finished. ` +
    `${remaining.length} without timing.`
  );

  renderRemainingPupils(remaining);

  renderWaveTable(
    currentReviewWave,
    "currentWaveReviewBody"
  );

  const nextButton =
    document.getElementById(
      "reviewNextButton"
    );

  if (
    currentReviewWave ===
    STATUS.WAVE_1
  ) {
    nextButton.textContent =
      "Proceed to Wave 2";

    nextButton.onclick =
      confirmReadyForWave2;
  } else {
    nextButton.textContent =
      "View All Results";

    nextButton.onclick =
      confirmReadyForFinalReview;
  }
}


function renderRemainingPupils(remaining) {
  const container =
    document.getElementById(
      "remainingPupils"
    );

  container.innerHTML = "";

  if (remaining.length === 0) {
    container.innerHTML =
      "<p>All pupils have a finish time.</p>";

    document
      .getElementById(
        "saveAllWaveStatusesButton"
      )
      .classList.add("hidden");

    return;
  }

  document
    .getElementById(
      "saveAllWaveStatusesButton"
    )
    .classList.remove("hidden");

  remaining.forEach(student => {
    const row =
      document.createElement("div");

    row.className =
      "remaining-row";

    row.innerHTML = `
      <div class="remaining-no">
        ${escapeHtml(student.No)}
      </div>

      <div class="remaining-name">
        ${escapeHtml(student.Name)}
      </div>

      <select
        class="status-select"
        id="remaining-status-${escapeAttribute(student.ID)}"
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
    `;

    container.appendChild(row);
  });
}


async function saveAllRemainingStatuses() {
  const waveStudents =
    students.filter(
      student =>
        student.RunAssignment ===
        currentReviewWave
    );

  const finishIds =
    new Set(
      finishRecords
        .filter(
          record =>
            record.wave ===
            currentReviewWave
        )
        .map(
          record =>
            String(record.studentId)
        )
    );

  const remaining =
    waveStudents.filter(
      student =>
        !finishIds.has(
          String(student.ID)
        )
    );

  if (remaining.length === 0) {
    alert("There are no remaining pupils.");
    return;
  }

  const items = [];

  for (const student of remaining) {
    const select =
      document.getElementById(
        `remaining-status-${student.ID}`
      );

    if (!select || !select.value) {
      alert(
        `Please select a status for ${student.Name}.`
      );

      if (select) {
        select.focus();
      }

      return;
    }

    items.push({
      student,
      status: select.value
    });
  }

  showLoading("Saving statuses...");

  try {
    for (const item of items) {
      const result =
        await callBackend({
          action: "markRunStatus",
          sessionId,
          testDate:
            document.getElementById(
              "testDate"
            ).value,
          className:
            document.getElementById(
              "classSelect"
            ).value,
          wave:
            currentReviewWave,
          student:
            item.student,
          status:
            item.status,
          remarks: "",
          attemptNo: 1
        });

      if (!result.success) {
        throw new Error(
          result.error ||
          `Unable to save ${item.student.Name}.`
        );
      }

      item.student.RemainingStatus =
        item.status;
    }

    alert(
      `${items.length} status(es) saved.`
    );

  } catch (error) {
    alert(
      "Unable to save statuses: " +
      error.message
    );

  } finally {
    hideLoading();
  }
}


async function confirmReadyForWave2() {
  const confirmed =
    confirm(
      "Wave 1 review is complete. Proceed to Wave 2?"
    );

  if (!confirmed) {
    return;
  }

  await waitForSaveQueue();

  prepareWaveForTiming(
    STATUS.WAVE_2
  );
}


async function confirmReadyForFinalReview() {
  const confirmed =
    confirm(
      "Wave 2 review is complete. View all results?"
    );

  if (!confirmed) {
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
    !saveQueueRunning
  ) {
    return;
  }

  showLoading("Finishing pending saves...");

  while (
    saveQueue.length > 0 ||
    saveQueueRunning
  ) {
    await delay(200);
  }

  hideLoading();

  if (
    readStoredPendingSaves().length > 0
  ) {
    alert(
      "Some timings are still stored locally. Keep the page open."
    );
  }
}


/* =====================================================
   FINAL REVIEW
===================================================== */

function renderFinalReview() {
  renderWaveTable(
    STATUS.WAVE_1,
    "finalWave1Body"
  );

  renderWaveTable(
    STATUS.WAVE_2,
    "finalWave2Body"
  );

  renderNotRunningPupils();
}


function renderWaveTable(wave, bodyId) {
  const tbody =
    document.getElementById(bodyId);

  tbody.innerHTML = "";

  const records =
    finishRecords
      .filter(
        record =>
          record.wave === wave
      )
      .sort(
        (a, b) =>
          a.position - b.position
      );

  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          No results recorded.
        </td>
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
    document.getElementById(
      "notRunningList"
    );

  const notRunning =
    students.filter(
      student =>
        student.RunAssignment ===
        STATUS.NOT_RUNNING
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

    row.className =
      "remaining-row";

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
        <option value="Absent">Absent</option>
        <option value="Did Not Start">Did Not Start</option>
        <option value="Medical">Medical</option>
        <option value="Injured">Injured</option>
        <option value="Retest Needed">Retest Needed</option>
        <option value="Not Running">Not Running</option>
      </select>
    `;

    container.appendChild(row);
  });
}


async function saveAllNotRunningReasons() {
  const notRunning =
    students.filter(
      student =>
        student.RunAssignment ===
        STATUS.NOT_RUNNING
    );

  if (notRunning.length === 0) {
    alert("There are no Not Running pupils.");
    return;
  }

  const pupils = [];

  for (const student of notRunning) {
    const select =
      document.getElementById(
        `not-running-reason-${student.ID}`
      );

    if (!select || !select.value) {
      alert(
        `Please select a reason for ${student.Name}.`
      );

      if (select) {
        select.focus();
      }

      return;
    }

    pupils.push({
      student,
      status:
        select.value,
      remarks: ""
    });
  }

  showLoading(
    "Saving Not Running reasons..."
  );

  try {
    const result =
      await callBackend({
        action:
          "saveNotRunningReasons",
        sessionId,
        testDate:
          document.getElementById(
            "testDate"
          ).value,
        className:
          document.getElementById(
            "classSelect"
          ).value,
        pupils
      });

    if (!result.success) {
      throw new Error(
        result.error ||
        "Unable to save reasons."
      );
    }

    pupils.forEach(item => {
      item.student.NotRunningReason =
        item.status;

      const select =
        document.getElementById(
          `not-running-reason-${item.student.ID}`
        );

      if (select) {
        select.disabled = true;
      }
    });

    alert(
      `${result.rowsSaved} Not Running reason(s) saved.`
    );

  } catch (error) {
    alert(
      "Unable to save Not Running reasons: " +
      error.message
    );

  } finally {
    hideLoading();
  }
}


async function finishRunSession() {
  await waitForSaveQueue();

  if (readStoredPendingSaves().length > 0) {
    alert(
      "Some timings are still pending. Keep the page open."
    );

    return;
  }

  const notRunningWithoutReason =
    students.filter(
      student =>
        student.RunAssignment ===
          STATUS.NOT_RUNNING &&
        !student.NotRunningReason
    );

  if (
    notRunningWithoutReason.length > 0
  ) {
    alert(
      `${notRunningWithoutReason.length} Not Running pupil(s) still need a reason.`
    );

    return;
  }

  const confirmed =
    confirm(
      "Confirm that the run session is complete?"
    );

  if (!confirmed) {
    return;
  }

  showLoading("Completing session...");

  try {
    const result =
      await callBackend({
        action:
          "completeRunSession",
        sessionId
      });

    if (!result.success) {
      throw new Error(
        result.error ||
        "Unable to complete session."
      );
    }

    const message =
      document.getElementById(
        "completionMessage"
      );

    message.textContent =
      "Session completed successfully. All available timings and statuses have been saved.";

    message.classList.remove("hidden");

    document.getElementById(
      "finishSessionButton"
    ).disabled = true;

  } catch (error) {
    alert(
      "Unable to complete session: " +
      error.message
    );

  } finally {
    hideLoading();
  }
}


/* =====================================================
   LOCAL STORAGE
===================================================== */

function storePendingSave(queueItem) {
  const stored =
    readStoredPendingSaves();

  const filtered =
    stored.filter(
      item =>
        item.queueId !==
        queueItem.queueId
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

  const retry =
    confirm(
      `${stored.length} unsaved timing record(s) were found. Retry now?`
    );

  if (!retry) {
    updateQueueMessage();
    return;
  }

  showLoading(
    "Retrying unsaved timings..."
  );

  try {
    for (const queueItem of stored) {
      try {
        const result =
          await callBackend(
            queueItem.payload
          );

        if (result.success) {
          removeStoredPendingSave(
            queueItem.queueId
          );
        }

      } catch (error) {
        console.error(
          "Pending retry failed:",
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
  currentWave = STATUS.WAVE_1;
  currentReviewWave = STATUS.WAVE_1;

  waveStartPerformanceTime = null;

  clearInterval(timerInterval);
  timerInterval = null;

  finishRecords = [];
  finishPositionCounter = 0;

  saveQueue = [];
  saveQueueRunning = false;
  cancelledQueueIds = new Set();

  assignmentTapTrackers = {};

  clearElement("wave1AssignmentGrid");
  clearElement("wave2AssignmentGrid");
  clearElement("runnerGrid");
  clearElement("remainingPupils");
  clearElement("currentWaveReviewBody");
  clearElement("finalWave1Body");
  clearElement("finalWave2Body");
  clearElement("notRunningList");

  setText("timerDisplay", "00:00");
  setText("recentFinishList", "No finishers yet.");

  updateAssignmentCounts();
  updateQueueMessage();
}


/* =====================================================
   UTILITIES
===================================================== */

function secondsToTime(totalSeconds) {
  const safeSeconds =
    Math.max(
      0,
      Math.round(totalSeconds)
    );

  const minutes =
    Math.floor(
      safeSeconds / 60
    );

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

  if (words.length <= 1) {
    return escapeHtml(words[0] || "");
  }

  const midpoint =
    Math.ceil(
      words.length / 2
    );

  return (
    escapeHtml(
      words.slice(0, midpoint).join(" ")
    ) +
    "<br>" +
    escapeHtml(
      words.slice(midpoint).join(" ")
    )
  );
}


function setText(elementId, value) {
  const element =
    document.getElementById(elementId);

  if (element) {
    element.textContent =
      String(value ?? "");
  }
}


function clearElement(elementId) {
  const element =
    document.getElementById(elementId);

  if (element) {
    element.innerHTML = "";
  }
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
    setTimeout(
      resolve,
      milliseconds
    );
  });
}
