import React from "react";
import { Audio, Sequence, staticFile, useVideoConfig } from "remotion";

/**
 * The soundtrack layer.
 *
 * The source PDF is emphatic that timing is the whole game: "Every SFX lands
 * on the first frame of its motion. Audio three frames late reads as an
 * amateur edit, and in a silent video there is nothing to hide behind." So a
 * cue is addressed by frame, never by seconds, and the frame it names is the
 * frame it starts on.
 *
 * Mix targets come straight from the PDF's table: bed under the effects, SFX
 * present and deliberate, and the bed ducked 4 dB for 6 frames under every
 * major hit so each cue reads cleanly.
 */

const dbToGain = (db: number) => 10 ** (db / 20);

/** "Duck the bed 4 dB for 6 frames under every major SFX hit." */
export const DUCK_DB = -4;
export const DUCK_FRAMES = 6;

/** Bed sits below the effects because the effects are carrying the dialogue. */
export const BED_DB = -6;

/**
 * Individual cues are already normalised into the PDF's -8 to -12 dBFS window,
 * but several can overlap and the bed sums on top. Measured on a real render,
 * unity here peaked at -0.6 dBFS, over the -1 dBTP master ceiling the PDF
 * specifies. This is the headroom that keeps the sum under it.
 */
export const SFX_DB = -2;

export type Cue = {
  /** Frame this cue starts on. The PDF's row start second times fps. */
  frame: number;
  /** File stem in public/audio, e.g. "snap-p4" or "whoosh-up". */
  sfx: string;
  /** Trim in dB relative to the standard SFX level. */
  db?: number;
  /**
   * Whether this hit ducks the bed. The PDF ducks under "every major SFX hit";
   * ticks and blips are texture and would leave the bed pumping.
   */
  major?: boolean;
};

/**
 * A change in which bed layers are audible, effective from `frame` until the
 * next entry. An empty array is the PDF's "hard silence": cut every layer for
 * a full beat before a payoff.
 */
export type BedStep = {
  frame: number;
  layers: string[];
  /** Detune in semitones, for the "tonal decay" technique on days 12 and 27. */
  detune?: number;
};

export type Score = {
  template: string;
  bed: BedStep[];
  cues: Cue[];
};

const audioSrc = (stem: string) => staticFile(`audio/${stem}.wav`);

/** Which step is in force at `frame`. Steps are applied in order, not sorted. */
function stepAt(bed: BedStep[], frame: number): BedStep | null {
  let current: BedStep | null = null;
  for (const step of bed) {
    if (step.frame <= frame) current = step;
  }
  return current;
}

/** Every layer named anywhere in the schedule; each gets one <Audio>. */
function allLayers(bed: BedStep[]): string[] {
  return [...new Set(bed.flatMap((step) => step.layers))];
}

/**
 * Total duck applied at `frame`. Overlapping major hits do not stack — two
 * cues a frame apart would otherwise duck 8 dB and audibly pump the bed.
 */
function duckGainAt(cues: Cue[], frame: number): number {
  const ducking = cues.some(
    (cue) => cue.major && frame >= cue.frame && frame < cue.frame + DUCK_FRAMES,
  );
  return ducking ? dbToGain(DUCK_DB) : 1;
}

export const Soundtrack: React.FC<{ score: Score }> = ({ score }) => {
  const { durationInFrames } = useVideoConfig();
  const layers = allLayers(score.bed);

  return (
    <>
      {layers.map((layer) => (
        <Audio
          key={layer}
          src={audioSrc(`bed-${score.template}-${layer}`)}
          volume={(frame) => {
            const step = stepAt(score.bed, frame);
            if (!step || !step.layers.includes(layer)) return 0;

            // Fade the last 12 frames so the bed resolves rather than stops.
            const tail = Math.max(0, durationInFrames - frame);
            const release = tail < 12 ? tail / 12 : 1;
            return dbToGain(BED_DB) * duckGainAt(score.cues, frame) * release;
          }}
        />
      ))}

      {score.cues.map((cue, index) => (
        // Sequence placement is what makes the cue land on its exact frame:
        // the audio simply does not exist before it.
        <Sequence key={`${cue.sfx}-${cue.frame}-${index}`} from={cue.frame} name={`sfx ${cue.sfx}`}>
          <Audio src={audioSrc(cue.sfx)} volume={dbToGain(SFX_DB + (cue.db ?? 0))} />
        </Sequence>
      ))}
    </>
  );
};

/**
 * The two-second brand close is identical on all thirty videos, so its cues
 * are built rather than written out each time: "soft logo sting plus a single
 * warm chime on the mark".
 */
export function endCardCues(durationInFrames: number, fps: number): Cue[] {
  const start = Math.max(0, durationInFrames - fps * 2);
  return [
    { frame: start, sfx: "logoSting", major: true },
    { frame: start + Math.round(fps * 0.25), sfx: "chime", db: -3 },
  ];
}
