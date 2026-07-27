import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BED_BPM, BED_TEMPLATES, buildBed } from "./audio/beds.mjs";
import { CATALOGUE } from "./audio/sfx.mjs";
import { SAMPLE_RATE, peak, rms, toWav } from "./audio/synth.mjs";

/**
 * Renders the whole audio pack into public/audio/ as 16-bit WAV.
 *
 * Remotion serves public/ as static files, so <Audio src={staticFile(...)} />
 * reads these directly. Generation is deterministic, so this is a build step
 * rather than a source of committed binaries: CI runs it before rendering and
 * the WAVs stay out of git.
 *
 *   npm run audio          rebuild the pack
 *   npm run audio -- --list  print what would be written
 */

const OUT_DIR = path.join("public", "audio");

/** Longest script is 25s plus a 2s end card; beds are built once at this length. */
const BED_SECONDS = 30;

/**
 * Pitch variants to pre-render for the escalation technique the PDF describes:
 * "repeat one SFX a semitone higher each beat to imply rising absurdity, as on
 * days 1, 8 and 16". Day 1 alone needs +2, +4 and +6.
 */
const PITCHED = {
  snap: [0, 2, 4, 6, 8],
  pop: [0, 4],
  blip: [0, 2, 4],
  tick: [0, 2, 4],
  ping: [0, 4],
  chime: [0, 5],
  stamp: [0, 2, 4],
  beep: [0, 7],
  keyTap: [0, 1],
  alarmBlip: [0, -2],
  thud: [0],
  thunk: [0],
  boing: [0],
  subThump: [0],
  timpani: [0],
  hornStab: [0],
  scratch: [0],
  logoSting: [0],
  confirm: [0],
  shimmer: [0],
  whine: [0],
  rustle: [0],
  rumble: [0],
  hum: [0],
  counterRun: [0],
  riser: [0],
  whoosh: [0],
  tapeZip: [0],
};

/** Directional and duration variants that the scripts call for by name. */
const VARIANTS = {
  whoosh: [
    { suffix: "up", args: { direction: "up" } },
    { suffix: "down", args: { direction: "down" } },
    { suffix: "zoom", args: { direction: "up", duration: 0.28 } },
    { suffix: "wipe", args: { direction: "down", duration: 0.34 } },
  ],
  riser: [
    { suffix: "up", args: { shape: "up" } },
    { suffix: "down", args: { shape: "down" } },
  ],
  tapeZip: [
    { suffix: "rewind", args: { direction: "up" } },
    { suffix: "stop", args: { direction: "down" } },
  ],
  hum: [{ suffix: "long", args: { duration: 2.2 } }],
  rumble: [{ suffix: "long", args: { duration: 2.2 } }],
};

const nameFor = (base, suffix, st) =>
  [base, suffix, st === 0 ? null : `${st > 0 ? "p" : "m"}${Math.abs(st)}`].filter(Boolean).join("-");

function renderSfx() {
  const files = [];

  for (const [base, generator] of Object.entries(CATALOGUE)) {
    const pitches = PITCHED[base] ?? [0];
    const variants = VARIANTS[base] ?? [{ suffix: null, args: {} }];

    for (const variant of variants) {
      for (const st of pitches) {
        const buffer = generator({ ...variant.args, semitones: st });
        files.push({
          name: `${nameFor(base, variant.suffix, st)}.wav`,
          buffer,
          seconds: buffer.length / SAMPLE_RATE,
        });
      }
    }
  }
  return files;
}

function renderBeds(only = null) {
  const files = [];

  for (const template of BED_TEMPLATES) {
    if (only && template !== only) continue;
    const { layers } = buildBed(template, BED_SECONDS);
    for (const [layer, buffer] of Object.entries(layers)) {
      files.push({
        name: `bed-${template}-${layer}.wav`,
        buffer,
        seconds: buffer.length / SAMPLE_RATE,
      });
    }
  }
  return files;
}

/**
 * Bed layers dominate the pack: six templates of ~4 layers at 30s each is over
 * 70 MB, and Remotion copies the whole public folder into every bundle. A
 * single render only ever plays one template's bed, so `--template` keeps the
 * other five out of the bundle. Measurably faster; nothing is lost, because
 * the pack is regenerated per render anyway.
 */
export function renderPack({ template = null } = {}) {
  return [...renderSfx(), ...renderBeds(template)];
}

function argumentValue(name) {
  const at = process.argv.indexOf(name);
  return at === -1 ? null : process.argv[at + 1] ?? null;
}

async function main() {
  const listOnly = process.argv.includes("--list");
  const template = argumentValue("--template") ?? process.env.AUDIO_TEMPLATE ?? null;
  if (template && !BED_TEMPLATES.includes(template)) {
    throw new Error(`unknown template "${template}" — have ${BED_TEMPLATES.join(", ")}`);
  }

  const started = Date.now();
  const files = renderPack({ template });

  if (listOnly) {
    for (const file of files) {
      console.log(
        `  ${file.name.padEnd(28)} ${file.seconds.toFixed(2)}s  peak ${peak(file.buffer).toFixed(3)}`,
      );
    }
    console.log(`\n${files.length} file(s) would be written to ${OUT_DIR}`);
    return;
  }

  // Rebuild from empty so a renamed cue cannot leave an orphan behind.
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  let bytes = 0;
  const silent = [];
  for (const file of files) {
    if (peak(file.buffer) < 1e-4) silent.push(file.name);
    const wav = toWav(file.buffer);
    bytes += wav.length;
    await writeFile(path.join(OUT_DIR, file.name), wav);
  }

  const manifest = files.map((file) => ({
    name: file.name,
    seconds: Number(file.seconds.toFixed(3)),
    peak: Number(peak(file.buffer).toFixed(4)),
    rms: Number(rms(file.buffer).toFixed(5)),
  }));
  await writeFile(path.join(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  // A silent cue is the one failure that is invisible in a render log and
  // inaudible in a video nobody watches before it posts.
  if (silent.length) {
    throw new Error(`these cues rendered silent: ${silent.join(", ")}`);
  }

  const sfxCount = files.filter((f) => !f.name.startsWith("bed-")).length;
  console.log(
    `${files.length} file(s) — ${sfxCount} SFX, ${files.length - sfxCount} bed layers — ` +
      `${(bytes / 1e6).toFixed(1)} MB in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  console.log(`beds at ${Object.entries(BED_BPM).map(([t, b]) => `${t} ${b}bpm`).join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

export { OUT_DIR };
