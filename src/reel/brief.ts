/**
 * One production brief, as the document defines it.
 *
 * The PDF is a production document rather than a list of ideas, and this type is
 * shaped to hold all of it — not a summary. Every field here is checked against
 * the finished render by scripts/verify-brief.mjs, so a field that quietly
 * disagreed with the page would fail rather than ship.
 *
 * Two constraints from the document are structural rather than advisory and are
 * encoded as types, not comments:
 *
 *   - `beats` is exactly five. The retention architecture is five timed windows
 *     (0-3, 3-8, 8-15, 15-24, 24-30) and a brief with four or six of them is not
 *     a brief for this series.
 *   - `hashtags` is exactly five. The document says "exactly five hashtags".
 */

/** The five retention windows, in frames at 30 fps. */
export const BEAT_WINDOWS = [
  { from: 0, to: 90, role: "promise" },
  { from: 90, to: 240, role: "curiosity" },
  { from: 240, to: 450, role: "progress" },
  { from: 450, to: 720, role: "payoff" },
  { from: 720, to: 900, role: "new-curiosity" },
] as const;

export const TOTAL_FRAMES = 900;
export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

/**
 * The title card occupies frames 0-30, and the reel plays unchanged from 30.
 *
 * This is an addition to the source document, requested so a viewer knows what
 * the reel is about before the demonstration starts. It sits *inside* the 900
 * frames rather than extending them, because 900 is a locked delivery spec — so
 * beat one is compressed into 30-90 rather than 0-90.
 */
export const TITLE_CARD_FRAMES = 30;

/** Safe area, from the production contract. The top zone must stay empty. */
export const SAFE = {
  left: 90,
  right: 170,
  bottom: 320,
  /** Nothing fixed may render above this line. Ever. */
  top: 180,
} as const;

export type BeatSpec = {
  /** Which window this is. Index into BEAT_WINDOWS. */
  index: 0 | 1 | 2 | 3 | 4;
  /**
   * The on-screen copy, word for word from the brief including punctuation.
   *
   * Rendered as designed kinetic text broken into 2-6 word units — never as a
   * narration transcript, and never paraphrased. scripts/verify-brief.mjs
   * asserts the exact string survives into the render props.
   */
  copy: string;
  /**
   * One term in `copy` to highlight. The document allows one highlight per
   * scene; more than one reads as a ransom note.
   */
  highlight?: string;
  /** The visible demonstration and its motion, from the brief's right column. */
  demonstration: string;
};

/**
 * Which mechanism draws this reel's argument.
 *
 * The mechanism is the reel — it is what makes the claim legible with the sound
 * off. Each name maps to a component in src/reel/mechanisms/ that literally
 * enacts one kind of argument, and the ledger treats it as the metaphor axis:
 * no two reels may use the same one.
 */
export type MechanismId =
  | "containment"      // a sealed volume, a breach path, permission gates
  | "optics"           // a lens, a scan cone, an aperture that seals
  | "utility-chain"    // token -> rack -> substation -> meter, costs flowing
  | "forensics"        // a document, a stamp, a probability distribution
  | "folded-claim"     // two panels that turn out to be one object
  | "assembly-line"    // stations, a queue, a bottleneck that moves
  | "vault-vs-field"   // one sealed column against a wide shallow field
  | "feeding-web"      // a graph that consumes its own sources
  | "orbital-ledger"   // two ledgers, costs transferring between them
  | "shared-sky"       // a local action with a planetary halo
  | "signal-rights"    // one waveform, branching inference, consent gates
  | "training-loop";   // a machine improving as data enters it

export type Brief = {
  /** Document ID, e.g. "D01A". Organisational only — NEVER rendered. */
  docId: string;
  /** Composition id, e.g. "Day01A". */
  id: string;
  day: number;
  slot: "A" | "B" | "C" | "D";
  /** e.g. "AI SECURITY". Category, from the brief header. Not rendered as a header. */
  category: string;
  title: string;
  /** The exact screen-word count the brief specifies. Asserted, not estimated. */
  screenWords: number;
  postLine: string;
  hashtags: string[];
  debate: string;
  beats: BeatSpec[];
  /** The named visual system, verbatim. Drives palette and material choices. */
  visualSystem: string;
  /** The build cues from the brief. Recorded so the render can be audited. */
  build: string;
  mechanism: MechanismId;
  audio: {
    /** The instrumental bed, described. No voice, ever. */
    music: string;
    /** SFX names in the order the brief lists them, tied to on-screen causes. */
    sfx: string[];
  };
  factGuard: string;
  sourceAnchor: string[];
  /** Ledger axes. Checked across the whole campaign before a reel is built. */
  ledger: {
    metaphor: string;
    typefacePair: string;
    palette: string;
    motion: string;
    audioSignature: string;
  };
  /** Position in the posting order. Slot 0 is 1 Nov, 12:30 am Nepal. */
  slotIndex: number;
  /** The caption posted with the video: post line plus the five hashtags. */
  caption: string;
};

/**
 * The words that actually appear on screen, as one list.
 *
 * The five beats are the only source of on-screen copy. The title card shows
 * the title, which the document counts separately — it is the reel's name, not
 * a copy beat — so it is excluded here and asserted on its own.
 */
export function screenWordsOf(brief: Pick<Brief, "beats">): string[] {
  return brief.beats
    .flatMap((beat) => beat.copy.split(/\s+/))
    .map((word) => word.replace(/^[^\w%$]+|[^\w%$]+$/g, ""))
    .filter(Boolean);
}

/** Where a beat's copy is on screen, in frames, with the title card allowed for. */
export function beatFrames(index: number): { from: number; durationInFrames: number } {
  const window = BEAT_WINDOWS[index];
  const from = index === 0 ? TITLE_CARD_FRAMES : window.from;
  return { from, durationInFrames: window.to - from };
}
