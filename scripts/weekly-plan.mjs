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
 * A week's content: everything except `postType`.
 *
 * An accepted week is immutable once it starts posting, so a delayed video can
 * never be silently rewritten. `postType` is not content though — it is the
 * owner's standing decision about how anything gets delivered, and locking it
 * to whatever was set when the first item happened to post would mean a week
 * can never be paused to drafts or released live once it is under way.
 *
 * Content is compared with this; `postType` is allowed to move on its own.
 */
export function weekContentJson(plan) {
  const { postType, ...content } = plan ?? {};
  return canonicalJson(content);
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
