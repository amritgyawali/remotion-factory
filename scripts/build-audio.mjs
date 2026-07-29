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
 * Slack on the end of a bed sized to its video.
 *
 * A bed shorter than its composition is the one audio bug nothing downstream
 * catches: `<Audio>` simply ends, `verify-video.mjs` checks duration and
 * bitrate rather than sound, and the loudness pass reports on what it is given.
 * The result is a video whose last moments are silent, which is only noticed by
 * watching it. Two seconds costs a couple of hundred kilobytes and makes the
 * failure impossible rather than unlikely.
 */
const BED_TAIL_SECONDS = 2;

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

/**
 * One video's bed, filed under its own id.
 *
 * The path is `beds/<key>/<layer>.wav`, where the key is the video id when
 * there is one and the template name otherwise. Namespacing by id is what lets
 * a shard of renders share a single webpack bundle: every video's bed is a
 * different piece of music, so under the old flat `bed-<template>-<layer>.wav`
 * name the public folder had to be rewritten and the project re-bundled
 * between every render. See the note by `bedSrc` in src/audio/Score.tsx.
 */
function renderBed(template, { key = template, seed = null, seconds = BED_SECONDS } = {}) {
  const { layers } = buildBed(template, seconds, seed);
  return Object.entries(layers).map(([layer, buffer]) => ({
    name: path.posix.join("beds", key, `${layer}.wav`),
    buffer,
    seconds: buffer.length / SAMPLE_RATE,
  }));
}

/**
 * The audio for a set of videos.
 *
 * Bed layers dominate the pack — six templates of ~4 layers at 30s each is over
 * 70 MB, and Remotion copies the whole public folder into the bundle — so only
 * the beds actually being played are written. Passing the videos rather than a
 * single template is what makes a shard cheap: twelve videos' beds are around
 * 25 MB together, written once, bundled once, and then rendered twelve times.
 *
 * With no videos, every template's bed is written unseeded under its own name,
 * which is what the Studio needs: it has no plan item, so it has no id.
 */
export function renderPack({ videos = [] } = {}) {
  if (videos.length === 0) {
    return [...renderSfx(), ...BED_TEMPLATES.flatMap((template) => renderBed(template))];
  }

  const beds = [];
  const seen = new Set();

  for (const { id, template, durationInSeconds } of videos) {
    // Templates without a bed of their own — LogoLadder and WorksOnMyMachine
    // both score against DevJoke's — still need one written under their id.
    const bedTemplate = BED_TEMPLATES.includes(template) ? template : "DevJoke";
    const key = id ?? bedTemplate;
    if (seen.has(key)) continue;
    seen.add(key);

    // Sized to the video rather than to the longest video in the series. A bed
    // layer is 2.9 MB per 30 seconds, and a shard of twelve carries four or
    // five layers each; cutting a 15-second clip's bed in half is most of the
    // audio a shard has to synthesise, write and serve.
    const seconds =
      Number.isFinite(durationInSeconds) && durationInSeconds > 0
        ? durationInSeconds + BED_TAIL_SECONDS
        : BED_SECONDS;

    beds.push(...renderBed(bedTemplate, { key, seed: id, seconds }));
  }

  return [...renderSfx(), ...beds];
}

function argumentValue(name) {
  const at = process.argv.indexOf(name);
  return at === -1 ? null : process.argv[at + 1] ?? null;
}

/**
 * Write the pack for a set of videos, replacing whatever was there.
 *
 * Exported because two callers need it without paying for a child process:
 * render-batch.mjs builds one video's audio, and render-shard.mjs builds a
 * whole shard's in one pass before it bundles. Both need the write to be
 * atomic in the sense that matters here — the folder is rebuilt from empty, so
 * a renamed cue can never leave an orphan behind for the next render to find.
 */
export async function writePack(videos = []) {
  const files = renderPack({ videos });

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  let bytes = 0;
  const silent = [];
  const madeDirs = new Set();

  for (const file of files) {
    if (peak(file.buffer) < 1e-4) silent.push(file.name);

    const target = path.join(OUT_DIR, file.name);
    const dir = path.dirname(target);
    if (!madeDirs.has(dir)) {
      await mkdir(dir, { recursive: true });
      madeDirs.add(dir);
    }

    const wav = toWav(file.buffer);
    bytes += wav.length;
    await writeFile(target, wav);
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

  return { files, bytes };
}

async function main() {
  const listOnly = process.argv.includes("--list");
  const template = argumentValue("--template") ?? process.env.AUDIO_TEMPLATE ?? null;
  // Seeds the bed's key, mode and phrasing so no two videos share music.
  const seed = argumentValue("--seed") ?? process.env.AUDIO_SEED ?? null;
  if (template && !BED_TEMPLATES.includes(template)) {
    throw new Error(`unknown template "${template}" — have ${BED_TEMPLATES.join(", ")}`);
  }

  // A seeded run is one video's audio; an unseeded one is the Studio's whole
  // pack. `--template` without `--seed` narrows the Studio pack to one bed.
  const videos = seed
    ? [{ id: seed, template: template ?? "DevJoke" }]
    : template
      ? [{ id: null, template }]
      : [];

  const started = Date.now();
  const files = renderPack({ videos });

  if (listOnly) {
    for (const file of files) {
      console.log(
        `  ${file.name.padEnd(28)} ${file.seconds.toFixed(2)}s  peak ${peak(file.buffer).toFixed(3)}`,
      );
    }
    console.log(`\n${files.length} file(s) would be written to ${OUT_DIR}`);
    return;
  }

  const { bytes } = await writePack(videos);

  const sfxCount = files.filter((f) => !f.name.startsWith("beds/")).length;
  console.log(
    `${files.length} file(s) — ${sfxCount} SFX, ${files.length - sfxCount} bed layers — ` +
      `${(bytes / 1e6).toFixed(1)} MB in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  console.log(seed ? `bed seeded from "${seed}"` : "beds unseeded (default key)");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

export { OUT_DIR };
