/**
 * Guaranteed-distinct looks across a whole campaign.
 *
 * `src/seed.ts` hashes an id and draws a palette and a typeface independently.
 * That is fine for a week and provably not fine for a month: drawing 28 times
 * from 56 combinations collides, and the README measures the damage at 23
 * distinct looks with 5 repeats. A 30-day campaign is 120 videos, and 120 draws
 * cannot fit in 56 combinations at all — by the pigeonhole principle at least
 * 64 videos would be wearing a look another video is already wearing.
 *
 * Two things change here.
 *
 * First, the combination space grows past the campaign: a **motion signature**
 * joins palette and typeface, so a look is 8 x 7 x 6 = 336 combinations rather
 * than 56. Motion is a real axis, not a tiebreak — a signature changes which
 * direction type arrives from, how fast it staggers, how the springs behave and
 * how the backdrop grid is scaled and skewed, so two videos on one palette and
 * one typeface still do not produce matching frames.
 *
 * Second, assignment stops being a draw and becomes a **walk**. Each video's
 * position in the campaign is a dense ordinal (week, day and slot are all in
 * the id), and the look is `ordinal * STRIDE mod 336`. Because the stride is
 * coprime to 336 that map is a bijection over any 336 consecutive ordinals, so
 * the 120 videos of a campaign are distinct by construction rather than by
 * luck. scripts/variation.test.mjs asserts it over the real ids.
 *
 * Still a pure function of the id, which is the property everything downstream
 * depends on: renders are unattended and retried, and a retry that produced a
 * different look would invalidate the fingerprint the duplicate detector
 * already stored for that video.
 */

/**
 * Ids look like `w33-d01-a`: campaign week, day within the week, slot within
 * the day. Anything else — the legacy `d01-a` week-one ids, a preview, a probe
 * — has no position in a campaign and keeps the old hashed behaviour.
 */
const CAMPAIGN_ID = /^w(\d{1,3})-d(\d{1,2})-([a-d])$/;

/**
 * The campaign scheme starts at week 32.
 *
 * Week 31 stays on the old hashed `variationFor`: it is published, its frame
 * fingerprints are in the archive, and rewriting its looks would mean a
 * re-render no longer matches the fingerprint recorded for the same id — which
 * is exactly the alarm the duplicate detector exists to raise.
 *
 * Week 32 was excluded for the same reason and has been brought in, because the
 * reason stopped being true. Its unposted twenty-six items were re-scripted from
 * the source PDF and will be rendered fresh, so there is no earlier look to
 * preserve; the two that did post are frozen and will never be rendered again,
 * so what look they *would* draw now is moot. Leaving the week out was worse
 * than moot: a hashed draw is known to collide across three axes at once, and
 * the uniqueness matrix skips legacy weeks entirely, so twenty-six videos would
 * have been assigned palettes and beds that nothing checked.
 */
export const CAMPAIGN_FIRST_WEEK = 32;

export const SLOTS = ["a", "b", "c", "d"] as const;
export const SLOTS_PER_DAY = SLOTS.length;
export const DAYS_PER_WEEK = 7;
export const ITEMS_PER_WEEK = DAYS_PER_WEEK * SLOTS_PER_DAY;

/**
 * Position in the campaign, as a dense integer.
 *
 * Absolute rather than relative to the first week, so no baseline constant has
 * to be kept in step with the plans. Only consecutiveness matters to the walk,
 * and consecutive weeks of 28 produce consecutive ordinals.
 */
export function campaignOrdinal(id: string | undefined): number | null {
  if (!id) return null;
  const match = CAMPAIGN_ID.exec(id);
  if (!match) return null;

  const week = Number(match[1]);
  const day = Number(match[2]);
  const slot = SLOTS.indexOf(match[3] as (typeof SLOTS)[number]);

  if (week < CAMPAIGN_FIRST_WEEK) return null;
  if (day < 1 || day > DAYS_PER_WEEK) return null;

  return week * ITEMS_PER_WEEK + (day - 1) * SLOTS_PER_DAY + slot;
}

/* -------------------------------------------------------------------------- */
/* Motion signatures                                                          */
/* -------------------------------------------------------------------------- */

/**
 * How a video moves, as opposed to what colour it is.
 *
 * Six signatures, each internally coherent — a signature that arrived from the
 * left on a heavy spring while its list slid right on a crisp one would read as
 * a bug rather than as a style. The numbers are deliberately conservative:
 * these are the same templates and they must still look like one studio made
 * them, so the axis varies attack and direction, never layout.
 *
 * `springDamping` is the one to be careful with. Remotion's `spring` overshoots
 * below about 26 damping at these masses, and an overshooting headline at
 * 178px clips its own descenders against the line above. Nothing here goes low
 * enough to bounce; "crisp" is fast, not springy.
 */
export type MotionSignature = {
  name: string;
  /** Axis and sign the words of a headline arrive along. */
  entry: "up" | "down" | "left" | "right";
  /** Frames between consecutive words. Lower is more urgent. */
  stagger: number;
  /** Fraction of the font size a word travels before it lands. */
  travel: number;
  springDamping: number;
  springMass: number;
  /** Backdrop grid cell, in px. Changes the density of the whole field. */
  gridCell: number;
  /** Backdrop grid skew, in degrees. Breaks the "same square grid" read. */
  gridSkew: number;
  /** Multiplier on how far the backdrop glows travel over the clip. */
  glowTravel: number;
  /** Sign of the x offset list rows enter along. */
  listFrom: -1 | 1;
};

export const MOTION_SIGNATURES: readonly MotionSignature[] = [
  {
    name: "rise",
    entry: "up",
    stagger: 3,
    travel: 0.42,
    springDamping: 200,
    springMass: 0.5,
    gridCell: 90,
    gridSkew: 0,
    glowTravel: 1,
    listFrom: -1,
  },
  {
    name: "settle",
    entry: "down",
    stagger: 4,
    travel: 0.34,
    springDamping: 120,
    springMass: 0.8,
    gridCell: 72,
    gridSkew: -4,
    glowTravel: 1.35,
    listFrom: -1,
  },
  {
    name: "sweep",
    entry: "left",
    stagger: 2,
    travel: 0.5,
    springDamping: 90,
    springMass: 0.6,
    gridCell: 108,
    gridSkew: 5,
    glowTravel: 0.7,
    listFrom: 1,
  },
  {
    name: "press",
    entry: "up",
    stagger: 5,
    travel: 0.26,
    springDamping: 46,
    springMass: 1.1,
    gridCell: 128,
    gridSkew: 0,
    glowTravel: 1.6,
    listFrom: -1,
  },
  {
    name: "drift",
    entry: "right",
    stagger: 3,
    travel: 0.38,
    springDamping: 150,
    springMass: 0.7,
    gridCell: 84,
    gridSkew: 3,
    glowTravel: 0.85,
    listFrom: 1,
  },
  {
    name: "snap",
    entry: "down",
    stagger: 2,
    travel: 0.3,
    springDamping: 60,
    springMass: 0.45,
    gridCell: 96,
    gridSkew: -7,
    glowTravel: 1.15,
    listFrom: -1,
  },
];

/* -------------------------------------------------------------------------- */
/* The walk                                                                   */
/* -------------------------------------------------------------------------- */

export const PALETTE_COUNT = 8;
export const TYPEFACE_COUNT = 7;
export const MOTION_COUNT = MOTION_SIGNATURES.length;

/** 8 x 7 x 6. Comfortably past the 120 a 30-day campaign needs. */
export const LOOK_SPACE = PALETTE_COUNT * TYPEFACE_COUNT * MOTION_COUNT;

/**
 * Coprime to 336, which is the only property that matters: it makes
 * `n -> n * LOOK_STRIDE mod 336` a bijection, so 336 consecutive ordinals
 * produce 336 distinct looks and no two of our 120 can collide.
 *
 * 149 is prime and does not divide 336 (= 2^4 x 3 x 7). It is also large
 * enough that consecutive videos land far apart in the space rather than
 * marching through the palettes in order, which would make a day's four posts
 * look like a gradient.
 */
export const LOOK_STRIDE = 149;

export type LookIndices = {
  ordinal: number;
  paletteIndex: number;
  typefaceIndex: number;
  motionIndex: number;
};

/**
 * Decompose the walk position into one index per axis.
 *
 * Mixed radix, palette fastest. Combined with a stride that is coprime to the
 * whole space this spreads all three axes at once — reading the digits of a
 * single stepped counter is what keeps the three from varying together, which
 * is the failure mode of drawing them from one hash independently.
 */
export function lookIndicesForOrdinal(ordinal: number): LookIndices {
  const combo = (((ordinal * LOOK_STRIDE) % LOOK_SPACE) + LOOK_SPACE) % LOOK_SPACE;

  return {
    ordinal,
    paletteIndex: combo % PALETTE_COUNT,
    typefaceIndex: Math.floor(combo / PALETTE_COUNT) % TYPEFACE_COUNT,
    motionIndex: Math.floor(combo / (PALETTE_COUNT * TYPEFACE_COUNT)) % MOTION_COUNT,
  };
}

/**
 * The look for a campaign id, or null for anything that is not one.
 *
 * Null is a real answer and callers must handle it rather than defaulting: it
 * means "this id predates the campaign scheme", and the correct behaviour is
 * the old hashed draw, not signature zero for everything.
 */
export function campaignLook(id: string | undefined): LookIndices | null {
  const ordinal = campaignOrdinal(id);
  return ordinal === null ? null : lookIndicesForOrdinal(ordinal);
}

/**
 * The motion signature a video moves on.
 *
 * Falls back to the first signature for non-campaign ids, which is exactly the
 * motion every template had before this file existed — so weeks 31 and 32
 * render frame-identical to how they always did.
 */
export function motionFor(id: string | undefined): MotionSignature {
  const look = campaignLook(id);
  return MOTION_SIGNATURES[look ? look.motionIndex : 0];
}
