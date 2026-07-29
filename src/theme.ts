import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadBricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadChivo } from "@remotion/google-fonts/Chivo";
import { loadFont as loadIBMPlexMono } from "@remotion/google-fonts/IBMPlexMono";
import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadSora } from "@remotion/google-fonts/Sora";
import { loadFont as loadSpaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadSpaceMono } from "@remotion/google-fonts/SpaceMono";
import { loadFont as loadSyne } from "@remotion/google-fonts/Syne";
import { loadFont as loadUnbounded } from "@remotion/google-fonts/Unbounded";
import { pick, variationFor } from "./seed";
import { campaignLook, MOTION_SIGNATURES, type MotionSignature } from "./variation";

/**
 * Typeface pairings.
 *
 * All six pair a high-contrast display face with a mono for labels and
 * numerals, so a video is recognisably from the same studio whichever pairing
 * it draws. Fonts are loaded at module scope because Remotion needs every face
 * resolved before the first frame rasterises; a lazily loaded font renders as
 * a fallback for the opening frames and nobody is watching to catch it.
 */
// Weights are written out per call rather than shared: every family declares
// its own union of supported weights, and Anton ships a single one.
const latin = ["latin"] as ("latin")[];

/**
 * The weights each pairing can actually render, named by role.
 *
 * This exists because asking for a weight a family does not ship does not
 * fail — the browser synthesises it by smearing each glyph sideways. On Anton,
 * which is ultra-condensed and ships only 400, a hardcoded `fontWeight: 800`
 * made adjacent letters collide and shipped a headline that read as a broken
 * font. Two of the first six videos drew Anton, so roughly one video in seven
 * went out mangled.
 *
 * Components ask for `theme.weightHeavy`, never a number. A family can then
 * only ever be asked for a weight it has.
 */
type WeightScale = { heavy: number; mid: number; body: number };

const SCALE_800: WeightScale = { heavy: 800, mid: 700, body: 600 };
const SCALE_BRICOLAGE: WeightScale = { heavy: 800, mid: 700, body: 500 };
const SCALE_700: WeightScale = { heavy: 700, mid: 600, body: 600 };
/** Anton has exactly one weight. Every role resolves to it, and that is correct. */
const SCALE_SINGLE: WeightScale = { heavy: 400, mid: 400, body: 400 };

const jetBrains = loadJetBrainsMono("normal", { weights: ["400", "700"], subsets: latin }).fontFamily;
const plexMono = loadIBMPlexMono("normal", { weights: ["400", "700"], subsets: latin }).fontFamily;
const spaceMono = loadSpaceMono("normal", { weights: ["400", "700"], subsets: latin }).fontFamily;

export const TYPEFACES = [
  {
    name: "bricolage",
    display: loadBricolage("normal", { weights: ["500", "600", "700", "800"], subsets: latin }).fontFamily,
    mono: jetBrains,
    displayTracking: "-0.04em",
    weights: SCALE_BRICOLAGE,
  },
  {
    name: "unbounded",
    display: loadUnbounded("normal", { weights: ["600", "700", "800"], subsets: latin }).fontFamily,
    mono: spaceMono,
    displayTracking: "-0.03em",
    weights: SCALE_800,
  },
  {
    name: "syne",
    display: loadSyne("normal", { weights: ["600", "700", "800"], subsets: latin }).fontFamily,
    mono: plexMono,
    displayTracking: "-0.02em",
    weights: SCALE_800,
  },
  {
    name: "anton",
    display: loadAnton("normal", { weights: ["400"], subsets: latin }).fontFamily,
    mono: jetBrains,
    displayTracking: "-0.01em",
    weights: SCALE_SINGLE,
  },
  {
    name: "spaceGrotesk",
    display: loadSpaceGrotesk("normal", { weights: ["600", "700"], subsets: latin }).fontFamily,
    mono: spaceMono,
    displayTracking: "-0.035em",
    weights: SCALE_700,
  },
  {
    name: "sora",
    display: loadSora("normal", { weights: ["600", "700", "800"], subsets: latin }).fontFamily,
    mono: plexMono,
    displayTracking: "-0.03em",
    weights: SCALE_800,
  },
  {
    name: "chivo",
    display: loadChivo("normal", { weights: ["600", "700", "800"], subsets: latin }).fontFamily,
    mono: jetBrains,
    displayTracking: "-0.035em",
    weights: SCALE_800,
  },
] as const;

/** The original pairing stays the default so existing stills are unchanged. */
export const display = TYPEFACES[0].display;
export const mono = TYPEFACES[0].mono;

/**
 * Eight grounds, all mid-dark and chromatic.
 *
 * A near-black background is the obvious choice and the wrong one: feeds
 * compress flat blacks into banding, and every other account already uses it.
 * Each of these keeps a colour identity through re-encoding, and each pairs a
 * warm paper type with a single saturated signal colour.
 */
export const PALETTES = [
  { name: "aubergine", ground: "#221033", groundLift: "#3A1C55", paper: "#F4EFE4", amber: "#FFB25C", seaglass: "#6FD3BE" },
  { name: "ink", ground: "#0F1A2B", groundLift: "#1E3352", paper: "#EFF2F7", amber: "#7FB2FF", seaglass: "#FFD166" },
  { name: "moss", ground: "#12241B", groundLift: "#1F4032", paper: "#EFF3E9", amber: "#B7E36B", seaglass: "#FF9F68" },
  { name: "rust", ground: "#2A1512", groundLift: "#4A2620", paper: "#F6EDE6", amber: "#FF8A5B", seaglass: "#7FD1C4" },
  { name: "slate", ground: "#171A21", groundLift: "#2B313D", paper: "#EDEFF2", amber: "#F2C14E", seaglass: "#8FD3F4" },
  { name: "plum", ground: "#2B0F26", groundLift: "#4A1D42", paper: "#F7EAF2", amber: "#FF9EC4", seaglass: "#9BE3C9" },
  { name: "deepSea", ground: "#0C2129", groundLift: "#173F4C", paper: "#E9F4F5", amber: "#5BD1C4", seaglass: "#FFC46B" },
  { name: "oxblood", ground: "#26101A", groundLift: "#451D2E", paper: "#F6EBEE", amber: "#FF7A9C", seaglass: "#8ED8B5" },
] as const;

/**
 * Typeface travels on the theme rather than being imported.
 *
 * Every component that draws type already receives `theme`, including the
 * nested motif components, so putting the families here means a per-video
 * pairing reaches all of them without threading a second prop through the
 * whole tree — and makes it impossible for one component to keep using the
 * default face while the rest of the video changes.
 */
const withDerived = (
  base: (typeof PALETTES)[number],
  type: (typeof TYPEFACES)[number] = TYPEFACES[0],
  motion: MotionSignature = MOTION_SIGNATURES[0],
) => ({
  /**
   * How this video moves, riding along with what it is painted in.
   *
   * Motion is not a paint value and it does not belong here on the merits. It
   * is here because `theme` is already the one per-video object that reaches
   * every component including the nested motifs — the same argument the
   * typeface fields above are here for — and threading a second prop through
   * ten templates and their children is how one component ends up still moving
   * on the default signature while the rest of the video changes.
   *
   * `resolveTheme` and `lookFor` both apply plan overrides *before* this field,
   * so `props.theme` can retint a video but can never restyle its motion.
   */
  motion,
  ground: base.ground,
  groundLift: base.groundLift,
  paper: base.paper,
  paperDim: `${base.paper}8C`,
  amber: base.amber,
  seaglass: base.seaglass,
  rule: `${base.paper}38`,
  display: type.display as string,
  mono: type.mono as string,
  displayTracking: type.displayTracking as string,
  // Named roles, never raw numbers — see WeightScale for why.
  weightHeavy: type.weights.heavy as number,
  weightMid: type.weights.mid as number,
  weightBody: type.weights.body as number,
});

/** Aubergine ground, warm paper type, amber signal — the original identity. */
export const palette = withDerived(PALETTES[0]);

export type Theme = typeof palette;

/**
 * plan.json can override any single colour token per video.
 *
 * `motion` is reinstated after the spread rather than being left to it: a plan
 * that sets `props.theme` is choosing colours, and letting that same field
 * smuggle in a motion signature would put timing values a template springs
 * against under the control of a JSON file nobody type-checks.
 */
export const resolveTheme = (overrides?: Partial<Theme>): Theme => ({
  ...palette,
  ...(overrides ?? {}),
  motion: palette.motion,
});

export type Look = {
  theme: Theme;
  paletteName: string;
  typefaceName: string;
  /**
   * How this video moves. Travels beside the theme rather than inside it
   * because it is not a paint value — components read it to time springs and
   * choose entrance vectors, and burying it in `Theme` would let a plan
   * override motion through the same `props.theme` escape hatch that exists
   * for colour, which is not something a plan should be able to do.
   */
  motion: MotionSignature;
};

/**
 * The full visual identity for one video, derived from its id.
 *
 * Two schemes, and which one applies is decided by the id.
 *
 * **Campaign ids** (`w33-d01-a` and later) walk a 336-combination space of
 * palette x typeface x motion signature with a coprime stride, so every video
 * in a 120-video campaign is guaranteed a look no other video in it has. See
 * src/variation.ts for why a draw cannot do this and a walk can.
 *
 * **Everything else** — weeks 31 and 32, previews, probes — keeps the original
 * hashed draw. Eight palettes against seven pairings is 56 combinations, and
 * drawing 28 times from 56 collides: measured across week 31 it gives 23
 * distinct looks with 5 repeats, which is what the birthday problem predicts.
 * Those videos are already rendered and fingerprinted, so their looks are not
 * ours to change any more.
 *
 * Either way this is only the first line of defence. Actual uniqueness is
 * enforced on the finished file by comparing frame and audio fingerprints —
 * see scripts/uniqueness.mjs — not by assuming an assignment spreads perfectly.
 */
export function lookFor(id: string | undefined, overrides?: Partial<Theme>): Look {
  if (!id) {
    return {
      theme: resolveTheme(overrides),
      paletteName: PALETTES[0].name,
      typefaceName: TYPEFACES[0].name,
      motion: MOTION_SIGNATURES[0],
    };
  }

  const campaign = campaignLook(id);
  const legacy = campaign
    ? null
    : variationFor(id, {
        palettes: PALETTES.length,
        typefaces: TYPEFACES.length,
        keys: 1,
      });

  const chosenPalette = PALETTES[campaign ? campaign.paletteIndex : legacy!.paletteIndex];
  const chosenType = TYPEFACES[campaign ? campaign.typefaceIndex : legacy!.typeIndex];
  const motion = MOTION_SIGNATURES[campaign ? campaign.motionIndex : 0];

  return {
    theme: { ...withDerived(chosenPalette, chosenType, motion), ...(overrides ?? {}), motion },
    paletteName: chosenPalette.name,
    typefaceName: chosenType.name,
    motion,
  };
}

/** The theme alone, which is what components actually need. */
export const themeFor = (id: string | undefined, overrides?: Partial<Theme>): Theme =>
  lookFor(id, overrides).theme;

export { pick };
export const SERIES_LENGTH = 7;
