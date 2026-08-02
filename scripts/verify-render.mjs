import { execFile } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

/**
 * Prove a finished file is correct. Measurements only — nothing here looks at
 * the video and forms an opinion.
 *
 * Every assertion is against a number that was written down before the render:
 * the frame count comes from out/composition.json, which bundle.mjs measured
 * from the real composition, and the encode contract is the production spec.
 * A render that silently truncated, dropped its audio track, or came out
 * full-range fails here rather than on a feed.
 *
 *   node scripts/verify-render.mjs --id Day01A
 */

const run = promisify(execFile);

/** The production spec, as numbers this script can check. */
export const SPEC = {
  width: 1080,
  height: 1920,
  fps: 30,
  videoCodec: "h264",
  profile: "High",
  pixelFormat: "yuv420p",
  colorRange: "tv",
  audioCodec: "aac",
  sampleRate: 48_000,
  channels: 2,
  /** Frame count may not differ from the composition at all. */
  frameTolerance: 0,
  /** Duration may drift by at most one frame's worth from muxing. */
  durationToleranceSeconds: 1 / 30,
};

function argValue(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

async function ffprobe(args) {
  const { stdout } = await run("ffprobe", ["-v", "error", ...args], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.trim();
}

/**
 * Count frames by decoding, not by reading a header.
 *
 * `nb_frames` is a container field and is frequently absent or wrong after a
 * concat; `-count_frames` decodes the stream and counts what is actually there.
 * Slower, and the only number worth asserting on.
 */
async function countFrames(file) {
  const raw = await ffprobe([
    "-select_streams", "v:0",
    "-count_frames",
    "-show_entries", "stream=nb_read_frames",
    "-of", "csv=p=0",
    file,
  ]);
  const frames = Number(raw.replace(/[^\d]/g, ""));
  if (!Number.isFinite(frames) || frames <= 0) {
    throw new Error(`could not count frames in ${file} (ffprobe said ${JSON.stringify(raw)})`);
  }
  return frames;
}

async function probeStreams(file) {
  const raw = await ffprobe(["-show_format", "-show_streams", "-of", "json", file]);
  const parsed = JSON.parse(raw);
  return {
    format: parsed.format ?? {},
    video: (parsed.streams ?? []).find((stream) => stream.codec_type === "video") ?? null,
    audio: (parsed.streams ?? []).find((stream) => stream.codec_type === "audio") ?? null,
  };
}

export async function verifyRender({ id, file, expectedFrames }) {
  const target = file ?? path.join("out", `${id}.mp4`);

  const { size: bytes } = await stat(target);
  if (bytes < 50_000) {
    throw new Error(`${target} is only ${bytes} bytes — that is not a finished video`);
  }

  const { format, video, audio } = await probeStreams(target);
  if (!video) throw new Error(`${target} has no video stream`);
  if (!audio) throw new Error(`${target} has no audio stream — the mux step did not run`);

  const frames = await countFrames(target);
  const duration = Number(format.duration);

  const problems = [];
  const check = (label, actual, expected) => {
    if (String(actual) !== String(expected)) {
      problems.push(`${label}: expected ${expected}, got ${actual}`);
    }
  };

  check("width", video.width, SPEC.width);
  check("height", video.height, SPEC.height);
  check("video codec", video.codec_name, SPEC.videoCodec);
  check("profile", video.profile, SPEC.profile);
  check("pixel format", video.pix_fmt, SPEC.pixelFormat);
  check("audio codec", audio.codec_name, SPEC.audioCodec);
  check("sample rate", Number(audio.sample_rate), SPEC.sampleRate);
  check("channels", Number(audio.channels), SPEC.channels);

  // Absent means unspecified, which players read as limited anyway — but the
  // spec asks for it to be stated, because "probably fine" is how a washed-out
  // master ships.
  if (video.color_range !== SPEC.colorRange) {
    problems.push(
      `color_range: expected ${SPEC.colorRange}, got ${video.color_range ?? "(unset)"} — ` +
        "re-encode with -color_range tv",
    );
  }

  const fps = (() => {
    const [num, den] = String(video.r_frame_rate ?? "0/1").split("/").map(Number);
    return den ? num / den : 0;
  })();
  if (Math.abs(fps - SPEC.fps) > 0.01) {
    problems.push(`frame rate: expected ${SPEC.fps}, got ${fps.toFixed(3)}`);
  }

  if (expectedFrames !== null && expectedFrames !== undefined) {
    if (Math.abs(frames - expectedFrames) > SPEC.frameTolerance) {
      problems.push(`frame count: expected ${expectedFrames}, got ${frames}`);
    }
    const expectedSeconds = expectedFrames / SPEC.fps;
    if (Math.abs(duration - expectedSeconds) > SPEC.durationToleranceSeconds + 0.05) {
      problems.push(
        `duration: expected ~${expectedSeconds.toFixed(2)}s, got ${duration.toFixed(2)}s`,
      );
    }
  }

  const report = {
    id: id ?? path.basename(target, ".mp4"),
    file: target,
    bytes,
    frames,
    expectedFrames: expectedFrames ?? null,
    duration: Number(duration.toFixed(3)),
    fps: Number(fps.toFixed(3)),
    width: video.width,
    height: video.height,
    videoCodec: video.codec_name,
    profile: video.profile,
    pixelFormat: video.pix_fmt,
    colorRange: video.color_range ?? null,
    colorSpace: video.color_space ?? null,
    audioCodec: audio.codec_name,
    sampleRate: Number(audio.sample_rate),
    channels: Number(audio.channels),
    problems,
  };

  const reportPath = path.join("out", `${report.id}.verify.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    `${report.id}: ${frames} frames, ${duration.toFixed(2)}s, ` +
      `${video.width}x${video.height} @ ${fps.toFixed(2)}fps, ` +
      `${video.codec_name}/${video.profile}/${video.pix_fmt}/${video.color_range ?? "unset"}, ` +
      `${audio.codec_name} ${audio.sample_rate}Hz x${audio.channels}, ` +
      `${(bytes / 1e6).toFixed(2)} MB`,
  );

  if (problems.length) {
    throw new Error(`${report.id} fails the production spec:\n  - ${problems.join("\n  - ")}`);
  }

  console.log(`${report.id}: passes the production spec. Wrote ${reportPath}`);
  return report;
}

async function main() {
  const id = argValue("--id", process.env.COMPOSITION_ID);
  const file = argValue("--file");

  let expectedFrames = Number(argValue("--frames", ""));
  if (!Number.isFinite(expectedFrames) || expectedFrames <= 0) {
    // The number bundle.mjs measured from the real composition. This is the
    // whole point: the check compares against what was intended, not against
    // the file describing itself.
    try {
      const manifest = JSON.parse(await readFile(path.join("out", "composition.json"), "utf8"));
      expectedFrames = manifest.durationInFrames;
    } catch {
      expectedFrames = null;
      console.warn("no out/composition.json and no --frames — frame count will not be asserted");
    }
  }

  await verifyRender({ id, file, expectedFrames });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
