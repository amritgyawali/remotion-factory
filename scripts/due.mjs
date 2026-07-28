/**
 * Decides whether this run should publish, so the schedule can be attempted
 * far more often than four times a day without posting more than four times.
 *
 * GitHub's scheduled runs are best effort. On this repo one fired 90 minutes
 * late and the next was dropped entirely, which is normal for a free public
 * repo and not something a cron expression can fix. The workflow therefore
 * tries every two hours and this gate keeps the actual rate at four a day:
 * a run publishes only once MIN_GAP_HOURS have passed since the last post.
 *
 * Posting at 00:00 permits the next at 05:00, which the 06:00 attempt takes;
 * if GitHub drops that one, 08:00 catches it. The cadence self-corrects back
 * onto the grid instead of drifting.
 *
 *   node scripts/due.mjs [--github-output] [--force]
 */
import { pathToFileURL } from "node:url";
import { loadQueueState } from "./queue.mjs";

const MIN_GAP_HOURS = Number(process.env.MIN_GAP_HOURS ?? 5);

export function publishDecision(state, { now = Date.now(), minGapHours = MIN_GAP_HOURS } = {}) {
  if (!state.lastPostedAt) {
    return { due: true, reason: "nothing has been posted yet" };
  }

  const last = Date.parse(state.lastPostedAt);
  const elapsedHours = (now - last) / 3_600_000;

  if (elapsedHours < 0) {
    // A clock skew or a hand-edited timestamp. Publishing on a future stamp
    // would post every attempt until the clock caught up.
    return {
      due: false,
      reason: `lastPostedAt (${state.lastPostedAt}) is in the future — refusing to publish until it passes`,
    };
  }
  if (elapsedHours >= minGapHours) {
    return {
      due: true,
      reason: `${elapsedHours.toFixed(1)}h since the last post, gap is ${minGapHours}h`,
    };
  }

  return {
    due: false,
    reason: `only ${elapsedHours.toFixed(1)}h since the last post — next slot opens in ${(
      minGapHours - elapsedHours
    ).toFixed(1)}h`,
  };
}

async function main() {
  const force = process.argv.includes("--force");
  const state = await loadQueueState();
  const decision = force
    ? { due: true, reason: "forced by a manual run" }
    : publishDecision(state);

  if (process.argv.includes("--github-output")) {
    process.stdout.write(`due=${decision.due ? "1" : "0"}\nreason=${decision.reason}\n`);
    return;
  }

  console.log(`${decision.due ? "due" : "not due"} — ${decision.reason}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
