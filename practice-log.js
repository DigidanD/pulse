'use strict';

(function () {

  const STORAGE_KEY = 'log-sessions';
  const POLL_MS     = 500;

  /* ─── Storage ─── */

  function loadSessions() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }

  function saveSessions(arr) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  }

  /* ─── Session Tracking ─── */

  let current = null;   // { startTime, module, bpmSamples[], pattern }

  const MIN_SESSION_MS = 10000;  // ignore sub-10s bursts (e.g. quick tuner checks)

  function activeModule() {
    if (window.metronome?.isPlaying())                                       return 'metronome';
    if (window.rhythm?.isPlaying())                                          return 'rhythm';
    if (document.getElementById('tuner-start-btn')?.classList.contains('running')) return 'tuner';
    return null;
  }

  function sampleBpm(mod) {
    if (mod === 'metronome') return window.metronome?.getBpm() ?? null;
    if (mod === 'rhythm')    return window.rhythm?.getBpm()    ?? null;
    return null;
  }

  function endCurrent() {
    if (!current) return;
    const sess = current;
    current = null;   // clear up-front so a throw below can't wedge tracking

    const durationMs = Date.now() - sess.startTime;
    if (durationMs < MIN_SESSION_MS) return;   // too short — discard, don't log

    const samples = sess.bpmSamples;
    const bpmAvg  = samples.length
      ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
      : null;

    try {
      const sessions = loadSessions();
      sessions.push({
        startTime: sess.startTime,
        endTime:   Date.now(),
        module:    sess.module,
        bpm:       bpmAvg,
        pattern:   sess.pattern,
      });
      saveSessions(sessions);
    } catch (_) { /* localStorage full/blocked (e.g. Safari private) — drop silently */ }
    renderLog();
  }

  setInterval(function poll() {
    const mod = activeModule();

    // Close the running session if the active module stopped OR switched
    // (e.g. straight from metronome to rhythm) — don't merge two modules.
    if (current && mod !== current.module) endCurrent();

    if (mod && !current) {
      current = {
        startTime:  Date.now(),
        module:     mod,
        bpmSamples: [],
        pattern:    mod === 'rhythm' ? (window.rhythm?.getPatternName() ?? null) : null,
      };
    } else if (current) {
      const bpm = sampleBpm(current.module);
      if (bpm) current.bpmSamples.push(bpm);
    }
  }, POLL_MS);

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

  function weekData(sessions) {
    const map = {};
    sessions.forEach(s => {
      const dur = (s.endTime - s.startTime) / 60000; // minutes
      const k   = dayKey(s.startTime);
      map[k] = (map[k] || 0) + dur;
    });
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = dayKey(d.getTime());
      days.push({ label: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()], mins: map[k] || 0 });
    }
    return days;
  }

  function totalMinutes(sessions) {
    return sessions.reduce((acc, s) => acc + (s.endTime - s.startTime) / 60000, 0);
  }

  /* ─── SVG Bar Chart ─── */

  // Daily bar chart — one bar per day (last 7). EVERY bar is labelled with that
  // day's practice duration in minutes (muted "0m" for rest days).
  function buildChart(days) {
    const W = 300, H = 98, BAR_W = 30, GAP = 12;
    const span  = days.length * (BAR_W + GAP) - GAP;
    const padX  = Math.max(0, (W - span) / 2);
    const baseY = H - 18;                 // baseline; day labels sit below
    const maxMins = Math.max(...days.map(d => d.mins), 1);
    let bars = '';
    days.forEach((d, i) => {
      const x      = padX + i * (BAR_W + GAP);
      const active = d.mins > 0;
      const mins   = Math.round(d.mins);
      const barH   = active ? Math.max(6, (d.mins / maxMins) * (baseY - 18)) : 3;
      const y      = baseY - barH;
      bars +=
        `<rect x="${x}" y="${y}" width="${BAR_W}" height="${barH}" rx="4"` +
        ` fill="${active ? 'var(--accent)' : 'var(--border)'}"/>` +
        // minutes value above every bar
        `<text x="${x + BAR_W / 2}" y="${y - 5}" text-anchor="middle" font-size="9"` +
        ` font-weight="700" fill="${active ? 'var(--accent)' : 'var(--text-muted)'}">${mins}m</text>` +
        // day label below
        `<text x="${x + BAR_W / 2}" y="${H - 4}" text-anchor="middle" font-size="9"` +
        ` fill="var(--text-secondary)">${d.label}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
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

  function renderLog() {
    const panel = document.getElementById('tab-log');
    if (!panel) return;

    const sessions = loadSessions();
    const streak   = calcStreak(sessions);
    const days     = weekData(sessions);
    const totalMin = totalMinutes(sessions);
    const totalHrs = (totalMin / 60).toFixed(1);

    const recent = sessions.slice(-20).reverse();

    panel.innerHTML = `
      <div class="log-stats-row">
        <div class="log-stat">
          <div class="log-stat-val">${streak}</div>
          <div class="log-stat-label">day streak</div>
        </div>
        <div class="log-stat">
          <div class="log-stat-val">${totalHrs}</div>
          <div class="log-stat-label">total hours</div>
        </div>
        <div class="log-stat">
          <div class="log-stat-val">${sessions.length}</div>
          <div class="log-stat-label">sessions</div>
        </div>
      </div>

      <div class="log-chart-wrap">
        <div class="log-section-title">Last 7 Days</div>
        ${buildChart(days)}
      </div>

      <div class="log-sessions-wrap">
        <div class="log-section-title">
          Recent Sessions
          ${sessions.length ? `<button class="log-clear-btn" id="log-clear-btn">Clear All</button>` : ''}
        </div>
        ${recent.length === 0
          ? '<div class="log-empty">Your practice starts here. Press play on any tool to log your first session.</div>'
          : recent.map(s => `
            <div class="log-session-row">
              <span class="log-session-icon">${moduleIcon(s.module)}</span>
              <div class="log-session-info">
                <span class="log-session-module">${moduleName(s.module)}${s.pattern ? ' · ' + s.pattern : ''}${s.bpm ? ' · ' + s.bpm + ' BPM' : ''}</span>
                <span class="log-session-time">${fmtDate(s.startTime)} ${fmtTime(s.startTime)} · ${fmtDuration(s.endTime - s.startTime)}</span>
              </div>
            </div>`).join('')
        }
      </div>
    `;

    document.getElementById('log-clear-btn')?.addEventListener('click', () => {
      if (confirm('Clear all practice sessions?')) {
        saveSessions([]);
        renderLog();
      }
    });
  }

  /* ─── Init ─── */

  document.addEventListener('DOMContentLoaded', renderLog);

  window.practiceLog = {
    getSessions: loadSessions,
    renderLog,
  };

})();
