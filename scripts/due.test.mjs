import assert from "node:assert/strict";
import test from "node:test";
import { publishDecision } from "./due.mjs";

const HOUR = 3_600_000;
const now = Date.parse("2026-07-28T12:00:00.000Z");
const ago = (hours) => new Date(now - hours * HOUR).toISOString();

test("a queue that has never posted is due", () => {
  const decision = publishDecision({ posted: [] }, { now });
  assert.equal(decision.due, true);
});

test("holds the rate at four a day when every attempt is on time", () => {
  // Attempted every two hours; only the attempts past the gap may publish.
  const attempts = [2, 4, 6, 8].map((elapsed) =>
    publishDecision({ lastPostedAt: ago(elapsed) }, { now, minGapHours: 5 }),
  );
  assert.deepEqual(
    attempts.map((d) => d.due),
    [false, false, true, true],
  );
});

test("a dropped scheduled run is caught by the next attempt, not lost", () => {
  // GitHub skipped the slot at the 6h mark; the 8h attempt still publishes.
  const missed = publishDecision({ lastPostedAt: ago(8) }, { now, minGapHours: 5 });
  assert.equal(missed.due, true);
  assert.match(missed.reason, /8\.0h since the last post/);
});

test("the boundary is inclusive so an exactly-on-time attempt is not skipped", () => {
  const decision = publishDecision({ lastPostedAt: ago(5) }, { now, minGapHours: 5 });
  assert.equal(decision.due, true);
});

test("a future timestamp blocks publishing instead of firing every attempt", () => {
  const decision = publishDecision({ lastPostedAt: ago(-3) }, { now });
  assert.equal(decision.due, false);
  assert.match(decision.reason, /in the future/);
});

test("not-due explains when the next slot opens", () => {
  const decision = publishDecision({ lastPostedAt: ago(1.5) }, { now, minGapHours: 5 });
  assert.equal(decision.due, false);
  assert.match(decision.reason, /opens in 3\.5h/);
});
