(function () {
  'use strict';

  /* ─────────────────────────────────────────────
     Constants
  ───────────────────────────────────────────── */
  const NOTE_NAMES  = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const A4_FREQ     = 440;
  const A4_MIDI     = 69;
  const MIN_FREQ    = 65;    // Hz
  const MAX_FREQ    = 2000;  // Hz
  const CONFIDENCE  = 0.80;  // minimum YIN confidence (lowered for robustness)
  const YIN_THRESH  = 0.15;  // YIN cumulative-mean threshold
  const MEDIAN_N    = 5;     // median-filter window
  const AMP_THRESH  = 0.005; // RMS floor (lowered — 0.02 was too strict for some mics)
  const LOCK_CENTS   = 2;    // ±2¢ for green
  const TRANSIENT_MS = 180;  // ms to skip after note onset
  const STABILITY_N  = 4;    // consecutive ±2¢ readings required for green
  const FFT_SIZE     = 4096;

  /* ─────────────────────────────────────────────
     State
  ───────────────────────────────────────────── */
  let active    = false;
  let audioCtx  = null;
  let analyser  = null;
  let micStream = null;
  let rafId     = null;
  let pcmBuf    = null;

  let nPos           = 50;
  let nVel           = 0;
  let nTarget        = 50;
  let lastTs         = 0;

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
  let noteEl, octaveEl, freqEl, centsEl, lockEl,
      startBtn, needleEl, gaugeEl, displayEl, statusEl;

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('error', !!isError);
  }

  /* ─────────────────────────────────────────────
     YIN Pitch Detection
  ───────────────────────────────────────────── */
  function yin(signal, sampleRate) {
    const N = signal.length;
    const W = Math.floor(N / 2);

    // RMS amplitude check
    let sumSq = 0;
    for (let i = 0; i < N; i++) sumSq += signal[i] * signal[i];
    const rms = Math.sqrt(sumSq / N);
    if (rms < AMP_THRESH) return { null: true, reason: 'silent', rms };

    // Difference function + cumulative mean normalisation
    const d = new Float32Array(W);
    d[0] = 1;
    let rSum = 0;
    for (let tau = 1; tau < W; tau++) {
      let diff = 0;
      for (let i = 0; i < W; i++) {
        const delta = signal[i] - signal[i + tau];
        diff += delta * delta;
      }
      rSum += diff;
      d[tau] = rSum > 0 ? (diff * tau) / rSum : 0;
    }

    const tauMin = Math.max(2, Math.floor(sampleRate / MAX_FREQ));
    const tauMax = Math.min(W - 1, Math.floor(sampleRate / MIN_FREQ));
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
  function freqToNote(freq) {
    const midi     = 12 * Math.log2(freq / A4_FREQ) + A4_MIDI;
    const midiR    = Math.round(midi);
    const centsRaw = (midi - midiR) * 100;
    const cents    = Math.round(centsRaw);
    const name     = NOTE_NAMES[((midiR % 12) + 12) % 12];
    const octave   = Math.floor(midiR / 12) - 1;
    return { name, octave, cents, centsRaw, freq };
  }

  /* ─────────────────────────────────────────────
     Spring Physics
  ───────────────────────────────────────────── */
  function stepSpring(dt, hasSignal) {
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

    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    frameCount++;

    if (frameCount % 3 === 0) {
      // Safety: if analyser went away, bail
      if (!analyser) return;

      analyser.getFloatTimeDomainData(pcmBuf);

      const res = yin(pcmBuf, audioCtx.sampleRate);

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
        lastDet            = null;
        freqHistory.length = 0;
        centsWindow.length = 0;
        attackTime         = 0;
        isLocked           = false;

        if (displayedDet !== null && holdTimer === null) {
          frozenLocked = isLocked;
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
    stepSpring(dt, displayedDet !== null);
    needleEl.style.left = nPos.toFixed(2) + '%';
    centsEl.style.left  = nPos.toFixed(2) + '%';

    const showLocked = isLocked || frozenLocked;
    lockEl.classList.toggle('visible', showLocked);
    gaugeEl.classList.toggle('locked', showLocked);
    displayEl.classList.toggle('locked', showLocked);
    centsEl.classList.toggle('locked', showLocked);
    needleEl.classList.toggle('locked', showLocked);
  }

  /* ─────────────────────────────────────────────
     UI Update
  ───────────────────────────────────────────── */
  function updateUI(det) {
    if (!det) {
      noteEl.textContent   = '—';
      octaveEl.textContent = '';
      freqEl.textContent   = '— Hz';
      centsEl.textContent  = '—';
      return;
    }
    noteEl.textContent   = det.name;
    octaveEl.textContent = det.octave;
    freqEl.textContent   = det.freq.toFixed(1) + ' Hz';
    centsEl.textContent  = (det.cents >= 0 ? '+' : '') + det.cents + ' ¢';
  }

  /* ─────────────────────────────────────────────
     Start / Stop
  ───────────────────────────────────────────── */
  async function startTuner() {
    if (active) { stopTuner(); return; }

    // Permission-pending state — give immediate feedback while the browser
    // shows its mic prompt (the request can block for a while).
    startBtn.disabled = true;
    startBtn.textContent = 'Requesting mic…';
    setStatus('Allow microphone access to tune.', false);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new DOMException('Microphone API not available in this browser.', 'NotSupportedError');
      }

      audioCtx = window.getSharedAudioCtx
        ? window.getSharedAudioCtx()
        : new (window.AudioContext || window.webkitAudioContext)();

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation:  false,
          noiseSuppression:  false,
          autoGainControl:   false,
        },
        video: false,
      });

      const source = audioCtx.createMediaStreamSource(micStream);
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
      nVel               = 0;
      freqHistory.length = 0;
      lastTs             = performance.now();

      startBtn.disabled = false;
      startBtn.textContent = 'Stop Tuner';
      startBtn.classList.add('running');
      setStatus('Listening… play a single note.', false);

      rafId = requestAnimationFrame(rafLoop);
    } catch (err) {
      // Friendly, inline, recoverable — no blocking alert / raw technical text.
      active = false;
      if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
      startBtn.disabled = false;
      startBtn.textContent = 'Start Tuner';
      startBtn.classList.remove('running');
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      const noDevice = err && (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError');
      const msg = denied   ? 'Microphone blocked. Allow mic access in your browser, then tap START to retry.'
                : noDevice ? 'No microphone found. Connect one and tap START to retry.'
                :            'Couldn’t start the tuner. Tap START to try again.';
      setStatus(msg, true);
      console.warn('[Tuner] startTuner failed:', err);
    }
  }

  function stopTuner() {
    active = false;
    if (rafId)     { cancelAnimationFrame(rafId); rafId = null; }
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    analyser = null;

    startBtn.disabled = false;
    startBtn.textContent = 'Start Tuner';
    startBtn.classList.remove('running');
    setStatus('Tap START and play a single note.', false);

    isLocked   = false;
    lastDet    = null;
    if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null; }
    displayedDet   = null;
    frozenLocked   = false;
    lastInTuneBeep = 0;
    freqHistory.length = 0;
    nPos = 50; nVel = 0;
    needleEl.style.left = '50%';
    updateUI(null);
    lockEl.classList.remove('visible');
    gaugeEl.classList.remove('locked');
    displayEl.classList.remove('locked');
    centsEl.classList.remove('locked');
    needleEl.classList.remove('locked');
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
    if (!startBtn) {
      console.error('[Tuner] tuner-start-btn not found in DOM');
      return;
    }

    startBtn.addEventListener('click', startTuner);

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tab !== 'tuner' && active) stopTuner();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);

})();
