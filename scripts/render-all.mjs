import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadPlan } from "./validate-plan.mjs";
import { getArchivedQueue, markArchivedPosted, QUEUE_LOW_WATER } from "./queue.mjs";
import { assertPlayableVideo } from "./verify-video.mjs";
import { archiveVideo } from "./archive-video.mjs";
import { BED_TEMPLATES } from "./audio/beds.mjs";
import { masterVideoAudio } from "./master-audio.mjs";
import { archiveToR2 } from "./archive-r2.mjs";

const OUT = "out";
const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
const QUEUE_RUN = process.env.QUEUE_RUN === "1";
const PLAN_PATH = process.env.PLAN_PATH;
const ONLY = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const THROTTLE_MS = Number(process.env.POSTIZ_THROTTLE_MS ?? 2000);

const POSTIZ_KEY = process.env.POSTIZ_API_KEY;
const POSTIZ_BASE = normaliseBase(process.env.POSTIZ_API_URL);

function normaliseBase(url) {
  if (!url) return null;
  const trimmed = url.replace(/\/+$/, "");
  return trimmed.endsWith("/public/v1") ? trimmed : `${trimmed}/public/v1`;
}

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

async function postiz(pathname, init = {}, attempt = 1) {
  const res = await fetch(`${POSTIZ_BASE}${pathname}`, {
    ...init,
    headers: { Authorization: POSTIZ_KEY, ...(init.headers ?? {}) },
  });

  if (res.status === 429 && attempt <= 5) {
    const wait = attempt * 60_000;
    console.warn(`  rate limited, waiting ${wait / 1000}s then retrying`);
    await sleep(wait);
    return postiz(pathname, init, attempt + 1);
  }

  const body = await res.text();
  if (!res.ok) throw new Error(`Postiz ${pathname} -> ${res.status}: ${body.slice(0, 400)}`);
  return body ? JSON.parse(body) : null;
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

async function renderOne(item) {
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
  return { file: outFile, verified };
}

async function uploadToPostiz(file) {
  const buf = await readFile(file);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "video/mp4" }), path.basename(file));
  // Do not set Content-Type — fetch writes the multipart boundary itself.
  const uploaded = await postiz("/upload", { method: "POST", body: form });
  const media = Array.isArray(uploaded) ? uploaded[0] : uploaded;
  if (!media?.id) throw new Error(`Upload returned no id: ${JSON.stringify(uploaded).slice(0, 300)}`);
  return media;
}

/**
 * Resolve the channel list for one item. IDs are the safe way to name a
 * channel: identifiers are not unique — two Instagram accounts both report
 * "instagram-standalone", and matching on that would publish to both.
 */
export function resolveChannels(item, plan, integrations) {
  const live = integrations.filter((i) => !i.disabled);
  const wanted = item.channels ?? plan.channels ?? [];

  if (wanted.length === 0) {
    console.warn(`  no channels specified — posting to all ${live.length} connected channels`);
    return live;
  }

  const resolved = [];
  for (const ref of wanted) {
    const byId = live.find((i) => i.id === ref);
    if (byId) {
      resolved.push(byId);
      continue;
    }

    const byIdentifier = live.filter((i) => i.identifier === ref);
    if (byIdentifier.length === 1) {
      resolved.push(byIdentifier[0]);
    } else if (byIdentifier.length > 1) {
      throw new Error(
        `"${ref}" matches ${byIdentifier.length} channels (${byIdentifier
          .map((i) => `${i.name} = ${i.id}`)
          .join(", ")}). Use the integration id so the post lands on the right account.`,
      );
    } else {
      throw new Error(`"${ref}" matches no connected channel. Run: npm run channels`);
    }
  }

  // Same id listed twice would post twice.
  return [...new Map(resolved.map((i) => [i.id, i])).values()];
}

function buildPosts(item, media, integrations, plan) {
  const wanted = resolveChannels(item, plan, integrations);
  if (wanted.length === 0) throw new Error(`no live channels for ${item.id}`);

  const settingsFor = (i) => ({
    __type: i.identifier,
    // Keyed by id first so two accounts on the same platform can differ.
    ...(plan.channelSettings?.[i.identifier] ?? {}),
    ...(plan.channelSettings?.[i.id] ?? {}),
  });

  return wanted.map((integration) => ({
    integration: { id: integration.id },
    value: [
      {
        content: item.caption,
        image: [{ id: media.id, path: media.path }],
      },
    ],
    settings: settingsFor(integration),
  }));
}

async function notify(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
  } catch (err) {
    console.warn(`Telegram notify failed: ${err.message}`);
  }
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
    if (!POSTIZ_KEY || !POSTIZ_BASE) throw new Error("POSTIZ_API_KEY and POSTIZ_API_URL are required");
    integrations = await postiz("/integrations");
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
  const weekId = (QUEUE_RUN ? queue.nextWeek?.id : plan.week?.id) ?? "unfiled";

  for (const [index, item] of items.entries()) {
    console.log(`[${index + 1}/${items.length}] ${item.id} — ${item.template}`);
    try {
      const { file, verified } = await renderOne(item);

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

        // Second copy on R2, inside a hard storage budget. Best-effort: the
        // Release above is the permanent archive, so a cold-storage failure
        // must not stop a video that is otherwise good from publishing.
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

        const media = await uploadToPostiz(file);
        await postiz("/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: plan.postType,
            date: item.publishAt ? new Date(item.publishAt).toISOString() : new Date().toISOString(),
            shortLink: false,
            tags: [],
            posts: buildPosts(item, media, integrations, plan),
          }),
        });
        console.log(`  sent to Postiz as ${plan.postType}`);
        if (!QUEUE_RUN) await sleep(THROTTLE_MS);
      }

      if (QUEUE_RUN && !DRY_RUN) {
        try {
          queue = await markArchivedPosted(item.id);
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
  await notify(`Render run failed before finishing:\n${err.message}`);
  process.exit(1);
});
