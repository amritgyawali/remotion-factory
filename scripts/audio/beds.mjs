import {
  decayTo,
  deClick,
  distant,
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

/** Scale degrees as semitone offsets. Seven modes, so a seeded bed can change
 * colour without leaving the template's character: dorian and mixolydian read
 * as brighter minors, phrygian as darker, lydian as a lifted major. */
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];

const DARK_MODES = [MINOR, DORIAN, PHRYGIAN];
const BRIGHT_MODES = [MAJOR, LYDIAN, MIXOLYDIAN];

/**
 * Per-video musical variation.
 *
 * Two videos on the same template must not be the same piece of music. The
 * seed shifts the key by up to a fifth and swaps the mode within the
 * template's emotional register, so a DevJoke bed still sounds like DevJoke
 * while never repeating exactly. Derived from the plan id, so a retried render
 * produces identical audio.
 */
export function seedFrom(id) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < String(id).length; i++) {
    hash ^= String(id).charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Transpose within a fifth, so beds stay in a comfortable register. */
const KEY_OFFSETS = [0, 2, 3, 5, 7, -2, -3, -5];

function variation(seed, bright) {
  if (seed === null || seed === undefined) {
    return { keyOffset: 0, mode: bright ? MAJOR : MINOR, patternShift: 0 };
  }
  const modes = bright ? BRIGHT_MODES : DARK_MODES;
  return {
    keyOffset: KEY_OFFSETS[seed % KEY_OFFSETS.length],
    mode: modes[Math.floor(seed / 8) % modes.length],
    patternShift: Math.floor(seed / 64) % 7,
  };
}

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

/**
 * How far away the music sits.
 *
 * The first cut of these videos mixed the bed close and loud, and it buried
 * the thing the viewer is actually there to read. The bed is atmosphere, not
 * performance: it should sound like it is coming from somewhere else entirely,
 * a long way off, and never ask for attention.
 *
 * 1500 Hz is the working number for "very distant" — past about a kilometre of
 * air there is essentially nothing above it left to hear.
 */
export const BED_DISTANCE = { cutoffHz: 1500, diffusionMs: 90, wet: 0.5 };

/**
 * Normalise first, then apply distance — not the other way round.
 *
 * Normalising afterwards would undo the physics: the hat layer is noise
 * high-passed at 8 kHz, so almost nothing survives a 1.5 kHz low-pass, and
 * RMS-matching that residue back up to the others turns a hi-hat into
 * amplified hiss. Attenuating layers by how much of them survives the air is
 * the entire point. A hi-hat a mile away is inaudible, and it should be.
 */
const finishLayer = (buffer) =>
  deClick(limitPeak(distant(normalizeRms(softClip(buffer, 1.2), BED_RMS_DB), BED_DISTANCE), -3));

/**
 * Each builder returns named layers of equal length. The score decides which
 * are audible when; nothing here knows about a specific video.
 */
const BUILDERS = {
  /** Playful plucked synth. Escalates by stacking percussion. */
  DevJoke(duration, bpm, v) {
    const step = gridStep(bpm);
    const root = 57 + v.keyOffset; // A3, transposed
    const pattern = [0, 2, 4, 2, 5, 4, 2, 0].map((n) => n + v.patternShift);
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
        place(layers.pluck, pluck(degree(v.mode, root + 12, pattern[(i / 2) % pattern.length]), step * 2), seconds(t));
      }
      if (i % 8 === 0) place(layers.kick, kick(), seconds(t));
      if (i % 4 === 2) place(layers.shaker, shaker(13 + i), seconds(t));
      if (i % 2 === 1) place(layers.hat, hat(17 + i), seconds(t));
      if (i % 16 === 0) place(layers.bass, bassNote(root - 12 + (i % 32 === 16 ? 5 : 0), step * 16), seconds(t));
    }
    return layers;
  },

  /** Clean electronic pulse. One stab per reveal is placed by the score. */
  TechTip(duration, bpm, v) {
    const step = gridStep(bpm);
    const root = 55 + v.keyOffset; // G3, transposed
    const layers = {
      pulse: layerBuffer(duration),
      sub: layerBuffer(duration),
      pad: layerBuffer(duration),
      hat: layerBuffer(duration),
    };

    place(layers.pad, pad([root + 12, root + 12 + v.mode[2], root + 12 + v.mode[4]], duration), 0);
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
  SiteRoast(duration, bpm, v) {
    const step = gridStep(bpm);
    const root = 53 + v.keyOffset; // F3, transposed
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
      if (i % 8 === 4) place(layers.lead, pluck(degree(v.mode, root + 12, Math.floor(i / 8) + v.patternShift), step * 4), seconds(t));
    }
    return layers;
  },

  /** Minimal build that grows with the graph. */
  CaseStudy(duration, bpm, v) {
    const step = gridStep(bpm);
    const root = 50 + v.keyOffset; // D3, transposed
    const layers = {
      pad: layerBuffer(duration),
      pulse: layerBuffer(duration),
      bell: layerBuffer(duration),
      sub: layerBuffer(duration),
    };

    place(layers.pad, pad([root + 12, root + 12 + v.mode[2], root + 12 + v.mode[4], root + 12 + v.mode[6]], duration), 0);
    for (let i = 0; step * i < duration; i++) {
      const t = step * i;
      if (i % 4 === 0) {
        place(layers.pulse, gain(pluck(degree(v.mode, root + 24, i / 4 + v.patternShift), step * 3), 0.55), seconds(t));
      }
      if (i % 16 === 0) place(layers.sub, bassNote(root - 12, step * 16), seconds(t));
      if (i % 32 === 8) place(layers.bell, gain(pluck(degree(v.mode, root + 36, 2 + v.patternShift), step * 8), 0.4), seconds(t));
    }
    return layers;
  },

  /** Piano first, strings later. The score keeps both silent for 3s. */
  FounderStory(duration, bpm, v) {
    const step = gridStep(bpm) * 4; // quarter notes; this bed is free-time
    const root = 48 + v.keyOffset; // C3, transposed
    const layers = {
      piano: layerBuffer(duration),
      stringsLow: layerBuffer(duration),
      stringsHigh: layerBuffer(duration),
    };

    const melody = [0, 4, 2, 5, 4, 7, 5, 4].map((n) => n + v.patternShift);
    for (let i = 0; step * i < duration; i++) {
      if (i % 2 === 0) {
        place(layers.piano, gain(piano(degree(v.mode, root + 12, melody[(i / 2) % melody.length]), step * 3), 0.7), seconds(step * i));
      }
    }
    place(layers.stringsLow, strings([root, root + v.mode[4], root + 12], duration), 0);
    place(layers.stringsHigh, strings([root + 12 + v.mode[2], root + 12 + v.mode[4], root + 24], duration), 0);
    return layers;
  },

  /** Warm full build for the recap. */
  Recap(duration, bpm, v) {
    const step = gridStep(bpm);
    const root = 52 + v.keyOffset; // E3, transposed
    const layers = {
      pad: layerBuffer(duration),
      pluck: layerBuffer(duration),
      kick: layerBuffer(duration),
      bell: layerBuffer(duration),
      bass: layerBuffer(duration),
    };

    place(layers.pad, pad([root + 12, root + 12 + v.mode[2], root + 12 + v.mode[4]], duration), 0);
    for (let i = 0; step * i < duration; i++) {
      const t = step * i;
      if (i % 2 === 0) place(layers.pluck, gain(pluck(degree(v.mode, root + 24, i / 2 + v.patternShift), step * 2), 0.6), seconds(t));
      if (i % 8 === 0) place(layers.kick, kick(), seconds(t));
      if (i % 16 === 0) place(layers.bass, bassNote(root - 12, step * 16), seconds(t));
      if (i % 32 === 16) place(layers.bell, gain(pluck(degree(v.mode, root + 36, 4 + v.patternShift), step * 8), 0.35), seconds(t));
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

/** Which templates sit in a major-ish register. */
const BRIGHT = new Set(["CaseStudy", "Recap", "TechTip"]);

export function buildBed(template, durationSeconds, seedSource = null) {
  const builder = BUILDERS[template];
  if (!builder) throw new Error(`no bed defined for template "${template}"`);

  const bpm = BED_BPM[template];
  const seed = seedSource === null ? null : seedFrom(seedSource);
  const v = variation(seed, BRIGHT.has(template));
  const layers = builder(durationSeconds, bpm, v);
  return {
    bpm,
    key: v.keyOffset,
    mode: v.mode.join(","),
    layers: Object.fromEntries(Object.entries(layers).map(([name, buffer]) => [name, finishLayer(buffer)])),
  };
}
