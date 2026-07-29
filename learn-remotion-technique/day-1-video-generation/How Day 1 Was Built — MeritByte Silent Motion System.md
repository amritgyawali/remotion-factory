# How Day 1 Was Built

MERITBYTE SILENT MOTION SYSTEM · COMPLETE BUILD PROCESS

Everything below is what actually happened, in order — the thinking, the decisions, the numbers, the code, the commands. Where I made a judgement call that departs from your brief, I say so and explain why.

One thing to be upfront about: **no git was used to make this video**, and **nothing was downloaded**. No stock assets, no font files, no music library, no icon pack. Every pixel and every sample was generated from code. That is not a limitation I worked around — it turned out to be the single most important reason the video is reproducible. I cover both points properly in their own sections.

* * *

## 1\. The pipeline in one picture

```
your brief (prose)
      │
      ▼
day01.script.json ◄─── generated, never hand-typed
      │
      ▼
src/lib/timeline.js ──────────► getState(frame) → a plain object
      │                                │
      │                                ├──► React (Remotion .tsx)
      │                                └──► DOM   (renderer/scene.js)
      │                                          │
      ▼                                          ▼
audio/build_audio.py                    headless Chromium
      │                                  screenshot per frame
      ▼                                          │
out/day01_audio.wav                     frames/f0000..f0509.png
      │                                          │
      └────────────────┬─────────────────────────┘
                       ▼
                    ffmpeg
                       ▼
        out/Day01_MakeTheLogoBigger.mp4
                       │
                       ▼
                   verify.py
```

The whole thing is `./build.sh`. Five steps, deterministic, \~90 seconds.

* * *

## 2\. Step 0 — Audit the environment before writing a line

Before any creative work I checked what the machine actually had. This sounds boring; it changed the entire architecture.

```bash
node --version          # v22.22.2
python3 --version       # 3.11.15
ffmpeg -version         # 6.1.1
fc-list : family        # which fonts exist?
npm view remotion       # 403 Forbidden  ← the decision point
curl https://github.com # 403 Forbidden
```

npm and GitHub were both blocked. So I could not `npm install remotion` and could not run `remotion render`.

**The reframe that saved the project:** Remotion is not magic. At its core it is one idea — *a video frame is a pure function of a frame number, rendered by headless Chromium and encoded by ffmpeg*. Chromium was installed. ffmpeg was installed. So I could build the real Remotion project as source **and** reproduce Remotion's own render loop over the Chrome DevTools Protocol to get you an actual MP4 today.

That constraint forced the best architectural decision in the project, which is section 4.

**Lesson for your local setup:** if you internalise "everything is `f(frame)`", you are never locked to one renderer. Remotion Studio, `remotion render`, Remotion Lambda and my CDP script all consume the same `timeline.js` and produce the same pixels.

* * *

## 3\. Step 1 — Strategy: read the brief as a constraint system

I did not start by designing. I started by asking what your four hard rules *delete*, and what is left over.

| Rule | What it removes | What must therefore do the work |
| --- | --- | --- |
| No humans | Faces, hands, reaction shots, gesture, eye\-line | Objects must have personality. The logo becomes the character. |
| No voice | Narration, timing cues, tone, emphasis | **On\-screen text is the entire script.** Sound carries emotion. |
| Sound only | Nothing to hide a bad edit behind | Every SFX must be frame\-exact or it reads as amateur |
| Remotion only | Footage, screenshots, screen recordings | The UI must be *rebuilt* as components — which means it can break on cue |

That last row is the creative unlock and it is worth dwelling on. If you screen\-record a real website, the logo cannot grow. Because the homepage here is real DOM driven by a variable, the layout genuinely breaks: nav items really do get pushed off the right edge and clipped by `overflow: hidden`. **The joke is only possible because of the constraint.** That is the mindset to bring to all thirty.

### The comedy engine

Day 1 is not "a funny idea told once". It is a four\-part mechanical structure, and this same structure will carry days 5, 8, 12, 16, 20, 24 and 27:

1. **Escalation ladder** — six rounds, each visually and sonically bigger than the last. Predictable enough to follow, absurd enough to keep watching.
2. **The freeze** (6–7s) — one full second where *nothing* moves and the music strips to bass. Comedy needs a breath before the turn.
3. **The hard silence** (11–12s) — total digital silence on the client's message. In a video with no voice, silence is the closest thing you have to delivery.
4. **The snap\-back** (12–13s) — the payoff arrives in a single fast motion, then the tick, then the loop.

Notice the rhythm: build, stop, build bigger, cut away, **silence**, release. Escalation alone is boring by round four; the freeze and the silence are what make round six land.

### The retention design

Two devices, both structural rather than decorative:

- **The number in the hook.** "round 7 of 7" is a promise. A viewer who sees round 2 must reach round 7. The counter chip keeps that promise visible.
- **The seamless loop.** Frame 420 is byte\-identical to frame 0, so a replay is invisible. Viewers watch the escalation twice without noticing, which roughly doubles your average watch time on a 15\-second video. I did not eyeball this — I enforced it in code (section 6) and asserted it in tests (section 12).

* * *

## 4\. Step 2 — The single architectural decision

Here is the decision that everything else follows from.

**Every animated value in the video lives in one file, as a pure function of the frame number. Components contain no animation logic at all.**

```js
// src/lib/timeline.js
export function getState(rawFrame) {
  // ...
  return { logoH, navWrapped, scrollY, chip, aside, payoff, chat, endcard, ... };
}
```

A component's whole job becomes "given this state object, draw it":

```tsx
const DevJoke = () => {
  const s = getState(useCurrentFrame());
  return s.scene === 'chat' ? <ChatPanel state={s}/> : <BrowserFrame state={s}/>;
};
```

Four things this buys you, all of which I relied on:

1. **Two renderers, zero drift.** The React components and my vanilla\-DOM renderer read the same `getState`. That is the only reason I could ship you a real MP4 without Remotion installed.
2. **The loop becomes provable.** See section 6.
3. **The freeze becomes exact.** A frozen beat is a segment where `from === to`, so it returns a literal constant — not "a spring that has mostly settled".
4. **Tuning is one file.** Every layout fix I made during review was a number in `timeline.js`, never a component rewrite.

This is the habit to train into your local Remotion work. The common failure mode is scattering `spring()` and `interpolate()` across twenty components — after which you cannot reason about, test, or reuse any of it.

* * *

## 5\. Step 3 — Transcribe the brief into a machine\-readable table

Before drawing anything, I turned your Day 1 page into data. Prose is not buildable; a table is.

```js
export const ROWS = [
  { from: S(0), to: S(1), text: 'MAKE THE LOGO BIGGER', note: 'logo 40->64, damping 12' },
  { from: S(1), to: S(2), text: 'ROUND 2',              note: 'logo 64->96, nav pushes right' },
  // ... all 16 rows
];
```

`S(sec) = Math.round(sec * 30)` is the whole "second 7 is frame 210" conversion, in one place.

**`day01.script.json` is generated from this, not written by hand** (`node scripts/emit-script-json.mjs`). It joins `ROWS` with the audio cue table and asks `getState()` for the real logo height at each row start. It therefore cannot lie about what the video does. That file is the one to grow into the `plan.json` of thirty your pipeline commits.

* * *

## 6\. Step 4 — Direction, layout and "camera angles"

### There is no camera — and that is a useful thing to know

In a faceless Remotion video you have no lens, no focal length and no angles. You have exactly three moves, and being explicit about that stops you reaching for effects that do not exist:

| Move | CSS | Used in Day 1 for |
| --- | --- | --- |
| **Scale** | `width`/`height` on the logo | the entire escalation, rounds 1–6 |
| **Y\-translate** | `transform: translateY()` on the page | the 8–9s pan down the dead page |
| **Cut** | swap the scene component | 9s to the chat panel, 12s back, 14s loop, 15s end card |

Three moves for fifteen seconds. Restraint is the direction. Every push\-in, rotation or parallax you *don't* add is attention left over for the joke.

### The vertical grid

1080 × 1920 splits into three fixed zones. Fixed matters — zones that resize between beats cause the eye to re\-hunt for text, which is death on a 15\-second video.

| Zone | Y range | Holds |
| --- | --- | --- |
| Hook band | 0 – 430 | the 96px hook; the counter chip at right 60 / top 296 |
| Stage | 430 – 1660 | the browser frame (1000 × 1230, radius 26) |
| Aside band | 1660 – 1920 | lowercase asides at y 1698; the lockup at left 48 / bottom 44 |

The browser frame is 1000px wide showing a **desktop\-proportioned** site. That is deliberate: a desktop nav is what visibly wraps and gets clipped. A mobile nav would just be a hamburger and the joke would die.

### Why a browser frame at all

It does three jobs at once: it says "this is a website" without a word, its rounded corners and shadow separate white UI from dark canvas, and — most usefully — `overflow: hidden` on its viewport is the mechanism that clips the nav off the right edge and lets the logo bleed past both edges. The frame is not decoration, it is the clipping mask.

### Colour

```js
ink        #191919   // end-card background — fixed across all 30
canvas     #0F1012   // video backdrop
accent     #3B6DF6   // MeritByte blue — lockup + end-card mark
amber      #FFB020   // counter chip. The only "alarm" colour, so it always reads
green      #22C55E   // the payoff tick, used exactly once
clientBrand#6B4EFF   // the mock client's purple, deliberately NOT MeritByte blue
```

Two colour rules I held to: the client's brand is a different hue from yours, so nobody thinks MeritByte's own site broke; and green appears **once** in the whole video, at the payoff, so it means something when it arrives.

### Type

| Role | Size | Weight |
| --- | --- | --- |
| Hook | 96px | 700 |
| Payoff | 84px | 700 |
| Aside | 62px | 700 |
| Counter chip | 46px | 700, \+2px tracking |
| Lockup | 30px | 700, 62% white |

The hook is 96px because your rule says ≥90pt, and it is two lines of ten characters because seven words at that size will not fit the middle 80%. It is at full opacity from frame 0 — **it never animates in**, because your brief requires it readable by frame 6 and a fade would waste four of those frames.

* * *

## 7\. Step 5 — Animation primitives

I reimplemented Remotion's `spring()` exactly — the analytic damped\-harmonic\-oscillator solution — so my preview renderer and a real Remotion render agree:

```js
export function spring(frame, { stiffness = 100, damping = 10, mass = 1, velocity = 0 }, fps = 30) {
  if (frame <= 0) return 0;
  const t = frame / fps;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {                                   // underdamped → overshoot
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const b = (zeta * w0 - velocity) / wd;
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + b * Math.sin(wd * t));
  }
  const b = -velocity + w0;                          // overdamped → soft settle
  return 1 - Math.exp(-w0 * t) * (1 + b * t);
}
```

**Read `zeta` (the damping ratio), not `damping`.** `zeta < 1` overshoots; `zeta ≥ 1` does not. Your brief's "damping 12 for a hard snap" gives `zeta = 12 / (2√100) = 0.6` — a 6% overshoot that reads as impact. "Damping 200" gives `zeta = 10`, deeply overdamped, no overshoot at all.

That overshoot is not a side effect, it is the comedy. At round 5 the spring overshoots 380px to about 386px and settles back — the logo visibly *lands*.

### Every spring in the video

| Where | stiffness | damping | zeta | Why |
| --- | --- | --- | --- | --- |
| Logo rounds 1–6 | 100 | 12 | 0\.60 | your specified hard snap |
| Snap\-back at 12s | 140 | 14 | 0\.59 | slightly faster; "a single fast motion" |
| Counter chip pop | 220 | 16 | 0\.54 | quick, punchy, out of the way |
| Aside slide\-up | 160 | 18 | 0\.71 | gentler; text should not bounce |
| Payoff scale | 200 | 15 | 0\.53 | confident arrival |
| Chat bubble land | 200 | 20 | 0\.71 | settles fully before the 11s stillness |
| End\-card mark | 400 | 28 | 0\.70 | rises in \~6 frames, per your spec |

### Every non\-spring animation

| Technique | Where | Detail |
| --- | --- | --- |
| `interpolate` \+ `Easing.inOut` | 8–9s camera pan | `scrollY` 0 → 620, cubic in\-out |
| `interpolate` linear on **logoH, not frame** | hero squash, headline shift, logo bleed, content push | see the note below |
| `interpolate` for opacity | hook fade, aside, chip, payoff | 3–4 frame ramps |
| **Character\-count interpolate** | 10–10.4s | `chars = round(interpolate(f, [300,312], [0, 34]))` then `MESSAGE.slice(0, chars)` |
| **`stroke-dashoffset`** | 13–14s tick | circle `dasharray = 2πr`, offset → 0; the check path starts at 35% so the ring draws first |
| Discrete state flips | nav | `flex-wrap` on at 140px, off at 200px so items get pushed off and clipped |
| **`from === to` segments** | 6–7s freeze | returns a constant, so the frame is literally identical 30 times |
| **Frame remapping** | 14–15s loop | see below |

**The trick worth stealing: derive from the driving value, not from time.**

`heroImgH = interpolate(logoH, [200, 280], [360, 30])` — the hero squashes as a function of *how big the logo is*, not what second it is. Retime any round and the squash retimes itself. This is why the video has no "magic frame numbers" scattered through the layout.

### How the seamless loop is guaranteed

Not by careful matching. By construction:

```js
const inLoopCut = rawFrame >= 420 && rawFrame < 450;
const f = inLoopCut ? rawFrame - 420 : rawFrame;   // frames 420-449 ARE frames 0-29
```

The last second of the body *is* the first second, re\-evaluated. `verify.py` then md5\-hashes all thirty pairs of PNGs and asserts they match. It is impossible for this to silently break.

The persistent `MeritByte.com` lockup in the lower left runs from second zero — that is your own note about looping videos, and because it is present in both halves it does not disturb the pixel identity.

* * *

## 8\. Step 6 — Every object in the video

Complete inventory. **All of it is hand\-authored SVG or CSS. Nothing was downloaded, no icon library is installed.**

### Icons and marks (all inline SVG on a 100 × 100 viewBox)

| Object | How it is drawn |
| --- | --- |
| Client "V" mark | `<rect rx=24>` in `#6B4EFF` \+ `<path d="M26 30 L50 72 L74 30">`, white, `stroke-width 13`, round caps |
| MeritByte "M" mark | `<rect rx=26>` in `#3B6DF6` \+ `<path d="M24 72 V32 L50 60 L76 32 V72">`, white, `stroke-width 11` |
| Payoff tick | `<circle r=42>` with animated `stroke-dashoffset` \+ `<path d="M30 51 L44 65 L71 36">` |
| Browser traffic lights | three 14px CSS circles, `#FF5F57` / `#FEBC2E` / `#28C840` |
| Lockup mark | a 24px `border-radius: 7px` div. Not SVG — it is a square. |

No arrows in Day 1 — nothing needed pointing at. When you do need one (SiteRoast annotations on days 3, 9, 15, 22), draw it the same way: a `<path>` with `stroke-dasharray` equal to its own length and `stroke-dashoffset` interpolated to zero, which makes it appear to be drawn by hand — without a hand.

### UI objects, all pure CSS

Browser chrome (64px bar, URL pill) · nav with items and CTA · hero (eyebrow, h1, paragraph, two buttons) · hero image (gradient card with three placeholder blocks) · three feature cards with dot, title and skeleton lines · a three\-cell stat strip · footer links · chat header · **initials chip `VC`** · message bubble · typing dots · text caret · counter chip · brand lockup · end card.

The initials chip deserves a note: it is how you show "a person said this" without a person. `VC` in a rounded square. Never an avatar image, never a photo, never an illustrated character. Reuse this everywhere a human would normally appear.

### Fonts — the honest answer

**Liberation Sans**, which was already installed on the machine. It is metrically identical to Arial. I did not download a font because the network was blocked, and I did not embed a font file because none was needed.

For production you want **Inter**. It is what the mock UI style implies and it has a much better display weight. Swap it in one place:

```bash
npm i @remotion/google-fonts
```

```ts
// src/brand/fonts.ts
import { loadFont } from '@remotion/google-fonts/Inter';
export const { fontFamily } = loadFont();
```

Then in `src/brand/styles.js` change the single `.mb-stage { font-family: ... }` line. Everything inherits; nothing else changes.

Use `@remotion/google-fonts` rather than a `<link>` to Google's CDN. It bundles the font locally, so your GitHub Actions render is not gambling on a network fetch mid\-render — which produces the classic "fonts render as Times New Roman on CI only" bug.

* * *

## 9\. Step 7 — Sound: the part that is doing the most work

With no voice, the audio track is not decoration — it is the performance. It is also the half of this build that most people underestimate.

### The tempo decision (a real deviation from your brief)

Your Day 1 page says 100 BPM. **I used 90.** Here is the arithmetic:

| BPM | Beat | Eighth | Sixteenth |
| --- | --- | --- | --- |
| 100 | 18 frames | 9 frames | **4\.5 frames** |
| **90** | **20 frames** | **10 frames** | **5 frames** |

At 100 BPM a sixteenth note is half a frame, so musical events and video events can never both be frame\-exact. At 90 BPM everything lands on a whole frame. Your own sync rule — "audio three frames late reads as an amateur edit" — is the stricter constraint, and 90 is still inside the 88–108 band your sound\-design page gives DevJoke. One constant in `build_audio.py` if you want it back.

### The bed

A minor. Four\-bar cycle (Am, Am, F, G), one bar \= 80 frames. Eighth\-note plucked arpeggio.

```py
BARS = [
  ('A2', ['A3','E4','C4','A4','G4','E4','C4','E4']),
  ('A2', ['A3','E4','C4','A4','C5','A4','E4','C4']),
  ('F2', ['F3','C4','A3','F4','C4','A3','C4','A3']),
  ('G2', ['G3','D4','B3','G4','D4','B3','D4','B3']),
]
```

Synth recipes, all additive — no samples anywhere:

| Voice | Recipe |
| --- | --- |
| Pluck | 6 harmonics at weights `1.0 / .42 / .24 / .13 / .07 / .04`, each decaying at `0.20 / k^0.55` so highs die first (that is what makes it read as *plucked*), plus a 4ms high\-passed noise click for the pick attack |
| Bass | sine \+ 22% sawtooth, low\-passed at 320 Hz, 340ms decay |
| Kick | pitch sweep `118·e^(−t/0.028) + 46` Hz, 120ms body, 3ms noise tick |
| Shaker | white noise band\-passed 4.8–11 kHz, 20ms decay |
| Hi\-hat | white noise high\-passed 7.2 kHz; 16ms closed, 55ms open on offbeats |
| End\-card pad | Am add9, three detuned voices per note, low\-passed 3.2 kHz |

### The escalation ladder — three simultaneous techniques

1. **A layer per round.** Pluck\+bass at 0s → \+kick at 1s → \+shaker at 2s → \+hi\-hat at 3s. `verify.py` measures each new layer in its own frequency band and asserts it arrives (kick 45–95 Hz, shaker 4.8–6.5 kHz, hat 12–18 kHz).
2. **Pitch escalation on the snap.** The same shutter snap, resampled up: **\+0, \+2, \+4, \+6, \+8, \+10 semitones** across rounds 1–6. Rising pitch reads as rising absurdity without adding a single new sound.
3. **Tonal strip.** At 6–7s every layer except the bass is muted. Measured result: energy above 300 Hz drops **10×**. That is the freeze doing its job through your ears as well as your eyes.

### Every SFX, and how it is made

| Frame | Cue | Synthesis |
| --- | --- | --- |
| 12 | shutter snap | HP noise transient \+ 240 Hz thock \+ 1650 Hz ring \+ band\-passed metal |
| 30 / 60 / 90 | snap \+2 / \+4 / \+6 st | same, resampled |
| 120 | comedic boing | `660·e^(−t/0.11) + 150 + 26·sin(2π·11t)` — the 11 Hz wobble is the "boing" |
| 150 | snap \+8 st \+ record scratch | noise 400–4200 Hz amplitude\-modulated by a 15 Hz sawtooth |
| 210 | biggest snap \+10 st \+ sub thump | 52 → 30 Hz sine sweep |
| 240 | rising whoosh | noise through a band\-pass whose centre sweeps `300 + 4200·pos^1.6`, sine swell |
| 270/280/290 | three typing blips | 1450 \+ 2350 Hz, 12ms decay |
| **312** | **message ping** | E6 \+ B6 \+ E7 bell — **and the bed stops dead on this exact frame** |
| 330–360 | — | **digital silence** |
| 360 | comedic pop | 320 → 900 Hz sweep, 30ms |
| 390 | confirmation chime | A **major** arpeggio (440 / 554 / 659 / 880) staggered 35ms |
| 420 | tape\-rewind zip | exponentially rising sawtooth \+ tape noise \+ 34 Hz flutter |
| 450 | logo sting \+ warm chime | 110 \+ 165 Hz swell under an A major triad, low\-passed |

The confirmation chime being A **major** against an A **minor** bed is a Picardy third — a centuries\-old trick for making a resolution feel like relief. It is why "PERFECT. Ship it." lands as a release rather than just another beat.

### Silence is engineered, not assumed

```py
mix[s0 - 3*SPF : s0] *= np.linspace(1, 0, 3*SPF)   # 3-frame fade
mix[s0 : s1] = 0.0                                  # then literal zeros
```

The ping's tail would otherwise ring into the silence and soften it. `verify.py` asserts `max(abs(sample)) == 0.0` across 11–12s. Not quiet — **zero**.

### The mix chain, in order

```
bed  ──► measure LUFS ──► scale to −16 LUFS
                              │
                              ├──► high-pass 52 Hz  (clear sub the phone can't play)
                              └──► duck −4 dB for 6 frames under each major hit
                                        │
sfx  ──► each peak-normalised to −8..−12 dBFS ──────┤
                                                    ▼
                                                  sum
                                                    ▼
                                    hard-zero 11–12s
                                                    ▼
                            iterate: normalise to −14 LUFS
                                     + look-ahead true-peak limiter
                                                    ▼
                                 −14.25 LUFS, −1.00 dBTP
```

Two details that matter more than they look:

**LUFS is measured properly** — full ITU\-R BS.1770\-4 K\-weighting with the gated integration, implemented in \~15 lines of `scipy.signal`. Peak normalisation would have given a completely different, wrong answer.

**The limiter is a real look\-ahead limiter**, driven by the 4×\-oversampled true\-peak envelope with instant attack and 90ms release. My first attempt used `tanh()` soft clipping and landed at −19 LUFS — 5 dB quiet, which on Instagram means audibly weaker than everything around it. Worth getting right.

**The bass rebalance.** My first mix measured 0.29 RMS below 300 Hz against 0.07 above it. Because LUFS de\-emphasises bass, normalising that mix pushed the sub loud and left everything audible on a phone speaker too quiet. I dropped bass gain `0.9 → 0.5`, lifted the pluck `0.55 → 0.70`, and high\-passed the bed at 52 Hz. **Always check your low/high band balance before trusting a loudness number.**

* * *

## 10\. Step 8 — Where the raw materials came from

The honest and complete answer: **nowhere. Everything was generated.**

| Asset | Source |
| --- | --- |
| Fonts | Liberation Sans, already on the system. No download, no embed. |
| Icons / marks | Hand\-written SVG paths. No icon library. |
| UI (browser, site, chat) | CSS and DOM, written from scratch. |
| Music | numpy oscillators, \~120 lines of Python. |
| SFX | numpy oscillators and filtered noise. |
| Images / video | None exist in this project. |

Total external dependencies for the assets: **zero**.

I want to argue that this is the right default rather than a workaround:

- **No licensing risk.** Nothing to attribute, renew, or get a video muted over.
- **It structurally cannot break your "no voice" rule.** Your own brief warns that instrumental libraries hide vocal pads, breaths and chanting. A sine wave cannot contain a breath. This is the single strongest guarantee in the build.
- **Every parameter is tunable.** "The boing should be lower" is a number, not a re\-licence and re\-download.
- **The repo stays tiny.** \~30 KB of source generates a 2.4 MB video. GitHub Actions checks that out instantly.
- **It is deterministic.** The RNG is seeded (`default_rng(20260729)`), so the same commit produces a byte\-identical WAV forever.

If you do want real music later, buy instrumental beds per template (six tracks, not thirty), keep the synthesised SFX, and **listen to every bed end\-to\-end** before committing — the vocal\-pad trap is real and a classifier will not catch it for you.

* * *

## 11\. Step 9 — Rendering and combining everything

### The frame renderer

`renderer/render.mjs` does exactly what Remotion's renderer does, using only Node built\-ins:

1. Serve the project over `http://127.0.0.1:8731` (module scripts do not load from `file://`).
2. Launch Chromium with `--remote-debugging-port`, `--force-device-scale-factor=1`, `--font-render-hinting=none`, `--force-color-profile=srgb`, `--hide-scrollbars`.
3. Connect to the DevTools Protocol over Node 22's built\-in `WebSocket`.
4. `Emulation.setDeviceMetricsOverride` to exactly 1080 × 1920.
5. Per frame: `Runtime.evaluate("window.setFrame(n)")` then `Page.captureScreenshot` → `frames/fNNNN.png`.

510 frames in **57 seconds**. The determinism flags are not optional — without `--force-device-scale-factor=1` and `--font-render-hinting=none` you get sub\-pixel differences between frames and the loop identity test fails for no visible reason.

### The mux

```bash
ffmpeg -y \
  -framerate 30 -i frames/f%04d.png \
  -i out/day01_audio.wav \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 17 -preset slow -g 60 \
  -movflags +faststart \
  -c:a aac -b:a 256k -ar 48000 \
  -shortest out/Day01_MakeTheLogoBigger.mp4
```

Why each flag:

| Flag | Reason |
| --- | --- |
| `-pix_fmt yuv420p` | Non\-negotiable. Without it Safari and several Android players show a black video. |
| `-crf 17` | Visually lossless. Every platform re\-encodes anyway; give them a clean master. |
| `-preset slow` | Better compression at 17 seconds' runtime. Free quality. |
| `-g 60` | Keyframe every 2s — helps platform scrubbing and seamless\-loop playback. |
| `-movflags +faststart` | Moves the index to the front so the video starts before it finishes downloading. |
| `-shortest` | Guards against a one\-sample audio overrun producing a 17.03s file. |

### Your production command

Once you `npm install` locally, skip my renderer entirely:

```bash
npm run render:day01
# remotion render Day01 out/Day01_MakeTheLogoBigger.mp4 --codec=h264 --crf=17
```

Or on Lambda, for the whole thirty:

```bash
npx remotion lambda render <serve-url> Day01 --codec=h264 --crf=17
```

Same `timeline.js`, same `styles.js`, same output.

* * *

## 12\. Step 10 — Verification (do not skip this)

Three of the hardest requirements in your brief are *invisible in a preview*. You cannot eyeball a seamless loop, and you certainly cannot eyeball digital silence. So I wrote `verify.py`\:

```
[PASS] loop    · frames 420-449 identical to 0-29
[PASS] freeze  · 6-7s is one static frame          1 unique frame(s)
[PASS] still   · 11-12s is one static frame        1 unique frame(s)
[PASS] motion  · something moves from frame 0
[PASS] audio   · 17.000s @ 48kHz stereo
[PASS] silence · 11-12s is digital zero
[PASS] freeze  · 6-7s bed strips to bass only      0.0070 vs 0.0708 rms >300Hz
[PASS] bed     · kick   enters at 1s               0.02475 -> 0.09020
[PASS] bed     · shaker enters at 2s               0.00333 -> 0.01374
[PASS] bed     · hihat  enters at 3s               0.00793 -> 0.02710
[PASS] sync    · all 18 SFX onsets land on their exact cue frame
[PASS] render  · 1080x1920 @ 30fps, 510 frames
```

Two of these caught real bugs, and how they caught them is instructive:

**The layer test.** My first version measured broadband energy per second and failed — because it was reading the *arpeggio's pitch contour*, not the layers. The music was correct; the test was wrong. I rewrote it to measure each layer in the band it actually occupies. **When a test fails, first ask whether it is measuring the right thing.**

**The sync test.** My first version took `argmax` over a window and reported three cues as 2 frames off. They were not — the *bed* had a louder transient nearby. I rewrote it to test the isolated SFX stem and assert `rms[f] > rms[f-1]`, which is what "the onset is on this frame" actually means.

Build these tests as you build each template. On day 19 you will change something in `timeline.js` and the loop test will tell you instantly.

### How I actually reviewed the visuals

I never watched the video during the build. I rendered contact sheets:

```bash
ffmpeg -y -i "review/%02d.png" -vf "scale=270:-1,tile=8x2" review/sheet.png
```

Sixteen key frames tiled into one image. Three review passes found: the chat panel was top\-heavy (fixed by `padding-top: 700px`), the payoff text was unreadable over the light hero (fixed with a radial scrim), the nav clipped one round too early (fixed by tightening item spacing), and **the round 5 → 6 escalation had flattened** — 380px and 520px looked nearly the same because both were clipped. That last one was the important catch, and the fix was one new line:

```js
const contentPush = interpolate(logoH, [440, 520], [0, 330]);
```

Now the logo shoves the whole page down past 440px, which is literally your brief's "page content pushed below the fold" — I had implemented the words but not the effect. **Contact sheets make escalation problems visible in a way that watching the video does not.**

* * *

## 13\. Step 11 — Git

**No git commands were used to produce this video.** I built it in a scratch directory and packaged it as a zip. I would rather tell you that than invent a plausible history.

Here is what to run to fold it into `remotion-factory`\:

```bash
# 1. branch off
cd ~/remotion-factory
git checkout -b day01-make-the-logo-bigger

# 2. drop the project in and check what you're about to stage
unzip ~/Downloads/meritbyte-day01-remotion.zip -d .
git status

# 3. keep generated artefacts out of the repo
cat >> .gitignore <<'EOF'
node_modules/
frames/
out/stems/
out/*.mp4
EOF

# 4. commit source and the small generated JSON/WAV, not the video
git add src renderer audio scripts public build.sh verify.py \
        day01.script.json README.md package.json tsconfig.json remotion.config.ts .gitignore
git status                       # review before committing
git commit -m "Day 1: Make The Logo Bigger (DevJoke template)

- DevJoke template: SiteMock, BrowserFrame, ChatPanel, Overlays, EndCard
- timeline.js: all 16 script rows as pure functions of frame
- build_audio.py: synthesised bed + 18 SFX cues, -14 LUFS / -1 dBTP
- verify.py: asserts seamless loop, freeze, digital silence, cue sync"

git push -u origin day01-make-the-logo-bigger
```

A couple of workflow notes for a thirty\-video repo:

```bash
# tag each published day so you can always rebuild exactly what went out
git tag -a day01 -m "Day 1 published $(date +%F)"
git push --tags

# never commit MP4s — they will bloat the repo permanently.
# render them in CI and push to R2 instead.
```

If you have already committed a large MP4 at some point, `git rm --cached` only stops future commits; the blob stays in history and you need `git filter-repo` to actually remove it. Worth checking now rather than at video 30.

* * *

## 14\. Step 12 — Scaling to thirty

The structure is already right for it. Per day you write **one** `timeline.js` sibling and **one** props file; templates and the end card are shared.

```
src/lib/timeline.day01.js     ← the script, as f(frame)
src/scripts/day01.ts          ← props
audio/day01.cues.py           ← cue table
```

Order of work I would recommend:

1. Build **TechTip** next (day 2). It covers seven days and reuses `BrowserFrame` — the fastest second template you can build.
2. Then **FounderStory** (six days). It has the least UI and the most typography, so it is nearly all `timeline.js`.
3. Then SiteRoast, CaseStudy, Recap.

Two things to factor out as you go: promote `verify.py` to take a day number and read `dayNN.script.json`, and pull the synth voices in `build_audio.py` into `audio/instruments.py` so each day is just a bed pattern plus a cue list.

Your existing pipeline slots in unchanged — GitHub Actions renders, R2 stores, Postiz posts. The only change is that `plan.json` becomes an array of the `day01.script.json` shape.

* * *

## 15\. The files, and what each one is for

| File | Role |
| --- | --- |
| `src/lib/timeline.js` | **The script.** All 16 rows, every animated value as `f(frame)`. Start here. |
| `src/lib/anim.js` | `spring` / `interpolate` / `Easing`, Remotion\-identical |
| `src/brand/colors.js` | Brand tokens and type scale |
| `src/brand/styles.js` | The one stylesheet, shared by both renderers |
| `src/components/*.tsx` | SiteMock, BrowserFrame, ChatPanel, Overlays, EndCard |
| `src/compositions/DevJoke.tsx` | One `<Sequence>` per script row |
| `src/scripts/day01.ts` | The props file — this is all a new day should need |
| `audio/build_audio.py` | The entire soundtrack, synthesised |
| `audio/cues.json` | Generated cue table: frame, second, name, dBFS, ducks\-bed |
| `day01.script.json` | Generated beat sheet — grow this into `plan.json` |
| `scripts/emit-script-json.mjs` | Generates the above from `timeline.js` |
| `renderer/render.mjs` | Chromium/CDP frame renderer |
| `renderer/scene.js` | Vanilla\-DOM mirror of the composition |
| `build.sh` | The whole pipeline, five steps |
| `verify.py` | Spec compliance tests |

* * *

## 16\. The seven things that actually made this work

If you take nothing else into your local Remotion practice:

1. **Everything is a pure function of the frame.** One file. Components draw, they do not animate.
2. **Derive from the driving value, not from time.** The hero squashes because the logo is 280px, not because it is second four.
3. **Freeze by returning a constant.** Never trust a spring to have settled.
4. **Make the loop true by construction** — remap the frame — then assert it with hashes.
5. **Synthesise the audio.** It is the only way to be certain no voice ever gets in, and it makes every cue a tunable number.
6. **Pick a tempo whose subdivisions are whole frames.** 90 BPM, not 100.
7. **Test what you cannot see.** Silence, loop identity and cue sync are invisible in a preview and will ship broken otherwise.

The rest is bookkeeping.
