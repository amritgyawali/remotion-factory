import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * The three hardest guarantees in this format are invisible in a preview.
 *
 * You cannot eyeball a seamless loop — a one-frame mismatch at the seam reads
 * as "the video ticks" and you will never find it by scrubbing. You cannot
 * eyeball a freeze either: a spring that has *nearly* settled looks stopped and
 * is not, so the beat that the whole joke pauses on is quietly still moving.
 * And nobody watches a fifteen-second video counting whether the escalation
 * flattened at round five.
 *
 * So they are asserted against the timeline function directly, with no renderer
 * involved. That is the payoff of putting every animated value in one pure
 * function of the frame: the properties that matter can be checked in
 * milliseconds instead of by rendering 510 frames and diffing PNGs.
 *
 * The timeline is TypeScript, so it is type-stripped through esbuild (already a
 * Remotion dependency) into a temporary ESM file and imported.
 */

const REPO = process.cwd();
let compiled;

function timeline() {
  if (compiled) return compiled;

  // Inside the repo, not the system temp dir: `react` is left external to keep
  // the bundle small, so the output has to sit somewhere Node's resolver can
  // still walk up to node_modules.
  const dir = path.join(REPO, "node_modules", ".cache", "timeline-test");
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "timeline.mjs");

  execFileSync(
    process.execPath,
    [
      path.join(REPO, "node_modules", "esbuild", "bin", "esbuild"),
      path.join(REPO, "src", "templates", "logoLadder.timeline.ts"),
      "--bundle",
      "--format=esm",
      "--platform=node",
      // Remotion's spring/interpolate are pure maths and safe outside a render.
      "--external:react",
      `--outfile=${out}`,
    ],
    { stdio: "pipe" },
  );

  compiled = { out, dir };
  return compiled;
}

const SCRIPT = {
  hook: "MAKE THE LOGO BIGGER",
  promise: "round 7 of 7",
  message: "perfect, can we see one more option",
  payoff: "PERFECT. Ship it.",
};

async function load() {
  const { out } = timeline();
  return import(`file://${out.replaceAll("\\", "/")}`);
}

test("the loop is identical by construction, not by matching", async () => {
  const { getState, BODY_END, LOOP_CUT_LENGTH } = await load();
  const cutStart = BODY_END - LOOP_CUT_LENGTH;

  for (let i = 0; i < LOOP_CUT_LENGTH; i += 1) {
    const head = getState(i, SCRIPT);
    const tail = getState(cutStart + i, SCRIPT);

    assert.equal(
      tail.frame,
      head.frame,
      `frame ${cutStart + i} must be re-evaluated as frame ${i}`,
    );
    assert.deepEqual(
      tail.site,
      head.site,
      `the page at frame ${cutStart + i} must be identical to frame ${i} — ` +
        "a loop matched by hand is never pixel-exact and the replay visibly ticks",
    );
  }
});

test("the freeze returns a literal constant, not a settling spring", async () => {
  const { getState, S } = await load();

  // 6-7s: the breath before the turn. A spring that has "mostly settled" still
  // moves in the sixth decimal place, which is enough to make the beat read as
  // drifting rather than stopped.
  const heights = new Set();
  for (let f = S(6); f < S(7); f += 1) {
    heights.add(getState(f, SCRIPT).site.logoH);
  }

  assert.equal(
    heights.size,
    1,
    `6-7s must be one static value — got ${heights.size} distinct logo heights`,
  );
  assert.equal([...heights][0], 380, "and it must be exactly the value the ladder specifies");
});

test("the still beat under the silence really is still", async () => {
  const { getState, S } = await load();

  // 11-12s carries the hard silence. If the picture moves under it, the silence
  // reads as an audio dropout rather than as a deliberate beat.
  const frames = new Set();
  for (let f = S(11); f < S(12); f += 1) {
    const s = getState(f, SCRIPT);
    frames.add(JSON.stringify([s.chat?.text, s.chat?.bubbleScale, s.chat?.dotPhase, s.site.scrollY]));
  }

  assert.equal(frames.size, 1, `11-12s must be one static frame — got ${frames.size}`);
});

test("every round is visibly bigger than the last", async () => {
  const { getState, S } = await load();

  // Round 5 -> 6 flattened in the original build: 380 and 520 both looked
  // clipped, so the loudest moment of the escalation read as the quietest.
  // "Bigger" therefore has to mean bigger *on screen*, which past the clip
  // point means the page being shoved down, not the logo growing.
  const rounds = [0, 1, 2, 3, 4, 5, 7].map((sec) => {
    const s = getState(S(sec) + 28, SCRIPT);
    return { sec, logoH: s.site.logoH, push: s.site.contentPush };
  });

  for (let i = 1; i < rounds.length; i += 1) {
    const prev = rounds[i - 1];
    const cur = rounds[i];
    assert.ok(
      cur.logoH > prev.logoH,
      `round at ${cur.sec}s must be larger than ${prev.sec}s (${cur.logoH} vs ${prev.logoH})`,
    );
  }

  const last = rounds[rounds.length - 1];
  assert.ok(
    last.push > 0,
    "the final round must push the page below the fold — without it rounds 5 and 6 " +
      "are both merely clipped and the escalation flattens where it should peak",
  );
});

test("the page is derived from the logo, so retiming a round retimes the page", async () => {
  const { getState, S } = await load();

  // The hero squashes because the logo is 280px, not because it is second four.
  // Two frames with the same logo height must agree about the whole layout.
  const a = getState(S(6) + 5, SCRIPT);
  const b = getState(S(6) + 25, SCRIPT);

  assert.equal(a.site.logoH, b.site.logoH, "precondition: both frames sit inside the freeze");
  assert.deepEqual(
    a.site,
    b.site,
    "same logo height must mean same page — any difference is a value keyed to " +
      "the frame counter rather than to the driving value",
  );
});

test("the hook is readable from the first frame", async () => {
  const { getState } = await load();

  // The brief requires it legible by frame 6; a fade-in would spend four of
  // those frames saying nothing.
  assert.equal(getState(0, SCRIPT).hookOpacity, 1);
  assert.equal(getState(6, SCRIPT).hookOpacity, 1);
});

test("every cue names an SFX that exists in the pack", async () => {
  const { ladderScore } = await load();
  const { readdirSync, existsSync } = await import("node:fs");

  // A cue naming a file that is not there fails a render six minutes in, as a
  // 404 for an asset nobody thought about — which is how `whoosh` and `tapeZip`
  // got written here when the pack only ships `whoosh-down` and
  // `tapeZip-rewind`. Cheaper to catch by listing a directory.
  const dir = path.join(REPO, "public", "audio");
  if (!existsSync(dir)) return; // pack is generated; skip when it has not been built

  const have = new Set(
    readdirSync(dir)
      .filter((f) => f.endsWith(".wav"))
      .map((f) => f.replace(/\.wav$/, "")),
  );

  const missing = ladderScore()
    .cues.map((cue) => cue.sfx)
    .filter((name) => !have.has(name));

  assert.deepEqual(missing, [], `cues name SFX that are not in public/audio: ${missing.join(", ")}`);
});

test("the bed strips at the freeze and stops dead for the silence", async () => {
  const { ladderScore, S } = await load();
  const steps = ladderScore().bed;

  const at = (frame) => {
    let active = steps[0];
    for (const step of steps) if (frame >= step.frame) active = step;
    return active.layers;
  };

  // 6-7s: the tonal strip. Everything but the bass drops out, so the freeze is
  // heard as well as seen.
  assert.deepEqual(at(S(6) + 5), ["bass"], "the freeze must strip to bass alone");
  assert.ok(at(S(5)).length > 1, "and the round before it must be full");

  // 11-12s: not quiet — nothing. A tail ringing into the beat softens it.
  assert.deepEqual(at(S(11) + 10), [], "the still beat must be digital silence");
});

test.after(() => {
  if (compiled) rmSync(compiled.dir, { recursive: true, force: true });
});
