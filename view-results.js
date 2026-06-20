const API_URL =
  'https://script.google.com/macros/s/AKfycbyjiK1MWx30tV0wxZsTf5k5OLaGbQsvbCNacuBO8Ypa7lNTDMK46BRZY0T3Vn3dgP3X/exec';

const STATIONS = [
  'Sit-ups',
  'Standing Broad Jump',
  'Sit and Reach',
  'Inclined Pull-up',
  'Shuttle Run',
  '1.6km Run'
];

const SHORT_STATION_NAMES = {
  'Sit-ups': 'Sit-ups',
  'Standing Broad Jump': 'Broad Jump',
  'Sit and Reach': 'Sit & Reach',
  'Inclined Pull-up': 'Inclined Pull-up',
  'Shuttle Run': 'Shuttle Run',
  '1.6km Run': '1.6 km Run'
};

let allStudents = [];
let filteredStudents = [];

document.addEventListener('DOMContentLoaded', initialisePage);

async function initialisePage() {
  await loadLevels();
}

async function apiGet(action, params = {}) {
  const url = new URL(API_URL);

  url.searchParams.set('action', action);
  url.searchParams.set('_', Date.now());

  Object.entries(params).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store'
  });

  const text = await response.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(
      'Backend did not return JSON: ' +
      text.slice(0, 150)
    );
  }

  if (data && data.success === false) {
    throw new Error(
      data.message ||
      data.error ||
      'Backend request failed.'
    );
  }

  return data;
}

async function loadLevels() {
  const levelSelect =
    document.getElementById('levelSelect');

  const classSelect =
    document.getElementById('classSelect');

  levelSelect.innerHTML =
    '<option value="">Loading levels...</option>';

  classSelect.innerHTML =
    '<option value="">Select class</option>';

  setMessage('');
  showLoading('Loading levels…');

  try {
    const data =
      await apiGet('getViewLevels');

    const levels = Array.isArray(data)
      ? data
      : Array.isArray(data.levels)
        ? data.levels
        : [];

    levelSelect.innerHTML =
      '<option value="">Select level</option>';

    levels.forEach(level => {
      levelSelect.add(
        new Option(level, level)
      );
    });

    if (!levels.length) {
      throw new Error(
        'No levels were found in Student_Master.'
      );
    }

    setMessage(
      'Select a level and class.',
      'success'
    );
  } catch (error) {
    levelSelect.innerHTML =
      '<option value="">Select level</option>';

    setMessage(
      'Unable to load levels: ' +
      error.message,
      'error'
    );
  } finally {
    hideLoading();
  }
}

async function loadClasses() {
  const level =
    document.getElementById('levelSelect').value;

  const classSelect =
    document.getElementById('classSelect');

  classSelect.innerHTML =
    '<option value="">Select class</option>';

  hideResults();

  if (!level) {
    setMessage('Select a level.');
    return;
  }

  classSelect.innerHTML =
    '<option value="">Loading classes...</option>';

  setMessage('');
  showLoading('Loading classes…');

  try {
    const data =
      await apiGet(
        'getViewClasses',
        { level }
      );

    const classes = Array.isArray(data)
      ? data
      : Array.isArray(data.classes)
        ? data.classes
        : [];

    classSelect.innerHTML =
      '<option value="">Select class</option>';

    classes.forEach(className => {
      classSelect.add(
        new Option(className, className)
      );
    });

    if (!classes.length) {
      throw new Error(
        'No classes were found for ' +
        level +
        '.'
      );
    }

    setMessage(
      `${classes.length} class(es) loaded.`,
      'success'
    );
  } catch (error) {
    classSelect.innerHTML =
      '<option value="">Select class</option>';

    setMessage(
      'Unable to load classes: ' +
      error.message,
      'error'
    );
  } finally {
    hideLoading();
  }
}

async function loadResults() {
  const level =
    document.getElementById('levelSelect').value;

  const className =
    document.getElementById('classSelect').value;

  if (!level || !className) {
    setMessage(
      'Select both level and class.',
      'error'
    );

    return;
      }

  const button =
    document.getElementById('viewResultsButton');

  button.disabled = true;

  setMessage('');
  showLoading('Loading results…');

  try {
    const data =
      await apiGet(
        'getViewResults',
        {
          level,
          className
        }
      );

    allStudents =
      Array.isArray(data.students)
        ? data.students
        : [];

    filteredStudents = [
      ...allStudents
    ];

    document
      .getElementById('summaryPanel')
      .classList.remove('hidden');

    document
      .getElementById('resultsPanel')
      .classList.remove('hidden');

    document.getElementById(
      'searchInput'
    ).value = '';

    document.getElementById(
      'awardFilter'
    ).value = '';

    renderSummary(
      data.summary || {}
    );

    renderResults();

    setMessage(
      `${allStudents.length} pupil(s) loaded for ${className}.`,
      'success'
    );
  } catch (error) {
    hideResults();

    setMessage(
      'Unable to load results: ' +
      error.message,
      'error'
    );
  } finally {
    hideLoading();
    button.disabled = false;
  }
}

function renderSummary(
  backendSummary = {}
) {
  const completeCount =
    allStudents.filter(
      isStudentComplete
    ).length;

  const incompleteCount =
    allStudents.length -
    completeCount;

  setText(
    'summaryTotal',
    allStudents.length
  );

  setText(
    'summaryComplete',
    completeCount
  );

  setText(
    'summaryIncomplete',
    incompleteCount
  );

  setText(
    'summaryGold',
    backendSummary.Gold ??
    countAward('Gold')
  );

  setText(
    'summarySilver',
    backendSummary.Silver ??
    countAward('Silver')
  );

  setText(
    'summaryBronze',
    backendSummary.Bronze ??
    countAward('Bronze')
  );

  setText(
    'summaryNoAward',
    backendSummary['No Award'] ??
    countAward('No Award')
  );
}

function countAward(award) {
  return allStudents.filter(student => {
    return (
      normaliseAward(student.award) ===
      award
    );
  }).length;
}

function filterResults() {
  const searchText =
    document
      .getElementById('searchInput')
      .value
      .trim()
      .toLowerCase();

  const selectedAward =
    document.getElementById(
      'awardFilter'
    ).value;

  filteredStudents =
    allStudents.filter(student => {
      const searchableText = [
        student.no,
        student.name,
        student.id,
        student.className
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        !searchText ||
        searchableText.includes(
          searchText
        );

      const matchesAward =
        !selectedAward ||
        normaliseAward(
          student.award
        ) === selectedAward;

      return (
        matchesSearch &&
        matchesAward
      );
    });

  renderResults();
}

function renderResults() {
  renderTable();
  renderCards();

  document
    .getElementById('emptyMessage')
    .classList.toggle(
      'hidden',
      filteredStudents.length > 0
    );
}

function renderTable() {
  const body =
    document.getElementById('resultsBody');

  body.innerHTML = '';

  filteredStudents.forEach(student => {
    const row =
      document.createElement('tr');

    const stationCells =
      STATIONS.map(station => {
        return (
          '<td>' +
          stationHtml(
            student.stations?.[station],
            station
          ) +
          '</td>'
        );
      }).join('');

    row.innerHTML = `
      <td>
        ${escapeHtml(student.no)}
      </td>

      <td class="student-name">
        ${escapeHtml(student.name)}
      </td>

      ${stationCells}

      <td>
        <strong>
          ${escapeHtml(
            student.totalPoints ?? 0
          )}
        </strong>
      </td>

      <td>
        ${awardHtml(student.award)}
      </td>

      <td>
        ${statusHtml(student)}
      </td>
    `;

    body.appendChild(row);
  });
}

function renderCards() {
  const container =
    document.getElementById('cardView');

  container.innerHTML = '';

  filteredStudents.forEach(student => {
    const card =
      document.createElement('article');

    const complete =
      isStudentComplete(student);

    card.className =
      'student-card' +
      (
        complete
          ? ''
          : ' incomplete'
      );

    const stationCards =
      STATIONS.map(station => {
        const stationData =
          student.stations?.[station];

        return `
          <div class="station-card">
            <small>
              ${escapeHtml(
                SHORT_STATION_NAMES[
                  station
                ]
              )}
            </small>

            <strong>
              ${escapeHtml(
                stationScoreText(
                  stationData,
                  station
                )
              )}
            </strong>

            ${gradeHtml(
              stationData?.grade
            )}
          </div>
        `;
      }).join('');

    card.innerHTML = `
      <div class="student-card-header">
        <div class="register-number">
          ${escapeHtml(student.no)}
        </div>

        <div>
          <div class="card-name">
            ${escapeHtml(student.name)}
          </div>

          <div class="card-meta">
            ${escapeHtml(
              student.className
            )}
            ·
            ${escapeHtml(
              student.totalPoints ?? 0
            )}
            points
            ·
            ${
              complete
                ? 'Complete'
                : 'Incomplete'
            }
          </div>
        </div>

        ${awardHtml(student.award)}
      </div>

      <div class="station-grid">

              ${stationCards}
      </div>
    `;

    container.appendChild(card);
  });
}

function stationHtml(
  stationData,
  station
) {
  const score =
    stationScoreText(
      stationData,
      station
    );

  return `
    <span class="score">
      ${escapeHtml(score)}
    </span>

    <br>

    ${gradeHtml(
      stationData?.grade
    )}
  `;
}

function stationScoreText(
  stationData
) {
  if (!stationData) {
    return 'Missing';
  }

  const score =
    String(
      stationData.score ?? ''
    ).trim();

  if (score) {
    return score;
  }

  const status =
    String(
      stationData.status ?? ''
    ).trim();

  if (
    status &&
    status.toLowerCase() !==
    'done'
  ) {
    return status;
  }

  return 'Missing';
}

function gradeHtml(grade) {
  const cleanGrade =
    String(grade || '')
      .trim()
      .toUpperCase();

  if (!cleanGrade) {
    return `
      <span class="grade grade-missing">
        —
      </span>
    `;
  }

  return `
    <span class="grade grade-${cleanGrade.toLowerCase()}">
      ${escapeHtml(cleanGrade)}
    </span>
  `;
}

function awardHtml(award) {
  const cleanAward =
    normaliseAward(award);

  let className =
    'award-incomplete';

  if (cleanAward === 'Gold') {
    className =
      'award-gold';
  } else if (
    cleanAward === 'Silver'
  ) {
    className =
      'award-silver';
  } else if (
    cleanAward === 'Bronze'
  ) {
    className =
      'award-bronze';
  } else if (
    cleanAward === 'No Award'
  ) {
    className =
      'award-none';
  }

  return `
    <span class="award ${className}">
      ${escapeHtml(cleanAward)}
    </span>
  `;
}

function normaliseAward(award) {
  return (
    String(award || '').trim() ||
    'Incomplete'
  );
}

function isStudentComplete(student) {
  return STATIONS.every(station => {
    const grade =
      String(
        student.stations?.[station]
          ?.grade || ''
      )
        .trim()
        .toUpperCase();

    return [
      'A',
      'B',
      'C',
      'D',
      'E',
      'F'
    ].includes(grade);
  });
}

function statusHtml(student) {
  const missingStations =
    STATIONS.filter(station => {
      const grade =
        String(
          student.stations?.[station]
            ?.grade || ''
        ).trim();

      return !grade;
    });

  if (!missingStations.length) {
    return `
      <span class="status-complete">
        Complete
      </span>
    `;
  }

  const names =
    missingStations.map(station => {
      return SHORT_STATION_NAMES[
        station
      ];
    });

  return `
    <span class="status-incomplete">
      Missing:
      ${escapeHtml(
        names.join(', ')
      )}
    </span>
  `;
}

function hideResults() {
  allStudents = [];
  filteredStudents = [];

  document
    .getElementById('summaryPanel')
    .classList.add('hidden');

  document
    .getElementById('resultsPanel')
    .classList.add('hidden');
}

function setMessage(
  text,
  type = ''
) {
  const element =
    document.getElementById('message');

  element.textContent =
    text || '';

  element.className =
    'message' +
    (
      type
        ? ' ' + type
        : ''
    );
}

function showLoading(text) {
  document.getElementById(
    'loadingText'
  ).textContent = text;

  document
    .getElementById('loading')
    .classList.remove('hidden');
}

function hideLoading() {
  document
    .getElementById('loading')
    .classList.add('hidden');
}

function setText(id, value) {
  const element =
    document.getElementById(id);

  if (element) {
    element.textContent =
      String(value ?? '');
  }
}

function goBack() {
  if (history.length > 1) {
    history.back();
  } else {
    location.href =
      'index.html';
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
