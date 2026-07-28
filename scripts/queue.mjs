import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isPortableItemId } from "./validate-plan.mjs";
import { loadAcceptedWeeks } from "./weekly-plan.mjs";

export const QUEUE_LOW_WATER = 12;
const STATE_PATH = "state.json";
const PLANS_DIR = "plans";

export async function loadQueueState(path = STATE_PATH) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`${path} is missing — refusing to guess what has already posted`);
    }
    throw error;
  }

  let state;
  try {
    state = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error.message}`);
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
  if (state.lastPostedAt !== undefined && Number.isNaN(Date.parse(state.lastPostedAt))) {
    throw new Error(`${path} lastPostedAt must be an ISO timestamp`);
  }

  // Rendering and publishing are separate workflows: the batch renders four
  // videos each morning, the publisher sends one every six hours. This is the
  // handover between them, so a malformed entry must not reach the publisher.
  if (state.rendered !== undefined) {
    if (!Array.isArray(state.rendered)) {
      throw new Error(`${path} "rendered" must be an array`);
    }
    for (const entry of state.rendered) {
      if (!entry || typeof entry !== "object") {
        throw new Error(`${path} rendered entries must be objects`);
      }
      if (!isPortableItemId(entry.id)) {
        throw new Error(`${path} rendered entry has an invalid id: ${JSON.stringify(entry.id)}`);
      }
      if (typeof entry.url !== "string" || !entry.url.startsWith("http")) {
        throw new Error(`${path} rendered entry "${entry.id}" has no downloadable url`);
      }
    }
    const ids = state.rendered.map((entry) => entry.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error(`${path} contains duplicate rendered ids`);
    }
  }

  return state;
}

/** Rendered but not yet posted, oldest first — the publisher's work queue. */
export function publishable(state) {
  const posted = new Set(state.posted);
  return (state.rendered ?? []).filter((entry) => !posted.has(entry.id));
}

/**
 * The next `count` items that need rendering: not posted, and not already
 * sitting in the rendered buffer waiting to go out.
 */
export function pendingRender(queue, state, count) {
  const alreadyRendered = new Set((state.rendered ?? []).map((entry) => entry.id));
  return queue.pendingEntries
    .filter((entry) => !alreadyRendered.has(entry.item.id))
    .slice(0, count);
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

export function archivedQueueSnapshot(weeks, state) {
  const entries = weeks.flatMap((week) =>
    week.plan.items.map((item) => ({
      item,
      plan: week.plan,
      planPath: week.path,
      week: week.plan.week,
      publishBlockers: week.publishBlockers ?? [],
    })),
  );
  const known = new Set(entries.map((entry) => entry.item.id));
  const posted = new Set(state.posted);
  const unknown = state.posted.filter((id) => !known.has(id));
  const pendingEntries = entries.filter((entry) => !posted.has(entry.item.id));
  const nextEntry = pendingEntries[0] ?? null;

  return {
    posted: state.posted.length,
    pending: pendingEntries.map((entry) => entry.item),
    pendingEntries,
    remaining: pendingEntries.length,
    next: nextEntry?.item ?? null,
    nextEntry,
    nextPlan: nextEntry?.plan ?? null,
    nextPlanPath: nextEntry?.planPath ?? null,
    nextWeek: nextEntry?.week ?? null,
    nextPublishBlockers: nextEntry?.publishBlockers ?? [],
    unknown,
    weeks,
  };
}

function assertNoUnknownPosted(queue, description) {
  if (queue.unknown.length) {
    throw new Error(
      `state.json contains ids no longer in ${description}: ${queue.unknown.join(", ")}`,
    );
  }
  return queue;
}

export async function getQueue(plan, path = STATE_PATH) {
  const queue = queueSnapshot(plan, await loadQueueState(path));
  return assertNoUnknownPosted(queue, "plan.json — append items; do not replace them");
}

export async function getArchivedQueue({
  plansDir = PLANS_DIR,
  statePath = STATE_PATH,
} = {}) {
  const [weeks, state] = await Promise.all([
    loadAcceptedWeeks(plansDir),
    loadQueueState(statePath),
  ]);
  return assertNoUnknownPosted(
    archivedQueueSnapshot(weeks, state),
    "the accepted weekly plans — never delete an accepted week",
  );
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

/**
 * Record a finished master so the publisher can find it later.
 *
 * Re-rendering an id replaces its entry rather than appending, so a retried
 * batch cannot leave two pointers to the same video.
 */
export async function markRendered(entry, { statePath = STATE_PATH } = {}) {
  if (!isPortableItemId(entry?.id)) {
    throw new Error(`cannot record a rendered entry without a portable id`);
  }

  const state = await loadQueueState(statePath);
  const rendered = (state.rendered ?? []).filter((existing) => existing.id !== entry.id);
  rendered.push({ ...entry, renderedAt: entry.renderedAt ?? new Date().toISOString() });

  state.rendered = rendered;
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

export async function markArchivedPosted(
  id,
  { plansDir = PLANS_DIR, statePath = STATE_PATH } = {},
) {
  const weeks = await loadAcceptedWeeks(plansDir);
  if (!weeks.some((week) => week.plan.items.some((item) => item.id === id))) {
    throw new Error(`cannot mark unknown accepted plan item "${id}"`);
  }

  const state = await loadQueueState(statePath);
  if (!state.posted.includes(id)) {
    state.posted.push(id);
    // Stamped so the workflow can tell a catch-up run from a duplicate one.
    // GitHub drops and delays scheduled runs, so "did we already post for this
    // slot" cannot be answered from the clock alone.
    state.lastPostedAt = new Date().toISOString();
    // Its turn in the render buffer is over. The master stays in the Release;
    // only the pointer that says "waiting to be posted" is dropped.
    if (Array.isArray(state.rendered)) {
      state.rendered = state.rendered.filter((entry) => entry.id !== id);
    }
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  }

  return assertNoUnknownPosted(
    archivedQueueSnapshot(weeks, state),
    "the accepted weekly plans — never delete an accepted week",
  );
}

async function main() {
  const queue = await getArchivedQueue();
  for (const week of queue.weeks) {
    week.warnings.forEach((warning) => console.error(`warning  ${week.path}: ${warning}`));
  }
  const githubOutput = process.argv.includes("--github-output");

  if (githubOutput) {
    const planPath = queue.nextPlanPath?.replaceAll("\\", "/") ?? "";
    process.stdout.write(
      [
        `id=${queue.next?.id ?? ""}`,
        `remaining=${queue.remaining}`,
        `plan_path=${planPath}`,
        `week_id=${queue.nextWeek?.id ?? ""}`,
        "",
      ].join("\n"),
    );
    return;
  }

  console.log(`${queue.posted} posted, ${queue.remaining} remaining.`);
  console.log(
    queue.next
      ? `Next: ${queue.next.id} (${queue.nextWeek.id}, ${queue.nextPlanPath})`
      : "Queue is empty.",
  );
  if (queue.remaining <= QUEUE_LOW_WATER) {
    console.warn(
      `warning  queue is low — ${queue.remaining} item(s), at most ${Math.ceil(queue.remaining / 4)} day(s)`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
