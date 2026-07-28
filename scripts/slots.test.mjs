import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertWithinEmbargo,
  describeSlot,
  FIRST_SLOT_ISO,
  nextSlot,
  slotAt,
} from "./slots.mjs";

/**
 * The embargo is the whole point of this module: nothing may appear before
 * 25 August 2026. These tests hold that from both directions — the arithmetic
 * that hands out slots, and the guard that refuses to send an early one even
 * if the arithmetic is wrong.
 */

const FIRST = "2026-08-25T09:00:00+05:45";
const HOUR = 3_600_000;
const opts = { firstSlot: FIRST, gapHours: 6, leadMs: 0 };

/** Well before the embargo — where the factory actually is while rendering. */
const JULY = Date.parse("2026-07-29T10:00:00+05:45");

/**
 * Kathmandu wall clock, in a form that does not move with the ICU version.
 * describeSlot's own output uses localised month names ("Sept" on one Node
 * build, "Sep" on another), which is fine to read and no good to assert on.
 */
const wall = (value) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value instanceof Date ? value : new Date(value));

const scheduled = (...isos) => ({ posted: [], scheduled: isos.map((at, i) => ({ id: `d0${i}-a`, at })) });

test("the configured first slot is 25 August, and the default matches it", () => {
  assert.equal(FIRST_SLOT_ISO, FIRST);
  assert.equal(slotAt(0, opts).toISOString(), "2026-08-25T03:15:00.000Z");
  assert.equal(wall(slotAt(0, opts)), "2026-08-25, 09:00");
  assert.match(describeSlot(slotAt(0, opts)), /25 Sep|25 Aug/);
});

test("the grid is four a day, six hours apart, aligned to the first slot", () => {
  const times = [0, 1, 2, 3, 4].map((i) => wall(slotAt(i, opts)));
  assert.deepEqual(times, [
    "2026-08-25, 09:00",
    "2026-08-25, 15:00",
    "2026-08-25, 21:00",
    "2026-08-26, 03:00",
    "2026-08-26, 09:00",
  ]);

  // Exactly four slots land in any 24 hours.
  assert.equal(slotAt(4, opts) - slotAt(0, opts), 24 * HOUR);
});

test("the first video scheduled lands on slot 0, however early it is rendered", () => {
  const at = nextSlot({ posted: [] }, { ...opts, now: JULY });
  assert.equal(at.toISOString(), slotAt(0, opts).toISOString());
  assert.ok(at.getTime() >= Date.parse(FIRST), "never before the embargo");
});

test("each subsequent video takes the next free slot, six hours on", () => {
  let state = { posted: [], scheduled: [] };
  const handed = [];

  for (let i = 0; i < 5; i += 1) {
    const at = nextSlot(state, { ...opts, now: JULY });
    handed.push(at.toISOString());
    state = { ...state, scheduled: [...state.scheduled, { id: `d0${i}-a`, at: at.toISOString() }] };
  }

  assert.deepEqual(
    handed,
    [0, 1, 2, 3, 4].map((i) => slotAt(i, opts).toISOString()),
    "consecutive publishes must not collide or skip",
  );
});

test("a retry after a failed state write cannot hand out a slot twice", () => {
  const state = scheduled(slotAt(0, opts).toISOString());
  const first = nextSlot(state, { ...opts, now: JULY });
  const retry = nextSlot(state, { ...opts, now: JULY });

  assert.equal(first.toISOString(), retry.toISOString(), "same state, same answer");
  assert.equal(first.toISOString(), slotAt(1, opts).toISOString(), "and it is the next one, not slot 0");
});

test("slots are read from committed state, so order does not depend on array order", () => {
  const state = scheduled(
    slotAt(2, opts).toISOString(),
    slotAt(0, opts).toISOString(),
    slotAt(1, opts).toISOString(),
  );
  assert.equal(nextSlot(state, { ...opts, now: JULY }).toISOString(), slotAt(3, opts).toISOString());
});

test("an idle factory snaps forward onto the grid instead of dumping a backlog", () => {
  // Three slots were used on the first day, then nothing for a week.
  const state = scheduled(
    slotAt(0, opts).toISOString(),
    slotAt(1, opts).toISOString(),
    slotAt(2, opts).toISOString(),
  );
  const now = Date.parse("2026-09-01T12:00:00+05:45");
  const at = nextSlot(state, { ...opts, now });

  assert.ok(at.getTime() > now, "never schedules into the past");
  // Still on the original grid — 09:00 / 15:00 / 21:00 / 03:00, not 12:00.
  assert.equal(wall(at), "2026-09-01, 15:00");
  assert.equal((at.getTime() - Date.parse(FIRST)) % (6 * HOUR), 0, "stays aligned to the grid");
});

test("a lead time keeps a slow handover from becoming an instant post", () => {
  const now = Date.parse(FIRST) - 60_000; // one minute before slot 0
  const at = nextSlot({ posted: [] }, { firstSlot: FIRST, gapHours: 6, leadMs: 10 * 60_000, now });

  assert.ok(at.getTime() >= now + 10 * 60_000, "at least the lead time in the future");
  assert.equal(at.toISOString(), slotAt(1, opts).toISOString());
});

test("the embargo guard refuses any date before 25 August", () => {
  assert.throws(
    () => assertWithinEmbargo(new Date("2026-08-24T23:59:00+05:45"), { firstSlot: FIRST }),
    /before the .* embargo/,
  );
  assert.throws(
    () => assertWithinEmbargo(new Date(), { firstSlot: FIRST }),
    /embargo/,
    "publishing 'now' while rendering in July must be refused",
  );

  // The boundary itself is allowed.
  assert.equal(
    assertWithinEmbargo(new Date(FIRST), { firstSlot: FIRST }).toISOString(),
    "2026-08-25T03:15:00.000Z",
  );
});

test('postType "now" is refused, because Postiz would ignore the date', () => {
  assert.throws(
    () => assertWithinEmbargo(slotAt(3, opts), { firstSlot: FIRST, postType: "now" }),
    /ignores the scheduled date/,
    "a valid future slot must still be refused if the type would publish on receipt",
  );

  assert.doesNotThrow(() =>
    assertWithinEmbargo(slotAt(3, opts), { firstSlot: FIRST, postType: "schedule" }),
  );
});

test("a missing or unparseable date is an error, never a silent 'now'", () => {
  for (const bad of [undefined, null, "", "not-a-date", NaN]) {
    assert.throws(
      () => assertWithinEmbargo(bad, { firstSlot: FIRST }),
      `${JSON.stringify(bad)} must not be treated as a publishable date`,
    );
  }
});

test("every slot the current 26-item queue will use is on or after the embargo", () => {
  let state = { posted: [], scheduled: [] };

  for (let i = 0; i < 26; i += 1) {
    const at = nextSlot(state, { ...opts, now: JULY });
    assert.doesNotThrow(() => assertWithinEmbargo(at, { firstSlot: FIRST, postType: "schedule" }));
    state = { ...state, scheduled: [...state.scheduled, { id: `d${i}-a`, at: at.toISOString() }] };
  }

  // 26 videos, four a day, starting 25 August: the last lands on 31 August.
  assert.equal(wall(slotAt(0, opts)), "2026-08-25, 09:00");
  assert.equal(wall(slotAt(25, opts)), "2026-08-31, 15:00");
});

/**
 * The guards above only hold if every publishing path actually goes through
 * them. `scripts/render-all.mjs` carried a second, complete Postiz client —
 * its own upload, its own `POST /posts`, and `date: new Date()` — so none of
 * the embargo work in this module applied to it. These tests hold the
 * invariant that made the fix worth making: one publisher, one guard.
 */

const sourceOf = async (file) => readFile(new URL(file, import.meta.url), "utf8");

/**
 * Comments stripped, because these tests scan for code that must not exist and
 * the comments explaining why it must not exist quote it verbatim. Scanning the
 * prose would make documenting the bug the same as reintroducing it.
 */
const codeOf = async (file) =>
  (await sourceOf(file)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("publishVideo is the only thing in the repo that can create a post", async () => {
  const scripts = (await readdir(new URL(".", import.meta.url))).filter(
    (name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs"),
  );

  const senders = [];
  for (const name of scripts) {
    const source = await codeOf(name);
    // The Postiz endpoint that publishes. Reaching it anywhere other than
    // inside publishVideo means a post that skipped assertWithinEmbargo.
    if (/["'`]\/posts["'`]/.test(source)) senders.push(name);
  }

  assert.deepEqual(
    senders,
    ["postiz.mjs"],
    "only postiz.mjs may POST /posts — every other caller must use publishVideo, " +
      "which refuses a date before the embargo",
  );
});

test("no publishing path can fall back to posting at the current time", async () => {
  for (const name of ["postiz.mjs", "publish-one.mjs", "render-all.mjs", "render-batch.mjs"]) {
    const source = await codeOf(name);
    assert.equal(
      /date:\s*(new Date\(\)|Date\.now\(\))/.test(source),
      false,
      `${name} must not default a publish date to "now" — that is how an embargoed post escapes`,
    );
  }
});
