import {
  concat,
  decayTo,
  deClick,
  envelope,
  gain,
  highpass,
  lowpass,
  mix,
  noise,
  normalizePeak,
  osc,
  resonantLowpass,
  seconds,
  semitones as ratio,
  silence,
  softClip,
} from "./synth.mjs";

/**
 * The sound-effect catalogue.
 *
 * Every entry here is named by an actual cue in the thirty scripts — "hard
 * shutter snap", "low comedic boing", "descending download tone" — rather than
 * being a generic library. Each takes a `semitones` offset because the PDF's
 * pitch-escalation technique repeats one effect a semitone higher per beat to
 * imply rising absurdity (days 1, 8 and 16).
 *
 * The PDF puts SFX at -8 to -12 dBFS and calls them "your dialogue ... present
 * and deliberate, never background texture", so each is peak-normalised into
 * that window instead of being left at whatever the synthesis produced.
 */

const SFX_PEAK_DB = -9;

const finish = (buffer, db = SFX_PEAK_DB) => deClick(normalizePeak(softClip(buffer, 1.4), db));

/** Hard camera-shutter snap. The workhorse of the DevJoke scripts. */
export function snap({ semitones: st = 0 } = {}) {
  const k = ratio(st);
  const body = resonantLowpass(
    noise({ duration: 0.09, gain: decayTo(0.012), seed: 7 }),
    (t) => 2600 * k * Math.exp(-t / 0.02),
    6,
  );
  const click = osc({
    duration: 0.05,
    freq: (t) => 1800 * k * Math.exp(-t / 0.008),
    type: "triangle",
    gain: decayTo(0.006),
  });
  return finish(mix(body, gain(click, 0.7)));
}

/** Soft comedic pop, used on the snap-back beats. */
export function pop({ semitones: st = 0 } = {}) {
  const k = ratio(st);
  return finish(
    osc({
      duration: 0.14,
      freq: (t) => 420 * k * Math.exp(-t / 0.03) + 90 * k,
      type: "sine",
      gain: envelope({ attack: 0.003, decay: 0.11, release: 0.02 }),
    }),
  );
}

/** Low comedic boing — descending pitch with a wobble. */
export function boing({ semitones: st = 0 } = {}) {
  const k = ratio(st);
  return finish(
    osc({
      duration: 0.5,
      freq: (t) => (240 * k * Math.exp(-t / 0.18) + 55) * (1 + 0.22 * Math.sin(2 * Math.PI * 11 * t)),
      type: "triangle",
      gain: envelope({ attack: 0.004, decay: 0.42, release: 0.06 }),
    }),
  );
}

/** Sub-bass thump for the biggest hits. */
export function subThump({ semitones: st = 0 } = {}) {
  const k = ratio(st);
  return finish(
    osc({
      duration: 0.6,
      freq: (t) => 90 * k * Math.exp(-t / 0.06) + 32 * k,
      type: "sine",
      gain: envelope({ attack: 0.004, decay: 0.5, release: 0.08 }),
    }),
    -7,
  );
}

/** Dull, anticlimactic thud. Deliberately unsatisfying in the roast scripts. */
export function thud({ semitones: st = 0 } = {}) {
  const k = ratio(st);
  const tone = osc({
    duration: 0.3,
    freq: (t) => 140 * k * Math.exp(-t / 0.05) + 60 * k,
    type: "sine",
    gain: decayTo(0.07),
  });
  return finish(mix(tone, lowpass(noise({ duration: 0.12, gain: decayTo(0.02), seed: 31 }), 400)));
}

/** Hard thunk on a wipe. More attack than thud, less weight than subThump. */
export function thunk({ semitones: st = 0 } = {}) {
  const k = ratio(st);
  const tone = osc({
    duration: 0.26,
    freq: (t) => 300 * k * Math.exp(-t / 0.02) + 85 * k,
    type: "triangle",
    gain: decayTo(0.05),
  });
  const body = lowpass(noise({ duration: 0.08, gain: decayTo(0.014), seed: 12 }), 1400);
  return finish(mix(tone, gain(body, 0.8)));
}

/**
 * Filtered-noise sweep. Covers every whoosh in the scripts — zoom, pan, wipe,
 * paper-slide — by moving the filter in the requested direction.
 */
export function whoosh({ direction = "up", duration = 0.45, semitones: st = 0 } = {}) {
  const k = ratio(st);
  const from = direction === "down" ? 3800 : 380;
  const to = direction === "down" ? 380 : 3800;
  const swept = resonantLowpass(
    noise({ duration, gain: envelope({ attack: 0.06, decay: duration * 0.6, release: 0.12 }), seed: 5 }),
    (t) => (from + (to - from) * Math.min(1, t / duration)) * k,
    3.2,
  );
  return finish(highpass(swept, 180));
}

/** Rising tone that tracks a graph climb or an error rate going vertical. */
export function riser({ duration = 0.9, semitones: st = 0, shape = "up" } = {}) {
  const k = ratio(st);
  const low = 220 * k;
  const high = 1400 * k;
  return finish(
    osc({
      duration,
      freq: (t) => {
        const k2 = Math.min(1, t / duration);
        return shape === "down" ? high + (low - high) * k2 : low + (high - low) * k2 ** 1.6;
      },
      type: "triangle",
      gain: envelope({ attack: 0.05, decay: duration * 0.8, sustain: 0.6, release: 0.1 }),
    }),
    -11,
  );
}

/** Short data blip. */
export function blip({ semitones: st = 0 } = {}) {
  const k = ratio(st);
  return finish(
    osc({
      duration: 0.08,
      freq: 1320 * k,
      type: "sine",
      gain: envelope({ attack: 0.002, decay: 0.06, release: 0.015 }),
    }),
    -11,
  );
}

/** Dry UI tick. */
export function tick({ semitones: st = 0 } = {}) {
  const k = ratio(st);
  const body = highpass(noise({ duration: 0.03, gain: decayTo(0.005), seed: 19 }), 2400 * k);
  const tone = osc({ duration: 0.03, freq: 2600 * k, type: "sine", gain: decayTo(0.004) });
  return finish(mix(body, gain(tone, 0.5)), -12);
}

/** Mechanical keyboard tap, one per typed character. */
export function keyTap({ semitones: st = 0 } = {}) {
  const k = ratio(st);
  const click = highpass(noise({ duration: 0.035, gain: decayTo(0.004), seed: 23 }), 1800);
  const body = osc({ duration: 0.05, freq: 180 * k, type: "triangle", gain: decayTo(0.012) });
  return finish(mix(click, gain(body, 0.6)), -12);
}

/** Heavier enter-key thock. */
export function thock({ semitones: st = 0 } = {}) {
  const k = ratio(st);
  const click = lowpass(noise({ duration: 0.06, gain: decayTo(0.008), seed: 29 }), 3000);
  const body = osc({ duration: 0.11, freq: (t) => 150 * k * Math.exp(-t / 0.03) + 90, type: "sine", gain: decayTo(0.03) });
  return finish(mix(click, body), -10);
}

/** Message-arrival ping. */
export function ping({ semitones: st = 0 } = {}) {
  const k = ratio(st);
  return finish(
    mix(
      osc({ duration: 0.5, freq: 1568 * k, type: "sine", gain: decayTo(0.13) }),
      gain(osc({ duration: 0.5, freq: 2349 * k, type: "sine", gain: decayTo(0.08) }), 0.35),
    ),
    -10,
  );
}

/** Warm bell chime. Closes the end card on all thirty. */
export function chime({ semitones: st = 0, duration = 1.4 } = {}) {
  const k = ratio(st);
  const partials = [
    [1, 1],
    [2.01, 0.42],
    [3.02, 0.2],
    [4.05, 0.1],
  ];
  return finish(
    mix(
      partials.map(([multiple, level]) =>
        gain(
          osc({
            duration,
            freq: 880 * k * multiple,
            type: "sine",
            gain: decayTo(0.42 / multiple ** 0.6),
          }),
          level,
        ),
      ),
    ),
    -10,
  );
}

/** High shimmer over a lock or a paint. */
export function shimmer({ semitones: st = 0 } = {}) {
  const k = ratio(st);
  return finish(
    highpass(
      resonantLowpass(noise({ duration: 0.9, gain: decayTo(0.3), seed: 41 }), (t) => 5200 * k + 2000 * Math.sin(2 * Math.PI * 6 * t), 7),
      3000,
    ),
    -14,
  );
}

/** Two-tone alarm blip. `severity` lowers it a tone for the more serious beat. */
export function alarmBlip({ semitones: st = 0, severity = 0 } = {}) {
  const k = ratio(st - severity * 2);
  const one = osc({ duration: 0.13, freq: 760 * k, type: "square", gain: envelope({ attack: 0.004, decay: 0.1, release: 0.02 }) });
  const two = osc({ duration: 0.13, freq: 620 * k, type: "square", gain: envelope({ attack: 0.004, decay: 0.1, release: 0.02 }) });
  return finish(lowpass(concat(one, silence(0.03), two), 2600), -11);
}

/** Logo sting: a short rising chord stab under the end card mark. */
export function logoSting({ semitones: st = 0 } = {}) {
  const k = ratio(st);
  const chord = [0, 4, 7, 11].map((interval) =>
    gain(
      osc({
        duration: 1.1,
        freq: 220 * k * ratio(interval),
        type: "triangle",
        gain: envelope({ attack: 0.02, decay: 0.9, sustain: 0.15, release: 0.18 }),
      }),
      0.3,
    ),
  );
  return finish(lowpass(mix(chord), 5200), -10);
}

/** Record scratch. */
export function scratch({ semitones: st = 0 } = {}) {
  const k = ratio(st);
  return finish(
    resonantLowpass(
      noise({ duration: 0.32, gain: envelope({ attack: 0.01, decay: 0.26, release: 0.05 }), seed: 53 }),
      (t) => (900 + 2600 * Math.abs(Math.sin(2 * Math.PI * 7 * t))) * k,
      9,
    ),
    -10,
  );
}

/** Tape zip, for rewinds into a loop and hard tape stops. */
export function tapeZip({ direction = "up", duration = 0.36, semitones: st = 0 } = {}) {
  const k = ratio(st);
  const from = direction === "down" ? 1600 : 300;
  const to = direction === "down" ? 220 : 2400;
  const body = osc({
    duration,
    freq: (t) => (from + (to - from) * (t / duration) ** 1.4) * k,
    type: "saw",
    gain: envelope({ attack: 0.01, decay: duration * 0.7, sustain: 0.4, release: 0.08 }),
  });
  const hiss = highpass(noise({ duration, gain: decayTo(duration / 2), seed: 61 }), 2600);
  return finish(lowpass(mix(gain(body, 0.6), gain(hiss, 0.35)), 6000), -11);
}

/** Comedic timpani hit on a punchline stamp. */
export function timpani({ semitones: st = 0 } = {}) {
  const k = ratio(st);
  const tone = osc({
    duration: 0.9,
    freq: (t) => 110 * k * Math.exp(-t / 0.25) + 68 * k,
    type: "sine",
    gain: envelope({ attack: 0.005, decay: 0.75, release: 0.12 }),
  });
  const skin = lowpass(noise({ duration: 0.14, gain: decayTo(0.03), seed: 71 }), 900);
  return finish(mix(tone, gain(skin, 0.5)), -8);
}

/** Comedic horn stab. */
export function hornStab({ semitones: st = 0 } = {}) {
  const k = ratio(st);
  const voices = [0, 7, 12].map((interval) =>
    gain(
      osc({
        duration: 0.42,
        freq: 233 * k * ratio(interval),
        type: "saw",
        gain: envelope({ attack: 0.02, decay: 0.3, sustain: 0.3, release: 0.1 }),
      }),
      0.3,
    ),
  );
  return finish(lowpass(mix(voices), 2600), -10);
}

/** Rising error whine. */
export function whine({ duration = 0.8, semitones: st = 0 } = {}) {
  const k = ratio(st);
  return finish(
    osc({
      duration,
      freq: (t) => (300 + 1500 * (t / duration) ** 2) * k,
      type: "saw",
      gain: envelope({ attack: 0.04, decay: duration * 0.7, sustain: 0.5, release: 0.1 }),
    }),
    -12,
  );
}

/** Sustained loading hum. Deliberately empty and unsatisfying. */
export function hum({ duration = 1.5, semitones: st = 0 } = {}) {
  const k = ratio(st);
  const tone = mix(
    osc({ duration, freq: 110 * k, type: "sine", gain: 0.6 }),
    gain(osc({ duration, freq: 165 * k, type: "sine", gain: 0.25 }), 0.5),
  );
  return finish(lowpass(gain(tone, envelope({ attack: 0.12, decay: 0.1, sustain: 0.85, hold: duration - 0.4, release: 0.2 })), 700), -18);
}

/** Low scroll rumble under a long page scroll. */
export function rumble({ duration = 1.5 } = {}) {
  return finish(
    lowpass(
      noise({ duration, gain: envelope({ attack: 0.1, decay: 0.1, sustain: 0.8, hold: duration - 0.35, release: 0.25 }), seed: 83 }),
      220,
    ),
    -16,
  );
}

/** Paper rustle / slide. */
export function rustle({ duration = 0.5 } = {}) {
  return finish(
    highpass(
      resonantLowpass(
        noise({ duration, gain: envelope({ attack: 0.05, decay: duration * 0.7, release: 0.1 }), seed: 97 }),
        (t) => 2200 + 900 * Math.sin(2 * Math.PI * 9 * t),
        2.5,
      ),
      900,
    ),
    -14,
  );
}

/** Calendar / badge stamp. */
export function stamp({ semitones: st = 0 } = {}) {
  const k = ratio(st);
  const hit = lowpass(noise({ duration: 0.07, gain: decayTo(0.012), seed: 103 }), 1800);
  const wood = osc({ duration: 0.12, freq: (t) => 420 * k * Math.exp(-t / 0.015) + 170 * k, type: "triangle", gain: decayTo(0.03) });
  return finish(mix(hit, wood), -10);
}

/** Timer-start beep. */
export function beep({ semitones: st = 0 } = {}) {
  const k = ratio(st);
  return finish(
    osc({ duration: 0.12, freq: 990 * k, type: "sine", gain: envelope({ attack: 0.005, decay: 0.09, release: 0.02 }) }),
    -12,
  );
}

/** Bright confirmation chime — the "ship it" beat. */
export function confirm({ semitones: st = 0 } = {}) {
  const k = ratio(st);
  const notes = [0, 4, 7];
  return finish(
    mix(
      notes.map((interval, index) => {
        const lead = silence(index * 0.055);
        return concat(
          lead,
          osc({
            duration: 0.7,
            freq: 1046 * k * ratio(interval),
            type: "sine",
            gain: decayTo(0.2),
          }),
        );
      }),
    ),
    -9,
  );
}

/**
 * A run of ticks that accelerates and resolves, for counters animating to a
 * final number. Returned as one buffer so it stays locked to its start frame.
 */
export function counterRun({ duration = 1.2, count = 14, semitones: st = 0 } = {}) {
  const out = new Float32Array(seconds(duration + 0.4));
  for (let i = 0; i < count; i++) {
    // Ease-out spacing: fast at first, settling onto the final value.
    const position = 1 - (1 - i / count) ** 2;
    const one = tick({ semitones: st + i * 0.35 });
    const offset = Math.round(position * seconds(duration));
    for (let j = 0; j < one.length && offset + j < out.length; j++) out[offset + j] += one[j] * 0.7;
  }
  const resolve = ping({ semitones: st + 4 });
  for (let j = 0; j < resolve.length && seconds(duration) + j < out.length; j++) {
    out[seconds(duration) + j] += resolve[j] * 0.8;
  }
  return finish(out, -10);
}

export const CATALOGUE = {
  snap,
  pop,
  boing,
  subThump,
  thud,
  thunk,
  whoosh,
  riser,
  blip,
  tick,
  keyTap,
  thock,
  ping,
  chime,
  shimmer,
  alarmBlip,
  logoSting,
  scratch,
  tapeZip,
  timpani,
  hornStab,
  whine,
  hum,
  rumble,
  rustle,
  stamp,
  beep,
  confirm,
  counterRun,
};
