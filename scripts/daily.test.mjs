import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { dailyRenderCount, markRendered, rendersToday, utcDay } from "./queue.mjs";

/**
 * Holding the daily rate when GitHub does not.
 *
 * The schedule fires four times a day and each run used to render exactly one
 * video. GitHub delays scheduled workflows under load and drops them outright
 * when it is busy enough, so that arrangement turns every dropped run into a
 * video that is never made up — the rate silently becomes three a day, and the
 * only symptom is a campaign that finishes late.
 *
 * These cover the arithmetic that fixes it, and the one thing that would
 * quietly break it again: counting from a buffer that posting drains.
 */

const stateFile = (state) => {
  const dir = mkdtempSync(path.join(tmpdir(), "daily-"));
  const file = path.join(dir, "state.json");
  writeFileSync(file, JSON.stringify({ posted: [], ...state }, null, 2));
  return file;
};

const read = (file) => JSON.parse(readFileSync(file, "utf8"));

test("a fresh day owes the full target", () => {
  assert.deepEqual(dailyRenderCount({ posted: [] }), {
    count: 4,
    reason: "first run of the day, target 4",
  });
});

test("each run renders only what the day still owes", () => {
  const now = Date.parse("2026-08-01T15:45:00.000Z");
  const after = (count) =>
    dailyRenderCount({ renderQuota: { day: "2026-08-01", count } }, { now }).count;

  assert.equal(after(1), 3, "one done, three to go");
  assert.equal(after(3), 1, "the last run of a normal day renders one");
  assert.equal(after(4), 0, "the day is finished");
  assert.equal(after(9), 0, "never negative, whatever the counter says");
});

test("a dropped run is absorbed by the next one", () => {
  // The whole point. Three scheduled runs were dropped; the 21:45 run renders
  // all four rather than one, and the day still lands on rate.
  const now = Date.parse("2026-08-01T21:45:00.000Z");
  const { count } = dailyRenderCount({ renderQuota: { day: "2026-08-01", count: 0 } }, { now });
  assert.equal(count, 4);
});

test("yesterday's quota does not suppress today's work", () => {
  // A stale counter that still looked current would render nothing, every run,
  // forever — the failure mode that is worse than the one being fixed.
  const state = { renderQuota: { day: "2026-07-31", count: 4 } };
  const now = Date.parse("2026-08-01T03:45:00.000Z");

  assert.equal(rendersToday(state, now), 0);
  assert.equal(dailyRenderCount(state, { now }).count, 4);
});

test("an explicit count always overrides the quota", () => {
  // A manual dispatch has to be able to ask for work the day does not owe,
  // otherwise the catch-up path removes the operator's only override.
  const state = { renderQuota: { day: utcDay(), count: 4 } };
  assert.deepEqual(dailyRenderCount(state, { explicit: 2 }), { count: 2, reason: "requested" });
  assert.equal(dailyRenderCount(state, { explicit: 0 }).count, 0, "zero is not an override");
  assert.equal(dailyRenderCount(state, { explicit: Number.NaN }).count, 0, "NaN falls through");
});

test("a corrupt counter is treated as no work done, not as done", () => {
  const now = Date.now();
  for (const count of [null, "3", -1, 1.5, undefined]) {
    assert.equal(
      rendersToday({ renderQuota: { day: utcDay(now), count } }, now),
      0,
      `count ${JSON.stringify(count)} must not be trusted`,
    );
  }
});

test("recording a render increments the day's counter", async () => {
  const file = stateFile({ rendered: [] });

  await markRendered({ id: "w33-d01-a", url: "https://example.test/a.mp4" }, { statePath: file });
  assert.equal(read(file).renderQuota.count, 1);

  await markRendered({ id: "w33-d01-b", url: "https://example.test/b.mp4" }, { statePath: file });
  const state = read(file);
  assert.equal(state.renderQuota.count, 2);
  assert.equal(state.renderQuota.day, utcDay());
  assert.equal(rendersToday(state), 2);
});

test("the counter survives posting draining the buffer", async () => {
  // The reason the quota is a counter and not a filter over `state.rendered`.
  // Posting removes entries from that array, so counting it would let a day
  // that had already rendered four render four more.
  const file = stateFile({ rendered: [] });
  await markRendered({ id: "w33-d01-a", url: "https://example.test/a.mp4" }, { statePath: file });
  await markRendered({ id: "w33-d01-b", url: "https://example.test/b.mp4" }, { statePath: file });

  // Simulate the publisher: the buffer empties, the counter must not.
  const drained = read(file);
  drained.rendered = [];
  writeFileSync(file, JSON.stringify(drained, null, 2));

  const state = read(file);
  assert.equal(state.rendered.length, 0, "the buffer is empty");
  assert.equal(rendersToday(state), 2, "but the day still knows it rendered two");
  assert.equal(dailyRenderCount(state).count, 2, "so it renders two more, not four");
});

test("a re-render counts against the day", async () => {
  // It spent the same runner minutes. The quota is a budget for the day's work,
  // not a count of distinct videos.
  const file = stateFile({ rendered: [] });
  await markRendered({ id: "w33-d01-a", url: "https://example.test/a.mp4" }, { statePath: file });
  await markRendered({ id: "w33-d01-a", url: "https://example.test/a2.mp4" }, { statePath: file });

  const state = read(file);
  assert.equal(state.rendered.length, 1, "one pointer, not two");
  assert.equal(rendersToday(state), 2, "but two renders were paid for");
});
