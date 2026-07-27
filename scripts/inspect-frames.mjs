import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * Pixel-level inspection of a finished render.
 *
 * Container metadata proves a file is well-formed, not that anything is in it.
 * A render where the fonts never loaded, the bundle served a blank page, or
 * the composition froze after two seconds still produces a healthy 1080x1920
 * h264 stream at a plausible bitrate. The only way to know what a video
 * actually shows is to look at the frames.
 *
 * Every frame is decoded at thumbnail size in a single ffmpeg pass. Remotion's
 * ffmpeg has no `rawvideo` muxer and no `select`/`fps` filters, but it does
 * have `image2pipe`, which concatenates frames with no container framing — so
 * `image2pipe` carrying a `rawvideo` codec yields exactly width*height*3 bytes
 * per frame and nothing else to parse.
 */

/** 64px wide keeps a full 30s video around 20 MB and is ample for these checks. */
export const THUMB_WIDTH = 64;

function decode(file, width) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      [
        "remotion", "ffmpeg",
        "-v", "error",
        "-i", file,
        "-vf", `scale=${width}:-2`,
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
        : reject(new Error(`frame decode failed (${code}): ${stderr.slice(0, 300)}`)),
    );
  });
}

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Mean brightness and spatial variance of one frame. */
export function frameStats(pixels, offset, pixelCount) {
  let sum = 0;
  let sumSquares = 0;

  for (let i = 0; i < pixelCount; i++) {
    const at = offset + i * 3;
    const value = luma(pixels[at], pixels[at + 1], pixels[at + 2]);
    sum += value;
    sumSquares += value * value;
  }

  const mean = sum / pixelCount;
  return { mean, variance: Math.max(0, sumSquares / pixelCount - mean * mean) };
}

/** Mean absolute luma difference between two frames, 0-255. */
export function frameDelta(pixels, offsetA, offsetB, pixelCount) {
  let total = 0;
  for (let i = 0; i < pixelCount; i++) {
    const a = offsetA + i * 3;
    const b = offsetB + i * 3;
    total += Math.abs(
      luma(pixels[a], pixels[a + 1], pixels[a + 2]) - luma(pixels[b], pixels[b + 1], pixels[b + 2]),
    );
  }
  return total / pixelCount;
}

/**
 * Difference hash. Downsamples to 9x8 grey by box average, then emits one bit
 * per horizontally adjacent pair. Robust to re-encoding, which matters because
 * this is compared against videos encoded on a different machine.
 */
export function dHash(pixels, offset, width, height) {
  const cols = 9;
  const rows = 8;
  const cell = new Float64Array(cols * rows);

  for (let y = 0; y < height; y++) {
    const row = Math.min(rows - 1, Math.floor((y * rows) / height));
    for (let x = 0; x < width; x++) {
      const col = Math.min(cols - 1, Math.floor((x * cols) / width));
      const at = offset + (y * width + x) * 3;
      cell[row * cols + col] += luma(pixels[at], pixels[at + 1], pixels[at + 2]);
    }
  }

  let bits = "";
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols - 1; col++) {
      bits += cell[row * cols + col] < cell[row * cols + col + 1] ? "1" : "0";
    }
  }

  let hex = "";
  for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

/** Bits differing between two equal-length hex hashes. */
export function hammingDistance(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return Infinity;
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    let xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

/** How many evenly spaced frames make up the visual signature. */
const SIGNATURE_FRAMES = 8;

export async function inspectFrames(file, { width = THUMB_WIDTH, fps = 30 } = {}) {
  const pixels = await decode(file, width);
  // scale=W:-2 keeps the source aspect and rounds height to an even number.
  const height = Math.round(width * (1920 / 1080) / 2) * 2;
  const pixelCount = width * height;
  const frameBytes = pixelCount * 3;
  const count = Math.floor(pixels.length / frameBytes);

  if (count === 0) {
    throw new Error(`decoded no frames from ${file}`);
  }

  const means = new Float64Array(count);
  const variances = new Float64Array(count);
  for (let f = 0; f < count; f++) {
    const { mean, variance } = frameStats(pixels, f * frameBytes, pixelCount);
    means[f] = mean;
    variances[f] = variance;
  }

  const deltas = new Float64Array(Math.max(0, count - 1));
  for (let f = 1; f < count; f++) {
    deltas[f - 1] = frameDelta(pixels, (f - 1) * frameBytes, f * frameBytes, pixelCount);
  }

  // The end card is the last two seconds on every one of the thirty scripts.
  const endCardFrames = Math.min(count, Math.round(fps * 2));
  const bodyCount = Math.max(1, count - endCardFrames);
  const endCardMean =
    Array.from({ length: endCardFrames }, (_, i) => means[count - 1 - i]).reduce((a, b) => a + b, 0) /
    Math.max(1, endCardFrames);

  // Longest run of frames the viewer would read as a still image. The scripts
  // use deliberate stillness as a device, so this is reported, not judged here.
  let longestStill = 0;
  let run = 0;
  for (let i = 0; i < bodyCount - 1; i++) {
    if (deltas[i] < 0.35) {
      run += 1;
      longestStill = Math.max(longestStill, run);
    } else {
      run = 0;
    }
  }

  const bodyDeltas = Array.from(deltas.slice(0, Math.max(1, bodyCount - 1)));
  const meanDelta = bodyDeltas.reduce((a, b) => a + b, 0) / bodyDeltas.length;

  /**
   * Frames carrying a visible change. Mean delta is a poor freeze detector on
   * this material because the scripts use stillness deliberately — "All motion
   * freezes ... for a full second" — so a low average is a design choice, while
   * motion that stops and never resumes is a failure.
   */
  const MOTION_FLOOR = 0.3;
  let motionFrames = 0;
  let firstMotion = -1;
  let lastMotion = -1;
  for (let i = 0; i < bodyDeltas.length; i++) {
    if (bodyDeltas[i] > MOTION_FLOOR) {
      motionFrames += 1;
      if (firstMotion === -1) firstMotion = i;
      lastMotion = i;
    }
  }

  const signature = Array.from({ length: SIGNATURE_FRAMES }, (_, i) => {
    const frame = Math.floor((bodyCount * (i + 0.5)) / SIGNATURE_FRAMES);
    return dHash(pixels, frame * frameBytes, width, height);
  }).join("");

  return {
    frames: count,
    width,
    height,
    meanLuma: means.reduce((a, b) => a + b, 0) / count,
    minVariance: Math.min(...variances),
    maxVariance: Math.max(...variances),
    meanDelta,
    maxDelta: Math.max(...bodyDeltas),
    motionFrames,
    motionFraction: motionFrames / Math.max(1, bodyDeltas.length),
    firstMotionFraction: firstMotion === -1 ? null : firstMotion / bodyDeltas.length,
    lastMotionFraction: lastMotion === -1 ? null : lastMotion / bodyDeltas.length,
    longestStillFrames: longestStill,
    endCardMeanLuma: endCardMean,
    bodyFrames: bodyCount,
    signature,
  };
}

/**
 * Calibrated against a real DevJoke render, which measured: peak variance
 * 2301, max delta 1.11, 21 motion frames (4.7% of body), motion spanning
 * 0-73% of the body, end card luma 26.2.
 *
 * Mean frame-to-frame change is deliberately NOT a limit. It measured 0.048 on
 * a perfectly good video, because these scripts hold still on purpose — "All
 * motion freezes ... for a full second". Judging a video on its average would
 * fail the ones that follow the brief most closely. What separates a freeze
 * from a held beat is whether motion ever resumes, which is what
 * lastMotionFraction measures.
 */
export const FRAME_LIMITS = {
  /** Blank render. A frame carrying type and shapes measured 2301 here. */
  minVariance: 12,
  /** Something, somewhere, must move. Measured 1.11. */
  minMaxDelta: 0.3,
  /** A handful of visible changes at minimum. Measured 21. */
  minMotionFrames: 3,
  /** Motion must reach past the opening. Measured 0.73 of the body. */
  minLastMotionFraction: 0.25,
  /** The end card is #191919 on near-black. Measured 26.2. */
  maxEndCardLuma: 90,
};

export function frameProblems(report, limits = {}) {
  const {
    minVariance = FRAME_LIMITS.minVariance,
    minMaxDelta = FRAME_LIMITS.minMaxDelta,
    minMotionFrames = FRAME_LIMITS.minMotionFrames,
    minLastMotionFraction = FRAME_LIMITS.minLastMotionFraction,
    maxEndCardLuma = FRAME_LIMITS.maxEndCardLuma,
    requireEndCard = true,
  } = limits;

  const problems = [];

  if (report.maxVariance < minVariance) {
    problems.push(
      `every frame is flat (peak spatial variance ${report.maxVariance.toFixed(1)}) — ` +
        "the composition rendered blank",
    );
  }

  if (report.maxDelta < minMaxDelta) {
    problems.push(
      `no frame differs from its neighbour by more than ${report.maxDelta.toFixed(3)} — ` +
        "the video is a still image",
    );
  }

  if (report.motionFrames < minMotionFrames) {
    problems.push(
      `only ${report.motionFrames} frame(s) carry a visible change — nothing is animating`,
    );
  }

  if (report.lastMotionFraction !== null && report.lastMotionFraction < minLastMotionFraction) {
    problems.push(
      `motion stops ${Math.round(report.lastMotionFraction * 100)}% into the video and never ` +
        "resumes — the render froze",
    );
  }

  if (requireEndCard && report.endCardMeanLuma > maxEndCardLuma) {
    problems.push(
      `the last two seconds average ${report.endCardMeanLuma.toFixed(0)} luma, too bright for ` +
        "the #191919 brand card — the end card is missing",
    );
  }

  return problems;
}

async function main() {
  const [file, fps] = process.argv.slice(2);
  if (!file) {
    console.error("usage: node scripts/inspect-frames.mjs <file.mp4> [fps]");
    process.exit(1);
  }

  const report = await inspectFrames(file, { fps: Number(fps) || 30 });
  const problems = frameProblems(report);

  console.log(`${file}`);
  console.log(`  ${report.frames} frames at ${report.width}x${report.height}`);
  console.log(`  mean luma        ${report.meanLuma.toFixed(1)}`);
  console.log(`  variance         ${report.minVariance.toFixed(1)} .. ${report.maxVariance.toFixed(1)}`);
  console.log(`  frame delta      mean ${report.meanDelta.toFixed(3)}, max ${report.maxDelta.toFixed(2)}`);
  console.log(`  longest still    ${report.longestStillFrames} frames of ${report.bodyFrames}`);
  console.log(`  motion frames    ${report.motionFrames} (${(report.motionFraction * 100).toFixed(1)}%)`);
  console.log(`  motion spans     ${report.firstMotionFraction === null ? "none" : `${(report.firstMotionFraction * 100).toFixed(0)}%..${(report.lastMotionFraction * 100).toFixed(0)}% of body`}`);
  console.log(`  end card luma    ${report.endCardMeanLuma.toFixed(1)}`);
  console.log(`  signature        ${report.signature.slice(0, 32)}…`);
  console.log(problems.length ? `\n${problems.map((p) => `  problem: ${p}`).join("\n")}` : "\n  ok");
  if (problems.length) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
