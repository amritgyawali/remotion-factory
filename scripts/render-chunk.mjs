import { ensureBrowser, renderMedia, selectComposition } from "@remotion/renderer";
import { readFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Render one composition, or one frame range of it, from an existing bundle.
 *
 * Used by both workflows. render-batch.yml calls it with no range and gets a
 * whole video; render-fanout.yml calls it once per chunk with a range and the
 * stitch job concatenates the results.
 *
 * Deliberately does no archiving, no state writes and no publishing. A render
 * that also mutates the queue cannot be retried safely, and the whole point of
 * a matrix is that any single job can be re-run without consulting the others.
 *
 *   node scripts/render-chunk.mjs --id Day01A [--range 0-149] [--out out/x.mp4]
 */

const MANIFEST = path.join("out", "composition.json");

function argValue(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

/**
 * The encode contract. Mirrored in remotion.config.ts for the CLI path, because
 * the programmatic API does not read that file — if one changes, change both.
 *
 * `muted` + `enforceAudioTrack: false` are not an oversight. Audio is
 * synthesised once at full length and muxed in at the very end. A chunk that
 * carried its own audio track would be a chunk whose audio starts at zero, and
 * concatenating those gives a soundtrack that restarts at every seam.
 */
const QUALITY = {
  codec: "h264",
  crf: 17,
  pixelFormat: "yuv420p",
  imageFormat: "jpeg",
  jpegQuality: 96,
  muted: true,
  enforceAudioTrack: false,
};

/**
 * One browser tab per vCPU is the starting point, not a maximum and not a
 * target — past a point the tabs contend for memory bandwidth and the render
 * gets slower as concurrency rises. Measure with `npx remotion benchmark`
 * before raising it.
 */
const concurrency = () => {
  const requested = Number(process.env.REMOTION_CONCURRENCY);
  return Number.isFinite(requested) && requested > 0 ? requested : os.cpus().length;
};

const CHROMIUM = {
  // Software GL. The same shader on two different runners must produce the same
  // pixels, or a fan-out render seams visibly at every chunk boundary.
  gl: "swangle",
  enableMultiProcessOnLinux: true,
};

/** "0-149" -> [0, 149]. Inclusive both ends, matching Remotion's frameRange. */
export function parseRange(raw) {
  if (!raw) return null;
  const match = /^(\d+)-(\d+)$/.exec(String(raw).trim());
  if (!match) throw new Error(`--range must look like "0-149" — got ${JSON.stringify(raw)}`);

  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end < start) throw new RangeError(`range ${start}-${end} ends before it starts`);
  return [start, end];
}

export async function renderChunk({ id, serveUrl, range = null, outFile, props = {} }) {
  if (!id) throw new Error("renderChunk({ id }) is required");
  if (!serveUrl) throw new Error("renderChunk({ serveUrl }) is required — run scripts/bundle.mjs");

  await mkdir(path.dirname(path.resolve(outFile)), { recursive: true });
  await ensureBrowser();

  const composition = await selectComposition({
    serveUrl,
    id,
    inputProps: props,
    chromiumOptions: CHROMIUM,
  });

  const expectedFrames = range ? range[1] - range[0] + 1 : composition.durationInFrames;
  const started = Date.now();

  await renderMedia({
    composition,
    serveUrl,
    outputLocation: outFile,
    inputProps: props,
    chromiumOptions: CHROMIUM,
    concurrency: concurrency(),
    overwrite: true,
    logLevel: "error",
    ...(range ? { frameRange: range } : {}),
    ...QUALITY,
  });

  const seconds = (Date.now() - started) / 1000;
  console.log(
    `${id}${range ? ` [${range[0]}-${range[1]}]` : ""} — ` +
      `${expectedFrames} frames in ${seconds.toFixed(1)}s ` +
      `(${(expectedFrames / seconds).toFixed(1)} fps) -> ${outFile}`,
  );

  return { outFile, expectedFrames, seconds };
}

async function main() {
  let manifest = null;
  try {
    manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  } catch {
    // Optional: an explicit --serve-url and --id are enough on their own.
  }

  const id = argValue("--id", manifest?.id ?? process.env.COMPOSITION_ID);
  const serveUrl = argValue("--serve-url", manifest?.serveUrl ?? process.env.SERVE_URL);
  const range = parseRange(argValue("--range", process.env.FRAME_RANGE));

  const fallbackName = range ? `chunk-${String(range[0]).padStart(6, "0")}.mp4` : `${id}.mp4`;
  const outFile = argValue("--out", path.join("out", fallbackName));

  const rawProps = argValue("--props", process.env.INPUT_PROPS ?? "");
  const props = rawProps ? JSON.parse(rawProps) : (manifest?.props ?? {});

  await renderChunk({ id, serveUrl, range, outFile, props });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
