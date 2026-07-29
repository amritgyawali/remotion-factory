import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

/**
 * Look at the part of the frame the figure is supposed to be in.
 *
 * scripts/inspect-frames.mjs already proves a render is not blank and not
 * frozen, and that is not the same question as this one. A video that is a
 * headline animating over a colour field passes every check in that file
 * comfortably: the type moves, the variance is high, the end card is there. It
 * is a perfectly healthy render of exactly the video this project decided to
 * stop making.
 *
 * So this decodes only the exhibit band — the middle of the frame, where every
 * template places its figure — and gates on three things:
 *
 *   ink        is there anything there at all
 *   motion     does it change, or is it a still picture in a moving video
 *   presence   is it there for most of the body, or does it flash once
 *
 * What this file does NOT do is decide whether what it found is a *figure*
 * rather than a paragraph, and that is worth stating plainly because it was
 * the original intent and it does not work.
 *
 * The idea was that type and charts have different geometry at low resolution:
 * a glyph stroke is thin, a bar or a ring is tens of pixels of continuous ink.
 * Measured against real renders, they are not: at 128px wide, a headline set in
 * 176px display type produces runs just as long as a bar does. The same script
 * rendered before and after the exhibit layer measured 86% and 81% "structure"
 * respectively — the text-only version scored *higher*. Erosion and panel-
 * contrast variants were tried and separated no better: 4.8% against 6.3%, and
 * 39% against 84% with a text-only FounderStory scoring 100%.
 *
 * The figures are still reported below, because they are informative and cheap.
 * They are not limits, because a gate that does not separate the two cases is
 * not protecting anything — it is a number that passes, which is worse than no
 * number at all.
 *
 * The guarantee that a video shows the *right* figure is not a pixel question
 * and is not answered here. It is answered before the render, by a plan the
 * validator will not accept without a named, permitted, fully specified
 * exhibit, and after the render by comparing the props the renderer was handed
 * against the script — see scripts/verify-script.mjs. Renders are deterministic
 * from their props, so that pair is a proof; a classifier would be a guess.
 */

const require = createRequire(import.meta.url);
const registry = require("../src/exhibits/registry.json");

export const BAND = registry.band;

/**
 * Wider than inspect-frames' 64px, and deliberately a separate decode.
 *
 * The run-length measure needs enough columns that a filled mark and a glyph
 * stroke are different numbers rather than both being "1 or 2 pixels". It could
 * have been done by widening the existing pass, but that pass also produces the
 * dHash the duplicate detector compares against every video already in the
 * archive, and changing its input resolution would change every future
 * fingerprint while the stored ones stayed as they were. A second decode costs
 * a few seconds; a silently invalidated fingerprint costs the check.
 */
export const BAND_WIDTH = 128;

/**
 * Ink runs at least this wide are counted separately and reported.
 *
 * Kept as an observation, not a limit — see the note above for the measurements
 * that show it does not separate a figure from a headline.
 */
export const RUN_FLOOR = 6;

/**
 * Band deltas are much smaller than whole-frame deltas — most of the band is
 * panel that does not move, so a figure arriving inside it moves a smaller
 * share of the measured pixels. At the 0.3 floor inspect-frames uses, a
 * perfectly good DevJoke measured 3 moving frames in its band.
 */
export const BAND_MOTION_FLOOR = 0.12;

function decodeBand(file, width, band) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      [
        "remotion", "ffmpeg",
        "-v", "error",
        "-i", file,
        // Crop to the band first, so everything downstream is band pixels only
        // and the scale factor is spent on the part being measured.
        "-vf",
        `crop=iw:ih*${(band.bottom - band.top).toFixed(4)}:0:ih*${band.top.toFixed(4)},scale=${width}:-2`,
        "-f", "image2pipe",
        "-c:v", "rawvideo",
        "-pix_fmt", "rgb24",
        "-",
      ],
      { shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"] },
    );

    const chunks = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new Error(`band decode failed (${code}): ${stderr.slice(0, 300)}`)),
    );
  });
}

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * The band's own background level, as a low percentile of its luma.
 *
 * Not the minimum, which is whatever the darkest pixel of the vignette happens
 * to be, and not the mean, which a large bright figure drags upward until the
 * figure stops counting as ink. The 25th percentile is the level most of a
 * panel sits at whether or not it has a chart on it, which is exactly the
 * reference "ink" should be measured against.
 */
function backgroundLevel(values) {
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.floor(sorted.length * 0.25)];
}

/** Ink is anything this much brighter than the band's own background. */
export const INK_MARGIN = 24;

export function bandFrameStats(pixels, offset, width, height) {
  const count = width * height;
  const values = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    const at = offset + i * 3;
    values[i] = luma(pixels[at], pixels[at + 1], pixels[at + 2]);
  }

  const floor = backgroundLevel(values) + INK_MARGIN;

  let ink = 0;
  let inLongRuns = 0;
  for (let y = 0; y < height; y += 1) {
    let run = 0;
    for (let x = 0; x <= width; x += 1) {
      const lit = x < width && values[y * width + x] > floor;
      if (lit) {
        run += 1;
        ink += 1;
      } else {
        if (run >= RUN_FLOOR) inLongRuns += run;
        run = 0;
      }
    }
  }

  return {
    inkFraction: ink / count,
    // Of the ink that is there, how much is continuous mark rather than
    // letterform. Zero ink means zero structure, not undefined structure.
    structureFraction: ink === 0 ? 0 : inLongRuns / ink,
  };
}

function bandDelta(pixels, offsetA, offsetB, count) {
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const a = offsetA + i * 3;
    const b = offsetB + i * 3;
    total += Math.abs(
      luma(pixels[a], pixels[a + 1], pixels[a + 2]) - luma(pixels[b], pixels[b + 1], pixels[b + 2]),
    );
  }
  return total / count;
}

export async function inspectBand(file, { width = BAND_WIDTH, fps = 30, band = BAND } = {}) {
  const pixels = await decodeBand(file, width, band);
  const height = Math.round((width * (1920 * (band.bottom - band.top))) / 1080 / 2) * 2;
  const count = width * height;
  const frameBytes = count * 3;
  const frames = Math.floor(pixels.length / frameBytes);

  if (frames === 0) throw new Error(`decoded no band frames from ${file}`);

  // The end card covers the band for the last two seconds on every script, so
  // measuring it would count the brand card as the figure.
  const body = Math.max(1, frames - Math.round(fps * 2));

  const ink = new Float64Array(body);
  const structure = new Float64Array(body);
  for (let f = 0; f < body; f += 1) {
    const stats = bandFrameStats(pixels, f * frameBytes, width, height);
    ink[f] = stats.inkFraction;
    structure[f] = stats.structureFraction;
  }

  let motionFrames = 0;
  let peakDelta = 0;
  for (let f = 1; f < body; f += 1) {
    const delta = bandDelta(pixels, (f - 1) * frameBytes, f * frameBytes, count);
    if (delta > BAND_MOTION_FLOOR) motionFrames += 1;
    peakDelta = Math.max(peakDelta, delta);
  }

  // The settled figure, not its arrival. Averaging across the whole body would
  // let the empty opening frames drag a perfectly good figure below the floor,
  // so the measure is the best sustained state: the median of the top half.
  const settled = (values) => {
    const sorted = Array.from(values).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.75)];
  };

  const presentFrames = Array.from(ink).filter((value) => value > 0.02).length;

  return {
    frames,
    bodyFrames: body,
    width,
    height,
    peakInk: Math.max(...ink),
    settledInk: settled(ink),
    settledStructure: settled(structure),
    motionFrames,
    peakDelta,
    presenceFraction: presentFrames / body,
  };
}

/**
 * Calibrated against seven real renders across every template in the series.
 * Measured settled ink ran 7.1%–21.9%, band motion 26–89 frames, presence
 * 74%–100%; the low end of each is a genuine video, not a bad one — 7.1% is a
 * DevJoke whose chat thread is sparse, and 74% is a LogoLadder that clears its
 * own stage during the scripted freeze.
 *
 * Every floor sits well under the worst of those. The asymmetry is deliberate:
 * a false positive blocks a publish and needs a human at 3am, while what these
 * catch — an empty band, a frozen figure, a figure that flashes once — are
 * gross failures that measure near zero, not near the floor.
 */
export const BAND_LIMITS = {
  /** Ink covering the band once the figure has settled. Worst real: 7.1%. */
  minSettledInk: 0.03,
  /** The figure has to arrive, not be there from frame one. Worst real: 26. */
  minMotionFrames: 4,
  /** And it has to hold, not flash. Worst real: 74%. */
  minPresenceFraction: 0.35,
};

export function bandProblems(report, limits = {}) {
  const {
    minSettledInk = BAND_LIMITS.minSettledInk,
    minMotionFrames = BAND_LIMITS.minMotionFrames,
    minPresenceFraction = BAND_LIMITS.minPresenceFraction,
  } = limits;

  const problems = [];

  if (report.settledInk < minSettledInk) {
    problems.push(
      `the exhibit band is ${(report.settledInk * 100).toFixed(1)}% covered, below the ` +
        `${(minSettledInk * 100).toFixed(0)}% floor — the middle of the frame is empty`,
    );
  }

  if (report.motionFrames < minMotionFrames) {
    problems.push(
      `the band changes on ${report.motionFrames} frame(s) — the figure is a still image`,
    );
  }

  if (report.presenceFraction < minPresenceFraction) {
    problems.push(
      `the band carries something on only ${(report.presenceFraction * 100).toFixed(0)}% of body ` +
        `frames (floor ${(minPresenceFraction * 100).toFixed(0)}%) — the figure flashes rather than holds`,
    );
  }

  return problems;
}

async function main() {
  const [file, fps] = process.argv.slice(2);
  if (!file) {
    console.error("usage: node scripts/inspect-band.mjs <file.mp4> [fps]");
    process.exit(1);
  }

  const report = await inspectBand(file, { fps: Number(fps) || 30 });
  const problems = bandProblems(report);

  console.log(file);
  console.log(`  band            ${(BAND.top * 100).toFixed(0)}%..${(BAND.bottom * 100).toFixed(0)}% of height`);
  console.log(`  decoded         ${report.frames} frames at ${report.width}x${report.height}`);
  console.log(`  ink             settled ${(report.settledInk * 100).toFixed(1)}%, peak ${(report.peakInk * 100).toFixed(1)}%`);
  console.log(`  structure       ${(report.settledStructure * 100).toFixed(0)}% of ink in runs >= ${RUN_FLOOR}px  (reported, not gated)`);
  console.log(`  motion          ${report.motionFrames} frames, peak delta ${report.peakDelta.toFixed(2)}`);
  console.log(`  presence        ${(report.presenceFraction * 100).toFixed(0)}% of body frames`);
  console.log(problems.length ? `\n${problems.map((p) => `  problem: ${p}`).join("\n")}` : "\n  ok");
  if (problems.length) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
