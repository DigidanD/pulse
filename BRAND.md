# Pulse — Brand Guidelines

**Version 1.0 · The musician's toolbox**

This is the single source of truth for the Pulse brand: who we are, how we sound, and how we look. When a new feature, screen, or piece of copy is added, it should be checkable against this document.

---

## 1. Brand foundation

### 1.1 What Pulse is
Pulse is **the musician's toolbox** — a metronome, drum machine (Groove), tuner, and practice log in one focused app. Four tools that each feel like a real instrument, not a generic utility, in one place worth opening every day.

### 1.2 Positioning statement
> For the musician who practices seriously, **Pulse** is the all-in-one practice toolbox that replaces three apps and a notebook — because every tool you need is in one beautiful place, and each one is built like an instrument, not a calculator.

### 1.3 Audience
The **committed amateur and gigging semi-pro**: practices several times a week, owns a real instrument, currently juggles separate metronome / tuner / drum apps.

- **Not** the absolute beginner (too many tools).
- **Not** the studio pro (they own hardware).
- The sweet spot: *"I'm serious about getting better."*

### 1.4 What we believe
Practice is craft. The tools should respect that — precise, quiet, and beautiful — and get out of the way so the player can play.

### 1.5 Personality
Five traits, in priority order:

1. **Crafted** — every detail is intentional; nothing is a placeholder.
2. **Focused** — does a few things, does them excellently; no clutter.
3. **Confident** — pro-grade, never apologetic, never gimmicky.
4. **Warm** — a human pulse under the dark, precise surface.
5. **Musical** — speaks the player's language.

### 1.6 What Pulse is *not*
Cute · childish · skeuomorphic-kitsch · feature-bloated · "gamified" · loud.

---

## 2. Name

### 2.1 The name
**Pulse.** One syllable, premium, universal — it travels across languages and markets. It carries the whole product: rhythm is a pulse, pitch is a pulse, and the daily habit of practice is a pulse.

- **Always capitalized:** Pulse (never PULSE in body copy, never "pulse" lowercase). The wordmark may set it in uppercase as a *typographic* treatment (see §4).
- **No article:** "Open Pulse," not "open the Pulse."

### 2.2 Tagline
**The musician's toolbox.**

- Use with a period. It's a statement, not a slogan.
- Lockup: sits beneath or beside the wordmark (see §4.4).
- Don't stack multiple taglines. This is the one.

### 2.3 The tools (sub-names)
The four tools are single, clean nouns:

| Tool | Note |
|------|------|
| **Metronome** | The front door. |
| **Groove** | The drum machine. (Replaces the old "Rhythm Buddy" — that name is retired; it is off-brand.) |
| **Tuner** | — |
| **Log** | The practice journal. |

Write them capitalized when referring to the tool ("open Groove"), lowercase when generic ("a groove you like").

---

## 3. Logo & mark

### 3.1 The Pulse Mark
The mark is a **symmetric pulse waveform** — a row of rounded bars that rise from the edges to a single tall **coral center bar** (the beat-1 / downbeat). It reads at once as an audio level meter, a waveform, and a living pulse, and encodes the product's core idea: the emphasized *one* beat.

Master file: [`icons/pulse-mark.svg`](icons/pulse-mark.svg). Reference (drop-in):

```html
<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pulse">
  <g fill="#f09010">
    <rect x="4"   y="42" width="8" height="16" rx="4"/>
    <rect x="17"  y="36" width="8" height="28" rx="4"/>
    <rect x="30"  y="29" width="8" height="42" rx="4"/>
    <rect x="43"  y="20" width="8" height="60" rx="4"/>
    <rect x="69"  y="20" width="8" height="60" rx="4"/>
    <rect x="82"  y="29" width="8" height="42" rx="4"/>
    <rect x="95"  y="36" width="8" height="28" rx="4"/>
    <rect x="108" y="42" width="8" height="16" rx="4"/>
  </g>
  <rect x="56" y="9" width="8" height="82" rx="4" fill="#f76a6a"/>  <!-- the ONE -->
</svg>
```

**Why it works:** reads as metronome beats + a waveform + a living pulse; differentiated from the generic ♩ note glyph every competitor uses; and it is *animatable* — the bars can pulse at 120 BPM on a splash/loading state.

**Small sizes:** below ~32px the full waveform blurs, so the favicon uses a **simplified 5-bar** version on the dark tile ([`icons/favicon.svg`](icons/favicon.svg)).

### 3.1.1 Asset files
| File | Use |
|------|-----|
| `icons/pulse-mark.svg` | Vector master (transparent). |
| `icons/favicon.svg` | Simplified 5-bar favicon on tile. |
| `icons/icon-512.png`, `icon-192.png` | PWA / app icons (`manifest.json`). |
| `icons/apple-touch-icon.png` | iOS home-screen icon (180px). |
| `manifest.json` | Installable PWA metadata. |

The PNG app icons render the full glowing waveform (from the gpt-image-2 master) — premium at large sizes; the SVGs handle the crisp small sizes.

### 3.2 Construction & clear space
- Bars sit on a shared baseline, rounded caps (`rx` = half the bar width).
- **Clear space** around the mark = the width of one bar on every side.
- **Minimum size:** 16px tall (favicon). Below that, drop to a single coral bar if needed.

### 3.3 Color variations
| Context | Treatment |
|---------|-----------|
| Primary (dark UI) | Coral beat-1 + orange bars (as above). |
| Monochrome light | All bars `#0b0b10` on light. |
| Monochrome dark | All bars `#f0f0f8` on dark. |
| App icon / favicon | Mark centered on a `#16161e` rounded square (`rx` ≈ 22%). |

### 3.4 Don'ts
- Don't recolor the bars outside the brand palette.
- Don't add a drop shadow or outer glow to the mark itself (glow belongs to *live* UI states, not the logo).
- Don't stretch, skew, or re-space the bars.
- Don't reintroduce the ♩ note glyph.

---

## 4. Wordmark & lockups

### 4.1 Wordmark
**PULSE**, set in **Inter** at `--fw-black` (800), uppercase, letter-spacing ~`0.18em`, in accent orange `#f09010` on dark.

### 4.2 Primary lockup (header)
`[ Pulse Mark ]  PULSE`
Mark to the left, vertically centered, gap ≈ one bar-width. This is the in-app header.

### 4.3 Tagline lockup
```
[mark] PULSE
       The musician's toolbox.
```
Tagline in `--fs-xs`, `--text-secondary`, sentence case, sitting under the wordmark. Use on splash / marketing, not in the running app header.

### 4.4 Don'ts
- Don't set the wordmark in a non-Inter font.
- Don't add the old "♩" before the name.
- Don't put the wordmark on a busy background — it needs the near-black field.

---

## 5. Color

A two-axis system: **orange = you / active / control**; the **functional palette = the instrument talking back**. One accent, used with restraint, so it reads as *meaning* and not wallpaper.

### 5.1 Core palette
| Token | Hex | Role |
|-------|-----|------|
| `--bg-app` | `#0b0b10` | App background (near-black). |
| `--bg-card` | `#16161e` | Card surface. |
| `--bg-card-raised` | `#232331` | Raised surface / elevation. |
| `--border` | `#2a2a3a` | Hairline borders. |
| `--accent` | `#f09010` | **The brand orange.** Active, control, primary action. |
| `--beat1-color` | `#f76a6a` | **Beat-1 coral.** The emphasized downbeat — the brand's signature second hue. |
| `--text-primary` | `#f0f0f8` | Primary text. |
| `--text-secondary` | `#9a9ac0` | Secondary / labels (AA-safe). |
| `--text-muted` | `#8a8aa8` | Muted labels (AA-safe). |

### 5.2 Functional palette ("the instrument answers")
| Token | Hex | Meaning |
|-------|-----|---------|
| `--color-success` | `#50c878` | In tune / goal hit / streak. |
| `--color-danger` | `#e8584f` | Errors / destructive. |
| `--color-warning` | `#f0c020` | "Almost" states (near-in-tune, in-progress). |
| `--color-focus` | `#4da6ff` | Keyboard focus — the one cool hue, never used for content. |

### 5.3 The beat-1 motif
The orange→coral pair is the brand's recurring idea: **orange = the pulse, coral = the ONE.** Use it everywhere the concept of "the emphasized beat" appears — the metronome downbeat, Groove's bar-1, the tuner "in tune" lock, the Log streak day. It ties straight back to the Pulse Mark.

### 5.4 Glow discipline
Glow (`--accent-glow`) means **"this is happening now."** Reserve it for *live* states only — the playing button, the pulsing beat, the live step indicator, the tuner lock. **Never** on static selected states (active tab, chosen preset, open dropdown); those signal selection with accent fill alone.

### 5.5 Accessibility
- All text meets **WCAG 2.1 AA** at its size.
- Never signal state by color alone — pair with shape, icon, weight, or text.
- Text on accent orange is white `#f0f0f8` (one rule, everywhere).

---

## 6. Typography

### 6.1 Typeface
**Inter** (variable), loaded once. Chosen for its true **tabular numerals** — Pulse is a number-driven app (BPM, Hz, cents, minutes). Tabular + lining figures are on globally so digits never jitter.

Weights used: 400 / 600 / 700 / 800. No 900.

### 6.2 Type scale (tokens)
| Token | Size | Use |
|-------|------|-----|
| `--fs-display` | 5.5rem | **The hero numeral** — one shared size across tabs (BPM, tuner note, count-in). |
| `--fs-2xl` | 2rem | Log stats, octave. |
| `--fs-xl` | 1.5rem | Wordmark, pattern name. |
| `--fs-lg` | 1.125rem | Play label, timers, cents. |
| `--fs-md` | 1rem | Body, options, inputs. |
| `--fs-sm` | 0.875rem | Secondary labels, search. |
| `--fs-xs` | 0.75rem | Muted values, unit labels. |
| `--fs-2xs` | 0.6875rem | Micro-label **floor** (uppercase tracked labels). |
| `--fs-3xs` | 0.625rem | Badges only, never running text. |

### 6.3 Rules
- **One hero numeral.** The primary number on every tab is `--fs-display`. This is what makes the tools feel like one product.
- Uppercase tracked labels use `--tracking-wide` (1.5px); hero numerals use `--tracking-tight` (-0.02em).
- The wordmark's wide tracking (~0.18em) is the one deliberate exception.

---

## 7. Voice & tone

### 7.1 The voice: **Confident Coach**
A pro-grade tool with a human pulse. Think of a great practice teacher who *respects* you: precise and credible, never childish, never cold. The dark UI is the serious instrument; the words are the warm, encouraging human.

### 7.2 The litmus test
> Would a respected teacher say this to an adult student?

If yes, ship it. If it sounds like baby-talk or a dry error log, rewrite it.

### 7.3 Do / Don't
| Do | Don't |
|----|-------|
| Direct, motivating, musician-literate. | "Buddy," cutesy nicknames, baby-talk. |
| "Trains your internal clock." | Exclamation-mark cheerleading. |
| "Keep the beat yourself." | Dry engineer-speak ("Error: null"). |
| Plain, confident, short. | Fake urgency or fake scarcity. |

The existing Gap Mode / Bar Break descriptions ("Randomly silences clicks — trains your internal clock") are the **gold standard**. Match that.

### 7.4 Microcopy patterns
- **Empty states are a voice moment.** Empty Log → *"Your practice starts here. Log your first session."* (not "No data").
- **Errors are recoverable and human.** Mic denied → *"Microphone blocked. Allow mic access, then tap START to retry."* (not a raw alert).
- **Buttons are verbs.** START, TAP, RUN, Save Preset.
- **No fake tiers.** There are no "Pro" badges — the app is whole and free. Don't theater a paywall.

### 7.5 Naming features
Feature names are short and evocative but honest: *Tempo Ramp, Gap Mode, Bar Break, Auto-Fills, Count-in.* Avoid "Pro/Plus/Premium" labels unless a real paid tier exists.

---

## 8. Brand in the product

How the brand shows up on screen.

- **Header:** the primary lockup (mark + PULSE wordmark).
- **Tabs:** Metronome · Groove · Tuner · Log.
- **Favicon / app icon:** the Pulse Mark on a `#16161e` rounded square.
- **Cohesion anchors** — the four things that make four tools feel like one product:
  1. **One transport.** START / TAP / the play button are the same component on every tab.
  2. **One hero numeral.** Same `--fs-display` size on every tab.
  3. **The beat-1 motif.** Orange + coral recurs across all four tools.
  4. **The Log as memory.** Every tool can feed the Log, so the toolbox *remembers*.

---

## 9. Quick reference

```
Name        Pulse
Tagline     The musician's toolbox.
Tabs        Metronome · Groove · Tuner · Log
Colors      #0b0b10  #f09010  #f76a6a  #f0f0f8
Functional  #50c878  #e8584f  #f0c020  #4da6ff
Type        Inter (tabular nums) · weights 400/600/700/800
Hero size   5.5rem, shared across tabs
Logo        Pulse Mark — pulse bars, beat-1 tallest + coral
Voice       Confident Coach (would a respected teacher say it?)
Never       cute · ♩ glyph · fake "Pro" · color-only state · glow on selection
```

---

*Pulse Brand Guidelines v1.0. Living document — update it when the brand evolves.*
