/**
 * A TypeScript port of the rules in scripts/validate-plan.mjs.
 *
 * The editor validates before it commits, because a plan that fails validation
 * does not fail in the browser — it fails four hours later inside a workflow
 * run nobody is watching. These rules must stay in step with the Node
 * validator; where they disagree, the Node one is authoritative, since that is
 * the one standing between a bad plan and Postiz.
 */

export const TEMPLATES = {
  StatCard: {
    required: ["eyebrow", "day", "durationInSeconds", "value", "label", "context"],
    limits: { value: 12, label: 46, eyebrow: 26 },
  },
  ListReveal: {
    required: ["eyebrow", "day", "durationInSeconds", "headline", "items"],
    limits: { headline: 60, eyebrow: 26 },
  },
  DevJoke: {
    required: ["eyebrow", "day", "durationInSeconds", "hook", "beats", "punchline", "variant"],
    limits: { hook: 52, punchline: 58, eyebrow: 26, kicker: 20 },
    array: { key: "beats", min: 3, max: 5, line: 46 },
    variants: ["logo", "terminal", "qa", "timer", "scope", "deploy", "comments", "cache"],
  },
  TechTip: {
    required: ["eyebrow", "day", "durationInSeconds", "hook", "steps", "result", "variant"],
    limits: { hook: 52, result: 62, eyebrow: 26, kicker: 20 },
    array: { key: "steps", min: 3, max: 3, line: 52 },
    variants: ["security", "devtools", "tool-audit", "vitals", "index-check", "design-code"],
  },
  SiteRoast: {
    required: ["eyebrow", "day", "durationInSeconds", "hook", "episode", "problems", "fix", "verdict"],
    limits: { hook: 52, episode: 8, fix: 62, verdict: 44, eyebrow: 26, kicker: 20 },
    array: { key: "problems", min: 3, max: 3, line: 52 },
  },
  CaseStudy: {
    required: ["eyebrow", "day", "durationInSeconds", "hook", "before", "after", "actions", "lesson"],
    limits: { hook: 52, before: 54, after: 54, lesson: 62, eyebrow: 26, kicker: 20 },
    array: { key: "actions", min: 3, max: 3, line: 50 },
  },
  Recap: {
    required: ["eyebrow", "day", "durationInSeconds", "hook", "totals", "leaderboard", "lesson"],
    limits: { hook: 52, lesson: 62, eyebrow: 26, kicker: 20 },
  },
  FounderStory: {
    required: ["eyebrow", "day", "durationInSeconds", "hook", "moments", "turn", "lesson"],
    limits: { hook: 52, turn: 58, lesson: 62, eyebrow: 26, kicker: 20 },
    array: { key: "moments", min: 3, max: 3, line: 50 },
  },
} as const;

export type TemplateName = keyof typeof TEMPLATES;
export const TEMPLATE_NAMES = Object.keys(TEMPLATES) as TemplateName[];

export interface PlanItem {
  id: string;
  sourceId?: string;
  template: string;
  caption: string;
  publishAt?: string;
  channels?: string[];
  props: Record<string, unknown>;
}

export interface WeeklyPlan {
  series: string;
  mode: "queue";
  week: { id: string; order: number };
  postType: "draft" | "now" | "schedule";
  channels?: string[];
  channelSettings?: Record<string, Record<string, unknown>>;
  items: PlanItem[];
}

export interface Issue {
  level: "error" | "warning";
  at: string;
  itemIndex: number | null;
  message: string;
}

const ITEM_ID = /^[a-z0-9](?:[a-z0-9_-]{0,78}[a-z0-9])?$/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
const SLOTS = ["a", "b", "c", "d"] as const;

export function isPortableItemId(value: unknown): value is string {
  return typeof value === "string" && ITEM_ID.test(value) && !WINDOWS_RESERVED.test(value);
}

export function templateSpec(name: string) {
  return (TEMPLATES as Record<string, (typeof TEMPLATES)[TemplateName] | undefined>)[name];
}

/** Human-readable position label, e.g. "Day 3 · slot b". */
export function positionLabel(index: number): string {
  return `Day ${Math.floor(index / 4) + 1} · slot ${SLOTS[index % 4]}`;
}

export function expectedPosition(index: number): string {
  const day = String(Math.floor(index / 4) + 1).padStart(2, "0");
  return `d${day}-${SLOTS[index % 4]}`;
}

function countHashtags(caption: string): number {
  return caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
}

/** Validates one item in its weekly position. Mirrors the queue-mode branch. */
export function validateItem(item: PlanItem, index: number, seenHooks: Map<string, number>): Issue[] {
  const issues: Issue[] = [];
  const at = `items[${index}]${item.id ? ` (${item.id})` : ""}`;
  const push = (level: Issue["level"], message: string) =>
    issues.push({ level, at, itemIndex: index, message });

  if (!item.id) push("error", "missing id");
  else if (!isPortableItemId(item.id)) push("error", "id must be a lowercase portable slug");

  const spec = templateSpec(item.template);
  if (!spec) {
    push("error", `unknown template "${item.template}" — have ${TEMPLATE_NAMES.join(", ")}`);
    return issues;
  }

  if (item.publishAt) push("error", "queue items must not have publishAt");
  if (!isPortableItemId(item.sourceId)) push("error", "sourceId is required and must be a portable slug");

  const position = expectedPosition(index);
  if (item.id && item.id !== position && !item.id.endsWith(`-${position}`)) {
    push("error", `weekly position ${index + 1} requires id suffix "${position}"`);
  }

  const props = item.props ?? {};
  const expectedDay = Math.floor(index / 4) + 1;
  if (props.day !== expectedDay) push("error", `props.day must be ${expectedDay} for this position`);

  if (typeof item.caption !== "string" || !item.caption.trim()) {
    push("error", "caption is empty");
  } else {
    if (item.caption.length > 280) {
      push("warning", `caption is ${item.caption.length} chars, X will reject over 280`);
    }
    const tags = countHashtags(item.caption);
    if (tags !== 3) push("error", `caption must contain exactly 3 hashtags — got ${tags}`);
  }

  for (const key of spec.required) {
    if (props[key] === undefined) push("error", `props.${key} is missing`);
  }

  const seconds = props.durationInSeconds;
  if (typeof seconds === "number" && (seconds < 4 || seconds > 60)) {
    push("error", `durationInSeconds ${seconds} is outside 4–60`);
  }

  for (const [key, max] of Object.entries(spec.limits)) {
    const value = props[key];
    if (typeof value === "string" && value.length > max) {
      push("warning", `props.${key} is ${value.length} chars, will likely overflow at ${max}+`);
    }
  }

  if (typeof props.hook === "string") {
    const words = props.hook.trim().split(/\s+/).filter(Boolean);
    if (words.length > 7) push("error", `props.hook has ${words.length} words — at most 7`);

    const normalized = props.hook.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const duplicate = seenHooks.get(normalized);
    if (duplicate !== undefined) push("error", `hook duplicates items[${duplicate}] after normalization`);
    else if (normalized) seenHooks.set(normalized, index);
  }

  if ("variants" in spec && spec.variants && !spec.variants.includes(props.variant as never)) {
    push("error", `props.variant must be one of ${spec.variants.join(", ")}`);
  }

  if ("array" in spec && spec.array) {
    const { key, min, max, line } = spec.array;
    const values = props[key];
    if (!Array.isArray(values)) {
      push("error", `props.${key} must be an array`);
    } else {
      if (values.length < min || values.length > max) {
        const range = min === max ? `${min}` : `${min}–${max}`;
        push("error", `props.${key} must contain ${range} items — got ${values.length}`);
      }
      values.forEach((entry, n) => {
        if (typeof entry !== "string" || !entry.trim()) {
          push("error", `props.${key}[${n}] must be non-empty text`);
        } else if (entry.length > line) {
          push("warning", `props.${key}[${n}] is long (${entry.length} chars)`);
        }
      });
    }
  }

  return issues;
}

/** Validates a whole accepted week, including the cross-item uniqueness rules. */
export function validatePlan(plan: WeeklyPlan): Issue[] {
  const issues: Issue[] = [];
  const global = (level: Issue["level"], message: string) =>
    issues.push({ level, at: "plan", itemIndex: null, message });

  if (plan.mode !== "queue") global("error", 'mode must be "queue"');
  if (!["draft", "now"].includes(plan.postType)) {
    global("error", `postType must be "draft" or "now" in queue mode — got "${plan.postType}"`);
  }
  if (!plan.week?.id || !isPortableItemId(plan.week.id)) {
    global("error", "week.id must be a portable lowercase slug");
  }
  if (!Number.isSafeInteger(plan.week?.order) || plan.week.order < 1) {
    global("error", "week.order must be a positive integer that increases every week");
  }
  if (!Array.isArray(plan.items) || plan.items.length !== 28) {
    global("error", `a weekly queue must contain exactly 28 items — got ${plan.items?.length ?? 0}`);
  }

  const ids = new Set<string>();
  const sourceIds = new Set<string>();
  const captions = new Set<string>();
  const hooks = new Map<string, number>();

  (plan.items ?? []).forEach((item, index) => {
    if (item.id) {
      if (ids.has(item.id)) {
        issues.push({ level: "error", at: `items[${index}]`, itemIndex: index, message: "duplicate id" });
      }
      ids.add(item.id);
    }
    if (item.sourceId) {
      if (sourceIds.has(item.sourceId)) {
        issues.push({ level: "error", at: `items[${index}]`, itemIndex: index, message: "duplicate sourceId" });
      }
      sourceIds.add(item.sourceId);
    }
    const caption = item.caption?.trim();
    if (caption) {
      if (captions.has(caption)) {
        issues.push({ level: "error", at: `items[${index}]`, itemIndex: index, message: "duplicate caption" });
      }
      captions.add(caption);
    }
    issues.push(...validateItem(item, index, hooks));
  });

  return issues;
}

export function countIssues(issues: Issue[]): { errors: number; warnings: number } {
  return {
    errors: issues.filter((issue) => issue.level === "error").length,
    warnings: issues.filter((issue) => issue.level === "warning").length,
  };
}
