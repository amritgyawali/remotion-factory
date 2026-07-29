/**
 * DAY 5 — "It Works On My Machine"
 * COMEDY | DevJoke | 13s body + 2s end card | 1080x1920 | no humans, no voice
 *
 * Transcribed from the PDF's Day 5 script page, row by row. Every row of that
 * table is a beat below, and every animated value in the video is derived here
 * as a pure function of the frame — see src/lib/timeline.ts for why.
 *
 * The comedy structure is the same engine as Day 1, and the brief is explicit
 * about all four parts:
 *
 *   1. Escalation — passing tests, then failures, then six alerts, then an
 *      error graph going vertical. Each beat louder than the last.
 *   2. The freeze (6-7s) — "everything freezes, both panels held, no motion",
 *      music down to a single held note.
 *   3. The hard silence (8-9s) — "absolute silence, one full beat". The brief
 *      calls this out as the retention device: "silence before a joke lands
 *      raises completion".
 *   4. The stamp (9-11s) — punchline arrives on a hard spring with a timpani
 *      hit and the music back at full.
 *
 * Then a perfect loop: 12-13s is "cut to frame 1 composition, identical
 * pixels", which is `loopRemap` rather than a pose matched by hand.
 */

import {
  ARRIVE,
  driven,
  enter,
  fade,
  HARD_SNAP,
  ladder,
  loopRemap,
  POP,
  S,
  SETTLE,
  type Segment,
  within,
} from "../lib/timeline";

export { S } from "../lib/timeline";

export const BODY_END = S(13);
export const LOOP_CUT_LENGTH = S(1);
export const END_CARD = S(13);
export const DURATION = S(15);

/** Left pane: the tests that pass locally. One line every three frames. */
export const PASSING = [
  "PASS  src/auth.test.ts",
  "PASS  src/cart.test.ts",
  "PASS  src/checkout.test.ts",
  "PASS  src/session.test.ts",
  "PASS  src/webhook.test.ts",
  "PASS  src/mailer.test.ts",
  "PASS  src/search.test.ts",
  "PASS  src/upload.test.ts",
];

/** Right pane: what the same commit does in production. */
export const FAILING = [
  "TypeError: Cannot read 'apiKey'",
  "  at Config.load (config.ts:31)",
  "  at Server.boot (server.ts:12)",
  "ECONNREFUSED 127.0.0.1:5432",
  "  at Pool.connect (pg/pool.js:45)",
  "FATAL: env SUPABASE_URL missing",
  "  at validateEnv (env.ts:8)",
  "Process exited with code 1",
];

export const ALERTS = [
  "Error rate 4.2% → 61%",
  "p95 latency 12.4s",
  "Checkout failing",
  "DB pool exhausted",
  "Uptime probe down",
  "PagerDuty escalated",
];

/**
 * The alert stack, as a ladder so the freeze is a literal constant.
 * Six cards pile up between 3s and 4s, then hold.
 */
const ALERT_COUNT: Segment[] = [
  { from: S(0), a: 0, b: 0 },
  // Overdamped on purpose. A count is not a physical object, and an
  // underdamped spring would overshoot six and settle back — six alerts, then
  // seven, then six again.
  { from: S(3), a: 0, b: 6, cfg: { stiffness: 90, damping: 20 } },
  { from: S(4), a: 6, b: 6 },
];

/**
 * Error rate, 0..1 of the pane height. Vertical at 5-6s, then frozen.
 *
 * damping 26 against stiffness 120 is zeta 1.19 — overdamped, no overshoot. At
 * damping 20 it was zeta 0.91 and the graph overshot the top of the frame and
 * settled back down, so the one beat where everything is supposed to be at its
 * worst showed the error rate visibly *falling*. Read zeta, not damping: the
 * overshoot that makes a logo land is the same overshoot that makes a metric
 * lie.
 */
const ERROR_RATE: Segment[] = [
  { from: S(0), a: 0.04, b: 0.04 },
  { from: S(5), a: 0.04, b: 1, cfg: { stiffness: 120, damping: 26 } },
  { from: S(6), a: 1, b: 1 },
];

export type MachineState = {
  rawFrame: number;
  frame: number;
  scene: "split" | "endcard";
  /** Lines visible in each pane. */
  passing: number;
  failing: number;
  alerts: number;
  alertPop: number[];
  errorRate: number;
  /** The right pane scrolls as traces flood in. */
  traceScroll: number;
  hookOpacity: number;
  caption: string | null;
  /** 7-8s: the diff wipes in from the left. 0..1. */
  diffWipe: number;
  diffHighlight: number;
  punchline: { text: string; scale: number; opacity: number } | null;
  ship: { text: string; sub: string; x: number; opacity: number } | null;
  /**
   * A blinking caret in the local pane.
   *
   * The verifier counted 36 moving frames out of 450: the beats step
   * discretely (a line appears, an alert pops) and between them the frame is
   * genuinely static, while the trace scroll moves ~1px per frame and does not
   * survive being thumbnailed. A terminal with a dead prompt reads as a
   * screenshot, so the caret gives the picture a pulse — and it stops during
   * the freeze and the silence, where stillness is the point.
   */
  caret: boolean;
  frozen: boolean;
  silent: boolean;
  endcard: { markScale: number; markOpacity: number; textOpacity: number } | null;
  lockup: boolean;
};

/** The on-screen text column of the brief, beat by beat. */
const CAPTIONS = [
  { from: S(1), to: S(2), text: "local: 47 passing" },
  { from: S(2), to: S(3), text: "production: 47 failing" },
  { from: S(3), to: S(4), text: "6 alerts. 90 seconds." },
  { from: S(4), to: S(5), text: "still passing locally" },
  { from: S(5), to: S(6), text: "error rate" },
  // 6-7s: "no text on screen"
  { from: S(7), to: S(8), text: ".env.local" },
  // 8-9s: "no text on screen" — the silence
];

export function getState(rawFrame: number): MachineState {
  // 12-13s is "cut to frame 1 composition, identical pixels".
  const f = loopRemap(rawFrame, BODY_END, LOOP_CUT_LENGTH);

  const scene: MachineState["scene"] = rawFrame >= END_CARD ? "endcard" : "split";

  // Left pane streams one passing line every three frames from 1s, and the
  // brief has it "keep calmly printing green" through 4-5s while the right
  // side burns — the contrast is the joke, so it must not stop.
  const passing =
    f < S(1) ? 2 : Math.min(PASSING.length, 2 + Math.floor((Math.min(f, S(6)) - S(1)) / 3));

  // Right pane floods fast from 2s: "stack traces, scrolling fast".
  const failing = f < S(2) ? 0 : Math.min(FAILING.length, Math.floor((Math.min(f, S(6)) - S(2)) / 2));
  const traceScroll = driven(Math.min(f, S(6)), [S(2), S(6)], [0, 120]);

  const alerts = Math.round(ladder(f, ALERT_COUNT));
  const alertPop = ALERTS.map((_, i) => {
    const at = S(3) + i * 4;
    return f >= at ? enter(Math.min(f, S(6)), at, { stiffness: 90, damping: 20 }) : 0;
  });

  const errorRate = ladder(f, ERROR_RATE);

  let caption: string | null = null;
  for (const c of CAPTIONS) if (within(f, c)) caption = c.text;

  // 7-8s: "a diff panel wipes in. one line highlighted in amber."
  const diffWipe = f >= S(7) ? driven(f, [S(7), S(7) + 10], [0, 1]) : 0;
  const diffHighlight = f >= S(7) + 6 ? driven(f, [S(7) + 6, S(7) + 14], [0, 1]) : 0;

  // 9-11s: "punchline text stamps over the diff with a hard spring."
  let punchline: MachineState["punchline"] = null;
  if (f >= S(9) && f < S(12)) {
    const local = enter(f, S(9), HARD_SNAP);
    punchline = {
      text: "It works on MY machine.",
      // Stamps: overshoots down onto the frame rather than growing into it.
      scale: 1.5 - 0.5 * local,
      opacity: fade(f, { from: S(9), to: S(12) }, { inFrames: 2 }),
    };
  }

  // 11-12s: "a shipping-label graphic slides in over the machine."
  let ship: MachineState["ship"] = null;
  if (f >= S(11) && f < S(12)) {
    const local = enter(f, S(11), SETTLE);
    ship = {
      text: "So we ship the machine.",
      sub: "(Docker)",
      x: (1 - local) * 720,
      opacity: fade(f, { from: S(11), to: S(12) }, { inFrames: 3 }),
    };
  }

  let endcard: MachineState["endcard"] = null;
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
    passing,
    failing,
    alerts,
    alertPop,
    errorRate,
    traceScroll,
    // The hook is on screen from frame 1 and never animates in: the brief puts
    // it in the first three seconds and a fade would spend frames saying nothing.
    hookOpacity: f < S(1) ? 1 : 0,
    caption,
    diffWipe,
    diffHighlight,
    punchline,
    ship,
    caret: !(f >= S(6) && f < S(9)) && Math.floor(f / 8) % 2 === 0,
    // 6-7s: "everything freezes. both panels held. no motion."
    frozen: f >= S(6) && f < S(7),
    // 8-9s: "absolute silence. one full beat."
    silent: f >= S(8) && f < S(9),
    endcard,
    lockup: rawFrame < END_CARD,
  };
}

/**
 * The sound column of the brief, transcribed.
 *
 * 108 BPM bouncy comedic funk per the bed spec. Two hard stops carry the
 * comedy: a single held note under the freeze at 6-7s, and literal nothing at
 * 8-9s. The brief is explicit that the silence *is* the retention device, so it
 * is a beat with no layers at all rather than a quiet one.
 */
export function machineScore() {
  return {
    bed: [
      { frame: S(0), layers: ["pluck", "bass", "kick"] },
      { frame: S(1), layers: ["pluck", "bass", "kick", "shaker"] },
      { frame: S(2), layers: ["pluck", "bass", "kick", "shaker", "hat"] },
      // 4-5s: "music thins to bass" while the left side keeps passing.
      { frame: S(4), layers: ["bass", "pluck"] },
      { frame: S(5), layers: ["bass", "pluck", "kick"] },
      // 6-7s: "music drops to a single held note".
      { frame: S(6), layers: ["bass"] },
      // 7-8s: "music stops dead" on the thunk, and stays gone for the silence.
      { frame: S(7), layers: [] },
      // 9s: "music restarts, full".
      { frame: S(9), layers: ["pluck", "bass", "kick", "shaker", "hat"] },
    ],
    cues: [
      // 1-2s: "rapid soft test-pass ticks. music adds a horn stab."
      ...[0, 3, 6, 9, 12, 15, 18, 21].map((d) => ({
        frame: S(1) + d,
        sfx: "tick",
        db: -20,
      })),
      { frame: S(1), sfx: "hornStab", db: -11 },
      // 2-3s: "three stacked alert pings, each louder."
      { frame: S(2), sfx: "alarmBlip", db: -14 },
      { frame: S(2) + 9, sfx: "alarmBlip", db: -11 },
      { frame: S(2) + 18, sfx: "alarmBlip-m2", db: -8 },
      // 3-4s: "overlapping alert pings, comically excessive."
      ...[0, 4, 8, 12, 16, 20].map((d, i) => ({
        frame: S(3) + d,
        sfx: i % 2 === 0 ? "ping" : "ping-p4",
        db: -13 + i,
      })),
      // 4-5s: "single relaxed blip."
      { frame: S(4) + 6, sfx: "blip", db: -17 },
      // 5-6s: "rising error whine tracking the path."
      { frame: S(5), sfx: "whine", db: -11 },
      // 7-8s: "deliberate hard thunk on the wipe."
      { frame: S(7), sfx: "thunk", db: -7 },
      // 8-9s: nothing. Deliberately no cue.
      // 9-11s: "comedic timpani hit on the stamp."
      { frame: S(9), sfx: "timpani", db: -6, major: true },
      // 11-12s: "tape rip plus a cardboard thud."
      { frame: S(11), sfx: "rustle", db: -12 },
      { frame: S(11) + 3, sfx: "thud", db: -9 },
      // 12-13s: "short tape-stop zip into the loop."
      { frame: S(12), sfx: "tapeZip-stop", db: -13 },
      { frame: END_CARD, sfx: "logoSting", db: -10 },
      { frame: END_CARD + 6, sfx: "chime", db: -14 },
    ],
  };
}
