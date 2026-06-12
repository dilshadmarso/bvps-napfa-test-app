const GOOGLE_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyjiK1MWx30tV0wxZsTf5k5OLaGbQsvbCNacuBO8Ypa7lNTDMK46BRZY0T3Vn3dgP3X/exec";

const STATION_ORDER = [
  "Sit-ups",
  "Standing Broad Jump",
  "Sit and Reach",
  "Inclined Pull-up",
  "Shuttle Run",
  "1.6km Run"
];

const SHORT_STATION_NAMES = {
  "Sit-ups": "Sit-ups",
  "Standing Broad Jump": "Broad Jump",
  "Sit and Reach": "Sit & Reach",
  "Inclined Pull-up": "Inclined Pull-up",
  "Shuttle Run": "Shuttle Run",
  "1.6km Run": "1.6 km Run"
};

let setupData = {
  levels: [],
  classesByLevel: {},
  testDates: []
};

let allResults = [];
let filteredResults = [];
let currentViewMode =
  window.innerWidth <= 650
    ? "cards"
    : "table";

window.addEventListener("load", initialisePage);


async function initialisePage() {
  await loadResultsSetupData();
  updateViewButtons();
}


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


async function loadResultsSetupData() {
  showLoading("Loading result options...");

  try {
    const result = await callBackend({
      action: "getResultsSetupData"
    });

    if (!result.success) {
      throw new Error(
        result.error ||
        "Unable to load result options."
      );
    }

    setupData = {
      levels:
        Array.isArray(result.levels)
          ? result.levels
          : [],

      classesByLevel:
        result.classesByLevel || {},

      testDates:
        Array.isArray(result.testDates)
          ? result.testDates
          : []
    };

    populateDates();
    populateLevels();

    setText(
      "setupMessage",
      "Select a date, level and class."
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


function populateDates() {
  const select =
    document.getElementById(
      "testDateSelect"
    );

  select.innerHTML =
    `<option value="">Select test date</option>`;

  setupData.testDates.forEach(date => {
    const option =
      document.createElement("option");

    option.value = date;
    option.textContent =
      formatDisplayDate(date);

    select.appendChild(option);
  });

  if (setupData.testDates.length > 0) {
    select.value =
      setupData.testDates[0];
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


function updateClasses() {
  const level =
    document.getElementById(
      "levelSelect"
    ).value;

  const classSelect =
    document.getElementById(
      "classSelect"
    );

  classSelect.innerHTML =
    `<option value="">Select class</option>`;

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


async function loadClassResults() {
  const testDate =
    document.getElementById(
      "testDateSelect"
    ).value;

  const className =
    document.getElementById(
      "classSelect"
    ).value;

  if (!testDate || !className) {
    alert(
      "Please select a test date, level and class."
    );

    return;
  }

  showLoading("Loading class results...");

  try {
    const result = await callBackend({
      action: "getClassResults",
      className: className,
      testDate: testDate
    });

    if (!result.success) {
      throw new Error(
        result.error ||
        "Unable to load class results."
      );
    }

    allResults =
      Array.isArray(result.students)
        ? result.students
        : [];

    filteredResults = [...allResults];

    document
      .getElementById("summaryPanel")
      .classList.remove("hidden");

    document
      .getElementById("resultsPanel")
      .classList.remove("hidden");

    setText(
      "setupMessage",
      `${allResults.length} pupils loaded for ${className}.`
    );

    updateSummary();
    renderResults();

  } catch (error) {
    alert(
      "Unable to load results: " +
      error.message
    );

  } finally {
    hideLoading();
  }
}


function updateSummary() {
  const complete =
    allResults.filter(student => {
      return student.IsComplete;
    }).length;

  const gold =
    allResults.filter(student => {
      return student.Award === "Gold";
    }).length;

  const silver =
    allResults.filter(student => {
      return student.Award === "Silver";
    }).length;

  const bronze =
    allResults.filter(student => {
      return student.Award === "Bronze";
    }).length;

  setText("summaryTotal", allResults.length);
  setText("summaryComplete", complete);
  setText("summaryGold", gold);
  setText("summarySilver", silver);
  setText("summaryBronze", bronze);
}


function applyResultsFilter() {
  const searchText =
    document.getElementById(
      "searchInput"
    ).value
      .trim()
      .toLowerCase();

  const award =
    document.getElementById(
      "awardFilter"
    ).value;

  filteredResults =
    allResults.filter(student => {
      const searchableText =
        `${student.No} ${student.Name} ${student.ID}`
          .toLowerCase();

      const matchesSearch =
        !searchText ||
        searchableText.includes(searchText);

      const matchesAward =
        !award ||
        student.Award === award;

      return (
        matchesSearch &&
        matchesAward
      );
    });

  renderResults();
}


function renderResults() {
  renderTableView();
  renderCardView();

  document
    .getElementById("emptyResults")
    .classList.toggle(
      "hidden",
      filteredResults.length > 0
    );

  updateVisibleView();
}


function renderTableView() {
  const tbody =
    document.getElementById(
      "resultsTableBody"
    );

  tbody.innerHTML = "";

  filteredResults.forEach(student => {
    const row =
      document.createElement("tr");

    const stationCells =
      STATION_ORDER.map(station => {
        return renderTableStationCell(
          student.Stations[station]
        );
      }).join("");

    row.innerHTML = `
      <td>${escapeHtml(student.No)}</td>

      <td>
        <strong>${escapeHtml(student.Name)}</strong>
      </td>

      ${stationCells}

      <td>
        <strong>${escapeHtml(student.TotalPoints)}</strong>
      </td>

      <td>
        ${awardBadgeHtml(student.Award)}
      </td>

      <td>
        ${renderMissingText(student)}
      </td>

      <td>
        <button
          class="btn btn-secondary"
          onclick="toggleTableDetails('${safeId(student.ID)}')"
        >
          View Details
        </button>
      </td>
    `;

    tbody.appendChild(row);

    const detailRow =
      document.createElement("tr");

    detailRow.id =
      `table-details-${safeId(student.ID)}`;

    detailRow.className = "hidden";

    detailRow.innerHTML = `
      <td colspan="12">
        ${renderDetailPanel(student)}
      </td>
    `;

    tbody.appendChild(detailRow);
  });
}


function renderTableStationCell(detail) {
  if (!detail || detail.isMissing) {
    return `
      <td class="station-cell">
        <span class="station-score">—</span>
        <span class="station-grade grade-missing">—</span>
      </td>
    `;
  }

  if (
    detail.status === "Absent" ||
    detail.isIncomplete
  ) {
    return `
      <td class="station-cell">
        <span class="station-score">
          ${escapeHtml(detail.status || "Incomplete")}
        </span>

        <span class="station-grade grade-missing">—</span>
      </td>
    `;
  }

  return `
    <td class="station-cell">
      <span class="station-score">
        ${escapeHtml(detail.displayScore)}
        ${detail.station === "1.6km Run"
          ? ""
          : " " + escapeHtml(detail.unit)}
      </span>

      <span class="station-grade ${gradeClass(detail.grade)}">
        ${escapeHtml(detail.grade || "—")}
      </span>
    </td>
  `;
}


function renderCardView() {
  const container =
    document.getElementById(
      "cardView"
    );

  container.innerHTML = "";

  filteredResults.forEach(student => {
    const card =
      document.createElement("article");

    card.className =
      "student-card" +
      (student.IsComplete
        ? ""
        : " incomplete");

    const stationMiniCards =
      STATION_ORDER.map(station => {
        const detail =
          student.Stations[station];

        return renderStationMini(
          station,
          detail
        );
      }).join("");

    card.innerHTML = `
      <div class="student-card-header">
        <div class="register-number">
          ${escapeHtml(student.No)}
        </div>

        <div>
          <div class="student-name">
            ${escapeHtml(student.Name)}
          </div>

          <div class="student-meta">
            ${escapeHtml(student.Class)}
            · Age ${escapeHtml(student.AgeUsed)}
          </div>
        </div>

        ${awardBadgeHtml(student.Award)}
      </div>

      <div class="station-mini-grid">
        ${stationMiniCards}
      </div>

      <div class="student-card-footer">
        <div class="points-text">
          ${escapeHtml(student.TotalPoints)} points
        </div>

        <button
          class="btn btn-secondary"
          onclick="toggleCardDetails('${safeId(student.ID)}')"
        >
          View Details
        </button>
      </div>

      <div
        id="card-details-${safeId(student.ID)}"
        class="details-panel hidden"
      >
        ${renderDetailPanel(student)}
      </div>
    `;

    container.appendChild(card);
  });
}


function renderStationMini(
  stationName,
  detail
) {
  const displayName =
    SHORT_STATION_NAMES[stationName];

  if (!detail || detail.isMissing) {
    return `
      <div class="station-mini">
        <div class="station-mini-name">
          ${escapeHtml(displayName)}
        </div>

        <div class="station-mini-result">—</div>

        <span class="station-mini-grade grade-missing">
          Missing
        </span>
      </div>
    `;
  }

  if (
    detail.status === "Absent" ||
    detail.isIncomplete
  ) {
    return `
      <div class="station-mini">
        <div class="station-mini-name">
          ${escapeHtml(displayName)}
        </div>

        <div class="station-mini-result">
          ${escapeHtml(detail.status || "Incomplete")}
        </div>

        <span class="station-mini-grade grade-missing">
          —
        </span>
      </div>
    `;
  }

  return `
    <div class="station-mini">
      <div class="station-mini-name">
        ${escapeHtml(displayName)}
      </div>

      <div class="station-mini-result">
        ${escapeHtml(detail.displayScore)}
      </div>

      <span class="station-mini-grade ${gradeClass(detail.grade)}">
        ${escapeHtml(detail.grade)}
      </span>
    </div>
  `;
}


function renderDetailPanel(student) {
  const rows =
    STATION_ORDER.map(stationName => {
      const detail =
        student.Stations[stationName];

      if (!detail) {
        return "";
      }

      const resultText =
        detail.displayScore
          ? detail.displayScore +
            (
              stationName === "1.6km Run"
                ? ""
                : " " + detail.unit
            )
          : detail.status || "Missing";

      const nextGradeText =
        detail.nextGrade
          ? `Next: ${detail.nextGrade}`
          : "";

      return `
        <div class="detail-row">
          <div class="detail-station">
            ${escapeHtml(
              SHORT_STATION_NAMES[stationName]
            )}
          </div>

          <div>
            ${escapeHtml(resultText)}
          </div>

          <div>
            ${escapeHtml(detail.grade || "—")}
          </div>

          <div class="detail-improvement">
            ${
              detail.improvementText
                ? escapeHtml(
                    `${nextGradeText}${
                      nextGradeText ? " — " : ""
                    }${detail.improvementText}`
                  )
                : "—"
            }
          </div>
        </div>
      `;
    }).join("");

  const missingText =
    renderMissingText(student);

  return `
    <div>
      ${rows}

      <div style="margin-top:10px;">
        <strong>Total:</strong>
        ${escapeHtml(student.TotalPoints)} points
        ·
        <strong>Award:</strong>
        ${escapeHtml(student.Award)}
      </div>

      ${
        student.IsComplete
          ? ""
          : `
            <div class="missing-text" style="margin-top:8px;">
              ${missingText}
            </div>
          `
      }
    </div>
  `;
}


function renderMissingText(student) {
  const missing =
    Array.isArray(student.MissingStations)
      ? student.MissingStations
      : [];

  const incomplete =
    Array.isArray(student.IncompleteStations)
      ? student.IncompleteStations
      : [];

  const parts = [];

  if (missing.length > 0) {
    parts.push(
      "Missing: " +
      missing.map(station => {
        return SHORT_STATION_NAMES[station] || station;
      }).join(", ")
    );
  }

  const incompleteOnly =
    incomplete.filter(station => {
      return !missing.includes(station);
    });

  if (incompleteOnly.length > 0) {
    parts.push(
      "Incomplete: " +
      incompleteOnly.map(station => {
        return SHORT_STATION_NAMES[station] || station;
      }).join(", ")
    );
  }

  if (parts.length === 0) {
    return "Complete";
  }

  return `
    <span class="missing-text">
      ${escapeHtml(parts.join(" | "))}
    </span>
  `;
}


function toggleTableDetails(studentId) {
  const row =
    document.getElementById(
      `table-details-${studentId}`
    );

  if (row) {
    row.classList.toggle("hidden");
  }
}


function toggleCardDetails(studentId) {
  const panel =
    document.getElementById(
      `card-details-${studentId}`
    );

  if (panel) {
    panel.classList.toggle("hidden");
  }
}


function setViewMode(mode) {
  currentViewMode = mode;
  updateViewButtons();
  updateVisibleView();
}


function updateViewButtons() {
  const tableButton =
    document.getElementById(
      "tableViewButton"
    );

  const cardButton =
    document.getElementById(
      "cardViewButton"
    );

  if (!tableButton || !cardButton) {
    return;
  }

  tableButton.classList.toggle(
    "active",
    currentViewMode === "table"
  );

  cardButton.classList.toggle(
    "active",
    currentViewMode === "cards"
  );
}


function updateVisibleView() {
  const tableView =
    document.getElementById(
      "tableView"
    );

  const cardView =
    document.getElementById(
      "cardView"
    );

  if (window.innerWidth <= 650) {
    tableView.classList.add("hidden");
    cardView.classList.remove("hidden");
    return;
  }

  tableView.classList.toggle(
    "hidden",
    currentViewMode !== "table"
  );

  cardView.classList.toggle(
    "hidden",
    currentViewMode !== "cards"
  );
}


function awardBadgeHtml(award) {
  return `
    <span class="award-badge ${awardClass(award)}">
      ${escapeHtml(award || "No Award")}
    </span>
  `;
}


function awardClass(award) {
  if (award === "Gold") {
    return "award-gold";
  }

  if (award === "Silver") {
    return "award-silver";
  }

  if (award === "Bronze") {
    return "award-bronze";
  }

  return "award-none";
}


function gradeClass(grade) {
  const value =
    String(grade || "")
      .trim()
      .toLowerCase();

  if (!value) {
    return "grade-missing";
  }

  return `grade-${value}`;
}


function formatDisplayDate(dateText) {
  const parts =
    String(dateText || "").split("-");

  if (parts.length !== 3) {
    return dateText;
  }

  return `${Number(parts[2])}/${Number(parts[1])}/${parts[0]}`;
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


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
