import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { listIntegrations, postiz, uploadToPostiz } from "./postiz.mjs";

/**
 * Upload one finished video to Postiz and schedule it at its exact slot.
 *
 * Two rules this file exists to make unbreakable:
 *
 *   1. `type` is always "schedule". Postiz treats "now" as publish-on-receipt
 *      and ignores the date entirely, so a single wrong string turns a November
 *      slot into an immediate post to every channel.
 *   2. The media path is whatever the upload call returned, and nothing else.
 *      A hand-written path produces a post that Postiz accepts and that renders
 *      as a broken attachment at publish time, hours after anyone was watching.
 *
 *   node scripts/schedule-one.mjs --id Day01A [--dry-run]
 */

/** Asia/Kathmandu is UTC+05:45 year round. No DST, so a fixed offset is exact. */
export const NEPAL_OFFSET_MINUTES = 5 * 60 + 45;

/**
 * The four daily slots, in Nepal local time, as minutes past midnight.
 * 12:30 am, 9:00 am, 4:00 pm, 9:00 pm.
 */
export const SLOTS_LOCAL = [
  { label: "12:30 am", minutes: 0 * 60 + 30 },
  { label: "9:00 am", minutes: 9 * 60 },
  { label: "4:00 pm", minutes: 16 * 60 },
  { label: "9:00 pm", minutes: 21 * 60 },
];

function argValue(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

/**
 * A Nepal-local wall-clock time as a real UTC instant.
 *
 * Built from Date.UTC and an explicit offset rather than a local Date, because
 * a local Date interprets the numbers in the *runner's* timezone — which is UTC
 * on GitHub and something else on a laptop, so the same command would schedule
 * two different times.
 */
export function nepalToUtc({ year, month, day, minutes }) {
  return new Date(Date.UTC(year, month - 1, day, 0, minutes - NEPAL_OFFSET_MINUTES, 0, 0));
}

/** Slot `index` counting from `startDate`, four a day, in plan order. */
export function slotForIndex(index, startDate = { year: 2026, month: 11, day: 1 }) {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`slot index must be a non-negative integer — got ${index}`);
  }
  const dayOffset = Math.floor(index / SLOTS_LOCAL.length);
  const slot = SLOTS_LOCAL[index % SLOTS_LOCAL.length];

  const at = nepalToUtc({
    year: startDate.year,
    month: startDate.month,
    day: startDate.day + dayOffset,
    minutes: slot.minutes,
  });

  return { at, label: slot.label, dayOffset };
}

/** What a human should read in the report, in the timezone they think in. */
export function describeNepal(when) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kathmandu",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(when);
}

export async function scheduleOne({
  id,
  file,
  caption,
  when,
  channels = "all",
  channelSettings = {},
  dryRun = false,
}) {
  if (!id) throw new Error("scheduleOne({ id }) is required");
  if (!caption) throw new Error(`${id} has no caption — refusing to post an empty body`);
  if (!(when instanceof Date) || Number.isNaN(when.getTime())) {
    throw new Error(`${id} has no valid scheduled date`);
  }

  // A date in the past is treated as "publish now" by most schedulers, which is
  // the same failure as postType "now" arriving by a different route.
  if (when.getTime() < Date.now() + 5 * 60 * 1000) {
    throw new Error(
      `refusing to schedule ${id} at ${when.toISOString()} — that is in the past ` +
        "or too close to now, and Postiz would publish it immediately",
    );
  }

  const target = file ?? path.join("out", `${id}.mp4`);

  // Refuse to post a file that has not been through verify-render.mjs. The
  // report is the evidence; its absence means the measurements never ran.
  const reportPath = path.join("out", `${id}.verify.json`);
  let report;
  try {
    report = JSON.parse(await readFile(reportPath, "utf8"));
  } catch {
    throw new Error(
      `${id} has no ${reportPath} — run scripts/verify-render.mjs before scheduling. ` +
        "Nothing gets posted that was not measured.",
    );
  }
  if (report.problems?.length) {
    throw new Error(`${id} failed verification and may not be posted:\n  - ${report.problems.join("\n  - ")}`);
  }

  const integrations = await listIntegrations();
  const live = integrations.filter((integration) => !integration.disabled);
  const wanted = channels === "all"
    ? live
    : live.filter((integration) => channels.includes(integration.id));

  if (wanted.length === 0) {
    throw new Error("no live Postiz channels to post to — run: npm run channels");
  }

  if (dryRun) {
    console.log(
      `DRY RUN ${id}\n` +
        `  file      ${target} (${report.frames} frames, ${report.duration}s)\n` +
        `  when      ${when.toISOString()}  =  ${describeNepal(when)} Nepal\n` +
        `  channels  ${wanted.map((i) => `${i.name} (${i.id})`).join(", ")}\n` +
        `  caption   ${caption.slice(0, 120)}${caption.length > 120 ? "…" : ""}`,
    );
    return { dryRun: true, scheduledFor: when.toISOString() };
  }

  // Upload first, then reference exactly what came back. `media.path` is the
  // only acceptable value here — see the header.
  const media = await uploadToPostiz(target);
  console.log(`uploaded ${id} -> media ${media.id} at ${media.path}`);

  const response = await postiz("/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // Never "now". See the header.
      type: "schedule",
      date: when.toISOString(),
      shortLink: false,
      tags: [],
      posts: wanted.map((integration) => ({
        integration: { id: integration.id },
        value: [{ content: caption, image: [{ id: media.id, path: media.path }] }],
        settings: {
          __type: integration.identifier,
          // Per-channel settings from plan.json, keyed by identifier or id.
          ...(channelSettings[integration.identifier] ?? {}),
          ...(channelSettings[integration.id] ?? {}),
        },
      })),
    }),
  });

  const postIds = Array.isArray(response)
    ? response.map((post) => post.id ?? post.postId).filter(Boolean)
    : [response?.id].filter(Boolean);

  console.log(
    `scheduled ${id}\n` +
      `  utc       ${when.toISOString()}\n` +
      `  nepal     ${describeNepal(when)}\n` +
      `  channels  ${wanted.length}\n` +
      `  post ids  ${postIds.join(", ") || "(none returned)"}`,
  );

  return {
    id,
    mediaId: media.id,
    mediaPath: media.path,
    postIds,
    scheduledFor: when.toISOString(),
    nepal: describeNepal(when),
    channels: wanted.map((integration) => integration.id),
  };
}

async function main() {
  const id = argValue("--id", process.env.COMPOSITION_ID);
  if (!id) throw new Error("--id <compositionId> is required");

  // The brief for this video: caption, and which slot it occupies.
  const briefPath = argValue("--brief", path.join("briefs", `${id}.json`));
  const brief = JSON.parse(await readFile(briefPath, "utf8"));

  const explicit = argValue("--at");
  const when = explicit ? new Date(explicit) : slotForIndex(brief.slotIndex).at;

  // Per-channel settings from plan.json — Instagram needs post_type, X needs
  // who_can_reply_post, etc. Missing the right key produces a 400 from Postiz.
  let channelSettings = {};
  try {
    const plan = JSON.parse(await readFile("plan.json", "utf8"));
    channelSettings = plan.channelSettings ?? {};
  } catch {
    // plan.json is optional — the defaults work for channels that need nothing.
  }

  await scheduleOne({
    id,
    caption: brief.caption,
    when,
    channels: brief.channels ?? "all",
    channelSettings,
    dryRun: process.argv.includes("--dry-run"),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
