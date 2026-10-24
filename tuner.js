(function () {
  'use strict';

  /* ─────────────────────────────────────────────
     Constants
  ───────────────────────────────────────────── */
  const NOTE_NAMES  = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const A4_MIDI     = 69;
  const MAX_FREQ    = 2000;  // Hz
  const CONFIDENCE  = 0.80;  // minimum YIN confidence
  const YIN_THRESH  = 0.15;  // YIN cumulative-mean threshold
  const MEDIAN_N    = 5;     // median-filter window
  const AMP_THRESH  = 0.005; // RMS floor
  const LOCK_CENTS   = 2;    // ±2¢ for green
  const TRANSIENT_MS = 180;  // ms to skip after note onset
  const STABILITY_N  = 4;    // consecutive ±2¢ readings required for green
  const FFT_SIZE     = 4096;
  const A4_MIN = 430, A4_MAX = 450;

  // Instrument presets: open strings (MIDI) + the lowest pitch to search for.
  // The low bound matters: searching far below the instrument invites octave
  // errors and costs CPU, so each preset searches just under its lowest string.
  const INSTRUMENTS = {
    guitar:  { label: 'Guitar',   minFreq: 65, strings: [40, 45, 50, 55, 59, 64] },        // E2 A2 D3 G3 B3 E4
    seven:   { label: '7-string', minFreq: 55, strings: [35, 40, 45, 50, 55, 59, 64] },    // B1 …
    bass:    { label: 'Bass',     minFreq: 36, strings: [28, 33, 38, 43] },                // E1 A1 D2 G2
  };

  const PREFS_KEY = 'tuner-prefs';

  /* ─────────────────────────────────────────────
     State
  ───────────────────────────────────────────── */
  let active    = false;
  let starting  = false;
  let audioCtx  = null;
  let analyser  = null;
  let source    = null;
  let micStream = null;
  let rafId     = null;
  let pcmBuf    = null;

  let a4         = 440;
  let instrument = 'guitar';

  let nPos           = 50;
  let nTarget        = 50;
  let lastTs         = 0;
  let level          = 0;     // smoothed input level 0..1

  const freqHistory  = [];
  let frameCount     = 0;
  let isLocked       = false;
  let lastDet        = null;
  let attackTime     = 0;
  const centsWindow  = [];

  let displayedDet    = null;
  let holdTimer       = null;
  let frozenLocked    = false;
  let lastInTuneBeep  = 0;

  /* ─────────────────────────────────────────────
     DOM refs
  ───────────────────────────────────────────── */
  let noteEl, octaveEl, freqEl, centsEl, lockEl, startBtn, needleEl,
      gaugeEl, displayEl, statusEl, stringsEl, levelFill, a4ValEl, instrGroup;

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('error', !!isError);
  }

  /* ─────────────────────────────────────────────
     Preferences
  ───────────────────────────────────────────── */
  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
      if (INSTRUMENTS[p.instrument]) instrument = p.instrument;
      if (p.a4 >= A4_MIN && p.a4 <= A4_MAX) a4 = p.a4;
    } catch (_) {}
  }

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ instrument, a4 })); } catch (_) {}
  }

  /* ─────────────────────────────────────────────
     YIN Pitch Detection
  ───────────────────────────────────────────── */
  function yin(signal, sampleRate, minFreq) {
    const N = signal.length;
    const W = Math.floor(N / 2);

    // RMS amplitude check
    let sumSq = 0;
    for (let i = 0; i < N; i++) sumSq += signal[i] * signal[i];
    const rms = Math.sqrt(sumSq / N);
    if (rms < AMP_THRESH) return { null: true, reason: 'silent', rms };

    const tauMin = Math.max(2, Math.floor(sampleRate / MAX_FREQ));
    const tauMax = Math.min(W - 2, Math.floor(sampleRate / minFreq));

    // Difference function + cumulative mean normalisation — only up to the
    // longest period we'd accept (+1 for interpolation). Computing all W lags
    // was ~2.8× the work for nothing.
    const limit = tauMax + 2;
    const d = new Float32Array(limit);
    d[0] = 1;
    let rSum = 0;
    for (let tau = 1; tau < limit; tau++) {
      let diff = 0;
      for (let i = 0; i < W; i++) {
        const delta = signal[i] - signal[i + tau];
        diff += delta * delta;
      }
      rSum += diff;
      d[tau] = rSum > 0 ? (diff * tau) / rSum : 0;
    }

    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (d[t] < YIN_THRESH) {
        while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau === -1) return { null: true, reason: 'no_dip', rms };

    // Sub-harmonic check
    const sh2lo = Math.round(tau * 1.85);
    const sh2hi = Math.min(tauMax, Math.round(tau * 2.15));
    if (sh2lo <= tauMax) {
      let tBest = sh2lo;
      for (let t = sh2lo + 1; t <= sh2hi; t++) {
        if (d[t] < d[tBest]) tBest = t;
      }
      if (d[tBest] < YIN_THRESH && d[tBest] < d[tau] * 0.6) {
        while (tBest + 1 <= tauMax && d[tBest + 1] < d[tBest]) tBest++;
        tau = tBest;
      }
    }

    // Parabolic interpolation
    const x0 = tau > tauMin ? tau - 1 : tau;
    const x2 = tau < tauMax ? tau + 1 : tau;
    let fine;
    if (x0 === tau) {
      fine = d[tau] <= d[x2] ? tau : x2;
    } else if (x2 === tau) {
      fine = d[tau] <= d[x0] ? tau : x0;
    } else {
      const s0 = d[x0], s1 = d[tau], s2 = d[x2];
      const denom = 2 * (2 * s1 - s2 - s0);
      fine = denom !== 0 ? tau + (s2 - s0) / denom : tau;
    }

    const confidence = 1 - d[tau];
    const freq = sampleRate / fine;
    if (confidence < CONFIDENCE) return { null: true, reason: 'low_conf', confidence, freq, rms };
    return { freq, confidence, rms };
  }

  /* ─────────────────────────────────────────────
     Median Filter
  ───────────────────────────────────────────── */
  function medianFreq(f) {
    if (freqHistory.length > 0) {
      const prev = freqHistory[freqHistory.length - 1];
      const ratio = f / prev;
      if (ratio < 0.84 || ratio > 1.19) freqHistory.length = 0;
    }
    freqHistory.push(f);
    if (freqHistory.length > MEDIAN_N) freqHistory.shift();
    const s = [...freqHistory].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  /* ─────────────────────────────────────────────
     Frequency → Note
  ───────────────────────────────────────────── */
  function midiToName(m) {
    return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  }

  function freqToNote(freq) {
    const midi     = 12 * Math.log2(freq / a4) + A4_MIDI;
    const midiR    = Math.round(midi);
    const centsRaw = (midi - midiR) * 100;
    const cents    = Math.round(centsRaw);
    const name     = NOTE_NAMES[((midiR % 12) + 12) % 12];
    const octave   = Math.floor(midiR / 12) - 1;
    return { name, octave, cents, centsRaw, freq, midi, midiR };
  }

  // Which open string is the player most likely tuning? The nearest one in
  // pitch, but only within a few semitones — otherwise it's chromatic.
  function nearestString(det) {
    if (!det) return -1;
    const strings = INSTRUMENTS[instrument].strings;
    let best = -1, bestDist = Infinity;
    strings.forEach((m, i) => {
      const dist = Math.abs(det.midi - m);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    return bestDist <= 2.5 ? best : -1;
  }

  /* ─────────────────────────────────────────────
     Needle smoothing
  ───────────────────────────────────────────── */
  function stepSpring(hasSignal) {
    const target = hasSignal ? nTarget : 50;
    const alpha  = hasSignal ? 0.15 : 0.04;
    nPos += (target - nPos) * alpha;
    nPos  = Math.max(0, Math.min(100, nPos));
  }

  /* ─────────────────────────────────────────────
     Lock Sound
  ───────────────────────────────────────────── */
  function playLockSound() {
    if (!audioCtx) return;
    const now = performance.now();
    if (now - lastInTuneBeep < 2000) return;
    lastInTuneBeep = now;

    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.value = 1046.5;
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.08);
  }

  /* ─────────────────────────────────────────────
     RAF Loop
  ───────────────────────────────────────────── */
  function rafLoop(ts) {
    if (!active) return;
    rafId = requestAnimationFrame(rafLoop);
    lastTs = ts;
    frameCount++;

    if (frameCount % 3 === 0) {
      if (!analyser) return;

      analyser.getFloatTimeDomainData(pcmBuf);
      const res = yin(pcmBuf, audioCtx.sampleRate, INSTRUMENTS[instrument].minFreq);

      // Input level: RMS → dB, mapped -60…-10 dBFS onto 0…1, smoothed.
      const db = 20 * Math.log10(Math.max(res.rms || 0, 1e-6));
      const target = Math.max(0, Math.min(1, (db + 60) / 50));
      level += (target - level) * (target > level ? 0.5 : 0.15);

      if (!res.null) {
        const prevDet = lastDet;
        lastDet = freqToNote(medianFreq(res.freq));

        if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null; }
        frozenLocked = false;
        displayedDet = lastDet;
        updateUI(displayedDet);

        if (prevDet === null) {
          attackTime = performance.now();
          centsWindow.length = 0;
        }

        const wasLocked = isLocked;
        if (performance.now() - attackTime >= TRANSIENT_MS) {
          centsWindow.push(lastDet.centsRaw);
          if (centsWindow.length > STABILITY_N) centsWindow.shift();
        }
        isLocked = centsWindow.length === STABILITY_N &&
                   centsWindow.every(c => Math.abs(c) <= LOCK_CENTS);
        if (isLocked && !wasLocked) playLockSound();

      } else {
        // Capture lock state BEFORE resetting — the hold must freeze whatever
        // the user saw at the moment the note decayed.
        const wasLockedAtDecay = isLocked;
        lastDet            = null;
        freqHistory.length = 0;
        centsWindow.length = 0;
        attackTime         = 0;
        isLocked           = false;

        if (displayedDet !== null && holdTimer === null) {
          frozenLocked = wasLockedAtDecay;
          holdTimer = setTimeout(() => {
            displayedDet       = null;
            frozenLocked       = false;
            holdTimer          = null;
            centsWindow.length = 0;
            updateUI(null);
          }, 5000);
        }
      }
    }

    nTarget = displayedDet
      ? 50 + Math.max(-50, Math.min(50, displayedDet.centsRaw))
      : 50;
    stepSpring(displayedDet !== null);
    needleEl.style.left = nPos.toFixed(2) + '%';
    centsEl.style.left  = nPos.toFixed(2) + '%';
    if (levelFill) levelFill.style.transform = 'scaleX(' + level.toFixed(3) + ')';

    const showLocked = isLocked || frozenLocked;
    lockEl.classList.toggle('visible', showLocked);
    gaugeEl.classList.toggle('locked', showLocked);
    displayEl.classList.toggle('locked', showLocked);
    centsEl.classList.toggle('locked', showLocked);
    needleEl.classList.toggle('locked', showLocked);
  }

  /* ─────────────────────────────────────────────
     UI
  ───────────────────────────────────────────── */
  function renderStrings() {
    if (!stringsEl) return;
    const strings = INSTRUMENTS[instrument].strings;
    stringsEl.innerHTML = '';
    strings.forEach((m, i) => {
      const el = document.createElement('span');
      el.className = 'tuner-string';
      el.dataset.idx = i;
      const name = midiToName(m);
      el.innerHTML = '<b>' + name.replace(/\d+$/, '') + '</b><small>' + name.replace(/^\D+/, '') + '</small>';
      el.setAttribute('aria-label', 'String ' + (strings.length - i) + ', ' + name);
      stringsEl.appendChild(el);
    });
  }

  function highlightString(det) {
    if (!stringsEl) return;
    const idx = nearestString(det);
    stringsEl.querySelectorAll('.tuner-string').forEach(el => {
      el.classList.toggle('active', Number(el.dataset.idx) === idx);
    });
  }

  function updateUI(det) {
    highlightString(det);
    if (!det) {
      noteEl.textContent   = '—';
      octaveEl.textContent = '';
      freqEl.textContent   = active ? 'Play a single note' : '— Hz';
      centsEl.textContent  = '';
      return;
    }
    noteEl.textContent   = det.name;
    octaveEl.textContent = det.octave;
    freqEl.textContent   = det.freq.toFixed(1) + ' Hz';
    centsEl.textContent  = (det.cents >= 0 ? '+' : '') + det.cents + '¢';
  }

  function updateA4() {
    if (a4ValEl) a4ValEl.textContent = a4;
  }

  function updateInstrumentButtons() {
    instrGroup?.querySelectorAll('[data-instr]').forEach(btn => {
      const on = btn.dataset.instr === instrument;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function setButton(running) {
    startBtn.classList.toggle('running', running);
    startBtn.querySelector('.btn-label').textContent = running ? 'STOP' : 'START';
    startBtn.setAttribute('aria-label', running ? 'Stop tuner' : 'Start tuner');
  }

  /* ─────────────────────────────────────────────
     Start / Stop
  ───────────────────────────────────────────── */
  async function startTuner() {
    if (active) { stopTuner(); return; }
    if (starting) return;
    starting = true;

    startBtn.disabled = true;
    startBtn.querySelector('.btn-label').textContent = 'MIC…';
    setStatus('Allow microphone access to tune.', false);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new DOMException('Microphone API not available in this browser.', 'NotSupportedError');
      }

      audioCtx = window.getSharedAudioCtx
        ? window.getSharedAudioCtx()
        : new (window.AudioContext || window.webkitAudioContext)();

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }

      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation:  false,
          noiseSuppression:  false,
          autoGainControl:   false,
        },
        video: false,
      });

      source = audioCtx.createMediaStreamSource(micStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize               = FFT_SIZE;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);

      pcmBuf = new Float32Array(FFT_SIZE);

      if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null; }
      active             = true;
      frameCount         = 0;
      centsWindow.length = 0;
      attackTime         = 0;
      isLocked           = false;
      lastDet            = null;
      displayedDet       = null;
      frozenLocked       = false;
      nPos               = 50;
      level              = 0;
      freqHistory.length = 0;
      lastTs             = performance.now();

      startBtn.disabled = false;
      setButton(true);
      setStatus('Listening — play one string at a time.', false);
      updateUI(null);
      window.pulseWakeLock?.acquire();

      rafId = requestAnimationFrame(rafLoop);
    } catch (err) {
      active = false;
      if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
      startBtn.disabled = false;
      setButton(false);
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      const noDevice = err && (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError');
      const msg = denied   ? 'Microphone blocked. Allow mic access in your browser, then tap START to retry.'
                : noDevice ? 'No microphone found. Connect one and tap START to retry.'
                :            'Couldn’t start the tuner. Tap START to try again.';
      setStatus(msg, true);
      console.warn('[Tuner] startTuner failed:', err);
    } finally {
      starting = false;
    }
  }

  function stopTuner() {
    active = false;
    if (rafId)     { cancelAnimationFrame(rafId); rafId = null; }
    if (source)    { try { source.disconnect(); } catch (_) {} source = null; }
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    analyser = null;

    startBtn.disabled = false;
    setButton(false);
    setStatus('Tap START and play a single note.', false);

    isLocked   = false;
    lastDet    = null;
    if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null; }
    displayedDet   = null;
    frozenLocked   = false;
    lastInTuneBeep = 0;
    freqHistory.length = 0;
    nPos = 50; level = 0;
    needleEl.style.left = '50%';
    centsEl.style.left  = '50%';
    if (levelFill) levelFill.style.transform = 'scaleX(0)';
    updateUI(null);
    lockEl.classList.remove('visible');
    gaugeEl.classList.remove('locked');
    displayEl.classList.remove('locked');
    centsEl.classList.remove('locked');
    needleEl.classList.remove('locked');
    window.pulseWakeLock?.release();
  }

  // Opening the Tuner tab starts listening right away — but only when the
  // mic is already allowed, so we never ambush the user with a prompt.
  async function autoStartIfPermitted() {
    if (active || starting) return;
    try {
      const st = await navigator.permissions?.query({ name: 'microphone' });
      if (st && st.state === 'granted') startTuner();
    } catch (_) { /* Permissions API missing (older Safari) — wait for START */ }
  }

  /* ─────────────────────────────────────────────
     Init
  ───────────────────────────────────────────── */
  function init() {
    noteEl    = document.getElementById('tuner-note');
    octaveEl  = document.getElementById('tuner-octave');
    freqEl    = document.getElementById('tuner-freq');
    centsEl   = document.getElementById('tuner-cents');
    lockEl    = document.getElementById('tuner-lock');
    startBtn  = document.getElementById('tuner-start-btn');
    needleEl  = document.getElementById('tuner-needle');
    gaugeEl   = document.getElementById('tuner-gauge');
    displayEl = document.getElementById('tuner-display');
    statusEl  = document.getElementById('tuner-status');
    stringsEl = document.getElementById('tuner-strings');
    levelFill = document.getElementById('tuner-level-fill');
    a4ValEl   = document.getElementById('tuner-a4-val');
    instrGroup = document.getElementById('tuner-instr');
    if (!startBtn) {
      console.error('[Tuner] tuner-start-btn not found in DOM');
      return;
    }

    loadPrefs();
    renderStrings();
    updateInstrumentButtons();
    updateA4();
    updateUI(null);

    startBtn.addEventListener('click', startTuner);

    instrGroup?.querySelectorAll('[data-instr]').forEach(btn => {
      btn.addEventListener('click', () => {
        instrument = btn.dataset.instr;
        freqHistory.length = 0;
        savePrefs();
        renderStrings();
        updateInstrumentButtons();
        highlightString(displayedDet);
      });
    });

    const nudgeA4 = delta => {
      a4 = Math.max(A4_MIN, Math.min(A4_MAX, a4 + delta));
      savePrefs();
      updateA4();
    };
    document.getElementById('tuner-a4-down')?.addEventListener('click', () => nudgeA4(-1));
    document.getElementById('tuner-a4-up')?.addEventListener('click', () => nudgeA4(1));

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tab !== 'tuner' && active) stopTuner();
        if (btn.dataset.tab === 'tuner') autoStartIfPermitted();
      });
    });

    // Release the mic when the app is backgrounded; it re-opens on return
    // only if the Tuner tab is still the one in front.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && active) stopTuner();
      if (document.visibilityState === 'visible' &&
          document.querySelector('.tab-btn.active')?.dataset.tab === 'tuner') {
        autoStartIfPermitted();
      }
    });

    // Restored straight into the Tuner tab (saved settings)?
    if (document.querySelector('.tab-btn.active')?.dataset.tab === 'tuner') autoStartIfPermitted();
  }

  document.addEventListener('DOMContentLoaded', init);

  window.tuner = {
    isActive: () => active,
  };

})();
