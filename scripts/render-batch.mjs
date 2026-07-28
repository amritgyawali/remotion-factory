import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { archiveToCloudinary } from "./archive-cloudinary.mjs";
import { archiveToR2 } from "./archive-r2.mjs";
import { archiveVideo } from "./archive-video.mjs";
import { BED_TEMPLATES } from "./audio/beds.mjs";
import { loadEnvFile } from "./env.mjs";
import { masterVideoAudio } from "./master-audio.mjs";
import { jobSummary, notify } from "./postiz.mjs";
import { getArchivedQueue, loadQueueState, markRendered, pendingRender } from "./queue.mjs";
import { assertPlayableVideo } from "./verify-video.mjs";

/**
 * The morning batch: render a day's videos, one after another, and park them.
 *
 * Rendering and publishing used to be the same run, which tied the two to the
 * same clock — a six-hour gap between posts meant a six-hour gap between
 * renders, and a Postiz outage threw away a finished render. They are now
 * separate: this renders four videos at 09:10 Kathmandu and records where it
 * put them; scripts/publish-one.mjs sends one every six hours.
 *
 * Sequential on purpose. remotion.config.ts hands every core to whichever
 * render is running, so four at once would be four times slower each and peak
 * four times the memory for no gain. Four renders at roughly four and a half
 * minutes is about twenty minutes in one job, well inside the six-hour cap.
 *
 *   node scripts/render-batch.mjs [--count 4] [--dry-run]
 */

loadEnvFile();

const OUT = "out";
const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const COUNT = argValue("--count", Number(process.env.RENDER_COUNT ?? 4));

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`)),
    );
  });
}

/**
 * The soundtrack is rebuilt per video, seeded by the plan id, so two videos on
 * the same template never share a piece of music. Filtering to the template in
 * play also keeps the other beds out of the Remotion bundle, which copies the
 * whole public folder on every render.
 */
async function buildAudioFor(item) {
  const filter = BED_TEMPLATES.includes(item.template) ? item.template : null;
  await run("node", [
    "scripts/build-audio.mjs",
    ...(filter ? ["--template", filter] : []),
    "--seed",
    item.id,
  ]);
}

async function renderOne(item, weekId) {
  const outFile = path.join(OUT, `${item.id}.mp4`);
  const propsFile = path.join(OUT, `${item.id}.props.json`);

  // videoId is injected rather than authored: it seeds this video's palette,
  // typeface and musical key, and deriving it from the plan id keeps a retried
  // render byte-identical to the first attempt.
  await writeFile(propsFile, JSON.stringify({ ...item.props, videoId: item.id }));
  await buildAudioFor(item);

  const started = Date.now();
  await run("npx", [
    "remotion",
    "render",
    "src/index.ts",
    item.template,
    outFile,
    `--props=${propsFile}`,
    "--log=error",
  ]);

  const mastered = await masterVideoAudio(outFile);

  // Verify last, so what gets checked is exactly what gets published. A render
  // that failed halfway still writes a playable MP4, and nobody is watching.
  const verified = await assertPlayableVideo(outFile, {
    expectedSeconds: item.props?.durationInSeconds,
  });

  console.log(
    `  rendered in ${Math.round((Date.now() - started) / 1000)}s — ` +
      `${verified.width}x${verified.height}, ${verified.duration.toFixed(2)}s, ` +
      `${(verified.bytes / 1e6).toFixed(1)} MB`,
  );
  console.log(
    `  audio mastered ${mastered.inputLufs} -> ${mastered.targetLufs} LUFS, ` +
      `true peak ${mastered.targetTruePeak} dBTP`,
  );

  if (DRY_RUN) return { file: outFile, verified, stored: null };

  // The Release is the permanent home and the only copy the publisher needs.
  // Without it there is nothing to publish from six hours later.
  const stored = await archiveVideo({ file: outFile, item, weekId, verified });
  if (stored.skipped) {
    throw new Error(
      `${item.id} rendered but could not be archived (${stored.reason}) — ` +
        "the publisher has nowhere to fetch it from",
    );
  }
  console.log(`  archived -> ${stored.url}`);

  // Cold copies, each inside a hard storage budget. Best-effort by design:
  // the Release above is the archive of record.
  for (const [name, archive] of [
    ["R2", archiveToR2],
    ["Cloudinary", archiveToCloudinary],
  ]) {
    try {
      const cold = await archive({ file: outFile, item, weekId });
      console.log(cold.skipped ? `  ${name} skipped — ${cold.reason}` : `  ${name} ok`);
    } catch (error) {
      console.warn(`  ${name} archive failed (continuing): ${error.message}`);
    }
  }

  return { file: outFile, verified, stored };
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const [queue, state] = await Promise.all([getArchivedQueue(), loadQueueState()]);
  const batch = pendingRender(queue, state, COUNT);

  if (batch.length === 0) {
    const message =
      queue.remaining === 0
        ? "Queue is empty. Submit a new 28-item weekly plan."
        : `Nothing to render — ${(state.rendered ?? []).length} video(s) already waiting to post.`;
    console.log(message);
    await jobSummary(`## Render batch\n\n${message}`);
    await notify(`Weekly video factory\n${message}`);
    return;
  }

  console.log(
    `Rendering ${batch.length} video(s) sequentially${DRY_RUN ? " (DRY RUN — nothing archived)" : ""}\n`,
  );

  const done = [];
  const failed = [];

  for (const [index, entry] of batch.entries()) {
    const { item, week } = entry;
    console.log(`[${index + 1}/${batch.length}] ${item.id} — ${item.template}`);
    try {
      const { verified, stored } = await renderOne(item, week);

      if (!DRY_RUN) {
        // Recorded one at a time, so a failure on video three does not throw
        // away the two that already rendered.
        await markRendered({
          id: item.id,
          week,
          template: item.template,
          url: stored.url,
          sha256: stored.sha256,
          bytes: stored.bytes,
          durationSeconds: verified.duration,
        });
      }
      done.push(item.id);
    } catch (error) {
      console.error(`  FAILED: ${error.message}`);
      failed.push({ id: item.id, reason: error.message });
    }
  }

  const waiting = (await loadQueueState()).rendered ?? [];
  const summary =
    `Rendered ${done.length}/${batch.length}` +
    (done.length ? `: ${done.join(", ")}` : "") +
    (failed.length ? `\nFailed: ${failed.map((f) => `${f.id} (${f.reason})`).join("; ")}` : "") +
    `\n${waiting.length} video(s) now waiting to post.`;

  console.log(`\n${summary}`);
  await writeFile(
    path.join(OUT, "batch.json"),
    JSON.stringify({ done, failed, waiting: waiting.map((w) => w.id) }, null, 2),
  );
  await jobSummary(`## Render batch\n\n\`\`\`\n${summary}\n\`\`\``);
  await notify(`Weekly video factory\n${summary}`);

  if (failed.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (error) => {
    console.error(error);
    await jobSummary(`## Render batch failed\n\n\`\`\`\n${error.message}\n\`\`\``);
    await notify(`Render batch failed before finishing:\n${error.message}`);
    process.exit(1);
  });
}
