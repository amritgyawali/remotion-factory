import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Synthesise one video's soundtrack as a single full-length WAV.
 *
 * Rendered once, at full length, and muxed onto the finished picture at the
 * very end. This is not a style preference — it is what makes fan-out safe.
 * Audio rendered per chunk restarts its bed at every seam, and no amount of
 * care in the concat step can put that back together.
 *
 * Everything here is a pure function of the frame number and a seed. Same seed,
 * same samples, on any machine, forever — so a re-render of chunk 4 next week
 * still lines up with a bed that was made today.
 *
 *   node scripts/render-audio.mjs --spec out/audio-spec.json --out out/audio.wav
 */

export const SAMPLE_RATE = 48_000;
export const CHANNELS = 2;

/**
 * Peak ceiling for the instrumental bed.
 *
 * The brief calls for 0.06-0.12. Low, and deliberately: these reels have no
 * voice-over, and a bed loud enough to notice is a bed that competes with the
 * on-screen text for the viewer's attention instead of underlining it.
 */
export const BED_PEAK_MIN = 0.06;
export const BED_PEAK_MAX = 0.12;

function argValue(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

/**
 * Deterministic noise in [0, 1). Mulberry32 — small, fast, and well-behaved on
 * sequential seeds, which matters because cue seeds here are derived by adding
 * a frame number to a base.
 */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A string seed as a 32-bit integer, so ids can seed the synthesis. */
export function hashSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < String(value).length; index += 1) {
    hash ^= String(value).charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Equal-power fade, so a cue's attack does not click. */
const envelope = (t, attack, release) => {
  if (t < attack) return t / attack;
  if (t > 1 - release) return Math.max(0, (1 - t) / release);
  return 1;
};

/**
 * The bed: a slow drone plus a rhythmic element.
 *
 * Two detuned sines an interval apart, amplitude-modulated at the tempo. Not
 * musically interesting on its own, which is the point — it has to survive
 * being under text for twenty seconds without ever asking to be listened to.
 */
function synthBed({ frames, fps, seed, rootHz = 110, bpm = 84 }) {
  const total = Math.ceil((frames / fps) * SAMPLE_RATE);
  const left = new Float32Array(total);
  const right = new Float32Array(total);

  const random = seededRandom(seed);
  // Fixed choices drawn once, so the whole bed is one deterministic decision.
  const detune = 1 + (random() - 0.5) * 0.01;
  const fifth = rootHz * 1.5 * (1 + (random() - 0.5) * 0.004);
  const beatHz = bpm / 60;

  for (let index = 0; index < total; index += 1) {
    const t = index / SAMPLE_RATE;

    // Drone: root plus a fifth, each slightly detuned between channels so the
    // bed has width without any stereo processing.
    const drone =
      Math.sin(2 * Math.PI * rootHz * t) * 0.55 +
      Math.sin(2 * Math.PI * fifth * t) * 0.3 +
      Math.sin(2 * Math.PI * rootHz * 2 * t) * 0.12;

    // Rhythm: a soft pulse on the beat. Raised to a power so it reads as a
    // pulse rather than a wobble.
    const phase = (t * beatHz) % 1;
    const pulse = Math.pow(1 - phase, 3.2);

    const swell = 0.82 + 0.18 * Math.sin(2 * Math.PI * 0.05 * t);
    const sample = drone * (0.7 + 0.3 * pulse) * swell;

    left[index] = sample;
    right[index] = sample * detune;
  }

  return { left, right };
}

/**
 * Place a cue at an exact frame.
 *
 * Frames, not seconds. The whole reason cues exist is that they land on the
 * same frame as something visible, and a cue specified in seconds drifts
 * against the picture as soon as anyone changes the fps.
 */
function mixCue({ left, right, cue, fps, seed }) {
  const start = Math.floor((cue.frame / fps) * SAMPLE_RATE);
  const length = Math.floor((cue.seconds ?? 0.18) * SAMPLE_RATE);
  if (start >= left.length) return;

  const random = seededRandom(seed + cue.frame);
  const gain = cue.gain ?? 0.5;
  const hz = cue.hz ?? 660;

  for (let index = 0; index < length; index += 1) {
    const at = start + index;
    if (at >= left.length) break;

    const t = index / length;
    const env = envelope(t, 0.02, 0.6);
    const seconds = index / SAMPLE_RATE;

    let sample;
    if (cue.kind === "noise") {
      sample = (random() * 2 - 1) * env * gain;
    } else if (cue.kind === "sweep") {
      const swept = hz * (1 + t * (cue.sweep ?? 1.5));
      sample = Math.sin(2 * Math.PI * swept * seconds) * env * gain;
    } else {
      sample = Math.sin(2 * Math.PI * hz * seconds) * env * gain;
    }

    left[at] += sample;
    right[at] += sample;
  }
}

/** Scale the whole mix so its true peak lands inside the brief's window. */
function normalise(left, right, target) {
  let peak = 0;
  for (let index = 0; index < left.length; index += 1) {
    peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
  }
  if (peak === 0) throw new Error("soundtrack rendered silent");

  const gain = target / peak;
  for (let index = 0; index < left.length; index += 1) {
    left[index] *= gain;
    right[index] *= gain;
  }
  return peak * gain;
}

/** 16-bit PCM stereo, interleaved, with a canonical 44-byte header. */
export function toWav(left, right) {
  const frames = left.length;
  const dataBytes = frames * CHANNELS * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, 28);
  buffer.writeUInt16LE(CHANNELS * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);

  let offset = 44;
  for (let index = 0; index < frames; index += 1) {
    buffer.writeInt16LE(Math.round(clamp(left[index], -1, 1) * 32767), offset);
    buffer.writeInt16LE(Math.round(clamp(right[index], -1, 1) * 32767), offset + 2);
    offset += 4;
  }
  return buffer;
}

export async function renderAudio({ spec, outFile }) {
  const {
    id = "untitled",
    durationInFrames,
    fps = 30,
    rootHz,
    bpm,
    cues = [],
    peak = 0.09,
  } = spec;

  if (!Number.isInteger(durationInFrames) || durationInFrames <= 0) {
    throw new Error(`durationInFrames must be a positive integer — got ${durationInFrames}`);
  }
  if (peak < BED_PEAK_MIN || peak > BED_PEAK_MAX) {
    throw new RangeError(
      `bed peak ${peak} is outside the ${BED_PEAK_MIN}-${BED_PEAK_MAX} the spec allows`,
    );
  }

  const seed = hashSeed(id);
  const { left, right } = synthBed({ frames: durationInFrames, fps, seed, rootHz, bpm });

  for (const cue of cues) {
    if (!Number.isInteger(cue.frame) || cue.frame < 0) {
      throw new Error(`cue frame must be a non-negative integer — got ${cue.frame}`);
    }
    if (cue.frame >= durationInFrames) {
      throw new RangeError(
        `cue at frame ${cue.frame} falls outside the ${durationInFrames}-frame composition`,
      );
    }
    mixCue({ left, right, cue, fps, seed });
  }

  const measured = normalise(left, right, peak);

  await mkdir(path.dirname(path.resolve(outFile)), { recursive: true });
  await writeFile(outFile, toWav(left, right));

  const seconds = durationInFrames / fps;
  console.log(
    `audio ${id} — ${seconds.toFixed(2)}s, ${SAMPLE_RATE} Hz stereo, ` +
      `${cues.length} cue(s), peak ${measured.toFixed(3)} -> ${outFile}`,
  );

  return { outFile, seconds, peak: measured, cues: cues.length };
}

async function main() {
  const specPath = argValue("--spec");
  if (!specPath) throw new Error("--spec <file.json> is required");

  const { readFile } = await import("node:fs/promises");
  const spec = JSON.parse(await readFile(specPath, "utf8"));
  const outFile = argValue("--out", path.join("out", `${spec.id ?? "audio"}.wav`));

  await renderAudio({ spec, outFile });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
