'use strict';

(function () {

  /* ─────────────────────────────────────────────
     Constants
  ───────────────────────────────────────────── */
  const SCHEDULE_AHEAD_TIME = 0.1;
  const SCHEDULER_INTERVAL  = 25;
  const TAP_TIMEOUT         = 2000;
  const TAP_MAX_KEEP        = 8;

  /* ─────────────────────────────────────────────
     State
  ───────────────────────────────────────────── */
  const state = {
    isPlaying:           false,
    bpm:                 120,
    subdivision:         1,       // 1=quarter, 2=eighth, 3=triplet-quarter, 4=sixteenth, 6=triplet-eighth
    timeSigUpper:        4,
    timeSigLower:        4,
    soundType:           'beep',

    // Per-beat accent: 'accent' | 'normal' | 'silent'  (array indexed by beat)
    accentPattern:       ['accent', 'normal', 'normal', 'normal'],
    accentPreset:        'beat1',

    masterVolume:        0.8,
    countInEnabled:      true,

    currentBeat:         0,
    nextNoteTime:        0.0,
    timerID:             null,

    tapTimes:            [],
    tapTimeout:          null,

    rampEnabled:         false,
    rampStartBpm:        80,
    rampEndBpm:          140,
    rampMeasures:        8,
    rampCurrentMeasure:  0,
    rampActive:          false,

    // Gap Mode — randomly silences individual clicks
    gapMode:             false,
    gapProbability:      0.25,

    // Bar Break — silences entire bars periodically
    barBreakEnabled:     false,
    barBreakEvery:       4,
    barCount:            0,
    barMuted:            false,

    // Practice Timer
    timerEnabled:        false,
    timerDuration:       10,      // minutes
    timerRemaining:      0,
    timerIntervalID:     null,

    countInRemaining:    0,
    pendingFlashes:      [],
    rafRunning:          false,
    flashEnabled:        true,
  };

  /* ─────────────────────────────────────────────
     Audio Context (lazy)
  ───────────────────────────────────────────── */
  let audioCtx    = null;
  let noiseBuffer = null;
  let masterGain  = null;
  let wakeLock    = null;

  function getAudioCtx() {
    if (!audioCtx) {
      try {
        audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = state.masterVolume;
        masterGain.connect(audioCtx.destination);
        noiseBuffer = createNoiseBuffer(audioCtx);
      } catch (e) {
        showAudioError();
      }
    }
    return audioCtx;
  }

  function showAudioError() {
    const el = document.getElementById('audio-error');
    if (el) {
      el.style.display = 'flex';
      setTimeout(() => { el.style.display = 'none'; }, 6000);
    }
  }

  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try { wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
    }
  }

  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }

  function createNoiseBuffer(ctx) {
    const len  = Math.ceil(ctx.sampleRate * 0.5);
    const buf  = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function getDest() {
    return masterGain || (audioCtx && audioCtx.destination);
  }

  /* ─────────────────────────────────────────────
     Sound Synthesis
  ───────────────────────────────────────────── */
  function makeGain(ctx, volume, time, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    g.connect(getDest());
    return g;
  }

  function playSound(type, time, isAccent) {
    const ctx    = getAudioCtx();
    const volume = isAccent ? 1.0 : 0.55;
    switch (type) {
      case 'click':   playClick(ctx, time, volume, isAccent);   break;
      case 'wood':    playWood(ctx, time, volume, isAccent);    break;
      case 'beep':    playBeep(ctx, time, volume, isAccent);    break;
      case 'hihat':   playHihat(ctx, time, volume);             break;
      case 'rim':     playRim(ctx, time, volume, isAccent);     break;
      case 'cowbell': playCowbell(ctx, time, volume, isAccent); break;
    }
  }

  function playClick(ctx, time, volume, isAccent) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = isAccent ? 1800 : 1200;
    bpf.Q.value = 1.5;
    const g = makeGain(ctx, volume * 3, time, isAccent ? 0.03 : 0.02);
    src.connect(bpf); bpf.connect(g);
    src.start(time); src.stop(time + 0.05);
  }

  function playWood(ctx, time, volume, isAccent) {
    const freqA = isAccent ? 900 : 700;
    const freqB = isAccent ? 750 : 580;
    const decay = isAccent ? 0.07 : 0.05;
    [freqA, freqB].forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = makeGain(ctx, volume, time, decay);
      osc.connect(g);
      osc.start(time); osc.stop(time + decay + 0.01);
    });
  }

  function playBeep(ctx, time, volume, isAccent) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = isAccent ? 1000 : 800;
    const g = makeGain(ctx, volume, time, isAccent ? 0.09 : 0.06);
    osc.connect(g);
    osc.start(time); osc.stop(time + 0.12);
  }

  function playHihat(ctx, time, volume) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 5000;
    hpf.Q.value = 1.2;
    const g = makeGain(ctx, volume * 4, time, 0.06);
    src.connect(hpf); hpf.connect(g);
    src.start(time); src.stop(time + 0.09);
  }

  function playRim(ctx, time, volume, isAccent) {
    // Rim click — tight bandpass noise, pitched like a rimshot
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = isAccent ? 1600 : 1100;
    bpf.Q.value = 3.5;
    const g = makeGain(ctx, volume * 2.8, time, isAccent ? 0.025 : 0.018);
    src.connect(bpf); bpf.connect(g);
    src.start(time); src.stop(time + 0.04);
    // Low "thwack" component
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = isAccent ? 320 : 240;
    const g2 = makeGain(ctx, volume * 0.5, time, 0.02);
    osc.connect(g2);
    osc.start(time); osc.stop(time + 0.025);
  }

  function playCowbell(ctx, time, volume, isAccent) {
    // Cowbell — two square oscillators at classic frequencies, bandpass filtered
    const freq1 = isAccent ? 555 : 500;
    const freq2 = isAccent ? 845 : 800;
    const decay = isAccent ? 0.32 : 0.22;
    [freq1, freq2].forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = freq;
      bpf.Q.value = 2;
      const g = makeGain(ctx, volume * 0.28, time, decay);
      osc.connect(bpf); bpf.connect(g);
      osc.start(time); osc.stop(time + decay + 0.01);
    });
  }

  /* ─────────────────────────────────────────────
     Lookahead Scheduler
  ───────────────────────────────────────────── */
  function scheduler() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    while (state.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_TIME) {
      if (state.countInRemaining > 0) {
        scheduleCountInNote(state.nextNoteTime);
        advanceCountIn();
      } else {
        scheduleNote(state.currentBeat, state.nextNoteTime);
        advanceBeat();
      }
    }
  }

  function scheduleCountInNote(time) {
    const beatNum = state.timeSigUpper - state.countInRemaining + 1;
    playSound(state.soundType, time, beatNum === 1);
    state.pendingFlashes.push({ time, isCountIn: true, countNum: beatNum });
  }

  function advanceCountIn() {
    const beatDuration = (60.0 / state.bpm) * (4 / state.timeSigLower);
    state.nextNoteTime += beatDuration;
    state.countInRemaining--;
  }

  function scheduleNote(beatIndex, time) {
    const totalSubs   = state.timeSigUpper * state.subdivision;
    const beatNum     = Math.floor(beatIndex / state.subdivision);
    const accentState = (state.accentPreset === 'off') ? 'normal' : (state.accentPattern[beatNum] || 'normal');
    const isAccent    = accentState === 'accent';
    const isSilent    = accentState === 'silent';

    state.pendingFlashes.push({ beatIndex, totalSubs, time, isAccent, beatNum });

    if (!isSilent && !state.barMuted) {
      const gaped = state.gapMode && Math.random() < state.gapProbability;
      if (!gaped) playSound(state.soundType, time, isAccent);
    }
  }

  function advanceBeat() {
    const beatDuration = (60.0 / state.bpm) * (4 / state.timeSigLower);
    const subDuration  = beatDuration / state.subdivision;
    state.nextNoteTime += subDuration;

    const totalSubs = state.timeSigUpper * state.subdivision;
    state.currentBeat = (state.currentBeat + 1) % totalSubs;

    if (state.currentBeat === 0) {
      state.barCount++;

      if (state.barBreakEnabled) {
        state.barMuted = (state.barCount % state.barBreakEvery === 0);
        updateBarBreakVisual();
      }

      if (state.rampActive) advanceRamp();
    }
  }

  /* ─────────────────────────────────────────────
     Playback Control
  ───────────────────────────────────────────── */
  function startPlayback() {
    if (window.rhythm?.isPlaying()) window.rhythm.stop();
    const ctx = getAudioCtx();
    if (!ctx) return;
    ctx.resume();
    state.isPlaying          = true;
    state.currentBeat        = 0;
    state.nextNoteTime       = ctx.currentTime + 0.05;
    state.pendingFlashes     = [];
    state.barCount           = 0;
    state.barMuted           = false;

    if (state.countInEnabled) {
      state.countInRemaining = state.timeSigUpper;
    } else {
      state.countInRemaining = 0;
    }

    if (state.rampEnabled) initRamp();

    requestWakeLock();
    state.timerID = setInterval(scheduler, SCHEDULER_INTERVAL);

    if (!state.rafRunning) {
      state.rafRunning = true;
      requestAnimationFrame(rafLoop);
    }
  }

  function stopPlayback() {
    state.isPlaying        = false;
    state.rampActive       = false;
    state.countInRemaining = 0;
    state.barMuted         = false;
    releaseWakeLock();
    clearInterval(state.timerID);
    state.timerID          = null;
    state.pendingFlashes   = [];
    beatDots.forEach(d => d.classList.remove('active', 'accent'));
    updatePlayButton(false);
    updateRampProgress(0);
    setRampRunBtn(false);
    updateProgressBar(0);
    updateBarBreakVisual();
    hideCountIn();
    announce('Metronome stopped');
  }

  /* ─────────────────────────────────────────────
     RAF Visual Loop
  ───────────────────────────────────────────── */
  function rafLoop() {
    if (!audioCtx) { state.rafRunning = false; return; }
    const now = audioCtx.currentTime;

    state.pendingFlashes = state.pendingFlashes.filter(flash => {
      if (flash.time <= now) {
        if (flash.isCountIn) {
          showCountInNumber(flash.countNum);
        } else {
          const dotIndex = Math.floor(flash.beatIndex / state.subdivision);
          triggerDotFlash(dotIndex, flash.isAccent);
        }
        return false;
      }
      return true;
    });

    if (state.isPlaying || state.pendingFlashes.length > 0) {
      requestAnimationFrame(rafLoop);
    } else {
      state.rafRunning = false;
      hideCountIn();
    }
  }

  /* ─────────────────────────────────────────────
     Count-In Visual
  ───────────────────────────────────────────── */
  const countInDisplay = document.getElementById('count-in-display');
  const countInNumEl   = document.getElementById('count-in-num');

  function showCountInNumber(num) {
    const beatMs = 60000 / state.bpm;
    document.documentElement.style.setProperty('--count-beat-dur', Math.min(beatMs * 0.88, 700) + 'ms');
    beatVisualizer.classList.add('dimmed');
    countInDisplay.classList.add('active');
    countInNumEl.textContent = num;
    countInNumEl.classList.remove('popping');
    void countInNumEl.offsetWidth;
    countInNumEl.classList.add('popping');
  }

  function hideCountIn() {
    beatVisualizer.classList.remove('dimmed');
    countInDisplay.classList.remove('active');
  }

  /* ─────────────────────────────────────────────
     Bar Break Visual
  ───────────────────────────────────────────── */
  function updateBarBreakVisual() {
    const el = document.getElementById('bar-break-indicator');
    if (!el) return;
    el.classList.toggle('active', !!state.barMuted);
  }

  /* ─────────────────────────────────────────────
     Beat Dots + Per-Beat Accent
  ───────────────────────────────────────────── */
  let beatDots = [];

  function rebuildBeatDots() {
    beatVisualizer.innerHTML = '';
    beatDots = [];

    // Sync accentPattern length to timeSigUpper
    while (state.accentPattern.length < state.timeSigUpper) {
      state.accentPattern.push('normal');
    }
    state.accentPattern.length = state.timeSigUpper;

    for (let i = 0; i < state.timeSigUpper; i++) {
      const dot = document.createElement('div');
      dot.className = 'beat-dot beat-dot--' + state.accentPattern[i];
      dot.dataset.beat = i;
      dot.title = 'Beat ' + (i + 1) + ' — click to change accent';

      dot.addEventListener('click', () => {
        const cycle = ['normal', 'accent', 'silent'];
        const cur   = state.accentPattern[i];
        const next  = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
        state.accentPattern[i] = next;
        dot.className = 'beat-dot beat-dot--' + next +
          (dot.classList.contains('active') ? ' active' : '') +
          (dot.classList.contains('accent') ? ' accent' : '');
      });

      beatVisualizer.appendChild(dot);
      beatDots.push(dot);
    }
  }

  function triggerDotFlash(dotIndex, isAccent) {
    beatDots.forEach(d => d.classList.remove('active', 'accent'));
    const dot = beatDots[dotIndex];
    if (!dot) return;
    // Beat-dot highlight always runs — it is the core visual beat indicator and
    // must stay independent of the Screen Flash toggle. (Class is 'accent' to
    // match the CSS rule `.beat-dot.active.accent`.)
    void dot.offsetWidth;
    dot.classList.add('active');
    if (isAccent) dot.classList.add('accent');
    updateProgressBar((dotIndex + 1) / state.timeSigUpper);

    // Only the full-screen edge flash is gated by the Screen Flash toggle.
    if (state.flashEnabled) {
      const flashEl = document.getElementById('screen-flash');
      if (flashEl) {
        flashEl.classList.remove('flash-beat', 'flash-accent');
        void flashEl.offsetWidth;
        flashEl.classList.add(isAccent ? 'flash-accent' : 'flash-beat');
      }
    }
  }

  function updateProgressBar(progress) {
    if (barProgressFill) {
      barProgressFill.style.width = (Math.min(1, progress) * 100).toFixed(1) + '%';
    }
  }

  /* ─────────────────────────────────────────────
     Tap Tempo
  ───────────────────────────────────────────── */
  function onTapTempo() {
    const now = performance.now();

    if (state.tapTimes.length > 0) {
      const elapsed = now - state.tapTimes[state.tapTimes.length - 1];
      if (elapsed > TAP_TIMEOUT) state.tapTimes = [];
    }

    state.tapTimes.push(now);
    if (state.tapTimes.length > TAP_MAX_KEEP) {
      state.tapTimes = state.tapTimes.slice(-TAP_MAX_KEEP);
    }

    if (state.tapTimes.length < 2) return;

    let total = 0;
    for (let i = 1; i < state.tapTimes.length; i++) {
      total += state.tapTimes[i] - state.tapTimes[i - 1];
    }
    const avg    = total / (state.tapTimes.length - 1);
    const tapped = Math.round(60000 / avg);
    setBpm(tapped);

    clearTimeout(state.tapTimeout);
    state.tapTimeout = setTimeout(() => { state.tapTimes = []; }, TAP_TIMEOUT);

    tapBtn.classList.add('tapped');
    setTimeout(() => tapBtn.classList.remove('tapped'), 120);
  }

  /* ─────────────────────────────────────────────
     Ramp
  ───────────────────────────────────────────── */
  function setRampRunBtn(running) {
    if (!rampRunBtn) return;
    if (running) {
      rampRunBtn.textContent = '⏹ STOP';
      rampRunBtn.classList.add('active');
    } else {
      rampRunBtn.innerHTML = '&#9654; RUN';
      rampRunBtn.classList.remove('active');
    }
  }

  function initRamp() {
    if (state.rampStartBpm >= state.rampEndBpm) {
      showRampError(true);
      state.rampActive = false;
      return;
    }
    showRampError(false);
    state.rampActive         = true;
    state.rampCurrentMeasure = 0;
    state.bpm                = state.rampStartBpm;
    updateBpmUI(state.bpm);
    setRampRunBtn(true);
  }

  function advanceRamp() {
    state.rampCurrentMeasure++;
    const t = state.rampCurrentMeasure / state.rampMeasures;
    if (t >= 1) {
      state.bpm        = state.rampEndBpm;
      state.rampActive = false;
      updateBpmUI(state.bpm);
      updateRampProgress(1);
      setRampRunBtn(false);
      return;
    }
    state.bpm = Math.round(
      state.rampStartBpm + (state.rampEndBpm - state.rampStartBpm) * t
    );
    updateBpmUI(state.bpm);
    updateRampProgress(t);
  }

  function updateRampProgress(t) {
    if (rampProgressFill) {
      rampProgressFill.style.width = (t * 100).toFixed(1) + '%';
    }
  }

  function validateRamp() {
    const ok = state.rampStartBpm < state.rampEndBpm;
    showRampError(!ok);
    return ok;
  }

  function showRampError(show) {
    const el = document.getElementById('ramp-error');
    if (el) el.style.display = show ? 'block' : 'none';
  }

  /* ─────────────────────────────────────────────
     Practice Timer
  ───────────────────────────────────────────── */
  function startTimer() {
    state.timerRemaining = state.timerDuration * 60;
    updateTimerDisplay();
    const badge = document.getElementById('play-timer-badge');
    if (badge) badge.style.display = 'flex';
    clearInterval(state.timerIntervalID);
    state.timerIntervalID = setInterval(() => {
      state.timerRemaining--;
      updateTimerDisplay();
      if (state.timerRemaining <= 0) {
        clearInterval(state.timerIntervalID);
        state.timerIntervalID = null;
        if (state.isPlaying) stopPlayback();
        // Completion sound: short ascending beep
        const ctx = getAudioCtx();
        if (ctx) {
          [880, 1100, 1320].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const g   = ctx.createGain();
            g.connect(getDest());
            osc.frequency.value = freq;
            osc.type = 'sine';
            g.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.25);
            osc.connect(g);
            osc.start(ctx.currentTime + i * 0.15);
            osc.stop(ctx.currentTime + i * 0.15 + 0.3);
          });
        }
        updateTimerBtn(false);
        const badge = document.getElementById('play-timer-badge');
        if (badge) badge.style.display = 'none';
      }
    }, 1000);
    updateTimerBtn(true);
  }

  function stopTimer() {
    clearInterval(state.timerIntervalID);
    state.timerIntervalID = null;
    state.timerRemaining  = 0;
    updateTimerDisplay();
    updateTimerBtn(false);
    const badge = document.getElementById('play-timer-badge');
    if (badge) badge.style.display = 'none';
  }

  function updateTimerDisplay() {
    const el    = document.getElementById('timer-display');
    const badge = document.getElementById('play-timer-time');
    if (state.timerRemaining <= 0) {
      if (el)    el.textContent    = '--:--';
      if (badge) badge.textContent = '--:--';
      return;
    }
    const m   = Math.floor(state.timerRemaining / 60).toString().padStart(2, '0');
    const s   = (state.timerRemaining % 60).toString().padStart(2, '0');
    const txt = m + ':' + s;
    if (el)    el.textContent    = txt;
    if (badge) badge.textContent = txt;
  }

  function updateTimerBtn(running) {
    const btn = document.getElementById('timer-start-btn');
    if (!btn) return;
    btn.textContent  = running ? 'STOP' : 'START';
    btn.dataset.running = running ? '1' : '';
  }

  /* ─────────────────────────────────────────────
     setBpm — single source of truth
  ───────────────────────────────────────────── */
  function setBpm(newBpm) {
    const clamped = Math.max(40, Math.min(240, Math.round(newBpm)));
    state.bpm     = clamped;
    updateBpmUI(clamped);
    document.dispatchEvent(new CustomEvent('bpm-change', { detail: { bpm: clamped } }));
    announce('BPM ' + clamped);
  }

  function updateBpmUI(bpm) {
    bpmInput.value  = bpm;
    bpmSlider.value = bpm;
    const pct = ((bpm - 40) / 200 * 100).toFixed(1) + '%';
    bpmSlider.style.setProperty('--slider-pct', pct);

    const beatMs = 60000 / bpm;
    document.documentElement.style.setProperty(
      '--beat-flash-duration',
      Math.min(beatMs * 0.7, 260) + 'ms'
    );

    // Highlight matching preset button
    const presetsEl = document.getElementById('bpm-presets');
    if (presetsEl) {
      presetsEl.querySelectorAll('.bpm-preset').forEach(btn => {
        btn.classList.toggle('active', Number(btn.dataset.bpm) === bpm);
      });
    }
  }

  /* ─────────────────────────────────────────────
     Screen Reader Announcer
  ───────────────────────────────────────────── */
  function announce(msg) {
    const el = document.getElementById('sr-announcer');
    if (!el) return;
    el.textContent = '';
    setTimeout(() => { el.textContent = msg; }, 50);
  }

  /* ─────────────────────────────────────────────
     Play Button
  ───────────────────────────────────────────── */
  function updatePlayButton(playing) {
    playPauseBtn.classList.toggle('running', playing);
    playPauseBtn.querySelector('.btn-label').textContent    = playing ? 'STOP' : 'START';
    playPauseBtn.querySelector('.play-icon').style.display  = playing ? 'none' : '';
    playPauseBtn.querySelector('.pause-icon').style.display = playing ? '' : 'none';
    playPauseBtn.setAttribute('aria-label', playing ? 'Stop metronome' : 'Start metronome');
  }

  function togglePlayPause() {
    if (state.isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
      updatePlayButton(true);
      announce('Metronome started at ' + state.bpm + ' BPM');
    }
  }

  /* ─────────────────────────────────────────────
     Segmented Buttons Helper
  ───────────────────────────────────────────── */
  function activateSeg(group, btn) {
    group.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  /* ─────────────────────────────────────────────
     BPM nudge hold-to-repeat (mouse + touch)
  ───────────────────────────────────────────── */
  function setupNudge(btn, delta) {
    let intervalId = null;
    let timeoutId  = null;

    function fire() { setBpm(state.bpm + delta); }

    function start() {
      fire();
      timeoutId = setTimeout(() => {
        intervalId = setInterval(fire, 60);
      }, 400);
    }

    function cancel() {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
      timeoutId  = null;
      intervalId = null;
    }

    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup',   cancel);
    btn.addEventListener('mouseleave', cancel);

    btn.addEventListener('touchstart', e => { e.preventDefault(); start(); }, { passive: false });
    btn.addEventListener('touchend',   e => { e.preventDefault(); cancel(); });
    btn.addEventListener('touchcancel', cancel);
  }

  /* ─────────────────────────────────────────────
     DOM References
  ───────────────────────────────────────────── */
  const beatVisualizer   = document.getElementById('beat-visualizer');
  const bpmInput         = document.getElementById('bpm-input');
  const bpmSlider        = document.getElementById('bpm-slider');
  const bpmUpBtn         = document.getElementById('bpm-up');
  const bpmDownBtn       = document.getElementById('bpm-down');
  const playPauseBtn     = document.getElementById('play-pause-btn');
  const tapBtn           = document.getElementById('tap-tempo-btn');
  const flashToggleBtn   = document.getElementById('flash-toggle');
  const noteGroup        = document.getElementById('note-group');
  const timeSigGroup     = document.getElementById('timesig-group');
  const soundGroup       = document.getElementById('sound-group');
  const rampControls     = document.getElementById('ramp-controls');
  const rampStartInput   = document.getElementById('ramp-start-bpm');
  const rampEndInput     = document.getElementById('ramp-end-bpm');
  const rampMeasuresIn   = document.getElementById('ramp-measures');
  const rampProgressFill = document.getElementById('ramp-progress-fill');
  const rampRunBtn       = document.getElementById('ramp-run-btn');
  const barProgressFill  = document.getElementById('bar-progress-fill');

  /* ─────────────────────────────────────────────
     Event Listeners
  ───────────────────────────────────────────── */
  playPauseBtn.addEventListener('click', togglePlayPause);
  tapBtn.addEventListener('click', onTapTempo);

  if (flashToggleBtn) {
    flashToggleBtn.addEventListener('click', () => {
      state.flashEnabled = !state.flashEnabled;
      flashToggleBtn.classList.toggle('off', !state.flashEnabled);
    });
  }

  bpmSlider.addEventListener('input', () => setBpm(Number(bpmSlider.value)));
  bpmInput.addEventListener('change', () => setBpm(Number(bpmInput.value)));
  bpmInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') setBpm(Number(bpmInput.value));
  });

  setupNudge(bpmUpBtn, 1);
  setupNudge(bpmDownBtn, -1);

  // BPM Presets
  const presetsEl = document.getElementById('bpm-presets');
  if (presetsEl) {
    presetsEl.addEventListener('click', e => {
      const btn = e.target.closest('.bpm-preset');
      if (!btn) return;
      setBpm(Number(btn.dataset.bpm));
    });
  }

  // Master Volume
  const masterVolEl = document.getElementById('master-volume');
  if (masterVolEl) {
    masterVolEl.addEventListener('input', () => {
      state.masterVolume = Number(masterVolEl.value) / 100;
      if (masterGain) masterGain.gain.value = state.masterVolume;
      masterVolEl.style.setProperty('--slider-pct', masterVolEl.value + '%');
      const lbl = document.getElementById('master-volume-label');
      if (lbl) lbl.textContent = masterVolEl.value + '%';
    });
  }

  // ── Compact Dropdown Selectors (Note / Time Sig / Sound / Accent) ──────

  function closeAllCtrlSels(except) {
    ['note-sel', 'timesig-sel', 'sound-sel', 'accent-sel'].forEach(id => {
      if (id !== except) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('open');
        // keep aria in sync however the panel closed (selection / outside click)
        el.querySelector('.ctrl-trigger')?.setAttribute('aria-expanded', 'false');
      }
    });
  }

  ['note-sel', 'timesig-sel', 'sound-sel', 'accent-sel'].forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const trigger = sel.querySelector('.ctrl-trigger');
    const panel   = sel.querySelector('.ctrl-sel-panel');
    const opts    = () => Array.from(panel.querySelectorAll('.ctrl-opt'));
    trigger.setAttribute('aria-expanded', 'false');

    function openSel() {
      closeAllCtrlSels(selId);
      sel.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      (panel.querySelector('.ctrl-opt.active') || opts()[0])?.focus();
    }
    function closeSel(focusTrigger) {
      sel.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      if (focusTrigger) trigger.focus();
    }

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      sel.classList.contains('open') ? closeSel(false) : openSel();
    });
    // <button> triggers already open on Enter/Space via the click above; add
    // arrow-to-open and full in-panel keyboard navigation for the listbox.
    trigger.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openSel(); }
    });
    panel.addEventListener('keydown', e => {
      const list = opts();
      const i    = list.indexOf(document.activeElement);
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); (list[i + 1] || list[0]).focus(); break;
        case 'ArrowUp':   e.preventDefault(); (list[i - 1] || list[list.length - 1]).focus(); break;
        case 'Home':      e.preventDefault(); list[0]?.focus(); break;
        case 'End':       e.preventDefault(); list[list.length - 1]?.focus(); break;
        case 'Escape':    e.preventDefault(); closeSel(true); break;
        case 'Tab':       closeSel(false); break;
      }
    });
  });

  document.addEventListener('click', () => closeAllCtrlSels(null));

  // Note value
  noteGroup.addEventListener('click', e => {
    const btn = e.target.closest('.ctrl-opt');
    if (!btn) return;
    state.subdivision = Number(btn.dataset.subdivision);
    noteGroup.querySelectorAll('.ctrl-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const valEl = document.getElementById('note-val');
    if (valEl) valEl.textContent = btn.textContent.split(' ')[0];
    document.getElementById('note-sel').classList.remove('open');
    if (state.isPlaying) { state.currentBeat = 0; state.pendingFlashes = []; }
  });

  // Time Signature
  timeSigGroup.addEventListener('click', e => {
    const btn = e.target.closest('.ctrl-opt');
    if (!btn) return;
    state.timeSigUpper = Number(btn.dataset.upper);
    state.timeSigLower = Number(btn.dataset.lower);
    timeSigGroup.querySelectorAll('.ctrl-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const valEl = document.getElementById('timesig-val');
    if (valEl) valEl.textContent = btn.textContent;
    document.getElementById('timesig-sel').classList.remove('open');
    state.currentBeat    = 0;
    state.pendingFlashes = [];
    applyAccentPreset(state.accentPreset || 'beat1');
    rebuildBeatDots();
  });

  // Sound
  soundGroup.addEventListener('click', e => {
    const btn = e.target.closest('.ctrl-opt');
    if (!btn) return;
    state.soundType = btn.dataset.sound;
    soundGroup.querySelectorAll('.ctrl-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const valEl = document.getElementById('sound-val');
    if (valEl) valEl.textContent = btn.textContent;
    document.getElementById('sound-sel').classList.remove('open');
  });

  // Accent preset
  const ACCENT_LABELS = { beat1: '1', '1and3': '1+3', '2and4': '2+4', all: 'All', off: 'Off' };

  function applyAccentPreset(preset) {
    const n = state.timeSigUpper;
    let pat;
    switch (preset) {
      case '1and3': pat = Array.from({length: n}, (_, i) => (i === 0 || i === 2) ? 'accent' : 'normal'); break;
      case '2and4': pat = Array.from({length: n}, (_, i) => (i === 1 || i === 3) ? 'accent' : 'normal'); break;
      case 'all':   pat = Array(n).fill('accent'); break;
      case 'off':   pat = Array(n).fill('normal'); break;
      default:      pat = Array.from({length: n}, (_, i) => i === 0 ? 'accent' : 'normal'); preset = 'beat1';
    }
    state.accentPattern = pat;
    state.accentPreset  = preset;
    rebuildBeatDots();
  }

  const accentGroup = document.getElementById('accent-group');
  if (accentGroup) {
    accentGroup.addEventListener('click', e => {
      const btn = e.target.closest('.ctrl-opt');
      if (!btn) return;
      const preset = btn.dataset.accent;
      accentGroup.querySelectorAll('.ctrl-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const valEl = document.getElementById('accent-val');
      if (valEl) valEl.textContent = ACCENT_LABELS[preset] || preset;
      document.getElementById('accent-sel').classList.remove('open');
      applyAccentPreset(preset);
    });
  }

  // ── Count-In pill ──────────────────────────────────────────────────────
  const countInPill = document.getElementById('count-in-pill');
  if (countInPill) {
    // start active (checked by default)
    countInPill.classList.add('active');
    countInPill.addEventListener('click', () => {
      state.countInEnabled = !state.countInEnabled;
      countInPill.classList.toggle('active', state.countInEnabled);
      countInPill.setAttribute('aria-pressed', state.countInEnabled ? 'true' : 'false');
    });
  }

  // ── Feature Pills (Ramp / Gap / Bar Break / Timer) ────────────────────

  function toggleFeatPill(pillId, panelId, onActivate, onDeactivate) {
    const pill  = document.getElementById(pillId);
    const panel = document.getElementById(panelId);
    if (!pill || !panel) return;
    pill.addEventListener('click', () => {
      const active = pill.classList.toggle('active');
      panel.classList.toggle('expanded', active);
      if (active) onActivate(pill, panel);
      else        onDeactivate(pill, panel);
    });
  }

  // Ramp
  toggleFeatPill('ramp-pill', 'ramp-controls',
    () => { state.rampEnabled = true; },
    () => { state.rampEnabled = false; if (state.rampActive) state.rampActive = false; }
  );

  rampStartInput.addEventListener('change', () => {
    state.rampStartBpm = Math.max(40, Math.min(240, Number(rampStartInput.value)));
    rampStartInput.value = state.rampStartBpm;
    validateRamp();
  });
  rampEndInput.addEventListener('change', () => {
    state.rampEndBpm = Math.max(40, Math.min(240, Number(rampEndInput.value)));
    rampEndInput.value = state.rampEndBpm;
    validateRamp();
  });
  rampMeasuresIn.addEventListener('change', () => {
    state.rampMeasures = Math.max(1, Math.min(64, Number(rampMeasuresIn.value)));
    rampMeasuresIn.value = state.rampMeasures;
  });

  if (rampRunBtn) {
    rampRunBtn.addEventListener('click', () => {
      if (state.rampActive) {
        // Already running — stop the ramp (keep metronome going)
        state.rampActive = false;
        updateRampProgress(0);
        setRampRunBtn(false);
        return;
      }
      if (!validateRamp()) return;
      if (state.isPlaying) {
        // Hot-start: reset and launch ramp immediately without stopping
        initRamp();
      } else {
        // Metronome is stopped — start it (initRamp called inside startPlayback)
        startPlayback();
      }
    });
  }

  // Gap Mode
  toggleFeatPill('gap-pill', 'gap-controls',
    () => { state.gapMode = true; },
    () => { state.gapMode = false; }
  );
  const gapSlider = document.getElementById('gap-density');
  if (gapSlider) {
    gapSlider.addEventListener('input', () => {
      state.gapProbability = Number(gapSlider.value) / 100;
      const label = document.getElementById('gap-density-label');
      if (label) label.textContent = gapSlider.value + '%';
      gapSlider.style.setProperty('--slider-pct', gapSlider.value * 100 / 75 + '%');
    });
  }

  // Bar Break
  toggleFeatPill('bar-break-pill', 'bar-break-controls',
    () => { state.barBreakEnabled = true; },
    () => {
      state.barBreakEnabled = false;
      state.barMuted = false;
      updateBarBreakVisual();
    }
  );
  const barBreakSelect = document.getElementById('bar-break-every');
  if (barBreakSelect) {
    barBreakSelect.addEventListener('change', () => {
      state.barBreakEvery = Number(barBreakSelect.value);
    });
  }

  // Practice Timer
  toggleFeatPill('timer-pill', 'timer-controls',
    () => {
      state.timerEnabled = true;
      const wrap = document.getElementById('header-timer-wrap');
      if (wrap) wrap.style.display = '';
    },
    () => {
      state.timerEnabled = false;
      stopTimer();
      const wrap = document.getElementById('header-timer-wrap');
      if (wrap) wrap.style.display = 'none';
    }
  );
  const timerStartBtn    = document.getElementById('timer-start-btn');
  const timerDurationSel = document.getElementById('timer-duration');
  if (timerStartBtn) {
    timerStartBtn.addEventListener('click', () => {
      if (timerStartBtn.dataset.running) {
        stopTimer();
      } else {
        if (timerDurationSel) state.timerDuration = Number(timerDurationSel.value);
        startTimer();
        // A practice timer with nothing playing is pointless — start the
        // metronome so the countdown actually times a practice session.
        if (!state.isPlaying) {
          startPlayback();
          updatePlayButton(true);
          announce('Metronome started at ' + state.bpm + ' BPM');
        }
      }
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    // Only suppress shortcuts while actually typing in a field — NOT after a
    // button click (which leaves focus on the button). Previously any non-body
    // focus disabled Space, breaking it right after clicking START with a mouse.
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
              t.tagName === 'SELECT' || t.isContentEditable)) return;
    switch (e.code) {
      case 'Space': {
        e.preventDefault();
        const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
        if (activeTab === 'rhythm') {
          document.getElementById('rb-play-btn')?.click();
        } else {
          togglePlayPause();
        }
        break;
      }
      case 'ArrowUp':
        e.preventDefault();
        setBpm(state.bpm + (e.shiftKey ? 10 : 1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setBpm(state.bpm - (e.shiftKey ? 10 : 1));
        break;
      case 'KeyT':
        onTapTempo();
        tapBtn.classList.add('tapped');
        setTimeout(() => tapBtn.classList.remove('tapped'), 120);
        break;
      case 'KeyG':
        // Toggle Gap Mode via its feature pill (old gapChk checkbox no longer exists)
        document.getElementById('gap-pill')?.click();
        break;
      case 'KeyB':
        // Toggle Bar Break via its feature pill (old barBreakChk checkbox no longer exists)
        document.getElementById('bar-break-pill')?.click();
        break;
    }
  });

  // iOS Safari audio unlock
  document.addEventListener('touchstart', function unlock() {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    document.removeEventListener('touchstart', unlock);
  }, { once: true });

  /* ─────────────────────────────────────────────
     Tab Switching
  ───────────────────────────────────────────── */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      document.querySelectorAll('.tab-panel').forEach(p => {
        p.classList.toggle('active', p.id === 'tab-' + tab);
      });
      // Stop whichever audio module isn't the tab we just switched to. This
      // matters for the Tuner tab: a still-playing metronome/rhythm would leak
      // into the microphone. (The Tuner stops itself via its own tab handler.)
      if (tab !== 'metronome' && state.isPlaying) stopPlayback();
      if (tab !== 'rhythm' && window.rhythm?.isPlaying()) window.rhythm.stop();
    });
  });

  /* ─────────────────────────────────────────────
     Settings — Save / Load (localStorage)
  ───────────────────────────────────────────── */
  const SETTINGS_KEY = 'metronome-settings';

  function saveSettings() {
    const data = {
      bpm:               state.bpm,
      timeSigUpper:      state.timeSigUpper,
      timeSigLower:      state.timeSigLower,
      subdivision:       state.subdivision,
      sound:             state.soundType,
      volume:            state.masterVolume,
      accentPreset:      state.accentPreset,
      accentPattern:     state.accentPattern.slice(),
      countInEnabled:    state.countInEnabled,
      flashEnabled:      state.flashEnabled,
      rampEnabled:       state.rampEnabled,
      rampStart:         state.rampStartBpm,
      rampEnd:           state.rampEndBpm,
      rampMeasures:      state.rampMeasures,
      barBreakEnabled:   state.barBreakEnabled,
      barBreakEvery:     state.barBreakEvery,
      timerEnabled:      document.getElementById('timer-pill')?.classList.contains('active') || false,
      timerDuration:     state.timerDuration,
      gapMode:           state.gapMode,
      gapProbability:    state.gapProbability,
      rhythmPatternIdx:  window.rhythm ? window.rhythm.getPatternIndex() : 0,
      rhythmVolume:      window.rhythm ? window.rhythm.getVolume() : 0.8,
      activeTab:         document.querySelector('.tab-btn.active')?.dataset.tab || 'metronome',
    };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(data)); } catch (_) {}
    // Toast
    const toast = document.getElementById('save-toast');
    if (toast) {
      toast.style.display = 'block';
      clearTimeout(toast._t);
      toast._t = setTimeout(() => { toast.style.display = 'none'; }, 1500);
    }
  }

  function loadSettings() {
    let data;
    try { data = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch (_) {}
    if (!data) return;

    // BPM
    if (data.bpm) setBpm(data.bpm);

    // Time signature
    if (data.timeSigUpper && data.timeSigLower) {
      const tsBtn = document.querySelector(`[data-upper="${data.timeSigUpper}"][data-lower="${data.timeSigLower}"]`);
      if (tsBtn) tsBtn.click();
    }

    // Subdivision (option attribute is data-subdivision, not data-note)
    if (data.subdivision) {
      const subBtn = document.querySelector(`[data-subdivision="${data.subdivision}"]`);
      if (subBtn) subBtn.click();
    }

    // Sound
    if (data.sound) {
      const sndBtn = document.querySelector(`[data-sound="${data.sound}"]`);
      if (sndBtn) sndBtn.click();
    }

    // Master volume
    if (data.volume != null) {
      const vEl = document.getElementById('master-volume');
      if (vEl) { vEl.value = Math.round(data.volume * 100); vEl.dispatchEvent(new Event('input')); }
    }

    // Accent — restore preset first, then override with the saved per-beat
    // pattern so custom dot edits survive the round-trip.
    if (data.accentPreset) {
      const accBtn = document.querySelector(`[data-accent="${data.accentPreset}"]`);
      if (accBtn) accBtn.click();
    }
    if (Array.isArray(data.accentPattern) && data.accentPattern.length) {
      state.accentPattern = data.accentPattern.slice(0, state.timeSigUpper);
      while (state.accentPattern.length < state.timeSigUpper) state.accentPattern.push('normal');
      rebuildBeatDots();
    }

    // Flash
    if (data.flashEnabled === false) {
      state.flashEnabled = false;
      document.getElementById('flash-toggle')?.classList.add('off');
    }

    // Count-in
    if (data.countInEnabled === false && state.countInEnabled) {
      document.getElementById('count-in-pill')?.click();
    }

    // Ramp
    if (data.rampEnabled) {
      document.getElementById('ramp-pill')?.click();
      if (data.rampStart)   { state.rampStartBpm = data.rampStart;   if (rampStartInput) rampStartInput.value = data.rampStart; }
      if (data.rampEnd)     { state.rampEndBpm   = data.rampEnd;     if (rampEndInput)   rampEndInput.value   = data.rampEnd;   }
      if (data.rampMeasures){ state.rampMeasures = data.rampMeasures; if (rampMeasuresIn) rampMeasuresIn.value = data.rampMeasures; }
    }

    // Gap mode
    if (data.gapMode) {
      document.getElementById('gap-pill')?.click();
      if (data.gapProbability != null) {
        state.gapProbability = data.gapProbability;
        const sl = document.getElementById('gap-density');
        if (sl) { sl.value = Math.round(data.gapProbability * 100); sl.dispatchEvent(new Event('input')); }
      }
    }

    // Bar break
    if (data.barBreakEnabled) {
      document.getElementById('bar-break-pill')?.click();
    }

    // Timer
    if (data.timerEnabled) {
      document.getElementById('timer-pill')?.click();
      if (data.timerDuration) {
        state.timerDuration = data.timerDuration;
        const sel = document.getElementById('timer-duration');
        if (sel) sel.value = data.timerDuration;
      }
    }

    // Rhythm (after rhythm.js runs)
    if (window.rhythm) {
      if (data.rhythmPatternIdx > 0) window.rhythm.setPatternIndex(data.rhythmPatternIdx);
      if (data.rhythmVolume != null) window.rhythm.setVolume(data.rhythmVolume);
    }

    // Active tab
    if (data.activeTab && data.activeTab !== 'metronome') {
      document.querySelector(`.tab-btn[data-tab="${data.activeTab}"]`)?.click();
    }
  }

  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveSettings);

  /* ─────────────────────────────────────────────
     Init
  ───────────────────────────────────────────── */
  rebuildBeatDots();
  setBpm(state.bpm);

  // Expose public API for rhythm.js
  window.getSharedAudioCtx = getAudioCtx;
  // Shared master output bus — lets rhythm.js route through the same masterGain
  // so the Master Volume slider governs every module (not just the metronome).
  window.getSharedDest = getDest;
  window.metronome = {
    setBpm:       setBpm,
    tap:          onTapTempo,
    getBpm:       () => state.bpm,
    isPlaying:    () => state.isPlaying,
    loadSettings: loadSettings,
  };

})();
