import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { loadPlan } from "./validate-plan.mjs";
import { getQueue, markPosted, QUEUE_LOW_WATER } from "./queue.mjs";

const OUT = "out";
const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
const QUEUE_RUN = process.env.QUEUE_RUN === "1";
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

async function renderOne(item) {
  const outFile = path.join(OUT, `${item.id}.mp4`);
  const propsFile = path.join(OUT, `${item.id}.props.json`);
  await writeFile(propsFile, JSON.stringify(item.props));

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

  const { size } = await stat(outFile);
  console.log(
    `  rendered in ${Math.round((Date.now() - started) / 1000)}s, ${(size / 1e6).toFixed(1)} MB`,
  );
  return outFile;
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
  const { plan, errors, warnings } = await loadPlan("plan.json");
  warnings.forEach((w) => console.warn(`warning  ${w}`));
  if (errors.length) {
    errors.forEach((e) => console.error(`error    ${e}`));
    throw new Error(`plan.json has ${errors.length} error(s)`);
  }

  await mkdir(OUT, { recursive: true });

  let queue = null;
  let items;

  if (QUEUE_RUN) {
    if (plan.mode !== "queue") throw new Error('QUEUE_RUN requires plan mode "queue"');
    queue = await getQueue(plan);
    if (!queue.next) {
      const empty = `${plan.series}\nQueue is empty. Nothing rendered.`;
      console.warn(empty);
      await writeFile(path.join(OUT, "summary.json"), JSON.stringify({ done: [], failed: [] }, null, 2));
      await notify(empty);
      return;
    }
    if (ONLY.length && (ONLY.length !== 1 || ONLY[0] !== queue.next.id)) {
      throw new Error(`queue moved — expected "${ONLY.join(",")}", next item is "${queue.next.id}"`);
    }
    items = [queue.next];
  } else {
    items = ONLY.length ? plan.items.filter((i) => ONLY.includes(i.id)) : plan.items;
  }

  if (plan.mode === "queue" && !DRY_RUN && !QUEUE_RUN) {
    throw new Error("queue mode refuses a non-dry batch run — use the Publish next video workflow");
  }
  if (QUEUE_RUN && items.length !== 1) {
    throw new Error(`queue runs must contain exactly one item — got ${items.length}`);
  }

  console.log(`Rendering ${items.length} video(s), postType "${plan.postType}"${DRY_RUN ? " (DRY RUN — nothing will reach Postiz)" : ""}\n`);

  let integrations = [];
  if (!DRY_RUN) {
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

  for (const [index, item] of items.entries()) {
    console.log(`[${index + 1}/${items.length}] ${item.id} — ${item.template}`);
    try {
      const file = await renderOne(item);

      if (!DRY_RUN) {
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
          queue = await markPosted(plan, item.id);
          console.log(`  marked posted, ${queue.remaining} item(s) remain`);
        } catch (err) {
          throw new Error(`Postiz accepted ${item.id}, but state.json was not updated: ${err.message}`);
        }
      }

      done.push(item.id);
    } catch (err) {
      // One bad day shouldn't cost you the other 29.
      console.error(`  FAILED: ${err.message}`);
      failed.push({ id: item.id, reason: err.message });
    }
  }

  const queueLine = QUEUE_RUN
    ? `\nQueue: ${queue.remaining} remaining${queue.remaining <= QUEUE_LOW_WATER ? " — LOW" : ""}`
    : "";
  const summary =
    `${plan.series}\n${done.length}/${items.length} done as "${plan.postType}"` +
    (failed.length ? `\nFailed: ${failed.map((f) => f.id).join(", ")}` : "") +
    queueLine;
  console.log(`\n${summary}`);
  if (QUEUE_RUN && queue.remaining <= QUEUE_LOW_WATER) {
    const warning = `Queue low: ${queue.remaining} item(s), at most ${Math.ceil(queue.remaining / 4)} day(s) left`;
    console.warn(process.env.GITHUB_ACTIONS ? `::warning::${warning}` : `warning  ${warning}`);
  }
  await writeFile(path.join(OUT, "summary.json"), JSON.stringify({ done, failed }, null, 2));
  await notify(summary);

  if (failed.length) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error(err);
  await notify(`Render run failed before finishing:\n${err.message}`);
  process.exit(1);
});
