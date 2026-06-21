'use strict';

(function () {

  /* ─────────────────────────────────────────────
     Swing Feel Tables
  ───────────────────────────────────────────── */
  const FEEL_TABLE = {
    straight: [0,     0.25,  0.5,   0.75],
    shuffle:  [0,     0.167, 0.667, 0.833],
    swing:    [0,     0.208, 0.583, 0.792],
  };

  function stepDurationRatio(step, totalSteps, feel) {
    const s    = step % 4;
    const next = (step + 1) % totalSteps;
    const ns   = next % 4;
    const tbl  = FEEL_TABLE[feel] || FEEL_TABLE.straight;
    if (ns === 0) return 1 - tbl[s];
    return tbl[ns] - tbl[s];
  }

  /* ─────────────────────────────────────────────
     Humanization
  ───────────────────────────────────────────── */
  const TIMING_JITTER = 0.007;  // ±7ms micro-timing
  const VEL_JITTER    = 0.12;   // ±12% velocity variation
  const GHOST_CHANCE  = 0.13;   // 13% probability of ghost snare on empty step

  function humanize(amt) {
    return (Math.random() - 0.5) * 2 * amt;
  }

  /* ─────────────────────────────────────────────
     Fill Patterns  (16-step bars only)
  ───────────────────────────────────────────── */
  const FILLS = [
    // Classic snare roll (beats 3–4)
    { from: 8,  kick: [0,0,0,0, 0,0,0,1], snare: [1,0,1,1, 1,1,1,0], hh: [0,0,0,0, 0,0,0,0] },
    // Crash fill – descending snare
    { from: 8,  kick: [0,0,1,0, 0,0,0,0], snare: [1,1,0,1, 1,1,1,1], hh: [0,0,0,0, 0,0,0,0] },
    // Quick punch – last beat only
    { from: 12, kick: [0,0,1,0],           snare: [1,1,0,1],           hh: [0,0,0,0] },
    // Snare flutter
    { from: 8,  kick: [0,0,0,0, 0,0,0,0], snare: [0,1,1,0, 1,1,0,1], hh: [0,0,0,0, 0,0,0,0] },
    // Tom-feel: kick on the way down (simulated)
    { from: 8,  kick: [1,0,0,1, 0,0,1,1], snare: [0,1,1,0, 1,0,0,0], hh: [0,0,0,0, 0,0,0,0] },
    // Linear fill — no simultaneous hits
    { from: 8,  kick: [1,0,0,0, 1,0,0,0], snare: [0,1,0,1, 0,1,0,1], hh: [0,0,1,0, 0,0,1,0] },
  ];

  /* ─────────────────────────────────────────────
     Pattern Definitions  (16 steps = 1 bar 4/4, 12 steps = 1 bar 3/4)
     P(name, cat, bpm, kick, snare, hh, feel, ohh, beatsPerBar)
     ohh = open hi-hat positions (optional)
  ───────────────────────────────────────────── */
  let patternId = 0;
  const P = (name, cat, bpm, kick, snare, hh, feel, ohh, beatsPerBar) => ({
    id:          patternId++,
    name, cat, bpm,
    kick, snare, hh,
    ohh:         ohh   || Array(kick.length).fill(0),
    feel:        feel  || 'straight',
    steps:       kick.length,
    beatsPerBar: beatsPerBar || 4,
  });

  const PATTERNS = [
    // ── Rock ──
    P('Rock Basic',    'Rock',  120,
      [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]),

    P('Rock Shuffle',  'Rock',  120,
      [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,1,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], 'shuffle'),

    P('Hard Rock',     'Rock',  130,
      [1,0,1,0, 0,0,0,0, 1,0,1,0, 0,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1]),

    P('70s Rock',      'Rock',  110,
      [1,0,0,0, 0,0,0,0, 1,0,0,1, 0,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0]),

    P('Power Ballad',  'Rock',   70,
      [1,0,1,0, 0,0,0,0, 1,0,1,0, 0,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0]),

    P('Half-Time Rock', 'Rock', 100,
      [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
      [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]),

    // ── Blues ──
    P('Blues Shuffle', 'Blues',  90,
      [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], 'shuffle'),

    P('Slow Blues',    'Blues',  60,
      [1,0,0,1, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], 'shuffle'),

    P('Blues Boogie',  'Blues', 120,
      [1,0,1,0, 1,0,0,0, 1,0,1,0, 1,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], 'shuffle'),

    P('12-Bar Blues',  'Blues', 100,
      [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,1,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]),

    // ── Jazz ──
    P('Jazz Swing',    'Jazz',  140,
      [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,0,1,1, 0,0,1,0, 1,0,1,1, 0,0,1,0],
      'swing',
      // Open hi-hat on beat 3 ("and")
      [0,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0]),

    P('Jazz Waltz',    'Jazz',  160,
      // 12 steps = 3/4 time (3 beats × 4 sixteenth-notes)
      [1,0,0,0, 0,0,0,0, 0,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,1,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0],
      'swing', null, 3),

    P('Bebop',         'Jazz',  180,
      [1,0,0,0, 0,0,1,0, 0,0,0,0, 0,1,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,1, 1,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], 'swing'),

    P('Cool Jazz',     'Jazz',  120,
      [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0], 'swing',
      [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0]),

    // ── Funk ──
    P('Funk Basic',    'Funk',  100,
      [1,0,0,1, 0,0,0,0, 1,0,0,0, 0,1,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1]),

    P('Funk 16th',     'Funk',  110,
      [1,0,1,0, 0,1,0,0, 1,0,0,1, 0,0,1,0],
      [0,0,0,0, 1,0,1,0, 0,0,0,0, 1,0,1,0],
      [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1]),

    P('Groove Funk',   'Funk',   95,
      [1,0,0,0, 1,0,1,0, 0,0,0,0, 0,1,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
      null,
      [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,0,0]),

    // ── Latin ──
    P('Bossa Nova',    'Latin', 130,
      [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0],
      [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,1],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]),

    P('Samba',         'Latin', 145,
      [1,0,0,0, 0,1,0,0, 1,0,0,0, 0,1,0,0],
      [0,0,1,0, 1,0,0,1, 0,0,1,0, 1,0,0,1],
      [1,1,0,1, 1,1,0,1, 1,1,0,1, 1,1,0,1]),

    P('Cha-Cha',       'Latin', 120,
      [1,0,0,0, 0,0,0,0, 1,0,0,0, 1,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,1,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]),

    P('Mambo',         'Latin', 150,
      [1,0,0,1, 0,0,1,0, 0,1,0,0, 0,0,1,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1]),

    P('Rumba',         'Latin', 100,
      [1,0,0,1, 0,0,0,0, 0,1,0,0, 0,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]),

    // ── Hip-Hop ──
    P('Boom-Bap',      'Hip-Hop', 90,
      [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,0,0,1, 0,0,1,0, 1,0,0,0, 0,1,0,1]),

    P('Trap Basics',   'Hip-Hop', 140,
      [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,1,0,1, 1,1,0,1, 1,1,1,1, 1,1,0,1]),

    P('Lo-Fi',         'Hip-Hop', 75,
      [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
      [1,0,1,0, 0,1,0,0, 1,0,1,0, 0,1,0,0], 'shuffle'),

    P('Neo-Soul',      'Hip-Hop', 92,
      [1,0,0,1, 0,0,0,0, 0,1,0,0, 1,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,1,1,1, 0,1,1,1, 1,1,1,0, 1,1,1,1]),

    // ── Afrobeat ──
    P('Afrobeat',      'Afrobeat', 115,
      [1,0,0,1, 0,0,0,1, 0,0,1,0, 0,1,0,0],
      [0,0,0,0, 1,0,0,0, 0,1,0,0, 1,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]),

    P('Afro-Funk',     'Afrobeat', 105,
      [1,0,0,0, 1,0,0,1, 0,0,0,1, 0,1,0,0],
      [0,0,0,0, 1,0,1,0, 0,0,0,0, 1,0,0,0],
      [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1]),

    P('Highlife',      'Afrobeat', 120,
      [1,0,1,0, 0,0,0,0, 1,0,0,0, 0,1,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,1, 1,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]),

    // ── Metal ──
    P('Metal Groove',  'Metal',  160,
      [1,1,0,0, 1,0,0,0, 1,1,0,0, 1,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1]),

    P('Double Kick',   'Metal',  180,
      [1,1,0,0, 0,0,1,1, 1,0,0,1, 1,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1]),

    // ── Other ──
    P('Reggae',        'Other',  80,
      [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
      null,
      [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,1,0,0]),

    P('Country',       'Other', 120,
      [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]),

    P('R&B',           'Other',  90,
      [1,0,0,1, 0,0,0,0, 1,0,0,0, 0,1,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1]),

    P('Pop Ballad',    'Other',  75,
      [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0]),

    P('Gospel',        'Other',  88,
      [1,0,1,0, 0,0,0,0, 1,0,0,0, 0,0,1,0],
      [0,0,0,0, 1,0,1,0, 0,0,0,0, 1,0,0,1],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], 'shuffle'),

    P('Disco',         'Other', 120,
      [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]),

    P('New Orleans',   'Other',  92,
      [1,0,0,1, 0,1,0,0, 1,0,0,0, 0,1,0,1],
      [0,0,1,0, 1,0,0,0, 0,1,0,0, 1,0,0,0],
      [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1], 'shuffle'),
  ];

  /* ─────────────────────────────────────────────
     State
  ───────────────────────────────────────────── */
  const rb = {
    isPlaying:         false,
    currentStep:       0,
    nextStepTime:      0,
    timerID:           null,
    pattern:           PATTERNS[0],
    feel:              'straight',
    feelLockedByUser:  false,
    volume:            0.8,
    ghostProbability:  GHOST_CHANCE,
    bpm:               120,
    countInRemaining:  0,
    countInBeat:       4,
    pendingFlashes:    [],
    rafRunning:        false,
    barCount:          0,
    currentFill:       null,
    fillsEnabled:      true,
    crashPending:      false,
  };

  /* ─────────────────────────────────────────────
     Audio Context
  ───────────────────────────────────────────── */
  let rbNoiseBuffer = null;

  function getCtx() {
    return window.getSharedAudioCtx ? window.getSharedAudioCtx() :
      new (window.AudioContext || window.webkitAudioContext)();
  }

  function getNoiseBuffer() {
    if (!rbNoiseBuffer) {
      const ctx = getCtx();
      const len = Math.ceil(ctx.sampleRate * 0.5);
      rbNoiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = rbNoiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return rbNoiseBuffer;
  }

  // Shared master bus — route drums through the metronome's masterGain so the
  // Master Volume slider governs them too. Falls back to raw destination.
  function getDest() {
    return window.getSharedDest ? window.getSharedDest() : getCtx().destination;
  }

  /* ─────────────────────────────────────────────
     Acoustic Drum Samples (with synth fallback)
     Real recorded kit from the JavaScript30 drum kit (jsDelivr CDN). Each hit
     tries the decoded sample first; if samples haven't loaded (offline / slow /
     blocked), every play* function falls back to its original synthesis so the
     app never goes silent.
  ───────────────────────────────────────────── */
  const SAMPLE_BASE  = 'https://cdn.jsdelivr.net/gh/wesbos/JavaScript30@master/01%20-%20JavaScript%20Drum%20Kit/sounds/';
  const SAMPLE_FILES = {
    kick:    'kick.wav',
    snare:   'snare.wav',
    hihat:   'hihat.wav',
    openhat: 'openhat.wav',
    ride:    'ride.wav',
    tom:     'tom.wav',
  };
  const sampleBuffers = Object.create(null);
  let   samplesLoading = false;

  function loadSamples() {
    if (samplesLoading) return;
    samplesLoading = true;
    const ctx = getCtx();
    Object.entries(SAMPLE_FILES).forEach(([name, file]) => {
      fetch(SAMPLE_BASE + file)
        .then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
        .then(buf => new Promise((res, rej) => ctx.decodeAudioData(buf, res, rej)))
        .then(decoded => { sampleBuffers[name] = decoded; })
        .catch(() => { /* leave unset → that drum uses synth fallback */ });
    });
  }

  // Play a decoded sample. Returns false if not yet available (caller then
  // falls back to synthesis). `rate` lets one tom sample cover hi/mid/lo.
  function playSample(name, time, vol, rate) {
    const buf = sampleBuffers[name];
    if (!buf) return false;
    const ctx = getCtx();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (rate) src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = Math.max(0, vol);
    src.connect(g); g.connect(getDest());
    src.start(time);
    return true;
  }

  /* ─────────────────────────────────────────────
     Drum Sounds
  ───────────────────────────────────────────── */
  function playKick(ctx, time, vol) {
    if (playSample('kick', time, vol)) return;
    // Body: sine sweep for deep thump
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(185, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.15);
    gain.gain.setValueAtTime(vol * 0.72, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    osc.connect(gain); gain.connect(getDest());
    osc.start(time); osc.stop(time + 0.36);

    // Click transient: beater attack
    const click = ctx.createBufferSource();
    click.buffer = getNoiseBuffer();
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 3500 + Math.random() * 1200;
    bpf.Q.value = 0.5;
    const cGain = ctx.createGain();
    cGain.gain.setValueAtTime(vol * 0.5, time);
    cGain.gain.exponentialRampToValueAtTime(0.001, time + 0.013);
    click.connect(bpf); bpf.connect(cGain); cGain.connect(getDest());
    click.start(time); click.stop(time + 0.016);
  }

  function playSnare(ctx, time, vol) {
    if (playSample('snare', time, vol * 0.9)) return;
    // Body oscillator
    const body     = ctx.createOscillator();
    body.type      = 'triangle';
    const bodyGain = ctx.createGain();
    body.frequency.setValueAtTime(200, time);
    body.frequency.exponentialRampToValueAtTime(130, time + 0.05);
    bodyGain.gain.setValueAtTime(vol * 0.75, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.065);
    body.connect(bodyGain); bodyGain.connect(getDest());
    body.start(time); body.stop(time + 0.07);

    // Snare rattle (bandpass noise)
    const src  = ctx.createBufferSource();
    src.buffer = getNoiseBuffer();
    const bpf  = ctx.createBiquadFilter();
    bpf.type   = 'bandpass';
    bpf.frequency.value = 2200;
    bpf.Q.value = 0.65;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(vol * 1.55, time);
    nGain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);
    src.connect(bpf); bpf.connect(nGain); nGain.connect(getDest());
    src.start(time); src.stop(time + 0.14);

    // High crack
    const crack = ctx.createBufferSource();
    crack.buffer = getNoiseBuffer();
    const hpf   = ctx.createBiquadFilter();
    hpf.type    = 'highpass';
    hpf.frequency.value = 5500 + Math.random() * 1000;
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(vol * 0.55, time);
    crackGain.gain.exponentialRampToValueAtTime(0.001, time + 0.032);
    crack.connect(hpf); hpf.connect(crackGain); crackGain.connect(getDest());
    crack.start(time); crack.stop(time + 0.038);
  }

  function playGhostSnare(ctx, time, vol) {
    // Quiet, slightly tighter snare hit for ghost notes
    if (playSample('snare', time, vol * 0.18, 1.15)) return;
    const src  = ctx.createBufferSource();
    src.buffer = getNoiseBuffer();
    const bpf  = ctx.createBiquadFilter();
    bpf.type   = 'bandpass';
    bpf.frequency.value = 2000;
    bpf.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * 0.13, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.038);
    src.connect(bpf); bpf.connect(g); g.connect(getDest());
    src.start(time); src.stop(time + 0.045);
  }

  function playHH(ctx, time, vol, open) {
    if (playSample(open ? 'openhat' : 'hihat', time, vol * (open ? 1.0 : 0.9))) return;
    const src  = ctx.createBufferSource();
    src.buffer = getNoiseBuffer();
    const bands = open
      ? [[3000, 5], [5500, 8], [8500, 10], [11500, 7]]
      : [[4200, 7], [6800, 10], [10000, 13], [13500, 8]];
    const baseDecay = open ? 0.26 : 0.044;

    bands.forEach(([freq, Q], i) => {
      const bpf = ctx.createBiquadFilter();
      bpf.type  = 'bandpass';
      bpf.frequency.value = freq + humanize(freq * 0.015);
      bpf.Q.value = Q;
      const amp = vol * (0.55 - i * 0.09);
      if (amp <= 0) return;
      const decay = Math.max(0.01, baseDecay * (1 - i * 0.06));
      const g = ctx.createGain();
      g.gain.setValueAtTime(amp, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + decay);
      src.connect(bpf); bpf.connect(g); g.connect(getDest());
    });

    src.start(time);
    src.stop(time + (open ? 0.32 : 0.08));
  }

  function playRide(ctx, time, vol) {
    if (playSample('ride', time, vol)) return;
    // Ride cymbal: longer decay, slightly different resonance
    const src  = ctx.createBufferSource();
    src.buffer = getNoiseBuffer();
    const bands = [[2500, 4], [4800, 7], [7200, 9], [9500, 6]];
    const baseDecay = 0.18;

    bands.forEach(([freq, Q], i) => {
      const bpf = ctx.createBiquadFilter();
      bpf.type  = 'bandpass';
      bpf.frequency.value = freq + humanize(freq * 0.02);
      bpf.Q.value = Q;
      const amp = vol * (0.45 - i * 0.07);
      if (amp <= 0) return;
      const decay = Math.max(0.01, baseDecay * (1 - i * 0.08));
      const g = ctx.createGain();
      g.gain.setValueAtTime(amp, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + decay);
      src.connect(bpf); bpf.connect(g); g.connect(getDest());
    });

    // Bell: metallic ping
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 600 + humanize(20);
    const bellGain = ctx.createGain();
    bellGain.gain.setValueAtTime(vol * 0.12, time);
    bellGain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
    osc.connect(bellGain); bellGain.connect(getDest());
    osc.start(time); osc.stop(time + 0.26);

    src.start(time);
    src.stop(time + 0.22);
  }

  function playTom(ctx, time, vol, pitch) {
    // One tom sample pitched via playbackRate → hi / mid / lo
    if (playSample('tom', time, vol, pitch === 'hi' ? 1.25 : pitch === 'mid' ? 1.0 : 0.8)) return;
    // Tom: sine sweep, more pitched than kick
    const freq  = pitch === 'hi' ? 120 : pitch === 'mid' ? 85 : 60;
    const decay = pitch === 'hi' ? 0.18 : 0.25;
    const osc   = ctx.createOscillator();
    const gain  = ctx.createGain();
    osc.frequency.setValueAtTime(freq * 1.5, time);
    osc.frequency.exponentialRampToValueAtTime(freq, time + decay * 0.5);
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
    osc.connect(gain); gain.connect(getDest());
    osc.start(time); osc.stop(time + decay + 0.01);

    // Thwack transient
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer();
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = freq * 3;
    bpf.Q.value = 0.7;
    const tGain = ctx.createGain();
    tGain.gain.setValueAtTime(vol * 0.4, time);
    tGain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    src.connect(bpf); bpf.connect(tGain); tGain.connect(getDest());
    src.start(time); src.stop(time + 0.025);
  }

  function playCrash(ctx, time, vol) {
    // No dedicated crash sample in the kit — use the ride cymbal, hit harder
    if (playSample('ride', time, vol * 1.15)) return;
    // Crash cymbal: wide noise, long decay with metallic resonances
    const src  = ctx.createBufferSource();
    src.buffer = getNoiseBuffer();
    const bands = [[1500, 2], [3500, 4], [6000, 6], [9000, 5], [12000, 4]];

    bands.forEach(([freq, Q], i) => {
      const bpf = ctx.createBiquadFilter();
      bpf.type  = 'bandpass';
      bpf.frequency.value = freq + humanize(freq * 0.05);
      bpf.Q.value = Q;
      const amp   = vol * (0.5 - i * 0.07);
      if (amp <= 0) return;
      const decay = 0.8 * (1 - i * 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(amp, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + Math.max(0.05, decay));
      src.connect(bpf); bpf.connect(g); g.connect(getDest());
    });

    src.start(time);
    src.stop(time + 1.0);
  }

  /* ─────────────────────────────────────────────
     Scheduler
  ───────────────────────────────────────────── */
  const SCHED_AHEAD  = 0.1;
  const SCHED_INTVAL = 25;

  function scheduler() {
    const ctx = getCtx();
    while (rb.nextStepTime < ctx.currentTime + SCHED_AHEAD) {
      if (rb.countInRemaining > 0) {
        scheduleCountInBeat(rb.nextStepTime);
        advanceCountIn();
      } else {
        scheduleStep(rb.currentStep, rb.nextStepTime);
        advanceStep();
      }
    }
  }

  function scheduleCountInBeat(time) {
    const beatNum = rb.countInBeat - rb.countInRemaining + 1;
    playHH(getCtx(), time, rb.volume * 0.7, false);
    rb.pendingFlashes.push({ time, isCountIn: true, countNum: beatNum });
  }

  function advanceCountIn() {
    const beatDur = 60.0 / rb.bpm;
    rb.nextStepTime += beatDur;
    rb.countInRemaining--;
  }

  function scheduleStep(step, time) {
    const ctx = getCtx();
    const pat = rb.pattern;
    const vol = rb.volume;

    // Resolve fill override
    const fill    = rb.currentFill;
    const useFill = fill && step >= fill.from;
    const fi      = useFill ? step - fill.from : 0;
    const kickOn  = useFill ? fill.kick[fi]  : pat.kick[step];
    const snareOn = useFill ? fill.snare[fi] : pat.snare[step];
    const hhOn    = useFill ? fill.hh[fi]    : pat.hh[step];
    const ohhOn   = !useFill && pat.ohh[step];

    if (kickOn) {
      // In fills, use tom sounds for variety on steps 8-11, kick on 12-15
      if (useFill && step >= fill.from && step < fill.from + 4) {
        const t = time + humanize(TIMING_JITTER * 0.5);
        const v = Math.max(0.25, vol * (1 + humanize(VEL_JITTER * 0.5)));
        playTom(ctx, t, v * 0.85, 'hi');
      } else {
        const t = time + humanize(TIMING_JITTER * 0.5);
        const v = Math.max(0.25, vol * (1 + humanize(VEL_JITTER * 0.5)));
        playKick(ctx, t, v);
      }
    }

    if (snareOn) {
      const t = time + humanize(TIMING_JITTER);
      const v = Math.max(0.2, vol * 0.9 * (1 + humanize(VEL_JITTER)));
      playSnare(ctx, t, v);
    }

    if (hhOn && !ohhOn) {
      const beatPos      = step % 4;
      const accentFactor = beatPos === 0 ? 1.0 : beatPos === 2 ? 0.78 : 0.58;
      const t = time + humanize(TIMING_JITTER * 1.5);
      const v = Math.max(0.08, vol * 0.65 * accentFactor * (1 + humanize(VEL_JITTER * 1.5)));
      playHH(ctx, t, v, false);
    }

    if (ohhOn) {
      const t = time + humanize(TIMING_JITTER);
      const v = Math.max(0.1, vol * 0.55 * (1 + humanize(VEL_JITTER)));
      playHH(ctx, t, v, true);
    }

    // Ghost snare on empty steps
    if (!useFill && !snareOn && !kickOn && Math.random() < rb.ghostProbability) {
      const t = time + humanize(TIMING_JITTER * 2);
      playGhostSnare(ctx, t, vol);
    }

    rb.pendingFlashes.push({
      time, step,
      kick:  !!kickOn,
      snare: !!snareOn,
      hh:    !!(hhOn || ohhOn),
      isFillStep: useFill,
    });
  }

  function advanceStep() {
    const total   = rb.pattern.steps;
    const beatDur = 60.0 / rb.bpm;
    const ratio   = stepDurationRatio(rb.currentStep, total, rb.feel);
    rb.nextStepTime += ratio * beatDur;
    rb.currentStep   = (rb.currentStep + 1) % total;

    if (rb.currentStep === 0) {
      rb.barCount++;
      // Crash on first step of bar after a fill
      rb.crashPending = !!rb.currentFill;
      // Arm fill for every 4th bar (only for 16-step patterns)
      if (rb.fillsEnabled && total === 16) {
        rb.currentFill = (rb.barCount % 4 === 3)
          ? FILLS[Math.floor(Math.random() * FILLS.length)]
          : null;
      } else {
        rb.currentFill = null;
      }
    }

    // Crash on step 0 of bar after fill
    if (rb.currentStep === 0 && rb.crashPending) {
      const ctx = getCtx();
      playCrash(ctx, rb.nextStepTime, rb.volume * 0.7);
      rb.crashPending = false;
    }
  }

  /* ─────────────────────────────────────────────
     Playback Control
  ───────────────────────────────────────────── */
  function startRhythm() {
    const ctx = getCtx();
    ctx.resume();
    loadSamples();   // kick off acoustic-sample loading (idempotent; synth until ready)
    rb.isPlaying        = true;
    rb.currentStep      = 0;
    rb.nextStepTime     = ctx.currentTime + 0.05;
    rb.pendingFlashes   = [];
    rb.barCount         = 0;
    rb.currentFill      = null;
    rb.crashPending     = false;
    rb.countInBeat      = rb.pattern.beatsPerBar || 4;
    rb.countInRemaining = rb.countInBeat;

    rb.timerID = setInterval(scheduler, SCHED_INTVAL);
    if (!rb.rafRunning) { rb.rafRunning = true; requestAnimationFrame(rafLoop); }
  }

  function stopRhythm() {
    rb.isPlaying        = false;
    rb.countInRemaining = 0;
    rb.crashPending     = false;
    clearInterval(rb.timerID);
    rb.timerID          = null;
    rb.pendingFlashes   = [];
    clearStepVisuals();
    updatePlayBtn(false);
    hideCountIn();
  }

  /* ─────────────────────────────────────────────
     RAF Visual Loop
  ───────────────────────────────────────────── */
  function rafLoop() {
    if (!window.getSharedAudioCtx) { rb.rafRunning = false; return; }
    const ctx = getCtx();
    const now = ctx.currentTime;

    rb.pendingFlashes = rb.pendingFlashes.filter(flash => {
      if (flash.time <= now) {
        if (flash.isCountIn) {
          showCountIn(flash.countNum);
        } else {
          updateStepVisuals(flash.step, flash.kick, flash.snare, flash.hh, flash.isFillStep);
        }
        return false;
      }
      return true;
    });

    if (rb.isPlaying || rb.pendingFlashes.length > 0) {
      requestAnimationFrame(rafLoop);
    } else {
      rb.rafRunning = false;
      hideCountIn();
    }
  }

  /* ─────────────────────────────────────────────
     Count-In Visual
  ───────────────────────────────────────────── */
  const rbCountInDisplay = document.getElementById('rb-count-in-display');
  const rbCountInNum     = document.getElementById('rb-count-in-num');

  function showCountIn(num) {
    const beatMs = 60000 / rb.bpm;
    document.documentElement.style.setProperty('--count-beat-dur', Math.min(beatMs * 0.88, 700) + 'ms');
    rbCountInDisplay.classList.add('active');
    rbCountInNum.textContent = num;
    rbCountInNum.classList.remove('popping');
    void rbCountInNum.offsetWidth;
    rbCountInNum.classList.add('popping');
  }

  function hideCountIn() {
    rbCountInDisplay.classList.remove('active');
  }

  /* ─────────────────────────────────────────────
     Step Visuals
  ───────────────────────────────────────────── */
  let stepEls = [], kickEls = [], snareEls = [], hhEls = [];
  let kickLabel, snareLabel, hhLabel;
  let lastStep = -1;

  function buildVisualizer() {
    const pat   = rb.pattern;
    const total = pat.steps;

    // Set CSS custom property for dynamic grid columns (fixes Jazz Waltz)
    const wrapper = document.querySelector('.rb-vis-wrapper');
    if (wrapper) wrapper.style.setProperty('--rb-steps', total);

    const track = document.getElementById('rb-step-track');
    track.innerHTML = '';
    stepEls = [];
    for (let i = 0; i < total; i++) {
      const el = document.createElement('div');
      el.className = 'rb-step' + (i % 4 === 0 ? ' beat-start' : '');
      track.appendChild(el);
      stepEls.push(el);
    }

    const rows = document.getElementById('rb-instr-rows');
    rows.innerHTML = '';
    kickEls = []; snareEls = []; hhEls = [];

    [['KICK', pat.kick, kickEls], ['SNARE', pat.snare, snareEls], ['HH', pat.hh, hhEls]]
      .forEach(([name, arr, els]) => {
        const row   = document.createElement('div');
        row.className = 'rb-instr-row';
        const label = document.createElement('span');
        label.className = 'rb-instr-label';
        label.textContent = name;
        if (name === 'KICK')  kickLabel  = label;
        if (name === 'SNARE') snareLabel = label;
        if (name === 'HH')    hhLabel    = label;
        const steps = document.createElement('div');
        steps.className = 'rb-instr-steps';
        for (let i = 0; i < total; i++) {
          const s = document.createElement('div');
          s.className = 'rb-instr-step' + (arr[i] ? ' on' : '');
          steps.appendChild(s);
          els.push(s);
        }
        row.appendChild(label);
        row.appendChild(steps);
        rows.appendChild(row);
      });
  }

  function updateStepVisuals(step, kick, snare, hh, isFill) {
    if (lastStep >= 0 && lastStep < stepEls.length) {
      stepEls[lastStep].classList.remove('current');
      if (kickEls[lastStep])  kickEls[lastStep].classList.remove('current');
      if (snareEls[lastStep]) snareEls[lastStep].classList.remove('current');
      if (hhEls[lastStep])    hhEls[lastStep].classList.remove('current');
    }
    lastStep = step;

    if (stepEls[step]) {
      stepEls[step].classList.add('current');
      if (isFill) stepEls[step].classList.add('fill-step');
    }
    if (kickEls[step]  && kickEls[step].classList.contains('on'))  kickEls[step].classList.add('current');
    if (snareEls[step] && snareEls[step].classList.contains('on')) snareEls[step].classList.add('current');
    if (hhEls[step]    && hhEls[step].classList.contains('on'))    hhEls[step].classList.add('current');

    flashLabel(kickLabel,  kick);
    flashLabel(snareLabel, snare);
    flashLabel(hhLabel,    hh);

    // Fill announcement: highlight wrapper on fill steps
    const wrapper = document.querySelector('.rb-vis-wrapper');
    if (wrapper) wrapper.classList.toggle('fill-active', !!rb.currentFill);
  }

  function flashLabel(el, hit) {
    if (!el) return;
    el.classList.remove('hit');
    if (hit) { void el.offsetWidth; el.classList.add('hit'); }
  }

  function clearStepVisuals() {
    stepEls.forEach(e => e.classList.remove('current', 'fill-step'));
    kickEls.forEach(e => e.classList.remove('current'));
    snareEls.forEach(e => e.classList.remove('current'));
    hhEls.forEach(e => e.classList.remove('current'));
    if (kickLabel)  kickLabel.classList.remove('hit');
    if (snareLabel) snareLabel.classList.remove('hit');
    if (hhLabel)    hhLabel.classList.remove('hit');
    const wrapper = document.querySelector('.rb-vis-wrapper');
    if (wrapper) wrapper.classList.remove('fill-active');
    lastStep = -1;
  }

  /* ─────────────────────────────────────────────
     Pattern Grid
  ───────────────────────────────────────────── */
  function buildPatternGrid(cat, searchQuery) {
    const grid       = document.getElementById('pattern-grid');
    const emptyState = document.getElementById('pattern-empty-state');
    grid.innerHTML = '';
    let filtered = cat === 'all' ? PATTERNS : PATTERNS.filter(p => p.cat === cat);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || p.cat.toLowerCase().includes(q));
    }
    if (emptyState) {
      const empty = filtered.length === 0;
      emptyState.style.display = empty ? 'block' : 'none';
      emptyState.textContent   = empty
        ? 'No patterns found' + (searchQuery ? ` for "${searchQuery}"` : '')
        : '';
    }
    filtered.forEach(pat => {
      const card = document.createElement('div');
      card.className   = 'pattern-card' + (pat.id === rb.pattern.id ? ' active' : '');
      card.dataset.patternId = pat.id;

      // Mini-groove preview
      const preview = buildMiniGroove(pat);

      card.innerHTML =
        `<div class="pattern-card-name">${pat.name}</div>` +
        `<div class="pattern-card-bpm">${pat.bpm} BPM · ${pat.feel}</div>`;
      card.appendChild(preview);

      card.addEventListener('click', () => selectPattern(pat));
      grid.appendChild(card);
    });
  }

  function buildMiniGroove(pat) {
    const wrap = document.createElement('div');
    wrap.className = 'pattern-mini';
    // Show 4 beat positions (summarized)
    const beats = Math.min(4, pat.beatsPerBar || 4);
    const stepsPerBeat = Math.floor(pat.steps / (pat.beatsPerBar || 4));
    for (let b = 0; b < beats; b++) {
      const col = document.createElement('div');
      col.className = 'mini-beat';
      const start = b * stepsPerBeat;
      const hasKick  = pat.kick.slice(start, start + stepsPerBeat).some(Boolean);
      const hasSnare = pat.snare.slice(start, start + stepsPerBeat).some(Boolean);
      const hasHH    = pat.hh.slice(start, start + stepsPerBeat).some(Boolean);
      if (hasHH)    { const d = document.createElement('div'); d.className='mini-dot hh-dot';    col.appendChild(d); }
      if (hasSnare) { const d = document.createElement('div'); d.className='mini-dot snare-dot'; col.appendChild(d); }
      if (hasKick)  { const d = document.createElement('div'); d.className='mini-dot kick-dot';  col.appendChild(d); }
      wrap.appendChild(col);
    }
    return wrap;
  }

  function selectPattern(pat) {
    rb.pattern = pat;
    // Only update feel if user hasn't locked it
    if (!rb.feelLockedByUser) {
      rb.feel = pat.feel;
      document.querySelectorAll('#feel-group .seg-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.feel === pat.feel);
      });
    }
    document.getElementById('rhythm-pattern-name').textContent = pat.name;
    document.getElementById('rhythm-pattern-cat').textContent  = pat.cat;
    buildVisualizer();
    syncBpmFromPattern(pat.bpm);
    // Update active card using data-pattern-id (not textContent comparison)
    document.querySelectorAll('.pattern-card').forEach(c => {
      c.classList.toggle('active', Number(c.dataset.patternId) === pat.id);
    });
    // Scroll active card into view
    const activeCard = document.querySelector('.pattern-card.active');
    if (activeCard) activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    if (rb.isPlaying) {
      rb.currentStep  = 0;
      rb.pendingFlashes = [];
      rb.barCount     = 0;
      rb.currentFill  = null;
      rb.crashPending = false;
    }
  }

  function syncBpmFromPattern(bpm) {
    // Use window.metronome API instead of fragile DOM event dispatching
    if (window.metronome) {
      window.metronome.setBpm(bpm);
    } else {
      const bpmInput = document.getElementById('bpm-input');
      if (bpmInput) {
        bpmInput.value = bpm;
        bpmInput.dispatchEvent(new Event('change'));
      }
    }
    rb.bpm = bpm;
    updateRbBpmBadge(bpm);
  }

  function updateRbBpmBadge(bpm) {
    const el = document.getElementById('rb-bpm-badge');
    if (el) el.textContent = bpm + ' BPM';
  }

  /* ─────────────────────────────────────────────
     Category Filter + Category list generation
  ───────────────────────────────────────────── */
  function buildCategoryFilter() {
    const cats = ['all', ...new Set(PATTERNS.map(p => p.cat))];
    const filter = document.getElementById('cat-filter');
    if (!filter) return;
    filter.innerHTML = '';
    cats.forEach(cat => {
      const btn = document.createElement('button');
      btn.className  = 'cat-btn' + (cat === 'all' ? ' active' : '');
      btn.dataset.cat = cat;
      btn.textContent = cat === 'all' ? 'All' : cat;
      filter.appendChild(btn);
    });
  }

  /* ─────────────────────────────────────────────
     Play Button
  ───────────────────────────────────────────── */
  function updatePlayBtn(playing) {
    const btn = document.getElementById('rb-play-btn');
    if (!btn) return;
    btn.classList.toggle('running', playing);
    btn.querySelector('.btn-label').textContent    = playing ? 'STOP' : 'START';
    btn.querySelector('.play-icon').style.display  = playing ? 'none' : '';
    btn.querySelector('.pause-icon').style.display = playing ? '' : 'none';
  }

  /* ─────────────────────────────────────────────
     Event Listeners
  ───────────────────────────────────────────── */
  // BPM sync from metronome tab
  document.addEventListener('bpm-change', e => {
    rb.bpm = e.detail.bpm;
    updateRbBpmBadge(rb.bpm);
  });

  // Play button
  document.getElementById('rb-play-btn').addEventListener('click', () => {
    if (rb.isPlaying) {
      stopRhythm();
    } else {
      rb.bpm = window.metronome ? window.metronome.getBpm() :
        (Number(document.getElementById('bpm-input').value) || 120);
      startRhythm();
      updatePlayBtn(true);
    }
  });

  // Tap tempo in Rhythm Buddy (delegates to shared metronome API)
  const rbTapBtn = document.getElementById('rb-tap-btn');
  if (rbTapBtn) {
    rbTapBtn.addEventListener('click', () => {
      if (window.metronome) {
        window.metronome.tap();
      }
      rbTapBtn.classList.add('tapped');
      setTimeout(() => rbTapBtn.classList.remove('tapped'), 120);
    });
  }

  // BPM nudge in Rhythm Buddy
  const rbBpmUp   = document.getElementById('rb-bpm-up');
  const rbBpmDown = document.getElementById('rb-bpm-down');
  if (rbBpmUp)   rbBpmUp.addEventListener('click',   () => { if (window.metronome) window.metronome.setBpm(rb.bpm + 1); });
  if (rbBpmDown) rbBpmDown.addEventListener('click', () => { if (window.metronome) window.metronome.setBpm(rb.bpm - 1); });

  // Category filter
  document.getElementById('cat-filter').addEventListener('click', e => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const searchEl = document.getElementById('pattern-search');
    buildPatternGrid(btn.dataset.cat, searchEl ? searchEl.value : '');
  });

  // Pattern search
  const searchEl = document.getElementById('pattern-search');
  if (searchEl) {
    searchEl.addEventListener('input', () => {
      const activeCat = document.querySelector('.cat-btn.active');
      buildPatternGrid(activeCat ? activeCat.dataset.cat : 'all', searchEl.value);
    });
  }

  // Tempo feel
  document.getElementById('feel-group').addEventListener('click', e => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    document.querySelectorAll('#feel-group .seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const oldFeel = rb.feel;
    rb.feel = btn.dataset.feel;
    rb.feelLockedByUser = true;
    // Resync nextStepTime so already-queued next step lands at the correct
    // position under the new feel, preventing timing drift mid-bar.
    if (rb.isPlaying && oldFeel !== rb.feel) {
      const total   = rb.pattern.steps;
      const beatDur = 60.0 / rb.bpm;
      // currentStep was already advanced — prevStep is the one whose gap we correct
      const prevStep = (rb.currentStep - 1 + total) % total;
      const oldRatio = stepDurationRatio(prevStep, total, oldFeel);
      const newRatio = stepDurationRatio(prevStep, total, rb.feel);
      rb.nextStepTime += (newRatio - oldRatio) * beatDur;
    }
  });

  // Fills toggle
  const fillsPill = document.getElementById('fills-pill');
  if (fillsPill) {
    fillsPill.classList.add('active');
    fillsPill.addEventListener('click', () => {
      rb.fillsEnabled = !rb.fillsEnabled;
      fillsPill.classList.toggle('active', rb.fillsEnabled);
      if (!rb.fillsEnabled) rb.currentFill = null;
    });
  }

  // Ghost notes slider
  const ghostSlider = document.getElementById('ghost-probability');
  if (ghostSlider) {
    ghostSlider.addEventListener('input', () => {
      rb.ghostProbability = Number(ghostSlider.value) / 100;
      const label = document.getElementById('ghost-prob-label');
      if (label) label.textContent = ghostSlider.value + '%';
      ghostSlider.style.setProperty('--slider-pct', ghostSlider.value + '%');
    });
  }

  // Volume
  document.getElementById('rb-volume').addEventListener('input', e => {
    rb.volume = Number(e.target.value) / 100;
    const pct = e.target.value + '%';
    e.target.style.setProperty('--slider-pct', pct);
    const lbl = document.getElementById('rb-volume-label');
    if (lbl) lbl.textContent = e.target.value + '%';
  });

  /* ─────────────────────────────────────────────
     Init
  ───────────────────────────────────────────── */
  buildCategoryFilter();
  buildPatternGrid('all');
  buildVisualizer();
  rb.bpm = Number(document.getElementById('bpm-input').value) || 120;
  updateRbBpmBadge(rb.bpm);

  // Load persisted settings now that both modules are initialized
  if (window.metronome?.loadSettings) window.metronome.loadSettings();

  // Public API for cross-module access
  window.rhythm = {
    isPlaying:       () => rb.isPlaying,
    stop:            stopRhythm,
    getPatternIndex: () => PATTERNS.indexOf(rb.pattern),
    setPatternIndex: (i) => {
      const p = PATTERNS[i];
      if (!p) return;
      rb.pattern = p;
      buildVisualizer();
    },
    getPatternName: () => rb.pattern?.name ?? null,
    getBpm:    () => rb.bpm,
    getVolume: () => rb.volume,
    setVolume: (v) => {
      rb.volume = v;
      const slider = document.getElementById('rb-volume');
      if (slider) {
        slider.value = Math.round(v * 100);
        slider.style.setProperty('--slider-pct', Math.round(v * 100) + '%');
        const lbl = document.getElementById('rb-volume-label');
        if (lbl) lbl.textContent = Math.round(v * 100) + '%';
      }
    },
  };

})();
