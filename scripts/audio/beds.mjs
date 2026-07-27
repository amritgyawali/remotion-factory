import {
  decayTo,
  deClick,
  envelope,
  gain,
  highpass,
  lowpass,
  mix,
  noise,
  limitPeak,
  normalizeRms,
  noteHz,
  osc,
  place,
  resonantLowpass,
  seconds,
  silence,
  softClip,
} from "./synth.mjs";

/**
 * Music beds, one per template, so "the account becomes recognisable by ear
 * alone" as the PDF puts it.
 *
 * Each bed renders as a set of independent layers rather than one mixed
 * stereo file. That is what makes the PDF's bed behaviour actually
 * expressible: DevJoke "adds a layer per beat", SiteRoast "drops out entirely
 * for the rebuild, returns bigger", FounderStory has "no music at all for the
 * first three seconds". Mixed down to a single file, none of that is possible
 * without re-rendering audio per video; as layers, the Remotion score just
 * changes which ones are audible at which frame.
 *
 * The PDF puts the bed at -16 LUFS — quieter than the SFX on purpose, since
 * with no voiceover the effects are carrying the dialogue.
 */

const BED_RMS_DB = -26;

/** Scale degrees for natural minor and major, as semitone offsets. */
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/**
 * Scale degree to MIDI note. `n` is floored defensively: a fractional index
 * silently yields `undefined` from the scale array, which turns the whole
 * layer into NaN and renders as a file that is neither audible nor obviously
 * broken until something downstream divides by it.
 */
function degree(scale, root, n) {
  const index = Math.floor(n);
  return (
    root + scale[((index % scale.length) + scale.length) % scale.length] + 12 * Math.floor(index / scale.length)
  );
}

/** Sixteenth-note grid. Every layer locks to this so nothing drifts. */
const gridStep = (bpm) => 60 / bpm / 4;

function layerBuffer(durationSeconds) {
  return new Float32Array(seconds(durationSeconds));
}

/** Plucked synth: triangle with a fast decay and a touch of body. */
function pluck(midi, length) {
  const f = noteHz(midi);
  return mix(
    osc({ duration: length, freq: f, type: "triangle", gain: decayTo(length * 0.28) }),
    gain(osc({ duration: length, freq: f * 2, type: "sine", gain: decayTo(length * 0.12) }), 0.28),
  );
}

function kick() {
  return mix(
    osc({
      duration: 0.34,
      freq: (t) => 120 * Math.exp(-t / 0.028) + 46,
      type: "sine",
      gain: envelope({ attack: 0.003, decay: 0.28, release: 0.05 }),
    }),
    gain(lowpass(noise({ duration: 0.05, gain: decayTo(0.012), seed: 11 }), 900), 0.4),
  );
}

const shaker = (seed) => highpass(noise({ duration: 0.09, gain: decayTo(0.022), seed }), 5200);
const hat = (seed) => highpass(noise({ duration: 0.055, gain: decayTo(0.011), seed }), 8000);

function bassNote(midi, length) {
  return osc({
    duration: length,
    freq: noteHz(midi),
    type: "triangle",
    gain: envelope({ attack: 0.012, decay: length * 0.3, sustain: 0.55, hold: length * 0.35, release: length * 0.25 }),
  });
}

/** Sustained chord pad, filtered so it sits under everything. */
function pad(midis, length) {
  const voices = midis.map((midi, index) =>
    gain(
      osc({
        duration: length,
        // Slight detune per voice keeps a synthesised chord from sounding sterile.
        freq: noteHz(midi) * (1 + (index - 1) * 0.0016),
        type: "saw",
        gain: envelope({ attack: length * 0.22, decay: length * 0.2, sustain: 0.8, hold: length * 0.3, release: length * 0.28 }),
      }),
      0.22,
    ),
  );
  return lowpass(mix(voices), 1500);
}

/** Struck piano-ish tone: sine stack with inharmonic decay. */
function piano(midi, length) {
  const f = noteHz(midi);
  return mix(
    osc({ duration: length, freq: f, type: "sine", gain: decayTo(length * 0.34) }),
    gain(osc({ duration: length, freq: f * 2.005, type: "sine", gain: decayTo(length * 0.16) }), 0.3),
    gain(osc({ duration: length, freq: f * 3.01, type: "sine", gain: decayTo(length * 0.08) }), 0.12),
  );
}

/** Slow swelling strings. */
function strings(midis, length) {
  const voices = midis.map((midi, index) =>
    gain(
      osc({
        duration: length,
        freq: noteHz(midi) * (1 + (index - 1) * 0.0022),
        type: "saw",
        gain: envelope({ attack: length * 0.4, decay: length * 0.1, sustain: 0.85, hold: length * 0.25, release: length * 0.25 }),
      }),
      0.19,
    ),
  );
  return lowpass(mix(voices), 2400);
}

const finishLayer = (buffer) => deClick(limitPeak(normalizeRms(softClip(buffer, 1.2), BED_RMS_DB), -3));

/**
 * Each builder returns named layers of equal length. The score decides which
 * are audible when; nothing here knows about a specific video.
 */
const BUILDERS = {
  /** Playful plucked synth. Escalates by stacking percussion. */
  DevJoke(duration, bpm) {
    const step = gridStep(bpm);
    const root = 57; // A3
    const pattern = [0, 2, 4, 2, 5, 4, 2, 0];
    const layers = {
      pluck: layerBuffer(duration),
      kick: layerBuffer(duration),
      shaker: layerBuffer(duration),
      hat: layerBuffer(duration),
      bass: layerBuffer(duration),
    };

    for (let i = 0; step * i < duration; i++) {
      const t = step * i;
      if (i % 2 === 0) {
        place(layers.pluck, pluck(degree(MINOR, root + 12, pattern[(i / 2) % pattern.length]), step * 2), seconds(t));
      }
      if (i % 8 === 0) place(layers.kick, kick(), seconds(t));
      if (i % 4 === 2) place(layers.shaker, shaker(13 + i), seconds(t));
      if (i % 2 === 1) place(layers.hat, hat(17 + i), seconds(t));
      if (i % 16 === 0) place(layers.bass, bassNote(root - 12 + (i % 32 === 16 ? 5 : 0), step * 16), seconds(t));
    }
    return layers;
  },

  /** Clean electronic pulse. One stab per reveal is placed by the score. */
  TechTip(duration, bpm) {
    const step = gridStep(bpm);
    const root = 55; // G3
    const layers = {
      pulse: layerBuffer(duration),
      sub: layerBuffer(duration),
      pad: layerBuffer(duration),
      hat: layerBuffer(duration),
    };

    place(layers.pad, pad([root + 12, root + 15, root + 19], duration), 0);
    for (let i = 0; step * i < duration; i++) {
      const t = step * i;
      if (i % 4 === 0) {
        place(
          layers.pulse,
          gain(osc({ duration: step * 2, freq: noteHz(root + 24), type: "sine", gain: decayTo(step * 0.5) }), 0.5),
          seconds(t),
        );
      }
      if (i % 8 === 0) place(layers.sub, bassNote(root - 12, step * 8), seconds(t));
      if (i % 4 === 2) place(layers.hat, hat(23 + i), seconds(t));
    }
    return layers;
  },

  /** Confident mid-tempo beat for the roasts. */
  SiteRoast(duration, bpm) {
    const step = gridStep(bpm);
    const root = 53; // F3
    const layers = {
      kick: layerBuffer(duration),
      bass: layerBuffer(duration),
      hat: layerBuffer(duration),
      lead: layerBuffer(duration),
    };

    for (let i = 0; step * i < duration; i++) {
      const t = step * i;
      if (i % 8 === 0 || i % 16 === 6) place(layers.kick, kick(), seconds(t));
      if (i % 4 === 0) place(layers.bass, bassNote(root - 12, step * 4), seconds(t));
      if (i % 2 === 1) place(layers.hat, hat(29 + i), seconds(t));
      if (i % 8 === 4) place(layers.lead, pluck(degree(MINOR, root + 12, Math.floor(i / 8) % 7), step * 4), seconds(t));
    }
    return layers;
  },

  /** Minimal build that grows with the graph. */
  CaseStudy(duration, bpm) {
    const step = gridStep(bpm);
    const root = 50; // D3
    const layers = {
      pad: layerBuffer(duration),
      pulse: layerBuffer(duration),
      bell: layerBuffer(duration),
      sub: layerBuffer(duration),
    };

    place(layers.pad, pad([root + 12, root + 16, root + 19, root + 23], duration), 0);
    for (let i = 0; step * i < duration; i++) {
      const t = step * i;
      if (i % 4 === 0) {
        place(layers.pulse, gain(pluck(degree(MAJOR, root + 24, (i / 4) % 5), step * 3), 0.55), seconds(t));
      }
      if (i % 16 === 0) place(layers.sub, bassNote(root - 12, step * 16), seconds(t));
      if (i % 32 === 8) place(layers.bell, gain(pluck(degree(MAJOR, root + 36, 2), step * 8), 0.4), seconds(t));
    }
    return layers;
  },

  /** Piano first, strings later. The score keeps both silent for 3s. */
  FounderStory(duration, bpm) {
    const step = gridStep(bpm) * 4; // quarter notes; this bed is free-time
    const root = 48; // C3
    const layers = {
      piano: layerBuffer(duration),
      stringsLow: layerBuffer(duration),
      stringsHigh: layerBuffer(duration),
    };

    const melody = [0, 4, 2, 5, 4, 7, 5, 4];
    for (let i = 0; step * i < duration; i++) {
      if (i % 2 === 0) {
        place(layers.piano, gain(piano(degree(MINOR, root + 12, melody[(i / 2) % melody.length]), step * 3), 0.7), seconds(step * i));
      }
    }
    place(layers.stringsLow, strings([root, root + 7, root + 12], duration), 0);
    place(layers.stringsHigh, strings([root + 15, root + 19, root + 24], duration), 0);
    return layers;
  },

  /** Warm full build for the recap. */
  Recap(duration, bpm) {
    const step = gridStep(bpm);
    const root = 52; // E3
    const layers = {
      pad: layerBuffer(duration),
      pluck: layerBuffer(duration),
      kick: layerBuffer(duration),
      bell: layerBuffer(duration),
      bass: layerBuffer(duration),
    };

    place(layers.pad, pad([root + 12, root + 16, root + 19], duration), 0);
    for (let i = 0; step * i < duration; i++) {
      const t = step * i;
      if (i % 2 === 0) place(layers.pluck, gain(pluck(degree(MAJOR, root + 24, (i / 2) % 6), step * 2), 0.6), seconds(t));
      if (i % 8 === 0) place(layers.kick, kick(), seconds(t));
      if (i % 16 === 0) place(layers.bass, bassNote(root - 12, step * 16), seconds(t));
      if (i % 32 === 16) place(layers.bell, gain(pluck(degree(MAJOR, root + 36, 4), step * 8), 0.35), seconds(t));
    }
    return layers;
  },
};

/** BPM the PDF specifies per template; the midpoint where it gives a range. */
export const BED_BPM = {
  DevJoke: 100,
  TechTip: 104,
  SiteRoast: 104,
  CaseStudy: 96,
  FounderStory: 72,
  Recap: 102,
};

export const BED_TEMPLATES = Object.keys(BUILDERS);

export function buildBed(template, durationSeconds) {
  const builder = BUILDERS[template];
  if (!builder) throw new Error(`no bed defined for template "${template}"`);

  const bpm = BED_BPM[template];
  const layers = builder(durationSeconds, bpm);
  return {
    bpm,
    layers: Object.fromEntries(Object.entries(layers).map(([name, buffer]) => [name, finishLayer(buffer)])),
  };
}
