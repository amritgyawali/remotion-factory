import { readFile } from "node:fs/promises";
import { expandSchedule, scheduleErrors } from "./schedule.mjs";

const TEMPLATES = {
  StatCard: {
    required: ["eyebrow", "day", "durationInSeconds", "value", "label", "context"],
    limits: { value: 12, label: 46, eyebrow: 26 },
  },
  ListReveal: {
    required: ["eyebrow", "day", "durationInSeconds", "headline", "items"],
    limits: { headline: 60, eyebrow: 26 },
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

  if (!["draft", "schedule", "now"].includes(plan.postType)) {
    errors.push(`postType must be draft, schedule or now — got "${plan.postType}"`);
  }
  if (!Array.isArray(plan.items) || plan.items.length === 0) {
    throw new Error("plan.json has no items");
  }

  const allChannelRefs = [plan.channels ?? [], ...plan.items.map((i) => i.channels ?? [])].flat();
  if (allChannelRefs.some((c) => String(c).startsWith("PASTE_"))) {
    errors.push('channels still has the placeholder — run "npm run channels" and paste the real ids');
  }
  if (allChannelRefs.length === 0) {
    warnings.push("no channels set anywhere — every video will go to every connected account");
  }

  errors.push(...scheduleErrors(plan.schedule));
  if (errors.length === 0) plan.items = expandSchedule(plan);

  // Identifiers aren't unique. If you have two accounts on one platform,
  // naming the platform posts to both.
  const postsToX = allChannelRefs.includes("x");

  const seen = new Set();
  for (const [i, item] of plan.items.entries()) {
    const at = `items[${i}]${item.id ? ` (${item.id})` : ""}`;

    if (!item.id) errors.push(`${at}: missing id`);
    else if (seen.has(item.id)) errors.push(`${at}: duplicate id`);
    seen.add(item.id);

    const spec = TEMPLATES[item.template];
    if (!spec) {
      errors.push(`${at}: unknown template "${item.template}" — have ${Object.keys(TEMPLATES).join(", ")}`);
      continue;
    }

    if (!item.publishAt) {
      errors.push(`${at}: no publishAt and no schedule block to derive one from`);
    } else if (Number.isNaN(Date.parse(item.publishAt))) {
      errors.push(`${at}: publishAt is not an ISO 8601 date`);
    } else if (plan.postType !== "draft" && Date.parse(item.publishAt) < Date.now()) {
      // With auto-publish on, a past date fires immediately across every
      // channel at once. That's the spam pattern, so it's an error not a warning.
      errors.push(`${at}: publishAt is in the past — it would publish instantly`);
    }

    if (typeof item.caption !== "string" || !item.caption.trim()) {
      errors.push(`${at}: caption is empty`);
    } else if (item.caption.length > 280 && (postsToX || allChannelRefs.length === 0)) {
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

  return { plan, errors, warnings };
}

// Run directly: node scripts/validate-plan.mjs [--matrix <size>]
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const matrixAt = args.indexOf("--matrix");
  const chunkSize = matrixAt === -1 ? 0 : Number(args[matrixAt + 1] ?? 12);
  const planPath = args.find((a) => a.endsWith(".json")) ?? "plan.json";

  const { plan, errors, warnings } = await loadPlan(planPath);

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
  if (plan.postType !== "draft") {
    console.log("Auto-publish is ON — these go live without review.");
  }
}
