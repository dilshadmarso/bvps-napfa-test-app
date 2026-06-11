const GOOGLE_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyjiK1MWx30tV0wxZsTf5k5OLaGbQsvbCNacuBO8Ypa7lNTDMK46BRZY0T3Vn3dgP3X/exec";

const LOCAL_DRAFT_KEY   = "BVPS_NAPFA_STATION_DRAFT_V2";
const TESTER_NAME_KEY   = "BVPS_NAPFA_TESTER_NAME";
const STATION_KEY       = "BVPS_NAPFA_LAST_STATION";
// NEW: persist last-used level and class so setup is faster next time
const LEVEL_KEY         = "BVPS_NAPFA_LAST_LEVEL";
const CLASS_KEY         = "BVPS_NAPFA_LAST_CLASS";

const STATIONS = [
  "Sit-ups",
  "Standing Broad Jump",
  "Sit and Reach",
  "Inclined Pull-up",
  "Shuttle Run"
];

let setupData = { levels: [], classesByLevel: {}, groupsByClass: {} };

let rubricCache = {};
let rubricRows  = [];

let students       = [];
let currentContext = null;

let hasUnsavedChanges = false;
let saveInProgress    = false;

// NEW: auto-save timer
let autoSaveTimer    = null;
let autoSaveCountdown = 0;
let countdownInterval = null;

window.addEventListener("load", initialisePage);


/* =====================================================
   INITIALISATION
===================================================== */

async function initialisePage() {
  setTodayDate();
  installCloseWarning();
  restoreTesterName();
  loadStations();
  await loadStationSetupData();
}


function setTodayDate() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day   = String(now.getDate()).padStart(2, "0");
  document.getElementById("testDate").value = `${year}-${month}-${day}`;
}


function installCloseWarning() {
  window.addEventListener("beforeunload", event => {
    if (hasUnsavedChanges || saveInProgress) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}


function restoreTesterName() {
  const saved = localStorage.getItem(TESTER_NAME_KEY);
  if (saved) document.getElementById("testerName").value = saved;
}


/* =====================================================
   LOADING OVERLAY
===================================================== */

function showLoading(message) {
  document.getElementById("loadingText").textContent = message || "Loading...";
  document.getElementById("loadingOverlay").classList.remove("hidden");
}

function hideLoading() {
  document.getElementById("loadingOverlay").classList.add("hidden");
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

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error("Backend returned an invalid response.");
  }
}


/* =====================================================
   SETUP DATA
===================================================== */

async function loadStationSetupData() {
  showLoading("Loading setup...");

  try {
    const result = await callBackend({ action: "getStationSetupData" });

    if (!result.success) {
      throw new Error(result.error || "Unable to load setup data.");
    }

    setupData = {
      levels:          Array.isArray(result.levels) ? result.levels : [],
      classesByLevel:  result.classesByLevel  || {},
      groupsByClass:   result.groupsByClass   || {}
    };

    populateLevels();
    restoreLastLevelAndClass();
    setText("setupMessage", "Setup ready.");

  } catch (error) {
    setText("setupMessage", "Failed to load setup: " + error.message);
  } finally {
    hideLoading();
  }
}


function populateLevels() {
  const select = document.getElementById("levelSelect");
  select.innerHTML = `<option value="">Select level</option>`;

  setupData.levels.forEach(level => {
    const option = document.createElement("option");
    option.value = level;
    option.textContent = level;
    select.appendChild(option);
  });
}


// NEW: restore level → class after setup data loads
function restoreLastLevelAndClass() {
  const savedLevel = localStorage.getItem(LEVEL_KEY);
  const savedClass = localStorage.getItem(CLASS_KEY);

  if (savedLevel) {
    const levelSelect = document.getElementById("levelSelect");
    levelSelect.value = savedLevel;
    updateClassesFromMemory();

    if (savedClass) {
      const classSelect = document.getElementById("classSelect");
      classSelect.value = savedClass;
      updateGroupsFromMemory();
    }
  }
}


function updateClassesFromMemory() {
  const level = document.getElementById("levelSelect").value;
  const classSelect = document.getElementById("classSelect");
  const groupSelect = document.getElementById("groupSelect");

  classSelect.innerHTML = `<option value="">Select class</option>`;
  groupSelect.innerHTML = `<option value="">Select group</option>`;

  (setupData.classesByLevel[level] || []).forEach(className => {
    const option = document.createElement("option");
    option.value = className;
    option.textContent = className;
    classSelect.appendChild(option);
  });
}


function updateGroupsFromMemory() {
  const className = document.getElementById("classSelect").value;
  const groupSelect = document.getElementById("groupSelect");

  groupSelect.innerHTML = `<option value="">Select group</option>`;

  (setupData.groupsByClass[className] || []).forEach(groupName => {
    const option = document.createElement("option");
    option.value = groupName;
    option.textContent = groupName;
    groupSelect.appendChild(option);
  });
}


function loadStations() {
  const select = document.getElementById("stationSelect");
  select.innerHTML = `<option value="">Select station</option>`;

  STATIONS.forEach(station => {
    const option = document.createElement("option");
    option.value = station;
    option.textContent = station;
    select.appendChild(option);
  });

  const previousStation = localStorage.getItem(STATION_KEY);
  if (previousStation && STATIONS.includes(previousStation)) {
    select.value = previousStation;
  }
}


/* =====================================================
   LOAD GROUP
===================================================== */

async function loadTesterGroup() {
  const tester    = document.getElementById("testerName").value.trim();
  const testDate  = document.getElementById("testDate").value;
  const station   = document.getElementById("stationSelect").value;
  const level     = document.getElementById("levelSelect").value;
  const className = document.getElementById("classSelect").value;
  const groupName = document.getElementById("groupSelect").value;

  if (!tester) {
    alert("Please enter the tester name.");
    document.getElementById("testerName").focus();
    return;
  }

  if (!testDate || !station || !level || !className || !groupName) {
    alert("Please complete all setup selections.");
    return;
  }

  // Persist all setup fields so next group is faster
  localStorage.setItem(TESTER_NAME_KEY, tester);
  localStorage.setItem(STATION_KEY, station);
  localStorage.setItem(LEVEL_KEY, level);
  localStorage.setItem(CLASS_KEY, className);

  currentContext = {
    tester, testDate, station, level, className, groupName,
    sessionId: `${className}-${station}-${testDate}`
  };

  showLoading("Loading pupils and rubric...");

  try {
    const [loadedRubric, groupResult] = await Promise.all([
      getRubricForStation(station),
      callBackend({
        action: "getStationTesterData",
        className, groupName, station, testDate
      })
    ]);

    if (!groupResult.success) {
      throw new Error(groupResult.error || "Unable to load pupils.");
    }

    rubricRows = loadedRubric;

    students = groupResult.students.map(student => {
      const absent = Boolean(student.ExistingAbsent);
      const originalScore =
        student.ExistingScore !== "" &&
        student.ExistingScore !== null &&
        student.ExistingScore !== undefined
          ? String(student.ExistingScore)
          : "";

      return {
        ...student,
        Score:             absent ? "" : originalScore,
        Grade:             absent ? "" : student.ExistingGrade || "",
        Absent:            absent,
        OriginalScore:     originalScore,
        OriginalAbsent:    absent,
        HasExistingResult: Boolean(student.HasExistingResult),
        SaveState:         student.HasExistingResult ? "saved" : "blank"
      };
    });

    restoreLocalDraftIfMatching();
    renderStudentRows();
    updateTesterHeader();
    updateProgressCounts();

    hasUnsavedChanges = calculateChangedCount() > 0;
    updateSaveBar();
    showStep("scores");

  } catch (error) {
    alert("Unable to load group: " + error.message);
  } finally {
    hideLoading();
  }
}


async function getRubricForStation(station) {
  if (rubricCache[station]) return rubricCache[station];

  const result = await callBackend({ action: "getStationRubric", station });

  if (!result.success) throw new Error(result.error || "Unable to load rubric.");

  const rows = Array.isArray(result.rubric) ? result.rubric : [];
  rubricCache[station] = rows;
  return rows;
}


/* =====================================================
   RENDER PUPIL ROWS
===================================================== */

function renderStudentRows() {
  const container = document.getElementById("studentList");
  container.innerHTML = "";

  students.forEach((student, index) => {
    const row = document.createElement("div");
    row.id        = `student-row-${safeId(student.ID)}`;
    row.className = "student-row " + rowStateClass(student);

    const inputMode = currentContext.station === "Shuttle Run" ? "decimal" : "numeric";
    const step      = currentContext.station === "Shuttle Run" ? "0.1" : "1";

    // NEW: validation range hint shown in placeholder
    const range      = SCORE_RANGES[currentContext.station];
    const placeholder = range ? `${range.min}–${range.max}` : "Score";

    row.innerHTML = `
      <div class="student-main">
        <div class="register-number">${escapeHtml(student.No)}</div>

        <div class="student-name">${escapeHtml(student.Name)}</div>

        <div class="score-wrap">
          <input
            id="score-${safeId(student.ID)}"
            class="score-input"
            type="number"
            inputmode="${inputMode}"
            enterkeyhint="next"
            step="${step}"
            value="${escapeAttribute(student.Score)}"
            placeholder="${placeholder}"
            ${student.Absent ? "disabled" : ""}
            oninput="handleScoreInput(${index}, this.value)"
            onkeydown="handleScoreKeyDown(event, ${index})"
            onfocus="this.select()"
          >
          <div id="score-hint-${safeId(student.ID)}" class="score-hint"></div>
          <div class="unit-label">${escapeHtml(getStationUnit())}</div>
        </div>

        <div id="grade-${safeId(student.ID)}" class="grade-badge ${gradeClass(student.Grade)}">
          ${student.Absent ? "—" : escapeHtml(student.Grade || "—")}
        </div>

        <button
          id="absent-btn-${safeId(student.ID)}"
          class="absent-btn${student.Absent ? " is-absent" : ""}"
          onclick="handleAbsentToggle(${index})"
          ${student.SaveState === "saving" ? "disabled" : ""}
        >${student.Absent ? "✓ Absent" : "Absent"}</button>
      </div>

      <div class="student-lower">
        <div id="status-${safeId(student.ID)}" class="row-status">
          ${escapeHtml(rowStatusText(student))}
        </div>
      </div>
    `;

    container.appendChild(row);
  });
}


/* =====================================================
   SCORE INPUT
===================================================== */

function handleScoreInput(index, value) {
  const student = students[index];
  if (student.Absent) return;

  student.Score = value;

  const id        = safeId(student.ID);
  const input     = document.getElementById(`score-${id}`);
  const hintEl    = document.getElementById(`score-hint-${id}`);

  if (value === "") {
    student.Grade = "";
    input && input.classList.remove("input-error");
    if (hintEl) hintEl.textContent = "";
  } else {
    const numericScore = Number(value);

    if (Number.isNaN(numericScore)) {
      student.Grade = "";
    } else {
      // NEW: inline range validation while typing
      const valid = isScoreValid(currentContext.station, value);

      if (input) input.classList.toggle("input-error", !valid);

      if (!valid && hintEl) {
        const range = SCORE_RANGES[currentContext.station];
        hintEl.textContent = range
          ? `Valid: ${range.min}–${range.max}`
          : "Invalid score";
      } else if (hintEl) {
        hintEl.textContent = "";
      }

      student.Grade = valid
        ? calculateGradePreview(
            currentContext.station,
            student.Gender,
            student.AgeUsed,
            numericScore
          )
        : "";
    }
  }

  student.SaveState = isStudentChanged(student)
    ? "edited"
    : student.HasExistingResult ? "saved" : "blank";

  refreshStudentRow(student);
  markDraftChanged();
}


function handleScoreKeyDown(event, index) {
  if (event.key !== "Enter" && event.key !== "Next") return;
  event.preventDefault();
  focusNextAvailableScore(index);
}


function focusNextAvailableScore(currentIndex) {
  for (let i = currentIndex + 1; i < students.length; i++) {
    if (students[i].Absent) continue;
    const input = document.getElementById(`score-${safeId(students[i].ID)}`);
    if (input) { input.focus(); input.select(); return; }
  }
}


/* =====================================================
   ABSENT TOGGLE  (replaces checkbox; no browser confirm)
===================================================== */

function handleAbsentToggle(index) {
  const student = students[index];
  const id      = safeId(student.ID);
  const btn     = document.getElementById(`absent-btn-${id}`);

  if (!btn) return;

  // Toggling off (already absent → undo)
  if (student.Absent) {
    student.Absent    = false;
    student.SaveState = isStudentChanged(student)
      ? "edited"
      : student.HasExistingResult ? "saved" : "blank";

    refreshStudentRow(student);
    markDraftChanged();

    // Re-focus the score input so the tester can enter a score immediately
    const input = document.getElementById(`score-${id}`);
    if (input) { input.focus(); input.select(); }
    return;
  }

  // Toggling on — show an inline confirmation state instead of browser confirm()
  // Change the button text to "Confirm absent?" and add a second click handler.
  btn.textContent = "Confirm?";
  btn.style.background = "#fff2d3";
  btn.style.borderColor = "#d89516";
  btn.style.color = "#996000";

  // Clicking confirm
  btn.onclick = () => {
    student.Absent    = true;
    student.Score     = "";
    student.Grade     = "";
    student.SaveState = "edited";

    btn.onclick = () => handleAbsentToggle(index); // reset handler
    btn.style.background = "";
    btn.style.borderColor = "";
    btn.style.color = "";

    refreshStudentRow(student);
    markDraftChanged();
  };

  // Clicking anywhere else cancels the pending confirmation
  function cancelPending(e) {
    if (!btn.contains(e.target)) {
      btn.textContent = "Absent";
      btn.style.background = "";
      btn.style.borderColor = "";
      btn.style.color = "";
      btn.onclick = () => handleAbsentToggle(index);
      document.removeEventListener("click", cancelPending);
    }
  }

  // Small timeout so this click doesn't immediately trigger the cancel
  setTimeout(() => document.addEventListener("click", cancelPending), 50);
}


/* =====================================================
   REFRESH A SINGLE ROW
===================================================== */

function refreshStudentRow(student) {
  const id = safeId(student.ID);

  const row       = document.getElementById(`student-row-${id}`);
  const scoreInput = document.getElementById(`score-${id}`);
  const grade     = document.getElementById(`grade-${id}`);
  const status    = document.getElementById(`status-${id}`);
  const absentBtn = document.getElementById(`absent-btn-${id}`);
  const hintEl    = document.getElementById(`score-hint-${id}`);

  if (row)        row.className = "student-row " + rowStateClass(student);

  if (scoreInput) {
    scoreInput.disabled = student.Absent;
    scoreInput.value    = student.Score;
    if (student.Absent) {
      scoreInput.classList.remove("input-error");
      if (hintEl) hintEl.textContent = "";
    }
  }

  if (grade) {
    grade.className   = "grade-badge " + gradeClass(student.Grade);
    grade.textContent = student.Absent ? "—" : student.Grade || "—";
  }

  if (status) status.textContent = rowStatusText(student);

  if (absentBtn) {
    // Only update if not mid-confirmation (button text would be "Confirm?")
    if (absentBtn.textContent !== "Confirm?") {
      absentBtn.textContent = student.Absent ? "✓ Absent" : "Absent";
      absentBtn.className   = "absent-btn" + (student.Absent ? " is-absent" : "");
      absentBtn.disabled    = student.SaveState === "saving";
    }
  }

  updateProgressCounts();
  updateSaveBar();
}


function rowStateClass(student) {
  if (student.SaveState === "failed") return "failed";
  if (student.Absent)                 return "absent";
  if (student.SaveState === "edited") return "edited";
  if (student.Score !== "" && student.Grade) return "complete";
  return "";
}


function rowStatusText(student) {
  if (student.SaveState === "saving")  return "Saving...";
  if (student.SaveState === "failed")  return "Save failed";
  if (student.Absent) {
    return student.SaveState === "edited" ? "Absent — unsaved" : "Absent";
  }
  if (student.SaveState === "saved")   return "Saved";
  if (student.SaveState === "edited") {
    return student.HasExistingResult ? "Existing result changed" : "Unsaved";
  }
  return "";
}


/* =====================================================
   GRADE CALCULATION
===================================================== */

function calculateGradePreview(station, gender, age, score) {
  const matchingRows = rubricRows.filter(row =>
    normaliseText(row.Station)  === normaliseText(station) &&
    normaliseGender(row.Gender) === normaliseGender(gender) &&
    Number(row.Age)             === Number(age)
  );

  for (const grade of ["A","B","C","D","E","F"]) {
    const row = matchingRows.find(item =>
      String(item.Grade || "").trim().toUpperCase() === grade
    );

    if (!row) continue;

    const hasMin = row.Min !== "" && row.Min !== null && row.Min !== undefined;
    const hasMax = row.Max !== "" && row.Max !== null && row.Max !== undefined;
    const min = Number(row.Min);
    const max = Number(row.Max);

    if (hasMin && hasMax && score >= min && score <= max) return grade;
    if (hasMin && !hasMax && score >= min)                return grade;
    if (!hasMin && hasMax && score <= max)                return grade;
  }

  return "F";
}


function normaliseGender(value) {
  const t = String(value || "").trim().toUpperCase();
  if (t === "F" || t === "FEMALE") return "F";
  if (t === "M" || t === "MALE")   return "M";
  return t;
}

function normaliseText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}


/* =====================================================
   SAVE
===================================================== */

async function saveGroupResults() {
  stopAutoSave();

  const completedStudents = students.filter(s => s.Absent || s.Score !== "");

  if (completedStudents.length === 0) {
    alert("No scores or absent pupils have been recorded.");
    return;
  }

  const missing = students.filter(s => !s.Absent && s.Score === "");

  if (missing.length > 0) {
    const proceed = confirm(
      `${missing.length} pupil(s) have no score. Save the completed pupils only?`
    );
    if (!proceed) return;
  }

  const changedStudents = completedStudents.filter(isStudentChanged);

  if (changedStudents.length === 0) {
    alert("There are no new or changed results to save.");
    return;
  }

  const invalidStudent = changedStudents.find(
    s => !s.Absent && !isScoreValid(currentContext.station, s.Score)
  );

  if (invalidStudent) {
    alert(`Check the score for ${invalidStudent.Name}.`);
    const input = document.getElementById(`score-${safeId(invalidStudent.ID)}`);
    if (input) input.focus();
    return;
  }

  changedStudents.forEach(s => { s.SaveState = "saving"; refreshStudentRow(s); });

  hasUnsavedChanges = true;
  saveInProgress    = true;

  saveLocalDraft();
  updateSaveBar();
  showLoading("Saving group results...");

  try {
    const result = await callBackend({
      action:    "saveStationResultsBatch",
      sessionId: currentContext.sessionId,
      testDate:  currentContext.testDate,
      className: currentContext.className,
      groupName: currentContext.groupName,
      station:   currentContext.station,
      tester:    currentContext.tester,
      results:   changedStudents.map(s => ({
        ID:     s.ID,
        score:  s.Absent ? "" : Number(s.Score),
        absent: Boolean(s.Absent)
      }))
    });

    if (!result.success) throw new Error(result.error || "Unable to save results.");

    const returnedById = new Map(result.results.map(item => [String(item.ID), item]));

    changedStudents.forEach(s => {
      const returned = returnedById.get(String(s.ID));
      if (returned) {
        s.Absent            = Boolean(returned.Absent);
        s.Score             = s.Absent ? "" : String(returned.Score);
        s.Grade             = s.Absent ? "" : returned.Grade || "";
        s.SaveState         = "saved";
        s.HasExistingResult = true;
        s.OriginalScore     = s.Score;
        s.OriginalAbsent    = s.Absent;
      }
      refreshStudentRow(s);
    });

    hasUnsavedChanges = false;
    clearLocalDraft();
    renderReviewTable(result);
    showStep("review");

  } catch (error) {
    changedStudents.forEach(s => { s.SaveState = "failed"; refreshStudentRow(s); });
    hasUnsavedChanges = true;
    saveLocalDraft();
    alert("Unable to save results: " + error.message);

  } finally {
    saveInProgress = false;
    hideLoading();
    updateSaveBar();
  }
}


/* =====================================================
   AUTO-SAVE  (saves draft to localStorage every 30 s)
===================================================== */

const AUTO_SAVE_INTERVAL = 30; // seconds

function startAutoSave() {
  stopAutoSave();

  autoSaveCountdown = AUTO_SAVE_INTERVAL;

  countdownInterval = setInterval(() => {
    autoSaveCountdown--;

    if (autoSaveCountdown <= 0) {
      saveLocalDraft();
      autoSaveCountdown = AUTO_SAVE_INTERVAL;
    }

    updateSaveBar();
  }, 1000);
}

function stopAutoSave() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}


/* =====================================================
   REVIEW TABLE
===================================================== */

function renderReviewTable(saveResult) {
  const tbody = document.getElementById("reviewBody");
  const tfoot = document.getElementById("reviewFoot");

  tbody.innerHTML = "";
  tfoot.innerHTML = "";

  const completedStudents = students
    .filter(s => s.Absent || s.Score !== "")
    .sort((a, b) => Number(a.No) - Number(b.No));

  // Grade tally
  const gradeCounts = { A:0, B:0, C:0, D:0, E:0, F:0, Absent:0 };

  completedStudents.forEach(student => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(student.No)}</td>
      <td>${escapeHtml(student.Name)}</td>
      <td>${student.Absent ? "—" : escapeHtml(student.Score)}</td>
      <td>${student.Absent ? "—" : escapeHtml(student.Grade)}</td>
      <td>${student.Absent ? "Absent" : "Completed"}</td>
    `;
    tbody.appendChild(row);

    if (student.Absent) {
      gradeCounts.Absent++;
    } else if (student.Grade && gradeCounts[student.Grade] !== undefined) {
      gradeCounts[student.Grade]++;
    }
  });

  // Summary footer row
  const gradeSummary = ["A","B","C","D","E","F"]
    .filter(g => gradeCounts[g] > 0)
    .map(g => `${g}: ${gradeCounts[g]}`)
    .join("  ·  ");

  const passCount = (gradeCounts.A + gradeCounts.B + gradeCounts.C);
  const totalGraded = completedStudents.filter(s => !s.Absent).length;

  const footRow = document.createElement("tr");
  footRow.innerHTML = `
    <td colspan="2">Summary — ${completedStudents.length} pupils</td>
    <td colspan="2">${gradeSummary || "—"}</td>
    <td>${totalGraded > 0 ? passCount + "/" + totalGraded + " pass" : ""}</td>
  `;
  tfoot.appendChild(footRow);

  setText("reviewMessage",
    `${saveResult.totalSaved} result(s) saved — ` +
    `${saveResult.created} created, ${saveResult.updated} updated.`
  );
}


/* =====================================================
   COPY TO CLIPBOARD  (tab-separated for Google Sheets)
===================================================== */

async function copyResultsToClipboard() {
  const lines = ["No.\tName\tScore\tGrade\tStatus"];

  students
    .filter(s => s.Absent || s.Score !== "")
    .sort((a, b) => Number(a.No) - Number(b.No))
    .forEach(s => {
      lines.push([
        s.No,
        s.Name,
        s.Absent ? "" : s.Score,
        s.Absent ? "" : s.Grade,
        s.Absent ? "Absent" : "Completed"
      ].join("\t"));
    });

  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    alert("Results copied to clipboard. Paste into Google Sheets.");
  } catch {
    alert("Copy failed — your browser may not support clipboard access.");
  }
}


/* =====================================================
   NAVIGATION
===================================================== */

function returnToScores() {
  showStep("scores");
}


function testNextGroup() {
  if (hasUnsavedChanges) {
    const proceed = confirm("Unsaved changes remain. Leave this group?");
    if (!proceed) return;
  }

  resetScoringState();

  document.getElementById("groupSelect").value = "";

  showStep("setup");

  setText("setupMessage",
    "Select the next group. Station, tester, date, level and class have been kept."
  );
}


function changeStation() {
  if (hasUnsavedChanges) {
    const proceed = confirm("Unsaved changes remain. Change station?");
    if (!proceed) return;
  }

  resetScoringState();

  document.getElementById("stationSelect").value = "";
  document.getElementById("groupSelect").value   = "";

  showStep("setup");
  setText("setupMessage", "Select a new station and group.");
}


function resetScoringState() {
  stopAutoSave();

  students       = [];
  rubricRows     = [];
  currentContext = null;

  hasUnsavedChanges = false;
  saveInProgress    = false;

  clearLocalDraft();
  clearElement("studentList");
  clearElement("reviewBody");
}


/* =====================================================
   LOCAL DRAFT
===================================================== */

function markDraftChanged() {
  hasUnsavedChanges = calculateChangedCount() > 0;

  saveLocalDraft();
  updateProgressCounts();
  updateSaveBar();

  // Start auto-save countdown on first change
  if (hasUnsavedChanges && !countdownInterval) {
    startAutoSave();
  }
}


function saveLocalDraft() {
  if (!currentContext) return;

  const draft = {
    context:  currentContext,
    students: students.map(s => ({ ID: s.ID, Score: s.Score, Absent: s.Absent }))
  };

  localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(draft));
}


function restoreLocalDraftIfMatching() {
  const raw = localStorage.getItem(LOCAL_DRAFT_KEY);
  if (!raw) return;

  try {
    const draft = JSON.parse(raw);

    if (
      !draft.context ||
      draft.context.testDate  !== currentContext.testDate  ||
      draft.context.className !== currentContext.className ||
      draft.context.groupName !== currentContext.groupName ||
      draft.context.station   !== currentContext.station
    ) return;

    const restore = confirm("Unsaved scores were found for this group. Restore them?");
    if (!restore) { clearLocalDraft(); return; }

    const draftById = new Map(draft.students.map(item => [String(item.ID), item]));

    students.forEach(s => {
      const saved = draftById.get(String(s.ID));
      if (!saved) return;

      s.Absent = Boolean(saved.Absent);
      s.Score  = s.Absent ? "" : String(saved.Score || "");

      if (!s.Absent && s.Score !== "") {
        s.Grade = calculateGradePreview(
          currentContext.station, s.Gender, s.AgeUsed, Number(s.Score)
        );
      } else {
        s.Grade = "";
      }

      s.SaveState = isStudentChanged(s)
        ? "edited"
        : s.HasExistingResult ? "saved" : "blank";
    });

  } catch {
    clearLocalDraft();
  }
}


function clearLocalDraft() {
  localStorage.removeItem(LOCAL_DRAFT_KEY);
}


/* =====================================================
   PROGRESS COUNTS AND HEADER
===================================================== */

function updateTesterHeader() {
  setText("testerTitle", `${currentContext.station} — ${currentContext.groupName}`);
  setText("testerSubtitle",
    `${currentContext.className} | ${currentContext.testDate} | Tester: ${currentContext.tester}`
  );
}


function updateProgressCounts() {
  const entered = students.filter(s => !s.Absent && s.Score !== "").length;
  const absent  = students.filter(s => s.Absent).length;
  const missing = students.filter(s => !s.Absent && s.Score === "").length;
  const total   = students.length;

  setText("enteredCount", entered);
  setText("absentCount",  absent);
  setText("missingCount", missing);
  setText("totalCount",   total);
}


/* =====================================================
   SAVE BAR
===================================================== */

function updateSaveBar() {
  const changed  = calculateChangedCount();
  const heading  = document.getElementById("saveBarHeading");
  const detail   = document.getElementById("saveBarDetail");
  const saveBtn  = document.getElementById("saveResultsButton");

  if (saveInProgress) {
    if (heading) heading.textContent = "Saving — do not close the page";
    if (detail)  detail.textContent  = "";
    if (saveBtn) saveBtn.disabled    = true;
    return;
  }

  if (saveBtn) saveBtn.disabled = false;

  if (changed === 0) {
    if (heading) heading.textContent = "All results saved";
    if (detail)  detail.textContent  = "";
    return;
  }

  if (heading) heading.textContent = `${changed} unsaved result${changed !== 1 ? "s" : ""}`;

  // Show countdown if auto-save is running
  if (countdownInterval && autoSaveCountdown > 0) {
    if (detail) detail.textContent = `Draft auto-saves in ${autoSaveCountdown}s`;
  } else {
    if (detail) detail.textContent = "";
  }
}


/* =====================================================
   STEP NAVIGATION
===================================================== */

function showStep(step) {
  const steps = { setup: "stepSetup", scores: "stepScores", review: "stepReview" };
  const progs = { setup: "progressSetup", scores: "progressScores", review: "progressReview" };

  Object.values(steps).forEach(id =>
    document.getElementById(id).classList.add("hidden")
  );

  Object.values(progs).forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove("active", "done");
  });

  document.getElementById(steps[step]).classList.remove("hidden");

  const order = ["setup", "scores", "review"];
  const idx   = order.indexOf(step);

  order.forEach((s, i) => {
    const el = document.getElementById(progs[s]);
    if (i < idx)  el.classList.add("done");
    if (i === idx) el.classList.add("active");
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}


/* =====================================================
   VALIDATION
===================================================== */

// Centralised ranges — used both for validation and for placeholder hints
const SCORE_RANGES = {
  "Sit-ups":              { min: 0,  max: 100, wholeNumber: true  },
  "Standing Broad Jump":  { min: 0,  max: 400, wholeNumber: true  },
  "Sit and Reach":        { min: -50, max: 100, wholeNumber: true  },
  "Inclined Pull-up":     { min: 0,  max: 100, wholeNumber: true  },
  "Shuttle Run":          { min: 5,  max: 60,  wholeNumber: false }
};


function isScoreValid(station, rawScore) {
  if (rawScore === "" || rawScore === null || rawScore === undefined) return false;

  const score = Number(rawScore);
  if (Number.isNaN(score)) return false;

  const range = SCORE_RANGES[station];
  if (!range) return false;

  if (score < range.min || score > range.max) return false;
  if (range.wholeNumber && !Number.isInteger(score)) return false;

  return true;
}


function getStationUnit() {
  const row = rubricRows.find(item =>
    normaliseText(item.Station) === normaliseText(currentContext.station)
  );

  if (row && row.Unit) return row.Unit;

  if (currentContext.station === "Shuttle Run")           return "sec";
  if (currentContext.station === "Standing Broad Jump" ||
      currentContext.station === "Sit and Reach")         return "cm";

  return "reps";
}


/* =====================================================
   STATE HELPERS
===================================================== */

function calculateChangedCount() {
  return students.filter(isStudentChanged).length;
}

function isStudentChanged(student) {
  return (
    String(student.Score   || "") !== String(student.OriginalScore  || "") ||
    Boolean(student.Absent)       !== Boolean(student.OriginalAbsent)
  );
}


/* =====================================================
   DOM HELPERS
===================================================== */

function gradeClass(grade) {
  const n = String(grade || "").trim().toLowerCase();
  return n ? `grade-${n}` : "";
}

function safeId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value ?? "");
}

function clearElement(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = "";
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
