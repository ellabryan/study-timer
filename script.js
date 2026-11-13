'use strict';

(() => {
  const STORAGE_KEY = 'petal-study-timer-v1';
  const CIRCUMFERENCE = 2 * Math.PI * 116;
  const PRESETS = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
  const $ = (selector) => document.querySelector(selector);
  const els = {
    display: $('#timerDisplay'), ring: $('#progressRing'), title: $('#modeTitle'), caption: $('#timerCaption'), status: $('#timerStatus'),
    start: $('#startButton'), reset: $('#resetButton'), livePill: $('.live-pill'), minutes: $('#minutesToday'), sessions: $('#sessionsToday'),
    goalLabel: $('#goalLabel'), goalProgressLabel: $('#goalProgressLabel'), goalProgress: $('#goalProgress'), goalFill: $('#goalProgressFill'),
    encouragement: $('#goalEncouragement'), taskForm: $('#taskForm'), taskInput: $('#taskInput'), taskList: $('#taskList'), taskCount: $('#taskCount'),
    emptyTasks: $('#emptyTasks'), toast: $('#toast'), goalDialog: $('#goalDialog'), goalInput: $('#goalInput')
  };
  const todayKey = () => new Date().toLocaleDateString('en-CA');
  const freshState = () => ({ date: todayKey(), studiedSeconds: 0, sessions: 0, goal: 120, tasks: [], timer: { mode: 'focus', duration: PRESETS.focus, remaining: PRESETS.focus, running: false, segmentStartedAt: null, segmentStartRemaining: null, segmentAccounted: 0 } });
  let state;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    state = { ...freshState(), ...(saved && typeof saved === 'object' ? saved : {}) };
    state.timer = { ...freshState().timer, ...(saved?.timer || {}) };
    if (!Array.isArray(state.tasks)) state.tasks = [];
    if (!Number.isFinite(state.goal) || state.goal < 15) state.goal = 120;
    if (state.date !== todayKey()) {
      state.date = todayKey(); state.studiedSeconds = 0; state.sessions = 0;
      if (state.timer.running) state.timer.segmentAccounted = elapsedInSegment(state.timer);
    }
  } catch (_) { state = freshState(); }

  function elapsedInSegment(timer = state.timer) {
    if (!timer.running || !timer.segmentStartedAt) return 0;
    return Math.max(0, Math.min(timer.segmentStartRemaining || 0, Math.floor((Date.now() - timer.segmentStartedAt) / 1000)));
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { showToast('Could not save your progress in this browser.'); }
  }
  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('visible');
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => els.toast.classList.remove('visible'), 3600);
  }
  function modeLabel(mode) { return mode === 'focus' ? 'Time to focus' : mode === 'short' ? 'A little breather' : 'A longer recharge'; }
  function formatTime(seconds) {
    const safe = Math.max(0, Math.ceil(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
  }
  function updateTimer() {
    const t = state.timer;
    if (t.running) {
      const elapsed = elapsedInSegment(t);
      const added = Math.max(0, elapsed - (t.segmentAccounted || 0));
      if (t.mode === 'focus' && added) { state.studiedSeconds += added; t.segmentAccounted = elapsed; }
      t.remaining = Math.max(0, (t.segmentStartRemaining || 0) - elapsed);
      if (t.remaining <= 0) { finishTimer(); return; }
    }
    els.display.textContent = formatTime(t.remaining);
    const ratio = t.duration ? t.remaining / t.duration : 0;
    els.ring.style.strokeDasharray = `${CIRCUMFERENCE}`;
    els.ring.style.strokeDashoffset = `${CIRCUMFERENCE * (1 - ratio)}`;
    els.title.textContent = modeLabel(t.mode);
    els.caption.textContent = t.running ? (t.mode === 'focus' ? 'You’re in your focus flow' : 'Take a moment for yourself') : 'Ready to begin?';
    els.status.textContent = t.running ? 'IN THE ZONE' : 'READY WHEN YOU ARE';
    els.livePill.classList.toggle('running', t.running);
    els.start.innerHTML = t.running ? '<span aria-hidden="true">Ⅱ</span> Pause' : '<span aria-hidden="true">▶</span> Start focusing';
    document.title = `${formatTime(t.remaining)} · Petal Study Timer`;
    renderStats();
    save();
  }
  function beginSegment() {
    const t = state.timer;
    t.running = true; t.segmentStartedAt = Date.now(); t.segmentStartRemaining = t.remaining; t.segmentAccounted = 0;
    if (t.mode === 'focus' && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    updateTimer();
  }
  function pauseTimer() {
    const t = state.timer;
    const elapsed = elapsedInSegment(t);
    if (t.mode === 'focus') state.studiedSeconds += Math.max(0, elapsed - (t.segmentAccounted || 0));
    t.remaining = Math.max(0, (t.segmentStartRemaining || 0) - elapsed);
    t.running = false; t.segmentStartedAt = null; t.segmentStartRemaining = null; t.segmentAccounted = 0;
    if (t.remaining === 0) finishTimer(); else updateTimer();
  }
  function finishTimer() {
    const finishedMode = state.timer.mode;
    if (finishedMode === 'focus') state.sessions += 1;
    state.timer.running = false;
    state.timer.remaining = 0;
    state.timer.segmentStartedAt = null;
    state.timer.segmentStartRemaining = null;
    state.timer.segmentAccounted = 0;
    save(); renderStats();
    els.display.textContent = '00:00';
    els.ring.style.strokeDashoffset = `${CIRCUMFERENCE}`;
    els.status.textContent = 'SESSION COMPLETE';
    els.livePill.classList.remove('running');
    els.caption.textContent = finishedMode === 'focus' ? 'Beautiful work. Take a little break.' : 'You’re refreshed. Ready when you are?';
    els.start.innerHTML = '<span aria-hidden="true">▶</span> Start again';
    document.title = 'Session complete · Petal';
    const message = finishedMode === 'focus' ? 'Focus session complete — lovely work! Time for a break. ♡' : 'Break time is over. You’re ready for another round!';
    showToast(message);
    if ('Notification' in window && Notification.permission === 'granted') new Notification('Petal Study Timer', { body: message, tag: 'petal-timer' });
    try { const audio = new AudioContext(); const oscillator = audio.createOscillator(); const gain = audio.createGain(); oscillator.connect(gain); gain.connect(audio.destination); oscillator.frequency.value = 660; gain.gain.setValueAtTime(.12, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .65); oscillator.start(); oscillator.stop(audio.currentTime + .65); oscillator.onended = () => audio.close(); } catch (_) { /* Sound is optional. */ }
  }
  function setMode(mode, customDuration) {
    if (state.timer.running) pauseTimer();
    const duration = customDuration || PRESETS[mode] || PRESETS.focus;
    state.timer = { mode, duration, remaining: duration, running: false, segmentStartedAt: null, segmentStartRemaining: null, segmentAccounted: 0 };
    document.querySelectorAll('.mode-tab').forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('.duration-option').forEach((button) => {
      button.classList.toggle('selected', mode === 'focus' && Number(button.dataset.minutes) * 60 === duration);
    });
    updateTimer();
  }
  function renderStats() {
    const minutes = Math.floor(state.studiedSeconds / 60);
    els.minutes.textContent = minutes;
    els.sessions.textContent = state.sessions;
    els.goalLabel.textContent = `Goal: ${state.goal} min`;
    els.goalProgressLabel.textContent = `${minutes} / ${state.goal} min`;
    const percent = Math.min(100, (minutes / state.goal) * 100);
    els.goalFill.style.width = `${percent}%`;
    els.goalProgress.setAttribute('aria-valuemax', String(state.goal));
    els.goalProgress.setAttribute('aria-valuenow', String(Math.min(minutes, state.goal)));
    els.encouragement.textContent = minutes >= state.goal ? 'You reached your goal! So proud of you. ♡' : minutes >= state.goal * .75 ? 'You’re so close. Keep going gently!' : minutes > 0 ? 'Every minute counts. You’ve got this!' : 'Every minute counts. You’ve got this!';
  }
  function renderTasks() {
    els.taskList.replaceChildren();
    const remaining = state.tasks.filter((task) => !task.completed).length;
    els.taskCount.textContent = `${remaining} ${remaining === 1 ? 'left' : 'left'}`;
    els.emptyTasks.hidden = state.tasks.length > 0;
    state.tasks.forEach((task) => {
      const li = document.createElement('li'); li.className = `task-item${task.completed ? ' completed' : ''}`;
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'task-check'; checkbox.checked = task.completed; checkbox.setAttribute('aria-label', `Mark ${task.text} as ${task.completed ? 'incomplete' : 'complete'}`);
      checkbox.addEventListener('change', () => { task.completed = checkbox.checked; save(); renderTasks(); });
      const text = document.createElement('span'); text.className = 'task-text'; text.textContent = task.text;
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete-task'; remove.textContent = '×'; remove.setAttribute('aria-label', `Delete ${task.text}`);
      remove.addEventListener('click', () => { state.tasks = state.tasks.filter((item) => item.id !== task.id); save(); renderTasks(); });
      li.append(checkbox, text, remove); els.taskList.append(li);
    });
  }

  els.start.addEventListener('click', () => state.timer.running ? pauseTimer() : beginSegment());
  els.reset.addEventListener('click', () => { const { mode, duration } = state.timer; setMode(mode, duration); showToast('Timer reset. A fresh start!'); });
  document.querySelectorAll('.mode-tab').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
  document.querySelectorAll('.duration-option').forEach((button) => button.addEventListener('click', () => setMode('focus', Number(button.dataset.minutes) * 60)));
  els.taskForm.addEventListener('submit', (event) => {
    event.preventDefault(); const text = els.taskInput.value.trim(); if (!text) return;
    state.tasks.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text, completed: false });
    els.taskInput.value = ''; save(); renderTasks(); els.taskInput.focus();
  });
  $('#goalButton').addEventListener('click', () => { els.goalInput.value = state.goal; els.goalDialog.showModal(); });
  $('#saveGoalButton').addEventListener('click', () => {
    const goal = Number(els.goalInput.value); if (!Number.isInteger(goal) || goal < 15 || goal > 1440) { els.goalInput.focus(); return; }
    state.goal = goal; save(); renderStats(); els.goalDialog.close(); showToast('Your daily goal is updated. You’ve got this!');
  });
  els.goalDialog.addEventListener('click', (event) => { if (event.target === els.goalDialog) els.goalDialog.close(); });
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') updateTimer(); else save(); });
  window.addEventListener('pagehide', save);
  updateTimer(); renderTasks();
  setInterval(updateTimer, 250);
})();
