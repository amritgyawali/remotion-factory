// DAY 1 — "Make The Logo Bigger"
// COMEDY | DevJoke template | 15s + 2s end card | 1080x1920 | no humans, no voice
//
// Every script row from the brief is one entry in ROWS below, and every animated
// value in the video is derived here as a pure function of `frame`. The Remotion
// composition and the preview renderer both read this file, so the two can never
// drift apart.

import { spring, interpolate, Easing, clamp, S } from './anim.js';

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const BODY_END = S(15);      // 450 — end of the 15s body
export const LOOP_CUT = S(14);      // 420 — hard cut back to the frame-1 composition
export const END_CARD = S(15);      // 450 — brand card starts
export const DURATION = S(17);      // 510 — 15s body + 2s end card

export const MESSAGE = 'perfect, can we see one more option';

// ---------------------------------------------------------------------------
// Script rows — the brief, transcribed. `from` is the row start in frames.
// ---------------------------------------------------------------------------
export const ROWS = [
  { from: S(0),  to: S(1),  text: 'MAKE THE LOGO BIGGER',        note: 'logo 40->64, damping 12' },
  { from: S(1),  to: S(2),  text: 'ROUND 2',                     note: 'logo 64->96, nav pushes right, counter chip in' },
  { from: S(2),  to: S(3),  text: 'ROUND 3',                     note: 'logo ->140, nav wraps to 2nd line' },
  { from: S(3),  to: S(4),  text: 'ROUND 4',                     note: 'logo ->200, nav clipped off right edge' },
  { from: S(4),  to: S(5),  text: 'still not big enough',        note: 'logo ->280, hero squashed to 30px strip' },
  { from: S(5),  to: S(6),  text: 'ROUND 5',                     note: 'logo ->380, overlaps headline, z-index fight' },
  { from: S(6),  to: S(7),  text: null,                          note: 'FREEZE — nothing animates for a full second' },
  { from: S(7),  to: S(8),  text: 'ROUND 6',                     note: 'logo ->520, bleeds past both edges' },
  { from: S(8),  to: S(9),  text: 'this is the live site now',   note: 'camera pans down the dead page' },
  { from: S(9),  to: S(10), text: 'client is typing...',         note: 'cut to chat panel, char-count interpolate' },
  { from: S(10), to: S(11), text: 'can we see one more option',  note: 'message lands, music stops dead on the ping' },
  { from: S(11), to: S(12), text: null,                          note: 'absolute stillness, total silence' },
  { from: S(12), to: S(13), text: 'ROUND 7',                     note: 'logo springs back to 40, layout correct' },
  { from: S(13), to: S(14), text: 'PERFECT. Ship it.',           note: 'green tick draws on (stroke-dashoffset)' },
  { from: S(14), to: S(15), text: 'MAKE THE LOGO BIGGER',        note: 'hard cut to the exact frame-1 composition' },
  { from: S(15), to: S(17), text: 'MeritByte Technologies / MeritByte.com', note: 'brand card on #191919' },
];

// ---------------------------------------------------------------------------
// Logo escalation. One segment per row; `from === to` means a hard freeze.
// ---------------------------------------------------------------------------
const HARD_SNAP = { stiffness: 100, damping: 12 };   // brief: damping 12 for a hard snap
const SNAP_BACK = { stiffness: 140, damping: 14 };   // 12-13s "single fast motion"

const LOGO_SEGMENTS = [
  { from: S(0),  a: 40,  b: 64,  cfg: HARD_SNAP },
  { from: S(1),  a: 64,  b: 96,  cfg: HARD_SNAP },
  { from: S(2),  a: 96,  b: 140, cfg: HARD_SNAP },
  { from: S(3),  a: 140, b: 200, cfg: HARD_SNAP },
  { from: S(4),  a: 200, b: 280, cfg: HARD_SNAP },
  { from: S(5),  a: 280, b: 380, cfg: HARD_SNAP },
  { from: S(6),  a: 380, b: 380, cfg: HARD_SNAP },  // freeze — exactly 380, zero motion
  { from: S(7),  a: 380, b: 520, cfg: HARD_SNAP },
  { from: S(8),  a: 520, b: 520, cfg: HARD_SNAP },
  { from: S(9),  a: 520, b: 520, cfg: HARD_SNAP },
  { from: S(12), a: 520, b: 40,  cfg: SNAP_BACK },
  { from: S(13), a: 40,  b: 40,  cfg: HARD_SNAP },
];

function logoHeight(f) {
  let seg = LOGO_SEGMENTS[0];
  for (const s of LOGO_SEGMENTS) if (f >= s.from) seg = s;
  if (seg.a === seg.b) return seg.a;
  return seg.a + (seg.b - seg.a) * spring(f - seg.from, seg.cfg, FPS);
}

// ---------------------------------------------------------------------------
// Counter chip — visible only on rows whose on-screen text is literally "ROUND n".
// ---------------------------------------------------------------------------
const CHIP_ROWS = [
  { from: S(1),  to: S(2),  label: 'ROUND 2' },
  { from: S(2),  to: S(3),  label: 'ROUND 3' },
  { from: S(3),  to: S(4),  label: 'ROUND 4' },
  { from: S(5),  to: S(6),  label: 'ROUND 5' },
  { from: S(7),  to: S(8),  label: 'ROUND 6' },
  { from: S(12), to: S(13), label: 'ROUND 7' },
];

const ASIDES = [
  { from: S(4), to: S(5), text: 'still not big enough' },
  { from: S(8), to: S(9), text: 'this is the live site now' },
];

/**
 * The whole video, as one pure function of frame.
 * Frames 420..449 are remapped to 0..29 so the 14-15s "hard cut to the exact
 * frame 1 composition" is pixel-identical by construction — a true seamless loop.
 */
export function getState(rawFrame) {
  const inLoopCut = rawFrame >= LOOP_CUT && rawFrame < BODY_END;
  const f = inLoopCut ? rawFrame - LOOP_CUT : rawFrame;

  // ---- scene selection -----------------------------------------------------
  let scene = 'site';
  if (rawFrame >= END_CARD) scene = 'endcard';
  else if (f >= S(9) && f < S(12)) scene = 'chat';

  // ---- site layout ---------------------------------------------------------
  const logoH = logoHeight(f);
  const navShift = clamp((logoH - 40) * 0.92, 0, 1400);
  const navWrapped = logoH >= 140;
  const navClipped = logoH >= 200;
  const heroImgH = interpolate(logoH, [200, 280], [360, 30], { easing: Easing.linear });
  const headlineShift = interpolate(logoH, [96, 380], [0, 250], { easing: Easing.linear });
  // past 380 the logo also bleeds off the LEFT edge, not just the right
  const logoX = interpolate(logoH, [380, 520], [44, -190], { easing: Easing.linear });
  const logoOverlaps = logoH >= 340;
  // 7-8s: once the logo passes 440 it stops merely overlapping and starts
  // shoving the whole page down — "page content pushed below the fold"
  const contentPush = interpolate(logoH, [440, 520], [0, 330], { easing: Easing.linear });

  // 8-9s camera pan down the dead page
  let scrollY = 0;
  if (f >= S(8) && f < S(9)) scrollY = interpolate(f, [S(8), S(9)], [0, 620], { easing: Easing.inOut });
  else if (f >= S(9) && f < S(12)) scrollY = 620;

  // ---- text layers ---------------------------------------------------------
  const hookOpacity = f < S(1) ? interpolate(f, [0, 2, 26, 30], [1, 1, 1, 0]) : 0;

  let chip = null;
  for (const c of CHIP_ROWS) {
    if (f >= c.from && f < c.to) {
      chip = {
        label: c.label,
        // chip pops in on the first frame of its row
        scale: 0.7 + 0.3 * spring(f - c.from, { stiffness: 220, damping: 16 }, FPS),
        opacity: interpolate(f - c.from, [0, 3], [0, 1]),
      };
    }
  }

  let aside = null;
  for (const a of ASIDES) {
    if (f >= a.from && f < a.to) {
      aside = {
        text: a.text,
        opacity: interpolate(f - a.from, [0, 4, 26, 30], [0, 1, 1, 1]),
        y: interpolate(spring(f - a.from, { stiffness: 160, damping: 18 }, FPS), [0, 1], [26, 0]),
      };
    }
  }

  // 13-14s payoff card + green tick drawn with stroke-dashoffset
  let payoff = null;
  if (f >= S(13) && f < S(14)) {
    const local = f - S(13);
    payoff = {
      text: 'PERFECT. Ship it.',
      opacity: interpolate(local, [0, 4], [0, 1]),
      scale: 0.86 + 0.14 * spring(local, { stiffness: 200, damping: 15 }, FPS),
      tickProgress: interpolate(local, [2, 16], [0, 1], { easing: Easing.out }),
    };
  }

  // ---- 9-12s chat panel ----------------------------------------------------
  let chat = null;
  if (scene === 'chat') {
    const landFrame = S(10) + 12;                  // 10.4s — the message lands
    const typing = f < S(10);
    const ghost = interpolate(f, [S(9) + 2, S(10)], [0, 1], { easing: Easing.quadInOut });
    const chars = Math.round(interpolate(f, [S(10), landFrame], [0, MESSAGE.length]));
    const landed = f >= landFrame;
    // spring is fully settled well before 11s, so 11-12s is absolutely still
    const pop = landed ? (f >= S(11) ? 1 : spring(f - landFrame, { stiffness: 200, damping: 20 }, FPS)) : 0;
    chat = {
      typing,
      status: typing ? 'client is typing...' : null,
      ghostWidth: ghost,
      text: MESSAGE.slice(0, clamp(chars, 0, MESSAGE.length)),
      landed,
      bubbleScale: landed ? 0.94 + 0.06 * pop : 1,
      // typing dots freeze the moment the message lands; nothing moves after 11s
      dotPhase: typing ? Math.floor((f - S(9)) / 5) % 3 : -1,
      still: f >= S(11),
    };
  }

  // ---- end card ------------------------------------------------------------
  let endcard = null;
  if (scene === 'endcard') {
    const local = rawFrame - END_CARD;
    endcard = {
      // logo mark springs in over 6 frames, then completely still
      markScale: 0.72 + 0.28 * spring(local, { stiffness: 400, damping: 28 }, FPS),
      markOpacity: interpolate(local, [0, 4], [0, 1]),
      textOpacity: interpolate(local, [6, 20], [0, 1], { easing: Easing.out }),
    };
  }

  return {
    rawFrame,
    frame: f,
    scene,
    logoH,
    navShift,
    navWrapped,
    navClipped,
    heroImgH,
    headlineShift,
    logoX,
    logoOverlaps,
    contentPush,
    scrollY,
    hook: { text: 'MAKE THE LOGO BIGGER', sub: 'round 7 of 7', opacity: hookOpacity },
    chip,
    aside,
    payoff,
    chat,
    endcard,
    // persistent lower-left lockup on every frame of the body, so the loop keeps
    // the brand present even though the end card interrupts it
    lockup: rawFrame < END_CARD,
  };
}
