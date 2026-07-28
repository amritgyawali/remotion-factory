import assert from "node:assert/strict";
import test from "node:test";
import { archivedQueueSnapshot } from "./queue.mjs";
import { keyFor } from "./archive-r2.mjs";
import { weekIdOf, weekIdOrNull } from "./week-id.mjs";

/**
 * The regression guard for the failure that lost a whole morning's renders.
 *
 * Four videos rendered successfully, then every one of them failed to archive
 * with the same 422:
 *
 *   Could not create release "videos-[object Object]" (422)
 *   tag_name is not a valid tag
 *
 * The cause was one word. `archivedQueueSnapshot` puts the plan's week object
 * on each entry as `.week`, and render-batch.mjs destructured `week` and passed
 * it where a week *id* was expected. Nothing in the suite covered the wiring
 * between the queue and the archives, so it shipped.
 *
 * These tests hold the two halves of the contract: the queue publishes a
 * string, and every archive refuses anything that is not one.
 */

const week = (id, order) => ({ id, order });

function weekFixture(id, order, itemIds) {
  return {
    path: `plans/${id}.json`,
    plan: {
      mode: "queue",
      postType: "schedule",
      week: week(id, order),
      items: itemIds.map((itemId) => ({ id: itemId, template: "SiteRoast" })),
    },
    publishBlockers: [],
  };
}

test("a queue entry carries the week id as a string, not the week object", () => {
  const snapshot = archivedQueueSnapshot([weekFixture("2026-w31", 202631, ["d01-a", "d01-b"])], {
    posted: [],
  });

  for (const entry of snapshot.pendingEntries) {
    assert.equal(typeof entry.weekId, "string", `${entry.item.id} must expose a string weekId`);
    assert.equal(entry.weekId, "2026-w31");
  }

  // The object stays available under its own name for callers that read .order.
  assert.deepEqual(snapshot.pendingEntries[0].week, week("2026-w31", 202631));
  assert.equal(snapshot.nextWeekId, "2026-w31");
});

test("the exact value that produced videos-[object Object] is now a loud error", () => {
  const asObject = week("2026-w31", 202631);

  // The bug in one line: template interpolation was happy to do this.
  assert.equal(`videos-${asObject}`, "videos-[object Object]");

  // weekIdOf is not.
  assert.throws(() => weekIdOf(`${asObject}`, "release tag weekId"), {
    name: "TypeError",
    message: /not usable as a release tag/,
  });
});

test("a week object is accepted and unwrapped; junk is refused by name", () => {
  assert.equal(weekIdOf("2026-w31"), "2026-w31");
  assert.equal(weekIdOf(week("2026-w31", 202631)), "2026-w31");
  assert.equal(weekIdOf("unfiled"), "unfiled", "the render-all fallback stays legal");

  for (const bad of [null, undefined, "", 42, {}, { order: 1 }, [], { id: 7 }]) {
    assert.throws(
      () => weekIdOf(bad, "archiveVideo({ weekId })"),
      /archiveVideo\(\{ weekId \}\)/,
      `${JSON.stringify(bad)} must be rejected, and the message must name the caller`,
    );
  }
});

test("a week id that would escape its path segment is refused", () => {
  for (const bad of ["../etc", "2026 w31", "a/b", "-leading", ".hidden", "week#1"]) {
    assert.throws(() => weekIdOf(bad), /not usable as a release tag/, `${bad} must be rejected`);
  }
});

test("the R2 key builder validates rather than interpolating", () => {
  assert.equal(keyFor("2026-w31", "d01-c"), "2026-w31/d01-c.mp4");
  assert.equal(keyFor(week("2026-w31", 202631), "d01-c"), "2026-w31/d01-c.mp4");

  // S3 would have accepted "[object Object]/d01-c.mp4" and collapsed every
  // week into one prefix, breaking the chronological eviction order.
  assert.throws(() => keyFor(week(undefined, 1), "d01-c"), /R2 keyFor\(weekId\)/);
});

test("weekIdOrNull never throws, for display paths that must not fail a render", () => {
  assert.equal(weekIdOrNull(week("2026-w31", 1)), "2026-w31");
  assert.equal(weekIdOrNull({}), null);
  assert.equal(weekIdOrNull(undefined), null);
});
