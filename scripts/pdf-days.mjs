import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadQueueState } from "./queue.mjs";
import { loadAcceptedWeeks } from "./weekly-plan.mjs";

/**
 * Prove that every script page of the source PDF is made exactly once.
 *
 * The other uniqueness checks in this repository all compare planned videos to
 * each other: distinct ids, distinct captions, distinct visible copy, distinct
 * look and music, and after the render, distinct pixels and loudness. Every one
 * of them passed on a week that was twenty-seven re-skins of the same script
 * page, because twenty-seven different client logos really are twenty-seven
 * different strings.
 *
 * What none of them could ask is the question that actually matters: which page
 * of the brief is this video, and has that page already been made. That is what
 * this asks. plan-source/pdf-days.json lists the thirty days and what has
 * happened to each; every plan item that claims one cites it by sourceId, and a
 * day may be claimed once.
 *
 *   node scripts/pdf-days.mjs [--json]
 */

const DAYS_PATH = "plan-source/pdf-days.json";

/**
 * Both naming schemes a plan item has ever used to cite a script page.
 *
 * `meritbyte-pdf-NN` is week 31's; `pdf-day-NN-slug` is week 32's. Matching only
 * the newer one is not a cosmetic gap — it is how this check first reported that
 * every page was made exactly once while twenty-seven of them had already been
 * made and published under the older scheme. A provenance check that only knows
 * one generation of provenance is worse than none, because it reads as an
 * all-clear.
 */
const PDF_SOURCE_ID = /^(?:pdf-day-(\d{2})-[a-z0-9-]+|meritbyte-pdf-(\d{2}))$/;

export async function loadPdfDays(path = DAYS_PATH) {
  const parsed = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(parsed.days) || parsed.days.length === 0) {
    throw new Error(`${path} has no days`);
  }
  return parsed;
}

/**
 * Cross-check the PDF index against what is actually planned.
 *
 * Returns problems as strings rather than throwing, so a bad campaign reports
 * every mismatch at once instead of one per run.
 */
export function auditPlacement(days, items) {
  const problems = [];
  const notes = [];
  const byDay = new Map(days.map((day) => [day.day, day]));

  if (byDay.size !== days.length) {
    problems.push(`${DAYS_PATH}: two entries share a day number`);
  }

  // Every plan item that cites a PDF page, grouped by the page it cites. A list
  // rather than a single value: the whole point is to see a page cited twice.
  const claims = new Map();
  for (const { item, weekId, posted } of items) {
    const match = PDF_SOURCE_ID.exec(item.sourceId ?? "");
    if (!match) continue;

    const day = Number(match[1] ?? match[2]);
    const entry = byDay.get(day);
    const at = `${item.id} (${weekId})`;

    if (!entry) {
      problems.push(`${at}: cites PDF day ${day}, which ${DAYS_PATH} does not list`);
      continue;
    }

    // `template` is the PDF's assignment; `builtAs` overrides it for the pages
    // this repository gave their own composition, whose beats are timed in
    // absolute seconds and so cannot be a props file on a shared template.
    // Published items are not re-checked: the file they describe already exists.
    const expected = entry.builtAs ?? entry.template;
    if (!posted && expected !== item.template) {
      problems.push(
        `${at}: built as ${item.template}, but day ${day} is ${expected}` +
          (entry.builtAs ? ` (the PDF assigns it to ${entry.template})` : ""),
      );
    }

    claims.set(day, [...(claims.get(day) ?? []), { at, posted }]);
  }

  /**
   * One script page is one video.
   *
   * The distinction that matters is queued against published. A page whose only
   * makers are already public is history — week 31 published day 5 and so did
   * week 32, and no amount of validation un-posts either — so that is reported
   * and moved past. A page with a *queued* maker on top of any other maker is a
   * decision still in front of us, and it is refused: it would put the same
   * subject on the same account twice, which is exactly what this file exists to
   * stop and exactly what the older `meritbyte-pdf-NN` sourceIds hid.
   */
  for (const [day, made] of [...claims].sort((a, b) => a[0] - b[0])) {
    if (made.length < 2) continue;
    const title = byDay.get(day)?.title;
    const listed = made.map((m) => `${m.at} ${m.posted ? "[published]" : "[QUEUED]"}`).join(", ");

    if (made.some((m) => !m.posted)) {
      problems.push(
        `PDF day ${day} ("${title}") is already made and is queued to be made again: ` +
          `${listed}. One script page is one video.`,
      );
    } else {
      notes.push(`PDF day ${day} ("${title}") was published twice: ${listed}`);
    }
  }

  // And the other direction: a day that says it is placed had better be.
  for (const day of days) {
    const made = claims.get(day.day) ?? [];

    if (day.status === "excluded") {
      if (made.length) {
        problems.push(
          `PDF day ${day.day} ("${day.title}") is excluded — ${day.reason ?? "no reason recorded"} ` +
            `— but ${made.map((m) => m.at).join(", ")} makes it anyway`,
        );
      }
      continue;
    }

    if (!day.item) {
      problems.push(`${DAYS_PATH}: day ${day.day} is "${day.status}" but names no item`);
    } else if (!made.some((m) => m.at.startsWith(`${day.item} `))) {
      problems.push(
        `PDF day ${day.day} ("${day.title}") says it is at ${day.item}, but no accepted ` +
          "plan item cites it",
      );
    }
  }

  return { problems, notes };
}

export async function auditPdfDays({
  daysPath = DAYS_PATH,
  plansDir = "plans",
  statePath = "state.json",
} = {}) {
  const [index, weeks, state] = await Promise.all([
    loadPdfDays(daysPath),
    loadAcceptedWeeks(plansDir),
    loadQueueState(statePath),
  ]);

  const posted = new Set(state.posted);
  const items = weeks.flatMap((week) =>
    week.plan.items.map((item) => ({
      item,
      weekId: week.plan.week.id,
      posted: posted.has(item.id),
    })),
  );

  return { index, items, ...auditPlacement(index.days, items) };
}

async function main() {
  const { index, problems, notes } = await auditPdfDays();

  const counted = index.days.reduce((tally, day) => {
    tally[day.status] = (tally[day.status] ?? 0) + 1;
    return tally;
  }, {});

  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ counted, problems, notes }, null, 2)}\n`);
    if (problems.length) process.exitCode = 1;
    return;
  }

  console.log(
    `${index.days.length} script pages in ${index.source}: ` +
      Object.entries(counted)
        .map(([status, count]) => `${count} ${status}`)
        .join(", "),
  );

  // Printed every run, not hidden behind a flag. These are pages that went out
  // twice before anything checked, and the only defence against repeating that
  // mistake is that nobody gets to forget it happened.
  for (const note of notes) console.log(`  note  ${note}`);

  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  console.log("No script page is queued that has already been made.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
