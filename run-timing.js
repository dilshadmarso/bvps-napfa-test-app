const GOOGLE_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbyjiK1MWx30tV0wxZsTf5k5OLaGbQsvbCNacuBO8Ypa7lNTDMK46BRZY0T3Vn3dgP3X/exec';

const RUN_DRAFT_KEY = 'BVPS_NAPFA_RUN_DRAFT_V5';
const SETTINGS_KEY = 'BVPS_NAPFA_SETTINGS_V1';
const COMPLETED_BACKUP_MS = 24 * 60 * 60 * 1000;
const API_TIMEOUT_MS = 20000;

const NOT_RUNNING_REASONS = [
  'Absent',
  'Did Not Start',
  'Medical',
  'Injured',
  'Retest Needed',
  'Not Running'
];

let setupData = {
  levels: [],
  classesByLevel: {}
};

let students = [];
let sessionId = '';
let selectedTestDate = '';
let selectedClass = '';
let currentWave = 'Wave 1';

let assignmentsConfirmed = false;
let sessionSetupSynced = false;
let sessionSetupSyncing = false;
let sessionSetupSyncError = '';
let sessionSetupSyncPromise = null;

let waveStarted = false;
let waveEnded = false;
let waveSaved = false;

let startPerformanceTime = null;
let startWallClock = null;
let timerFrame = null;

let currentWaveResults = [];
let waveOneResults = [];
let waveTwoResults = [];

let saveInProgress = false;
let wakeLock = null;
let audioContext = null;

window.addEventListener('load', initialisePage);
window.addEventListener('beforeunload', handleBeforeUnload);

window.addEventListener('online', () => {
  if (
    assignmentsConfirmed &&
    !sessionSetupSynced &&
    !sessionSetupSyncing
  ) {
    syncSessionSetupInBackground();
  }
});

document.addEventListener('visibilitychange', async () => {
  if (
    document.visibilityState === 'visible' &&
    waveStarted &&
    !waveEnded
  ) {
    await requestWakeLock();
  }
});

async function initialisePage() {
  setToday();
  cleanupExpiredBackup();

  const restored = restoreDraft();

  if (!restored) {
    await loadSetupData();
  }
}

function setToday() {
  const date = new Date();
  const dateInput = document.getElementById('testDate');

  if (!dateInput) {
    return;
  }

  dateInput.value =
    date.getFullYear() +
    '-' +
    String(date.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getDate()).padStart(2, '0');
}

async function api(payload, timeoutMs = API_TIMEOUT_MS) {
  if (
    !GOOGLE_APPS_SCRIPT_URL ||
    GOOGLE_APPS_SCRIPT_URL.includes('PASTE_YOUR_WEB_APP_URL_HERE')
  ) {
    throw new Error('The Apps Script /exec URL has not been added.');
  }

  const controller = new AbortController();

  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: 'no-store'
    });

    const text = await response.text();
    let result;

    try {
      result = JSON.parse(text);
    } catch (error) {
      throw new Error(
        'Backend returned an invalid response: ' +
        String(text || '').slice(0, 160)
      );
    }

    if (!result.success) {
      throw new Error(
        result.error ||
        result.message ||
        'Request failed.'
      );
    }

    return result;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(
        'The connection took too long. Your data remains saved on this device.'
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function showLoading(text) {
  setText('loadingText', text);

  const loading = document.getElementById('loading');

  if (loading) {
    loading.classList.remove('hidden');
  }
}

function hideLoading() {
  const loading = document.getElementById('loading');

  if (loading) {
    loading.classList.add('hidden');
  }
}

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = String(value ?? '');
  }
}

async function loadSetupData() {
  showLoading('Loading classes…');
  setText('setupMessage', '');

  try {
    const result = await api({
      action: 'getStationSetupData'
    });

    setupData = {
      levels: Array.isArray(result.levels)
        ? result.levels
        : [],

      classesByLevel:
        result.classesByLevel || {}
    };

    const levelSelect =
      document.getElementById('levelSelect');

    const classSelect =
      document.getElementById('classSelect');

    levelSelect.innerHTML =
      '<option value="">Select level</option>';

    classSelect.innerHTML =
      '<option value="">Select class</option>';

    setupData.levels.forEach(level => {
      levelSelect.add(
        new Option(level, level)
      );
    });

    if (!setupData.levels.length) {
      throw new Error(
        'No levels were found in Student_Master.'
      );
    }

    setText(
      'setupMessage',
      'Select the test date, level and class.'
    );
  } catch (error) {
    setText(
      'setupMessage',
      'Unable to load classes: ' +
      error.message
    );
  } finally {
    hideLoading();
  }
}

function updateClasses() {
  const level =
    document.getElementById('levelSelect').value;

  const classSelect =
    document.getElementById('classSelect');

  classSelect.innerHTML =
    '<option value="">Select class</option>';

  const classes =
    setupData.classesByLevel?.[level] || [];

  classes.forEach(className => {
    classSelect.add(
      new Option(className, className)
    );
  });
}

async function loadClassStudents() {
  const date =
    document.getElementById('testDate').value;

  const level =
    document.getElementById('levelSelect').value;

  const className =
    document.getElementById('classSelect').value;

  if (!date || !level || !className) {
    alert(
      'Please select the test date, level and class.'
    );
    return;
  }

  const button =
    document.getElementById('loadClassBtn');

  button.disabled = true;
  showLoading('Loading pupils…');

  try {
    const result = await api({
      action: 'getRunStudentsByClass',
      className: className
    });

    students = (result.students || []).map(student => ({
      ...student,
      assignment: '',
      notRunningReason: ''
    }));

    if (!students.length) {
      throw new Error(
        'No pupils were found for this class.'
      );
    }

    selectedTestDate = date;
    selectedClass = className;
    sessionId = createSessionId(className);

    assignmentsConfirmed = false;

    sessionSetupSynced = false;
    sessionSetupSyncing = false;
    sessionSetupSyncError = '';
    sessionSetupSyncPromise = null;

    currentWave = 'Wave 1';

    waveStarted = false;
    waveEnded = false;
    waveSaved = false;

    startPerformanceTime = null;
    startWallClock = null;

    currentWaveResults = [];
    waveOneResults = [];
    waveTwoResults = [];

    showPanel('assignmentPanel');
    renderAssignments();
    saveDraft();
  } catch (error) {
    alert(
      'Unable to load class: ' +
      error.message
    );
  } finally {
    hideLoading();
    button.disabled = false;
  }
}

function createSessionId(className) {
  return (
    'RUN-' +
    String(className || '')
      .replace(/[^A-Za-z0-9]/g, '') +
    '-' +
    Date.now() +
    '-' +
    Math.random()
      .toString(36)
      .slice(2, 7)
      .toUpperCase()
  );
}
function renderAssignments() {
  const grid = document.getElementById('assignmentGrid');

  if (!grid) {
    return;
  }

  grid.innerHTML = '';

  students.forEach((student, index) => {
    const card = document.createElement('article');

    card.className = 'assignment-card';

    const reasonOptions = NOT_RUNNING_REASONS
      .map(reason => {
        const selected =
          student.notRunningReason === reason
            ? ' selected'
            : '';

        return (
          '<option value="' +
          escapeHtml(reason) +
          '"' +
          selected +
          '>' +
          escapeHtml(reason) +
          '</option>'
        );
      })
      .join('');

    card.innerHTML = `
      <div class="student-header">
        <div class="student-number">
          ${escapeHtml(getStudentNo(student))}
        </div>

        <div class="student-name">
          ${escapeHtml(getStudentName(student))}
        </div>
      </div>

      <div class="assignment-actions">
        <button
          type="button"
          class="wave-one-button ${
            student.assignment === 'Wave 1'
              ? 'active'
              : ''
          }"
          onclick="setAssignment(${index}, 'Wave 1')"
        >
          Wave 1
        </button>

        <button
          type="button"
          class="wave-two-button ${
            student.assignment === 'Wave 2'
              ? 'active'
              : ''
          }"
          onclick="setAssignment(${index}, 'Wave 2')"
        >
          Wave 2
        </button>

        <button
          type="button"
          class="not-running-button ${
            student.assignment === 'Not Running'
              ? 'active'
              : ''
          }"
          onclick="setAssignment(${index}, 'Not Running')"
        >
          Not Running
        </button>
      </div>

      ${
        student.assignment === 'Not Running'
          ? `
            <select
              class="reason-select"
              onchange="setReason(${index}, this.value)"
            >
              <option value="">
                Select reason
              </option>

              ${reasonOptions}
            </select>
          `
          : ''
      }
    `;

    grid.appendChild(card);
  });

  updateAssignmentSummary();
}

function setAssignment(index, value) {
  const student = students[index];

  if (!student) {
    return;
  }

  student.assignment =
    student.assignment === value
      ? ''
      : value;

  if (student.assignment !== 'Not Running') {
    student.notRunningReason = '';
  }

  renderAssignments();
  saveDraft();
}

function setReason(index, value) {
  const student = students[index];

  if (!student) {
    return;
  }

  student.notRunningReason = value;

  updateAssignmentSummary();
  saveDraft();
}

function autoAssignWaves() {
  const runningStudents = students.filter(student => {
    return student.assignment !== 'Not Running';
  });

  runningStudents.forEach((student, index) => {
    student.assignment =
      index % 2 === 0
        ? 'Wave 1'
        : 'Wave 2';

    student.notRunningReason = '';
  });

  renderAssignments();
  saveDraft();
}

function resetAssignments() {
  const confirmed = confirm(
    'Clear all Wave 1, Wave 2 and Not Running assignments?'
  );

  if (!confirmed) {
    return;
  }

  students.forEach(student => {
    student.assignment = '';
    student.notRunningReason = '';
  });

  renderAssignments();
  saveDraft();
}

function updateAssignmentSummary() {
  const waveOneCount = students.filter(student => {
    return student.assignment === 'Wave 1';
  }).length;

  const waveTwoCount = students.filter(student => {
    return student.assignment === 'Wave 2';
  }).length;

  const notRunningCount = students.filter(student => {
    return student.assignment === 'Not Running';
  }).length;

  const unassignedCount = students.filter(student => {
    return !student.assignment;
  }).length;

  const summary =
    document.getElementById('assignmentSummary');

  if (!summary) {
    return;
  }

  summary.innerHTML = `
    <div class="information">
      Wave 1:
      <strong>${waveOneCount}</strong>

      · Wave 2:
      <strong>${waveTwoCount}</strong>

      · Not Running:
      <strong>${notRunningCount}</strong>

      · Unassigned:
      <strong>${unassignedCount}</strong>
    </div>
  `;
}

function confirmAssignments() {
  const unassignedStudents = students.filter(student => {
    return !student.assignment;
  });

  if (unassignedStudents.length > 0) {
    alert(
      `${unassignedStudents.length} pupil(s) have not been assigned.`
    );

    return;
  }

  const missingReasons = students.filter(student => {
    return (
      student.assignment === 'Not Running' &&
      !student.notRunningReason
    );
  });

  if (missingReasons.length > 0) {
    alert(
      'Select a reason for every pupil marked Not Running.'
    );

    return;
  }

  const hasWaveOne = students.some(student => {
    return student.assignment === 'Wave 1';
  });

  const hasWaveTwo = students.some(student => {
    return student.assignment === 'Wave 2';
  });

  if (!hasWaveOne && !hasWaveTwo) {
    alert(
      'At least one pupil must be assigned to Wave 1 or Wave 2.'
    );

    return;
  }

  assignmentsConfirmed = true;

  currentWave = hasWaveOne
    ? 'Wave 1'
    : 'Wave 2';

  sessionSetupSynced = false;
  sessionSetupSyncing = false;
  sessionSetupSyncError = '';
  sessionSetupSyncPromise = null;

  saveDraft();
  prepareWave();

  updateSaveStatus(
    'Saved on device · syncing…',
    'pending'
  );

  setRetrySetupSyncVisible(false);
  syncSessionSetupInBackground();
}

function createSessionSetupPayload() {
  return {
    action: 'saveRunSessionSetupBatch',
    sessionId: sessionId,
    testDate: selectedTestDate,
    className: selectedClass,
    mode: '1.6km Run',

    students: students.map(student => ({
      no: getStudentNo(student),
      id: getStudentId(student),
      name: getStudentName(student),
      className:
        student.className ||
        student.class ||
        student.Class ||
        selectedClass,
      gender:
        student.gender ||
        student.Gender ||
        '',
      dob:
        student.dob ||
        student.DOB ||
        '',
      wave: student.assignment,
      assignment: student.assignment,
      status:
        student.assignment === 'Not Running'
          ? 'Not Running'
          : 'Assigned',
      remarks:
        student.notRunningReason || '',
      notRunningReason:
        student.notRunningReason || ''
    }))
  };
}

function syncSessionSetupInBackground() {
  if (sessionSetupSynced) {
    return Promise.resolve({
      success: true
    });
  }

  if (sessionSetupSyncing && sessionSetupSyncPromise) {
    return sessionSetupSyncPromise;
  }

  sessionSetupSyncing = true;
  sessionSetupSyncError = '';

  updateSaveStatus(
    'Saved on device · syncing session…',
    'pending'
  );

  setRetrySetupSyncVisible(false);
  saveDraft();

  sessionSetupSyncPromise = api(
    createSessionSetupPayload(),
    API_TIMEOUT_MS
  )
    .then(result => {
      sessionSetupSynced = true;
      sessionSetupSyncError = '';

      updateSaveStatus(
        'Session synced',
        'saved'
      );

      setRetrySetupSyncVisible(false);
      saveDraft();

      return result;
    })
    .catch(error => {
      sessionSetupSynced = false;

      sessionSetupSyncError =
        error.message ||
        'Session setup could not be synced.';

      updateSaveStatus(
        'Saved on device · sync failed',
        'failed'
      );

      setRetrySetupSyncVisible(true);
      saveDraft();

      return {
        success: false,
        error: sessionSetupSyncError
      };
    })
    .finally(() => {
      sessionSetupSyncing = false;
      sessionSetupSyncPromise = null;
    });

  return sessionSetupSyncPromise;
}

async function retrySessionSetupSync() {
  if (sessionSetupSyncing) {
    return;
  }

  const button =
    document.getElementById('retrySetupSyncBtn');

  if (button) {
    button.disabled = true;
  }

  updateSaveStatus(
    'Retrying session sync…',
    'pending'
  );

  try {
    const result =
      await syncSessionSetupInBackground();

    if (!result.success) {
      alert(
        'The session could not be synced. It remains saved on this device.'
      );
    }
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

function setRetrySetupSyncVisible(visible) {
  const button =
    document.getElementById('retrySetupSyncBtn');

  if (!button) {
    return;
  }

  button.classList.toggle(
    'hidden',
    !visible
  );
}

function resumePendingSessionSync() {
  if (
    assignmentsConfirmed &&
    !sessionSetupSynced &&
    !sessionSetupSyncing
  ) {
    syncSessionSetupInBackground();
  }
}

function prepareWave() {
  stopTimer();
  releaseWakeLock();

  waveStarted = false;
  waveEnded = false;
  waveSaved = false;

  startPerformanceTime = null;
  startWallClock = null;

  currentWaveResults = [];

  showPanel('timingPanel');

  setText(
    'sessionText',
    `${selectedClass} · ${currentWave} · ` +
    `${displayDate(selectedTestDate)}`
  );

  setText(
    'timerValue',
    '00:00.0'
  );

  const startButton =
    document.getElementById('startWaveBtn');

  const endButton =
    document.getElementById('endWaveBtn');

  const undoButton =
    document.getElementById('undoBtn');

  if (startButton) {
    startButton.disabled = false;
  }

  if (endButton) {
    endButton.disabled = true;
  }

  if (undoButton) {
    undoButton.disabled = true;
  }

  updateSaveStatus(
    sessionSetupSynced
      ? 'Session synced'
      : 'Saved on device',

    sessionSetupSynced
      ? 'saved'
      : ''
  );

  setRetrySetupSyncVisible(
    Boolean(
      sessionSetupSyncError &&
      !sessionSetupSynced
    )
  );

  renderRunners();
  saveDraft();
}

function currentRunners() {
  return students.filter(student => {
    return student.assignment === currentWave;
  });
}

function renderRunners() {
  const runners = currentRunners();

  const grid =
    document.getElementById('runnerGrid');

  if (!grid) {
    return;
  }

  grid.innerHTML = '';

  runners.forEach(student => {
    const studentId = getStudentKey(student);

    const finish = currentWaveResults.find(result => {
      return (
        getStudentKey(result.student) === studentId
      );
    });

    const button =
      document.createElement('button');

    button.type = 'button';

    button.className =
      'runner-button' +
      (finish ? ' finished' : '');

    button.disabled =
      !waveStarted ||
      waveEnded ||
      Boolean(finish);

    button.onclick = () => {
      recordFinish(student);
    };

    button.innerHTML = `
      <div class="runner-number">
        No. ${escapeHtml(getStudentNo(student))}
      </div>

      <div class="runner-name">
        ${escapeHtml(getStudentName(student))}
      </div>

      ${
        finish
          ? `
            <div class="runner-position">
              #${finish.position}
            </div>

            <div class="runner-time">
              ${formatTime(finish.elapsedSeconds)}
            </div>
          `
          : `
            <div class="runner-time">
              Tap at finish
            </div>
          `
      }
    `;

    grid.appendChild(button);
  });

  setText(
    'finishedCount',
    `Finished: ${currentWaveResults.length} / ${runners.length}`
  );
}

function getStudentNo(student) {
  return (
    student?.no ??
    student?.No ??
    student?.number ??
    ''
  );
}

function getStudentId(student) {
  return (
    student?.id ??
    student?.ID ??
    ''
  );
}

function getStudentName(student) {
  return (
    student?.name ??
    student?.Name ??
    ''
  );
}

function getStudentKey(student) {
  const id = String(
    getStudentId(student) || ''
  ).trim();

  if (id) {
    return 'ID:' + id;
  }

  return (
    'NO:' +
    String(getStudentNo(student) || '').trim() +
    ':' +
    String(
      student?.className ||
      student?.class ||
      student?.Class ||
      selectedClass ||
      ''
    ).trim()
  );
}
async function startCurrentWave() {
  if (waveStarted) {
    return;
  }

  const runners = currentRunners();

  if (!runners.length) {
    alert(
      `No pupils are assigned to ${currentWave}.`
    );
    return;
  }

  const confirmed = confirm(
    `Start ${currentWave} now?`
  );

  if (!confirmed) {
    return;
  }

  await requestWakeLock();
  unlockAudio();

  startPerformanceTime = performance.now();
  startWallClock = Date.now();

  waveStarted = true;
  waveEnded = false;
  waveSaved = false;

  currentWaveResults = [];

  const startButton =
    document.getElementById('startWaveBtn');

  const endButton =
    document.getElementById('endWaveBtn');

  const undoButton =
    document.getElementById('undoBtn');

  if (startButton) {
    startButton.disabled = true;
  }

  if (endButton) {
    endButton.disabled = false;
  }

  if (undoButton) {
    undoButton.disabled = true;
  }

  updateSaveStatus(
    'Timing · saved locally',
    'pending'
  );

  animateTimer();
  renderRunners();
  saveDraft();
}

function elapsedNow() {
  if (startPerformanceTime !== null) {
    return (
      performance.now() -
      startPerformanceTime
    ) / 1000;
  }

  if (startWallClock) {
    return (
      Date.now() -
      startWallClock
    ) / 1000;
  }

  return 0;
}

function animateTimer() {
  if (!waveStarted || waveEnded) {
    return;
  }

  setText(
    'timerValue',
    formatTenths(elapsedNow())
  );

  timerFrame =
    requestAnimationFrame(animateTimer);
}

function stopTimer() {
  if (timerFrame) {
    cancelAnimationFrame(timerFrame);
  }

  timerFrame = null;
}

function recordFinish(student) {
  if (!waveStarted || waveEnded) {
    return;
  }

  const studentKey =
    getStudentKey(student);

  const alreadyFinished =
    currentWaveResults.some(result => {
      return (
        getStudentKey(result.student) ===
        studentKey
      );
    });

  if (alreadyFinished) {
    return;
  }

  currentWaveResults.push({
    student: student,
    elapsedSeconds: Number(
      elapsedNow().toFixed(2)
    ),
    position:
      currentWaveResults.length + 1,
    attemptNo: 1,
    remarks: ''
  });

  saveDraft();
  vibrate(50);
  playTone(620, 0.045);

  const undoButton =
    document.getElementById('undoBtn');

  if (undoButton) {
    undoButton.disabled = false;
  }

  renderRunners();
}

function undoLastFinish() {
  if (
    !currentWaveResults.length ||
    waveSaved
  ) {
    return;
  }

  currentWaveResults.pop();

  currentWaveResults.forEach(
    (result, index) => {
      result.position = index + 1;
    }
  );

  vibrate([30, 30, 30]);

  const undoButton =
    document.getElementById('undoBtn');

  if (undoButton) {
    undoButton.disabled =
      currentWaveResults.length === 0;
  }

  renderRunners();
  saveDraft();
}

function endCurrentWave() {
  if (!waveStarted || waveEnded) {
    return;
  }

  const unfinished =
    currentRunners().filter(student => {
      return !currentWaveResults.some(
        result => {
          return (
            getStudentKey(result.student) ===
            getStudentKey(student)
          );
        }
      );
    });

  if (unfinished.length > 0) {
    const pupilList = unfinished
      .map(student => {
        return (
          `No. ${getStudentNo(student)} ` +
          getStudentName(student)
        );
      })
      .join('\n');

    const confirmed = confirm(
      `End ${currentWave} with ` +
      `${unfinished.length} unfinished pupil(s)?\n\n` +
      pupilList
    );

    if (!confirmed) {
      return;
    }
  }

  waveEnded = true;

  stopTimer();
  releaseWakeLock();

  const endButton =
    document.getElementById('endWaveBtn');

  if (endButton) {
    endButton.disabled = true;
  }

  showReview();
  saveDraft();
}

function showReview() {
  showPanel('reviewPanel');

  setText(
    'reviewTitle',
    `Review ${currentWave}`
  );

  const body =
    document.getElementById('reviewBody');

  if (!body) {
    return;
  }

  body.innerHTML = '';

  currentWaveResults.forEach(result => {
    const row =
      document.createElement('tr');

    row.innerHTML = `
      <td>
        ${result.position}
      </td>

      <td>
        ${escapeHtml(
          getStudentNo(result.student)
        )}
      </td>

      <td>
        <strong>
          ${escapeHtml(
            getStudentName(result.student)
          )}
        </strong>
      </td>

      <td>
        ${formatTime(result.elapsedSeconds)}
      </td>

      <td>
        ${escapeHtml(
          result.grade ||
          'Calculated on save'
        )}
      </td>
    `;

    body.appendChild(row);
  });

  const saveButton =
    document.getElementById('saveWaveBtn');

  const returnButton =
    document.getElementById('returnTimingBtn');

  const nextButton =
    document.getElementById('nextWaveBtn');

  const completeButton =
    document.getElementById('completeBtn');

  if (saveButton) {
    saveButton.classList.toggle(
      'hidden',
      waveSaved
    );
  }

  if (returnButton) {
    returnButton.classList.toggle(
      'hidden',
      waveSaved
    );
  }

  if (nextButton) {
    nextButton.classList.add('hidden');
  }

  if (completeButton) {
    completeButton.classList.add('hidden');
  }

  if (waveSaved) {
    showPostSaveButtons();
  }

  setText(
    'reviewMessage',
    waveSaved
      ? `${currentWave} saved to Google Sheets.`
      : `${currentWaveResults.length} result(s) ready to save.`
  );
}

function returnToTiming() {
  if (waveSaved) {
    return;
  }

  showPanel('timingPanel');
  renderRunners();
}

async function saveCurrentWave() {
  if (saveInProgress) {
    return;
  }

  if (!currentWaveResults.length) {
    alert(
      'No finish times have been recorded for this wave.'
    );
    return;
  }

  saveInProgress = true;

  const button =
    document.getElementById('saveWaveBtn');

  if (button) {
    button.disabled = true;
  }

  if (!sessionSetupSynced) {
    setText(
      'reviewMessage',
      'Syncing the session setup before saving the wave…'
    );

    const syncResult =
      await syncSessionSetupInBackground();

    if (!syncResult.success) {
      saveInProgress = false;

      if (button) {
        button.disabled = false;
      }

      setText(
        'reviewMessage',
        'The setup could not be synced. All times remain safely stored on this device. Check the connection and press Save Wave Results again.'
      );

      alert(
        'Unable to sync the run session. The finish times remain saved on this device.'
      );

      return;
    }
  }

  updateSaveStatus(
    'Saving to Google Sheets…',
    'pending'
  );

  setText(
    'reviewMessage',
    'Saving the entire wave in one batch…'
  );

  try {
    const result = await api({
      action: 'saveRunWaveBatch',
      sessionId: sessionId,
      testDate: selectedTestDate,
      className: selectedClass,
      wave: currentWave,

      results: currentWaveResults.map(
        runResult => ({
          no:
            getStudentNo(
              runResult.student
            ),

          id:
            getStudentId(
              runResult.student
            ),

          name:
            getStudentName(
              runResult.student
            ),

          className:
            runResult.student.className ||
            runResult.student.class ||
            runResult.student.Class ||
            selectedClass,

          gender:
            runResult.student.gender ||
            runResult.student.Gender ||
            '',

          dob:
            runResult.student.dob ||
            runResult.student.DOB ||
            '',

          elapsedSeconds:
            runResult.elapsedSeconds,

          finishTime:
            formatTime(
              runResult.elapsedSeconds
            ),

          position:
            runResult.position,

          attemptNo:
            runResult.attemptNo,

          remarks:
            runResult.remarks || ''
        })
      )
    });

    const savedResults =
      Array.isArray(result.results)
        ? result.results
        : [];

    const resultMap = new Map();

    savedResults.forEach(item => {
      const itemId =
        String(
          item.ID ??
          item.id ??
          ''
        ).trim();

      const itemNo =
        String(
          item.No ??
          item.no ??
          ''
        ).trim();

      const key = itemId
        ? 'ID:' + itemId
        : (
            'NO:' +
            itemNo +
            ':' +
            selectedClass
          );

      resultMap.set(key, item);
    });

    currentWaveResults.forEach(
      runResult => {
        const key =
          getStudentKey(
            runResult.student
          );

        const savedResult =
          resultMap.get(key);

        if (savedResult) {
          runResult.grade =
            savedResult.Grade ??
            savedResult.grade ??
            '';

          runResult.time =
            savedResult.Time ??
            savedResult.time ??
            savedResult.finishTime ??
            formatTime(
              runResult.elapsedSeconds
            );
        }
      }
    );

    if (currentWave === 'Wave 1') {
      waveOneResults =
        currentWaveResults.map(
          resultItem => ({
            ...resultItem
          })
        );
    } else {
      waveTwoResults =
        currentWaveResults.map(
          resultItem => ({
            ...resultItem
          })
        );
    }

    waveSaved = true;

    updateSaveStatus(
      'Saved to Google Sheets',
      'saved'
    );

    vibrate(90);
    playTone(820, 0.1);

    saveDraft();
    showReview();
  } catch (error) {
    updateSaveStatus(
      'Save failed · retry',
      'failed'
    );

    vibrate([80, 60, 80]);

    setText(
      'reviewMessage',
      'Save failed. Results remain safely stored on this device. Press Save Wave Results again.'
    );

    alert(error.message);
  } finally {
    saveInProgress = false;

    if (button) {
      button.disabled = false;
    }
  }
}

function showPostSaveButtons() {
  const hasWaveTwo =
    students.some(student => {
      return student.assignment === 'Wave 2';
    });

  const nextButton =
    document.getElementById('nextWaveBtn');

  const completeButton =
    document.getElementById('completeBtn');

  if (
    currentWave === 'Wave 1' &&
    hasWaveTwo
  ) {
    if (nextButton) {
      nextButton.classList.remove('hidden');
    }
  } else {
    if (completeButton) {
      completeButton.classList.remove('hidden');
    }
  }
}

function moveToNextWave() {
  if (!waveSaved) {
    return;
  }

  currentWave = 'Wave 2';

  prepareWave();
  resumePendingSessionSync();
}

async function completeSession() {
  if (
    saveInProgress ||
    !waveSaved
  ) {
    return;
  }

  const hasWaveOne =
    students.some(student => {
      return student.assignment === 'Wave 1';
    });

  const hasWaveTwo =
    students.some(student => {
      return student.assignment === 'Wave 2';
    });

  if (
    hasWaveOne &&
    waveOneResults.length === 0
  ) {
    alert(
      'Wave 1 has not been saved to Google Sheets.'
    );
    return;
  }

  if (
    hasWaveTwo &&
    waveTwoResults.length === 0
  ) {
    alert(
      'Wave 2 has not been saved to Google Sheets.'
    );
    return;
  }

  if (!sessionSetupSynced) {
    alert(
      'The session setup has not finished syncing. Press Retry Sync before completing the session.'
    );

    setRetrySetupSyncVisible(true);
    return;
  }

  const confirmed = confirm(
    'Complete this run session?\n\n' +
    'All wave results have already been saved to Google Sheets.'
  );

  if (!confirmed) {
    return;
  }

  const button =
    document.getElementById('completeBtn');

  if (button) {
    button.disabled = true;
  }

  saveInProgress = true;
  showLoading('Completing session…');

  try {
    await api({
      action: 'completeRunSession',
      sessionId: sessionId,
      className: selectedClass,
      testDate: selectedTestDate
    });

    markDraftCompleted();

    const notRunning =
      students.filter(student => {
        return (
          student.assignment ===
          'Not Running'
        );
      }).length;

    const totalRecorded =
      waveOneResults.length +
      waveTwoResults.length +
      notRunning;

    setText(
      'completionSummary',

      `${selectedClass} run completed.\n` +
      `Wave 1 saved: ${waveOneResults.length} pupil(s)\n` +
      `Wave 2 saved: ${waveTwoResults.length} pupil(s)\n` +
      `Not Running: ${notRunning} pupil(s)\n` +
      `Total recorded: ${totalRecorded} of ${students.length}`
    );

    updateSaveStatus(
      'Session completed',
      'saved'
    );

    vibrate(100);
    playTone(880, 0.12);

    showPanel('completionPanel');
  } catch (error) {
    alert(
      'Unable to complete session: ' +
      error.message
    );
  } finally {
    hideLoading();

    saveInProgress = false;

    if (button) {
      button.disabled = false;
    }
  }
}
function buildDraft() {
  return {
    version: 5,
    savedAt: new Date().toISOString(),
    completed: false,

    students: students,
    sessionId: sessionId,

    selectedTestDate:
      selectedTestDate,

    selectedClass:
      selectedClass,

    currentWave:
      currentWave,

    assignmentsConfirmed:
      assignmentsConfirmed,

    sessionSetupSynced:
      sessionSetupSynced,

    sessionSetupSyncError:
      sessionSetupSyncError,

    waveStarted:
      waveStarted,

    waveEnded:
      waveEnded,

    waveSaved:
      waveSaved,

    startWallClock:
      startWallClock,

    currentWaveResults:
      currentWaveResults,

    waveOneResults:
      waveOneResults,

    waveTwoResults:
      waveTwoResults
  };
}

function saveDraft() {
  try {
    localStorage.setItem(
      RUN_DRAFT_KEY,
      JSON.stringify(buildDraft())
    );
  } catch (error) {
    console.warn(
      'Unable to save the local run backup.',
      error
    );
  }
}

function markDraftCompleted() {
  const draft = buildDraft();

  draft.completed = true;
  draft.completedAt =
    new Date().toISOString();

  try {
    localStorage.setItem(
      RUN_DRAFT_KEY,
      JSON.stringify(draft)
    );
  } catch (error) {
    console.warn(
      'Unable to save the completed backup.',
      error
    );
  }
}

function cleanupExpiredBackup() {
  try {
    const savedText =
      localStorage.getItem(
        RUN_DRAFT_KEY
      );

    if (!savedText) {
      return;
    }

    const draft =
      JSON.parse(savedText);

    if (
      !draft.completed ||
      !draft.completedAt
    ) {
      return;
    }

    const completedTime =
      new Date(
        draft.completedAt
      ).getTime();

    if (
      !Number.isFinite(completedTime)
    ) {
      return;
    }

    if (
      Date.now() -
      completedTime >
      COMPLETED_BACKUP_MS
    ) {
      localStorage.removeItem(
        RUN_DRAFT_KEY
      );
    }
  } catch (error) {
    console.warn(
      'Unable to inspect the saved run backup.',
      error
    );
  }
}

function restoreDraft() {
  let draft;

  try {
    const savedText =
      localStorage.getItem(
        RUN_DRAFT_KEY
      );

    if (!savedText) {
      return false;
    }

    draft =
      JSON.parse(savedText);
  } catch (error) {
    console.warn(
      'Unable to read the saved run backup.',
      error
    );

    return false;
  }

  if (
    !draft ||
    !draft.sessionId ||
    !Array.isArray(draft.students)
  ) {
    return false;
  }

  const backupLabel =
    draft.completed
      ? 'completed backup'
      : 'saved session';

  const savedDate =
    draft.savedAt
      ? new Date(
          draft.savedAt
        ).toLocaleString()
      : 'Unknown time';

  const restore = confirm(
    `A ${backupLabel} for ` +
    `${draft.selectedClass || 'a class'} was found.\n\n` +
    `Last backup: ${savedDate}\n\n` +
    'Resume it?'
  );

  if (!restore) {
    localStorage.removeItem(
      RUN_DRAFT_KEY
    );

    return false;
  }

  students =
    Array.isArray(draft.students)
      ? draft.students
      : [];

  sessionId =
    draft.sessionId || '';

  selectedTestDate =
    draft.selectedTestDate || '';

  selectedClass =
    draft.selectedClass || '';

  currentWave =
    draft.currentWave ||
    'Wave 1';

  assignmentsConfirmed =
    Boolean(
      draft.assignmentsConfirmed
    );

  sessionSetupSynced =
    Boolean(
      draft.sessionSetupSynced
    );

  sessionSetupSyncError =
    draft.sessionSetupSyncError ||
    '';

  sessionSetupSyncing = false;
  sessionSetupSyncPromise = null;

  waveStarted =
    Boolean(
      draft.waveStarted
    );

  waveEnded =
    Boolean(
      draft.waveEnded
    );

  waveSaved =
    Boolean(
      draft.waveSaved
    );

  startWallClock =
    draft.startWallClock ||
    null;

  startPerformanceTime = null;

  currentWaveResults =
    Array.isArray(
      draft.currentWaveResults
    )
      ? draft.currentWaveResults
      : [];

  waveOneResults =
    Array.isArray(
      draft.waveOneResults
    )
      ? draft.waveOneResults
      : [];

  waveTwoResults =
    Array.isArray(
      draft.waveTwoResults
    )
      ? draft.waveTwoResults
      : [];

  if (draft.completed) {
    const notRunning =
      students.filter(student => {
        return (
          student.assignment ===
          'Not Running'
        );
      }).length;

    setText(
      'completionSummary',

      `${selectedClass} completed backup restored.\n` +
      `Wave 1 saved: ${waveOneResults.length} pupil(s)\n` +
      `Wave 2 saved: ${waveTwoResults.length} pupil(s)\n` +
      `Not Running: ${notRunning} pupil(s)`
    );

    showPanel(
      'completionPanel'
    );

    return true;
  }

  if (!assignmentsConfirmed) {
    showPanel(
      'assignmentPanel'
    );

    renderAssignments();

    return true;
  }

  if (
    waveSaved ||
    waveEnded
  ) {
    waveStarted = false;

    showReview();
    resumePendingSessionSync();

    return true;
  }

  if (draft.waveStarted) {
    waveStarted = true;
    waveEnded = false;

    startPerformanceTime = null;

    showPanel(
      'timingPanel'
    );

    setText(
      'sessionText',

      `${selectedClass} · ` +
      `${currentWave} · ` +
      `${displayDate(
        selectedTestDate
      )}`
    );

    const startButton =
      document.getElementById(
        'startWaveBtn'
      );

    const endButton =
      document.getElementById(
        'endWaveBtn'
      );

    const undoButton =
      document.getElementById(
        'undoBtn'
      );

    if (startButton) {
      startButton.disabled = true;
    }

    if (endButton) {
      endButton.disabled = false;
    }

    if (undoButton) {
      undoButton.disabled =
        currentWaveResults.length === 0;
    }

    updateSaveStatus(
      sessionSetupSynced
        ? 'Session synced'
        : 'Restored · saved locally',

      sessionSetupSynced
        ? 'saved'
        : 'pending'
    );

    setRetrySetupSyncVisible(
      Boolean(
        sessionSetupSyncError &&
        !sessionSetupSynced
      )
    );

    renderRunners();
    requestWakeLock();
    animateTimer();

    resumePendingSessionSync();

    return true;
  }

  prepareWave();
  resumePendingSessionSync();

  return true;
}

function startNewSession() {
  const confirmed = confirm(
    'Start a new run session? The current local backup will be cleared.'
  );

  if (!confirmed) {
    return;
  }

  localStorage.removeItem(
    RUN_DRAFT_KEY
  );

  location.reload();
}

function hasActiveData() {
  return (
    assignmentsConfirmed ||
    currentWaveResults.length > 0 ||
    waveOneResults.length > 0 ||
    waveTwoResults.length > 0
  );
}

function goHomeSafely() {
  if (!canLeave()) {
    return;
  }

  location.href = 'index.html';
}

function handleBackNavigation() {
  if (!canLeave()) {
    return;
  }

  if (history.length > 1) {
    history.back();
  } else {
    location.href = 'index.html';
  }
}

function canLeave() {
  if (saveInProgress) {
    alert(
      'Results are currently saving. Keep this page open.'
    );

    return false;
  }

  if (
    waveStarted &&
    !waveEnded
  ) {
    alert(
      'A wave is currently running. End the wave before leaving.'
    );

    return false;
  }

  if (
    hasActiveData() &&
    !confirm(
      'Leave this page? The current run session will remain backed up on this device.'
    )
  ) {
    return false;
  }

  return true;
}

function handleBeforeUnload(event) {
  if (
    saveInProgress ||
    (
      waveStarted &&
      !waveEnded
    ) ||
    hasActiveData()
  ) {
    event.preventDefault();
    event.returnValue = '';
  }
}

async function requestWakeLock() {
  if (!getSettings().keepAwake) {
    return;
  }

  if (!('wakeLock' in navigator)) {
    return;
  }

  try {
    if (wakeLock) {
      return;
    }

    wakeLock =
      await navigator.wakeLock.request(
        'screen'
      );

    wakeLock.addEventListener(
      'release',
      () => {
        wakeLock = null;
      }
    );
  } catch (error) {
    console.warn(
      'Wake Lock is unavailable.',
      error
    );
  }
}

function releaseWakeLock() {
  try {
    if (wakeLock) {
      wakeLock.release();
    }
  } catch (error) {
    console.warn(
      'Unable to release Wake Lock.',
      error
    );
  }

  wakeLock = null;
}

function getSettings() {
  try {
    const storedSettings =
      JSON.parse(
        localStorage.getItem(
          SETTINGS_KEY
        ) || '{}'
      );

    return {
      vibration: true,
      sounds: false,
      keepAwake: true,
      ...storedSettings
    };
  } catch (error) {
    return {
      vibration: true,
      sounds: false,
      keepAwake: true
    };
  }
}

function vibrate(pattern) {
  if (
    !getSettings().vibration ||
    !navigator.vibrate
  ) {
    return;
  }

  navigator.vibrate(pattern);
}

function unlockAudio() {
  if (!getSettings().sounds) {
    return;
  }

  const AudioContextClass =
    window.AudioContext ||
    window.webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  if (!audioContext) {
    audioContext =
      new AudioContextClass();
  }

  if (
    audioContext.state ===
    'suspended'
  ) {
    audioContext.resume();
  }
}

function playTone(
  frequency,
  duration
) {
  if (!getSettings().sounds) {
    return;
  }

  try {
    unlockAudio();

    if (!audioContext) {
      return;
    }

    const oscillator =
      audioContext.createOscillator();

    const gain =
      audioContext.createGain();

    oscillator.frequency.value =
      frequency;

    gain.gain.value =
      0.035;

    oscillator.connect(gain);

    gain.connect(
      audioContext.destination
    );

    oscillator.start();

    oscillator.stop(
      audioContext.currentTime +
      duration
    );
  } catch (error) {
    console.warn(
      'Audio feedback is unavailable.',
      error
    );
  }
}

function updateSaveStatus(
  text,
  state
) {
  const element =
    document.getElementById(
      'saveStatus'
    );

  if (!element) {
    return;
  }

  element.textContent = text;

  element.className =
    'status-badge' +
    (
      state
        ? ' ' + state
        : ''
    );
}

function showPanel(id) {
  const panelIds = [
    'setupPanel',
    'assignmentPanel',
    'timingPanel',
    'reviewPanel',
    'completionPanel'
  ];

  panelIds.forEach(panelId => {
    const panel =
      document.getElementById(
        panelId
      );

    if (!panel) {
      return;
    }

    panel.classList.toggle(
      'hidden',
      panelId !== id
    );
  });

  window.scrollTo({
    top: 0,
    behaviour: 'smooth'
  });
}

function formatTime(value) {
  const totalSeconds =
    Math.max(
      0,
      Math.round(
        Number(value) || 0
      )
    );

  const minutes =
    Math.floor(
      totalSeconds / 60
    );

  const seconds =
    totalSeconds % 60;

  return (
    String(minutes)
      .padStart(2, '0') +
    ':' +
    String(seconds)
      .padStart(2, '0')
  );
}

function formatTenths(value) {
  const totalSeconds =
    Math.max(
      0,
      Number(value) || 0
    );

  const minutes =
    Math.floor(
      totalSeconds / 60
    );

  const seconds =
    Math.floor(
      totalSeconds % 60
    );

  const tenths =
    Math.floor(
      (
        totalSeconds -
        Math.floor(totalSeconds)
      ) * 10
    );

  return (
    String(minutes)
      .padStart(2, '0') +
    ':' +
    String(seconds)
      .padStart(2, '0') +
    '.' +
    tenths
  );
}

function displayDate(value) {
  const parts =
    String(value || '')
      .split('-');

  if (parts.length !== 3) {
    return value;
  }

  return (
    parts[2] +
    '/' +
    parts[1] +
    '/' +
    parts[0]
  );
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
