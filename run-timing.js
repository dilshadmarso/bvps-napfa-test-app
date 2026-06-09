const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyjiK1MWx30tV0wxZsTf5k5OLaGbQsvbCNacuBO8Ypa7lNTDMK46BRZY0T3Vn3dgP3X/exec";

let allStudents = [];
let sessionId = "";
let waveStartTime = null;
let timerInterval = null;
let finishedStudentIds = new Set();

let saveQueue = [];
let isSavingQueue = false;
let capturedResults = [];
let finishCounter = 0;

const PENDING_SAVE_KEY = "BVPS_NAPFA_PENDING_RUN_SAVES";


window.onload = async function () {
  setTodayDate();
  setupCloseWarning();
  await loadLevels();
  await retryPendingSavesFromStorage();
};


function showLoading(message) {
  const overlay = document.getElementById("loadingOverlay");
  const text = document.getElementById("loadingText");

  if (text) {
    text.textContent = message || "Loading...";
  }

  if (overlay) {
    overlay.classList.remove("hidden");
  }
}


function hideLoading() {
  const overlay = document.getElementById("loadingOverlay");

  if (overlay) {
    overlay.classList.add("hidden");
  }
}


function setupCloseWarning() {
  window.addEventListener("beforeunload", function (event) {
    if (hasUnsafePendingWork()) {
      event.preventDefault();
      event.returnValue = "";
      return "";
    }
  });
}


function hasUnsafePendingWork() {
  return waveStartTime !== null ||
         saveQueue.length > 0 ||
         isSavingQueue ||
         getStoredPendingSaves().length > 0;
}


function showStep(stepName) {
  const steps = ["setup", "assign", "timing", "review"];

  steps.forEach(step => {
    document.getElementById(`step-${step}`).classList.add("hidden");
    document.getElementById(`tab-${step}`).classList.remove("active");
  });

  document.getElementById(`step-${stepName}`).classList.remove("hidden");
  document.getElementById(`tab-${stepName}`).classList.add("active");
}


function setTodayDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  document.getElementById("testDate").value = `${yyyy}-${mm}-${dd}`;
}


async function callBackend(payload) {
  const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  console.log("Raw backend response:", text);

  return JSON.parse(text);
}


async function loadLevels() {
  const status = document.getElementById("setupStatus");
  status.textContent = "Loading levels...";

  showLoading("Loading levels...");

  try {
    const result = await callBackend({
      action: "getLevels"
    });

    if (!result.success) {
      status.textContent = "Failed to load levels: " + result.error;
      return;
    }

    const levelSelect = document.getElementById("levelSelect");
    levelSelect.innerHTML = `<option value="">Select level</option>`;

    result.levels.forEach(level => {
      const option = document.createElement("option");
      option.value = level;
      option.textContent = level;
      levelSelect.appendChild(option);
    });

    status.textContent = "Levels loaded.";

  } catch (error) {
    console.error(error);
    status.textContent = "Failed to load levels: " + error.message;
  } finally {
    hideLoading();
  }
}


async function loadClasses() {
  const level = document.getElementById("levelSelect").value;
  const classSelect = document.getElementById("classSelect");

  classSelect.innerHTML = `<option value="">Select class</option>`;
  clearRunPage();

  if (!level) return;

  showLoading("Loading classes...");

  try {
    const result = await callBackend({
      action: "getClasses",
      level: level
    });

    if (!result.success) {
      document.getElementById("setupStatus").textContent =
        "Failed to load classes: " + result.error;
      return;
    }

    result.classes.forEach(className => {
      const option = document.createElement("option");
      option.value = className;
      option.textContent = className;
      classSelect.appendChild(option);
    });

    document.getElementById("setupStatus").textContent = "Classes loaded.";

  } finally {
    hideLoading();
  }
}


async function loadRunStudents() {
  const className = document.getElementById("classSelect").value;

  clearRunPage();

  if (!className) return;

  document.getElementById("setupStatus").textContent = "Loading students...";
  showLoading("Loading students...");

  try {
    const result = await callBackend({
      action: "getRunStudentsByClass",
      className: className
    });

    if (!result.success) {
      document.getElementById("setupStatus").textContent =
        "Failed to load students: " + result.error;
      return;
    }

    allStudents = result.students.map(student => {
      return {
        ...student,
        Wave: "Wave 2",
        RunStatus: "Wave 2"
      };
    });

    sessionId = `${className}-RUN-${document.getElementById("testDate").value}`;

    renderWaveAssignments();

    document.getElementById("setupStatus").textContent =
      `${allStudents.length} students loaded. Go to Wave 1 selection.`;

  } finally {
    hideLoading();
  }
}


function renderWaveAssignments() {
  const container = document.getElementById("studentAssignmentList");
  container.innerHTML = "";

  allStudents.forEach((student, index) => {
    const bubble = document.createElement("div");
    bubble.className = "student-bubble blank";
    bubble.id = `student-bubble-${index}`;

    bubble.onclick = function () {
      toggleWave1(index);
    };

    bubble.innerHTML = `
      <span class="reg-no">${student.No}</span>
      <span class="student-name">${student.Name}</span>
      <span class="bubble-status">Wave 2</span>
    `;

    container.appendChild(bubble);
  });

  updateAllBubbleStyles();
  updateWaveCounts();
  prepareWaveButtons();
}


function toggleWave1(index) {
  const student = allStudents[index];

  if (student.Wave === "Wave 1") {
    student.Wave = "Wave 2";
    student.RunStatus = "Wave 2";
  } else {
    student.Wave = "Wave 1";
    student.RunStatus = "Wave 1";
  }

  updateBubbleStyle(index);
  updateWaveCounts();
  prepareWaveButtons();
}


function updateAllBubbleStyles() {
  allStudents.forEach((student, index) => {
    updateBubbleStyle(index);
  });
}


function updateBubbleStyle(index) {
  const student = allStudents[index];
  const bubble = document.getElementById(`student-bubble-${index}`);

  if (!bubble) return;

  bubble.classList.remove("wave1", "blank");

  if (student.Wave === "Wave 1") {
    bubble.classList.add("wave1");
  } else {
    bubble.classList.add("blank");
  }

  const status = bubble.querySelector(".bubble-status");

  if (status) {
    status.textContent = student.Wave === "Wave 1" ? "Wave 1" : "Wave 2";
  }
}


function updateWaveCounts() {
  const wave1Count = allStudents.filter(s => s.Wave === "Wave 1").length;
  const wave2Count = allStudents.filter(s => s.Wave === "Wave 2").length;

  document.getElementById("wave1Count").textContent = wave1Count;
  document.getElementById("wave2Count").textContent = wave2Count;
}


async function saveWaveAssignments() {
  const testDate = document.getElementById("testDate").value;
  const className = document.getElementById("classSelect").value;

  if (!testDate) {
    alert("Please select test date.");
    return;
  }

  if (!className) {
    alert("Please select class.");
    return;
  }

  if (allStudents.length === 0) {
    alert("No students loaded.");
    return;
  }

  sessionId = `${className}-RUN-${testDate}`;

  showLoading("Saving wave assignments...");

  try {
    const result = await callBackend({
      action: "saveRunSession",
      sessionId: sessionId,
      testDate: testDate,
      className: className,
      mode: "1.6km Run",
      students: allStudents.map(student => ({
        No: student.No,
        ID: student.ID,
        Name: student.Name,
        Wave: student.Wave,
        RunStatus: student.RunStatus
      }))
    });

    if (result.success) {
      document.getElementById("setupStatus").textContent =
        `Wave assignments saved. Session ID: ${result.sessionId}`;

      alert("Wave assignments saved.");
      showStep("timing");
      prepareWaveButtons();

    } else {
      document.getElementById("setupStatus").textContent =
        "Failed to save wave assignments: " + result.error;

      alert("Failed to save wave assignments: " + result.error);
    }

  } finally {
    hideLoading();
  }
}


function prepareWaveButtons() {
  const wave = document.getElementById("waveSelect").value;
  const container = document.getElementById("runnerButtons");

  container.innerHTML = "";

  const alreadyCapturedIds = new Set(
    capturedResults
      .filter(result => result.wave === wave)
      .map(result => String(result.studentId))
  );

  finishedStudentIds = new Set(alreadyCapturedIds);

  const waveStudents = allStudents.filter(student => student.Wave === wave);

  waveStudents.forEach(student => {
    const button = document.createElement("button");
    button.className = "runner-btn";
    button.id = `runner-${student.ID}`;

    const captured = capturedResults.find(result => {
      return String(result.studentId) === String(student.ID) &&
             result.wave === wave;
    });

    if (captured) {
      button.classList.add(captured.saveFailed ? "save-failed" : "finished");
      button.disabled = false;

      button.innerHTML = `
        <span class="runner-no">${student.No}</span>
        ${student.Name}<br>
        <strong>Pos ${captured.position}</strong> | ${captured.displayTime}<br>
        ${captured.saved ? "Saved" : captured.saveFailed ? "Save failed" : "Captured"}
        <br>
        <button class="undo-mini-btn" onclick="undoFinish('${student.ID}', '${wave}'); event.stopPropagation();">
          Undo
        </button>
      `;
    } else {
      button.onclick = function () {
        recordFinish(student);
      };

      button.innerHTML = `
        <span class="runner-no">${student.No}</span>
        ${student.Name}
      `;
    }

    container.appendChild(button);
  });

  document.getElementById("timerStatus").textContent =
    `${waveStudents.length} pupils loaded for ${wave}.`;

  renderRecentFinishes();
}


function startWave() {
  const className = document.getElementById("classSelect").value;

  if (!className || allStudents.length === 0) {
    alert("Please load a class first.");
    return;
  }

  if (!sessionId) {
    alert("Please save wave assignments first.");
    return;
  }

  const wave = document.getElementById("waveSelect").value;
  const waveStudents = allStudents.filter(student => student.Wave === wave);

  if (waveStudents.length === 0) {
    alert("No pupils assigned to this wave.");
    return;
  }

  finishCounter = capturedResults.filter(result => result.wave === wave).length;

  finishedStudentIds = new Set(
    capturedResults
      .filter(result => result.wave === wave)
      .map(result => String(result.studentId))
  );

  waveStartTime = new Date();

  if (timerInterval) {
    clearInterval(timerInterval);
  }

  timerInterval = setInterval(updateTimerDisplay, 200);

  document.getElementById("timerStatus").textContent =
    `${wave} started. Tap pupils as they finish.`;
}


function updateTimerDisplay() {
  if (!waveStartTime) return;

  const now = new Date();
  const elapsedSeconds = Math.floor((now - waveStartTime) / 1000);

  document.getElementById("timerDisplay").textContent =
    secondsToTimeText(elapsedSeconds);
}


function recordFinish(student) {
  if (!waveStartTime) {
    alert("Please start the wave first.");
    return;
  }

  if (finishedStudentIds.has(String(student.ID))) {
    return;
  }

  const tapTime = new Date();
  const elapsedSeconds = Math.round((tapTime - waveStartTime) / 1000);
  const displayTime = secondsToTimeText(elapsedSeconds);
  const wave = document.getElementById("waveSelect").value;

  finishCounter++;
  const finishPosition = finishCounter;

  finishedStudentIds.add(String(student.ID));

  capturedResults.push({
    studentId: String(student.ID),
    no: student.No,
    name: student.Name,
    wave: wave,
    elapsedSeconds: elapsedSeconds,
    displayTime: displayTime,
    position: finishPosition,
    saveFailed: false,
    saved: false
  });

  const button = document.getElementById(`runner-${student.ID}`);

  if (button) {
    button.classList.add("finished");
    button.disabled = false;

    button.innerHTML = `
      <span class="runner-no">${student.No}</span>
      ${student.Name}<br>
      <strong>Pos ${finishPosition}</strong> | ${displayTime}<br>
      Queued
      <br>
      <button class="undo-mini-btn" onclick="undoFinish('${student.ID}', '${wave}'); event.stopPropagation();">
        Undo
      </button>
    `;
  }

  document.getElementById("timerStatus").textContent =
    `Position ${finishPosition}: ${student.Name} captured at ${displayTime}.`;

  const testDate = document.getElementById("testDate").value;
  const className = document.getElementById("classSelect").value;

  const queueItem = {
    queueId: `${sessionId}-${student.ID}-1`,
    student: student,
    buttonId: `runner-${student.ID}`,
    wave: wave,
    displayTime: displayTime,
    position: finishPosition,
    payload: {
      action: "saveRunFinish",
      sessionId: sessionId,
      testDate: testDate,
      className: className,
      wave: wave,
      student: student,
      elapsedSeconds: elapsedSeconds,
      attemptNo: 1,
      remarks: "Position " + finishPosition
    }
  };

  saveQueue.push(queueItem);
  addStoredPendingSave(queueItem);

  updateQueueStatus();
  renderRecentFinishes();
  processSaveQueue();
}


async function processSaveQueue() {
  if (isSavingQueue) return;

  isSavingQueue = true;
  updateQueueStatus();

  while (saveQueue.length > 0) {
    const item = saveQueue.shift();
    const button = document.getElementById(item.buttonId);

    if (button) {
      button.innerHTML = `
        <span class="runner-no">${item.student.No}</span>
        ${item.student.Name}<br>
        <strong>Pos ${item.position}</strong> | ${item.displayTime}<br>
        Saving...
      `;
    }

    try {
      const result = await callBackend(item.payload);

      if (result.success) {
        removeStoredPendingSave(item.queueId);

        if (button) {
          button.classList.remove("save-failed");
          button.classList.add("finished");

          button.innerHTML = `
            <span class="runner-no">${item.student.No}</span>
            ${item.student.Name}<br>
            <strong>Pos ${item.position}</strong> | ${result.result.Time}<br>
            Grade: ${result.result.Grade}
            <br>
            <button class="undo-mini-btn" onclick="undoFinish('${item.student.ID}', '${item.wave}'); event.stopPropagation();">
              Undo
            </button>
          `;
        }

        markCapturedSaveStatus(item.student.ID, item.wave, false, true);

      } else {
        markSaveFailed(item, button);
      }

    } catch (error) {
      markSaveFailed(item, button);
    }

    updateQueueStatus();
    renderRecentFinishes();
  }

  isSavingQueue = false;
  updateQueueStatus();
}


function markSaveFailed(item, button) {
  if (button) {
    button.classList.remove("finished");
    button.classList.add("save-failed");

    button.innerHTML = `
      <span class="runner-no">${item.student.No}</span>
      ${item.student.Name}<br>
      <strong>Pos ${item.position}</strong> | ${item.displayTime}<br>
      Save failed
      <br>
      <button class="undo-mini-btn" onclick="undoFinish('${item.student.ID}', '${item.wave}'); event.stopPropagation();">
        Undo
      </button>
    `;
  }

  markCapturedSaveStatus(item.student.ID, item.wave, true, false);
}


function markCapturedSaveStatus(studentId, wave, saveFailed, saved) {
  const record = capturedResults.find(result => {
    return String(result.studentId) === String(studentId) &&
           result.wave === wave;
  });

  if (record) {
    record.saveFailed = saveFailed;
    record.saved = saved;
  }
}


async function undoFinish(studentId, wave) {
  const confirmUndo = confirm(
    "Undo this timing? Use this only if the wrong pupil was tapped."
  );

  if (!confirmUndo) {
    return;
  }

  const record = capturedResults.find(result => {
    return String(result.studentId) === String(studentId) && result.wave === wave;
  });

  capturedResults = capturedResults.filter(result => {
    return !(String(result.studentId) === String(studentId) && result.wave === wave);
  });

  saveQueue = saveQueue.filter(item => {
    return !(String(item.student.ID) === String(studentId) && item.wave === wave);
  });

  removeStoredPendingSave(`${sessionId}-${studentId}-1`);

  finishedStudentIds.delete(String(studentId));

  if (record && record.saved) {
    try {
      await callBackend({
        action: "deleteRunResult",
        sessionId: sessionId,
        studentId: studentId,
        attemptNo: 1
      });
    } catch (error) {
      alert("Timing removed from screen, but backend deletion may have failed. Please check Run_Results.");
    }
  }

  renumberFinishPositions(wave);
  prepareWaveButtons();
  renderRecentFinishes();
  updateQueueStatus();

  document.getElementById("timerStatus").textContent =
    "Timing undone. Continue timing.";
}


function undoLastTap() {
  const wave = document.getElementById("waveSelect").value;

  const waveResults = capturedResults
    .filter(result => result.wave === wave)
    .sort((a, b) => b.position - a.position);

  if (waveResults.length === 0) {
    alert("No timing to undo for this wave.");
    return;
  }

  const latest = waveResults[0];

  undoFinish(latest.studentId, wave);
}


function renumberFinishPositions(wave) {
  const waveResults = capturedResults
    .filter(result => result.wave === wave)
    .sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);

  waveResults.forEach((result, index) => {
    result.position = index + 1;
  });

  finishCounter = waveResults.length;
}


function renderRecentFinishes() {
  const container = document.getElementById("recentFinishList");

  if (!container) return;

  const wave = document.getElementById("waveSelect").value;

  const recent = capturedResults
    .filter(result => result.wave === wave)
    .sort((a, b) => b.position - a.position)
    .slice(0, 5);

  if (recent.length === 0) {
    container.innerHTML = "No finishes yet.";
    return;
  }

  container.innerHTML = recent.map(result => {
    const saveText = result.saved
      ? "Saved"
      : result.saveFailed
        ? "Save failed"
        : "Saving/Queued";

    return `
      <div class="recent-item">
        <strong>Pos ${result.position}</strong>:
        No. ${result.no} ${result.name} — ${result.displayTime}
        (${saveText})
      </div>
    `;
  }).join("");
}


function updateQueueStatus() {
  const queueText = document.getElementById("queueStatus");

  if (!queueText) return;

  const storedPending = getStoredPendingSaves().length;

  if (saveQueue.length === 0 && !isSavingQueue && storedPending === 0) {
    queueText.textContent = "No pending saves.";
    return;
  }

  if (isSavingQueue) {
    queueText.textContent =
      `Saving... ${saveQueue.length} waiting. ${storedPending} stored pending. Do not close the page.`;
    return;
  }

  queueText.textContent =
    `${saveQueue.length} waiting to save. ${storedPending} stored pending. Do not close the page.`;
}


function endWave() {
  if (!waveStartTime) {
    alert("Wave has not started.");
    return;
  }

  if (timerInterval) {
    clearInterval(timerInterval);
  }

  const wave = document.getElementById("waveSelect").value;
  const waveStudents = allStudents.filter(student => student.Wave === wave);

  const capturedIdsForWave = new Set(
    capturedResults
      .filter(result => result.wave === wave)
      .map(result => String(result.studentId))
  );

  const remaining = waveStudents.filter(student => {
    return !capturedIdsForWave.has(String(student.ID));
  });

  waveStartTime = null;

  document.getElementById("timerStatus").textContent =
    `${wave} ended. ${remaining.length} pupils have no timing.`;

  renderRemainingStudents(remaining);
  showStep("review");
  loadAllWaveSummaries();
}


function renderRemainingStudents(remainingStudents) {
  const container = document.getElementById("remainingList");
  container.innerHTML = "";

  if (remainingStudents.length === 0) {
    container.innerHTML = "<p>All pupils in this wave have timing.</p>";
    return;
  }

  remainingStudents.forEach((student, index) => {
    const div = document.createElement("div");
    div.className = "remaining-row";

    div.innerHTML = `
      <div><strong>${student.No}</strong></div>
      <div>${student.Name}</div>
      <div>
        <select id="remaining-status-${index}">
          <option value="Still Running">Still Running</option>
          <option value="DNF">DNF</option>
          <option value="Did Not Start">Did Not Start</option>
          <option value="Medical">Medical</option>
          <option value="Injured">Injured</option>
          <option value="Retest Needed">Retest Needed</option>
          <option value="Removed from Wave">Removed from Wave</option>
          <option value="Not Running">Not Running</option>
        </select>

        <button class="secondary-btn" onclick="markRemainingStatus('${student.ID}', ${index})">
          Save
        </button>
      </div>
    `;

    container.appendChild(div);
  });
}


async function markRemainingStatus(studentId, index) {
  const student = allStudents.find(s => String(s.ID) === String(studentId));

  if (!student) {
    alert("Student not found.");
    return;
  }

  const status = document.getElementById(`remaining-status-${index}`).value;
  const testDate = document.getElementById("testDate").value;
  const className = document.getElementById("classSelect").value;
  const wave = document.getElementById("waveSelect").value;

  showLoading("Saving status...");

  try {
    const result = await callBackend({
      action: "markRunStatus",
      sessionId: sessionId,
      testDate: testDate,
      className: className,
      wave: wave,
      student: student,
      status: status,
      remarks: "",
      attemptNo: 1
    });

    if (result.success) {
      alert(`${student.Name} marked as ${status}.`);
      loadAllWaveSummaries();
    } else {
      alert("Failed to mark status: " + result.error);
    }

  } finally {
    hideLoading();
  }
}


function proceedToWave2() {
  const waveSelect = document.getElementById("waveSelect");

  waveSelect.value = "Wave 2";

  waveStartTime = null;
  finishCounter = capturedResults.filter(result => result.wave === "Wave 2").length;

  if (timerInterval) {
    clearInterval(timerInterval);
  }

  document.getElementById("timerDisplay").textContent = "00:00";
  document.getElementById("timerStatus").textContent =
    "Wave 2 is ready. Click Start Wave when pupils begin.";

  prepareWaveButtons();
  showStep("timing");
}


async function loadAllWaveSummaries() {
  if (!sessionId) {
    alert("No session ID yet. Save wave assignments first.");
    return;
  }

  showLoading("Loading wave results...");

  try {
    await loadSpecificWaveSummary("Wave 1", "wave1SummaryTable", "wave1SummaryBody");
    await loadSpecificWaveSummary("Wave 2", "wave2SummaryTable", "wave2SummaryBody");
  } finally {
    hideLoading();
  }
}


async function loadSpecificWaveSummary(wave, tableId, bodyId) {
  const result = await callBackend({
    action: "getRunWaveSummary",
    sessionId: sessionId,
    wave: wave
  });

  if (!result.success) {
    alert("Failed to load " + wave + " summary: " + result.error);
    return;
  }

  const table = document.getElementById(tableId);
  const tbody = document.getElementById(bodyId);

  tbody.innerHTML = "";

  const sortedResults = result.results.sort((a, b) => {
    const aSeconds = Number(a.TimeSeconds);
    const bSeconds = Number(b.TimeSeconds);

    if (!isNaN(aSeconds) && !isNaN(bSeconds)) {
      return aSeconds - bSeconds;
    }

    return Number(a.No) - Number(b.No);
  });

  sortedResults.forEach((row, index) => {
    const tr = document.createElement("tr");

    const hasTiming =
      row.TimeSeconds !== "" &&
      row.TimeSeconds !== null &&
      row.TimeSeconds !== undefined;

    const position = hasTiming ? index + 1 : "";

    tr.innerHTML = `
      <td>${position}</td>
      <td>${row.No}</td>
      <td>${row.Name}</td>
      <td>${row.Time || ""}</td>
      <td>${row.TimeSeconds || ""}</td>
      <td>${row.Grade || ""}</td>
      <td>${row.Status || ""}</td>
      <td>${row.Remarks || ""}</td>
    `;

    tbody.appendChild(tr);
  });

  table.style.display = "table";
}


async function loadWaveSummary() {
  await loadAllWaveSummaries();
}


function secondsToTimeText(seconds) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return String(minutes).padStart(2, "0") + ":" +
         String(remainingSeconds).padStart(2, "0");
}


function addStoredPendingSave(queueItem) {
  const stored = getStoredPendingSaves();

  const cleanItem = {
    queueId: queueItem.queueId,
    payload: queueItem.payload,
    displayTime: queueItem.displayTime,
    position: queueItem.position,
    studentName: queueItem.student.Name,
    studentNo: queueItem.student.No
  };

  const filtered = stored.filter(item => item.queueId !== cleanItem.queueId);
  filtered.push(cleanItem);

  localStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(filtered));
}


function removeStoredPendingSave(queueId) {
  const stored = getStoredPendingSaves();
  const filtered = stored.filter(item => item.queueId !== queueId);

  localStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(filtered));
}


function getStoredPendingSaves() {
  try {
    const raw = localStorage.getItem(PENDING_SAVE_KEY);

    if (!raw) return [];

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}


async function retryPendingSavesFromStorage() {
  const stored = getStoredPendingSaves();

  if (stored.length === 0) {
    updateQueueStatus();
    return;
  }

  const confirmRetry = confirm(
    stored.length +
    " unsaved run timing record(s) were found from a previous session. Retry saving now?"
  );

  if (!confirmRetry) {
    updateQueueStatus();
    return;
  }

  showLoading("Retrying unsaved timings...");

  try {
    for (const item of stored) {
      try {
        const result = await callBackend(item.payload);

        if (result.success) {
          removeStoredPendingSave(item.queueId);
        }
      } catch (error) {
        console.error("Retry save failed:", error);
      }
    }
  } finally {
    hideLoading();
    updateQueueStatus();
  }
}


function clearRunPage() {
  allStudents = [];
  sessionId = "";
  waveStartTime = null;
  finishedStudentIds = new Set();
  saveQueue = [];
  isSavingQueue = false;
  capturedResults = [];
  finishCounter = 0;

  if (timerInterval) {
    clearInterval(timerInterval);
  }

  document.getElementById("studentAssignmentList").innerHTML = "";
  document.getElementById("runnerButtons").innerHTML = "";
  document.getElementById("remainingList").innerHTML = "";
  document.getElementById("wave1SummaryBody").innerHTML = "";
  document.getElementById("wave2SummaryBody").innerHTML = "";
  document.getElementById("wave1SummaryTable").style.display = "none";
  document.getElementById("wave2SummaryTable").style.display = "none";
  document.getElementById("timerDisplay").textContent = "00:00";
  document.getElementById("timerStatus").textContent = "";
  document.getElementById("recentFinishList").innerHTML = "No finishes yet.";

  updateWaveCounts();
  updateQueueStatus();
}
