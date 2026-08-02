import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Expand the campaign scripts into accepted weekly plans.
 *
 * The scripts under plan-source/campaign/ carry only what a person actually
 * writes: which template, the copy, the caption and a provenance slug. Every
 * mechanical field — the item id, the day number, the eyebrow, the runtime, the
 * week metadata and the channel block — is derived here.
 *
 * That split exists because the mechanical fields are exactly the ones the
 * validators check hardest and a human is worst at. `props.day` has to equal
 * the item's day within its week, the id has to end in `dNN-x` matching its
 * queue position, `week.order` has to be the year and week number
 * concatenated, and the filename has to match `week.id`. Hand-maintaining 120
 * items' worth of that is how a week ends up rejected at accept time for a
 * reason that has nothing to do with its content.
 *
 * Deterministic and idempotent: running it twice writes byte-identical files,
 * so a regenerated plan produces no diff and no spurious commit.
 *
 *   node scripts/build-campaign.mjs [--check]
 */

const SOURCE_DIR = path.join("plan-source", "campaign");
const OUT_DIR = "plans";
const SERIES = "MeritByte — Build Better";
const SLOTS = ["a", "b", "c", "d"];
const POSTS_PER_DAY = 4;
const DAYS_PER_WEEK = 7;

/**
 * Runtime per template, in seconds, from the PDF's own per-day table.
 *
 * LogoLadder and WorksOnMyMachine are fixed and are not merely defaults: their
 * beats — the freeze, the silence, the loop cut — are timed in absolute seconds
 * against a specific body length, so a different runtime moves the picture out
 * from under the soundtrack. Both compositions ignore the prop; it is written
 * anyway because the validator requires it and because a plan that claimed a
 * different number would be lying about the file it produces.
 */
const RUNTIME = {
  DevJoke: 15,
  TechTip: 20,
  SiteRoast: 22,
  CaseStudy: 22,
  FounderStory: 20,
  Recap: 27,
  StatCard: 8,
  ListReveal: 10,
  WorksOnMyMachine: 15,
};

/** The strand label in the top corner. Held under the validator's 26 chars. */
const EYEBROW = {
  DevJoke: "MERITBYTE / DEV LIFE",
  TechTip: "MERITBYTE / QUICK WIN",
  SiteRoast: "MERITBYTE / SITE ROAST",
  CaseStudy: "MERITBYTE / FIELD NOTE",
  FounderStory: "MERITBYTE / FOUNDER",
  Recap: "MERITBYTE / RECAP",
  StatCard: "MERITBYTE / NUMBERS",
  ListReveal: "MERITBYTE / CHECKLIST",
  WorksOnMyMachine: SERIES,
};

/**
 * Where the videos post.
 *
 * Copied from the accepted weeks rather than repeated here: these are live
 * Postiz integration ids, and a second copy in a second file is a second place
 * to forget when an account is reconnected. If the campaign ever needs its own
 * channels this is the one line to change.
 */
async function inheritDelivery(plansDir) {
  const names = (await readdir(plansDir)).filter((name) => name.endsWith(".json")).sort();
  for (const name of names) {
    const plan = JSON.parse(await readFile(path.join(plansDir, name), "utf8"));
    if (plan.channels?.length && plan.channelSettings) {
      return {
        postType: plan.postType,
        channels: plan.channels,
        channelSettings: plan.channelSettings,
      };
    }
  }
  throw new Error(
    `no accepted week under ${plansDir} carries channels to inherit — ` +
      'run "npm run channels" and add them to a week first',
  );
}

function weekIdFor(weekNumber, year = 2026) {
  return `${year}-w${String(weekNumber).padStart(2, "0")}`;
}

export function buildWeek(source, delivery) {
  const { week: weekNumber, year = 2026, items } = source;
  const weekId = weekIdFor(weekNumber, year);

  if (items.length % POSTS_PER_DAY !== 0) {
    throw new Error(`${weekId}: ${items.length} items is not a whole number of days`);
  }
  const full = items.length === DAYS_PER_WEEK * POSTS_PER_DAY;

  const built = items.map((item, index) => {
    const day = Math.floor(index / POSTS_PER_DAY) + 1;
    const slot = SLOTS[index % POSTS_PER_DAY];
    const runtime = RUNTIME[item.template];

    if (runtime === undefined) {
      throw new Error(`${weekId} item ${index}: unknown template "${item.template}"`);
    }
    if (!item.sourceId) {
      throw new Error(`${weekId} item ${index}: every script needs a sourceId`);
    }

    return {
      id: `w${weekNumber}-d${String(day).padStart(2, "0")}-${slot}`,
      sourceId: item.sourceId,
      template: item.template,
      caption: item.caption,
      props: {
        eyebrow: item.props.eyebrow ?? EYEBROW[item.template],
        day,
        durationInSeconds: item.props.durationInSeconds ?? runtime,
        ...item.props,
      },
    };
  });

  return {
    series: SERIES,
    mode: "queue",
    week: {
      id: weekId,
      // The validator derives this from the id and rejects a mismatch, so it is
      // computed rather than written down.
      order: Number(`${year}${String(weekNumber).padStart(2, "0")}`),
      // 30 days is four weeks and a two-day remainder. A short final week says
      // so explicitly; without it the 28-item rule reads it as under-filled.
      ...(full ? {} : { partial: true }),
    },
    postType: delivery.postType,
    channels: delivery.channels,
    channelSettings: delivery.channelSettings,
    items: built,
  };
}

export async function buildCampaign({ sourceDir = SOURCE_DIR, outDir = OUT_DIR } = {}) {
  const names = (await readdir(sourceDir)).filter((name) => name.endsWith(".json")).sort();
  if (names.length === 0) throw new Error(`no campaign scripts under ${sourceDir}`);

  const delivery = await inheritDelivery(outDir);
  const written = [];

  for (const name of names) {
    const source = JSON.parse(await readFile(path.join(sourceDir, name), "utf8"));
    const plan = buildWeek(source, delivery);
    written.push({
      path: path.join(outDir, `${plan.week.id}.json`),
      json: `${JSON.stringify(plan, null, 2)}\n`,
      count: plan.items.length,
      weekId: plan.week.id,
    });
  }

  return written;
}

/**
 * Whether a plan on disk already matches what its scripts generate.
 *
 * Line endings are normalised before comparing, which is not tidiness: this
 * repository is worked on from Windows, git's `autocrlf` rewrites these files
 * to CRLF on checkout, and the builder emits LF. A byte comparison therefore
 * reported all five plans as out of date immediately after any checkout or
 * rebase — on a Linux runner it passed and on the author's machine it failed,
 * which is the worst possible shape for a validation gate.
 *
 * What the check is actually for is content drift: someone editing plans/ by
 * hand instead of editing the scripts. That survives normalisation intact.
 */
const sameContent = (a, b) => a.replace(/\r\n/g, "\n") === b.replace(/\r\n/g, "\n");

async function main() {
  const check = process.argv.includes("--check");
  const written = await buildCampaign();

  let stale = 0;
  for (const file of written) {
    let existing = null;
    try {
      existing = await readFile(file.path, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    if (existing !== null && sameContent(existing, file.json)) {
      console.log(`  ${file.path}  ${file.count} items (unchanged)`);
      continue;
    }

    stale += 1;
    if (check) {
      console.error(`  ${file.path}  DIFFERS from its source scripts`);
      continue;
    }
    await writeFile(file.path, file.json);
    console.log(`  ${file.path}  ${file.count} items (written)`);
  }

  const total = written.reduce((sum, file) => sum + file.count, 0);

  if (check && stale) {
    console.error(
      `\n${stale} plan(s) are out of date. Run "node scripts/build-campaign.mjs" and commit the result.`,
    );
    process.exit(1);
  }

  console.log(`\n${total} videos across ${written.length} week(s), ${total / POSTS_PER_DAY} days.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
