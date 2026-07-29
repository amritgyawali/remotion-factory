import { spawn } from "node:child_process";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "./env.mjs";
import { loadPlan } from "./validate-plan.mjs";
import {
  getArchivedQueue,
  loadQueueState,
  markArchivedPosted,
  QUEUE_LOW_WATER,
} from "./queue.mjs";
import { assertPlayableVideo, probeLoudness } from "./verify-video.mjs";
import { assertMatchesScript } from "./verify-script.mjs";
import { archiveVideo } from "./archive-video.mjs";
import { BED_TEMPLATES } from "./audio/beds.mjs";
import { masterVideoAudio } from "./master-audio.mjs";
import { archiveToR2 } from "./archive-r2.mjs";
import { archiveToCloudinary } from "./archive-cloudinary.mjs";
// Every post the factory can send goes through publishVideo, which refuses a
// date before the embargo. This file used to carry its own copy of the Postiz
// client — its own upload, its own POST /posts, its own `date: new Date()` —
// so the embargo guard in slots.mjs simply did not apply to it. One duplicated
// client is one publishing path nobody remembers to fix.
import {
  assertConfigured,
  listIntegrations,
  notify,
  publishVideo,
  resolveChannels,
} from "./postiz.mjs";
import { nextSlot } from "./slots.mjs";
import { weekIdOf } from "./week-id.mjs";

// Before any process.env is read below, so a local .env can supply the same
// values the workflow gets from secrets. Never overrides a real environment.
loadEnvFile();

const OUT = "out";
const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
const QUEUE_RUN = process.env.QUEUE_RUN === "1";
const PLAN_PATH = process.env.PLAN_PATH;
const ONLY = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const THROTTLE_MS = Number(process.env.POSTIZ_THROTTLE_MS ?? 2000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
 * Regenerate the soundtrack for what is about to render. Building only the
 * bed in play keeps the other templates' layers out of the Remotion bundle,
 * which copies the whole public folder on every render.
 */
async function buildAudioFor(items) {
  const templates = [...new Set(items.map((item) => item.template))];
  const filter = templates.length === 1 && BED_TEMPLATES.includes(templates[0]) ? templates[0] : null;
  // One video per queue run, so its id seeds a bed nothing else will share.
  const seed = items.length === 1 ? items[0].id : null;
  await run("node", [
    "scripts/build-audio.mjs",
    ...(filter ? ["--template", filter] : []),
    ...(seed ? ["--seed", seed] : []),
  ]);
}

async function renderOne(item, weekId) {
  const outFile = path.join(OUT, `${item.id}.mp4`);
  const propsFile = path.join(OUT, `${item.id}.props.json`);
  // videoId is injected rather than authored: it seeds this video's palette,
  // typeface and musical key, and deriving it from the plan id keeps a retried
  // render byte-identical to the first attempt.
  await writeFile(propsFile, JSON.stringify({ ...item.props, videoId: item.id }));

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

  // Master to the PDF's delivery target before verifying. Remotion mixes the
  // score but has no master bus, and a scored motion-graphics track is far too
  // peaky to reach -14 LUFS by gain alone.
  const mastered = await masterVideoAudio(outFile);

  // Verify last, so what gets checked is exactly what gets published. A render
  // that failed halfway still writes a playable MP4, and nobody is watching.
  const verified = await assertPlayableVideo(outFile, {
    expectedSeconds: item.props?.durationInSeconds,
  });
  console.log(
    `  rendered in ${Math.round((Date.now() - started) / 1000)}s — ` +
      `${verified.width}x${verified.height}, ${verified.duration.toFixed(2)}s, ` +
      `${(verified.bytes / 1e6).toFixed(1)} MB, ${Math.round(verified.bitrate / 1000)} kbps`,
  );
  console.log(
    `  audio mastered ${mastered.inputLufs} -> ${mastered.targetLufs} LUFS, ` +
      `true peak ${mastered.targetTruePeak} dBTP`,
  );

  /**
   * The second gate, and the one that asks whether this is the *right* video.
   *
   * assertPlayableVideo above proves the file is a well-formed, non-blank,
   * non-silent MP4 of the right length. All of that is true of a render that
   * shows a figure nobody asked for, or none at all. This compares the props
   * the render was actually given against the script, and looks at the band of
   * the frame the figure lives in — see scripts/verify-script.mjs for why that
   * pair is a proof and a pixel classifier would not be.
   *
   * After mastering, so the loudness it judges is the loudness that ships.
   */
  const loudness = await probeLoudness(outFile).catch(() => null);
  const matched = await assertMatchesScript(outFile, item, {
    weekId,
    propsFile,
    loudness,
    fps: 30,
  });
  console.log(
    `  matches script — figure "${matched.exhibit ?? "none"}", ` +
      `band ${(matched.band.settledInk * 100).toFixed(1)}% ink, ` +
      `${matched.band.motionFrames} moving frames, ` +
      `held ${(matched.band.presenceFraction * 100).toFixed(0)}% of the body`,
  );

  return { file: outFile, verified };
}

async function main() {
  await mkdir(OUT, { recursive: true });

  let queue = null;
  let plan;
  let items;
  let publishBlockers = [];

  if (QUEUE_RUN) {
    queue = await getArchivedQueue();
    if (!queue.next) {
      const empty = "Weekly video queue\nQueue is empty. Nothing rendered.";
      console.warn(empty);
      await writeFile(path.join(OUT, "summary.json"), JSON.stringify({ done: [], failed: [] }, null, 2));
      await notify(empty);
      return;
    }
    plan = queue.nextPlan;
    publishBlockers = queue.nextPublishBlockers;
    if (plan.mode !== "queue") throw new Error('QUEUE_RUN requires plan mode "queue"');
    if (PLAN_PATH && path.normalize(PLAN_PATH) !== path.normalize(queue.nextPlanPath)) {
      throw new Error(
        `queue moved — expected plan "${PLAN_PATH}", next accepted plan is "${queue.nextPlanPath}"`,
      );
    }
    if (ONLY.length && (ONLY.length !== 1 || ONLY[0] !== queue.next.id)) {
      throw new Error(`queue moved — expected "${ONLY.join(",")}", next item is "${queue.next.id}"`);
    }
    items = [queue.next];
  } else {
    const loaded = await loadPlan("plan.json");
    loaded.warnings.forEach((warning) => console.warn(`warning  ${warning}`));
    if (loaded.errors.length) {
      loaded.errors.forEach((error) => console.error(`error    ${error}`));
      throw new Error(`plan.json has ${loaded.errors.length} error(s)`);
    }
    plan = loaded.plan;
    publishBlockers = loaded.publishBlockers;
    items = ONLY.length ? plan.items.filter((i) => ONLY.includes(i.id)) : plan.items;
  }

  if (plan.mode === "queue" && !DRY_RUN && !QUEUE_RUN) {
    throw new Error("queue mode refuses a non-dry batch run — use the Publish next video workflow");
  }
  if (QUEUE_RUN && items.length !== 1) {
    throw new Error(`queue runs must contain exactly one item — got ${items.length}`);
  }

  console.log(`Rendering ${items.length} video(s), postType "${plan.postType}"${DRY_RUN ? " (DRY RUN — nothing will reach Postiz)" : ""}\n`);

  // Regenerate the soundtrack before bundling. Every video is scored, so a
  // stale or missing pack would render silent and fail verification.
  await buildAudioFor(items);

  let integrations = [];
  if (!DRY_RUN) {
    // The last gate before anything can reach a real social account. A plan
    // with placeholder channels renders fine but must never publish.
    if (publishBlockers.length) {
      throw new Error(
        `refusing to publish — ${publishBlockers.length} unresolved issue(s):\n  - ${publishBlockers.join("\n  - ")}`,
      );
    }
    assertConfigured();
    integrations = await listIntegrations();
    for (const i of integrations) {
      console.log(`  ${i.disabled ? "off" : " on"}  ${i.identifier.padEnd(22)} ${i.name}  ${i.id}`);
    }

    // Resolve every item's channels before rendering a single frame.
    // Three hours of rendering shouldn't die on a typo'd channel id.
    for (const item of items) {
      const targets = resolveChannels(item, plan, integrations);
      console.log(`  ${item.id} -> ${targets.map((t) => t.name).join(", ")}`);
    }
    console.log("");
  }

  const done = [];
  const failed = [];
  const archived = [];
  // Normalised, not interpolated. `queue.nextWeek` is the { id, order } object
  // and passing it straight through is what minted "videos-[object Object]".
  // A plan with no week at all is a legacy non-queue plan, which files under
  // "unfiled" rather than failing.
  const rawWeek = QUEUE_RUN ? queue.nextWeekId : plan.week;
  const weekId = rawWeek ? weekIdOf(rawWeek, "render-all weekId") : "unfiled";

  for (const [index, item] of items.entries()) {
    console.log(`[${index + 1}/${items.length}] ${item.id} — ${item.template}`);
    let scheduledFor = null;
    try {
      const { file, verified } = await renderOne(item, weekId);

      if (!DRY_RUN) {
        // Store the master in GitHub before publishing. If Postiz is down the
        // video still exists, and a retry re-uploads the same id in place.
        const stored = await archiveVideo({ file, item, weekId, verified });
        if (stored.skipped) {
          console.warn(`  not archived — ${stored.reason}`);
        } else {
          console.log(`  archived -> ${stored.url}`);
          archived.push(stored.url);
        }

        // Cold copies, each inside a hard storage budget. Both are best-effort:
        // the Release above is the permanent archive, so neither one failing
        // may stop a video that is otherwise good from publishing.
        try {
          const cold = await archiveToR2({ file, item, weekId });
          console.log(
            cold.skipped
              ? `  R2 skipped — ${cold.reason}`
              : `  R2 ${cold.key} — ${(cold.usedBytes / 1024 ** 3).toFixed(2)} GB of ` +
                `${(cold.budgetBytes / 1024 ** 3).toFixed(0)} GB used` +
                (cold.evicted.length ? `, evicted ${cold.evicted.length} old object(s)` : ""),
          );
        } catch (error) {
          console.warn(`  R2 archive failed (continuing): ${error.message}`);
        }

        try {
          const cdn = await archiveToCloudinary({ file, item, weekId });
          console.log(
            cdn.skipped
              ? `  Cloudinary skipped — ${cdn.reason}`
              : `  Cloudinary ${cdn.publicId} — ${(cdn.usedBytes / 1024 ** 2).toFixed(0)} MB of ` +
                `${(cdn.budgetBytes / 1024 ** 3).toFixed(0)} GB used` +
                (cdn.evicted.length ? `, evicted ${cdn.evicted.length}` : ""),
          );
          if (!cdn.skipped) archived.push(cdn.url);
        } catch (error) {
          console.warn(`  Cloudinary archive failed (continuing): ${error.message}`);
        }

        // A slot on the six-hourly grid that starts at the embargo, never
        // "now". `item.publishAt` is still honoured for legacy dated plans,
        // but it goes through the same guard below: a date before 25 August is
        // refused rather than published and regretted.
        //
        // Only one branch can repeat within a run, and neither collides. A
        // queue run publishes exactly one item (asserted above), and a
        // non-queue plan's items each carry their own publishAt — the
        // validator refuses one that does not.
        const slot = item.publishAt
          ? new Date(item.publishAt)
          : nextSlot(await loadQueueState());

        const sent = await publishVideo({ file, item, plan, integrations, date: slot });
        console.log(`  sent to Postiz as ${plan.postType} for ${sent.readable} Kathmandu`);
        scheduledFor = sent.scheduledFor;
        if (!QUEUE_RUN) await sleep(THROTTLE_MS);
      }

      if (QUEUE_RUN && !DRY_RUN) {
        try {
          // scheduledFor is what makes the slot count as taken; without it the
          // next video would be handed the same one.
          queue = await markArchivedPosted(item.id, { scheduledFor });
          console.log(`  marked posted, ${queue.remaining} item(s) remain`);
        } catch (err) {
          throw new Error(`Postiz accepted ${item.id}, but state.json was not updated: ${err.message}`);
        }
      }

      done.push(item.id);
    } catch (err) {
      // One bad item should not hide failures in the rest of a manual dry batch.
      console.error(`  FAILED: ${err.message}`);
      failed.push({ id: item.id, reason: err.message });
    }
  }

  const queueLine = QUEUE_RUN
    ? `\nQueue: ${queue.remaining} remaining${queue.remaining <= QUEUE_LOW_WATER ? " — LOW" : ""}`
    : "";
  const summary =
    `${plan.series}\n${done.length}/${items.length} done as "${plan.postType}"` +
    (archived.length ? `\nArchived to GitHub: ${archived.join(", ")}` : "") +
    (failed.length ? `\nFailed: ${failed.map((f) => f.id).join(", ")}` : "") +
    queueLine;
  console.log(`\n${summary}`);
  if (QUEUE_RUN && queue.remaining <= QUEUE_LOW_WATER) {
    const warning = `Queue low: ${queue.remaining} item(s), at most ${Math.ceil(queue.remaining / 4)} day(s) left`;
    console.warn(process.env.GITHUB_ACTIONS ? `::warning::${warning}` : `warning  ${warning}`);
  }
  await writeFile(
    path.join(OUT, "summary.json"),
    JSON.stringify({ done, failed, archived, week: weekId }, null, 2),
  );
  await notify(summary);

  if (failed.length) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error(err);
  // The job summary is the only place the reason is visible to someone who
  // cannot download run logs, and it does not depend on Telegram being set up.
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## Publish failed\n\n\`\`\`\n${err.message}\n\`\`\`\n`,
    ).catch(() => {});
  }
  await notify(`Render run failed before finishing:\n${err.message}`);
  process.exit(1);
});
