const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyjiK1MWx30tV0wxZsTf5k5OLaGbQsvbCNacuBO8Ypa7lNTDMK46BRZY0T3Vn3dgP3X/exec";

const LOCAL_DRAFT_KEY =
  "BVPS_NAPFA_STATION_DRAFT_V1";

const STATIONS = [
  "Sit-ups",
  "Standing Broad Jump",
  "Sit and Reach",
  "Inclined Pull-up",
  "Shuttle Run"
];

let students = [];
let rubricRows = [];

let currentContext = null;
let hasUnsavedChanges = false;
let saveInProgress = false;

window.addEventListener("load", initialisePage);


/* =====================================================
   INITIALISATION
===================================================== */

async function initialisePage() {
  setTodayDate();
  installCloseWarning();
  restoreTesterName();

  await loadLevels();
  loadStations();
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
    if (hasUnsavedChanges || saveInProgress) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}


function restoreTesterName() {
  const saved =
    localStorage.getItem(
      "BVPS_NAPFA_TESTER_NAME"
    );

  if (saved) {
    document.getElementById("testerName").value =
      saved;
  }
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
    throw new Error(
      "Backend returned an invalid response."
    );
  }
}


/* =====================================================
   SETUP DROPDOWNS
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

    setText("setupMessage", "Levels loaded.");

  } catch (error) {
    setText(
      "setupMessage",
      "Failed to load levels: " + error.message
    );

  } finally {
    hideLoading();
  }
}


async function loadClasses() {
  const level =
    document.getElementById("levelSelect").value;

  const classSelect =
    document.getElementById("classSelect");

  const groupSelect =
    document.getElementById("groupSelect");

  classSelect.innerHTML =
    `<option value="">Select class</option>`;

  groupSelect.innerHTML =
    `<option value="">Select group</option>`;

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

  } catch (error) {
    setText(
      "setupMessage",
      "Failed to load classes: " + error.message
    );

  } finally {
    hideLoading();
  }
}


async function loadGroups() {
  const className =
    document.getElementById("classSelect").value;

  const groupSelect =
    document.getElementById("groupSelect");

  groupSelect.innerHTML =
    `<option value="">Select group</option>`;

  if (!className) {
    return;
  }

  showLoading("Loading groups...");

  try {
    const result = await callBackend({
      action: "getGroupsByClass",
      className
    });

    if (!result.success) {
      throw new Error(
        result.error || "Unable to load groups."
      );
    }

    const groups =
      result.groups || result.groupNames || [];

    groups.forEach(groupName => {
      const option =
        document.createElement("option");

      option.value = groupName;
      option.textContent = groupName;

      groupSelect.appendChild(option);
    });

  } catch (error) {
    setText(
      "setupMessage",
      "Failed to load groups: " + error.message
    );

  } finally {
    hideLoading();
  }
}


function loadStations() {
  const select =
    document.getElementById("stationSelect");

  select.innerHTML =
    `<option value="">Select station</option>`;

  STATIONS.forEach(station => {
    const option =
      document.createElement("option");

    option.value = station;
    option.textContent = station;

    select.appendChild(option);
  });
}


/* =====================================================
   LOAD TESTER DATA
===================================================== */

async function loadTesterGroup() {
  const tester =
    document.getElementById("testerName").value.trim();

  const testDate =
    document.getElementById("testDate").value;

  const level =
    document.getElementById("levelSelect").value;

  const className =
    document.getElementById("classSelect").value;

  const groupName =
    document.getElementById("groupSelect").value;

  const station =
    document.getElementById("stationSelect").value;

  if (!tester) {
    alert("Please enter the tester name.");
    document.getElementById("testerName").focus();
    return;
  }

  if (
    !testDate ||
    !level ||
    !className ||
    !groupName ||
    !station
  ) {
    alert(
      "Please complete the date, level, class, group and station."
    );
    return;
  }

  localStorage.setItem(
    "BVPS_NAPFA_TESTER_NAME",
    tester
  );

  currentContext = {
    tester,
    testDate,
    level,
    className,
    groupName,
    station,
    sessionId:
      `${className}-${station}-${testDate}`
  };

  showLoading("Loading pupils and rubric...");

  try {
    const [groupResult, rubricResult] =
      await Promise.all([
        callBackend({
          action: "getStationTesterData",
          className,
          groupName,
          station,
          testDate
        }),

        callBackend({
          action: "getStationRubric",
          station
        })
      ]);

    if (!groupResult.success) {
      throw new Error(
        groupResult.error ||
        "Unable to load pupils."
      );
    }

    if (!rubricResult.success) {
      throw new Error(
        rubricResult.error ||
        "Unable to load rubric."
      );
    }

    rubricRows =
      Array.isArray(rubricResult.rubric)
        ? rubricResult.rubric
        : [];

    students =
      groupResult.students.map(student => ({
        ...student,

        Score:
          student.ExistingScore !== "" &&
          student.ExistingScore !== null &&
          student.ExistingScore !== undefined
            ? String(student.ExistingScore)
            : "",

        Grade:
          student.ExistingGrade || "",

        Remarks:
          student.ExistingRemarks || "",

        OriginalScore:
          student.ExistingScore !== "" &&
          student.ExistingScore !== null &&
          student.ExistingScore !== undefined
            ? String(student.ExistingScore)
            : "",

        OriginalRemarks:
          student.ExistingRemarks || "",

        HasExistingResult:
          Boolean(student.HasExistingResult),

        SaveState:
          student.HasExistingResult
            ? "saved"
            : "blank"
      }));

    restoreLocalDraftIfMatching();
    renderStudentCards();
    updateTesterHeader();
    updateProgressCounts();

    hasUnsavedChanges =
      calculateChangedCount() > 0;

    updateSaveBar();

    showStep("scores");

  } catch (error) {
    alert(
      "Unable to load tester data: " +
      error.message
    );

  } finally {
    hideLoading();
  }
}


/* =====================================================
   STUDENT CARDS
===================================================== */

function renderStudentCards() {
  const grid =
    document.getElementById("studentGrid");

  grid.innerHTML = "";

  students.forEach((student, index) => {
    const card =
      document.createElement("div");

    card.className =
      "student-card " +
      cardStateClass(student);

    card.id =
      `student-card-${safeId(student.ID)}`;

    const inputMode =
      currentContext.station === "Shuttle Run"
        ? "decimal"
        : "numeric";

    const stepValue =
      currentContext.station === "Shuttle Run"
        ? "0.1"
        : "1";

    card.innerHTML = `
      <div class="student-top">
        <div class="register-number">
          ${escapeHtml(student.No)}
        </div>

        <div class="student-name">
          ${escapeHtml(student.Name)}
        </div>

        <div
          id="grade-${safeId(student.ID)}"
          class="grade-badge ${gradeClass(student.Grade)}"
        >
          ${escapeHtml(student.Grade || "—")}
        </div>
      </div>

      <div class="score-row">
        <input
          id="score-${safeId(student.ID)}"
          class="score-input"
          type="number"
          inputmode="${inputMode}"
          step="${stepValue}"
          value="${escapeAttribute(student.Score)}"
          placeholder="Score"
          oninput="handleScoreInput(${index}, this.value)"
          onfocus="this.select()"
        >

        <div class="unit-label">
          ${escapeHtml(getStationUnit())}
        </div>
      </div>

      <input
        id="remarks-${safeId(student.ID)}"
        class="remarks-input"
        type="text"
        value="${escapeAttribute(student.Remarks)}"
        placeholder="Remarks (optional)"
        oninput="handleRemarksInput(${index}, this.value)"
      >

      <div
        id="status-${safeId(student.ID)}"
        class="card-status"
      >
        ${escapeHtml(cardStatusText(student))}
      </div>
    `;

    grid.appendChild(card);
  });
}


function handleScoreInput(index, value) {
  const student =
    students[index];

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

  refreshStudentCard(student);
  markDraftChanged();
}


function handleRemarksInput(index, value) {
  const student =
    students[index];

  student.Remarks = value;

  student.SaveState =
    isStudentChanged(student)
      ? "edited"
      : student.HasExistingResult
        ? "saved"
        : "blank";

  refreshStudentCard(student);
  markDraftChanged();
}


function refreshStudentCard(student) {
  const id =
    safeId(student.ID);

  const card =
    document.getElementById(
      `student-card-${id}`
    );

  const grade =
    document.getElementById(
      `grade-${id}`
    );

  const status =
    document.getElementById(
      `status-${id}`
    );

  if (card) {
    card.className =
      "student-card " +
      cardStateClass(student);
  }

  if (grade) {
    grade.className =
      "grade-badge " +
      gradeClass(student.Grade);

    grade.textContent =
      student.Grade || "—";
  }

  if (status) {
    status.textContent =
      cardStatusText(student);
  }

  updateProgressCounts();
  updateSaveBar();
}


function cardStateClass(student) {
  if (student.SaveState === "failed") {
    return "failed";
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


function cardStatusText(student) {
  if (student.SaveState === "saving") {
    return "Saving...";
  }

  if (student.SaveState === "failed") {
    return "Save failed";
  }

  if (student.SaveState === "saved") {
    return "Saved";
  }

  if (student.SaveState === "edited") {
    return student.HasExistingResult
      ? "Existing result changed"
      : "Unsaved";
  }

  return student.HasExistingResult
    ? "Existing result"
    : "";
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
        Number(row.Age) === Number(age)
      );
    });

  const gradeOrder =
    ["A", "B", "C", "D", "E", "F"];

  for (const grade of gradeOrder) {
    const row =
      matchingRows.find(item => {
        return String(item.Grade)
          .trim()
          .toUpperCase() === grade;
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

    const min =
      Number(row.Min);

    const max =
      Number(row.Max);

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
   SAVE GROUP
===================================================== */

async function saveGroupResults() {
  const enteredStudents =
    students.filter(student => {
      return student.Score !== "";
    });

  if (enteredStudents.length === 0) {
    alert("No scores have been entered.");
    return;
  }

  const missing =
    students.filter(student => {
      return student.Score === "";
    });

  if (missing.length > 0) {
    const proceed =
      confirm(
        `${missing.length} pupil(s) have no score. Save the completed pupils only?`
      );

    if (!proceed) {
      return;
    }
  }

  const changedStudents =
    enteredStudents.filter(isStudentChanged);

  if (changedStudents.length === 0) {
    alert("There are no new or changed results to save.");
    return;
  }

  const invalidStudent =
    changedStudents.find(student => {
      return !isScoreValid(
        currentContext.station,
        student.Score
      );
    });

  if (invalidStudent) {
    alert(
      `Check the score for ${invalidStudent.Name}.`
    );

    document
      .getElementById(
        `score-${safeId(invalidStudent.ID)}`
      )
      .focus();

    return;
  }

  changedStudents.forEach(student => {
    student.SaveState = "saving";
    refreshStudentCard(student);
  });

  hasUnsavedChanges = true;
  saveInProgress = true;
  updateSaveBar();

  saveLocalDraft();

  showLoading("Saving group results...");

  try {
    const result =
      await callBackend({
        action: "saveStationResultsBatch",

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
            score: Number(student.Score),
            remarks: student.Remarks || ""
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
        student.Grade =
          returned.Grade || student.Grade;

        student.SaveState = "saved";
        student.HasExistingResult = true;

        student.OriginalScore =
          String(student.Score);

        student.OriginalRemarks =
          student.Remarks || "";
      }

      refreshStudentCard(student);
    });

    hasUnsavedChanges = false;
    clearLocalDraft();

    renderReviewTable(result);
    showStep("review");

  } catch (error) {
    changedStudents.forEach(student => {
      student.SaveState = "failed";
      refreshStudentCard(student);
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
    document.getElementById("reviewBody");

  tbody.innerHTML = "";

  const savedStudents =
    students
      .filter(student => {
        return student.Score !== "";
      })
      .sort((a, b) => {
        return Number(a.No) - Number(b.No);
      });

  savedStudents.forEach(student => {
    const row =
      document.createElement("tr");

    row.innerHTML = `
      <td>${escapeHtml(student.No)}</td>
      <td>${escapeHtml(student.Name)}</td>
      <td>${escapeHtml(student.Score)}</td>
      <td>${escapeHtml(student.Grade)}</td>
      <td>
        ${student.Grade === "F"
          ? "Completed - No Grade"
          : "Completed"}
      </td>
      <td>${escapeHtml(student.Remarks)}</td>
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


function startAnotherGroup() {
  students = [];
  rubricRows = [];
  currentContext = null;

  hasUnsavedChanges = false;
  saveInProgress = false;

  clearLocalDraft();

  document.getElementById("groupSelect").value = "";
  document.getElementById("stationSelect").value = "";

  clearElement("studentGrid");
  clearElement("reviewBody");

  showStep("setup");
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
    context: currentContext,

    students:
      students.map(student => ({
        ID: student.ID,
        Score: student.Score,
        Remarks: student.Remarks
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

    const restore =
      confirm(
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

      student.Score =
        saved.Score || "";

      student.Remarks =
        saved.Remarks || "";

      if (student.Score !== "") {
        student.Grade =
          calculateGradePreview(
            currentContext.station,
            student.Gender,
            student.AgeUsed,
            Number(student.Score)
          );
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
   COUNTS / UI
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
      return student.Score !== "";
    }).length;

  const missing =
    students.length - entered;

  const changed =
    calculateChangedCount();

  setText("enteredCount", entered);
  setText("missingCount", missing);
  setText("changedCount", changed);
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
  return students.filter(isStudentChanged).length;
}


function isStudentChanged(student) {
  return (
    String(student.Score || "") !==
      String(student.OriginalScore || "") ||
    String(student.Remarks || "") !==
      String(student.OriginalRemarks || "")
  );
}


function showStep(step) {
  const setup =
    document.getElementById("stepSetup");

  const scores =
    document.getElementById("stepScores");

  const review =
    document.getElementById("stepReview");

  setup.classList.add("hidden");
  scores.classList.add("hidden");
  review.classList.add("hidden");

  const progressSetup =
    document.getElementById("progressSetup");

  const progressScores =
    document.getElementById("progressScores");

  const progressReview =
    document.getElementById("progressReview");

  [
    progressSetup,
    progressScores,
    progressReview
  ].forEach(item => {
    item.classList.remove("active", "done");
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

  const score =
    Number(rawScore);

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

  const range =
    ranges[station];

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
      return normaliseText(item.Station) ===
        normaliseText(currentContext.station);
    });

  return row && row.Unit
    ? row.Unit
    : currentContext.station === "Shuttle Run"
      ? "sec"
      : currentContext.station ===
          "Standing Broad Jump" ||
        currentContext.station ===
          "Sit and Reach"
        ? "cm"
        : "reps";
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
    .replace(/[^a-zA-Z0-9_-]/g, "_");
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
