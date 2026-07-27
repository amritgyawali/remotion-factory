import { spawn } from "node:child_process";
import { readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Nothing reads these videos before they reach a real audience. A render that
 * fails halfway — a font that never loaded, a blank page, a truncated encode —
 * still produces a playable MP4, and unattended that mistake repeats four
 * times a day for a week.
 *
 * These checks are the reason a bad render fails the run instead of posting.
 */

export const EXPECTED_WIDTH = 1080;
export const EXPECTED_HEIGHT = 1920;

/** Well under any real render; only a truncated or empty file lands here. */
export const MIN_BYTES = 100_000;

/**
 * The load-bearing check. A blank or frozen frame is nearly free to compress,
 * so a broken render collapses to a tiny bitrate while staying a valid MP4.
 * Real footage of this kind sits far above the floor — the shipped templates
 * measure in the millions of bits per second.
 */
export const MIN_BITRATE = 250_000;

/** Encoders round durations; anything past this is a genuinely wrong length. */
export const DURATION_TOLERANCE_SECONDS = 0.5;

/**
 * Every video must carry sound. The source PDF is unambiguous that with no
 * voiceover the audio track "is not decoration, it is the performance", so a
 * silent render is a failed render, not a quiet one.
 *
 * A muted track still encodes as a valid AAC stream, so the stream existing
 * proves nothing — mean programme loudness is what separates real audio from
 * digital black. Anything below this is silence with a codec wrapped round it.
 */
export const MIN_MEAN_VOLUME_DB = -60;

function runProbe(args, tool = "ffprobe") {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["remotion", tool, ...args], {
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(`${stdout}${stderr}`)
        : reject(new Error(`${tool} exited with code ${code}: ${stderr.slice(0, 400)}`)),
    );
  });
}

/**
 * Mean and peak programme volume. ffprobe reports that an audio stream exists
 * but never whether anything is in it, and a muted track encodes as perfectly
 * valid AAC.
 *
 * Measured by decoding the audio to PCM and doing the arithmetic here, rather
 * than by parsing ffmpeg's `volumedetect` output: Remotion ships an ffmpeg
 * built with `--disable-filters` and volumedetect is not among the handful
 * re-enabled, so that route fails on exactly the machines that matter.
 * Decoding to wav uses only the pcm_s16le encoder and wav muxer, both of which
 * that build does include.
 */
export async function probeLoudness(file) {
  const scratch = path.join(
    tmpdir(),
    `verify-${process.pid}-${Math.random().toString(36).slice(2)}.wav`,
  );

  try {
    // Mono at 16 kHz is ample for a loudness gate and keeps the temp small.
    await runProbe(
      ["-v", "error", "-y", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", scratch],
      "ffmpeg",
    );

    const wav = await readFile(scratch);
    const samples = Math.floor((wav.length - 44) / 2);
    if (samples <= 0) return { meanDb: -Infinity, maxDb: -Infinity, samples: 0 };

    let sumSquares = 0;
    let peak = 0;
    for (let i = 0; i < samples; i++) {
      const sample = wav.readInt16LE(44 + i * 2) / 32768;
      sumSquares += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }

    const toDb = (value) => (value <= 0 ? -Infinity : 20 * Math.log10(value));
    return {
      meanDb: Number(toDb(Math.sqrt(sumSquares / samples)).toFixed(1)),
      maxDb: Number(toDb(peak).toFixed(1)),
      samples,
    };
  } finally {
    await rm(scratch, { force: true });
  }
}

export async function probeVideo(file) {
  const raw = await runProbe([
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    file,
  ]);

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`ffprobe did not return JSON for ${file}: ${error.message}`);
  }
}

/**
 * Pure so the thresholds can be exercised without rendering anything.
 * Returns a list of human-readable problems; empty means the file is sound.
 */
function videoStream(probe) {
  return (probe?.streams ?? []).find((stream) => stream.codec_type === "video") ?? {};
}

function resolveDuration(probe) {
  const duration = Number(probe?.format?.duration ?? videoStream(probe).duration);
  return Number.isFinite(duration) ? duration : null;
}

/**
 * Prefer the container's own figure, but fall back to deriving it from size
 * and duration so a missing tag never silently skips the blank-render check.
 */
function resolveBitrate(probe, bytes, duration) {
  const tagged = Number(probe?.format?.bit_rate ?? videoStream(probe).bit_rate);
  if (Number.isFinite(tagged)) return tagged;
  if (Number.isFinite(duration) && duration > 0) return (bytes * 8) / duration;
  return null;
}

export function videoProblems(probe, bytes, expected = {}, loudness = null) {
  const {
    expectedSeconds,
    width = EXPECTED_WIDTH,
    height = EXPECTED_HEIGHT,
    minBytes = MIN_BYTES,
    minBitrate = MIN_BITRATE,
    tolerance = DURATION_TOLERANCE_SECONDS,
    minMeanVolumeDb = MIN_MEAN_VOLUME_DB,
    requireAudio = true,
  } = expected;

  const problems = [];
  const streams = probe?.streams ?? [];
  const videoStreams = streams.filter((stream) => stream.codec_type === "video");
  const audioStreams = streams.filter((stream) => stream.codec_type === "audio");

  if (requireAudio) {
    if (audioStreams.length !== 1) {
      problems.push(`expected exactly 1 audio stream, found ${audioStreams.length} — the video is silent`);
    } else if (loudness) {
      // A measurement that failed must fail the run. Treating it as "unknown
      // and therefore fine" is how a check silently stops protecting anything.
      if (typeof loudness.meanDb !== "number") {
        problems.push(
          `audio loudness could not be measured${loudness.error ? `: ${loudness.error}` : ""}`,
        );
      } else if (loudness.meanDb < minMeanVolumeDb) {
        const shown = loudness.meanDb === -Infinity ? "-inf" : loudness.meanDb.toFixed(1);
        problems.push(
          `mean audio volume is ${shown} dB, below the ${minMeanVolumeDb} dB floor — ` +
            "the track is silent even though a stream is present",
        );
      }
    }
  }

  if (bytes < minBytes) {
    problems.push(`file is ${bytes} bytes, below the ${minBytes}-byte floor — render was truncated`);
  }

  if (videoStreams.length !== 1) {
    problems.push(`expected exactly 1 video stream, found ${videoStreams.length}`);
    return problems;
  }

  const [video] = videoStreams;

  if (video.width !== width || video.height !== height) {
    problems.push(`frame is ${video.width}x${video.height}, expected ${width}x${height}`);
  }

  if (video.codec_name !== "h264") {
    problems.push(`codec is "${video.codec_name}", expected h264`);
  }

  const duration = resolveDuration(probe);
  if (!Number.isFinite(duration) || duration <= 0) {
    problems.push("duration is missing or zero — the file has no playable video");
  } else if (Number.isFinite(expectedSeconds) && Math.abs(duration - expectedSeconds) > tolerance) {
    problems.push(
      `duration is ${duration.toFixed(2)}s, expected ${expectedSeconds}s (±${tolerance}s)`,
    );
  }

  const bitrate = resolveBitrate(probe, bytes, duration);
  if (!Number.isFinite(bitrate)) {
    problems.push("bitrate could not be determined");
  } else if (bitrate < minBitrate) {
    problems.push(
      `bitrate is ${Math.round(bitrate / 1000)} kbps, below the ${Math.round(
        minBitrate / 1000,
      )} kbps floor — the frames are probably blank or frozen`,
    );
  }

  return problems;
}

export async function verifyVideo(file, expected = {}) {
  const [{ size }, probe, loudness] = await Promise.all([
    stat(file),
    probeVideo(file),
    probeLoudness(file).catch((error) => ({ error: error.message })),
  ]);
  const problems = videoProblems(probe, size, expected, loudness);
  const video = videoStream(probe);
  const duration = resolveDuration(probe);

  return {
    problems,
    bytes: size,
    duration,
    meanVolumeDb: loudness?.meanDb ?? null,
    // Same derivation the check used, so the logged figure is the one that
    // was actually measured against the floor.
    bitrate: resolveBitrate(probe, size, duration),
    width: video.width ?? null,
    height: video.height ?? null,
  };
}

/** Throws on the first sound reason not to publish this file. */
export async function assertPlayableVideo(file, expected = {}) {
  const result = await verifyVideo(file, expected);
  if (result.problems.length) {
    throw new Error(
      `${file} failed verification:\n  - ${result.problems.join("\n  - ")}`,
    );
  }
  return result;
}

async function main() {
  const [file, seconds] = process.argv.slice(2);
  if (!file) {
    console.error("usage: node scripts/verify-video.mjs <file.mp4> [expectedSeconds]");
    process.exit(1);
  }

  const result = await assertPlayableVideo(file, {
    expectedSeconds: seconds === undefined ? undefined : Number(seconds),
  });
  console.log(
    `ok  ${file} — ${result.width}x${result.height}, ${result.duration?.toFixed(2)}s, ` +
      `${(result.bytes / 1e6).toFixed(1)} MB, ${Math.round((result.bitrate ?? 0) / 1000)} kbps, ` +
      `audio ${result.meanVolumeDb === null ? "not measured" : `${result.meanVolumeDb} dB mean`}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
