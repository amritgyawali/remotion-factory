import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BPM_OFFSETS,
  CAMPAIGN_FIRST_WEEK,
  ITEMS_PER_WEEK,
  MUSIC_SPACE,
  MUSIC_STRIDE,
  campaignMusic,
  campaignOrdinal,
  musicIndicesForOrdinal,
} from "./variation.mjs";

/**
 * The campaign walk is the promise that no two of a month's videos look or
 * sound the same. It is arithmetic, so it can be proved rather than sampled —
 * and it needs to be, because the failure it replaces was silent: the old
 * hashed draw collided on roughly one video in six and nothing anywhere said so
 * until two finished files were compared.
 */

const tsSource = readFileSync("src/variation.ts", "utf8");
const jsSource = readFileSync("scripts/variation.mjs", "utf8");

/**
 * The ordinal is deliberately implemented twice — once in TypeScript for the
 * browser half, once in plain JS for the audio half — because one runs through
 * webpack and the other in bare Node. Two implementations that disagree would
 * give a video a look from one position and music from another, which is worse
 * than either scheme alone. Nothing in the type system connects them, so the
 * constants are compared here.
 */
test("both implementations of the ordinal agree on their constants", () => {
  const numberFrom = (source, name) => {
    const match = new RegExp(`${name} = (-?\\d+)`).exec(source);
    assert.ok(match, `${name} not found`);
    return Number(match[1]);
  };

  for (const name of ["CAMPAIGN_FIRST_WEEK", "DAYS_PER_WEEK"]) {
    assert.equal(
      numberFrom(tsSource, name),
      numberFrom(jsSource, name),
      `${name} differs between src/variation.ts and scripts/variation.mjs`,
    );
  }

  // SLOTS_PER_DAY and ITEMS_PER_WEEK are derived from this list on both sides,
  // so comparing the list covers them and the order it defines — slot order is
  // load-bearing, since it decides which ordinal each video gets.
  const slotsOf = (source) => /const SLOTS = (\[[^\]]*\])/.exec(source)?.[1].replace(/\s+/g, "");
  assert.equal(slotsOf(tsSource), slotsOf(jsSource), "the slot lists differ");

  // The id patterns have to match character for character: one accepting an id
  // the other rejects means a video silently falls back to the legacy hash on
  // exactly one of its two axes.
  const patternOf = (source) => /const CAMPAIGN_ID = (\/.*\/);/.exec(source)?.[1];
  assert.equal(patternOf(tsSource), patternOf(jsSource), "the id patterns differ");
});

test("ordinals are dense and consecutive across a campaign", () => {
  const ids = [];
  for (let week = 33; week <= 36; week += 1) {
    for (let day = 1; day <= 7; day += 1) {
      for (const slot of ["a", "b", "c", "d"]) {
        ids.push(`w${week}-d${String(day).padStart(2, "0")}-${slot}`);
      }
    }
  }

  const ordinals = ids.map(campaignOrdinal);
  assert.equal(ordinals.length, 112);
  assert.ok(ordinals.every((value) => value !== null), "every campaign id has an ordinal");

  // Consecutive is the property the walk depends on: a bijection over Z_n only
  // guarantees distinctness for a *contiguous* run of inputs.
  for (let i = 1; i < ordinals.length; i += 1) {
    assert.equal(ordinals[i], ordinals[i - 1] + 1, `gap before ${ids[i]}`);
  }
  assert.equal(ordinals[0], 33 * ITEMS_PER_WEEK);
});

test("ids that predate the campaign keep the legacy scheme", () => {
  // Week 31 is published and fingerprinted. Giving it a new look would mean a
  // re-render no longer matches the fingerprint already recorded for that id —
  // the exact alarm the duplicate detector exists to raise. Week 32 was excluded
  // for the same reason until its queued items were re-scripted from the source
  // PDF, which is why the boundary moved down to it.
  assert.equal(campaignOrdinal("d01-a"), null, "week 31's unprefixed ids");
  assert.notEqual(campaignOrdinal("w32-d01-a"), null, "week 32 walks");
  assert.equal(campaignOrdinal(`w${CAMPAIGN_FIRST_WEEK - 1}-d01-a`), null);
  assert.notEqual(campaignOrdinal(`w${CAMPAIGN_FIRST_WEEK}-d01-a`), null);

  // Anything that is not a campaign id at all.
  for (const id of ["", "recap-preview", "probe-DevJoke", "w33-d08-a", "w33-d01-e"]) {
    assert.equal(campaignOrdinal(id), null, `"${id}" is not a campaign position`);
  }
});

test("the music walk is a bijection over its whole space", () => {
  // If the stride shares a factor with the space the walk short-cycles, and the
  // guarantee quietly degrades from "no repeats" to "no repeats for a while".
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  assert.equal(gcd(MUSIC_STRIDE, MUSIC_SPACE), 1, "stride must be coprime to the space");

  const seen = new Set();
  for (let ordinal = 0; ordinal < MUSIC_SPACE; ordinal += 1) {
    const { keyIndex, modeIndex, shiftIndex, bpmIndex } = musicIndicesForOrdinal(ordinal);
    seen.add(`${keyIndex}/${modeIndex}/${shiftIndex}/${bpmIndex}`);
  }
  assert.equal(seen.size, MUSIC_SPACE, "every combination is reached exactly once");
});

test("a 120-video campaign gets 120 distinct pieces of music", () => {
  const combos = new Set();
  for (let ordinal = 33 * ITEMS_PER_WEEK; ordinal < 33 * ITEMS_PER_WEEK + 120; ordinal += 1) {
    const { keyIndex, modeIndex, shiftIndex, bpmIndex } = musicIndicesForOrdinal(ordinal);
    combos.add(`${keyIndex}/${modeIndex}/${shiftIndex}/${bpmIndex}`);
  }
  assert.equal(combos.size, 120);
});

test("tempo offsets stay inside the PDF's per-template range", () => {
  // The PDF gives each template a BPM band. A bed outside its band is no longer
  // the instruction the sound design was written against.
  assert.ok(Math.max(...BPM_OFFSETS.map(Math.abs)) <= 6, "offsets stay within six BPM");
  assert.ok(BPM_OFFSETS.includes(0), "the documented tempo must remain reachable");
});

test("campaignMusic is a pure function of the id", () => {
  // Renders are unattended and retried. A retry that produced different audio
  // would not match the fingerprint stored for the first attempt.
  const first = campaignMusic("w35-d04-c");
  const second = campaignMusic("w35-d04-c");
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, campaignMusic("w35-d04-d"));
});
