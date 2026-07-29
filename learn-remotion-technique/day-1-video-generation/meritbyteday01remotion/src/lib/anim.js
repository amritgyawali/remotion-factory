// MeritByte Silent Motion System — animation primitives.
//
// These replicate Remotion's `spring` and `interpolate` math exactly so that the
// preview renderer (vanilla DOM + Chromium) and the Remotion render produce
// identical pixels. Every value in this system is a pure function of `frame`,
// which is the core Remotion contract.

export const FPS = 30;

/**
 * Analytic damped-harmonic-oscillator spring, identical to Remotion's spring().
 * Returns a 0..1 progress value.
 * damping 12  -> hard snap (slight overshoot)
 * damping 200 -> soft settle (no overshoot)
 */
export function spring(frame, { stiffness = 100, damping = 10, mass = 1, velocity = 0 } = {}, fps = FPS) {
  if (frame <= 0) return 0;
  const t = frame / fps;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const a = 1; // to - from, normalised
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const b = (zeta * w0 - velocity) / wd;
    return 1 - Math.exp(-zeta * w0 * t) * (a * Math.cos(wd * t) + b * Math.sin(wd * t));
  }
  const b = -velocity + w0;
  return 1 - Math.exp(-w0 * t) * (a + b * t);
}

/** Clamped linear interpolation across an input/output range, with optional easing. */
export function interpolate(input, inRange, outRange, opts = {}) {
  const { easing = (x) => x, extrapolateLeft = 'clamp', extrapolateRight = 'clamp' } = opts;
  let i = 0;
  for (; i < inRange.length - 2; i++) if (input < inRange[i + 1]) break;
  const inMin = inRange[i], inMax = inRange[i + 1];
  const outMin = outRange[i], outMax = outRange[i + 1];
  let p = inMax === inMin ? 0 : (input - inMin) / (inMax - inMin);
  if (p < 0 && extrapolateLeft === 'clamp') p = 0;
  if (p > 1 && extrapolateRight === 'clamp') p = 1;
  return outMin + (outMax - outMin) * easing(p);
}

export const Easing = {
  linear: (x) => x,
  out: (x) => 1 - Math.pow(1 - x, 3),
  in: (x) => x * x * x,
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  quadInOut: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
};

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Seconds -> frames. Second 7 is frame 210 at 30fps. */
export const S = (sec) => Math.round(sec * FPS);
