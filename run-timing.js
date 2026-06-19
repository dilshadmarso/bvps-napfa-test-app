const GOOGLE_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbyjiK1MWx30tV0wxZsTf5k5OLaGbQsvbCNacuBO8Ypa7lNTDMK46BRZY0T3Vn3dgP3X/exec';

const RUN_DRAFT_KEY =
  'BVPS_NAPFA_RUN_DRAFT_V5';

const SETTINGS_KEY =
  'BVPS_NAPFA_SETTINGS_V1';

const COMPLETED_BACKUP_MS =
  24 * 60 * 60 * 1000;

const API_TIMEOUT_MS =
  20000;

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


/* =====================================================
   PAGE EVENTS
===================================================== */

window.addEventListener(
  'load',
  initialisePage
);

window.addEventListener(
  'beforeunload',
  handleBeforeUnload
);

window.addEventListener(
  'online',
  () => {
    if (
      assignmentsConfirmed &&
      !sessionSetupSynced &&
      !sessionSetupSyncing
    ) {
      syncSessionSetupInBackground();
    }
  }
);

document.addEventListener(
  'visibilitychange',
  async () => {
    if (
      document.visibilityState === 'visible' &&
      waveStarted &&
      !waveEnded
    ) {
      await requestWakeLock();
    }
  }
);


/* =====================================================
   INITIALISE
===================================================== */

async function initialisePage() {
  setToday();
  cleanupExpiredBackup();

  const restored =
    restoreDraft();

  if (!restored) {
    await loadSetupData();
  }
}


function setToday() {
  const date = new Date();

  document.getElementById(
    'testDate'
  ).value =
    date.getFullYear() +
    '-' +
    String(
      date.getMonth() + 1
    ).padStart(2, '0') +
    '-' +
    String(
      date.getDate()
    ).padStart(2, '0');
}


/* =====================================================
   API
===================================================== */

async function api(
  payload,
  timeoutMs = API_TIMEOUT_MS
) {
  const controller =
    new AbortController();

  const timeoutId =
    window.setTimeout(() => {
      controller.abort();
    }, timeoutMs);

  try {
    const response = await fetch(
      GOOGLE_APPS_SCRIPT_URL,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'text/plain;charset=utf-8'
        },

        body:
          JSON.stringify(payload),

        signal:
          controller.signal,

        cache:
          'no-store'
      }
    );

    const text =
      await response.text();

    let result;

    try {
      result =
        JSON.parse(text);

    } catch (error) {
      throw new Error(
        'Backend returned an invalid response.'
      );
    }

    if (!result.success) {
      throw new Error(
        result.error ||
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
    window.clearTimeout(
      timeoutId
    );
  }
}


/* =====================================================
   LOADING AND BASIC DISPLAY
===================================================== */

function showLoading(text) {
  document.getElementById(
    'loadingText'
  ).textContent = text;

  document.getElementById(
    'loading'
  ).classList.remove('hidden');
}


function hideLoading() {
  document.getElementById(
    'loading'
  ).classList.add('hidden');
}


function setText(id, value) {
  const element =
    document.getElementById(id);

  if (element) {
    element.textContent =
      String(value ?? '');
  }
}


/* =====================================================
   LOAD SETUP DATA
===================================================== */

async function loadSetupData() {
  showLoading(
    'Loading classes…'
  );

  try {
    const result =
      await api({
        action:
          'getStationSetupData'
      });

    setupData = result;

    const levelSelect =
      document.getElementById(
        'levelSelect'
      );

    levelSelect.innerHTML =
      '<option value="">Select level</option>';

    (result.levels || [])
      .forEach(level => {
        levelSelect.add(
          new Option(
            level,
            level
          )
        );
      });

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
    document.getElementById(
      'levelSelect'
    ).value;

  const classSelect =
    document.getElementById(
      'classSelect'
    );

  classSelect.innerHTML =
    '<option value="">Select class</option>';

  (
    setupData.classesByLevel?.[level] ||
    []
  ).forEach(className => {
    classSelect.add(
      new Option(
        className,
        className
      )
    );
  });
}


/* =====================================================
   LOAD CLASS
===================================================== */

async function loadClassStudents() {
  const date =
    document.getElementById(
      'testDate'
    ).value;

  const className =
    document.getElementById(
      'classSelect'
    ).value;

  if (!date || !className) {
    alert(
      'Please select the test date, level and class.'
    );

    return;
  }

  const button =
    document.getElementById(
      'loadClassBtn'
    );

  button.disabled = true;

  showLoading(
    'Loading pupils…'
  );

  try {
    const result =
      await api({
        action:
          'getRunStudentsByClass',

        className:
          className
      });

    students =
      (result.students || [])
        .map(student => ({
          ...student,

          assignment:
            '',

          notRunningReason:
            ''
        }));

    if (!students.length) {
      throw new Error(
        'No pupils found.'
      );
    }

    selectedTestDate =
      date;

    selectedClass =
      className;

    sessionId =
      createSessionId(
        className
      );

    assignmentsConfirmed =
      false;

    sessionSetupSynced =
      false;

    sessionSetupSyncing =
      false;

    sessionSetupSyncError =
      '';

    showPanel(
      'assignmentPanel'
    );

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
    className.replace(
      /[^A-Za-z0-9]/g,
      ''
    ) +
    '-' +
    Date.now() +
    '-' +
    Math.random()
      .toString(36)
      .slice(2, 7)
      .toUpperCase()
  );
}


/* =====================================================
   ASSIGNMENTS
===================================================== */

function renderAssignments() {
  const grid =
    document.getElementById(
      'assignmentGrid'
    );

  grid.innerHTML = '';

  students.forEach(
    (student, index) => {
      const card =
        document.createElement(
          'article'
        );

      card.className =
        'assignment-card';

      card.innerHTML = `
        <div class="student-header">
          <div class="student-number">
            ${escapeHtml(student.No)}
          </div>

          <div class="student-name">
            ${escapeHtml(student.Name)}
          </div>
        </div>

        <div class="assignment-actions">
          <button
            class="wave-one-button ${
              student.assignment === 'Wave 1'
                ? 'active'
                : ''
            }"
            type="button"
            onclick="setAssignment(${index}, 'Wave 1')"
          >
            Wave 1
          </button>

          <button
            class="wave-two-button ${
              student.assignment === 'Wave 2'
                ? 'active'
                : ''
            }"
            type="button"
            onclick="setAssignment(${index}, 'Wave 2')"
          >
            Wave 2
          </button>

          <button
            class="not-running-button ${
              student.assignment === 'Not Running'
                ? 'active'
                : ''
            }"
            type="button"
            onclick="setAssignment(${index}, 'Not Running')"
          >
            Not Running
          </button>
        </div>

        ${
          student.assignment ===
          'Not Running'
            ? renderReasonSelect(
                student,
                index
              )
            : ''
        }
      `;

      grid.appendChild(card);
    }
  );

  updateAssignmentSummary();
}


function renderReasonSelect(
  student,
  index
) {
  const options =
    NOT_RUNNING_REASONS
      .map(reason => {
        const selected =
          student.notRunningReason ===
          reason
            ? 'selected'
            : '';

        return `
          <option
            value="${escapeHtml(reason)}"
            ${selected}
          >
            ${escapeHtml(reason)}
          </option>
        `;
      })
      .join('');

  return `
    <select
      class="reason-select"
      onchange="setReason(${index}, this.value)"
    >
      <option value="">
        Select reason
      </option>

      ${options}
    </select>
  `;
}


function setAssignment(
  index,
  value
) {
  students[index].assignment =
    students[index].assignment === value
      ? ''
      : value;

  if (
    students[index].assignment !==
    'Not Running'
  ) {
    students[index].notRunningReason =
      '';
  }

  renderAssignments();
  saveDraft();
}


function setReason(
  index,
  value
) {
  students[index].notRunningReason =
    value;

  updateAssignmentSummary();
  saveDraft();
}


function autoAssignWaves() {
  let runningIndex = 0;

  students.forEach(student => {
    if (
      student.assignment !==
      'Not Running'
    ) {
      student.assignment =
        runningIndex % 2 === 0
          ? 'Wave 1'
          : 'Wave 2';

      runningIndex++;
    }
  });

  renderAssignments();
  saveDraft();
}


function resetAssignments() {
  const confirmed =
    confirm(
      'Clear all assignments?'
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
  const countAssignment =
    assignment => {
      return students.filter(
        student => {
          return (
            student.assignment ===
            assignment
          );
        }
      ).length;
    };

  const unassigned =
    students.filter(student => {
      return !student.assignment;
    }).length;

  document.getElementById(
    'assignmentSummary'
  ).innerHTML = `
    <div class="information">
      Wave 1:
      <strong>
        ${countAssignment('Wave 1')}
      </strong>

      · Wave 2:
      <strong>
        ${countAssignment('Wave 2')}
      </strong>

      · Not Running:
      <strong>
        ${countAssignment('Not Running')}
      </strong>

      · Unassigned:
      <strong>
        ${unassigned}
      </strong>
    </div>
  `;
}


/* =====================================================
   CONFIRM ASSIGNMENTS
===================================================== */

function confirmAssignments() {
  const unassigned =
    students.filter(student => {
      return !student.assignment;
    });

  if (unassigned.length) {
    alert(
      `${unassigned.length} pupil(s) are unassigned.`
    );

    return;
  }

  const noReason =
    students.filter(student => {
      return (
        student.assignment ===
          'Not Running' &&
        !student.notRunningReason
      );
    });

  if (noReason.length) {
    alert(
      'Select a reason for every Not Running pupil.'
    );

    return;
  }

  const hasRunner =
    students.some(student => {
      return (
        student.assignment ===
          'Wave 1' ||
        student.assignment ===
          'Wave 2'
      );
    });

  if (!hasRunner) {
    alert(
      'At least one pupil must be assigned to a wave.'
    );

    return;
  }

  assignmentsConfirmed =
    true;

  currentWave =
    students.some(student => {
      return (
        student.assignment ===
        'Wave 1'
      );
    })
      ? 'Wave 1'
      : 'Wave 2';

  sessionSetupSynced =
    false;

  sessionSetupSyncing =
    false;

  sessionSetupSyncError =
    '';

  /*
   * Save assignments locally before changing screen.
   */
  saveDraft();

  /*
   * Open Wave 1 immediately.
   */
  prepareWave();

  updateSaveStatus(
    'Saved on device · syncing…',
    'pending'
  );

  setRetrySetupSyncVisible(
    false
  );

  /*
   * Background request. Do not await.
   */
  syncSessionSetupInBackground();
}


/* =====================================================
   SESSION SETUP BACKGROUND SYNC
===================================================== */

function createSessionSetupPayload() {
  return {
    action:
      'saveRunSessionSetupBatch',

    sessionId:
      sessionId,

    testDate:
      selectedTestDate,

    className:
      selectedClass,

    mode:
      '1.6km Run',

    students:
      students.map(student => ({
        No:
          student.No,

        ID:
          student.ID,

        Name:
          student.Name,

        Gender:
          student.Gender,

        DOB:
          student.DOB,

        assignment:
          student.assignment,

        notRunningReason:
          student.notRunningReason ||
          ''
      }))
  };
}


function syncSessionSetupInBackground() {
  if (sessionSetupSyncing) {
    return sessionSetupSyncPromise;
  }

  if (sessionSetupSynced) {
    return Promise.resolve({
      success: true
    });
  }

  sessionSetupSyncing =
    true;

  sessionSetupSyncError =
    '';

  updateSaveStatus(
    'Saved on device · syncing session…',
    'pending'
  );

  setRetrySetupSyncVisible(
    false
  );

  saveDraft();

  sessionSetupSyncPromise =
    api(
      createSessionSetupPayload(),
      API_TIMEOUT_MS
    )
      .then(result => {
        sessionSetupSynced =
          true;

        sessionSetupSyncError =
          '';

        updateSaveStatus(
          'Session synced',
          'saved'
        );

        setRetrySetupSyncVisible(
          false
        );

        saveDraft();

        return result;
      })
      .catch(error => {
        sessionSetupSynced =
          false;

        sessionSetupSyncError =
          error.message ||
          'Session sync failed.';

        updateSaveStatus(
          'Saved on device · sync failed',
          'failed'
        );

        setRetrySetupSyncVisible(
          true
        );

        saveDraft();

        return {
          success: false,
          error:
            sessionSetupSyncError
        };
      })
      .finally(() => {
        sessionSetupSyncing =
          false;

        sessionSetupSyncPromise =
          null;
      });

  return sessionSetupSyncPromise;
}


async function retrySessionSetupSync() {
  if (sessionSetupSyncing) {
    return;
  }

  const button =
    document.getElementById(
      'retrySetupSyncBtn'
    );

  button.disabled = true;

  updateSaveStatus(
    'Retrying session sync…',
    'pending'
  );

  try {
    const result =
      await syncSessionSetupInBackground();

    if (!result.success) {
      alert(
        'The session could not be synced yet. It remains safely stored on this device.'
      );
    }

  } finally {
    button.disabled = false;
  }
}


function setRetrySetupSyncVisible(
  visible
) {
  const button =
    document.getElementById(
      'retrySetupSyncBtn'
    );

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


/* =====================================================
   PREPARE WAVE
===================================================== */

function prepareWave() {
  stopTimer();

  waveStarted = false;
  waveEnded = false;
  waveSaved = false;

  startPerformanceTime = null;
  startWallClock = null;

  currentWaveResults = [];

  showPanel(
    'timingPanel'
  );

  setText(
    'sessionText',
    `${selectedClass} · ${currentWave} · ${displayDate(selectedTestDate)}`
  );

  setText(
    'timerValue',
    '00:00.0'
  );

  document.getElementById(
    'startWaveBtn'
  ).disabled = false;

  document.getElementById(
    'endWaveBtn'
  ).disabled = true;

  document.getElementById(
    'undoBtn'
  ).disabled = true;

  if (sessionSetupSynced) {
    updateSaveStatus(
      'Session synced',
      'saved'
    );

    setRetrySetupSyncVisible(
      false
    );

  } else if (sessionSetupSyncing) {
    updateSaveStatus(
      'Saved on device · syncing session…',
      'pending'
    );

    setRetrySetupSyncVisible(
      false
    );

  } else if (sessionSetupSyncError) {
    updateSaveStatus(
      'Saved on device · sync failed',
      'failed'
    );

    setRetrySetupSyncVisible(
      true
    );

  } else {
    updateSaveStatus(
      'Saved on device',
      ''
    );

    setRetrySetupSyncVisible(
      false
    );
  }

  renderRunners();
  saveDraft();
}


function currentRunners() {
  return students.filter(student => {
    return (
      student.assignment ===
      currentWave
    );
  });
}


/* =====================================================
   RUNNER BUTTONS
===================================================== */

function renderRunners() {
  const grid =
    document.getElementById(
      'runnerGrid'
    );

  grid.innerHTML = '';

  currentRunners()
    .forEach(student => {
      const finish =
        currentWaveResults.find(
          result => {
            return (
              String(
                result.student.ID
              ) ===
              String(student.ID)
            );
          }
        );

      const button =
        document.createElement(
          'button'
        );

      button.className =
        'runner-button' +
        (
          finish
            ? ' finished'
            : ''
        );

      button.disabled =
        !waveStarted ||
        waveEnded ||
        Boolean(finish);

      button.type =
        'button';

      button.onclick =
        () => {
          recordFinish(
            student
          );
        };

      button.innerHTML =
        finish
          ? `
            <div class="runner-number">
              No. ${escapeHtml(student.No)}
            </div>

            <div class="runner-position">
              #${finish.position}
            </div>

            <div class="runner-time">
              ${formatTime(finish.elapsedSeconds)}
            </div>

            <div class="runner-name">
              ${escapeHtml(student.Name)}
            </div>
          `
          : `
            <div class="runner-number">
              No. ${escapeHtml(student.No)}
            </div>

            <div class="runner-name">
              ${escapeHtml(student.Name)}
            </div>

            <div class="runner-time">
              Tap at finish
            </div>
          `;

      grid.appendChild(
        button
      );
    });

  setText(
    'finishedCount',
    `Finished: ${currentWaveResults.length} / ${currentRunners().length}`
  );
}


/* =====================================================
   TIMER
===================================================== */

async function startCurrentWave() {
  if (waveStarted) {
    return;
  }

  const confirmed =
    confirm(
      `Start ${currentWave} now?`
    );

  if (!confirmed) {
    return;
  }

  await requestWakeLock();
  unlockAudio();

  startPerformanceTime =
    performance.now();

  startWallClock =
    Date.now();

  waveStarted =
    true;

  waveEnded =
    false;

  waveSaved =
    false;

  currentWaveResults =
    [];

  document.getElementById(
    'startWaveBtn'
  ).disabled = true;

  document.getElementById(
    'endWaveBtn'
  ).disabled = false;

  updateSaveStatus(
    sessionSetupSynced
      ? 'Timing · session synced'
      : 'Timing · saved locally',
    sessionSetupSynced
      ? 'saved'
      : 'pending'
  );

  animateTimer();
  renderRunners();
  saveDraft();
}


function elapsedNow() {
  if (
    startPerformanceTime !== null
  ) {
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
  if (
    !waveStarted ||
    waveEnded
  ) {
    return;
  }

  setText(
    'timerValue',
    formatTenths(
      elapsedNow()
    )
  );

  timerFrame =
    requestAnimationFrame(
      animateTimer
    );
}


function stopTimer() {
  if (timerFrame) {
    cancelAnimationFrame(
      timerFrame
    );
  }

  timerFrame = null;
}


/* =====================================================
   CAPTURE FINISHES
===================================================== */

function recordFinish(student) {
  if (
    !waveStarted ||
    waveEnded
  ) {
    return;
  }

  const alreadyFinished =
    currentWaveResults.some(
      result => {
        return (
          String(
            result.student.ID
          ) ===
          String(student.ID)
        );
      }
    );

  if (alreadyFinished) {
    return;
  }

  const result = {
    student:
      student,

    elapsedSeconds:
      Number(
        elapsedNow().toFixed(2)
      ),

    position:
      currentWaveResults.length + 1,

    attemptNo:
      1,

    remarks:
      ''
  };

  currentWaveResults.push(
    result
  );

  /*
   * Immediate local backup.
   */
  saveDraft();

  vibrate(50);
  playTone(
    620,
    0.045
  );

  document.getElementById(
    'undoBtn'
  ).disabled = false;

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
      result.position =
        index + 1;
    }
  );

  vibrate([
    30,
    30,
    30
  ]);

  document.getElementById(
    'undoBtn'
  ).disabled =
    currentWaveResults.length === 0;

  renderRunners();
  saveDraft();
}


function endCurrentWave() {
  if (
    !waveStarted ||
    waveEnded
  ) {
    return;
  }

  const unfinished =
    currentRunners()
      .filter(student => {
        return !currentWaveResults
          .some(result => {
            return (
              String(
                result.student.ID
              ) ===
              String(student.ID)
            );
          });
      });

  if (unfinished.length) {
    const message =
      `End ${currentWave} with ` +
      `${unfinished.length} unfinished pupil(s)?\n\n` +
      unfinished
        .map(student => {
          return (
            `No. ${student.No} ` +
            `${student.Name}`
          );
        })
        .join('\n');

    if (!confirm(message)) {
      return;
    }
  }

  waveEnded = true;

  stopTimer();
  releaseWakeLock();

  document.getElementById(
    'endWaveBtn'
  ).disabled = true;

  showReview();
  saveDraft();
}


/* =====================================================
   REVIEW
===================================================== */

function showReview() {
  showPanel(
    'reviewPanel'
  );

  setText(
    'reviewTitle',
    `Review ${currentWave}`
  );

  const body =
    document.getElementById(
      'reviewBody'
    );

  body.innerHTML = '';

  currentWaveResults
    .forEach(result => {
      const row =
        document.createElement(
          'tr'
        );

      row.innerHTML = `
        <td>
          ${result.position}
        </td>

        <td>
          ${escapeHtml(result.student.No)}
        </td>

        <td>
          <strong>
            ${escapeHtml(result.student.Name)}
          </strong>
        </td>

        <td>
          ${formatTime(result.elapsedSeconds)}
        </td>

        <td>
          ${
            escapeHtml(
              result.grade ||
              'Calculated on save'
            )
          }
        </td>
      `;

      body.appendChild(row);
    });

  document.getElementById(
    'saveWaveBtn'
  ).classList.toggle(
    'hidden',
    waveSaved
  );

  document.getElementById(
    'returnTimingBtn'
  ).classList.toggle(
    'hidden',
    waveSaved
  );

  document.getElementById(
    'nextWaveBtn'
  ).classList.add(
    'hidden'
  );

  document.getElementById(
    'completeBtn'
  ).classList.add(
    'hidden'
  );

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

  showPanel(
    'timingPanel'
  );

  renderRunners();
}


/* =====================================================
   SAVE WAVE IN ONE BATCH
===================================================== */

async function saveCurrentWave() {
  if (
    saveInProgress ||
    !currentWaveResults.length
  ) {
    return;
  }

  saveInProgress =
    true;

  const button =
    document.getElementById(
      'saveWaveBtn'
    );

  button.disabled =
    true;

  /*
   * Make sure the session setup exists before
   * the wave is written.
   */
  if (!sessionSetupSynced) {
    setText(
      'reviewMessage',
      'Syncing the session setup before saving the wave…'
    );

    const syncResult =
      await syncSessionSetupInBackground();

    if (!syncResult.success) {
      saveInProgress =
        false;

      button.disabled =
        false;

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
    const result =
      await api({
        action:
          'saveRunWaveBatch',

        sessionId:
          sessionId,

        testDate:
          selectedTestDate,

        className:
          selectedClass,

        wave:
          currentWave,

        results:
          currentWaveResults
            .map(runResult => ({
              student:
                runResult.student,

              elapsedSeconds:
                runResult.elapsedSeconds,

              attemptNo:
                runResult.attemptNo,

              remarks:
                runResult.remarks
            }))
      });

    const resultMap =
      new Map(
        (result.results || [])
          .map(item => [
            String(item.ID),
            item
          ])
      );

    currentWaveResults
      .forEach(runResult => {
        const savedResult =
          resultMap.get(
            String(
              runResult.student.ID
            )
          );

        if (savedResult) {
          runResult.grade =
            savedResult.Grade;

          runResult.time =
            savedResult.Time;
        }
      });

    if (
      currentWave ===
      'Wave 1'
    ) {
      waveOneResults =
        currentWaveResults
          .map(result => ({
            ...result
          }));

    } else {
      waveTwoResults =
        currentWaveResults
          .map(result => ({
            ...result
          }));
    }

    waveSaved =
      true;

    updateSaveStatus(
      'Saved to Google Sheets',
      'saved'
    );

    vibrate(90);

    playTone(
      820,
      0.10
    );

    saveDraft();
    showReview();

  } catch (error) {
    updateSaveStatus(
      'Save failed · retry',
      'failed'
    );

    vibrate([
      80,
      60,
      80
    ]);

    setText(
      'reviewMessage',
      'Save failed. Results remain safely stored on this device. Press Save Wave Results again.'
    );

    alert(
      error.message
    );

  } finally {
    saveInProgress =
      false;

    button.disabled =
      false;
  }
}


function showPostSaveButtons() {
  const hasWaveTwo =
    students.some(student => {
      return (
        student.assignment ===
        'Wave 2'
      );
    });

  if (
    currentWave ===
      'Wave 1' &&
    hasWaveTwo
  ) {
    document.getElementById(
      'nextWaveBtn'
    ).classList.remove(
      'hidden'
    );

  } else {
    document.getElementById(
      'completeBtn'
    ).classList.remove(
      'hidden'
    );
  }
}


function moveToNextWave() {
  if (!waveSaved) {
    return;
  }

  currentWave =
    'Wave 2';

  prepareWave();
}


/* =====================================================
   COMPLETE SESSION
   
===================================================== */

function completeSession() {
  if (
    saveInProgress ||
    !waveSaved
  ) {
    return;
  }

  const hasWaveOne =
    students.some(student => {
      return (
        student.assignment ===
        'Wave 1'
      );
    });

  const hasWaveTwo =
    students.some(student => {
      return (
        student.assignment ===
        'Wave 2'
      );
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

  if (
    !sessionSetupSynced
  ) {
    alert(
      'The session setup has not finished syncing. Press Retry Sync before completing the session.'
    );

    setRetrySetupSyncVisible(
      true
    );

    return;
  }

  const confirmed =
    confirm(
      'Complete this run session?\n\n' +
      'All wave results have already been saved to Google Sheets.'
    );

  if (!confirmed) {
    return;
  }

  /*
   * No Apps Script request here.
   * The wave results are already stored.
   */
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

  playTone(
    880,
    0.12
  );

  showPanel(
    'completionPanel'
  );
}


/* =====================================================
   LOCAL BACKUP
===================================================== */

function buildDraft() {
  return {
    version:
      5,

    savedAt:
      new Date().toISOString(),

    completed:
      false,

    students:
      students,

    sessionId:
      sessionId,

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
  localStorage.setItem(
    RUN_DRAFT_KEY,
    JSON.stringify(
      buildDraft()
    )
  );
}


function markDraftCompleted() {
  const draft =
    buildDraft();

  draft.completed =
    true;

  draft.completedAt =
    new Date().toISOString();

  localStorage.setItem(
    RUN_DRAFT_KEY,
    JSON.stringify(draft)
  );
}


function cleanupExpiredBackup() {
  try {
    const draft =
      JSON.parse(
        localStorage.getItem(
          RUN_DRAFT_KEY
        ) ||
        'null'
      );

    if (
      draft?.completed &&
      Date.now() -
        new Date(
          draft.completedAt
        ).getTime() >
        COMPLETED_BACKUP_MS
    ) {
      localStorage.removeItem(
        RUN_DRAFT_KEY
      );
    }

  } catch (error) {
    // Keep any unreadable backup untouched.
  }
}


/* =====================================================
   RESTORE SESSION
===================================================== */

function restoreDraft() {
  let draft;

  try {
    draft =
      JSON.parse(
        localStorage.getItem(
          RUN_DRAFT_KEY
        ) ||
        'null'
      );

  } catch (error) {
    return false;
  }

  if (
    !draft?.sessionId ||
    !Array.isArray(
      draft.students
    )
  ) {
    return false;
  }

  const backupLabel =
    draft.completed
      ? 'completed backup'
      : 'saved session';

  const restore =
    confirm(
      `A ${backupLabel} for ${draft.selectedClass} was found.\n` +
      `Last backup: ${new Date(draft.savedAt).toLocaleString()}\n\n` +
      'Resume it?'
    );

  if (!restore) {
    return false;
  }

  students =
    draft.students;

  sessionId =
    draft.sessionId;

  selectedTestDate =
    draft.selectedTestDate;

  selectedClass =
    draft.selectedClass;

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

  sessionSetupSyncing =
    false;

  sessionSetupSyncPromise =
    null;

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

  currentWaveResults =
    draft.currentWaveResults ||
    [];

  waveOneResults =
    draft.waveOneResults ||
    [];

  waveTwoResults =
    draft.waveTwoResults ||
    [];

  if (draft.completed) {
    setText(
      'completionSummary',
      `${selectedClass} completed backup restored.`
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
    waveStarted =
      false;

    showReview();
    resumePendingSessionSync();

    return true;
  }

  if (draft.waveStarted) {
    waveStarted =
      true;

    waveEnded =
      false;

    /*
     * performance.now() cannot survive a refresh.
     * Use the saved wall-clock start time instead.
     */
    startPerformanceTime =
      null;

    showPanel(
      'timingPanel'
    );

    setText(
      'sessionText',
      `${selectedClass} · ${currentWave} · ${displayDate(selectedTestDate)}`
    );

    document.getElementById(
      'startWaveBtn'
    ).disabled = true;

    document.getElementById(
      'endWaveBtn'
    ).disabled = false;

    document.getElementById(
      'undoBtn'
    ).disabled =
      !currentWaveResults.length;

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
  localStorage.removeItem(
    RUN_DRAFT_KEY
  );

  location.reload();
}


/* =====================================================
   SAFE NAVIGATION
===================================================== */

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

  location.href =
    'index.html';
}


function handleBackNavigation() {
  if (!canLeave()) {
    return;
  }

  if (history.length > 1) {
    history.back();

  } else {
    location.href =
      'index.html';
  }
}


function canLeave() {
  if (saveInProgress) {
    alert(
      'Results are saving. Keep this page open.'
    );

    return false;
  }

  if (
    waveStarted &&
    !waveEnded
  ) {
    alert(
      'A wave is running. End the wave before leaving.'
    );

    return false;
  }

  if (
    hasActiveData() &&
    !confirm(
      'Leave this page? The current session remains backed up on this device.'
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


/* =====================================================
   WAKE LOCK
===================================================== */

async function requestWakeLock() {
  if (!getSettings().keepAwake) {
    return;
  }

  try {
    if (
      'wakeLock' in navigator
    ) {
      wakeLock =
        await navigator.wakeLock
          .request('screen');
    }

  } catch (error) {
    // Wake Lock is optional.
  }
}


function releaseWakeLock() {
  try {
    wakeLock?.release();

  } catch (error) {
    // Ignore release failures.
  }

  wakeLock = null;
}


/* =====================================================
   SOUND AND VIBRATION
===================================================== */

function getSettings() {
  try {
    return {
      vibration:
        true,

      sounds:
        false,

      keepAwake:
        true,

      ...JSON.parse(
        localStorage.getItem(
          SETTINGS_KEY
        ) ||
        '{}'
      )
    };

  } catch (error) {
    return {
      vibration:
        true,

      sounds:
        false,

      keepAwake:
        true
    };
  }
}


function vibrate(pattern) {
  if (
    getSettings().vibration &&
    navigator.vibrate
  ) {
    navigator.vibrate(
      pattern
    );
  }
}


function unlockAudio() {
  if (!getSettings().sounds) {
    return;
  }

  audioContext ||=
    new (
      window.AudioContext ||
      window.webkitAudioContext
    )();

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
    // Audio feedback is optional.
  }
}


/* =====================================================
   DISPLAY HELPERS
===================================================== */

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

  element.textContent =
    text;

  element.className =
    'status-badge' +
    (
      state
        ? ' ' + state
        : ''
    );
}


function showPanel(id) {
  [
    'setupPanel',
    'assignmentPanel',
    'timingPanel',
    'reviewPanel',
    'completionPanel'
  ].forEach(panelId => {
    document.getElementById(
      panelId
    ).classList.toggle(
      'hidden',
      panelId !== id
    );
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
        totalSeconds % 1
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
    String(value)
      .split('-');

  return parts.length === 3
    ? (
        parts[2] +
        '/' +
        parts[1] +
        '/' +
        parts[0]
      )
    : value;
}


function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll(
      '&',
      '&amp;'
    )
    .replaceAll(
      '<',
      '&lt;'
    )
    .replaceAll(
      '>',
      '&gt;'
    )
    .replaceAll(
      '"',
      '&quot;'
    )
    .replaceAll(
      "'",
      '&#039;'
    );
}
