async function apiGet(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set("action", action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const res = await fetch(url.toString());
  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error("Backend did not return JSON: " + text.slice(0, 150));
  }
}

async function loadLevels() {
  const levelSelect = document.getElementById("levelSelect");
  const classSelect = document.getElementById("classSelect");

  levelSelect.innerHTML = `<option value="">Loading levels...</option>`;
  classSelect.innerHTML = `<option value="">Select class</option>`;

  const data = await apiGet("getLevels");
  const levels = data.levels || data;

  levelSelect.innerHTML = `<option value="">Select level</option>`;

  levels.forEach(level => {
    const opt = document.createElement("option");
    opt.value = level;
    opt.textContent = level;
    levelSelect.appendChild(opt);
  });
}

async function loadClasses() {
  const level = document.getElementById("levelSelect").value;
  const classSelect = document.getElementById("classSelect");

  classSelect.innerHTML = `<option value="">Loading classes...</option>`;

  if (!level) {
    classSelect.innerHTML = `<option value="">Select class</option>`;
    return;
  }

  const data = await apiGet("getClasses", { level });
  const classes = data.classes || data;

  classSelect.innerHTML = `<option value="">Select class</option>`;

  classes.forEach(cls => {
    const opt = document.createElement("option");
    opt.value = cls;
    opt.textContent = cls;
    classSelect.appendChild(opt);
  });
}
