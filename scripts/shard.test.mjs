import assert from "node:assert/strict";
import test from "node:test";
import { mergeRendered } from "./merge-shards.mjs";
import { MAX_SHARDS, shardItems } from "./shard-plan.mjs";

/**
 * Splitting the work and putting it back together.
 *
 * Both halves fail expensively and quietly. A split that drops an id renders
 * 119 videos and reports success; a merge that drops an entry leaves a finished
 * master in a Release with nothing on main pointing at it, which looks exactly
 * like a video that was never rendered.
 */

const ids = (count, prefix = "v") =>
  Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(3, "0")}`);

test("every id lands in exactly one shard", () => {
  for (const count of [1, 7, 28, 120, 121]) {
    for (const shards of [1, 3, 10, 20]) {
      const matrix = shardItems(ids(count), shards);
      const dealt = matrix.flatMap((shard) => shard.ids.split(","));

      assert.equal(dealt.length, count, `${count} ids across ${shards} shards`);
      assert.equal(new Set(dealt).size, count, "no id is dealt twice");
      assert.deepEqual([...dealt].sort(), [...ids(count)].sort(), "no id is lost");
    }
  }
});

test("shards stay within one video of each other", () => {
  // Wall clock for the whole campaign is the largest shard, so an uneven deal
  // is wasted parallelism: nineteen runners finishing early while one carries
  // the remainder.
  const matrix = shardItems(ids(120), 20);
  const sizes = matrix.map((shard) => shard.size);
  assert.equal(Math.max(...sizes) - Math.min(...sizes), 0, "120 across 20 divides evenly");

  const uneven = shardItems(ids(121), 20).map((shard) => shard.size);
  assert.ok(Math.max(...uneven) - Math.min(...uneven) <= 1, "a remainder costs at most one video");
});

test("consecutive videos are dealt to different shards", () => {
  // The plan groups templates by day and a 22-second SiteRoast is about 40%
  // more render than a 15-second DevJoke. Contiguous blocks let one shard draw
  // a run of long videos; dealing round-robin mixes the lengths.
  const matrix = shardItems(ids(40), 8);
  const owners = new Map();
  matrix.forEach((shard) => shard.ids.split(",").forEach((id) => owners.set(id, shard.name)));

  const ordered = ids(40);
  for (let i = 1; i < ordered.length; i += 1) {
    assert.notEqual(
      owners.get(ordered[i]),
      owners.get(ordered[i - 1]),
      `${ordered[i]} and its neighbour share a shard`,
    );
  }
});

test("never asks for more runners than GitHub will give", () => {
  const matrix = shardItems(ids(120), 500);
  assert.equal(matrix.length, MAX_SHARDS);
  assert.equal(
    matrix.flatMap((shard) => shard.ids.split(",")).length,
    120,
    "clamping the shard count must not drop work",
  );
});

test("empty shards are never emitted", () => {
  // A matrix entry with no ids still costs a runner, a checkout and an install
  // to render nothing.
  const matrix = shardItems(ids(3), 10);
  assert.equal(matrix.length, 3);
  assert.ok(matrix.every((shard) => shard.size > 0));
  assert.deepEqual(shardItems([], 10), []);
});

test("merging shard buffers keeps every rendered entry", () => {
  const base = [{ id: "a", renderedAt: "2026-08-01T00:00:00.000Z" }];
  const shardOne = [{ id: "b", renderedAt: "2026-08-01T01:00:00.000Z" }];
  const shardTwo = [{ id: "c", renderedAt: "2026-08-01T02:00:00.000Z" }];

  const merged = mergeRendered(mergeRendered(base, shardOne), shardTwo);
  assert.deepEqual(
    merged.map((entry) => entry.id),
    ["a", "b", "c"],
    "twenty parallel jobs each add their own entries",
  );
});

test("a re-rendered id keeps the newer master, not both", () => {
  // Two pointers to one id would have the publisher post it twice.
  const merged = mergeRendered(
    [{ id: "a", url: "old", renderedAt: "2026-08-01T00:00:00.000Z" }],
    [{ id: "a", url: "new", renderedAt: "2026-08-02T00:00:00.000Z" }],
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].url, "new", "the later render is the one in the Release");
});

test("merging is order-independent", () => {
  // Artifacts download in whatever order they finished, which is not the order
  // the shards were dispatched in.
  const a = [{ id: "a", renderedAt: "2026-08-01T00:00:00.000Z" }];
  const b = [{ id: "b", renderedAt: "2026-08-01T01:00:00.000Z" }];

  assert.deepEqual(
    mergeRendered(a, b).map((entry) => entry.id),
    mergeRendered(b, a).map((entry) => entry.id),
  );
});

test("entries without an id are dropped rather than merged", () => {
  // A shard that failed mid-write can leave a malformed entry. loadQueueState
  // would reject the whole file on the next run, which turns one bad shard into
  // a broken pipeline.
  const merged = mergeRendered([{ id: "a" }], [{ url: "orphan" }, null]);
  assert.deepEqual(merged.map((entry) => entry.id), ["a"]);
});
