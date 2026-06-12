const GOOGLE_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyjiK1MWx30tV0wxZsTf5k5OLaGbQsvbCNacuBO8Ypa7lNTDMK46BRZY0T3Vn3dgP3X/exec";

const LOCAL_DRAFT_KEY =
  "BVPS_NAPFA_STATION_DRAFT_V2";

const TESTER_NAME_KEY =
  "BVPS_NAPFA_TESTER_NAME";

const STATION_KEY =
  "BVPS_NAPFA_LAST_STATION";

const STATIONS = [
  "Sit-ups",
  "Standing Broad Jump",
  "Sit and Reach",
  "Inclined Pull-up",
  "Shuttle Run"
];

let setupData = {
  levels: [],
  classesByLevel: {},
  groupsByClass: {}
};

let rubricCache = {};
let rubricRows = [];

let students = [];
let currentContext = null;

let hasUnsavedChanges = false;
let saveInProgress = false;

window.addEventListener(
  "load",
  initialisePage
);


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
  const now = new Date();

  const year = now.getFullYear();

  const month =
    String(now.getMonth() + 1)
      .padStart(2, "0");

  const day =
    String(now.getDate())
      .padStart(2, "0");

  document.getElementById("testDate").value =
    `${year}-${month}-${day}`;
}


function installCloseWarning() {
  window.addEventListener(
    "beforeunload",
    event => {
      if (
        hasUnsavedChanges ||
        saveInProgress
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
  );
}


function restoreTesterName() {
  const saved =
    localStorage.getItem(
      TESTER_NAME_KEY
    );

  if (saved) {
    document.getElementById(
      "testerName"
    ).value = saved;
  }
}


/* =====================================================
   LOADING
===================================================== */

function showLoading(message) {
  document.getElementById(
    "loadingText"
  ).textContent =
    message || "Loading...";

  document.getElementById(
    "loadingOverlay"
  ).classList.remove("hidden");
}


function hideLoading() {
  document.getElementById(
    "loadingOverlay"
  ).classList.add("hidden");
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

  const rawText =
    await response.text();

  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new Error(
      "Backend returned an invalid response."
    );
  }
}


/* =====================================================
   SETUP DATA
===================================================== */

async function loadStationSetupData() {
  showLoading("Loading setup...");

  try {
    const result =
      await callBackend({
        action: "getStationSetupData"
      });

    if (!result.success) {
      throw new Error(
        result.error ||
        "Unable to load setup data."
      );
    }

    setupData = {
      levels:
        Array.isArray(result.levels)
          ? result.levels
          : [],

      classesByLevel:
        result.classesByLevel || {},

      groupsByClass:
        result.groupsByClass || {}
    };

    populateLevels();

    setText(
      "setupMessage",
      "Setup ready."
    );

  } catch (error) {
    setText(
      "setupMessage",
      "Failed to load setup: " +
      error.message
    );

  } finally {
    hideLoading();
  }
}


function populateLevels() {
  const select =
    document.getElementById(
      "levelSelect"
    );

  select.innerHTML =
    `<option value="">Select level</option>`;

  setupData.levels.forEach(level => {
    const option =
      document.createElement("option");

    option.value = level;
    option.textContent = level;

    select.appendChild(option);
  });
}


function updateClassesFromMemory() {
  const level =
    document.getElementById(
      "levelSelect"
    ).value;

  const classSelect =
    document.getElementById(
      "classSelect"
    );

  const groupSelect =
    document.getElementById(
      "groupSelect"
    );

  classSelect.innerHTML =
    `<option value="">Select class</option>`;

  groupSelect.innerHTML =
    `<option value="">Select group</option>`;

  const classes =
    setupData.classesByLevel[level] || [];

  classes.forEach(className => {
    const option =
      document.createElement("option");

    option.value = className;
    option.textContent = className;

    classSelect.appendChild(option);
  });
}


function updateGroupsFromMemory() {
  const className =
    document.getElementById(
      "classSelect"
    ).value;

  const groupSelect =
    document.getElementById(
      "groupSelect"
    );

  groupSelect.innerHTML =
    `<option value="">Select group</option>`;

  const groups =
    setupData.groupsByClass[className] || [];

  groups.forEach(groupName => {
    const option =
      document.createElement("option");

    option.value = groupName;
    option.textContent = groupName;

    groupSelect.appendChild(option);
  });
}


function loadStations() {
  const select =
    document.getElementById(
      "stationSelect"
    );

  select.innerHTML =
    `<option value="">Select station</option>`;

  STATIONS.forEach(station => {
    const option =
      document.createElement("option");

    option.value = station;
    option.textContent = station;

    select.appendChild(option);
  });

  const previousStation =
    localStorage.getItem(STATION_KEY);

  if (
    previousStation &&
    STATIONS.includes(previousStation)
  ) {
    select.value = previousStation;
  }
}


/* =====================================================
   LOAD GROUP
===================================================== */

async function loadTesterGroup() {
  const tester =
    document.getElementById(
      "testerName"
    ).value.trim();

  const testDate =
    document.getElementById(
      "testDate"
    ).value;

  const station =
    document.getElementById(
      "stationSelect"
    ).value;

  const level =
    document.getElementById(
      "levelSelect"
    ).value;

  const className =
    document.getElementById(
      "classSelect"
    ).value;

  const groupName =
    document.getElementById(
      "groupSelect"
    ).value;

  if (!tester) {
    alert("Please enter the tester name.");

    document.getElementById(
      "testerName"
    ).focus();

    return;
  }

  if (
    !testDate ||
    !station ||
    !level ||
    !className ||
    !groupName
  ) {
    alert(
      "Please complete all setup selections."
    );

    return;
  }

  localStorage.setItem(
    TESTER_NAME_KEY,
    tester
  );

  localStorage.setItem(
    STATION_KEY,
    station
  );

  currentContext = {
    tester: tester,
    testDate: testDate,
    station: station,
    level: level,
    className: className,
    groupName: groupName,

    sessionId:
      `${className}-${station}-${testDate}`
  };

  showLoading(
    "Loading pupils and rubric..."
  );

  try {
    const rubricPromise =
      getRubricForStation(station);

    const groupPromise =
      callBackend({
        action: "getStationTesterData",
        className: className,
        groupName: groupName,
        station: station,
        testDate: testDate
      });

    const [
      loadedRubric,
      groupResult
    ] = await Promise.all([
      rubricPromise,
      groupPromise
    ]);

    if (!groupResult.success) {
      throw new Error(
        groupResult.error ||
        "Unable to load pupils."
      );
    }

    rubricRows = loadedRubric;

    students =
      groupResult.students.map(
        student => {
          const absent =
            Boolean(
              student.ExistingAbsent
            );

          const originalScore =
            student.ExistingScore !== "" &&
            student.ExistingScore !== null &&
            student.ExistingScore !== undefined
              ? String(student.ExistingScore)
              : "";

          return {
            ...student,

            Score:
              absent
                ? ""
                : originalScore,

            Grade:
              absent
                ? ""
                : student.ExistingGrade || "",

            Absent:
              absent,

            OriginalScore:
              originalScore,

            OriginalAbsent:
              absent,

            HasExistingResult:
              Boolean(
                student.HasExistingResult
              ),

            SaveState:
              student.HasExistingResult
                ? "saved"
                : "blank"
          };
        }
      );

    restoreLocalDraftIfMatching();

    renderStudentRows();
    updateTesterHeader();
    updateProgressCounts();

    hasUnsavedChanges =
      calculateChangedCount() > 0;

    updateSaveBar();
    showStep("scores");

  } catch (error) {
    alert(
      "Unable to load group: " +
      error.message
    );

  } finally {
    hideLoading();
  }
}


async function getRubricForStation(station) {
  if (rubricCache[station]) {
    return rubricCache[station];
  }

  const result =
    await callBackend({
      action: "getStationRubric",
      station: station
    });

  if (!result.success) {
    throw new Error(
      result.error ||
      "Unable to load rubric."
    );
  }

  const rows =
    Array.isArray(result.rubric)
      ? result.rubric
      : [];

  rubricCache[station] = rows;

  return rows;
}


/* =====================================================
   PUPIL ROWS
===================================================== */

function renderStudentRows() {
  const container =
    document.getElementById(
      "studentList"
    );

  container.innerHTML = "";

  students.forEach(
    (student, index) => {
      const row =
        document.createElement("div");

      row.id =
        `student-row-${safeId(student.ID)}`;

      row.className =
        "student-row " +
        rowStateClass(student);

      const inputMode =
        currentContext.station ===
          "Shuttle Run"
          ? "decimal"
          : "numeric";

      const step =
        currentContext.station ===
          "Shuttle Run"
          ? "0.1"
          : "1";

      row.innerHTML = `
        <div class="student-main">
          <div class="register-number">
            ${escapeHtml(student.No)}
          </div>

          <div class="student-name">
            ${escapeHtml(student.Name)}
          </div>

          <div class="score-wrap">
            <input
              id="score-${safeId(student.ID)}"
              class="score-input"
              type="number"
              inputmode="${inputMode}"
              enterkeyhint="next"
              step="${step}"
              value="${escapeAttribute(student.Score)}"
              placeholder="Score"
              ${student.Absent ? "disabled" : ""}
              oninput="handleScoreInput(${index}, this.value)"
              onkeydown="handleScoreKeyDown(event, ${index})"
              onfocus="this.select()"
            >

            <div class="unit-label">
              ${escapeHtml(getStationUnit())}
            </div>
          </div>

          <div
            id="grade-${safeId(student.ID)}"
            class="grade-badge ${gradeClass(student.Grade)}"
          >
            ${
              student.Absent
                ? "—"
                : escapeHtml(student.Grade || "—")
            }
          </div>
        </div>

        <div class="student-lower">
          <div
            id="status-${safeId(student.ID)}"
            class="row-status"
          >
            ${escapeHtml(rowStatusText(student))}
          </div>

          <label class="absence-control">
            <input
              id="absent-${safeId(student.ID)}"
              type="checkbox"
              ${student.Absent ? "checked" : ""}
              onchange="handleAbsentChange(${index}, this.checked)"
            >

            <span>Absent</span>
          </label>
        </div>
      `;

      container.appendChild(row);
    }
  );
}


function handleScoreInput(index, value) {
  const student = students[index];

  if (student.Absent) {
    return;
  }

  student.Score = value;

  if (value === "") {
    student.Grade = "";
  } else {
    const numericScore =
      Number(value);

    student.Grade =
      Number.isNaN(numericScore)
        ? ""
        : calculateGradePreview(
            currentContext.station,
            student.Gender,
            student.AgeUsed,
            numericScore
          );
  }

  student.SaveState =
    isStudentChanged(student)
      ? "edited"
      : student.HasExistingResult
        ? "saved"
        : "blank";

  refreshStudentRow(student);
  markDraftChanged();
}


function handleScoreKeyDown(event, index) {
  if (
    event.key !== "Enter" &&
    event.key !== "Next"
  ) {
    return;
  }

  event.preventDefault();

  focusNextAvailableScore(index);
}


function focusNextAvailableScore(currentIndex) {
  for (
    let index = currentIndex + 1;
    index < students.length;
    index++
  ) {
    if (students[index].Absent) {
      continue;
    }

    const input =
      document.getElementById(
        `score-${safeId(
          students[index].ID
        )}`
      );

    if (input) {
      input.focus();
      input.select();
      return;
    }
  }
}


function handleAbsentChange(index, checked) {
  const student = students[index];

  const checkbox =
    document.getElementById(
      `absent-${safeId(student.ID)}`
    );

  if (checked) {
    const confirmed = confirm(
      `Mark ${student.Name} as absent?`
    );

    if (!confirmed) {
      if (checkbox) {
        checkbox.checked = false;
      }

      return;
    }

    student.Absent = true;
    student.Score = "";
    student.Grade = "";
    student.SaveState = "edited";

  } else {
    const confirmed = confirm(
      `Remove absent status for ${student.Name}?`
    );

    if (!confirmed) {
      if (checkbox) {
        checkbox.checked = true;
      }

      return;
    }

    student.Absent = false;

    student.SaveState =
      isStudentChanged(student)
        ? "edited"
        : student.HasExistingResult
          ? "saved"
          : "blank";
  }

  refreshStudentRow(student);
  markDraftChanged();
}


function refreshStudentRow(student) {
  const id =
    safeId(student.ID);

  const row =
    document.getElementById(
      `student-row-${id}`
    );

  const scoreInput =
    document.getElementById(
      `score-${id}`
    );

  const grade =
    document.getElementById(
      `grade-${id}`
    );

  const status =
    document.getElementById(
      `status-${id}`
    );

  const checkbox =
    document.getElementById(
      `absent-${id}`
    );

  if (row) {
    row.className =
      "student-row " +
      rowStateClass(student);
  }

  if (scoreInput) {
    scoreInput.disabled =
      student.Absent;

    scoreInput.value =
      student.Score;
  }

  if (grade) {
    grade.className =
      "grade-badge " +
      gradeClass(student.Grade);

    grade.textContent =
      student.Absent
        ? "—"
        : student.Grade || "—";
  }

  if (status) {
    status.textContent =
      rowStatusText(student);
  }

  if (checkbox) {
    checkbox.checked =
      student.Absent;
  }

  updateProgressCounts();
  updateSaveBar();
}


function rowStateClass(student) {
  if (student.SaveState === "failed") {
    return "failed";
  }

  if (student.Absent) {
    return "absent";
  }

  if (student.SaveState === "edited") {
    return "edited";
  }

  if (
    student.Score !== "" &&
    student.Grade
  ) {
    return "complete";
  }

  return "";
}


function rowStatusText(student) {
  if (student.SaveState === "saving") {
    return "Saving...";
  }

  if (student.SaveState === "failed") {
    return "Save failed";
  }

  if (student.Absent) {
    return student.SaveState === "edited"
      ? "Absent — unsaved"
      : "Absent";
  }

  if (student.SaveState === "saved") {
    return "Saved";
  }

  if (student.SaveState === "edited") {
    return student.HasExistingResult
      ? "Existing result changed"
      : "Unsaved";
  }

  return "";
}


/* =====================================================
   GRADE PREVIEW
===================================================== */

function calculateGradePreview(
  station,
  gender,
  age,
  score
) {
  const matchingRows =
    rubricRows.filter(row => {
      return (
        normaliseText(row.Station) ===
          normaliseText(station) &&
        normaliseGender(row.Gender) ===
          normaliseGender(gender) &&
        Number(row.Age) ===
          Number(age)
      );
    });

  const gradeOrder =
    ["A", "B", "C", "D", "E", "F"];

  for (const grade of gradeOrder) {
    const row =
      matchingRows.find(item => {
        return (
          String(item.Grade || "")
            .trim()
            .toUpperCase() === grade
        );
      });

    if (!row) {
      continue;
    }

    const hasMin =
      row.Min !== "" &&
      row.Min !== null &&
      row.Min !== undefined;

    const hasMax =
      row.Max !== "" &&
      row.Max !== null &&
      row.Max !== undefined;

    const min = Number(row.Min);
    const max = Number(row.Max);

    if (
      hasMin &&
      hasMax &&
      score >= min &&
      score <= max
    ) {
      return grade;
    }

    if (
      hasMin &&
      !hasMax &&
      score >= min
    ) {
      return grade;
    }

    if (
      !hasMin &&
      hasMax &&
      score <= max
    ) {
      return grade;
    }
  }

  return "F";
}


function normaliseGender(value) {
  const text =
    String(value || "")
      .trim()
      .toUpperCase();

  if (
    text === "F" ||
    text === "FEMALE"
  ) {
    return "F";
  }

  if (
    text === "M" ||
    text === "MALE"
  ) {
    return "M";
  }

  return text;
}


function normaliseText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}


/* =====================================================
   SAVE
===================================================== */

async function saveGroupResults() {
  const completedStudents =
    students.filter(student => {
      return (
        student.Absent ||
        student.Score !== ""
      );
    });

  if (completedStudents.length === 0) {
    alert(
      "No scores or absent pupils have been recorded."
    );

    return;
  }

  const missing =
    students.filter(student => {
      return (
        !student.Absent &&
        student.Score === ""
      );
    });

  if (missing.length > 0) {
    const proceed = confirm(
      `${missing.length} pupil(s) have no score. Save the completed pupils only?`
    );

    if (!proceed) {
      return;
    }
  }

  const changedStudents =
    completedStudents.filter(
      isStudentChanged
    );

  if (changedStudents.length === 0) {
    alert(
      "There are no new or changed results to save."
    );

    return;
  }

  const invalidStudent =
    changedStudents.find(student => {
      return (
        !student.Absent &&
        !isScoreValid(
          currentContext.station,
          student.Score
        )
      );
    });

  if (invalidStudent) {
    alert(
      `Check the score for ${invalidStudent.Name}.`
    );

    const input =
      document.getElementById(
        `score-${safeId(invalidStudent.ID)}`
      );

    if (input) {
      input.focus();
    }

    return;
  }

  changedStudents.forEach(student => {
    student.SaveState = "saving";
    refreshStudentRow(student);
  });

  hasUnsavedChanges = true;
  saveInProgress = true;

  saveLocalDraft();
  updateSaveBar();

  showLoading(
    "Saving group results..."
  );

  try {
    const result =
      await callBackend({
        action:
          "saveStationResultsBatch",

        sessionId:
          currentContext.sessionId,

        testDate:
          currentContext.testDate,

        className:
          currentContext.className,

        groupName:
          currentContext.groupName,

        station:
          currentContext.station,

        tester:
          currentContext.tester,

        results:
          changedStudents.map(student => ({
            ID: student.ID,

            score:
              student.Absent
                ? ""
                : Number(student.Score),

            absent:
              Boolean(student.Absent)
          }))
      });

    if (!result.success) {
      throw new Error(
        result.error ||
        "Unable to save results."
      );
    }

    const returnedById =
      new Map(
        result.results.map(item => [
          String(item.ID),
          item
        ])
      );

    changedStudents.forEach(student => {
      const returned =
        returnedById.get(
          String(student.ID)
        );

      if (returned) {
        student.Absent =
          Boolean(returned.Absent);

        student.Score =
          student.Absent
            ? ""
            : String(returned.Score);

        student.Grade =
          student.Absent
            ? ""
            : returned.Grade || "";

        student.SaveState = "saved";
        student.HasExistingResult = true;

        student.OriginalScore =
          student.Score;

        student.OriginalAbsent =
          student.Absent;
      }

      refreshStudentRow(student);
    });

    hasUnsavedChanges = false;
    clearLocalDraft();

    renderReviewTable(result);
    showStep("review");

  } catch (error) {
    changedStudents.forEach(student => {
      student.SaveState = "failed";
      refreshStudentRow(student);
    });

    hasUnsavedChanges = true;
    saveLocalDraft();

    alert(
      "Unable to save results: " +
      error.message
    );

  } finally {
    saveInProgress = false;
    hideLoading();
    updateSaveBar();
  }
}


/* =====================================================
   REVIEW
===================================================== */

function renderReviewTable(saveResult) {
  const tbody =
    document.getElementById(
      "reviewBody"
    );

  tbody.innerHTML = "";

  const completedStudents =
    students
      .filter(student => {
        return (
          student.Absent ||
          student.Score !== ""
        );
      })
      .sort((a, b) => {
        return Number(a.No) - Number(b.No);
      });

  completedStudents.forEach(student => {
    const row =
      document.createElement("tr");

    row.innerHTML = `
      <td>${escapeHtml(student.No)}</td>
      <td>${escapeHtml(student.Name)}</td>

      <td>
        ${
          student.Absent
            ? "—"
            : escapeHtml(student.Score)
        }
      </td>

      <td>
        ${
          student.Absent
            ? "—"
            : escapeHtml(student.Grade)
        }
      </td>

      <td>
        ${
          student.Absent
            ? "Absent"
            : "Completed"
        }
      </td>
    `;

    tbody.appendChild(row);
  });

  setText(
    "reviewMessage",
    `${saveResult.totalSaved} result(s) saved. ` +
    `${saveResult.created} created and ` +
    `${saveResult.updated} updated.`
  );
}


function returnToScores() {
  showStep("scores");
}


function testNextGroup() {
  if (hasUnsavedChanges) {
    const proceed = confirm(
      "Unsaved changes remain. Leave this group?"
    );

    if (!proceed) {
      return;
    }
  }

  students = [];
  rubricRows = [];
  currentContext = null;

  hasUnsavedChanges = false;
  saveInProgress = false;

  clearLocalDraft();
  clearElement("studentList");
  clearElement("reviewBody");

  document.getElementById(
    "groupSelect"
  ).value = "";

  showStep("setup");

  setText(
    "setupMessage",
    "Select the next group. Station, tester, date, level and class have been kept."
  );
}


function changeStation() {
  if (hasUnsavedChanges) {
    const proceed = confirm(
      "Unsaved changes remain. Change station?"
    );

    if (!proceed) {
      return;
    }
  }

  students = [];
  rubricRows = [];
  currentContext = null;

  hasUnsavedChanges = false;
  saveInProgress = false;

  clearLocalDraft();
  clearElement("studentList");
  clearElement("reviewBody");

  document.getElementById(
    "stationSelect"
  ).value = "";

  document.getElementById(
    "groupSelect"
  ).value = "";

  showStep("setup");

  setText(
    "setupMessage",
    "Select a new station and group."
  );
}


/* =====================================================
   LOCAL DRAFT
===================================================== */

function markDraftChanged() {
  hasUnsavedChanges =
    calculateChangedCount() > 0;

  saveLocalDraft();
  updateProgressCounts();
  updateSaveBar();
}


function saveLocalDraft() {
  if (!currentContext) {
    return;
  }

  const draft = {
    context:
      currentContext,

    students:
      students.map(student => ({
        ID: student.ID,
        Score: student.Score,
        Absent: student.Absent
      }))
  };

  localStorage.setItem(
    LOCAL_DRAFT_KEY,
    JSON.stringify(draft)
  );
}


function restoreLocalDraftIfMatching() {
  const raw =
    localStorage.getItem(
      LOCAL_DRAFT_KEY
    );

  if (!raw) {
    return;
  }

  try {
    const draft =
      JSON.parse(raw);

    if (
      !draft.context ||
      draft.context.testDate !==
        currentContext.testDate ||
      draft.context.className !==
        currentContext.className ||
      draft.context.groupName !==
        currentContext.groupName ||
      draft.context.station !==
        currentContext.station
    ) {
      return;
    }

    const restore = confirm(
      "Unsaved scores were found for this group and station. Restore them?"
    );

    if (!restore) {
      clearLocalDraft();
      return;
    }

    const draftById =
      new Map(
        draft.students.map(item => [
          String(item.ID),
          item
        ])
      );

    students.forEach(student => {
      const saved =
        draftById.get(
          String(student.ID)
        );

      if (!saved) {
        return;
      }

      student.Absent =
        Boolean(saved.Absent);

      student.Score =
        student.Absent
          ? ""
          : String(saved.Score || "");

      if (
        !student.Absent &&
        student.Score !== ""
      ) {
        student.Grade =
          calculateGradePreview(
            currentContext.station,
            student.Gender,
            student.AgeUsed,
            Number(student.Score)
          );
      } else {
        student.Grade = "";
      }

      student.SaveState =
        isStudentChanged(student)
          ? "edited"
          : student.HasExistingResult
            ? "saved"
            : "blank";
    });

  } catch (error) {
    clearLocalDraft();
  }
}


function clearLocalDraft() {
  localStorage.removeItem(
    LOCAL_DRAFT_KEY
  );
}


/* =====================================================
   COUNTS AND UI
===================================================== */

function updateTesterHeader() {
  setText(
    "testerTitle",
    `${currentContext.station} — ${currentContext.groupName}`
  );

  setText(
    "testerSubtitle",
    `${currentContext.className} | ` +
    `${currentContext.testDate} | ` +
    `Tester: ${currentContext.tester}`
  );
}


function updateProgressCounts() {
  const entered =
    students.filter(student => {
      return (
        !student.Absent &&
        student.Score !== ""
      );
    }).length;

  const absent =
    students.filter(student => {
      return student.Absent;
    }).length;

  const missing =
    students.filter(student => {
      return (
        !student.Absent &&
        student.Score === ""
      );
    }).length;

  setText("enteredCount", entered);
  setText("absentCount", absent);
  setText("missingCount", missing);
}


function updateSaveBar() {
  const changed =
    calculateChangedCount();

  if (saveInProgress) {
    setText(
      "saveBarMessage",
      "Saving results. Do not close the page."
    );

    return;
  }

  if (changed === 0) {
    setText(
      "saveBarMessage",
      "No unsaved changes"
    );

    return;
  }

  setText(
    "saveBarMessage",
    `${changed} unsaved result(s)`
  );
}


function calculateChangedCount() {
  return students.filter(
    isStudentChanged
  ).length;
}


function isStudentChanged(student) {
  return (
    String(student.Score || "") !==
      String(student.OriginalScore || "") ||
    Boolean(student.Absent) !==
      Boolean(student.OriginalAbsent)
  );
}


function showStep(step) {
  const setup =
    document.getElementById(
      "stepSetup"
    );

  const scores =
    document.getElementById(
      "stepScores"
    );

  const review =
    document.getElementById(
      "stepReview"
    );

  setup.classList.add("hidden");
  scores.classList.add("hidden");
  review.classList.add("hidden");

  const progressSetup =
    document.getElementById(
      "progressSetup"
    );

  const progressScores =
    document.getElementById(
      "progressScores"
    );

  const progressReview =
    document.getElementById(
      "progressReview"
    );

  [
    progressSetup,
    progressScores,
    progressReview
  ].forEach(item => {
    item.classList.remove(
      "active",
      "done"
    );
  });

  if (step === "setup") {
    setup.classList.remove("hidden");
    progressSetup.classList.add("active");
  }

  if (step === "scores") {
    scores.classList.remove("hidden");

    progressSetup.classList.add("done");
    progressScores.classList.add("active");
  }

  if (step === "review") {
    review.classList.remove("hidden");

    progressSetup.classList.add("done");
    progressScores.classList.add("done");
    progressReview.classList.add("active");
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/* =====================================================
   VALIDATION
===================================================== */

function isScoreValid(station, rawScore) {
  if (
    rawScore === "" ||
    rawScore === null ||
    rawScore === undefined
  ) {
    return false;
  }

  const score = Number(rawScore);

  if (Number.isNaN(score)) {
    return false;
  }

  const ranges = {
    "Sit-ups": {
      min: 0,
      max: 100,
      wholeNumber: true
    },

    "Standing Broad Jump": {
      min: 0,
      max: 400,
      wholeNumber: true
    },

    "Sit and Reach": {
      min: -50,
      max: 100,
      wholeNumber: true
    },

    "Inclined Pull-up": {
      min: 0,
      max: 100,
      wholeNumber: true
    },

    "Shuttle Run": {
      min: 5,
      max: 60,
      wholeNumber: false
    }
  };

  const range = ranges[station];

  if (!range) {
    return false;
  }

  if (
    score < range.min ||
    score > range.max
  ) {
    return false;
  }

  if (
    range.wholeNumber &&
    !Number.isInteger(score)
  ) {
    return false;
  }

  return true;
}


function getStationUnit() {
  const row =
    rubricRows.find(item => {
      return (
        normaliseText(item.Station) ===
        normaliseText(
          currentContext.station
        )
      );
    });

  if (row && row.Unit) {
    return row.Unit;
  }

  if (
    currentContext.station ===
    "Shuttle Run"
  ) {
    return "sec";
  }

  if (
    currentContext.station ===
      "Standing Broad Jump" ||
    currentContext.station ===
      "Sit and Reach"
  ) {
    return "cm";
  }

  return "reps";
}


/* =====================================================
   HELPERS
===================================================== */

function gradeClass(grade) {
  const normalised =
    String(grade || "")
      .trim()
      .toLowerCase();

  return normalised
    ? `grade-${normalised}`
    : "";
}


function safeId(value) {
  return String(value || "")
    .replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );
}


function setText(id, value) {
  const element =
    document.getElementById(id);

  if (element) {
    element.textContent =
      String(value ?? "");
  }
}


function clearElement(id) {
  const element =
    document.getElementById(id);

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
