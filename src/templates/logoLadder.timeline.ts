/**
 * "Make the logo bigger" — the whole video as one pure function of frame.
 *
 * The structure is a comedy engine, not a single joke told once, and it is the
 * part that transfers to every other escalation script:
 *
 *   1. Escalation ladder — six rounds, each visually and sonically bigger.
 *      Predictable enough to follow, absurd enough to keep watching.
 *   2. The freeze (6-7s) — one full second where nothing moves at all. Comedy
 *      needs a breath before the turn, and escalation alone is boring by round
 *      four.
 *   3. The hard silence (11-12s) — total stillness on the client's message. In
 *      a video with no voice, silence is the closest thing to delivery.
 *   4. The snap-back (12-13s) — the payoff arrives in one fast motion.
 *
 * Retention is built in twice. The counter chip ("ROUND 3") makes the hook's
 * "round 7 of 7" a promise the viewer has to stay for; and the last second is
 * the first second re-evaluated, so a replay is invisible and a fifteen-second
 * video is watched twice.
 */

import {
  driven,
  enter,
  fade,
  HARD_SNAP,
  ladder,
  loopRemap,
  POP,
  S,
  SETTLE,
  SNAP_BACK,
  type Segment,
  within,
} from "../lib/timeline";
import type { SiteState } from "../components/SiteMock";

/** Re-exported so a test can talk in seconds without importing two modules. */
export { S } from "../lib/timeline";

export const BODY_END = S(15);
/** Length of the tail that replays the head, not the frame it starts on. */
export const LOOP_CUT_LENGTH = S(1);
export const END_CARD = S(15);

/**
 * The escalation, as data. `a === b` is a hard freeze and returns the constant,
 * which is what makes 6-7s genuinely thirty identical frames.
 */
const LOGO: Segment[] = [
  { from: S(0), a: 40, b: 64, cfg: HARD_SNAP },
  { from: S(1), a: 64, b: 96, cfg: HARD_SNAP },
  { from: S(2), a: 96, b: 140, cfg: HARD_SNAP },
  { from: S(3), a: 140, b: 200, cfg: HARD_SNAP },
  { from: S(4), a: 200, b: 280, cfg: HARD_SNAP },
  { from: S(5), a: 280, b: 380, cfg: HARD_SNAP },
  { from: S(6), a: 380, b: 380 }, // FREEZE — exactly 380, zero motion
  { from: S(7), a: 380, b: 520, cfg: HARD_SNAP },
  { from: S(8), a: 520, b: 520 },
  { from: S(12), a: 520, b: 40, cfg: SNAP_BACK },
  { from: S(13), a: 40, b: 40 },
];

const CHIPS = [
  { from: S(1), to: S(2), label: "ROUND 2" },
  { from: S(2), to: S(3), label: "ROUND 3" },
  { from: S(3), to: S(4), label: "ROUND 4" },
  { from: S(5), to: S(6), label: "ROUND 5" },
  { from: S(7), to: S(8), label: "ROUND 6" },
  { from: S(12), to: S(13), label: "ROUND 7" },
];

const ASIDES = [
  { from: S(4), to: S(5), text: "still not big enough" },
  { from: S(8), to: S(9), text: "this is the live site now" },
];

export type LadderScript = {
  hook: string;
  promise: string;
  message: string;
  payoff: string;
  asides?: { from: number; to: number; text: string }[];
};

export type LadderState = {
  rawFrame: number;
  frame: number;
  scene: "site" | "chat" | "endcard";
  site: SiteState;
  logoOverlaps: boolean;
  hookOpacity: number;
  chip: { label: string; scale: number; opacity: number } | null;
  aside: { text: string; opacity: number; y: number } | null;
  payoff: { text: string; opacity: number; scale: number; tick: number } | null;
  chat: {
    typing: boolean;
    text: string;
    landed: boolean;
    bubbleScale: number;
    dotPhase: number;
    still: boolean;
  } | null;
  endcard: { markScale: number; markOpacity: number; textOpacity: number } | null;
  lockup: boolean;
};

export function getState(rawFrame: number, script: LadderScript): LadderState {
  // Frames 420-449 ARE frames 0-29, so the loop is identical by construction
  // rather than by matching poses at the seam.
  const f = loopRemap(rawFrame, BODY_END, LOOP_CUT_LENGTH);

  let scene: LadderState["scene"] = "site";
  if (rawFrame >= END_CARD) scene = "endcard";
  else if (f >= S(9) && f < S(12)) scene = "chat";

  const logoH = ladder(f, LOGO);

  /**
   * Everything below is derived from logoH, not from the frame.
   *
   * That is the reusable trick: the hero squashes because the logo is 280px,
   * not because it is second four. Retime any rung of the ladder and the whole
   * page retimes itself, which is why there are no magic frame numbers in the
   * layout.
   */
  const site: SiteState = {
    logoH,
    logoX: driven(logoH, [380, 520], [0, -190]),
    navWrapped: logoH >= 140,
    navClipped: logoH >= 200,
    navShift: Math.min(1400, Math.max(0, (logoH - 40) * 0.92)),
    heroImgH: driven(logoH, [200, 280], [360, 30]),
    headlineShift: driven(logoH, [96, 380], [0, 250]),
    // Past 440 the logo stops merely overlapping and shoves the page below the
    // fold. Without this rung, rounds 5 and 6 look nearly identical because
    // both are simply clipped — the escalation flattens exactly where it should
    // be at its loudest.
    contentPush: driven(logoH, [440, 520], [0, 330]),
    scrollY:
      f >= S(8) && f < S(9)
        ? driven(f, [S(8), S(9)], [0, 620])
        : f >= S(9) && f < S(12)
          ? 620
          : 0,
  };

  let chip: LadderState["chip"] = null;
  for (const c of CHIPS) {
    if (within(f, c)) {
      chip = {
        label: c.label,
        scale: 0.7 + 0.3 * enter(f, c.from, POP),
        opacity: fade(f, c, { inFrames: 3 }),
      };
    }
  }

  let aside: LadderState["aside"] = null;
  for (const a of script.asides ?? ASIDES) {
    if (within(f, a)) {
      aside = {
        text: a.text,
        opacity: fade(f, a),
        y: 26 - 26 * enter(f, a.from, SETTLE),
      };
    }
  }

  let payoff: LadderState["payoff"] = null;
  if (f >= S(13) && f < S(14)) {
    const local = f - S(13);
    payoff = {
      text: script.payoff,
      opacity: fade(f, { from: S(13), to: S(14) }),
      scale: 0.86 + 0.14 * enter(f, S(13), { stiffness: 200, damping: 15 }),
      tick: driven(local, [2, 16], [0, 1]),
    };
  }

  let chat: LadderState["chat"] = null;
  if (scene === "chat") {
    const landFrame = S(10) + 12;
    const typing = f < S(10);
    const chars = Math.round(driven(f, [S(10), landFrame], [0, script.message.length]));
    const landed = f >= landFrame;
    // Settled well before 11s, so 11-12s is absolutely still — the silence
    // needs the picture to stop too, or it reads as a dropout rather than a beat.
    const pop = landed
      ? f >= S(11)
        ? 1
        : enter(f, landFrame, { stiffness: 200, damping: 20 })
      : 0;
    chat = {
      typing,
      text: script.message.slice(0, Math.max(0, Math.min(chars, script.message.length))),
      landed,
      bubbleScale: landed ? 0.94 + 0.06 * pop : 1,
      dotPhase: typing ? Math.floor((f - S(9)) / 5) % 3 : -1,
      still: f >= S(11),
    };
  }

  let endcard: LadderState["endcard"] = null;
  if (scene === "endcard") {
    const local = rawFrame - END_CARD;
    endcard = {
      markScale: 0.72 + 0.28 * enter(rawFrame, END_CARD, { stiffness: 400, damping: 28 }),
      markOpacity: driven(local, [0, 4], [0, 1]),
      textOpacity: driven(local, [6, 20], [0, 1]),
    };
  }

  return {
    rawFrame,
    frame: f,
    scene,
    site,
    logoOverlaps: logoH >= 340,
    // Never animates in: the hook must be readable by frame 6, and a fade would
    // spend four of those frames saying nothing.
    hookOpacity: f < S(1) ? driven(f, [0, 26, 30], [1, 1, 0]) : 0,
    chip,
    aside,
    payoff,
    chat,
    endcard,
    lockup: rawFrame < END_CARD,
  };
}
