<!DOCTYPE html>
<html>
<head>
  <title>BVPS NAPFA 1.6 km Run Timing</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      font-family: Arial, sans-serif;
      margin: 0;
      background: #f5f7fb;
      color: #222;
    }

    .page {
      max-width: 1100px;
      margin: auto;
      padding: 16px;
    }

    .header {
      background: #1f3c88;
      color: white;
      padding: 20px;
      border-radius: 18px;
      margin-bottom: 16px;
    }

    .header h1 {
      margin: 0;
      font-size: 26px;
    }

    .header p {
      margin: 8px 0 0;
      opacity: 0.9;
    }

    .step-tabs {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 16px;
    }

    .step-tab {
      background: #e9edf7;
      color: #1f3c88;
      border: none;
      border-radius: 14px;
      padding: 12px;
      font-weight: bold;
      cursor: pointer;
    }

    .step-tab.active {
      background: #1f3c88;
      color: white;
    }

    .card {
      background: white;
      border-radius: 18px;
      padding: 18px;
      margin-bottom: 18px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.07);
    }

    .hidden {
      display: none;
    }

    .card h2 {
      margin-top: 0;
      font-size: 21px;
      color: #1f3c88;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
      align-items: end;
    }

    label {
      font-weight: bold;
      font-size: 14px;
      display: block;
      margin-bottom: 6px;
    }

    select,
    input {
      width: 100%;
      padding: 11px;
      font-size: 16px;
      border-radius: 10px;
      border: 1px solid #c9cdd6;
      background: white;
    }

    button {
      border: none;
      border-radius: 12px;
      padding: 12px 16px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
    }

    .primary-btn {
      background: #1f3c88;
      color: white;
    }

    .secondary-btn {
      background: #e9edf7;
      color: #1f3c88;
    }

    .danger-btn {
      background: #ffe3e3;
      color: #b00020;
    }

    .status {
      margin-top: 12px;
      font-weight: bold;
      color: #333;
    }

    .hint {
      background: #eef3ff;
      border-left: 5px solid #1f3c88;
      padding: 12px;
      border-radius: 10px;
      margin-bottom: 14px;
      font-size: 15px;
    }

    .summary-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 10px;
      margin-top: 12px;
      margin-bottom: 12px;
    }

    .summary-box {
      background: #f8fafc;
      border-radius: 14px;
      padding: 12px;
      text-align: center;
      border: 1px solid #e2e8f0;
    }

    .summary-number {
      font-size: 28px;
      font-weight: bold;
      display: block;
    }

    .bubble-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }

    .student-bubble {
      border: 2px solid #cbd5e0;
      border-radius: 20px;
      padding: 14px 10px;
      min-height: 105px;
      cursor: pointer;
      background: white;
      text-align: center;
      user-select: none;
      transition: 0.15s;
    }

    .student-bubble:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    }

    .student-bubble .reg-no {
      font-size: 30px;
      font-weight: 800;
      display: block;
      line-height: 1;
    }

    .student-bubble .student-name {
      font-size: 13px;
      font-weight: bold;
      display: block;
      margin-top: 8px;
      min-height: 32px;
    }

    .student-bubble .bubble-status {
      font-size: 13px;
      display: inline-block;
      margin-top: 8px;
      padding: 4px 9px;
      border-radius: 999px;
      background: rgba(255,255,255,0.75);
    }

    .student-bubble.blank {
      background: #f8fafc;
      border-color: #cbd5e0;
    }

    .student-bubble.wave1 {
      background: #dcfce7;
      border-color: #37a169;
    }

    .timer-area {
      text-align: center;
    }

    .timer-display {
      font-size: 68px;
      font-weight: 900;
      margin: 14px auto;
      padding: 18px;
      background: #111827;
      color: white;
      border-radius: 20px;
      max-width: 320px;
      letter-spacing: 2px;
    }

    .timer-controls {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      margin-bottom: 12px;
    }

    .runner-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(185px, 1fr));
      gap: 12px;
      margin-top: 18px;
    }

    .runner-btn {
      font-size: 18px;
      min-height: 115px;
      border-radius: 18px;
      background: white;
      border: 2px solid #cbd5e0;
      color: #111827;
      padding: 12px;
    }

    .runner-btn .runner-no {
      font-size: 36px;
      font-weight: 900;
      display: block;
      margin-bottom: 6px;
    }

    .runner-btn.finished {
      background: #dcfce7;
      border-color: #37a169;
      color: #22543d;
    }

    .runner-btn.save-failed {
      background: #ffe3e3;
      border-color: #e53e3e;
      color: #7f1d1d;
    }

    .save-status-box {
      background: #f8fafc;
      border-radius: 14px;
      padding: 12px;
      border: 1px solid #e2e8f0;
      margin-top: 10px;
      text-align: left;
    }

    .remaining-row {
      display: grid;
      grid-template-columns: 70px 1fr 240px;
      gap: 10px;
      align-items: center;
      padding: 10px;
      border-bottom: 1px solid #e5e7eb;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 14px;
    }

    th,
    td {
      border: 1px solid #d1d5db;
      padding: 8px;
      text-align: left;
    }

    th {
      background: #f3f4f6;
    }

    @media (max-width: 700px) {
      .page {
        padding: 10px;
      }

      .header h1 {
        font-size: 22px;
      }

      .step-tabs {
        grid-template-columns: repeat(2, 1fr);
      }

      .timer-display {
        font-size: 52px;
      }

      .remaining-row {
        grid-template-columns: 1fr;
      }

      .bubble-grid {
        grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      }

      .runner-grid {
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      }
    }
  </style>
</head>

<body>
  <div class="page">
    <div class="header">
      <h1>BVPS NAPFA 1.6 km Run Timing</h1>
      <p>Capture finish times instantly. Results save in the background.</p>
    </div>

    <div class="step-tabs">
      <button class="step-tab active" id="tab-setup" onclick="showStep('setup')">1. Setup</button>
      <button class="step-tab" id="tab-assign" onclick="showStep('assign')">2. Wave 1</button>
      <button class="step-tab" id="tab-timing" onclick="showStep('timing')">3. Timing</button>
      <button class="step-tab" id="tab-review" onclick="showStep('review')">4. Review</button>
    </div>

    <div class="card step-card" id="step-setup">
      <h2>1. Setup</h2>

      <div class="form-grid">
        <div>
          <label>Test Date</label>
          <input type="date" id="testDate">
        </div>

        <div>
          <label>Level</label>
          <select id="levelSelect" onchange="loadClasses()">
            <option value="">Select level</option>
          </select>
        </div>

        <div>
          <label>Class</label>
          <select id="classSelect" onchange="loadRunStudents()">
            <option value="">Select class</option>
          </select>
        </div>
      </div>

      <p class="status" id="setupStatus"></p>

      <button class="primary-btn" onclick="showStep('assign')">
        Next: Select Wave 1
      </button>
    </div>

    <div class="card step-card hidden" id="step-assign">
      <h2>2. Select Wave 1 Pupils</h2>

      <div class="hint">
        Tap pupils who will run in <strong>Wave 1</strong>. Pupils left blank will automatically become <strong>Wave 2</strong>.
        Not participating reasons can be marked later.
      </div>

      <div class="summary-strip">
        <div class="summary-box">
          <span class="summary-number" id="wave1Count">0</span>
          Wave 1
        </div>
        <div class="summary-box">
          <span class="summary-number" id="wave2Count">0</span>
          Wave 2 by default
        </div>
      </div>

      <button class="primary-btn" onclick="saveWaveAssignments()">
        Save Wave Assignments
      </button>

      <button class="secondary-btn" onclick="showStep('timing')">
        Go to Timing
      </button>

      <div id="studentAssignmentList" class="bubble-grid"></div>
    </div>

    <div class="card step-card hidden timer-area" id="step-timing">
      <h2>3. Timing</h2>

      <div class="form-grid">
        <div>
          <label>Current Wave</label>
          <select id="waveSelect" onchange="prepareWaveButtons()">
            <option value="Wave 1">Wave 1</option>
            <option value="Wave 2">Wave 2</option>
          </select>
        </div>

        <div>
          <button class="primary-btn" onclick="startWave()">Start Wave</button>
        </div>

        <div>
          <button class="danger-btn" onclick="endWave()">End Wave</button>
        </div>
      </div>

      <div class="timer-display" id="timerDisplay">00:00</div>

      <p class="status" id="timerStatus"></p>

      <div class="save-status-box">
        <strong>Save Queue:</strong>
        <span id="queueStatus">No pending saves.</span>
      </div>

      <div class="runner-grid" id="runnerButtons"></div>
    </div>

    <div class="card step-card hidden" id="step-review">
      <h2>4. Review Remaining Pupils</h2>
      <p>After ending a wave, pupils without timing will appear here.</p>

      <div id="remainingList"></div>

      <h2>Wave Summary</h2>

      <button class="secondary-btn" onclick="loadWaveSummary()">
        Refresh Wave Summary
      </button>

      <table id="summaryTable" style="display:none;">
        <thead>
          <tr>
            <th>No</th>
            <th>Name</th>
            <th>Time</th>
            <th>Seconds</th>
            <th>Grade</th>
            <th>Status</th>
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody id="summaryBody"></tbody>
      </table>
    </div>
  </div>

  <script src="run-timing.js"></script>
</body>
</html>
