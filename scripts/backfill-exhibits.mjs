import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exhibitProblems, exhibitRequired, weekNumberOf } from "./exhibits.mjs";

/**
 * Write an exhibit into every script that does not have one.
 *
 * An authoring tool, run over the accepted weeks once and its output committed.
 * That is deliberately different from src/exhibits/derive.ts, which does a
 * similar job at render time, and the difference is worth being clear about
 * because two pieces of code doing the same thing is normally a bug.
 *
 * derive.ts is a floor. It exists so that a video whose script somehow reaches
 * the renderer without a figure still shows one rather than rendering a bare
 * colour field, and it runs inside a React component with no ability to look at
 * the rest of the week.
 *
 * This is authoring. It can see the whole day at once, so it can guarantee the
 * four posts that go out six hours apart do not all draw the same picture —
 * something a per-video function cannot do however clever it is. Its output is
 * a plan file a human can read, edit and disagree with, which is the point: the
 * figure a video shows should be a decision somebody made and can see, not a
 * value computed at 3am inside a bundle.
 *
 * They cannot drift into disagreement, because they never both run on the same
 * video: once this has written an exhibit, the validator requires it, and
 * derive.ts is never reached.
 *
 *   node scripts/backfill-exhibits.mjs plans/2026-w33.json [...]  # write
 *   node scripts/backfill-exhibits.mjs --check plans/*.json       # report only
 */

const require = createRequire(import.meta.url);
const registry = require("../src/exhibits/registry.json");

const STAGE_KINDS = new Set(["browser", "terminal", "chat", "sitemock"]);

/** The script's own list, wherever the template happens to keep it. */
function contentLines(props) {
  for (const key of ["steps", "items", "moments", "problems", "actions", "beats", "context"]) {
    const lines = props?.[key];
    if (Array.isArray(lines) && lines.length && lines.every((l) => typeof l === "string")) {
      return lines;
    }
  }
  return [];
}

function short(line, limit) {
  const trimmed = String(line).trim().replace(/[.:;,]$/, "");
  if (trimmed.length <= limit) return trimmed;
  const cut = trimmed.slice(0, limit);
  const boundary = cut.lastIndexOf(" ");
  return `${boundary > limit * 0.5 ? cut.slice(0, boundary) : cut}…`;
}

function leadingNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const match = /^[^\d-]*(-?[\d,]*\.?\d+)/.exec(value);
  if (!match) return null;
  const parsed = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function trailingUnit(value) {
  if (typeof value !== "string") return "";
  const match = /^[^\d-]*-?[\d,]*\.?\d+(.*)$/.exec(value);
  return (match?.[1] ?? "").trim().slice(0, 4);
}

/**
 * Whether this script's own words will fit inside this figure.
 *
 * Two kinds have a geometric ceiling rather than a stylistic preference: a
 * satellite's label has to fit between the orbit and the panel edge, and an
 * editor line has to fit the panel width in a monospace face. A track name sits
 * in a fixed gutter. Past those widths the label is not tight, it is cut, and a
 * figure full of ellipses is worse than a different figure.
 */
function suits(kind, item) {
  // A stage is drawn by its own template out of props this function never
  // sees — WorksOnMyMachine has a hook and nothing else, and spends fifteen
  // seconds wrecking a page with it. Asking whether its "lines" fit rejected
  // the only figure it has.
  if (STAGE_KINDS.has(kind)) return true;

  const props = item.props ?? {};
  const lines = contentLines(props);
  const longest = lines.reduce((most, line) => Math.max(most, line.length), 0);

  if (registry.kinds[kind].family === "chart") {
    // A chart needs measurements, and only two templates carry any.
    if (kind === "dial") return leadingNumber(props.value) !== null;
    if (kind === "board") {
      const rows = countableRows(props.totals).length;
      return rows >= 3 && rows <= 4;
    }
    if (kind === "bars") {
      const rows = countableRows(props.leaderboard);
      return rows.length >= 2 && rows.length <= 4;
    }
    if (kind === "meters") return countableRows(props.leaderboard).length >= 2;
    // compare and cartogram need figures no template supplies on its own; a
    // script that wants them writes them by hand.
    return false;
  }

  if (!lines.length) return false;
  if (kind === "nodegraph") return longest <= 26 && lines.length >= 3;
  if (kind === "timeline") return longest <= 30 && lines.length >= 2;
  if (kind === "code") return longest <= 46;
  if (kind === "pipeline") return lines.length >= 3;
  if (kind === "trace") return lines.length >= 3;
  if (kind === "radar") return lines.length >= 2 && lines.length <= 4;
  if (kind === "checklist") return lines.length >= 2 && lines.length <= 5;
  return true;
}

const countableRows = (value) =>
  Array.isArray(value) ? value.filter((row) => typeof row?.value === "number") : [];

/** Build the data for one kind out of the script's own props. */
function build(kind, item) {
  const props = item.props ?? {};
  const lines = contentLines(props);

  switch (kind) {
    case "browser":
    case "terminal":
    case "chat":
    case "sitemock":
      return { kind };

    case "dial": {
      const value = leadingNumber(props.value);
      const unit = trailingUnit(props.value) || "%";
      return {
        kind: "dial",
        value,
        unit,
        // Empty: the template sets `label` as the headline directly above the
        // ring, and printing it again underneath is the same words twice.
        caption: "",
        ...(unit === "%" ? {} : { of: value }),
      };
    }

    case "checklist":
      return {
        kind: "checklist",
        steps: lines.slice(0, 5).map((line) => ({
          label: short(line, 42),
          // A roast lists faults, so its rows fail. Everything else lists
          // things to do, so they pass once done.
          verdict: Array.isArray(props.problems) && props.problems.includes(line) ? "fail" : "pass",
        })),
      };

    case "pipeline": {
      const stages = lines.slice(0, 5).map((line) => short(line, 40));
      return { kind: "pipeline", stages, bottleneck: Math.max(0, stages.length - 1) };
    }

    case "trace":
      return {
        kind: "trace",
        rows: lines.slice(0, 6).map((line) => short(line, 34)),
        counterLabel: item.template === "DevJoke" ? "rounds so far" : "steps taken",
      };

    case "nodegraph":
      return {
        kind: "nodegraph",
        core: short(props.headline ?? props.hook ?? "", 24),
        nodes: lines.slice(0, 5).map((line) => short(line, 24)),
      };

    case "timeline":
      return {
        kind: "timeline",
        tracks: lines.slice(0, 4).map((line, index) => ({
          label: short(line, 24),
          // Rising clip counts: every one of these stories starts simple and
          // accumulates, which is the shape the tracks should have.
          clips: 2 + index,
        })),
      };

    case "radar":
      return {
        kind: "radar",
        label: item.template === "SiteRoast" ? "what the audit finds" : "what the scan finds",
        targets: lines.slice(0, 4).map((line) => short(line, 30)),
      };

    case "code":
      return {
        kind: "code",
        filename: "checks.sh",
        lines: lines.slice(0, 6).map((line) => `# ${short(line, 44)}`),
        highlight: Math.max(0, Math.min(lines.length, 6) - 1),
      };

    case "board": {
      const tiles = countableRows(props.totals)
        .slice(0, 4)
        .map((row) => ({ label: short(row.label, 20), value: row.value }));
      return { kind: "board", tiles, emphasis: 0 };
    }

    case "bars":
      return {
        kind: "bars",
        series: countableRows(props.leaderboard)
          .slice(0, 4)
          .map((row) => ({ label: short(row.label, 18), value: row.value })),
        unit: "",
        emphasis: 0,
      };

    case "meters":
      return {
        kind: "meters",
        rows: countableRows(props.leaderboard)
          .slice(0, 5)
          .map((row) => ({ label: short(row.label, 34), value: row.value })),
        unit: "",
      };

    default:
      return null;
  }
}

/**
 * Kinds this template may draw, most characteristic first.
 *
 * The preference list is the order; the per-kind `templates` field is the
 * permission. Filtering the preference through the permission means a kind
 * listed in one and not the other can never be chosen, so the two cannot
 * disagree silently.
 */
function candidates(template) {
  const preferred = registry.preference[template] ?? [];
  return preferred.filter((kind) => registry.kinds[kind]?.templates.includes(template));
}

/**
 * Choose a figure for every item, day by day.
 *
 * Two constraints at once: the choice must be deterministic — this is run over
 * accepted weeks and must produce the same file every time — and no two of a
 * day's four posts may draw the same picture. Walking from the item's own
 * position and taking the first candidate that both suits its data and is
 * unused today satisfies both without any search.
 */
export function assignExhibits(items, weekId) {
  const assigned = new Array(items.length).fill(null);

  for (let dayStart = 0; dayStart < items.length; dayStart += 4) {
    const day = [];
    for (let index = dayStart; index < Math.min(dayStart + 4, items.length); index += 1) {
      const item = items[index];
      if (!exhibitRequired(item, weekId) || item.props?.exhibit) continue;
      day.push({ index, item, options: candidates(item.template).filter((k) => suits(k, item)) });
    }

    /**
     * Most-constrained first.
     *
     * Assigning left to right and never reconsidering is what put two
     * checklists in one day of week 36: slot A was a TechTip with eight
     * workable figures and took the checklist, and slot C was a ListReveal
     * whose five long items left the checklist as its *only* workable figure.
     * A greedy walk cannot back out of that, and the tool reported a clash on
     * a day where a perfectly good assignment existed.
     *
     * Sorting by how many figures each script can honestly carry, fewest
     * first, hands the scarce choice to the item that has no alternative and
     * leaves the flexible one to take what is left. Ties break on slot, so the
     * result stays deterministic — this runs over accepted weeks and has to
     * produce the same file every time.
     */
    day.sort((a, b) => a.options.length - b.options.length || a.index - b.index);

    const usedToday = new Set();
    for (const { index, item, options } of day) {
      // Walk from the item's own position so a template used four times in a
      // week does not open with the same figure every time — the walk is over
      // the preference order, so the figure the template is *for* is still the
      // first candidate whenever that slot comes round.
      const start = options.length ? index % options.length : 0;
      let chosen = null;

      for (let step = 0; step < options.length && !chosen; step += 1) {
        const kind = options[(start + step) % options.length];
        if (usedToday.has(kind)) continue;
        chosen = build(kind, item);
        if (chosen && !STAGE_KINDS.has(kind)) usedToday.add(kind);
      }

      // Nothing both fitted and was free even after the reordering. Take the
      // first kind that fits at all: a repeated figure is a validation error
      // the author sees and fixes by writing a better exhibit, which is a far
      // better outcome than this tool inventing data to satisfy a constraint.
      if (!chosen && options.length) chosen = build(options[0], item);

      assigned[index] = chosen;
    }
  }

  return assigned;
}

/**
 * The two shapes this runs against, normalised.
 *
 * `plans/<week>.json` is the built, accepted queue: every item carries an id.
 * `plan-source/campaign/w<n>.json` is what a human actually writes, and its
 * items deliberately carry no id, day or eyebrow — scripts/build-campaign.mjs
 * derives all three from position, which is the point of the file existing.
 *
 * Backfilling only the built plans was wrong and the validator caught it: the
 * next `build-campaign` run regenerates them from source and every figure
 * written here would be silently dropped. Source is where an authored decision
 * has to live, so this synthesises the position ids the assignment needs and
 * writes there.
 */
function withPositions(document) {
  const items = document.items ?? [];
  if (typeof document.week === "number") {
    const slots = ["a", "b", "c", "d"];
    return {
      weekId: `${document.year ?? 2026}-w${document.week}`,
      items: items.map((item, index) => ({
        ...item,
        id: `w${document.week}-d${String(Math.floor(index / 4) + 1).padStart(2, "0")}-${slots[index % 4]}`,
      })),
    };
  }
  return { weekId: document.week?.id, items };
}

async function processPlan(file, { write }) {
  const plan = JSON.parse(await readFile(file, "utf8"));
  const { weekId, items: positioned } = withPositions(plan);
  const assigned = assignExhibits(positioned, weekId);

  const report = [];
  let changed = 0;

  for (const [index, item] of positioned.entries()) {
    const exhibit = assigned[index];
    if (!exhibit) {
      if (exhibitRequired(item, weekId) && !item.props?.exhibit) {
        report.push(`  ${item.id.padEnd(12)} NO FIGURE FITS — write one by hand`);
      }
      continue;
    }
    const problems = exhibitProblems(exhibit, item.template);
    if (problems.length) {
      report.push(`  ${item.id.padEnd(12)} ${exhibit.kind} REJECTED: ${problems[0]}`);
      continue;
    }
    // Written back to the document's own item, not the positioned copy: the
    // synthesised id is scaffolding for the assignment and must not reach disk.
    plan.items[index].props.exhibit = exhibit;
    changed += 1;
    report.push(`  ${item.id.padEnd(12)} ${exhibit.kind}`);
  }

  if (write && changed) {
    const temporary = `${file}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  return { file, changed, report, week: weekNumberOf(positioned[0] ?? {}, weekId) };
}

async function main() {
  const args = process.argv.slice(2);
  const write = !args.includes("--check");
  let files = args.filter((arg) => arg.endsWith(".json"));

  /**
   * No files named: scan the campaign sources.
   *
   * Deliberately the sources and not the built plans. `npm run validate` runs
   * this on every push, and a shell glob is not portable — npm runs scripts
   * through cmd.exe on Windows, where "plans/*.json" arrives as that literal
   * string and the run dies on ENOENT. Reading the directory works everywhere,
   * and pointing it at the sources checks the file a human would actually fix.
   */
  if (!files.length) {
    const dir = "plan-source/campaign";
    files = (await readdir(dir))
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => path.join(dir, name));
  }

  let total = 0;
  for (const file of files) {
    const result = await processPlan(file, { write });
    total += result.changed;
    console.log(`${path.basename(file)} — ${result.changed} figure(s) ${write ? "written" : "proposed"}`);
    for (const line of result.report) console.log(line);
  }
  console.log(`\n${total} figure(s) ${write ? "written" : "proposed"} in total.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
