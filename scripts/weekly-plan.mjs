import { readdir } from "node:fs/promises";
import path from "node:path";
import { isPortableItemId, loadPlan } from "./validate-plan.mjs";

export const WEEK_SIZE = 28;
export const POSTS_PER_DAY = 4;
const WEEK_ID = /^(\d{4})-w(0[1-9]|[1-4]\d|5[0-3])$/;
const SLOTS = ["a", "b", "c", "d"];

export function normaliseContent(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/#[\p{L}\p{N}_-]+/gu, " ")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function captionKey(item) {
  return normaliseContent(item.caption);
}

/**
 * The first thing on screen, whatever the template calls it.
 *
 * Visible-copy uniqueness compares a whole script and so passes two videos that
 * open on the same words and then diverge — which is the wrong end to compare
 * from. The PDF is explicit that with no voiceover the hook is the entire
 * proposition: "text must be fully readable by frame 6", and it is the only part
 * a scrolling viewer sees. Two videos opening on "70%" read as the same video
 * whatever their fourth second holds.
 *
 * StatCard has no `hook` and leads on its figure; ListReveal leads on its
 * headline. Those are the same slot in the frame, so they are the same key.
 */
export function hookKey(item) {
  const props = item?.props ?? {};
  return normaliseContent(props.hook ?? props.headline ?? props.value);
}

export function visibleCopyKey(item) {
  const props = item.props ?? {};
  const ignored = new Set(["day", "durationInSeconds", "eyebrow", "kicker", "theme", "variant"]);
  const visible = [];

  const collect = (value, key = "") => {
    if (ignored.has(key) || value === null || value === undefined) return;
    if (typeof value === "string" || typeof value === "number") {
      visible.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => collect(entry));
      return;
    }
    if (typeof value === "object") {
      Object.entries(value).forEach(([childKey, child]) => collect(child, childKey));
    }
  };

  collect(props);
  return normaliseContent(visible.join(" "));
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * The content of one item, as the thing that decides what the file looks like.
 *
 * The id is excluded because it is this item's identity, not its content — it is
 * the key the two versions are matched on.
 */
export function itemContentJson(item) {
  const { id, ...content } = item ?? {};
  return canonicalJson(content);
}

/**
 * Which already-posted items a replacement week would rewrite.
 *
 * The rule used to freeze the *whole* week once any item in it posted, and the
 * reasoning was sound as far as it went: a video that is already public must not
 * be silently rewritten underneath its own id. But it also froze the twenty-six
 * items that had not posted, which made a week that was accepted with a fault in
 * it permanently unfixable — and week 32 was accepted holding twenty-six re-skins
 * of one script. The only way to repair it under the old rule was to bypass the
 * rule, which is the worst outcome a check can produce.
 *
 * So the freeze now covers exactly what publication makes irreversible: an item
 * that has posted may not change, and may not disappear. Everything still in the
 * queue is a plan, and a plan is allowed to be corrected.
 */
export function frozenItemChanges(existingPlan, candidatePlan, postedIds) {
  const posted = new Set(postedIds ?? []);
  const candidates = new Map((candidatePlan?.items ?? []).map((item) => [item.id, item]));
  const changed = [];

  for (const item of existingPlan?.items ?? []) {
    if (!posted.has(item.id)) continue;

    const replacement = candidates.get(item.id);
    if (!replacement) {
      changed.push(`${item.id} has already posted and would be removed`);
    } else if (itemContentJson(item) !== itemContentJson(replacement)) {
      changed.push(`${item.id} has already posted and would be rewritten`);
    }
  }

  return changed;
}

export function weeklyPlanErrors(plan) {
  const errors = [];
  const week = plan?.week;
  const match = WEEK_ID.exec(week?.id ?? "");

  if (!match) {
    errors.push('week.id must look like "2026-w31"');
  }

  if (!Number.isInteger(week?.order) || week.order < 1) {
    errors.push("week.order must be a positive integer");
  } else if (match) {
    const expectedOrder = Number(`${match[1]}${match[2]}`);
    if (week.order !== expectedOrder) {
      errors.push(`week.order must be ${expectedOrder} for week.id "${week.id}"`);
    }
  }

  if (plan?.mode !== "queue") {
    errors.push('weekly plans must use mode "queue"');
  }

  // A full week is 28. The short last week of a campaign — 30 days is four
  // weeks and a two-day remainder — declares itself with week.partial and is
  // held to whole days instead. validate-plan.mjs carries the same rule and the
  // reasoning behind it.
  const count = Array.isArray(plan?.items) ? plan.items.length : -1;
  const partial = plan?.week?.partial === true;

  if (!partial && count !== WEEK_SIZE) {
    errors.push(`weekly plans must contain exactly ${WEEK_SIZE} items`);
  } else if (partial && (count % POSTS_PER_DAY !== 0 || count < POSTS_PER_DAY || count >= WEEK_SIZE)) {
    errors.push(
      `a partial week must hold whole days of ${POSTS_PER_DAY}, fewer than ${WEEK_SIZE} — got ${count}`,
    );
  }

  for (const [index, item] of (plan?.items ?? []).entries()) {
    const day = Math.floor(index / POSTS_PER_DAY) + 1;
    const slot = SLOTS[index % POSTS_PER_DAY];
    const expectedPosition = `d${String(day).padStart(2, "0")}-${slot}`;
    const at = `items[${index}]${item?.id ? ` (${item.id})` : ""}`;

    const id = String(item?.id ?? "");
    if (id !== expectedPosition && !id.endsWith(`-${expectedPosition}`)) {
      errors.push(`${at}: id must end with "${expectedPosition}" at this queue position`);
    }
    if (item?.props?.day !== day) {
      errors.push(`${at}: props.day must be ${day}`);
    }
    if (!isPortableItemId(item?.sourceId)) {
      errors.push(`${at}: sourceId must use the portable lowercase slug format`);
    }
    if (!captionKey(item)) {
      errors.push(`${at}: caption has no unique text after normalisation`);
    }
    if (!visibleCopyKey(item)) {
      errors.push(`${at}: visible copy has no unique text after normalisation`);
    }
  }

  return errors;
}

function addUnique(seen, key, description, location, errors) {
  if (!key) return;
  const first = seen.get(key);
  if (first) {
    errors.push(`${location}: duplicate ${description}; first used by ${first}`);
  } else {
    seen.set(key, location);
  }
}

export function weeklyCollectionErrors(entries) {
  const errors = [];
  const weekIds = new Map();
  const orders = new Map();
  const itemIds = new Map();
  const sourceIds = new Map();
  const captions = new Map();
  const visibleCopy = new Map();
  const hooks = new Map();
  let postType;

  for (const entry of entries) {
    const { plan } = entry;
    const weekId = plan.week?.id ?? entry.path;
    const weekLocation = `week "${weekId}"`;

    addUnique(weekIds, plan.week?.id, "week id", weekLocation, errors);
    addUnique(orders, plan.week?.order, "week order", weekLocation, errors);

    if (postType === undefined) {
      postType = plan.postType;
    } else if (plan.postType !== postType) {
      errors.push(
        `${weekLocation}: postType "${plan.postType}" differs from accepted postType "${postType}"`,
      );
    }

    for (const item of plan.items ?? []) {
      const location = `${weekLocation}, item "${item.id ?? "missing-id"}"`;
      addUnique(itemIds, item.id, "item id", location, errors);
      addUnique(sourceIds, item.sourceId, "sourceId", location, errors);
      addUnique(captions, captionKey(item), "caption", location, errors);
      addUnique(visibleCopy, visibleCopyKey(item), "visible copy", location, errors);
      addUnique(hooks, hookKey(item), "opening hook", location, errors);
    }
  }

  return errors;
}

export async function inspectWeeklyPlan(filePath) {
  const { plan, errors: planErrors, warnings, publishBlockers } = await loadPlan(filePath);
  return {
    path: filePath,
    plan,
    warnings,
    publishBlockers,
    errors: [...planErrors, ...weeklyPlanErrors(plan)],
  };
}

export async function loadAcceptedWeeks(plansDir = "plans") {
  let dirents;
  try {
    dirents = await readdir(plansDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const paths = dirents
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(plansDir, entry.name))
    .sort();
  const entries = await Promise.all(paths.map(inspectWeeklyPlan));
  const errors = [];

  for (const entry of entries) {
    errors.push(...entry.errors.map((error) => `${entry.path}: ${error}`));
    const expectedName = `${entry.plan.week?.id}.json`;
    if (path.basename(entry.path) !== expectedName) {
      errors.push(`${entry.path}: accepted archive filename must be "${expectedName}"`);
    }
  }
  errors.push(...weeklyCollectionErrors(entries));

  if (errors.length) {
    throw new Error(`accepted weekly plans have ${errors.length} error(s):\n- ${errors.join("\n- ")}`);
  }

  return entries.sort(
    (a, b) => a.plan.week.order - b.plan.week.order || a.plan.week.id.localeCompare(b.plan.week.id),
  );
}
