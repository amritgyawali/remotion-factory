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

/**
 * The bed ducks under every major hit, but gently and over a longer window
 * than the PDF's 6 frames. A 4 dB step on and off in a tenth of a second is
 * inaudible under a loud close mix and obvious under a quiet distant one —
 * it reads as the music breathing at you. Shallower and slower disappears.
 */
export const DUCK_DB = -3;
export const DUCK_FRAMES = 10;
/** Fast in so the duck is already there when the hit lands, slow back out. */
export const DUCK_ATTACK_FRAMES = 2;

/**
 * Bed level, well under the effects.
 *
 * The PDF's -6 was written for a bed that carries the video. In practice it
 * competed with the on-screen text, which is the entire narration — there is
 * no voiceover to sit beneath, so "under the dialogue" has no floor to find.
 * At -13 the music is atmosphere: present if you listen for it, never the
 * reason you stop watching.
 */
export const BED_DB = -13;

/**
 * Individual cues are already normalised into their own window, but several
 * can overlap and the bed sums on top. Lowered along with the bed: with the
 * master no longer pushing everything to -14 LUFS, effects at -2 became the
 * loudest thing in a calm mix and undid the point of quieting the music.
 */
export const SFX_DB = -7;

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

/**
 * Where this video's bed layers live.
 *
 * Beds are namespaced by video id, not by template, and that is what lets one
 * webpack bundle serve a whole shard of renders. The bed is regenerated per
 * video — a different key, mode, phrase and tempo each time — so when every
 * video's bed shared the name `bed-DevJoke-pluck.wav` the public folder had to
 * be rewritten and the project re-bundled between every single render. Under a
 * per-id path a shard builds all of its audio once, bundles once, and renders
 * twelve videos off the same server.
 *
 * Falls back to the template name so the Studio, which has no plan item and
 * therefore no id, still finds the unseeded beds `npm run audio` writes.
 */
const bedSrc = (videoId: string | undefined, template: string, layer: string) =>
  staticFile(`audio/beds/${videoId ?? template}/${layer}.wav`);

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
 * Total duck applied at `frame`, ramped rather than switched.
 *
 * Overlapping major hits do not stack — two cues a frame apart would otherwise
 * duck twice as deep and audibly pump. The deepest single duck wins, and it
 * fades in over two frames and back out across the rest, so the bed dips
 * around the hit instead of being chopped out from under it.
 */
function duckGainAt(cues: Cue[], frame: number): number {
  let depth = 0;

  for (const cue of cues) {
    if (!cue.major) continue;
    const since = frame - cue.frame;
    if (since < 0 || since >= DUCK_FRAMES) continue;

    const shape =
      since < DUCK_ATTACK_FRAMES
        ? since / DUCK_ATTACK_FRAMES
        : 1 - (since - DUCK_ATTACK_FRAMES) / (DUCK_FRAMES - DUCK_ATTACK_FRAMES);
    depth = Math.max(depth, shape);
  }

  return dbToGain(DUCK_DB * depth);
}

export const Soundtrack: React.FC<{ score: Score; videoId?: string }> = ({ score, videoId }) => {
  const { durationInFrames } = useVideoConfig();
  const layers = allLayers(score.bed);

  return (
    <>
      {layers.map((layer) => (
        <Audio
          key={layer}
          src={bedSrc(videoId, score.template, layer)}
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
