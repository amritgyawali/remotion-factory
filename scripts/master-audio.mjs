import { spawn } from "node:child_process";
import { rename, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The master bus.
 *
 * Every video has to land at the same loudness, and a scored motion-graphics
 * track is extremely peaky — sparse hits over near-silence — so loudness and
 * peak have to be solved together. That is what loudness normalisation does
 * and a gain stage cannot.
 *
 * See TARGET_LUFS for why the target is not the PDF's -14.
 *
 * Run as two passes. A single-pass loudnorm works from a running estimate and
 * audibly pumps on material this dynamic; measuring first and then applying
 * the measured values gives a linear, transparent correction.
 *
 * Video is stream-copied, so this costs no image quality and only seconds.
 */

/**
 * A deliberate departure from the PDF, which specifies -14 LUFS.
 *
 * -14 is the streaming norm, and it is the right number for content where
 * speech carries the loudness and music sits underneath: dialogue peaks pull
 * the integrated measurement up while the bed stays low. These videos have no
 * voice at all. Normalising wall-to-wall instrumental to -14 means every
 * second sits at full loudness with nothing dynamic underneath it, which is
 * exactly as tiring as it sounds — the first published draft was rejected for
 * it.
 *
 * The mix already measured -26 LUFS before mastering, so the old target was
 * applying +12 dB of gain and defeating every level decision made upstream.
 * At -23 the correction is about 3 dB, the mix arrives roughly as it was
 * balanced, and the result is background music rather than a soundtrack.
 *
 * Still normalised rather than left alone: every video must land at the same
 * loudness, and true peak still has to be solved with it.
 */
export const TARGET_LUFS = -23;

/**
 * The PDF asks for -1 dBTP *delivered*, but loudnorm limits the signal it sees
 * and the AAC encoder then overshoots it. Measured on a real render, mastering
 * to -1 produced a file that measured +0.71 dBTP — above full scale.
 *
 * Overshoot here is roughly 1.2 dB and barely moves with bitrate (192k, 256k
 * and 320k all landed within 0.1 dB of each other), so the fix is headroom in
 * the target rather than a fatter audio stream. At -2 the delivered file
 * measures about -0.85 dBTP across repeated runs, which is what the spec is
 * actually asking for.
 *
 * Do not "correct" this to -1 without re-measuring the delivered file; the
 * number that matters is the one in the MP4, not the one in the filter.
 */
export const TARGET_TRUE_PEAK = -2;
export const TARGET_LRA = 11;

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["remotion", "ffmpeg", ...args], {
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`ffmpeg exited ${code}: ${output.slice(-500)}`)),
    );
  });
}

const FILTER = `I=${TARGET_LUFS}:TP=${TARGET_TRUE_PEAK}:LRA=${TARGET_LRA}`;

/** Pass one: measure. loudnorm prints its analysis as JSON on stderr. */
export function parseMeasurement(output) {
  // The JSON block is the last one printed; anything earlier is ffmpeg banner.
  const start = output.lastIndexOf("{");
  const end = output.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;

  try {
    const parsed = JSON.parse(output.slice(start, end + 1));
    const required = [
      "input_i",
      "input_tp",
      "input_lra",
      "input_thresh",
      "target_offset",
    ];
    if (required.some((key) => parsed[key] === undefined)) return null;
    // A silent input measures as -inf and cannot be normalised meaningfully.
    if (required.some((key) => !Number.isFinite(Number(parsed[key])))) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function masterVideoAudio(file) {
  const analysis = await ffmpeg([
    "-v", "info",
    "-i", file,
    // -vn matters: Remotion's ffmpeg is built with --disable-encoders and a
    // short allow-list, so leaving the video stream attached to a null output
    // fails with "Encoder not found" before any analysis happens.
    "-vn",
    "-af", `loudnorm=${FILTER}:print_format=json`,
    "-f", "null",
    "-",
  ]);

  const measured = parseMeasurement(analysis);
  if (!measured) {
    throw new Error(`loudness analysis failed for ${file} — the track may be silent`);
  }

  const applied =
    `loudnorm=${FILTER}` +
    `:measured_I=${measured.input_i}` +
    `:measured_TP=${measured.input_tp}` +
    `:measured_LRA=${measured.input_lra}` +
    `:measured_thresh=${measured.input_thresh}` +
    `:offset=${measured.target_offset}` +
    ":linear=true:print_format=summary";

  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file, path.extname(file))}.mastered.mp4`,
  );

  try {
    await ffmpeg([
      "-v", "error",
      "-y",
      "-i", file,
      "-af", applied,
      // Video is untouched; only the audio is re-encoded.
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "48000",
      "-movflags", "+faststart",
      temporary,
    ]);
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }

  return {
    inputLufs: Number(measured.input_i),
    inputTruePeak: Number(measured.input_tp),
    targetLufs: TARGET_LUFS,
    targetTruePeak: TARGET_TRUE_PEAK,
  };
}

async function main() {
  const [file] = process.argv.slice(2);
  if (!file) {
    console.error("usage: node scripts/master-audio.mjs <file.mp4>");
    process.exit(1);
  }

  const result = await masterVideoAudio(file);
  console.log(
    `mastered ${file} — was ${result.inputLufs} LUFS / ${result.inputTruePeak} dBTP, ` +
      `now ${result.targetLufs} LUFS / ${result.targetTruePeak} dBTP`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
