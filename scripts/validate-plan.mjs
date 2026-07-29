import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
// Both are leaves: neither imports this module, so the summary below can state
// the two facts that actually govern publishing without creating a cycle.
import { requiresApproval } from "./approval.mjs";
import { expandSchedule, scheduleErrors } from "./schedule.mjs";
import { describeSlot, FIRST_SLOT_ISO } from "./slots.mjs";

const ITEM_ID = /^[a-z0-9](?:[a-z0-9_-]{0,78}[a-z0-9])?$/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

export function isPortableItemId(value) {
  return typeof value === "string" && ITEM_ID.test(value) && !WINDOWS_RESERVED.test(value);
}

const TEMPLATES = {
  /**
   * Fixed at 17s: the escalation, the freeze, the silence and the loop cut are
   * all timed in seconds against a 15s body plus the 2s brand close, so a
   * different duration would move the beats out from under the soundtrack
   * rather than making a longer video.
   */
  LogoLadder: {
    required: ["eyebrow", "day", "durationInSeconds", "hook", "promise", "message", "payoff"],
    limits: { hook: 30, promise: 22, message: 54, payoff: 26, eyebrow: 26 },
  },
  /** Fixed at 15s for the same reason as LogoLadder — the beats are absolute. */
  WorksOnMyMachine: {
    required: ["eyebrow", "day", "durationInSeconds", "hook"],
    limits: { hook: 30, eyebrow: 26 },
  },
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
    required: [
      "eyebrow",
      "day",
      "durationInSeconds",
      "hook",
      "episode",
      "problems",
      "fix",
      "verdict",
    ],
    limits: { hook: 52, episode: 8, fix: 62, verdict: 44, eyebrow: 26, kicker: 20 },
    array: { key: "problems", min: 3, max: 3, line: 52 },
  },
  CaseStudy: {
    required: [
      "eyebrow",
      "day",
      "durationInSeconds",
      "hook",
      "before",
      "after",
      "actions",
      "lesson",
    ],
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
};

export async function loadPlan(path = "plan.json") {
  const raw = await readFile(path, "utf8");
  let plan;
  try {
    plan = JSON.parse(raw);
  } catch (err) {
    throw new Error(`plan.json is not valid JSON: ${err.message}`);
  }

  const errors = [];
  const warnings = [];
  // Reasons this plan may not contact Postiz yet. Deliberately separate from
  // `errors`: a plan with unresolved channels is still perfectly renderable,
  // and blocking the render would make it impossible to preview a video
  // before wiring up real accounts. Enforced in render-all.mjs on every
  // non-dry run, so nothing can post to a placeholder.
  const publishBlockers = [];
  const queueMode = plan.mode === "queue";

  if (plan.mode !== undefined && !queueMode) {
    errors.push(`mode must be "queue" when set — got "${plan.mode}"`);
  }
  if (queueMode && plan.schedule) {
    errors.push("queue mode must not have a schedule block");
  }
  // "schedule" was rejected here for as long as queue items had no date to be
  // scheduled to: they carry no publishAt by design, and the publisher sent
  // `date: new Date()`, so "schedule" would have meant "post now" through a
  // code path claiming otherwise. scripts/slots.mjs now assigns every video a
  // real future slot, which is what makes "schedule" correct in queue mode.
  //
  // "now" is the dangerous setting under an embargo — Postiz ignores the date
  // and publishes on receipt — so it is refused at send time by
  // slots.mjs::assertWithinEmbargo rather than banned outright here.
  if (queueMode && !["draft", "schedule", "now"].includes(plan.postType)) {
    errors.push(`queue mode postType must be "draft", "schedule" or "now" — got "${plan.postType}"`);
  }
  if (queueMode && plan.postType === "now") {
    // A blocker rather than an error, so the week still renders and can still
    // be previewed. But it is caught here, at accept time, instead of at 3am
    // four weeks from now: assertWithinEmbargo refuses "now" at send time, so
    // a week accepted this way renders perfectly and then fails every single
    // publish run until somebody notices and edits postType.
    publishBlockers.push(
      'postType "now" tells Postiz to publish on receipt and ignore the scheduled ' +
        'date, which would breach the embargo. Use "schedule".',
    );
  }
  if (queueMode) {
    if (!plan.week || typeof plan.week !== "object") {
      errors.push("queue mode requires week metadata");
    } else {
      if (!isPortableItemId(plan.week.id)) {
        errors.push("week.id must use the portable lowercase slug format");
      }
      if (!Number.isSafeInteger(plan.week.order) || plan.week.order < 1) {
        errors.push("week.order must be a positive integer that increases every week");
      }
      if (plan.week.partial !== undefined && typeof plan.week.partial !== "boolean") {
        errors.push("week.partial must be a boolean when set");
      }
    }

    /**
     * Four videos a day, seven days: 28. The rule exists because a week that is
     * quietly one item short starves the queue a month later, with nothing in
     * the logs to say why.
     *
     * A 30-day campaign does not divide by seven, so its last week is a real
     * two-day remainder rather than a mistake. That week says so — `partial:
     * true` — and still has to be a whole number of days, because the day and
     * slot positions below are derived from the item's index and a half-day
     * would silently misnumber every item after it.
     */
    if (Array.isArray(plan.items)) {
      const count = plan.items.length;
      const partial = plan.week?.partial === true;

      if (!partial && count !== 28) {
        errors.push(
          `a weekly queue must contain exactly 28 items — got ${count}. ` +
            "If this is the short last week of a campaign, set week.partial to true.",
        );
      } else if (partial && (count % 4 !== 0 || count < 4 || count >= 28)) {
        errors.push(
          `a partial week must be a whole number of days of 4 — 4, 8, 12, 16, 20 or 24 — got ${count}`,
        );
      }
    }
  }

  if (!["draft", "schedule", "now"].includes(plan.postType)) {
    errors.push(`postType must be draft, schedule or now — got "${plan.postType}"`);
  }
  if (!Array.isArray(plan.items) || plan.items.length === 0) {
    throw new Error("plan.json has no items");
  }

  const allChannelRefs = [plan.channels ?? [], ...plan.items.map((i) => i.channels ?? [])].flat();
  if (allChannelRefs.some((c) => String(c).startsWith("PASTE_"))) {
    publishBlockers.push(
      'channels still has the placeholder — run "npm run channels" and paste the real ids',
    );
  }
  if (allChannelRefs.length === 0) {
    warnings.push("no channels set anywhere — every video will go to every connected account");
  }

  if (!queueMode) {
    errors.push(...scheduleErrors(plan.schedule));
    if (errors.length === 0) plan.items = expandSchedule(plan);
  }

  // Channels are normally referenced by integration id, which says nothing
  // about the platform, so X can never be ruled out here. The 280-character
  // ceiling is applied to every plan rather than only to a literal "x"
  // reference — that gate silently stopped firing the moment ids were used,
  // and an over-long caption fails live on X with nobody watching.

  const seen = new Set();
  const seenHooks = new Map();
  for (const [i, item] of plan.items.entries()) {
    const at = `items[${i}]${item.id ? ` (${item.id})` : ""}`;

    if (!item.id) {
      errors.push(`${at}: missing id`);
    } else if (!isPortableItemId(item.id)) {
      errors.push(
        `${at}: id must be 1–80 lowercase letters, digits, "_" or "-", ` +
          "must start and end with a letter or digit, and must not be a Windows reserved name",
      );
    } else if (seen.has(item.id)) {
      errors.push(`${at}: duplicate id`);
    } else {
      seen.add(item.id);
    }

    const spec = TEMPLATES[item.template];
    if (!spec) {
      errors.push(`${at}: unknown template "${item.template}" — have ${Object.keys(TEMPLATES).join(", ")}`);
      continue;
    }

    if (queueMode) {
      if (item.publishAt) errors.push(`${at}: queue items must not have publishAt`);
      if (!isPortableItemId(item.sourceId)) {
        errors.push(`${at}: sourceId is required and must use the portable slug format`);
      }

      const expectedDay = Math.floor(i / 4) + 1;
      const expectedSlot = ["a", "b", "c", "d"][i % 4];
      const expectedPosition = `d${String(expectedDay).padStart(2, "0")}-${expectedSlot}`;
      if (
        item.id &&
        item.id !== expectedPosition &&
        !item.id.endsWith(`-${expectedPosition}`)
      ) {
        errors.push(`${at}: weekly position ${i + 1} requires id suffix "${expectedPosition}"`);
      }
      if (item.props?.day !== expectedDay) {
        errors.push(`${at}: props.day must be ${expectedDay} for this weekly position`);
      }
    } else {
      if (!item.publishAt) {
        errors.push(`${at}: no publishAt and no schedule block to derive one from`);
      } else if (Number.isNaN(Date.parse(item.publishAt))) {
        errors.push(`${at}: publishAt is not an ISO 8601 date`);
      } else if (plan.postType !== "draft" && Date.parse(item.publishAt) < Date.now()) {
        // With auto-publish on, a past date fires immediately across every
        // channel at once. That's the spam pattern, so it's an error not a warning.
        errors.push(`${at}: publishAt is in the past — it would publish instantly`);
      }
    }

    if (typeof item.caption !== "string" || !item.caption.trim()) {
      errors.push(`${at}: caption is empty`);
    } else if (item.caption.length > 280) {
      warnings.push(`${at}: caption is ${item.caption.length} chars, X will reject over 280`);
    }

    const props = item.props ?? {};
    for (const key of spec.required) {
      if (props[key] === undefined) errors.push(`${at}: props.${key} is missing`);
    }

    const secs = props.durationInSeconds;
    if (typeof secs === "number" && (secs < 4 || secs > 60)) {
      errors.push(`${at}: durationInSeconds ${secs} is outside 4–60`);
    }

    for (const [key, max] of Object.entries(spec.limits)) {
      const val = props[key];
      if (typeof val === "string" && val.length > max) {
        warnings.push(`${at}: props.${key} is ${val.length} chars, will likely overflow at ${max}+`);
      }
    }

    if (typeof props.hook === "string") {
      const words = props.hook.trim().split(/\s+/).filter(Boolean);
      if (words.length > 7) {
        errors.push(`${at}: props.hook has ${words.length} words — PDF hooks allow at most 7`);
      }
      const normalizedHook = props.hook.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      const duplicateAt = seenHooks.get(normalizedHook);
      if (queueMode && duplicateAt !== undefined) {
        errors.push(`${at}: hook duplicates items[${duplicateAt}] after normalization`);
      } else if (normalizedHook) {
        seenHooks.set(normalizedHook, i);
      }
    }

    if (spec.variants && !spec.variants.includes(props.variant)) {
      errors.push(`${at}: props.variant must be one of ${spec.variants.join(", ")}`);
    }

    if (spec.array) {
      const values = props[spec.array.key];
      if (!Array.isArray(values)) {
        errors.push(`${at}: props.${spec.array.key} must be an array`);
      } else {
        if (values.length < spec.array.min || values.length > spec.array.max) {
          errors.push(
            `${at}: props.${spec.array.key} must contain ${spec.array.min}` +
              (spec.array.min === spec.array.max ? "" : `–${spec.array.max}`) +
              ` items — got ${values.length}`,
          );
        }
        values.forEach((line, n) => {
          if (typeof line !== "string" || !line.trim()) {
            errors.push(`${at}: props.${spec.array.key}[${n}] must be non-empty text`);
          } else if (line.length > spec.array.line) {
            warnings.push(
              `${at}: props.${spec.array.key}[${n}] is long (${line.length} chars)`,
            );
          }
        });
      }
    }

    if (queueMode && typeof item.caption === "string") {
      const hashtagCount = item.caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
      if (hashtagCount !== 3) {
        errors.push(`${at}: caption must contain exactly 3 hashtags — got ${hashtagCount}`);
      }
    }

    if (item.template === "ListReveal" && Array.isArray(props.items)) {
      if (props.items.length < 3 || props.items.length > 5) {
        warnings.push(`${at}: ${props.items.length} list items — 3 to 5 reads best on a phone`);
      }
      props.items.forEach((line, n) => {
        if (line.length > 52) warnings.push(`${at}: item ${n + 1} is long (${line.length} chars)`);
      });
    }

    if (item.template === "StatCard" && Array.isArray(props.context)) {
      props.context.forEach((line, n) => {
        if (line.length > 48) warnings.push(`${at}: context line ${n + 1} is long (${line.length} chars)`);
      });
    }
  }

  return { plan, errors, warnings, publishBlockers };
}

// Run directly: node scripts/validate-plan.mjs [--matrix <size>]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const matrixAt = args.indexOf("--matrix");
  const chunkSize = matrixAt === -1 ? 0 : Number(args[matrixAt + 1] ?? 12);
  const planPath = args.find((a) => a.endsWith(".json")) ?? "plan.json";

  const { plan, errors, warnings, publishBlockers } = await loadPlan(planPath);

  if (chunkSize > 0) {
    // GitHub caps a single job at 6 hours. Ninety videos won't fit in one,
    // so the plan is split into chunks that run as parallel jobs. Same
    // minutes consumed either way — this just keeps each job under the cap.
    if (errors.length) {
      console.error(JSON.stringify(errors));
      process.exit(1);
    }
    const chunks = [];
    for (let i = 0; i < plan.items.length; i += chunkSize) {
      chunks.push(plan.items.slice(i, i + chunkSize).map((it) => it.id).join(","));
    }
    process.stdout.write(JSON.stringify(chunks));
    process.exit(0);
  }

  for (const w of warnings) console.warn(`warning  ${w}`);
  for (const e of errors) console.error(`error    ${e}`);
  if (errors.length) {
    console.error(`\n${errors.length} error(s). Nothing rendered.`);
    process.exit(1);
  }

  const first = plan.items[0]?.publishAt;
  const last = plan.items[plan.items.length - 1]?.publishAt;
  console.log(`\n${plan.items.length} videos ready. postType is "${plan.postType}".`);
  if (first && last) console.log(`First publishes ${first}, last publishes ${last}.`);

  // This used to read "Auto-publish is ON — these go live without review",
  // which is now false twice over: a review gate stands in front of the
  // publisher, and every slot sits behind an embargo. A summary line that
  // overstates the risk is not harmless — it is the line an operator reads
  // instead of checking, so it has to describe the system that exists.
  if (plan.postType !== "draft") {
    console.log(
      requiresApproval()
        ? "Review gate is ON — each render waits for approval in the dashboard."
        : "Review gate is OFF (REQUIRE_APPROVAL=0) — renders publish unattended.",
    );
    console.log(
      `Nothing publishes before ${describeSlot(FIRST_SLOT_ISO)} Kathmandu; ` +
        "four a day, six hours apart, from then on.",
    );
  }

  // Structure is valid and every video can be rendered. Publishing is a
  // separate gate: report it loudly but do not fail the run, so the plan can
  // be validated and previewed before Postiz is connected.
  if (publishBlockers.length) {
    console.log("\nPUBLISHING IS BLOCKED — renders and dry runs still work:");
    for (const blocker of publishBlockers) console.log(`  - ${blocker}`);
    console.log("Every scheduled run will fail at the publish step until this is fixed.");
  }
}
