import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { archiveToCloudinary } from "./archive-cloudinary.mjs";
import { archiveToR2 } from "./archive-r2.mjs";
import { archiveVideo } from "./archive-video.mjs";
import { writePack } from "./build-audio.mjs";
import { loadEnvFile } from "./env.mjs";
import { masterVideoAudio } from "./master-audio.mjs";
import { jobSummary, notify } from "./postiz.mjs";
import { dailyRenderCount, getArchivedQueue, loadQueueState, markRendered, pendingRender } from "./queue.mjs";
import { assertRenderAllowed } from "./render-guard.mjs";
import { assertPlayableVideo } from "./verify-video.mjs";

/**
 * Render the next video off the queue and park it for the publisher.
 *
 * Rendering and publishing used to be the same run, which tied the two to the
 * same clock — a six-hour gap between posts meant a six-hour gap between
 * renders, and a Postiz outage threw away a finished render. They are now
 * separate: this renders and records where it put the master;
 * scripts/publish-one.mjs hands one to Postiz with a scheduled slot.
 *
 * One video per run, four runs a day, six hours apart. The batch-of-four this
 * replaced put a day's work inside one job's lifetime, so a single failure part
 * way through cost every video after it — which is exactly what happened when
 * a malformed release tag failed all four after they had already rendered.
 *
 * The loop below still handles a count above one, because a manual catch-up run
 * is occasionally worth it. Sequential either way: remotion.config.ts hands
 * every core to whichever render is running, so two at once would be twice as
 * slow each and peak twice the memory for no gain.
 *
 *   node scripts/render-batch.mjs [--count 1] [--dry-run]
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

/**
 * Videos a day. Four runs, four videos, one each — when nothing goes wrong.
 *
 * Overridable so the rate can be changed without editing the cron, which is the
 * setting people actually reach for when a campaign needs to land sooner.
 */
const DAILY_TARGET = Math.max(1, Number(process.env.DAILY_TARGET ?? 4));

/**
 * How many videos this run should render.
 *
 * An explicit count — `--count`, or RENDER_COUNT from a manual dispatch — always
 * wins. Otherwise the run tops the day up to `DAILY_TARGET`.
 *
 * The difference matters over a long campaign. GitHub delays scheduled
 * workflows under load and drops them outright when it is busy enough, which is
 * documented behaviour and not rare. A run that renders exactly one video turns
 * every dropped run into a video that is never made up: the daily rate silently
 * becomes three, and a 37-day campaign quietly becomes a 50-day one with
 * nothing in any log saying so.
 *
 * Topping up instead means the next run absorbs the miss — two videos, or four
 * if a whole day was lost. Videos are recorded one at a time, so even if a
 * catch-up run is killed part way through, everything it finished is kept.
 *
 * The arithmetic lives in queue.mjs so it can be tested without a render.
 */
const countFor = (state) =>
  dailyRenderCount(state, {
    target: DAILY_TARGET,
    explicit: argValue("--count", Number(process.env.RENDER_COUNT ?? Number.NaN)),
  });

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
  // In process rather than through a child process. The CLI path takes a single
  // template and seed, which cannot express "this video's bed, sized to this
  // video" now that beds are written per id — see writePack in build-audio.mjs.
  const { files, bytes } = await writePack([
    {
      id: item.id,
      template: item.template,
      durationInSeconds: item.props?.durationInSeconds,
    },
  ]);
  console.log(`  audio: ${files.length} file(s), ${(bytes / 1e6).toFixed(0)} MB`);
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
  // Rendering is a GitHub job, not a laptop job — see scripts/render-guard.mjs
  // for why, and for the deliberately awkward escape hatch.
  const note = assertRenderAllowed({ what: "the scheduled render" });
  if (note) console.warn(`\n${note}\n`);

  await mkdir(OUT, { recursive: true });

  const [queue, state] = await Promise.all([getArchivedQueue(), loadQueueState()]);
  const { count, reason } = countFor(state);
  const batch = pendingRender(queue, state, count);

  if (batch.length === 0) {
    const message =
      count === 0
        ? `Today's ${DAILY_TARGET} are already rendered (${reason}). Nothing to do.`
        : queue.remaining === 0
          ? "Queue is empty. Submit a new 28-item weekly plan."
          : `Nothing to render — ${(state.rendered ?? []).length} video(s) already waiting to post.`;
    console.log(message);
    await jobSummary(`## Render\n\n${message}`);
    // Deliberately silent on the happy path. Four "nothing to do" messages a
    // day is how a notification channel becomes one nobody reads.
    if (count !== 0) await notify(`Weekly video factory\n${message}`);
    return;
  }

  console.log(
    `Rendering ${batch.length} video(s) sequentially — ${reason}` +
      `${DRY_RUN ? " (DRY RUN — nothing archived)" : ""}\n`,
  );

  const done = [];
  const failed = [];

  for (const [index, entry] of batch.entries()) {
    // weekId, not week: the entry carries both, and the archives take the
    // string. Destructuring `week` here passed the { id, order } object all
    // the way into a release tag and cost a full batch. See week-id.mjs.
    const { item, weekId } = entry;
    console.log(`[${index + 1}/${batch.length}] ${item.id} — ${item.template} (${weekId})`);
    try {
      const { verified, stored } = await renderOne(item, weekId);

      if (!DRY_RUN) {
        // Recorded one at a time, so a failure on video three does not throw
        // away the two that already rendered.
        await markRendered({
          id: item.id,
          // The string, so publish-one.mjs can print it and the dashboard can
          // group by it. state.json is committed; an object here would have
          // been "[object Object]" in the repository history too.
          week: weekId,
          template: item.template,
          url: stored.url,
          sha256: stored.sha256,
          bytes: stored.bytes,
          durationSeconds: verified.duration,
          // Lands awaiting review. With REQUIRE_APPROVAL=0 the publisher
          // ignores this and sends it anyway.
          approval: "pending",
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
  await jobSummary(`## Render\n\n\`\`\`\n${summary}\n\`\`\``);
  await notify(`Weekly video factory\n${summary}`);

  if (failed.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (error) => {
    console.error(error);
    await jobSummary(`## Render failed\n\n\`\`\`\n${error.message}\n\`\`\``);
    await notify(`Render failed before finishing:\n${error.message}`);
    process.exit(1);
  });
}
