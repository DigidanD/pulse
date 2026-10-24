'use strict';

(function () {

  const STORAGE_KEY  = 'log-sessions';
  const CURRENT_KEY  = 'log-current';   // in-progress session checkpoint
  const GOAL_KEY     = 'log-daily-goal';
  const POLL_MS      = 500;
  const CHECKPOINT_MS = 5000;
  const GOAL_OPTIONS = [10, 15, 30, 60];

  /* ─── Storage ─── */

  function loadSessions() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }

  function saveSessions(arr) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  }

  function loadGoal() {
    try {
      const g = Number(localStorage.getItem(GOAL_KEY));
      return GOAL_OPTIONS.includes(g) ? g : 15;
    } catch { return 15; }
  }

  function saveGoal(min) {
    try { localStorage.setItem(GOAL_KEY, String(min)); } catch (_) {}
  }

  /* ─── Session Tracking ─── */

  let current = null;   // { startTime, lastSeen, module, bpmSamples[], pattern }
  let lastCheckpoint = 0;

  const MIN_SESSION_MS = 10000;  // ignore sub-10s bursts (e.g. quick tuner checks)

  function activeModule() {
    if (window.metronome?.isPlaying())                                       return 'metronome';
    if (window.rhythm?.isPlaying())                                          return 'rhythm';
    if (window.tuner?.isActive())                                            return 'tuner';
    return null;
  }

  function sampleBpm(mod) {
    if (mod === 'metronome') return window.metronome?.getBpm() ?? null;
    if (mod === 'rhythm')    return window.rhythm?.getBpm()    ?? null;
    return null;
  }

  // Persist a finished session. `endTime` defaults to now; a recovered
  // checkpoint passes the last moment it was seen alive instead.
  function commit(sess, endTime) {
    const durationMs = endTime - sess.startTime;
    if (durationMs < MIN_SESSION_MS) return false;

    const samples = sess.bpmSamples || [];
    const bpmAvg  = samples.length
      ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
      : null;

    try {
      const sessions = loadSessions();
      sessions.push({
        startTime: sess.startTime,
        endTime,
        module:    sess.module,
        bpm:       bpmAvg,
        pattern:   sess.pattern,
      });
      saveSessions(sessions);
    } catch (_) { /* localStorage full/blocked (e.g. Safari private) — drop silently */ }
    return true;
  }

  function clearCheckpoint() {
    try { localStorage.removeItem(CURRENT_KEY); } catch (_) {}
  }

  function checkpoint(force) {
    if (!current) return;
    const now = Date.now();
    if (!force && now - lastCheckpoint < CHECKPOINT_MS) return;
    lastCheckpoint = now;
    current.lastSeen = now;
    try { localStorage.setItem(CURRENT_KEY, JSON.stringify(current)); } catch (_) {}
  }

  function endCurrent() {
    if (!current) return;
    const sess = current;
    current = null;   // clear up-front so a throw below can't wedge tracking
    clearCheckpoint();
    if (commit(sess, Date.now())) renderLog();
  }

  // A session that was running when the app was closed or killed (mobile
  // browsers often skip unload events) survives as a checkpoint — finalise
  // it on the next launch, ending at the last moment it was seen alive.
  function recoverCheckpoint() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(CURRENT_KEY)); } catch (_) {}
    clearCheckpoint();
    if (saved && saved.startTime && saved.lastSeen) commit(saved, saved.lastSeen);
  }

  function poll() {
    const mod = activeModule();

    // Close the running session if the active module stopped OR switched
    // (e.g. straight from metronome to rhythm) — don't merge two modules.
    if (current && mod !== current.module) endCurrent();

    if (mod && !current) {
      current = {
        startTime:  Date.now(),
        lastSeen:   Date.now(),
        module:     mod,
        bpmSamples: [],
        pattern:    mod === 'rhythm' ? (window.rhythm?.getPatternName() ?? null) : null,
      };
      checkpoint(true);
    } else if (current) {
      const bpm = sampleBpm(current.module);
      if (bpm) current.bpmSamples.push(bpm);
      // Keep the sample list bounded on very long sessions.
      if (current.bpmSamples.length > 2000) current.bpmSamples.splice(0, 1000);
      checkpoint(false);
    }
  }

  setInterval(poll, POLL_MS);

  // Leaving the page: write the latest state so nothing is lost if the page
  // is never resumed. The session itself keeps running while audio plays.
  window.addEventListener('pagehide', () => checkpoint(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') checkpoint(true);
  });

  /* ─── Stats ─── */

  function dayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function calcStreak(sessions) {
    const days = new Set(sessions.map(s => dayKey(s.startTime)));
    let streak = 0;
    const now  = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      if (days.has(dayKey(d.getTime()))) streak++;
      else if (i > 0) break;   // gap — stop (allow today being empty)
    }
    return streak;
  }

  function minutesByDay(sessions) {
    const map = {};
    sessions.forEach(s => {
      const k = dayKey(s.startTime);
      map[k] = (map[k] || 0) + (s.endTime - s.startTime) / 60000;
    });
    return map;
  }

  function weekData(map) {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        label: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()],
        mins:  map[dayKey(d.getTime())] || 0,
        today: i === 0,
      });
    }
    return days;
  }

  function totalMinutes(sessions) {
    return sessions.reduce((acc, s) => acc + (s.endTime - s.startTime) / 60000, 0);
  }

  /* ─── SVG: goal ring + week bars ─── */

  function buildRing(mins, goal) {
    const R = 44, C = 2 * Math.PI * R;
    const pct  = Math.min(1, mins / goal);
    const done = pct >= 1;
    return `
      <svg class="log-ring" viewBox="0 0 108 108" aria-hidden="true">
        <circle cx="54" cy="54" r="${R}" fill="none" stroke="var(--bg-card-raised)" stroke-width="10"/>
        ${pct > 0 ? `<circle cx="54" cy="54" r="${R}" fill="none" stroke="${done ? 'var(--color-success)' : 'var(--accent)'}"
                stroke-width="10" stroke-linecap="round"
                stroke-dasharray="${(pct * C).toFixed(1)} ${C.toFixed(1)}"
                transform="rotate(-90 54 54)"/>` : ''}
      </svg>`;
  }

  // Weekly bars: only days with practice carry a minutes label; rest days are
  // a quiet stub (a row of "0m" read as failure). Today is marked.
  function buildChart(days, goal) {
    const W = 300, H = 98, BAR_W = 30, GAP = 12;
    const span  = days.length * (BAR_W + GAP) - GAP;
    const padX  = Math.max(0, (W - span) / 2);
    const baseY = H - 18;
    const maxMins = Math.max(...days.map(d => d.mins), goal);
    const goalY = baseY - (goal / maxMins) * (baseY - 18);
    let bars = `<line x1="${padX - 4}" x2="${padX + span + 4}" y1="${goalY}" y2="${goalY}"` +
               ` stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3 4" opacity="0.6"/>`;
    days.forEach((d, i) => {
      const x      = padX + i * (BAR_W + GAP);
      const active = d.mins > 0;
      const mins   = Math.round(d.mins);
      const barH   = active ? Math.max(6, (d.mins / maxMins) * (baseY - 18)) : 3;
      const y      = baseY - barH;
      const fill   = !active ? 'var(--border)'
                   : d.mins >= goal ? 'var(--color-success)' : 'var(--accent)';
      bars += `<rect x="${x}" y="${y}" width="${BAR_W}" height="${barH}" rx="4" fill="${fill}"/>`;
      if (active) {
        bars += `<text x="${x + BAR_W / 2}" y="${y - 5}" text-anchor="middle" font-size="9"` +
                ` font-weight="700" fill="var(--text-primary)">${mins}m</text>`;
      }
      bars += `<text x="${x + BAR_W / 2}" y="${H - 4}" text-anchor="middle" font-size="9"` +
              ` font-weight="${d.today ? 700 : 400}"` +
              ` fill="${d.today ? 'var(--accent)' : 'var(--text-secondary)'}">${d.label}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img"` +
           ` aria-label="Practice minutes, last 7 days">${bars}</svg>`;
  }

  /* ─── Render ─── */

  function fmtDuration(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60), rem = s % 60;
    return m + 'm' + (rem ? ' ' + rem + 's' : '');
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    const today = new Date();
    if (dayKey(ts) === dayKey(today.getTime())) return 'Today';
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (dayKey(ts) === dayKey(yesterday.getTime())) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function moduleIcon(mod) {
    return mod === 'metronome' ? '♩' : mod === 'rhythm' ? '♪' : '♫';
  }

  // Display name — the 'rhythm' module is branded "Groove"
  function moduleName(mod) {
    return mod === 'rhythm' ? 'Groove'
         : mod === 'metronome' ? 'Metronome'
         : mod === 'tuner' ? 'Tuner'
         : mod;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function renderLog() {
    const panel = document.getElementById('tab-log');
    if (!panel) return;

    const sessions = loadSessions();
    const goal     = loadGoal();
    const byDay    = minutesByDay(sessions);
    const todayMin = Math.round(byDay[dayKey(Date.now())] || 0);
    const streak   = calcStreak(sessions);
    const days     = weekData(byDay);
    const totalHrs = (totalMinutes(sessions) / 60).toFixed(1);
    const left     = Math.max(0, goal - todayMin);

    const recent = sessions.slice(-20).reverse();

    panel.innerHTML = `
      <section class="log-goal-card">
        <div class="log-ring-wrap">
          ${buildRing(todayMin, goal)}
          <div class="log-ring-label">
            <span class="log-ring-val">${todayMin}</span>
            <span class="log-ring-unit">of ${goal} min</span>
          </div>
        </div>
        <div class="log-goal-info">
          <div class="log-goal-title">${left === 0 ? 'Daily goal reached' : 'Today’s goal'}</div>
          <div class="log-goal-sub">${left === 0
            ? (streak > 1 ? `${streak}-day streak. Keep it going tomorrow.` : 'Nice work. See you tomorrow.')
            : `${left} min to go${streak ? ` · ${streak}-day streak` : ''}`}</div>
          <div class="log-goal-picker" role="group" aria-label="Daily goal in minutes">
            ${GOAL_OPTIONS.map(g => `<button class="log-goal-opt${g === goal ? ' active' : ''}" data-goal="${g}" aria-pressed="${g === goal}">${g}m</button>`).join('')}
          </div>
        </div>
      </section>

      <div class="log-stats-row">
        <div class="log-stat">
          <div class="log-stat-val">${streak}</div>
          <div class="log-stat-label">Day streak</div>
        </div>
        <div class="log-stat">
          <div class="log-stat-val">${totalHrs}</div>
          <div class="log-stat-label">Total hours</div>
        </div>
        <div class="log-stat">
          <div class="log-stat-val">${sessions.length}</div>
          <div class="log-stat-label">Sessions</div>
        </div>
      </div>

      <div class="log-chart-wrap">
        <div class="log-section-title">Last 7 days</div>
        ${buildChart(days, goal)}
      </div>

      <div class="log-sessions-wrap">
        <div class="log-section-title">
          Recent sessions
          ${sessions.length ? `<button class="log-clear-btn" id="log-clear-btn">Clear all</button>` : ''}
        </div>
        ${recent.length === 0
          ? '<div class="log-empty">Your practice starts here. Press START on any tool and it’s logged automatically.</div>'
          : recent.map(s => `
            <div class="log-session-row">
              <span class="log-session-icon" aria-hidden="true">${moduleIcon(s.module)}</span>
              <div class="log-session-info">
                <span class="log-session-module">${moduleName(s.module)}${s.pattern ? ' · ' + esc(s.pattern) : ''}${s.bpm ? ' · ' + s.bpm + ' BPM' : ''}</span>
                <span class="log-session-time">${fmtDate(s.startTime)} ${fmtTime(s.startTime)} · ${fmtDuration(s.endTime - s.startTime)}</span>
              </div>
            </div>`).join('')
        }
      </div>
    `;

    panel.querySelectorAll('.log-goal-opt').forEach(btn => {
      btn.addEventListener('click', () => { saveGoal(Number(btn.dataset.goal)); renderLog(); });
    });

    document.getElementById('log-clear-btn')?.addEventListener('click', () => {
      if (confirm('Clear all practice sessions?')) {
        saveSessions([]);
        renderLog();
      }
    });
  }

  /* ─── Init ─── */

  document.addEventListener('DOMContentLoaded', () => {
    recoverCheckpoint();
    renderLog();
  });

  // Refresh when the Log tab is opened (today's minutes may have changed).
  document.addEventListener('click', e => {
    if (e.target.closest?.('.tab-btn[data-tab="log"]')) renderLog();
  });

  window.practiceLog = {
    getSessions: loadSessions,
    renderLog,
  };

})();
