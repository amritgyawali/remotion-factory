import { endCardCues, type BedStep, type Cue, type Score } from "./Score";

/**
 * A score for a video whose beat-by-beat cue list has not been transcribed yet.
 *
 * The thirty scripts each specify their own cues frame by frame, and those are
 * carried on the plan item as `props.score`. Until a given day has been
 * transcribed, this builds a score that still obeys the template's documented
 * bed behaviour from the PDF's sound-design table, so every video has sound
 * and none of them is silent by accident.
 *
 * This is a floor, not a substitute: a transcribed day always wins.
 */

/** Bed behaviour per template, quoted from the PDF's sound-design table. */
const BED_LAYERS: Record<string, string[]> = {
  // "Adds a layer per beat. Stops dead before the punchline card."
  DevJoke: ["pluck", "kick", "shaker", "hat", "bass"],
  // "One synth stab per reveal. Silent on the static save frame."
  TechTip: ["pad", "pulse", "sub", "hat"],
  // "Drops out for the rebuild, returns bigger for the score."
  SiteRoast: ["bass", "kick", "hat", "lead"],
  // "Grows with the graph. Open pad on the peak number."
  CaseStudy: ["pad", "sub", "pulse", "bell"],
  // "No music at all for the first three seconds. Ever."
  FounderStory: ["piano", "stringsLow", "stringsHigh"],
  // "A layer per data reveal, resolving open at the end."
  Recap: ["pad", "bass", "pluck", "kick", "bell"],
};

/** Templates the PDF starts in silence rather than on frame 1. */
const SILENT_OPENING_SECONDS: Record<string, number> = { FounderStory: 3 };

/** One reveal SFX per build step, chosen to suit the template's character. */
const REVEAL_SFX: Record<string, string> = {
  DevJoke: "snap",
  TechTip: "blip",
  SiteRoast: "thud",
  CaseStudy: "ping",
  FounderStory: "stamp",
  Recap: "tick",
};

export function buildDefaultScore(
  template: string,
  durationInFrames: number,
  fps: number,
): Score {
  const layers = BED_LAYERS[template] ?? BED_LAYERS.DevJoke;
  const reveal = REVEAL_SFX[template] ?? "blip";
  const openingSilence = Math.round((SILENT_OPENING_SECONDS[template] ?? 0) * fps);

  // Reserve the end card; the bed resolves under it rather than building.
  const bodyFrames = Math.max(1, durationInFrames - fps * 2);
  const buildFrom = openingSilence;
  const buildSpan = Math.max(1, bodyFrames - buildFrom);

  const bed: BedStep[] = [];
  if (openingSilence > 0) bed.push({ frame: 0, layers: [] });

  // Stack one layer at a time across the body: the "adds a layer per beat"
  // behaviour, spread evenly when the exact beats are not yet known.
  layers.forEach((_, index) => {
    const frame = Math.round(buildFrom + (buildSpan * index) / layers.length);
    bed.push({ frame, layers: layers.slice(0, index + 1) });
  });

  // "Hard silence: cut every layer for a full beat before a payoff, used on
  // nearly all thirty." One beat before the end card.
  const silenceFrame = Math.max(buildFrom, bodyFrames - Math.round(fps * 0.6));
  bed.push({ frame: silenceFrame, layers: [] });
  bed.push({ frame: bodyFrames, layers: layers.slice(0, 2) });

  const cues: Cue[] = [];
  cues.push({ frame: openingSilence, sfx: `${reveal}`, major: true });

  layers.forEach((_, index) => {
    if (index === 0) return;
    const frame = Math.round(buildFrom + (buildSpan * index) / layers.length);
    // Pitch escalation, the PDF's stated substitute for narration.
    const pitched = reveal === "snap" ? `snap-p${Math.min(index * 2, 8)}` : reveal;
    cues.push({ frame, sfx: pitched, major: true });
  });

  cues.push(...endCardCues(durationInFrames, fps));

  return { template, bed, cues };
}

/** Narrow a value off the plan into a Score without trusting its shape. */
export function resolveScore(
  supplied: unknown,
  template: string,
  durationInFrames: number,
  fps: number,
): Score {
  const candidate = supplied as Partial<Score> | undefined;
  if (candidate && Array.isArray(candidate.bed) && Array.isArray(candidate.cues)) {
    return { template, bed: candidate.bed, cues: candidate.cues };
  }
  return buildDefaultScore(template, durationInFrames, fps);
}
