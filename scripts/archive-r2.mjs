import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { deleteObject, listObjects, putObject, r2ConfigFromEnv } from "./r2.mjs";
import { weekIdOf } from "./week-id.mjs";

/**
 * Cold archive on Cloudflare R2, with a hard storage budget.
 *
 * R2's free tier allows 10 GB-month of storage. This keeps the bucket under a
 * self-imposed 8 GB so a month can never end in a bill, leaving headroom for
 * the fact that R2 bills on peak usage during the month rather than on the
 * figure at the end of it.
 *
 * The budget is enforced by deleting the oldest videos before uploading a new
 * one, so the bucket behaves as a rolling window rather than an unbounded
 * archive. Nothing is lost that matters: the GitHub Release is the permanent
 * copy, and this is a second line of defence.
 */

/** Two gigabytes below the free allowance, so a busy month cannot overshoot. */
export const BUDGET_BYTES = 8 * 1024 ** 3;

/**
 * Objects live under a week prefix so pruning is chronological by key.
 *
 * The week is validated rather than interpolated. Unlike GitHub, S3 accepts
 * "[object Object]/d01-c.mp4" without complaint — every week would collapse
 * into one prefix and the chronological ordering this eviction depends on
 * would quietly stop being chronological.
 */
export const keyFor = (weekId, id) => `${weekIdOf(weekId, "R2 keyFor(weekId)")}/${id}.mp4`;

/**
 * Which objects to remove so that `incoming` bytes fit inside the budget.
 * Oldest first, and it never proposes deleting more than it has to.
 */
export function selectForEviction(objects, incomingBytes, budget = BUDGET_BYTES) {
  const used = objects.reduce((total, object) => total + object.size, 0);
  let over = used + incomingBytes - budget;
  if (over <= 0) return [];

  // Oldest first. lastModified is ISO 8601, so lexical order is chronological.
  const oldest = [...objects].sort((a, b) =>
    String(a.lastModified).localeCompare(String(b.lastModified)),
  );

  const evict = [];
  for (const object of oldest) {
    if (over <= 0) break;
    evict.push(object);
    over -= object.size;
  }
  return evict;
}

export async function archiveToR2({
  file,
  item,
  weekId,
  env = process.env,
  budget = BUDGET_BYTES,
} = {}) {
  const config = r2ConfigFromEnv(env);
  if (!config) {
    return { skipped: true, reason: "R2 is not configured" };
  }

  const body = await readFile(file);
  const key = keyFor(weekId, item.id);

  const existing = await listObjects(config);
  // Re-uploading the same id replaces it, so its current size is not "incoming".
  const replacing = existing.find((object) => object.key === key);
  const others = existing.filter((object) => object.key !== key);

  const evicted = [];
  for (const object of selectForEviction(others, body.length, budget)) {
    await deleteObject(config, object.key);
    evicted.push(object.key);
  }

  await putObject(config, key, body, "video/mp4");

  const usedAfter =
    others
      .filter((object) => !evicted.includes(object.key))
      .reduce((total, object) => total + object.size, 0) + body.length;

  return {
    skipped: false,
    key,
    bytes: body.length,
    replaced: Boolean(replacing),
    evicted,
    usedBytes: usedAfter,
    budgetBytes: budget,
    usedFraction: usedAfter / budget,
  };
}

/** Current bucket usage, for reporting without uploading anything. */
export async function r2Usage(env = process.env) {
  const config = r2ConfigFromEnv(env);
  if (!config) return null;

  const objects = await listObjects(config);
  const used = objects.reduce((total, object) => total + object.size, 0);
  return {
    objects: objects.length,
    usedBytes: used,
    budgetBytes: BUDGET_BYTES,
    usedFraction: used / BUDGET_BYTES,
  };
}

const gb = (bytes) => `${(bytes / 1024 ** 3).toFixed(2)} GB`;

async function main() {
  const usage = await r2Usage();
  if (!usage) {
    console.log("R2 is not configured — set R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
    return;
  }
  console.log(
    `${usage.objects} object(s), ${gb(usage.usedBytes)} of ${gb(usage.budgetBytes)} ` +
      `(${(usage.usedFraction * 100).toFixed(1)}%)`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

export { path };
