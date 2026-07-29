import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { APPROVAL_STATES, approvalOf, requiresApproval } from "./approval.mjs";
import { isPortableItemId } from "./validate-plan.mjs";
import { weekIdOf } from "./week-id.mjs";
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
      if (entry.approval !== undefined && !APPROVAL_STATES.includes(entry.approval)) {
        throw new Error(
          `${path} rendered entry "${entry.id}" has approval "${entry.approval}" — ` +
            `must be one of ${APPROVAL_STATES.join(", ")}`,
        );
      }
    }
    const ids = state.rendered.map((entry) => entry.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error(`${path} contains duplicate rendered ids`);
    }
  }

  // The slots already promised to Postiz. nextSlot() reads this to find the
  // next free one, so a malformed entry would silently hand out a slot that is
  // already taken and put two videos on the same minute.
  if (state.scheduled !== undefined) {
    if (!Array.isArray(state.scheduled)) {
      throw new Error(`${path} "scheduled" must be an array`);
    }
    for (const entry of state.scheduled) {
      if (!entry || typeof entry !== "object") {
        throw new Error(`${path} scheduled entries must be objects`);
      }
      if (!isPortableItemId(entry.id)) {
        throw new Error(`${path} scheduled entry has an invalid id: ${JSON.stringify(entry.id)}`);
      }
      if (Number.isNaN(Date.parse(entry.at))) {
        throw new Error(`${path} scheduled entry "${entry.id}" has no ISO timestamp on "at"`);
      }
    }
    const slotIds = state.scheduled.map((entry) => entry.id);
    if (new Set(slotIds).size !== slotIds.length) {
      throw new Error(`${path} contains duplicate scheduled ids`);
    }
  }

  return state;
}

/**
 * Re-exported so every existing caller keeps importing the review gate from
 * here. It is *defined* in approval.mjs because this module imports
 * validate-plan.mjs, and the validator needs to ask whether the gate is on —
 * see the note there.
 *
 * On by default: a rendered video sits in the buffer as "pending" until it is
 * approved in the dashboard. Set REQUIRE_APPROVAL=0 to go back to fully
 * unattended publishing, which is what this factory did before a review step
 * existed. The trade is real — with approval on, nothing posts while nobody is
 * looking, which is the point of it and also its cost.
 */
export { APPROVAL_STATES, approvalOf, requiresApproval };

/**
 * The UTC day a timestamp falls on.
 *
 * UTC rather than Kathmandu deliberately: the four scheduled renders fire at
 * 03:45, 09:45, 15:45 and 21:45 UTC, so a UTC day holds exactly one full set of
 * them. In Kathmandu (UTC+5:45) the last of those is 03:30 the next morning,
 * which would split a day's quota across two and make every fourth run think it
 * was the first of a new day.
 */
export const utcDay = (value = Date.now()) => new Date(value).toISOString().slice(0, 10);

/**
 * How many videos have already been rendered today.
 *
 * Read from a small counter rather than by filtering `state.rendered`, because
 * that array is the *buffer* and posting removes entries from it. A video
 * rendered at 03:45 and posted at 15:32 would vanish from it, the next run
 * would believe fewer had been rendered, and the day would overshoot its quota.
 * The counter is durable: it only ever resets when the day changes.
 */
export function rendersToday(state, now = Date.now()) {
  const quota = state?.renderQuota;
  if (!quota || quota.day !== utcDay(now)) return 0;
  return Number.isSafeInteger(quota.count) && quota.count > 0 ? quota.count : 0;
}

/**
 * How many videos a run should render to keep the day on rate.
 *
 * An explicit count always wins — that is what makes a manual dispatch a usable
 * override. Otherwise the run renders whatever today still owes, which is what
 * makes the schedule self-healing when GitHub drops a run.
 */
export function dailyRenderCount(state, { target = 4, explicit = null, now = Date.now() } = {}) {
  if (Number.isFinite(explicit) && explicit > 0) {
    return { count: Math.floor(explicit), reason: "requested" };
  }

  const done = rendersToday(state, now);
  return {
    count: Math.max(0, target - done),
    reason:
      done === 0
        ? `first run of the day, target ${target}`
        : `${done}/${target} already rendered today`,
  };
}

/** Everything rendered and not yet posted, oldest first — the review queue. */
export function buffered(state) {
  const posted = new Set(state.posted);
  return (state.rendered ?? []).filter((entry) => !posted.has(entry.id));
}

/**
 * What the publisher may actually send, oldest first.
 *
 * Rejected videos are never publishable. Pending ones are publishable only
 * when approval is switched off.
 */
export function publishable(state, { approvalRequired = requiresApproval() } = {}) {
  return buffered(state).filter((entry) => {
    const approval = approvalOf(entry);
    if (approval === "rejected") return false;
    return approvalRequired ? approval === "approved" : true;
  });
}

/** Set or clear the approval on one buffered video. */
export async function setApproval(id, approval, { statePath = STATE_PATH } = {}) {
  if (!APPROVAL_STATES.includes(approval)) {
    throw new Error(`approval must be one of ${APPROVAL_STATES.join(", ")} — got "${approval}"`);
  }

  const state = await loadQueueState(statePath);
  const entry = (state.rendered ?? []).find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`"${id}" is not in the render buffer`);

  entry.approval = approval;
  entry.reviewedAt = new Date().toISOString();
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return entry;
}

/**
 * Drop a video from the buffer so the batch will render it again.
 *
 * The master stays in its Release — deleting the pointer is what makes the id
 * eligible for a re-render, and keeping the bytes means a mistaken discard
 * costs nothing.
 */
export async function discardRendered(id, { statePath = STATE_PATH } = {}) {
  const state = await loadQueueState(statePath);
  const before = (state.rendered ?? []).length;
  state.rendered = (state.rendered ?? []).filter((entry) => entry.id !== id);

  if (state.rendered.length === before) throw new Error(`"${id}" is not in the render buffer`);

  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return state;
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
      // Both shapes, named for what they are. `week` is the metadata object
      // ({ id, order }) that callers read `.order` off; `weekId` is the string
      // storage paths are built from. They used to be one field, and passing
      // it to an archive produced "videos-[object Object]" — see week-id.mjs.
      week: week.plan.week,
      weekId: weekIdOf(week.plan.week, `plans/${week.plan.week?.id ?? "?"} week.id`),
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
    nextWeekId: nextEntry?.weekId ?? null,
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

  // Every renderer records here, which is what makes the daily quota
  // self-healing: a run that finds only two rendered today renders two. A
  // re-render counts as well — it spent the same runner minutes, and the quota
  // is a budget for the day's work, not a count of distinct videos.
  const day = utcDay();
  const count = state.renderQuota?.day === day ? (state.renderQuota.count ?? 0) : 0;
  state.renderQuota = { day, count: count + 1 };

  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

export async function markArchivedPosted(
  id,
  { plansDir = PLANS_DIR, statePath = STATE_PATH, scheduledFor = null } = {},
) {
  const weeks = await loadAcceptedWeeks(plansDir);
  if (!weeks.some((week) => week.plan.items.some((item) => item.id === id))) {
    throw new Error(`cannot mark unknown accepted plan item "${id}"`);
  }

  const state = await loadQueueState(statePath);
  if (!state.posted.includes(id)) {
    state.posted.push(id);

    // The slot Postiz was told to publish at. Recorded because it is the only
    // record of when this video actually goes live — "posted" here means
    // "handed over", which from 25 August onwards is weeks earlier.
    if (scheduledFor) {
      const scheduled = (state.scheduled ?? []).filter((entry) => entry.id !== id);
      scheduled.push({ id, at: new Date(scheduledFor).toISOString() });
      scheduled.sort((a, b) => a.at.localeCompare(b.at));
      state.scheduled = scheduled;
    }
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
