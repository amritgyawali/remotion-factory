import { pathToFileURL } from "node:url";
import { getArchivedQueue } from "./queue.mjs";

/**
 * Split the pending queue into shards for a parallel render.
 *
 * Emits a matrix for .github/workflows/render-campaign.yml: one entry per
 * shard, each carrying the explicit list of ids that shard owns.
 *
 * Ids rather than an index range, deliberately. A range would be re-sliced
 * against whatever the queue looks like when the shard actually starts, and the
 * queue moves — the scheduled 03:45 render takes an item off it, and a retried
 * shard would then render a different set than it did the first time. Naming
 * the ids up front makes a shard idempotent: re-running it renders exactly what
 * it was asked to render, and render-shard.mjs skips anything that has already
 * been rendered or posted in the meantime.
 *
 *   node scripts/shard-plan.mjs --shards 10 [--limit 0] [--github-output]
 */

/** GitHub's ceiling for concurrent standard-runner jobs on the free plan. */
export const MAX_SHARDS = 20;

/**
 * Deal ids across shards round-robin rather than in contiguous blocks.
 *
 * Videos are not equally expensive: a 24-second SiteRoast is about 40% more
 * render than a 15-second DevJoke, and the plan groups templates by day. In
 * contiguous blocks one shard can draw a run of long videos and finish twenty
 * minutes after everything else, which sets the wall clock for the entire
 * campaign. Dealing them out mixes the lengths so the shards land together.
 */
export function shardItems(ids, shardCount) {
  const count = Math.max(1, Math.min(MAX_SHARDS, shardCount));
  const buckets = Array.from({ length: Math.min(count, ids.length) }, () => []);
  if (buckets.length === 0) return [];

  ids.forEach((id, index) => buckets[index % buckets.length].push(id));

  return buckets.map((bucket, index) => ({
    name: String(index + 1).padStart(2, "0"),
    ids: bucket.join(","),
    size: bucket.length,
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const valueOf = (flag, fallback) => {
    const at = args.indexOf(flag);
    if (at === -1) return fallback;
    const value = Number(args[at + 1]);
    return Number.isFinite(value) ? value : fallback;
  };

  const shards = valueOf("--shards", 10);
  const limit = valueOf("--limit", 0);
  const githubOutput = args.includes("--github-output");

  const queue = await getArchivedQueue();
  const pending = queue.pendingEntries.map((entry) => entry.item.id);
  const ids = limit > 0 ? pending.slice(0, limit) : pending;
  const matrix = shardItems(ids, shards);

  if (githubOutput) {
    // `empty` is a separate output rather than an empty matrix: a matrix of []
    // makes the render job succeed vacuously, and a campaign that rendered
    // nothing at all should not report green without saying so.
    process.stdout.write(
      [
        `matrix=${JSON.stringify(matrix)}`,
        `count=${ids.length}`,
        `empty=${ids.length === 0}`,
        "",
      ].join("\n"),
    );
    return;
  }

  if (ids.length === 0) {
    console.log("Nothing pending — the queue is empty or everything is already buffered.");
    return;
  }

  console.log(`${ids.length} pending video(s) across ${matrix.length} shard(s):`);
  for (const shard of matrix) {
    console.log(`  ${shard.name}  ${String(shard.size).padStart(3)} video(s)  ${shard.ids}`);
  }
  const largest = Math.max(...matrix.map((shard) => shard.size));
  console.log(
    `\nWall clock is set by the largest shard: ${largest} video(s), ` +
      `roughly ${largest * 10}-${largest * 14} minutes.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
