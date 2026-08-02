import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Split one composition into frame ranges, one per runner.
 *
 * Only worth doing for a long composition: every chunk pays its own runner
 * startup, npm ci and browser launch, which is a fixed couple of minutes. Below
 * roughly three minutes of video that overhead is larger than the render it is
 * meant to parallelise, so render-batch.yml (one whole video per runner) wins.
 *
 * The ranges are inclusive on both ends, which is what Remotion's `frameRange`
 * expects. Off-by-one here is the classic way to produce a stitched video that
 * is one frame short per chunk and drifts steadily out of sync with its audio.
 *
 *   node scripts/plan-chunks.mjs --chunks 6 [--frames 900] [--github-output]
 */

const MANIFEST = path.join("out", "composition.json");

function argValue(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

/**
 * Divide `total` frames into `count` contiguous inclusive ranges.
 *
 * The remainder is spread one frame at a time over the leading chunks rather
 * than dumped on the last one, so the slowest chunk is never more than a frame
 * longer than the fastest. With 900 frames over 7 chunks that is 129/129/129/
 * 129/128/128/128 instead of 128 x 6 + 132.
 */
export function planChunks(total, count) {
  if (!Number.isInteger(total) || total <= 0) {
    throw new RangeError(`frame count must be a positive integer — got ${total}`);
  }
  if (!Number.isInteger(count) || count <= 0) {
    throw new RangeError(`chunk count must be a positive integer — got ${count}`);
  }
  // More chunks than frames would emit empty ranges, and an empty frameRange
  // renders the whole composition rather than nothing — every chunk would be
  // the entire video.
  const chunks = Math.min(count, total);

  const base = Math.floor(total / chunks);
  const remainder = total % chunks;

  const ranges = [];
  let start = 0;
  for (let index = 0; index < chunks; index += 1) {
    const length = base + (index < remainder ? 1 : 0);
    const end = start + length - 1;
    ranges.push({ index, start, end, frames: length });
    start = end + 1;
  }

  // The invariant the stitch step depends on. Cheap to assert, and a silent
  // failure here costs a full parallel render plus the time to work out why the
  // concatenated file is short.
  const covered = ranges.reduce((sum, range) => sum + range.frames, 0);
  if (covered !== total) {
    throw new Error(`chunk plan covers ${covered} frames, expected ${total}`);
  }
  if (ranges[0].start !== 0 || ranges[ranges.length - 1].end !== total - 1) {
    throw new Error("chunk plan does not span the composition end to end");
  }

  return ranges;
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const explicitFrames = Number(argValue("--frames", ""));
  const manifest = await readManifest();

  const total = Number.isFinite(explicitFrames) && explicitFrames > 0
    ? explicitFrames
    : manifest?.durationInFrames;

  if (!total) {
    throw new Error(
      `no frame count — run scripts/bundle.mjs first to write ${MANIFEST}, or pass --frames`,
    );
  }

  const chunks = Number(argValue("--chunks", process.env.CHUNKS ?? "6"));
  const ranges = planChunks(total, chunks);

  const plan = {
    id: manifest?.id ?? null,
    durationInFrames: total,
    fps: manifest?.fps ?? null,
    chunks: ranges,
  };

  const planPath = path.join("out", "chunks.json");
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);

  for (const range of ranges) {
    console.log(`chunk ${range.index}: frames ${range.start}-${range.end} (${range.frames})`);
  }
  console.log(`wrote ${planPath}`);

  // The matrix the workflow fans out over. One line, so it can be consumed with
  // `fromJson` in a `strategy.matrix` expression.
  if (process.argv.includes("--github-output")) {
    const file = process.env.GITHUB_OUTPUT;
    const line = `matrix=${JSON.stringify(ranges.map((range) => range.index))}\n`;
    if (file) await writeFile(file, line, { flag: "a" });
    else process.stdout.write(line);
  }

  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
