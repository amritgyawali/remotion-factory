/**
 * A small synthesis core, written from scratch so the whole soundtrack is
 * generated rather than licensed.
 *
 * The source PDF's hardest rule is that nothing in the audio track may read as
 * a human voice, and it warns that instrumental libraries are "full of tracks
 * with faint vocal pads, breaths and chanting". Oscillators and filtered noise
 * cannot produce a voice, so the rule holds by construction rather than by
 * listening to every bed and hoping.
 *
 * Everything here is a pure function over Float32Array mono buffers at
 * SAMPLE_RATE. No dependencies, fully deterministic: the same cue list always
 * renders the same bytes, which matters when renders happen unattended.
 */

export const SAMPLE_RATE = 48000;

/** Values that may be a constant or a function of time in seconds. */
const at = (value, t) => (typeof value === "function" ? value(t) : value);

export const seconds = (n) => Math.max(0, Math.round(n * SAMPLE_RATE));
export const silence = (duration) => new Float32Array(seconds(duration));

/** Equal temperament. Pitch escalation in the scripts is expressed in semitones. */
export const semitones = (n) => 2 ** (n / 12);
export const noteHz = (midi) => 440 * 2 ** ((midi - 69) / 12);

export const dbToGain = (db) => 10 ** (db / 20);

/**
 * Phase-accumulating oscillator. `freq` and `gain` accept functions of time,
 * which is what makes sweeps, vibrato and envelopes composable without a
 * separate modulation graph.
 */
export function osc({ duration, freq, type = "sine", gain = 1, phase = 0 }) {
  const out = new Float32Array(seconds(duration));
  let ph = phase;

  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const f = at(freq, t);
    ph += (2 * Math.PI * f) / SAMPLE_RATE;
    if (ph > 2 * Math.PI) ph -= 2 * Math.PI;

    let sample;
    switch (type) {
      case "square":
        sample = Math.sin(ph) >= 0 ? 1 : -1;
        break;
      case "saw":
        sample = 1 - ph / Math.PI;
        break;
      case "triangle":
        sample = (2 / Math.PI) * Math.asin(Math.sin(ph));
        break;
      default:
        sample = Math.sin(ph);
    }
    out[i] = sample * at(gain, t);
  }
  return out;
}

/**
 * Deterministic white noise. A seeded PRNG rather than Math.random so a rebuild
 * of the audio pack is byte-identical and does not churn the git diff.
 */
export function noise({ duration, gain = 1, seed = 1 }) {
  const out = new Float32Array(seconds(duration));
  let state = seed >>> 0 || 1;

  for (let i = 0; i < out.length; i++) {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    out[i] = ((state / 0xffffffff) * 2 - 1) * at(gain, i / SAMPLE_RATE);
  }
  return out;
}

/**
 * Percussive envelope. `attack` is short but never zero — an instantaneous
 * start produces a click, which in a near-silent mix is more audible than the
 * cue itself.
 */
export function envelope({ attack = 0.004, decay = 0.2, sustain = 0, hold = 0, release = 0.05 }) {
  return (t) => {
    if (t < attack) return t / attack;
    const afterAttack = t - attack;
    if (afterAttack < hold) return 1;
    const afterHold = afterAttack - hold;
    if (afterHold < decay) {
      const k = afterHold / decay;
      return 1 + (sustain - 1) * k;
    }
    const afterDecay = afterHold - decay;
    if (afterDecay < release) return sustain * (1 - afterDecay / release);
    return 0;
  };
}

/** Exponential decay, the natural shape for snaps, ticks and thumps. */
export const decayTo = (tau) => (t) => Math.exp(-t / tau);

export function lowpass(input, cutoffHz) {
  const out = new Float32Array(input.length);
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = 1 / SAMPLE_RATE / (rc + 1 / SAMPLE_RATE);
  let previous = 0;

  for (let i = 0; i < input.length; i++) {
    previous += alpha * (input[i] - previous);
    out[i] = previous;
  }
  return out;
}

export function highpass(input, cutoffHz) {
  const out = new Float32Array(input.length);
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = rc / (rc + 1 / SAMPLE_RATE);
  let previousIn = 0;
  let previousOut = 0;

  for (let i = 0; i < input.length; i++) {
    previousOut = alpha * (previousOut + input[i] - previousIn);
    previousIn = input[i];
    out[i] = previousOut;
  }
  return out;
}

/**
 * State-variable filter. Resonance is what separates a synthesised "whoosh" or
 * "boing" from a dull noise burst, and a one-pole cannot provide it.
 */
export function resonantLowpass(input, cutoffHz, q = 4) {
  const out = new Float32Array(input.length);
  let low = 0;
  let band = 0;

  for (let i = 0; i < input.length; i++) {
    const f = 2 * Math.sin((Math.PI * at(cutoffHz, i / SAMPLE_RATE)) / SAMPLE_RATE);
    const high = input[i] - low - (1 / q) * band;
    band += f * high;
    low += f * band;
    out[i] = low;
  }
  return out;
}

/** Sum buffers of differing lengths into one the length of the longest. */
export function mix(...buffers) {
  const flat = buffers.flat().filter(Boolean);
  const out = new Float32Array(Math.max(0, ...flat.map((b) => b.length)));
  for (const buffer of flat) {
    for (let i = 0; i < buffer.length; i++) out[i] += buffer[i];
  }
  return out;
}

/** Write `source` into `target` starting at a sample offset, summing overlaps. */
export function place(target, source, offsetSamples) {
  const start = Math.max(0, Math.round(offsetSamples));
  for (let i = 0; i < source.length && start + i < target.length; i++) {
    target[start + i] += source[i];
  }
  return target;
}

export function gain(input, amount) {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] * at(amount, i / SAMPLE_RATE);
  return out;
}

export function concat(...buffers) {
  const flat = buffers.flat().filter(Boolean);
  const out = new Float32Array(flat.reduce((total, b) => total + b.length, 0));
  let offset = 0;
  for (const buffer of flat) {
    out.set(buffer, offset);
    offset += buffer.length;
  }
  return out;
}

/** Fade the very edges to zero so concatenated regions cannot click. */
export function deClick(input, ms = 3) {
  const n = Math.min(seconds(ms / 1000), Math.floor(input.length / 2));
  for (let i = 0; i < n; i++) {
    const k = i / n;
    input[i] *= k;
    input[input.length - 1 - i] *= k;
  }
  return input;
}

/**
 * tanh saturation. Prevents the true-peak overshoot the PDF's -1 dBTP master
 * target rules out, and does it musically instead of by hard clipping.
 */
export function softClip(input, drive = 1) {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = Math.tanh(input[i] * drive) / Math.tanh(drive);
  return out;
}

export const peak = (input) => input.reduce((max, s) => Math.max(max, Math.abs(s)), 0);

export function rms(input) {
  if (!input.length) return 0;
  let sum = 0;
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
  return Math.sqrt(sum / input.length);
}

export function normalizePeak(input, targetDb = -1) {
  const current = peak(input);
  return current === 0 ? input : gain(input, dbToGain(targetDb) / current);
}

/**
 * Attenuate only if the buffer exceeds the ceiling, leaving quieter material
 * untouched. Loudness-matching transient-heavy content by RMS can push peaks
 * past full scale — a hat layer is mostly silence, so matching its average
 * lifts its spikes — and 16-bit conversion would clip them.
 */
export function limitPeak(input, ceilingDb = -3) {
  const current = peak(input);
  const ceiling = dbToGain(ceilingDb);
  return current <= ceiling || current === 0 ? input : gain(input, ceiling / current);
}

/**
 * Loudness match by RMS.
 *
 * Real LUFS needs K-weighting and gated block analysis; RMS is a close enough
 * proxy for material this narrow-band, and it keeps the bed sitting under the
 * SFX at the ratio the PDF's mix table asks for. Final true-peak safety is
 * handled separately by normalizePeak.
 */
export function normalizeRms(input, targetDb) {
  const current = rms(input);
  return current === 0 ? input : gain(input, dbToGain(targetDb) / current);
}

/** 16-bit PCM WAV. Remotion reads this directly via <Audio>. */
export function toWav(input, { channels = 1, sampleRate = SAMPLE_RATE } = {}) {
  const frames = Math.floor(input.length / channels);
  const dataBytes = frames * channels * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < frames * channels; i++) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buffer;
}
