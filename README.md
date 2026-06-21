# Pulse — The musician's toolbox

> Metronome, Groove, Tuner, and a practice Log in one focused, beautiful tool you actually open every day.

A vanilla HTML/CSS/JS web app (no framework, no build step). All audio is synthesized or sample-driven via the Web Audio API. Mobile-first, dark theme, single column.

---

## Positioning

**Pulse is the musician's toolbox.** Four practice tools in one place, each crafted to feel like a real instrument — not a generic utility. The breadth (and the polish) is the value.

- **Audience:** the committed amateur / gigging semi-pro who practices several times a week and currently juggles separate apps.
- **Promise:** everything you need between you and the instrument, in one app worth opening daily.

---

## The four tools

| Tool | What it does |
|------|--------------|
| **Metronome** | Lookahead-scheduled click with subdivisions, odd time signatures (5/4, 6/8, 7/8), per-beat accents, 6 sounds, Tempo Ramp, Gap Mode, Bar Break, Practice Timer, Tap Tempo, count-in. |
| **Groove** | Drum machine — ~40 patterns across 9 genres, real **acoustic drum samples** (with synth fallback), swing/shuffle feel, auto-fills + crash, humanization, ghost notes. |
| **Tuner** | Microphone pitch detection (YIN algorithm) with median filtering, ±2¢ lock, spring-animated needle. |
| **Log** | Automatic practice tracking — day streak, total hours, a **daily bar chart with per-day minutes**, and a recent-sessions list. Persisted to `localStorage`. |

---

## Brand sheet

| | |
|---|---|
| **Name** | Pulse |
| **Tagline** | The musician's toolbox. |
| **Tabs** | Metronome · Groove · Tuner · Log |
| **Colors** | near-black `#0b0b10` · accent orange `#f09010` · beat-1 coral `#f76a6a` · text `#f0f0f8` |
| **Type** | Inter (variable), tabular numerals globally |
| **Logo** | "Pulse Mark" — pulse/waveform bars, first beat taller and in coral |
| **Voice** | Confident Coach — pro-grade tool, human pulse. Litmus: *would a respected teacher say it to an adult student?* |

---

## Design system

Tokens live in `:root` (`style.css`).

- **Type scale** — modular ≈1.2, 10 steps (`--fs-display` … `--fs-3xs`). One shared `--fs-display` (5.5rem) for the hero numeral on every tab (BPM / tuner note / count-in).
- **Spacing** — 4px rem grid (`--space-1` … `--space-8`).
- **Color** — single orange accent for "you / active / control"; a reserved functional palette (success / danger / warning / focus) for "the instrument talking back." Glow is reserved for *live* states only, never static selection.
- **Accessibility** — text colors meet WCAG AA at small sizes; 44px touch targets; full keyboard support on dropdowns; labelled form fields; cool focus ring (`--color-focus`) distinct from the accent.

---

## Architecture

```
index.html        # structure + all 4 tabs
style.css         # design tokens + all styling
metronome.js      # lookahead scheduler, synthesis, ramp/gap/bar-break/timer, save/load, shared AudioContext
rhythm.js         # pattern engine, feel, fills, humanization, acoustic samples + synth fallback
tuner.js          # YIN pitch detection, median filter, spring needle, mic handling
practice-log.js   # poll-based session capture, stats, SVG chart
```

- **Shared audio bus:** `metronome.js` owns the `AudioContext` and `masterGain`, exposed via `window.getSharedAudioCtx` / `window.getSharedDest`. Every module routes through it, so the Master Volume governs the whole app.
- **Cross-module API:** `window.metronome`, `window.rhythm`, `window.practiceLog`.
- **Acoustic drums:** samples load from a CDN on first play; each drum falls back to synthesis if a sample isn't available.

---

## Run locally

No build step. Serve the folder over HTTP (needed for mic + sample fetch):

```bash
python -m http.server 8766
# open http://localhost:8766/index.html
```

---

## Status

**Done**
- All four tools functional and verified in-browser (console clean).
- QA pass: save/load round-trip, beat-dot flash independence, keyboard shortcuts, accent flash, timer→playback, tuner stop, tab-switch audio handling.
- Expert-council fixes: tuner mic-permission UX, Space-after-click, unified accent color, dropdown keyboard a11y, Log reliability (min-session / module-change / try-catch), Log token + visibility fixes.
- Design system: Inter + type scale, unified hero numeral, glow discipline, 44px touch targets, sticky transport, Rhythm reading-order.
- **Branding rollout** (per `BRAND.md`): PULSE wordmark + Pulse Mark in header; new favicon; tab `Rhythm Buddy → Groove`; fake "Pro" badges removed; `<title>` updated; Log voice/microcopy (Groove module name, empty-state copy).

**Deferred (minor)**
- Card the metronome visualizer to match Groove's.
- Tuner lock-beep mic-feedback guard; `frozenLocked` logic; `setPatternIndex` parity.

---

*Working branch: `fix/qa-full-app`.*
