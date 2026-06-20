const API_URL =
  "https://script.google.com/macros/s/AKfycbyjiK1MWx30tV0wxZsTf5k5OLaGbQsvbCNacuBO8Ypa7lNTDMK46BRZY0T3Vn3dgP3X/exec";

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  els.level = document.getElementById("levelSelect");
  els.className = document.getElementById("classSelect");
  els.loadBtn = document.getElementById("loadResultsBtn");
  els.status = document.getElementById("statusBox");
  els.summary = document.getElementById("summaryBox");
  els.tableWrap = document.getElementById("resultsTableWrap");
  els.resultsBody = document.getElementById("resultsBody");

  els.level.addEventListener("change", handleLevelChange);
  els.loadBtn.addEventListener("click", loadResults);

  loadLevels();
});

function setStatus(message, type = "info") {
  els.status.textContent = message;
  els.status.className = `status ${type}`;
}

function setLoading(isLoading) {
  els.loadBtn.disabled = isLoading;
  els.level.disabled = isLoading;
  els.className.disabled = isLoading || !els.level.value;
  els.loadBtn.textContent = isLoading ? "Loading..." : "View Results";
}

async function fetchApi(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set("action", action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString(), { method: "GET" });
  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`Backend did not return JSON. Response: ${text.slice(0, 150)}`);
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Request failed: ${response.status}`);
  }

  return data;
}

async function loadLevels() {
  try {
    setStatus("Loading levels...");
    setLoading(true);

    const data = await fetchApi("getViewLevels");
    const levels = Array.isArray(data) ? data : data.levels;

    els.level.innerHTML = `<option value="">Select level</option>`;

    levels.forEach(level => {
      const option = document.createElement("option");
      option.value = level;
      option.textContent = level;
      els.level.appendChild(option);
    });

    els.className.innerHTML = `<option value="">Select class</option>`;
    els.className.disabled = true;

    setStatus(
      levels.length ? "Select a level and class." : "No levels found in Student_Master.",
      levels.length ? "info" : "warn"
    );
  } catch (err) {
    console.error(err);
    setStatus(`Unable to load levels: ${err.message}`, "error");
  } finally {
    setLoading(false);
  }
}

async function handleLevelChange() {
  const level = els.level.value;
  clearResults();

  els.className.innerHTML = `<option value="">Select class</option>`;
  els.className.disabled = true;

  if (!level) {
    setStatus("Select a level.");
    return;
  }

  try {
    setStatus("Loading classes...");
    setLoading(true);

    const data = await fetchApi("getViewClasses", { level });
    const classes = Array.isArray(data) ? data : data.classes;

    els.className.innerHTML = `<option value="">Select class</option>`;

    classes.forEach(className => {
      const option = document.createElement("option");
      option.value = className;
      option.textContent = className;
      els.className.appendChild(option);
    });

    els.className.disabled = false;

    setStatus(
      classes.length
        ? "Select a class, then tap View Results."
        : "No classes found for this level.",
      classes.length ? "info" : "warn"
    );
  } catch (err) {
    console.error(err);
    setStatus(`Unable to load classes: ${err.message}`, "error");
  } finally {
    setLoading(false);
  }
}

async function loadResults() {
  const level = els.level.value;
  const className = els.className.value;

  if (!level || !className) {
    setStatus("Please select both level and class.", "warn");
    return;
  }

  try {
    setStatus("Loading results...");
    setLoading(true);
    clearResults();

    const data = await fetchApi("getViewResults", { level, className });
    const students = data.students || [];

    renderSummary(data.summary || {}, students.length);
    renderResults(students);

    setStatus(
      students.length
        ? `Loaded ${students.length} student result(s).`
        : "No saved results found for this class yet.",
      students.length ? "success" : "warn"
    );
  } catch (err) {
    console.error(err);
    setStatus(`Unable to load results: ${err.message}`, "error");
  } finally {
    setLoading(false);
  }
}

function clearResults() {
  els.summary.innerHTML = "";
  els.resultsBody.innerHTML = "";
  els.tableWrap.style.display = "none";
}

function renderSummary(summary, studentCount) {
  const cards = [
    ["Students", studentCount],
    ["Gold", summary.Gold || 0],
    ["Silver", summary.Silver || 0],
    ["Bronze", summary.Bronze || 0],
    ["No Award", summary["No Award"] || 0],
    ["Incomplete", summary.Incomplete || 0]
  ];

  els.summary.innerHTML = cards.map(([label, value]) => `
    <div class="summary-card">
      <div class="summary-value">${escapeHtml(value)}</div>
      <div class="summary-label">${escapeHtml(label)}</div>
    </div>
  `).join("");
}

function renderResults(students) {
  els.resultsBody.innerHTML = students.map(student => `
    <tr>
      <td>${escapeHtml(student.no)}</td>
      <td class="name-cell">${escapeHtml(student.name)}</td>
      <td>${escapeHtml(student.gender)}</td>
      <td>${escapeHtml(student.ageUsed)}</td>
      <td>${formatStation(student.stations["Sit-ups"])}</td>
      <td>${formatStation(student.stations["Standing Broad Jump"])}</td>
      <td>${formatStation(student.stations["Sit and Reach"])}</td>
      <td>${formatStation(student.stations["Inclined Pull-up"])}</td>
      <td>${formatStation(student.stations["Shuttle Run"])}</td>
      <td>${formatStation(student.stations["1.6km Run"])}</td>
      <td>${escapeHtml(student.totalPoints)}</td>
      <td><span class="award ${awardClass(student.award)}">${escapeHtml(student.award)}</span></td>
    </tr>
  `).join("");

  els.tableWrap.style.display = students.length ? "block" : "none";
}

function formatStation(station) {
  if (!station || station.status === "Missing") {
    return `<span class="missing">-</span>`;
  }

  const score = station.score || "-";
  const grade = station.grade || "-";
  const status = station.status && station.status !== "Done" ? ` ${station.status}` : "";

  return `${escapeHtml(score)} <strong>${escapeHtml(grade)}</strong>${escapeHtml(status)}`;
}

function awardClass(award) {
  return String(award || "").toLowerCase().replace(/\s+/g, "-");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
