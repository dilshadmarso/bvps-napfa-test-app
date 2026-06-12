const GOOGLE_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyjiK1MWx30tV0wxZsTf5k5OLaGbQsvbCNacuBO8Ypa7lNTDMK46BRZY0T3Vn3dgP3X/exec";

const DOWNLOADED_BY_KEY =
  "BVPS_NAPFA_DOWNLOADED_BY";

const COCKPIT_HEADERS = [
  "No",
  "Name",
  "ID",
  "Class",
  "Gender",
  "DOB",
  "Attendance Status",
  "Sit Up reps xx",
  "Broad Jump cm xxx",
  "Sit& Reach cm xx",
  "IPU/Pull-up reps xx",
  "Shuttle Run sec xx.x",
  "1.6/2.4 Km Run MMSS",
  "PFT Test Date(DD/MM/YYYY)",
  "*END*"
];

const COCKPIT_INSTRUCTIONS = [
  "Instruction:",
  "1. Please do not delete any Rows or columns. You can upload the partially filled data.",
  "     The system will validate and if there are any errors the system will promot and will automatically update the records without error.",
  "2. When the downloaded file is re-uploaded existing values will be replaced with the new values.",
  "3. Attendance status should be one of the following values (P/A/L/O/H/E)",
  "     P - Present",
  "     A - Absent",
  "     L - Long Term MC",
  "     O - Short Term MC",
  "     E - Special Case",
  "     H - Pending appointment Student Health Services",
  "4. Please save your updated file in CSV(Comma delimited) format only.",
  "5.  The value of Sit Up reps should be numeric and it can be up to 2 digits. ",
  "6.  The value of Broad Jump should be numeric and it can be up to 3 digits. ",
  "7.  The value of Sit& Reach should be numeric and it can be up to 2 digits. ",
  "8.  The value of IPU/Push-up reps should be numeric and it can be up to 2 digits. (Applicable for PRE-U) ",
  "9.  The value of IPU/Pull-up reps should be numeric and it can be up to 2 digits. ",
  "10. The value of Shuttle Run time should be numeric and it has to be either 2 or 3 digits with 1 decimal place allowed",
  "11. The value of 1.6/2.4 km Run should be numeric and it has to be either 3 or 4 digits e.g. 10 Minutes and 45 seconds will be entered as 1045",
  "     another example 9 minute 45 seconds will be entered as 945 "
];

let setupData = {
  levels: [],
  classesByLevel: {},
  testDates: []
};

let previewRows = [];
let currentContext = null;

window.addEventListener(
  "load",
  initialisePage
);


async function initialisePage() {
  restoreDownloadedBy();
  await loadSetupData();
}


function restoreDownloadedBy() {
  const saved =
    localStorage.getItem(
      DOWNLOADED_BY_KEY
    );

  if (saved) {
    document.getElementById(
      "downloadedBy"
    ).value = saved;
  }
}


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


async function callBackend(payload) {
  const response = await fetch(
    GOOGLE_APPS_SCRIPT_URL,
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      "Backend returned an invalid response."
    );
  }
}


async function loadSetupData() {
  showLoading("Loading options...");

  try {
    const result = await callBackend({
      action: "getResultsSetupData"
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

      testDates:
        Array.isArray(result.testDates)
          ? result.testDates
          : []
    };

    populateDates();
    populateLevels();

    setText(
      "setupMessage",
      "Select the class results to export."
    );

  } catch (error) {
    setText(
      "setupMessage",
      "Failed to load options: " +
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

  const select =
    document.getElementById(
      "classSelect"
    );

  select.innerHTML =
    `<option value="">Select class</option>`;

  const classes =
    setupData.classesByLevel[level] || [];

  classes.forEach(className => {
    const option =
      document.createElement("option");

    option.value = className;
    option.textContent = className;

    select.appendChild(option);
  });
}


async function loadCockpitPreview() {
  const downloadedBy =
    document.getElementById(
      "downloadedBy"
    ).value.trim();

  const testDate =
    document.getElementById(
      "testDateSelect"
    ).value;

  const className =
    document.getElementById(
      "classSelect"
    ).value;

  if (!downloadedBy) {
    alert("Please enter your name.");
    return;
  }

  if (!testDate || !className) {
    alert(
      "Please select a date, level and class."
    );
    return;
  }

  localStorage.setItem(
    DOWNLOADED_BY_KEY,
    downloadedBy
  );

  currentContext = {
    downloadedBy,
    testDate,
    className
  };

  showLoading("Preparing preview...");

  try {
    const result = await callBackend({
      action: "getCockpitExportPreview",
      className,
      testDate
    });

    if (!result.success) {
      throw new Error(
        result.error ||
        "Unable to prepare export."
      );
    }

    previewRows =
      (result.rows || []).map(row => ({
        ...row,
        AttendanceStatus:
          row.AttendanceStatus || ""
      }));

    renderPreview();

    document.getElementById(
      "previewPanel"
    ).classList.remove("hidden");

    window.scrollTo({
      top:
        document.getElementById(
          "previewPanel"
        ).offsetTop,
      behavior: "smooth"
    });

  } catch (error) {
    alert(
      "Unable to load preview: " +
      error.message
    );

  } finally {
    hideLoading();
  }
}


function renderPreview() {
  const tbody =
    document.getElementById(
      "previewBody"
    );

  tbody.innerHTML = "";

  previewRows.forEach((row, index) => {
    const tr =
      document.createElement("tr");

    tr.className =
      row.IsComplete
        ? "row-complete"
        : "row-incomplete";

    tr.innerHTML = `
      <td>${escapeHtml(row.No)}</td>

      <td>
        <strong>${escapeHtml(row.Name)}</strong>
      </td>

      <td>
        ${renderAttendanceControl(row, index)}
      </td>

      <td>${escapeHtml(row.SitUps)}</td>
      <td>${escapeHtml(row.BroadJump)}</td>
      <td>${escapeHtml(row.SitAndReach)}</td>
      <td>${escapeHtml(row.InclinedPullUp)}</td>
      <td>${escapeHtml(row.ShuttleRun)}</td>
      <td>${escapeHtml(row.RunMmss)}</td>

      <td>
        ${renderMissingDetails(row)}
      </td>
    `;

    tbody.appendChild(tr);
  });

  updatePreviewCounts();
}


function renderAttendanceControl(row, index) {
  if (row.IsComplete) {
    return `
      <strong>P</strong>
    `;
  }

  return `
    <select
      class="attendance-select"
      onchange="updateAttendance(${index}, this.value)"
    >
      <option value="">Select code</option>
      <option value="A" ${row.AttendanceStatus === "A" ? "selected" : ""}>
        A — Absent
      </option>
      <option value="L" ${row.AttendanceStatus === "L" ? "selected" : ""}>
        L — Long Term MC
      </option>
      <option value="O" ${row.AttendanceStatus === "O" ? "selected" : ""}>
        O — Short Term MC
      </option>
      <option value="H" ${row.AttendanceStatus === "H" ? "selected" : ""}>
        H — Pending SHS
      </option>
      <option value="E" ${row.AttendanceStatus === "E" ? "selected" : ""}>
        E — Special Case
      </option>
      <option value="P" ${row.AttendanceStatus === "P" ? "selected" : ""}>
        P — Present
      </option>
    </select>
  `;
}


function updateAttendance(index, value) {
  previewRows[index].AttendanceStatus =
    value;

  updatePreviewCounts();
}


function renderMissingDetails(row) {
  const parts = [];

  if (
    Array.isArray(row.MissingStations) &&
    row.MissingStations.length > 0
  ) {
    parts.push(
      "Missing: " +
      row.MissingStations.join(", ")
    );
  }

  if (
    Array.isArray(row.IncompleteStations) &&
    row.IncompleteStations.length > 0
  ) {
    parts.push(
      "Incomplete: " +
      row.IncompleteStations.join(", ")
    );
  }

  if (parts.length === 0) {
    return "Complete";
  }

  return `
    <div class="missing-text">
      ${escapeHtml(parts.join(" | "))}
    </div>
  `;
}


function updatePreviewCounts() {
  const complete =
    previewRows.filter(row => {
      return row.IsComplete;
    }).length;

  const unresolved =
    previewRows.filter(row => {
      return (
        !row.IsComplete &&
        !row.AttendanceStatus
      );
    }).length;

  setText(
    "totalCount",
    previewRows.length
  );

  setText(
    "completeCount",
    complete
  );

  setText(
    "unresolvedCount",
    unresolved
  );

  setText(
    "previewMessage",
    unresolved > 0
      ? `${unresolved} pupil(s) still require an attendance code.`
      : "All attendance codes are ready."
  );

  document.getElementById(
    "downloadButton"
  ).disabled =
    unresolved > 0;
}


async function downloadCockpitCsv() {
  if (!currentContext) {
    return;
  }

  const unresolved =
    previewRows.filter(row => {
      return !row.AttendanceStatus;
    });

  if (unresolved.length > 0) {
    alert(
      `${unresolved.length} pupil(s) still need an attendance code.`
    );
    return;
  }

  const csvRows = [];

  COCKPIT_INSTRUCTIONS.forEach(text => {
    const row =
      new Array(15).fill("");

    row[0] = text;
    row[14] = "*END*";

    csvRows.push(row);
  });

  csvRows.push(COCKPIT_HEADERS);

  previewRows.forEach(row => {
    csvRows.push([
      row.No,
      row.Name,
      row.ID,
      row.Class,
      row.Gender,
      row.DOB,
      row.AttendanceStatus,
      row.SitUps,
      row.BroadJump,
      row.SitAndReach,
      row.InclinedPullUp,
      row.ShuttleRun,
      row.RunMmss,
      row.TestDate,
      "*END*"
    ]);
  });

  const csvText =
    "\uFEFF" +
    csvRows
      .map(csvRowToText)
      .join("\r\n");

  const fileName =
    `${currentContext.className}_PFT_RAW_SCORE_` +
    `${makeTimestamp()}.csv`;

  const blob = new Blob(
    [csvText],
    {
      type: "text/csv;charset=utf-8"
    }
  );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  try {
    await callBackend({
      action: "logCockpitDownload",
      className:
        currentContext.className,
      testDate:
        currentContext.testDate,
      downloadedBy:
        currentContext.downloadedBy,
      rowsDownloaded:
        previewRows.length
    });

    setText(
      "previewMessage",
      `Downloaded ${fileName}`
    );

  } catch (error) {
    setText(
      "previewMessage",
      "CSV downloaded, but the download log could not be saved."
    );
  }
}


function csvRowToText(row) {
  return row
    .map(csvEscape)
    .join(",");
}


function csvEscape(value) {
  const text =
    String(value ?? "");

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return (
      '"' +
      text.replaceAll('"', '""') +
      '"'
    );
  }

  return text;
}


function makeTimestamp() {
  const now = new Date();

  return (
    now.getFullYear() +
    String(now.getMonth() + 1)
      .padStart(2, "0") +
    String(now.getDate())
      .padStart(2, "0") +
    String(now.getHours())
      .padStart(2, "0") +
    String(now.getMinutes())
      .padStart(2, "0") +
    String(now.getSeconds())
      .padStart(2, "0")
  );
}


function formatDisplayDate(dateText) {
  const parts =
    String(dateText || "")
      .split("-");

  if (parts.length !== 3) {
    return dateText;
  }

  return (
    parts[2] +
    "/" +
    parts[1] +
    "/" +
    parts[0]
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
