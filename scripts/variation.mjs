/**
 * The music half of the campaign walk.
 *
 * src/variation.ts assigns every campaign video a look no other video in the
 * campaign has. This does the same for what it sounds like, from the same
 * ordinal, for the same reason: `buildBed` currently hashes the plan id and
 * reads three numbers out of the hash, which collides exactly as independently
 * drawing a palette and a typeface collides. Over 120 videos a hash will hand
 * two of them the same key, the same mode and the same phrase offset, and two
 * videos on one template with all three equal are the same piece of music.
 *
 * The space here is 8 keys x 3 modes x 7 phrase offsets x 7 tempi = 1176, and
 * the stride is coprime to it, so any 1176 consecutive ordinals — comfortably
 * more than the 120 in a campaign — get 1176 distinct pieces.
 *
 * `campaignOrdinal` is deliberately a copy of the one in src/variation.ts
 * rather than an import. The browser half is TypeScript compiled by webpack and
 * this half runs in bare Node before the bundler is involved, and the existing
 * `seedFrom` duplication between src/seed.ts and scripts/audio/beds.mjs set the
 * precedent. scripts/variation.test.mjs reads both files and fails if the
 * constants ever drift apart.
 */

const CAMPAIGN_ID = /^w(\d{1,3})-d(\d{1,2})-([a-d])$/;

export const CAMPAIGN_FIRST_WEEK = 32;
export const SLOTS = ["a", "b", "c", "d"];
export const SLOTS_PER_DAY = SLOTS.length;
export const DAYS_PER_WEEK = 7;
export const ITEMS_PER_WEEK = DAYS_PER_WEEK * SLOTS_PER_DAY;

/** Position in the campaign, as a dense integer. Null if not a campaign id. */
export function campaignOrdinal(id) {
  if (!id) return null;
  const match = CAMPAIGN_ID.exec(String(id));
  if (!match) return null;

  const week = Number(match[1]);
  const day = Number(match[2]);
  const slot = SLOTS.indexOf(match[3]);

  if (week < CAMPAIGN_FIRST_WEEK) return null;
  if (day < 1 || day > DAYS_PER_WEEK) return null;

  return week * ITEMS_PER_WEEK + (day - 1) * SLOTS_PER_DAY + slot;
}

export const KEY_COUNT = 8;
export const MODE_COUNT = 3;
export const SHIFT_COUNT = 7;

/**
 * Tempo offsets in BPM, applied on top of the template's documented rate.
 *
 * Kept inside +/- 6 because the PDF gives each template a BPM range and these
 * have to stay inside it — a DevJoke bed at 88 is still the PDF's "playful
 * synth at 88-108", one at 76 is a different instruction. Six steps of two plus
 * zero is seven values, and seven is coprime to nothing else in the space,
 * which is what keeps the product square.
 */
export const BPM_OFFSETS = [0, 2, -2, 4, -4, 6, -6];

export const MUSIC_SPACE = KEY_COUNT * MODE_COUNT * SHIFT_COUNT * BPM_OFFSETS.length;

/**
 * Coprime to 1176 (= 2^3 x 3 x 7^2), which is the property that makes the walk
 * a bijection. 145 is 5 x 29 and shares no factor with 2, 3 or 7.
 */
export const MUSIC_STRIDE = 145;

/**
 * Which piece of music this ordinal gets.
 *
 * Indices, not values: beds.mjs owns the actual key offsets and mode tables,
 * and it picks a mode from the template's own emotional register — a bright
 * template draws from the bright modes. Returning an index rather than a mode
 * is what lets one assignment serve both registers without this file having to
 * know which templates are which.
 */
export function musicIndicesForOrdinal(ordinal) {
  const combo = (((ordinal * MUSIC_STRIDE) % MUSIC_SPACE) + MUSIC_SPACE) % MUSIC_SPACE;

  return {
    ordinal,
    keyIndex: combo % KEY_COUNT,
    modeIndex: Math.floor(combo / KEY_COUNT) % MODE_COUNT,
    shiftIndex: Math.floor(combo / (KEY_COUNT * MODE_COUNT)) % SHIFT_COUNT,
    bpmIndex: Math.floor(combo / (KEY_COUNT * MODE_COUNT * SHIFT_COUNT)) % BPM_OFFSETS.length,
  };
}

/** The music assignment for a campaign id, or null for anything else. */
export function campaignMusic(id) {
  const ordinal = campaignOrdinal(id);
  return ordinal === null ? null : musicIndicesForOrdinal(ordinal);
}
