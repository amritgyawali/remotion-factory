# MeritByte Technologies · Silent Motion System

Day 1 — **Make The Logo Bigger**. COMEDY · DevJoke template · 15s + 2s end card · 1080×1920.

Zero humans. Zero voice. Zero footage. Every pixel is a rendered component, every
second is scored, and the on-screen text is the narrator.

## What's here

```
src/
  brand/colors.js      brand tokens + type scale
  brand/styles.js      the one stylesheet, shared by Remotion and the preview renderer
  lib/anim.js          spring / interpolate / Easing (Remotion-identical math)
  lib/timeline.js      THE SCRIPT. All 16 rows, every animated value as f(frame)
  components/          SiteMock, BrowserFrame, ChatPanel, Overlays, EndCard
  compositions/        DevJoke.tsx — one Sequence per script row
  scripts/day01.ts     the props file for Day 1
audio/build_audio.py   the whole voiceless track, synthesised
renderer/              Chromium/CDP frame renderer (used to produce the shipped MP4)
out/                   Day01_MakeTheLogoBigger.mp4 + day01_audio.wav + stems
verify.py              spec compliance checks
```

## Rendering

```bash
npm install
npm run audio:day01     # rebuild the track (python3 + numpy + scipy)
npm run dev             # Remotion Studio
npm run render:day01    # -> out/Day01_MakeTheLogoBigger.mp4
python3 verify.py       # spec compliance
```

The shipped MP4 in `out/` was produced by `renderer/render.mjs`, which drives the
same headless Chromium screenshot pipeline Remotion uses, against the same
`src/lib/timeline.js` and `src/brand/styles.js`. Frames from either path match.

## The four hard rules, as enforced here

| Rule | How it is enforced |
|---|---|
| No humans | The only "person" on screen is a two-letter initials chip. No faces, hands, bodies, silhouettes, avatars or cursors anywhere in the component tree. |
| No voice | `audio/build_audio.py` synthesises every sample from oscillators and filtered noise. There is no recorded source to hide a vocal pad, breath or chant in. |
| Sound only | 18 cues carry the arc; the 6-7s freeze strips the bed to bass, and 11-12s is digital-zero silence. |
| Remotion only | The client homepage, the browser chrome and the chat panel are all rebuilt as components. Nothing is captured. |

## Day 1 beat sheet

| Time | Motion | On screen | Sound |
|---|---|---|---|
| 0-1s | logo springs 40→64, damping 12 | MAKE THE LOGO BIGGER | music in cold; shutter snap on the spring peak (f12) |
| 1-2s | 64→96, nav pushed right, chip in | ROUND 2 | snap +2st, kick enters |
| 2-3s | →140, nav wraps to a second line | ROUND 3 | snap +4st, shaker enters |
| 3-4s | →200, nav clipped off the right edge | ROUND 4 | snap +6st, hi-hat enters |
| 4-5s | →280, hero squashed to a 30px strip | still not big enough | comedic boing |
| 5-6s | →380, overlaps the headline | ROUND 5 | snap +8st + record scratch |
| 6-7s | **freeze** — one static frame for a full second | — | bed strips to bass only, no SFX |
| 7-8s | →520, bleeds past both edges, content below the fold | ROUND 6 | biggest snap +10st + sub-bass thump |
| 8-9s | camera pans down the dead page | this is the live site now | rising whoosh, music full |
| 9-10s | cut to chat panel, char-count interpolate | client is typing... | three typing blips |
| 10-11s | message lands at 10.4s | can we see one more option | ping — **music stops dead on that frame** |
| 11-12s | **absolute stillness** | — | **total silence** |
| 12-13s | logo springs back to 40, layout correct | ROUND 7 | comedic pop, music re-enters quietly |
| 13-14s | green tick draws on (stroke-dashoffset) | PERFECT. Ship it. | confirmation chime, music full |
| 14-15s | hard cut to the exact frame-1 composition | MAKE THE LOGO BIGGER | tape-rewind zip, music resets to bar 1 |
| +2s | brand card on #191919 | MeritByte Technologies / MeritByte.com | logo sting + warm chime, resolve and fade |

`verify.py` asserts frames 420-449 are byte-identical to frames 0-29, so the loop
is genuinely seamless. The persistent lower-left `MeritByte.com` lockup runs from
second zero, so the brand survives the loop even though the end card interrupts it.

## Mix

Bed −16 LUFS · SFX −8 to −12 dBFS · 4 dB / 6-frame duck under every major hit ·
master −14 LUFS integrated, −1.00 dBTP behind a look-ahead true-peak limiter.

Two deliberate calls worth knowing about:

1. **Tempo is 90 BPM, not 100.** Still inside the 88-108 band the sound-design
   page gives DevJoke. At 90 BPM a beat is exactly 20 frames, an eighth 10 and a
   sixteenth 5, so every cue lands on a whole frame *and* on the musical grid.
   At 100 BPM a sixteenth is 4.5 frames and nothing can be frame-exact.
2. **The round-1 snap sits at frame 12, not frame 0**, because the brief ties it
   to the spring peak — with damping 12 the overshoot peaks at frame 11.8.
   Rounds 2-6 land on the first frame of their motion as the global sync rule says.

Change either in `audio/build_audio.py` (`BPM`, and the first `cue(...)` line).

## Adding days 2-30

Build the remaining five templates once (TechTip, SiteRoast, CaseStudy,
FounderStory, Recap), then each day is a `src/scripts/dayNN.ts` props file plus a
`timeline.js` sibling. `EndCard.tsx` is imported by all thirty — change it once
and all thirty update.
