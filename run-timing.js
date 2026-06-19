const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyjiK1MWx30tV0wxZsTf5k5OLaGbQsvbCNacuBO8Ypa7lNTDMK46BRZY0T3Vn3dgP3X/exec';
const RUN_DRAFT_KEY = 'BVPS_NAPFA_RUN_DRAFT_V4';
const SETTINGS_KEY = 'BVPS_NAPFA_SETTINGS_V1';
const COMPLETED_BACKUP_MS = 24 * 60 * 60 * 1000;
const NOT_RUNNING_REASONS = ['Absent','Did Not Start','Medical','Injured','Retest Needed','Not Running'];

let setupData = { levels: [], classesByLevel: {} };
let students = [];
let sessionId = '';
let selectedTestDate = '';
let selectedClass = '';
let currentWave = 'Wave 1';
let assignmentsConfirmed = false;
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

window.addEventListener('load', initialisePage);
window.addEventListener('beforeunload', handleBeforeUnload);
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && waveStarted && !waveEnded) await requestWakeLock();
});

async function initialisePage() {
  setToday();
  cleanupExpiredBackup();
  const restored = restoreDraft();
  if (!restored) await loadSetupData();
}

function setToday() {
  const d = new Date();
  document.getElementById('testDate').value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function api(payload) {
  const response = await fetch(GOOGLE_APPS_SCRIPT_URL, { method:'POST', body:JSON.stringify(payload) });
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch { throw new Error('Backend returned an invalid response.'); }
  if (!result.success) throw new Error(result.error || 'Request failed.');
  return result;
}

function showLoading(text) { document.getElementById('loadingText').textContent = text; document.getElementById('loading').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loading').classList.add('hidden'); }
function setText(id,value){ const el=document.getElementById(id); if(el) el.textContent=String(value??''); }

async function loadSetupData() {
  showLoading('Loading classes…');
  try {
    const result = await api({ action:'getStationSetupData' });
    setupData = result;
    const level = document.getElementById('levelSelect');
    level.innerHTML = '<option value="">Select level</option>';
    (result.levels || []).forEach(v => level.add(new Option(v,v)));
  } catch (error) { setText('setupMessage','Unable to load classes: '+error.message); }
  finally { hideLoading(); }
}

function updateClasses() {
  const level = document.getElementById('levelSelect').value;
  const select = document.getElementById('classSelect');
  select.innerHTML = '<option value="">Select class</option>';
  (setupData.classesByLevel?.[level] || []).forEach(v => select.add(new Option(v,v)));
}

async function loadClassStudents() {
  const date = document.getElementById('testDate').value;
  const className = document.getElementById('classSelect').value;
  if (!date || !className) return alert('Please select the test date, level and class.');
  const button = document.getElementById('loadClassBtn'); button.disabled = true; showLoading('Loading pupils…');
  try {
    const result = await api({ action:'getRunStudentsByClass', className });
    students = (result.students || []).map(s => ({...s, assignment:'', notRunningReason:''}));
    if (!students.length) throw new Error('No pupils found.');
    selectedTestDate = date; selectedClass = className; sessionId = createSessionId(className);
    assignmentsConfirmed = false; showPanel('assignmentPanel'); renderAssignments(); saveDraft();
  } catch(error) { alert('Unable to load class: '+error.message); }
  finally { hideLoading(); button.disabled = false; }
}

function createSessionId(className) { return `RUN-${className.replace(/[^A-Za-z0-9]/g,'')}-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`; }

function renderAssignments() {
  const grid = document.getElementById('assignmentGrid'); grid.innerHTML='';
  students.forEach((s,i) => {
    const card=document.createElement('article'); card.className='assign-card';
    card.innerHTML=`<div class="student-head"><div class="no">${esc(s.No)}</div><div class="name">${esc(s.Name)}</div></div>
    <div class="assign-actions"><button class="w1 ${s.assignment==='Wave 1'?'active':''}" onclick="setAssignment(${i},'Wave 1')">Wave 1</button><button class="w2 ${s.assignment==='Wave 2'?'active':''}" onclick="setAssignment(${i},'Wave 2')">Wave 2</button><button class="nr ${s.assignment==='Not Running'?'active':''}" onclick="setAssignment(${i},'Not Running')">Not Running</button></div>
    ${s.assignment==='Not Running'?`<select class="reason" onchange="setReason(${i},this.value)"><option value="">Select reason</option>${NOT_RUNNING_REASONS.map(r=>`<option ${s.notRunningReason===r?'selected':''}>${esc(r)}</option>`).join('')}</select>`:''}`;
    grid.appendChild(card);
  });
  updateAssignmentSummary();
}

function setAssignment(i,value){ students[i].assignment = students[i].assignment===value?'':value; if(students[i].assignment!=='Not Running') students[i].notRunningReason=''; renderAssignments(); saveDraft(); }
function setReason(i,value){ students[i].notRunningReason=value; updateAssignmentSummary(); saveDraft(); }
function autoAssignWaves(){ let n=0; students.forEach(s=>{ if(s.assignment!=='Not Running') s.assignment=(n++%2===0?'Wave 1':'Wave 2'); }); renderAssignments(); saveDraft(); }
function resetAssignments(){ if(!confirm('Clear all assignments?')) return; students.forEach(s=>{s.assignment='';s.notRunningReason='';}); renderAssignments(); saveDraft(); }
function updateAssignmentSummary(){ const c=a=>students.filter(s=>s.assignment===a).length; const u=students.filter(s=>!s.assignment).length; document.getElementById('assignmentSummary').innerHTML=`<div class="info">Wave 1: <strong>${c('Wave 1')}</strong> · Wave 2: <strong>${c('Wave 2')}</strong> · Not Running: <strong>${c('Not Running')}</strong> · Unassigned: <strong>${u}</strong></div>`; }

async function confirmAssignments() {
  const unassigned=students.filter(s=>!s.assignment); if(unassigned.length) return alert(`${unassigned.length} pupil(s) are unassigned.`);
  const noReason=students.filter(s=>s.assignment==='Not Running'&&!s.notRunningReason); if(noReason.length) return alert('Select a reason for every Not Running pupil.');
  if(!students.some(s=>s.assignment==='Wave 1'||s.assignment==='Wave 2')) return alert('At least one pupil must be assigned to a wave.');
  const button=document.getElementById('confirmAssignmentsBtn'); button.disabled=true; showLoading('Saving run session…');
  try {
    await api({action:'saveRunSession',sessionId,testDate:selectedTestDate,className:selectedClass,mode:'1.6km Run',students:students.map(s=>({No:s.No,ID:s.ID,Name:s.Name,Wave:s.assignment,RunStatus:s.assignment}))});
    const pupils=students.filter(s=>s.assignment==='Not Running').map(s=>({student:s,status:s.notRunningReason,remarks:s.notRunningReason}));
    if(pupils.length) await api({action:'saveNotRunningReasons',sessionId,testDate:selectedTestDate,className:selectedClass,pupils});
    assignmentsConfirmed=true; currentWave=students.some(s=>s.assignment==='Wave 1')?'Wave 1':'Wave 2'; prepareWave(); saveDraft();
  } catch(error){ alert('Unable to confirm assignments: '+error.message); }
  finally{ hideLoading(); button.disabled=false; }
}

function prepareWave() {
  stopTimer(); waveStarted=false; waveEnded=false; waveSaved=false; startPerformanceTime=null; startWallClock=null; currentWaveResults=[];
  showPanel('timingPanel'); setText('sessionText',`${selectedClass} · ${currentWave} · ${displayDate(selectedTestDate)}`); setText('timerValue','00:00.0');
  document.getElementById('startWaveBtn').disabled=false; document.getElementById('endWaveBtn').disabled=true; document.getElementById('undoBtn').disabled=true;
  updateSaveStatus('Saved on device',''); renderRunners(); saveDraft();
}
function currentRunners(){ return students.filter(s=>s.assignment===currentWave); }
function renderRunners(){
  const grid=document.getElementById('runnerGrid'); grid.innerHTML='';
  currentRunners().forEach(s=>{
    const finish=currentWaveResults.find(r=>String(r.student.ID)===String(s.ID));
    const b=document.createElement('button'); b.className='runner'+(finish?' finished':''); b.disabled=!waveStarted||waveEnded||!!finish; b.onclick=()=>recordFinish(s);
    b.innerHTML=`<div class="rno">No. ${esc(s.No)}</div>${finish?`<div class="rpos">#${finish.position}</div><div class="rtime">${formatTime(finish.elapsedSeconds)}</div><div class="rname">${esc(s.Name)}</div>`:`<div class="rname">${esc(s.Name)}</div><div class="rtime">Tap at finish</div>`}`;
    grid.appendChild(b);
  });
  setText('finishedCount',`Finished: ${currentWaveResults.length} / ${currentRunners().length}`);
}

async function startCurrentWave(){
  if(waveStarted||!confirm(`Start ${currentWave} now?`)) return;
  await requestWakeLock(); unlockAudio(); startPerformanceTime=performance.now(); startWallClock=Date.now(); waveStarted=true; waveEnded=false; waveSaved=false; currentWaveResults=[];
  document.getElementById('startWaveBtn').disabled=true; document.getElementById('endWaveBtn').disabled=false; updateSaveStatus('Timing · saved locally','pending'); animateTimer(); renderRunners(); saveDraft();
}
function elapsedNow(){ if(startPerformanceTime!==null) return (performance.now()-startPerformanceTime)/1000; if(startWallClock) return (Date.now()-startWallClock)/1000; return 0; }
function animateTimer(){ if(!waveStarted||waveEnded) return; setText('timerValue',formatTenths(elapsedNow())); timerFrame=requestAnimationFrame(animateTimer); }
function stopTimer(){ if(timerFrame) cancelAnimationFrame(timerFrame); timerFrame=null; }
function recordFinish(student){
  if(!waveStarted||waveEnded||currentWaveResults.some(r=>String(r.student.ID)===String(student.ID))) return;
  const result={student,elapsedSeconds:Number(elapsedNow().toFixed(2)),position:currentWaveResults.length+1,attemptNo:1,remarks:''}; currentWaveResults.push(result);
  localStorage.setItem(RUN_DRAFT_KEY,JSON.stringify(buildDraft())); vibrate(50); playTone(620,.045); document.getElementById('undoBtn').disabled=false; renderRunners();
}
function undoLastFinish(){ if(!currentWaveResults.length||waveSaved) return; currentWaveResults.pop(); currentWaveResults.forEach((r,i)=>r.position=i+1); vibrate([30,30,30]); renderRunners(); saveDraft(); }
function endCurrentWave(){
  if(!waveStarted||waveEnded) return; const unfinished=currentRunners().filter(s=>!currentWaveResults.some(r=>String(r.student.ID)===String(s.ID)));
  if(unfinished.length&&!confirm(`End ${currentWave} with ${unfinished.length} unfinished pupil(s)?\n\n${unfinished.map(s=>`No. ${s.No} ${s.Name}`).join('\n')}`)) return;
  waveEnded=true; stopTimer(); releaseWakeLock(); document.getElementById('endWaveBtn').disabled=true; showReview(); saveDraft();
}

function showReview(){
  showPanel('reviewPanel'); setText('reviewTitle',`Review ${currentWave}`); const body=document.getElementById('reviewBody'); body.innerHTML='';
  currentWaveResults.forEach(r=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${r.position}</td><td>${esc(r.student.No)}</td><td><strong>${esc(r.student.Name)}</strong></td><td>${formatTime(r.elapsedSeconds)}</td><td>${esc(r.grade||'Calculated on save')}</td>`; body.appendChild(tr); });
  document.getElementById('saveWaveBtn').classList.toggle('hidden',waveSaved); document.getElementById('returnTimingBtn').classList.toggle('hidden',waveSaved); document.getElementById('nextWaveBtn').classList.add('hidden'); document.getElementById('completeBtn').classList.add('hidden');
  if(waveSaved) showPostSaveButtons(); setText('reviewMessage',waveSaved?`${currentWave} saved to Google Sheets.`:`${currentWaveResults.length} result(s) ready to save.`);
}
function returnToTiming(){ if(waveSaved)return; showPanel('timingPanel'); renderRunners(); }

async function saveCurrentWave(){
  if(saveInProgress||!currentWaveResults.length) return; saveInProgress=true; const btn=document.getElementById('saveWaveBtn'); btn.disabled=true; updateSaveStatus('Saving to Google Sheets…','pending'); setText('reviewMessage','Saving the entire wave in one batch…');
  try{
    const result=await api({action:'saveRunWaveBatch',sessionId,testDate:selectedTestDate,className:selectedClass,wave:currentWave,results:currentWaveResults.map(r=>({student:r.student,elapsedSeconds:r.elapsedSeconds,attemptNo:r.attemptNo,remarks:r.remarks}))});
    const map=new Map((result.results||[]).map(x=>[String(x.ID),x])); currentWaveResults.forEach(r=>{const x=map.get(String(r.student.ID));if(x){r.grade=x.Grade;r.time=x.Time;}});
    if(currentWave==='Wave 1') waveOneResults=currentWaveResults.map(r=>({...r})); else waveTwoResults=currentWaveResults.map(r=>({...r}));
    waveSaved=true; updateSaveStatus('Saved to Google Sheets','saved'); vibrate(90); playTone(820,.10); saveDraft(); showReview();
  }catch(error){ updateSaveStatus('Save failed · retry','failed'); vibrate([80,60,80]); setText('reviewMessage','Save failed. Results remain safely stored on this device. Press Save Wave Results again.'); alert(error.message); }
  finally{saveInProgress=false;btn.disabled=false;}
}
function showPostSaveButtons(){ const hasW2=students.some(s=>s.assignment==='Wave 2'); if(currentWave==='Wave 1'&&hasW2) document.getElementById('nextWaveBtn').classList.remove('hidden'); else document.getElementById('completeBtn').classList.remove('hidden'); }
function moveToNextWave(){ if(!waveSaved)return; currentWave='Wave 2'; prepareWave(); }
async function completeSession(){
  if(saveInProgress||!waveSaved)return; const btn=document.getElementById('completeBtn');btn.disabled=true;showLoading('Completing session…');
  try{await api({action:'completeRunSession',sessionId}); markDraftCompleted(); const nr=students.filter(s=>s.assignment==='Not Running').length; setText('completionSummary',`${selectedClass} completed. Wave 1: ${waveOneResults.length} · Wave 2: ${waveTwoResults.length} · Not Running: ${nr} · Total: ${students.length}`);showPanel('completionPanel');}
  catch(error){alert('Unable to complete session: '+error.message);}finally{hideLoading();btn.disabled=false;}
}

function buildDraft(){return{version:4,savedAt:new Date().toISOString(),completed:false,students,sessionId,selectedTestDate,selectedClass,currentWave,assignmentsConfirmed,waveStarted,waveEnded,waveSaved,startWallClock,currentWaveResults,waveOneResults,waveTwoResults};}
function saveDraft(){localStorage.setItem(RUN_DRAFT_KEY,JSON.stringify(buildDraft()));}
function markDraftCompleted(){const draft=buildDraft();draft.completed=true;draft.completedAt=new Date().toISOString();localStorage.setItem(RUN_DRAFT_KEY,JSON.stringify(draft));}
function cleanupExpiredBackup(){try{const d=JSON.parse(localStorage.getItem(RUN_DRAFT_KEY)||'null');if(d?.completed&&Date.now()-new Date(d.completedAt).getTime()>COMPLETED_BACKUP_MS)localStorage.removeItem(RUN_DRAFT_KEY);}catch{}}
function restoreDraft(){
  let d;try{d=JSON.parse(localStorage.getItem(RUN_DRAFT_KEY)||'null');}catch{return false;} if(!d?.sessionId||!Array.isArray(d.students))return false;
  const label=d.completed?'completed backup':'saved session'; if(!confirm(`A ${label} for ${d.selectedClass} was found.\nLast backup: ${new Date(d.savedAt).toLocaleString()}\n\nResume it?`)) return false;
  students=d.students;sessionId=d.sessionId;selectedTestDate=d.selectedTestDate;selectedClass=d.selectedClass;currentWave=d.currentWave||'Wave 1';assignmentsConfirmed=!!d.assignmentsConfirmed;waveEnded=!!d.waveEnded;waveSaved=!!d.waveSaved;startWallClock=d.startWallClock||null;currentWaveResults=d.currentWaveResults||[];waveOneResults=d.waveOneResults||[];waveTwoResults=d.waveTwoResults||[];
  if(d.completed){setText('completionSummary',`${selectedClass} completed backup restored.`);showPanel('completionPanel');return true;}
  if(!assignmentsConfirmed){showPanel('assignmentPanel');renderAssignments();return true;}
  if(waveSaved||waveEnded){waveStarted=false;showReview();return true;}
  if(d.waveStarted){waveStarted=true;waveEnded=false;showPanel('timingPanel');setText('sessionText',`${selectedClass} · ${currentWave} · ${displayDate(selectedTestDate)}`);document.getElementById('startWaveBtn').disabled=true;document.getElementById('endWaveBtn').disabled=false;document.getElementById('undoBtn').disabled=!currentWaveResults.length;updateSaveStatus('Restored · saved locally','pending');renderRunners();requestWakeLock();animateTimer();return true;}
  prepareWave();return true;
}
function startNewSession(){localStorage.removeItem(RUN_DRAFT_KEY);location.reload();}

function hasActiveData(){return assignmentsConfirmed||currentWaveResults.length||waveOneResults.length||waveTwoResults.length;}
function goHomeSafely(){if(!canLeave())return;location.href='index.html';}
function handleBackNavigation(){if(!canLeave())return;if(history.length>1)history.back();else location.href='index.html';}
function canLeave(){if(saveInProgress){alert('Results are saving. Keep this page open.');return false;}if(waveStarted&&!waveEnded){alert('A wave is running. End the wave before leaving.');return false;}if(hasActiveData()&&!confirm('Leave this page? The current session remains backed up on this device.'))return false;return true;}
function handleBeforeUnload(e){if(saveInProgress||(waveStarted&&!waveEnded)||hasActiveData()){e.preventDefault();e.returnValue='';}}

async function requestWakeLock(){try{if('wakeLock'in navigator)wakeLock=await navigator.wakeLock.request('screen');}catch{}}
function releaseWakeLock(){try{wakeLock?.release();}catch{}wakeLock=null;}
function settings(){try{return{vibration:true,sounds:false,keepAwake:true,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}}catch{return{vibration:true,sounds:false,keepAwake:true}}}
function vibrate(pattern){if(settings().vibration&&navigator.vibrate)navigator.vibrate(pattern);}
let audioContext=null;function unlockAudio(){if(!settings().sounds)return;audioContext ||= new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();}
function playTone(freq,duration){if(!settings().sounds)return;try{unlockAudio();const o=audioContext.createOscillator(),g=audioContext.createGain();o.frequency.value=freq;g.gain.value=.035;o.connect(g);g.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+duration);}catch{}}

function updateSaveStatus(text,state){const el=document.getElementById('saveStatus');el.textContent=text;el.className='status'+(state?' '+state:'');}
function showPanel(id){['setupPanel','assignmentPanel','timingPanel','reviewPanel','completionPanel'].forEach(x=>document.getElementById(x).classList.toggle('hidden',x!==id));}
function formatTime(v){const n=Math.max(0,Math.round(Number(v)||0));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
function formatTenths(v){const n=Math.max(0,Number(v)||0);return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(Math.floor(n%60)).padStart(2,'0')}.${Math.floor((n%1)*10)}`;}
function displayDate(v){const p=String(v).split('-');return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:v;}
function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
