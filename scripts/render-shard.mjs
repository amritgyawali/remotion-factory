import { bundle } from "@remotion/bundler";
import { ensureBrowser, openBrowser, renderMedia, selectComposition } from "@remotion/renderer";
import { availableParallelism } from "node:os";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { archiveToCloudinary } from "./archive-cloudinary.mjs";
import { archiveToR2 } from "./archive-r2.mjs";
import { archiveVideo } from "./archive-video.mjs";
import { writePack } from "./build-audio.mjs";
import { loadEnvFile } from "./env.mjs";
import { masterVideoAudio } from "./master-audio.mjs";
import { jobSummary, notify } from "./postiz.mjs";
import { getArchivedQueue, markRendered } from "./queue.mjs";
import { assertRenderAllowed } from "./render-guard.mjs";
import { assertPlayableVideo } from "./verify-video.mjs";

/**
 * Render one shard of a campaign, as fast as a runner can be made to go.
 *
 * The scheduled renderer (scripts/render-batch.mjs) does one video per workflow
 * run, four times a day, and that is the right shape for a steady drip. It is
 * the wrong shape for standing up a 30-day campaign: 120 videos at one per run
 * is a month of waiting before the first week is even in the buffer.
 *
 * This is the other shape. The campaign is split into shards, GitHub runs the
 * shards as a parallel matrix, and each shard renders its videos back to back
 * in a single job. Wall-clock for the whole campaign becomes roughly the time
 * of the slowest shard rather than the sum of all 120.
 *
 * Three things make a shard meaningfully faster than N separate renders, and
 * all three come from work that `npx remotion render` repeats every time it is
 * invoked:
 *
 * 1. **One bundle.** `npx remotion render` webpacks the project and copies the
 *    whole public folder on every invocation. Here the project is bundled once
 *    and every video in the shard renders against the same serve URL. This is
 *    what per-video bed paths bought — see `bedSrc` in src/audio/Score.tsx.
 *
 * 2. **One browser.** Chrome is launched once and handed to every render
 *    instead of being started and torn down per video.
 *
 * 3. **One audio pass.** The shard's beds are synthesised in a single call
 *    before the bundle, rather than shelling out to a child process per video.
 *
 * The frame loop itself is unchanged and still gets the whole machine: renders
 * run one after another inside the shard, each at full concurrency, because two
 * at once would halve each other's cores and double peak memory for no gain.
 *
 *   node scripts/render-shard.mjs --ids w33-d01-a,w33-d01-b [--dry-run]
 */

loadEnvFile();

const OUT = "out";
const BUNDLE_DIR = path.join(OUT, "bundle");
const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

function argValue(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

/**
 * Which videos this shard owns.
 *
 * Ids, not an index range. The workflow computes the split once and passes the
 * result, so a shard renders the same videos however many times it is retried —
 * an index range would silently re-slice if the queue moved underneath it.
 */
function shardIds() {
  const raw = argValue("--ids", process.env.SHARD_IDS ?? "");
  return String(raw)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Frames render in parallel; videos do not.
 *
 * remotion.config.ts is not read by the programmatic API, so every setting the
 * CLI path gets from it has to be passed explicitly here. They are kept
 * deliberately identical — a shard master and a scheduled master must be the
 * same file — so if one of these changes, change it in both places.
 */
const concurrency = () => {
  const requested = Number(process.env.REMOTION_CONCURRENCY);
  return Number.isFinite(requested) && requested > 0 ? requested : availableParallelism();
};

/** The quality contract, mirrored from remotion.config.ts. See the note above. */
const QUALITY = {
  codec: "h264",
  // Visually transparent. Platforms re-encode whatever they are given, so the
  // master is what has to survive that second pass.
  crf: 18,
  imageFormat: "jpeg",
  jpegQuality: 100,
  // Slower analysis buys real bitrate efficiency on flat colour and type, which
  // is nearly the whole frame in these templates.
  x264Preset: "slow",
  // 4:2:0 8-bit. What every social platform accepts without transcoding twice.
  pixelFormat: "yuv420p",
};

/** Software GL. Deterministic across machines, which is the whole point. */
const CHROMIUM = { gl: "swangle" };

async function renderOne({ entry, serveUrl, browser, index, total }) {
  const { item, weekId } = entry;
  const outFile = path.join(OUT, `${item.id}.mp4`);
  const inputProps = { ...item.props, videoId: item.id };

  const started = Date.now();

  const composition = await selectComposition({
    serveUrl,
    id: item.template,
    inputProps,
    chromiumOptions: CHROMIUM,
    puppeteerInstance: browser,
  });

  await renderMedia({
    composition,
    serveUrl,
    outputLocation: outFile,
    inputProps,
    puppeteerInstance: browser,
    chromiumOptions: CHROMIUM,
    concurrency: concurrency(),
    overwrite: true,
    logLevel: "error",
    ...QUALITY,
  });

  const mastered = await masterVideoAudio(outFile);

  // Verified last, so what is checked is exactly what is published. A render
  // that failed halfway still writes a playable MP4 and nobody is watching.
  const verified = await assertPlayableVideo(outFile, {
    expectedSeconds: item.props?.durationInSeconds,
  });

  console.log(
    `[${index + 1}/${total}] ${item.id} — ${item.template} — ` +
      `${Math.round((Date.now() - started) / 1000)}s, ` +
      `${verified.width}x${verified.height}, ${verified.duration.toFixed(2)}s, ` +
      `${(verified.bytes / 1e6).toFixed(1)} MB, ` +
      `audio ${mastered.inputLufs} -> ${mastered.targetLufs} LUFS`,
  );

  if (DRY_RUN) return { verified, stored: null };

  const stored = await archiveVideo({ file: outFile, item, weekId, verified });
  if (stored.skipped) {
    throw new Error(
      `${item.id} rendered but could not be archived (${stored.reason}) — ` +
        "the publisher has nowhere to fetch it from",
    );
  }
  console.log(`      archived -> ${stored.url}`);

  // Cold copies, each inside a hard storage budget. Best-effort by design: the
  // Release above is the archive of record.
  for (const [name, archive] of [
    ["R2", archiveToR2],
    ["Cloudinary", archiveToCloudinary],
  ]) {
    try {
      const cold = await archive({ file: outFile, item, weekId });
      if (cold.skipped) console.log(`      ${name} skipped — ${cold.reason}`);
    } catch (error) {
      console.warn(`      ${name} archive failed (continuing): ${error.message}`);
    }
  }

  return { verified, stored };
}

async function main() {
  const note = assertRenderAllowed({ what: "a campaign shard" });
  if (note) console.warn(`\n${note}\n`);

  const ids = shardIds();
  if (ids.length === 0) {
    throw new Error("no shard ids — pass --ids a,b,c or set SHARD_IDS");
  }

  await mkdir(OUT, { recursive: true });

  const queue = await getArchivedQueue();
  const byId = new Map(queue.pendingEntries.map((entry) => [entry.item.id, entry]));

  // An id that is not pending has either already been rendered into the buffer
  // or already posted. Skipping is right — re-rendering it would overwrite a
  // master the publisher may already be holding a pointer to — but it must be
  // reported, because a shard that silently renders nothing looks like success.
  const entries = [];
  const skipped = [];
  for (const id of ids) {
    const entry = byId.get(id);
    if (entry) entries.push(entry);
    else skipped.push(id);
  }

  if (skipped.length) {
    console.log(`Skipping ${skipped.length} id(s) already rendered or posted: ${skipped.join(", ")}`);
  }
  if (entries.length === 0) {
    const message = "Nothing to render in this shard.";
    console.log(message);
    await jobSummary(`## Shard\n\n${message}`);
    return;
  }

  console.log(
    `Shard of ${entries.length} video(s)${DRY_RUN ? " (DRY RUN — nothing archived)" : ""}, ` +
      `${concurrency()} core(s) per render\n`,
  );

  // Every bed the shard needs, in one pass, before the bundle is built — the
  // bundler copies public/ into the output, so the audio has to exist first.
  const audioStarted = Date.now();
  const { files, bytes } = await writePack(
    entries.map(({ item }) => ({
      id: item.id,
      template: item.template,
      durationInSeconds: item.props?.durationInSeconds,
    })),
  );
  console.log(
    `audio: ${files.length} file(s), ${(bytes / 1e6).toFixed(0)} MB ` +
      `in ${((Date.now() - audioStarted) / 1000).toFixed(1)}s`,
  );

  const bundleStarted = Date.now();
  await rm(BUNDLE_DIR, { recursive: true, force: true });
  const serveUrl = await bundle({
    entryPoint: path.resolve("src/index.ts"),
    outDir: BUNDLE_DIR,
    // The bundle is thrown away with the runner, so the public folder can be
    // symlinked rather than copied. On a shard whose beds are ~25 MB that is
    // the difference between a copy per bundle and none. No effect on Windows,
    // where it always copies.
    symlinkPublicDir: true,
  });
  console.log(`bundle: ${((Date.now() - bundleStarted) / 1000).toFixed(1)}s\n`);

  await ensureBrowser();
  const browser = await openBrowser("chrome", { chromiumOptions: CHROMIUM });

  const done = [];
  const failed = [];

  try {
    for (const [index, entry] of entries.entries()) {
      const { item, weekId } = entry;
      try {
        const { verified, stored } = await renderOne({
          entry,
          serveUrl,
          browser,
          index,
          total: entries.length,
        });

        if (!DRY_RUN) {
          // Recorded one at a time, so a failure on video nine does not throw
          // away the eight that already rendered.
          await markRendered({
            id: item.id,
            week: weekId,
            template: item.template,
            url: stored.url,
            sha256: stored.sha256,
            bytes: stored.bytes,
            durationSeconds: verified.duration,
            approval: "pending",
          });
        }
        done.push(item.id);
      } catch (error) {
        console.error(`      FAILED: ${error.message}`);
        failed.push({ id: item.id, reason: error.message });
      }
    }
  } finally {
    // Closed in a finally so a thrown render does not leave Chrome holding the
    // job open until the workflow's timeout kills it.
    await browser.close({ silent: true }).catch(() => {});
  }

  const shardName = process.env.SHARD_NAME ?? "shard";
  const summary =
    `${shardName}: rendered ${done.length}/${entries.length}` +
    (done.length ? `\n  ok: ${done.join(", ")}` : "") +
    (skipped.length ? `\n  skipped: ${skipped.join(", ")}` : "") +
    (failed.length ? `\n  failed: ${failed.map((f) => `${f.id} (${f.reason})`).join("; ")}` : "");

  console.log(`\n${summary}`);
  await writeFile(
    path.join(OUT, `shard-${shardName}.json`),
    `${JSON.stringify({ shard: shardName, done, failed, skipped }, null, 2)}\n`,
  );
  await jobSummary(`## Shard \`${shardName}\`\n\n\`\`\`\n${summary}\n\`\`\``);

  if (failed.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (error) => {
    console.error(error.message);
    await jobSummary(`## Shard failed\n\n\`\`\`\n${error.message}\n\`\`\``);
    await notify(`Campaign shard failed:\n${error.message}`);
    process.exit(1);
  });
}
