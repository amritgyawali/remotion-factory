import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnvFile } from "./env.mjs";
import { assertConfigured, jobSummary, listIntegrations, notify, publishVideo } from "./postiz.mjs";
import {
  approvalOf,
  buffered,
  getArchivedQueue,
  loadQueueState,
  markArchivedPosted,
  publishable,
  QUEUE_LOW_WATER,
  requiresApproval,
} from "./queue.mjs";
import { describeSlot, FIRST_SLOT_ISO, nextSlot } from "./slots.mjs";

/**
 * Send one already-rendered video to Postiz.
 *
 * This is the second half of the split: the render workflow parked a finished
 * master in the week's GitHub Release, and this hands the oldest one still
 * waiting to Postiz. It downloads a finished master rather than making one, so
 * a publish is about a minute instead of six — and a Postiz outage costs a
 * retry rather than a wasted render.
 *
 * It does not publish immediately. Each video is given a slot on the six-hourly
 * grid that starts at the embargo date (scripts/slots.mjs) and Postiz is asked
 * to hold it until then, so GitHub's unreliable scheduler affects when a video
 * is handed over, never when it appears.
 *
 *   node scripts/publish-one.mjs [--dry-run]
 */

loadEnvFile();

const OUT = "out";
const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

/**
 * Fetch the master and check it is byte-identical to what was archived.
 *
 * The hash matters: this file has crossed a network and six hours since it was
 * verified, and publishing a truncated download to five real accounts is not
 * something to discover afterwards.
 */
async function fetchMaster(entry) {
  const target = path.join(OUT, `${entry.id}.mp4`);

  const response = await fetch(entry.url, {
    headers: process.env.GITHUB_TOKEN
      ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/octet-stream" }
      : { Accept: "application/octet-stream" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`could not download ${entry.id} from ${entry.url} (${response.status})`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(target, bytes);

  if (entry.sha256) {
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== entry.sha256) {
      throw new Error(
        `${entry.id} downloaded but its hash does not match the archive ` +
          `(expected ${entry.sha256.slice(0, 12)}, got ${actual.slice(0, 12)})`,
      );
    }
  }

  console.log(`  fetched ${(bytes.length / 1e6).toFixed(1)} MB, hash verified`);
  return target;
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const state = await loadQueueState();
  const waiting = publishable(state);

  if (waiting.length === 0) {
    // Distinguish "nothing rendered" from "rendered but nobody approved it".
    // They look identical from the outside and need opposite responses.
    const inBuffer = buffered(state);
    const awaitingReview = inBuffer.filter((entry) => approvalOf(entry) === "pending");
    const rejected = inBuffer.filter((entry) => approvalOf(entry) === "rejected");

    const message =
      awaitingReview.length && requiresApproval()
        ? `${awaitingReview.length} video(s) rendered and waiting for approval: ` +
          `${awaitingReview.map((entry) => entry.id).join(", ")}. Approve one in the dashboard to publish it.`
        : rejected.length && inBuffer.length === rejected.length
          ? `Every buffered video is rejected (${rejected.map((entry) => entry.id).join(", ")}). ` +
            "Discard them in the dashboard so the next batch re-renders."
          : "Nothing rendered is waiting to post. The render workflow adds one every six hours.";

    console.log(message);
    await jobSummary(`## Publish\n\n${message}`);
    return;
  }

  // Oldest first, so the queue order the plan defines is the order that ships.
  const entry = waiting[0];
  const queue = await getArchivedQueue();
  const planned = queue.pendingEntries.find((candidate) => candidate.item.id === entry.id);

  if (!planned) {
    throw new Error(
      `${entry.id} is queued to publish but no accepted week contains it — ` +
        "state.json and plans/ have diverged",
    );
  }

  // Assigned before anything is uploaded, so a dry run reports the real slot
  // and a failure part-way through does not consume one.
  const slot = nextSlot(state);

  console.log(`Publishing ${entry.id} (${entry.template}) from ${entry.week}`);
  console.log(`  slot: ${describeSlot(slot)} Kathmandu (${slot.toISOString()})`);

  if (DRY_RUN) {
    console.log("DRY RUN — nothing sent to Postiz, state.json untouched");
    return;
  }

  assertConfigured();
  const integrations = await listIntegrations();
  const file = await fetchMaster(entry);

  const sent = await publishVideo({
    file,
    item: planned.item,
    plan: planned.plan,
    integrations,
    date: slot,
  });
  console.log(`  scheduled in Postiz as ${planned.plan.postType} for ${sent.readable}`);

  let remaining = "unknown";
  try {
    const after = await markArchivedPosted(entry.id, { scheduledFor: sent.scheduledFor });
    remaining = String(after.remaining);
    console.log(`  marked posted, ${after.remaining} item(s) remain in the plan`);
  } catch (error) {
    // Postiz already has it. Failing loudly is right, but the message has to
    // say so, or a retry double-posts.
    throw new Error(`Postiz accepted ${entry.id}, but state.json was not updated: ${error.message}`);
  }

  const stillWaiting = publishable(await loadQueueState()).length;
  const summary =
    `Scheduled ${entry.id} as ${planned.plan.postType} for ${sent.readable} Kathmandu.\n` +
    `${stillWaiting} rendered video(s) still waiting, ${remaining} left in the plan.`;

  console.log(`\n${summary}`);
  await jobSummary(`## Published\n\n\`\`\`\n${summary}\n\`\`\``);
  await notify(`Weekly video factory\n${summary}`);

  if (Number(remaining) <= QUEUE_LOW_WATER) {
    const warning = `Queue low: ${remaining} item(s) left`;
    console.warn(process.env.GITHUB_ACTIONS ? `::warning::${warning}` : `warning  ${warning}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (error) => {
    console.error(error);
    await jobSummary(`## Publish failed\n\n\`\`\`\n${error.message}\n\`\`\``);
    await notify(`Publish failed:\n${error.message}`);
    process.exit(1);
  });
}
