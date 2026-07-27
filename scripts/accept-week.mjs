import { appendFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadQueueState } from "./queue.mjs";
import {
  canonicalJson,
  inspectWeeklyPlan,
  loadAcceptedWeeks,
  weekContentJson,
  weeklyCollectionErrors,
} from "./weekly-plan.mjs";

function argumentValue(args, name, fallback) {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
}

function assertCandidate(candidate, otherEntries) {
  const errors = [
    ...candidate.errors.map((error) => `${candidate.path}: ${error}`),
    ...weeklyCollectionErrors([...otherEntries, candidate]),
  ];
  if (errors.length) {
    throw new Error(`weekly plan was not accepted:\n- ${errors.join("\n- ")}`);
  }
}

export async function acceptWeek({
  planPath = "plan.json",
  plansDir = "plans",
  statePath = "state.json",
  write = true,
} = {}) {
  const [candidate, accepted, state] = await Promise.all([
    inspectWeeklyPlan(planPath),
    loadAcceptedWeeks(plansDir),
    loadQueueState(statePath),
  ]);
  const weekId = candidate.plan.week?.id;
  const existing = accepted.find((entry) => entry.plan.week.id === weekId);
  const others = accepted.filter((entry) => entry !== existing);

  assertCandidate(candidate, others);

  const knownIds = new Set(accepted.flatMap((entry) => entry.plan.items.map((item) => item.id)));
  const unknownPosted = state.posted.filter((id) => !knownIds.has(id));
  if (unknownPosted.length) {
    throw new Error(
      `${statePath} contains ids missing from accepted weekly plans: ${unknownPosted.join(", ")}`,
    );
  }

  if (existing && canonicalJson(existing.plan) === canonicalJson(candidate.plan)) {
    return {
      action: "unchanged",
      archivePath: existing.path,
      changed: false,
      weekId,
    };
  }

  if (existing) {
    const existingIds = new Set(existing.plan.items.map((item) => item.id));
    const alreadyPosted = state.posted.filter((id) => existingIds.has(id));
    // Content is frozen once the week starts; postType stays the owner's to
    // change, so a running week can still be paused to drafts or released live.
    if (alreadyPosted.length && weekContentJson(existing.plan) !== weekContentJson(candidate.plan)) {
      throw new Error(
        `week "${weekId}" is immutable because ${alreadyPosted.length} item(s) already posted — ` +
          "only postType may change once a week has started",
      );
    }
  } else if (accepted.length) {
    const highestOrder = Math.max(...accepted.map((entry) => entry.plan.week.order));
    if (candidate.plan.week.order <= highestOrder) {
      throw new Error(
        `new week order ${candidate.plan.week.order} must be greater than accepted order ${highestOrder}`,
      );
    }
  }

  const archivePath = path.join(plansDir, `${weekId}.json`);
  if (write) {
    await mkdir(plansDir, { recursive: true });
    const temporaryPath = path.join(
      plansDir,
      `.${weekId}.${process.pid}.${Date.now()}.tmp`,
    );
    try {
      await writeFile(temporaryPath, `${JSON.stringify(candidate.plan, null, 2)}\n`, "utf8");
      await rename(temporaryPath, archivePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  return {
    action: existing ? "updated" : "created",
    archivePath,
    changed: true,
    weekId,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const result = await acceptWeek({
    planPath: argumentValue(args, "--plan", "plan.json"),
    plansDir: argumentValue(args, "--plans", "plans"),
    statePath: argumentValue(args, "--state", "state.json"),
    write: !args.includes("--check"),
  });

  const githubOutput = argumentValue(args, "--github-output");
  if (githubOutput) {
    await appendFile(
      githubOutput,
      [
        `archive=${result.archivePath.replaceAll("\\", "/")}`,
        `changed=${result.changed}`,
        `week_id=${result.weekId}`,
        `action=${result.action}`,
        "",
      ].join("\n"),
      "utf8",
    );
  }

  const verb = args.includes("--check") ? "checked" : "accepted";
  console.log(
    result.changed
      ? `${result.action} ${verb} week "${result.weekId}" at ${result.archivePath}`
      : `${verb} week "${result.weekId}" is unchanged`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
