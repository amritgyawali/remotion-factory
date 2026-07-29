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

/** The four scheduled runs, by what they are in Kathmandu. */
const RUN = {
  "09:30": Date.parse("2026-08-01T03:45:00.000Z"),
  "15:30": Date.parse("2026-08-01T09:45:00.000Z"),
  "21:30": Date.parse("2026-08-01T15:45:00.000Z"),
  "03:30": Date.parse("2026-08-01T21:45:00.000Z"),
};

const quota = (count) => ({ posted: [], renderQuota: { day: "2026-08-01", count } });

test("a normal day renders one video per run, not four in the first", () => {
  // The regression this guards against is not hypothetical: an earlier version
  // owed `target - done`, so the 09:30 run made all four and the other three
  // runs made none. That silently undoes the reason there are four runs — a
  // batch shares one job's lifetime, so a runner killed at video three throws
  // away the rest of the day.
  assert.equal(dailyRenderCount(quota(0), { now: RUN["09:30"] }).count, 1);
  assert.equal(dailyRenderCount(quota(1), { now: RUN["15:30"] }).count, 1);
  assert.equal(dailyRenderCount(quota(2), { now: RUN["21:30"] }).count, 1);
  assert.equal(dailyRenderCount(quota(3), { now: RUN["03:30"] }).count, 1);
});

test("a day that is already on rate renders nothing more", () => {
  assert.equal(dailyRenderCount(quota(4), { now: RUN["03:30"] }).count, 0, "the day is finished");
  assert.equal(dailyRenderCount(quota(9), { now: RUN["03:30"] }).count, 0, "never negative");
  // Ahead of schedule — a manual run already made today's second video.
  assert.equal(dailyRenderCount(quota(2), { now: RUN["15:30"] }).count, 0);
});

test("a dropped run is absorbed by the next one", () => {
  // GitHub drops scheduled runs under load. The 09:30 run never fired, so by
  // 15:30 two slots have elapsed and nothing exists: render two.
  assert.equal(dailyRenderCount(quota(0), { now: RUN["15:30"] }).count, 2);
  // A whole day of drops, caught up by the last run.
  assert.equal(dailyRenderCount(quota(0), { now: RUN["03:30"] }).count, 4);
});

test("nothing is owed before the day's first slot", () => {
  const beforeAnyRun = Date.parse("2026-08-01T01:00:00.000Z");
  assert.equal(dailyRenderCount(quota(0), { now: beforeAnyRun }).count, 0);
});

test("yesterday's quota does not suppress today's work", () => {
  // A stale counter that still looked current would render nothing, every run,
  // forever — the failure mode that is worse than the one being fixed.
  const state = { posted: [], renderQuota: { day: "2026-07-31", count: 4 } };

  assert.equal(rendersToday(state, RUN["09:30"]), 0);
  assert.equal(dailyRenderCount(state, { now: RUN["09:30"] }).count, 1);
});

test("an explicit count always overrides the quota", () => {
  // A manual dispatch has to be able to ask for work the day does not owe,
  // otherwise the catch-up path removes the operator's only override.
  const state = { posted: [], renderQuota: { day: utcDay(), count: 4 } };
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
  // markRendered stamps the real current day, so the slot has to be today's.
  const secondSlot = Date.parse(`${utcDay()}T09:45:00.000Z`);

  assert.equal(state.rendered.length, 0, "the buffer is empty");
  assert.equal(rendersToday(state, secondSlot), 2, "but the day still knows it rendered two");
  assert.equal(
    dailyRenderCount(state, { now: secondSlot }).count,
    0,
    "so the second slot asks for nothing, rather than repeating the day",
  );
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
