const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyjiK1MWx30tV0wxZsTf5k5OLaGbQsvbCNacuBO8Ypa7lNTDMK46BRZY0T3Vn3dgP3X/exec";

let currentStudents = [];

window.onload = async function () {
  setTodayDate();
  await loadLevels();
  await loadStations();
};


function setTodayDate() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  document.getElementById("testDate").value = `${yyyy}-${mm}-${dd}`;
}


async function callBackend(payload) {
  const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return await response.json();
}


async function loadLevels() {
  const status = document.getElementById("status");
  status.textContent = "Loading levels...";

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

  status.textContent = "";
}


async function loadClasses() {
  const level = document.getElementById("levelSelect").value;
  const classSelect = document.getElementById("classSelect");
  const groupSelect = document.getElementById("groupSelect");

  classSelect.innerHTML = `<option value="">Select class</option>`;
  groupSelect.innerHTML = `<option value="">Select group</option>`;
  clearStudentsTable();

  if (!level) return;

  const result = await callBackend({
    action: "getClasses",
    level: level
  });

  if (!result.success) {
    document.getElementById("status").textContent =
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


async function loadGroups() {
  const className = document.getElementById("classSelect").value;
  const groupSelect = document.getElementById("groupSelect");

  groupSelect.innerHTML = `<option value="">Select group</option>`;
  clearStudentsTable();

  if (!className) return;

  const result = await callBackend({
    action: "getGroupsByClass",
    className: className
  });

  if (!result.success) {
    document.getElementById("status").textContent =
      "Failed to load groups: " + result.error;
    return;
  }

  result.groups.forEach(groupName => {
    const option = document.createElement("option");
    option.value = groupName;
    option.textContent = groupName;
    groupSelect.appendChild(option);
  });
}


async function loadStations() {
  const result = await callBackend({
    action: "getStations"
  });

  if (!result.success) {
    document.getElementById("status").textContent =
      "Failed to load stations: " + result.error;
    return;
  }

  const stationSelect = document.getElementById("stationSelect");
  stationSelect.innerHTML = `<option value="">Select station</option>`;

  result.stations.forEach(station => {
    const option = document.createElement("option");
    option.value = station;
    option.textContent = station;
    stationSelect.appendChild(option);
  });
}


async function loadStudents() {
  const className = document.getElementById("classSelect").value;
  const groupName = document.getElementById("groupSelect").value;

  clearStudentsTable();

  if (!className || !groupName) return;

  const result = await callBackend({
    action: "getStudentsByGroup",
    className: className,
    groupName: groupName
  });

  if (!result.success) {
    document.getElementById("status").textContent =
      "Failed to load students: " + result.error;
    return;
  }

  currentStudents = result.students;
  renderStudentsTable();
}


function renderStudentsTable() {
  const table = document.getElementById("studentsTable");
  const tbody = document.getElementById("studentsTableBody");

  tbody.innerHTML = "";

  currentStudents.forEach((student, index) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${student.No}</td>
      <td>${student.Name}</td>
      <td>${student.Gender}</td>
      <td>${student.DOB}</td>
      <td>
        <input 
          type="number" 
          step="0.1" 
          class="score-input" 
          id="score-${index}" 
          placeholder="Score">
      </td>
      <td>
        <button class="save-btn" onclick="saveScore(${index})">
          Save
        </button>
      </td>
    `;

    tbody.appendChild(row);
  });

  table.style.display = currentStudents.length > 0 ? "table" : "none";
}


async function saveScore(index) {
  const student = currentStudents[index];

  const testDate = document.getElementById("testDate").value;
  const className = document.getElementById("classSelect").value;
  const groupName = document.getElementById("groupSelect").value;
  const station = document.getElementById("stationSelect").value;
  const tester = document.getElementById("testerName").value || "Unknown";
  const score = document.getElementById(`score-${index}`).value;

  if (!testDate) {
    alert("Please select test date.");
    return;
  }

  if (!station) {
    alert("Please select station.");
    return;
  }

  if (score === "") {
    alert("Please enter score.");
    return;
  }

  const sessionId = `${className}-${station}-${testDate}`;

  document.getElementById("status").textContent =
    `Saving ${student.Name}'s result...`;

  const result = await callBackend({
    action: "saveStationResult",
    sessionId: sessionId,
    testDate: testDate,
    className: className,
    groupName: groupName,
    station: station,
    student: student,
    score: score,
    tester: tester,
    remarks: ""
  });

  if (result.success) {
    document.getElementById("status").textContent =
      `${student.Name} saved. Grade: ${result.result.Grade}`;

    alert(`${student.Name} saved.\nGrade: ${result.result.Grade}`);
  } else {
    document.getElementById("status").textContent =
      "Save failed: " + result.error;

    alert("Save failed: " + result.error);
  }
}


function clearStudentsTable() {
  currentStudents = [];
  document.getElementById("studentsTableBody").innerHTML = "";
  document.getElementById("studentsTable").style.display = "none";
}
