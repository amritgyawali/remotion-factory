import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isPortableItemId, loadPlan } from "./validate-plan.mjs";

export const QUEUE_LOW_WATER = 12;
const STATE_PATH = "state.json";

export async function loadQueueState(path = STATE_PATH) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`${path} is missing — refusing to guess what has already posted`);
    }
    throw err;
  }

  let state;
  try {
    state = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${err.message}`);
  }

  if (!state || !Array.isArray(state.posted)) {
    throw new Error(`${path} must contain a "posted" array`);
  }
  if (state.posted.some((id) => !isPortableItemId(id))) {
    throw new Error(`${path} posted ids must use the same portable slug format as plan item ids`);
  }
  if (new Set(state.posted).size !== state.posted.length) {
    throw new Error(`${path} contains duplicate posted ids`);
  }

  return state;
}

export function queueSnapshot(plan, state) {
  if (plan.mode !== "queue") {
    throw new Error('plan.json mode must be "queue"');
  }

  const known = new Set(plan.items.map((item) => item.id));
  const posted = new Set(state.posted);
  const unknown = state.posted.filter((id) => !known.has(id));
  const pending = plan.items.filter((item) => !posted.has(item.id));

  return {
    posted: state.posted.length,
    pending,
    remaining: pending.length,
    next: pending[0] ?? null,
    unknown,
  };
}

export async function getQueue(plan, path = STATE_PATH) {
  const queue = queueSnapshot(plan, await loadQueueState(path));
  if (queue.unknown.length) {
    throw new Error(
      `state.json contains ids no longer in plan.json — append items; do not replace them: ${queue.unknown.join(", ")}`,
    );
  }
  return queue;
}

export async function markPosted(plan, id, path = STATE_PATH) {
  if (!plan.items.some((item) => item.id === id)) {
    throw new Error(`cannot mark unknown plan item "${id}"`);
  }

  const state = await loadQueueState(path);
  if (!state.posted.includes(id)) {
    state.posted.push(id);
    await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
  }

  return queueSnapshot(plan, state);
}

async function main() {
  const { plan, errors, warnings } = await loadPlan("plan.json");
  warnings.forEach((warning) => console.error(`warning  ${warning}`));
  if (errors.length) {
    errors.forEach((error) => console.error(`error    ${error}`));
    throw new Error(`plan.json has ${errors.length} error(s)`);
  }

  const queue = await getQueue(plan);
  const githubOutput = process.argv.includes("--github-output");

  if (githubOutput) {
    process.stdout.write(`id=${queue.next?.id ?? ""}\nremaining=${queue.remaining}\n`);
    return;
  }

  console.log(`${queue.posted} posted, ${queue.remaining} remaining.`);
  console.log(queue.next ? `Next: ${queue.next.id}` : "Queue is empty.");
  if (queue.remaining <= QUEUE_LOW_WATER) {
    console.warn(`warning  queue is low — ${queue.remaining} item(s), at most ${Math.ceil(queue.remaining / 4)} day(s)`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
