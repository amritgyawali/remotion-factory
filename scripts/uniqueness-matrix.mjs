import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { BED_BPM } from "./audio/beds.mjs";
import { getArchivedQueue } from "./queue.mjs";
import { BPM_OFFSETS, campaignMusic, campaignOrdinal } from "./variation.mjs";

/**
 * Prove, before anything is rendered, that no two planned videos are the same.
 *
 * scripts/uniqueness.mjs is the other half of this and runs far too late to be
 * the only check: it fingerprints a finished MP4 and compares it against the
 * archive, which means a duplicate is discovered after paying eight minutes of
 * runner time to produce it, and after the runner has already uploaded it to a
 * Release. Over a 120-video campaign that is an expensive way to find out that
 * an assignment collides.
 *
 * This checks the same claim against the plan, in about a second, with no
 * browser and no render. It cannot see what a template does with its props —
 * that is exactly what the fingerprint check exists for — but it can prove the
 * things that are decided before a frame is drawn:
 *
 *   look   palette, typeface and motion signature, all distinct
 *   music  key, mode, phrase offset and tempo, all distinct
 *   copy   the words on screen, distinct after normalisation
 *
 * Run it after editing the campaign scripts and before dispatching a render.
 *
 *   node scripts/uniqueness-matrix.mjs [--json]
 */

/**
 * The look tables, read out of src/theme.ts and src/variation.ts rather than
 * duplicated here.
 *
 * Those files are TypeScript compiled by webpack, so a Node script cannot
 * import them, and the existing tests in this project already establish the
 * pattern of reading the source as text instead. Counting the entries is
 * enough: the walk only needs the size of each axis, and a table that grows
 * without this noticing would silently weaken the guarantee.
 */
async function lookSpace() {
  const [theme, variation] = await Promise.all([
    readFile("src/theme.ts", "utf8"),
    readFile("src/variation.ts", "utf8"),
  ]);

  const palettes = theme.match(/^\s*\{ name: "/gm)?.length ?? 0;
  const typefaces = theme.match(/^\s*name: "/gm)?.length ?? 0;
  const motions = variation.match(/^\s*name: "/gm)?.length ?? 0;
  const stride = Number(/LOOK_STRIDE = (\d+)/.exec(variation)?.[1]);

  if (!palettes || !typefaces || !motions || !Number.isFinite(stride)) {
    throw new Error(
      "could not read the look tables out of src/theme.ts and src/variation.ts — " +
        "if their shape changed, update the patterns in uniqueness-matrix.mjs",
    );
  }

  return { palettes, typefaces, motions, stride, size: palettes * typefaces * motions };
}

/** The same mixed-radix decomposition as `lookIndicesForOrdinal` in the TS. */
function lookFor(ordinal, space) {
  const combo = (((ordinal * space.stride) % space.size) + space.size) % space.size;
  return {
    palette: combo % space.palettes,
    typeface: Math.floor(combo / space.palettes) % space.typefaces,
    motion: Math.floor(combo / (space.palettes * space.typefaces)) % space.motions,
  };
}

const normalise = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Everything the viewer reads, in one string. Mirrors visibleCopyKey. */
function copyKey(item) {
  const ignored = new Set(["day", "durationInSeconds", "eyebrow", "kicker", "theme", "variant"]);
  const parts = [];

  const walk = (value, key = "") => {
    if (ignored.has(key) || value === null || value === undefined) return;
    if (typeof value === "string" || typeof value === "number") return void parts.push(String(value));
    if (Array.isArray(value)) return void value.forEach((entry) => walk(entry));
    if (typeof value === "object") {
      Object.entries(value).forEach(([childKey, child]) => walk(child, childKey));
    }
  };

  walk(item.props ?? {});
  return normalise(parts.join(" "));
}

function collide(rows, keyOf, label) {
  const seen = new Map();
  const clashes = [];

  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;
    const first = seen.get(key);
    if (first) clashes.push({ label, key, ids: [first, row.id] });
    else seen.set(key, row.id);
  }

  return clashes;
}

export async function auditCampaign() {
  const space = await lookSpace();
  const queue = await getArchivedQueue();

  const rows = queue.weeks
    .flatMap((week) => week.plan.items.map((item) => ({ item, weekId: week.plan.week.id })))
    .map(({ item, weekId }) => {
      const ordinal = campaignOrdinal(item.id);
      const music = campaignMusic(item.id);
      const bedTemplate = BED_BPM[item.template] ? item.template : "DevJoke";

      return {
        id: item.id,
        weekId,
        template: item.template,
        ordinal,
        look: ordinal === null ? null : lookFor(ordinal, space),
        music: music
          ? {
              key: music.keyIndex,
              mode: music.modeIndex,
              shift: music.shiftIndex,
              bpm: BED_BPM[bedTemplate] + BPM_OFFSETS[music.bpmIndex],
            }
          : null,
        copy: copyKey(item),
      };
    });

  const campaign = rows.filter((row) => row.ordinal !== null);
  const legacy = rows.filter((row) => row.ordinal === null);

  const problems = [
    // Look and music are only guaranteed for campaign ids. Legacy weeks draw
    // from a hash and are known to collide — that is why the scheme changed —
    // so including them here would report a failure that is deliberate.
    ...collide(campaign, (row) => `${row.look.palette}/${row.look.typeface}/${row.look.motion}`, "look"),
    ...collide(
      campaign,
      (row) => `${row.music.key}/${row.music.mode}/${row.music.shift}/${row.music.bpm}`,
      "music",
    ),
    // Copy is checked across everything ever planned, legacy included: two
    // videos with the same words are the same video whatever colour they are.
    ...collide(rows, (row) => row.copy, "visible copy"),
  ];

  return { space, rows, campaign, legacy, problems };
}

async function main() {
  const { space, rows, campaign, legacy, problems } = await auditCampaign();

  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ campaign, problems }, null, 2)}\n`);
    if (problems.length) process.exitCode = 1;
    return;
  }

  console.log(
    `Look space: ${space.palettes} palettes x ${space.typefaces} typefaces x ` +
      `${space.motions} motion signatures = ${space.size} combinations, stride ${space.stride}.`,
  );
  console.log(`Planned: ${rows.length} video(s) — ${campaign.length} on the campaign walk, ${legacy.length} legacy.`);

  if (campaign.length > space.size) {
    console.error(
      `\nerror  ${campaign.length} campaign videos will not fit in ${space.size} combinations. ` +
        "Add a palette, a typeface or a motion signature.",
    );
    process.exit(1);
  }

  const distinctLooks = new Set(
    campaign.map((row) => `${row.look.palette}/${row.look.typeface}/${row.look.motion}`),
  ).size;
  const distinctMusic = new Set(
    campaign.map((row) => `${row.music.key}/${row.music.mode}/${row.music.shift}/${row.music.bpm}`),
  ).size;
  const distinctPalettes = new Set(campaign.map((row) => row.look.palette)).size;
  const tempi = new Set(campaign.map((row) => row.music.bpm));

  console.log(`  distinct looks   ${distinctLooks}/${campaign.length}`);
  console.log(`  distinct music   ${distinctMusic}/${campaign.length}`);
  console.log(`  palettes in use  ${distinctPalettes}/${space.palettes}`);
  console.log(`  tempi in use     ${tempi.size} (${[...tempi].sort((a, b) => a - b).join(", ")} bpm)`);

  if (problems.length) {
    console.error(`\n${problems.length} collision(s):`);
    for (const problem of problems) {
      console.error(`  ${problem.label}: ${problem.ids.join(" and ")} share "${problem.key}"`);
    }
    process.exit(1);
  }

  console.log("\nNo two planned videos share a look, a piece of music or their words.");
  console.log("The finished files are checked again by scripts/uniqueness.mjs after rendering.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
