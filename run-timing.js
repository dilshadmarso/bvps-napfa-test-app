const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyjiK1MWx30tV0wxZsTf5k5OLaGbQsvbCNacuBO8Ypa7lNTDMK46BRZY0T3Vn3dgP3X/exec";

let allStudents = [];
let sessionId = "";
let waveStartTime = null;
let timerInterval = null;
let finishedStudentIds = new Set();


window.onload = async function () {
  setTodayDate();
  await loadLevels();
};


function setTodayDate() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  document.getElementById("testDate").value = `${yyyy}-${mm}-${dd}`;
}


async function callBackend(payload) {
  try {
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    console.log("Backend response:", text);

    try {
      return JSON.parse(text);
    } catch (err) {
      return {
        success: false,
        error: "Backend did not return JSON: " + text
      };
    }

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}


async function loadLevels() {
  const result = await callBackend({
    action: "getLevels"
  });

  if (!result.success) {
    document.getElementById("setupStatus").textContent =
      "Failed to load levels: " + result.error;
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
}


async function loadClasses() {
  const level = document.getElementById("levelSelect").value;
  const classSelect = document.getElementById("classSelect");

  classSelect.innerHTML = `<option value="">Select class</option>`;
  clearRunPage();

  if (!level) return;

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
}


async function loadRunStudents() {
  const className = document.getElementById("classSelect").value;

  clearRunPage();

  if (!className) return;

  document.getElementById("setupStatus").textContent = "Loading students...";

  const result = await callBackend({
    action: "getRunStudentsByClass",
    className: className
  });

  if (!result.success) {
    document.getElementById("setupStatus").textContent =
      "Failed to load students: " + result.error;
    return;
  }

  allStudents = result.students.map((student, index) => {
    return {
      ...student,
      Wave: index % 2 === 0 ? "Wave 1" : "Wave 2",
      RunStatus: index % 2 === 0 ? "Wave 1" : "Wave 2"
    };
  });

  renderWaveAssignments();

  document.getElementById("setupStatus").textContent =
    `${allStudents.length} students loaded.`;
}


function renderWaveAssignments() {
  const container = document.getElementById("studentAssignmentList");
  container.innerHTML = "";

  allStudents.forEach((student, index) => {
    const row = document.createElement("div");
    row.className = "student-row";

    row.innerHTML = `
      <div>${student.No}</div>
      <div>${student.Name}</div>
      <div>
        <select id="wave-${index}" onchange="updateStudentWave(${index})">
          <option value="Wave 1" ${student.Wave === "Wave 1" ? "selected" : ""}>Wave 1</option>
          <option value="Wave 2" ${student.Wave === "Wave 2" ? "selected" : ""}>Wave 2</option>
          <option value="Not Running" ${student.Wave === "Not Running" ? "selected" : ""}>Not Running</option>
        </select>
      </div>
    `;

    container.appendChild(row);
  });

  prepareWaveButtons();
}


function updateStudentWave(index) {
  const selectedWave = document.getElementById(`wave-${index}`).value;

  allStudents[index].Wave = selectedWave;
  allStudents[index].RunStatus = selectedWave;

  prepareWaveButtons();
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
  } else {
    document.getElementById("setupStatus").textContent =
      "Failed to save wave assignments: " + result.error;
    alert("Failed to save wave assignments: " + result.error);
  }
}


function prepareWaveButtons() {
  const wave = document.getElementById("waveSelect").value;
  const container = document.getElementById("runnerButtons");

  container.innerHTML = "";
  finishedStudentIds = new Set();

  const waveStudents = allStudents.filter(student => student.Wave === wave);

  waveStudents.forEach(student => {
    const button = document.createElement("button");
    button.className = "runner-btn";
    button.id = `runner-${student.ID}`;
    button.onclick = function () {
      recordFinish(student);
    };

    button.innerHTML = `
      <span class="runner-no">${student.No}</span>
      ${student.Name}
    `;

    container.appendChild(button);
  });

  document.getElementById("timerStatus").textContent =
    `${waveStudents.length} students loaded for ${wave}.`;
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
    alert("No students assigned to this wave.");
    return;
  }

  finishedStudentIds = new Set();
  waveStartTime = new Date();

  if (timerInterval) {
    clearInterval(timerInterval);
  }

  timerInterval = setInterval(updateTimerDisplay, 500);

  document.getElementById("timerStatus").textContent =
    `${wave} started. Tap student when finished.`;
}


function updateTimerDisplay() {
  if (!waveStartTime) return;

  const now = new Date();
  const elapsedSeconds = Math.floor((now - waveStartTime) / 1000);

  document.getElementById("timerDisplay").textContent =
    secondsToTimeText(elapsedSeconds);
}


async function recordFinish(student) {
  if (!waveStartTime) {
    alert("Please start the wave first.");
    return;
  }

  if (finishedStudentIds.has(student.ID)) {
    alert(student.Name + " already has timing recorded.");
    return;
  }

  const now = new Date();
  const elapsedSeconds = Math.round((now - waveStartTime) / 1000);

  const testDate = document.getElementById("testDate").value;
  const className = document.getElementById("classSelect").value;
  const wave = document.getElementById("waveSelect").value;

  const result = await callBackend({
    action: "saveRunFinish",
    sessionId: sessionId,
    testDate: testDate,
    className: className,
    wave: wave,
    student: student,
    elapsedSeconds: elapsedSeconds,
    attemptNo: 1,
    remarks: ""
  });

  if (result.success) {
    finishedStudentIds.add(student.ID);

    const button = document.getElementById(`runner-${student.ID}`);
    if (button) {
      button.classList.add("finished");
      button.innerHTML = `
        <span class="runner-no">${student.No}</span>
        ${student.Name}<br>
        ${result.result.Time}<br>
        Grade: ${result.result.Grade}
      `;
    }

    document.getElementById("timerStatus").textContent =
      `${student.Name} finished: ${result.result.Time}, Grade: ${result.result.Grade}`;
  } else {
    alert("Failed to save timing: " + result.error);
  }
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

  const remaining = waveStudents.filter(student => {
    return !finishedStudentIds.has(student.ID);
  });

  waveStartTime = null;

  document.getElementById("timerStatus").textContent =
    `${wave} ended. ${remaining.length} students have no timing.`;

  renderRemainingStudents(remaining);
  loadWaveSummary();
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
    div.className = "student-row";

    div.innerHTML = `
      <div>${student.No}</div>
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
        </select>
        <button onclick="markRemainingStatus('${student.ID}', ${index})">
          Save Status
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
    loadWaveSummary();
  } else {
    alert("Failed to mark status: " + result.error);
  }
}


async function loadWaveSummary() {
  if (!sessionId) {
    alert("No session ID yet. Save wave assignments first.");
    return;
  }

  const wave = document.getElementById("waveSelect").value;

  const result = await callBackend({
    action: "getRunWaveSummary",
    sessionId: sessionId,
    wave: wave
  });

  if (!result.success) {
    alert("Failed to load summary: " + result.error);
    return;
  }

  const table = document.getElementById("summaryTable");
  const tbody = document.getElementById("summaryBody");

  tbody.innerHTML = "";

  result.results.forEach(row => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
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


function secondsToTimeText(seconds) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return String(minutes).padStart(2, "0") + ":" +
         String(remainingSeconds).padStart(2, "0");
}


function clearRunPage() {
  allStudents = [];
  sessionId = "";
  waveStartTime = null;
  finishedStudentIds = new Set();

  if (timerInterval) {
    clearInterval(timerInterval);
  }

  document.getElementById("studentAssignmentList").innerHTML = "";
  document.getElementById("runnerButtons").innerHTML = "";
  document.getElementById("remainingList").innerHTML = "";
  document.getElementById("summaryBody").innerHTML = "";
  document.getElementById("summaryTable").style.display = "none";
  document.getElementById("timerDisplay").textContent = "00:00";
  document.getElementById("timerStatus").textContent = "";
}
