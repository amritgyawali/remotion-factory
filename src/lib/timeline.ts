/**
 * The one architectural rule: every animated value in a video is a pure
 * function of the frame number, computed in one place. Components draw; they
 * do not animate.
 *
 * The existing templates do the opposite — `spring()` and `interpolate()` are
 * scattered across a dozen components, each owning a slice of the timing. That
 * is why the SiteRoast markers could sit on top of the call to action without
 * anything noticing: no single place knew what the frame was supposed to look
 * like, so there was nothing to check against.
 *
 * Centralising the state buys four things, in rising order of how much they
 * matter:
 *
 *   1. Tuning is one file. Every layout fix is a number here, not a component
 *      rewrite.
 *   2. A freeze becomes exact. `hold()` returns a literal constant, so a frozen
 *      beat is genuinely thirty identical frames — never "a spring that has
 *      mostly settled", which is what you get when a component owns its own
 *      motion and you ask it to stop.
 *   3. A seamless loop becomes true by construction rather than by careful
 *      matching: `loopRemap` makes the last second *be* the first second,
 *      re-evaluated.
 *   4. All three become testable without rendering a pixel. scripts/timeline
 *      tests assert loop identity and freeze constancy by calling getState,
 *      which is the only way to catch them — none of it is visible in a
 *      preview and all of it ships broken otherwise.
 *
 * Ported from the Day 1 build, whose write-up puts it better than this comment
 * does: see learn-remotion-technique/day-1-video-generation.
 */

/**
 * This module imports nothing — deliberately.
 *
 * The first version pulled `spring` and `interpolate` from `remotion`, which
 * made the timeline unusable outside a Remotion render: bundling it for a test
 * dragged in react-dom and died on a dynamic require. That is a signal, not an
 * inconvenience. A description of what a video does at frame N should be
 * readable by a test, a script, or a different renderer entirely.
 *
 * The springs below are the same analytic damped-harmonic-oscillator solution
 * Remotion uses, and there is no drift risk in having a second copy, because
 * there is no second *caller*: every animated value in a timeline-driven
 * template is computed here and nowhere else. Components receive numbers and
 * draw them. If this file and Remotion ever disagreed, nothing would notice,
 * because nothing else asks Remotion for a spring.
 */

export const FPS = 30;

export type Easing = (x: number) => number;

export const Easing = {
  linear: (x: number) => x,
  out: (x: number) => 1 - Math.pow(1 - x, 3),
  in: (x: number) => x * x * x,
  inOut: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  quadInOut: (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
};

/**
 * Damped harmonic oscillator, returning 0..1 progress.
 *
 * Read the damping *ratio*, not the damping:
 *   zeta = damping / (2 * sqrt(stiffness * mass))
 * Below 1 it overshoots; at or above 1 it does not.
 */
export function spring(
  frame: number,
  { stiffness = 100, damping = 10, mass = 1, velocity = 0 }: Partial<SpringConfig> = {},
  fps = FPS,
): number {
  if (frame <= 0) return 0;
  const t = frame / fps;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const b = (zeta * w0 - velocity) / wd;
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + b * Math.sin(wd * t));
  }
  const b = -velocity + w0;
  return 1 - Math.exp(-w0 * t) * (1 + b * t);
}

/** Clamped piecewise-linear interpolation with optional easing. */
export function interpolate(
  input: number,
  inRange: readonly number[],
  outRange: readonly number[],
  easing: Easing = Easing.linear,
): number {
  let i = 0;
  for (; i < inRange.length - 2; i += 1) {
    if (input < inRange[i + 1]) break;
  }
  const inMin = inRange[i];
  const inMax = inRange[i + 1];
  const outMin = outRange[i];
  const outMax = outRange[i + 1];

  let p = inMax === inMin ? 0 : (input - inMin) / (inMax - inMin);
  if (p < 0) p = 0;
  if (p > 1) p = 1;
  return outMin + (outMax - outMin) * easing(p);
}

/** Seconds to frames. "Second 7 is frame 210" lives here and nowhere else. */
export const S = (seconds: number): number => Math.round(seconds * FPS);

export const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

/**
 * Spring presets, named for what they do rather than for their numbers.
 *
 * Read the damping *ratio*, not the damping: zeta = damping / (2·sqrt(stiffness·mass)).
 * Below 1 the spring overshoots, at or above 1 it does not. HARD_SNAP is
 * zeta 0.60 — about six percent overshoot, which is what makes a value read as
 * having *landed* rather than having arrived. That overshoot is the comedy in
 * an escalation; it is not a side effect to be tuned out.
 */
export const HARD_SNAP = { stiffness: 100, damping: 12 } as const;
export const SNAP_BACK = { stiffness: 140, damping: 14 } as const;
export const POP = { stiffness: 220, damping: 16 } as const;
export const SETTLE = { stiffness: 160, damping: 18 } as const;
export const ARRIVE = { stiffness: 200, damping: 15 } as const;

export type SpringConfig = {
  stiffness: number;
  damping: number;
  mass?: number;
  /** Initial velocity. Rarely useful here, but the solution takes it. */
  velocity?: number;
};

/** One rung of a ladder: hold `a` until `from`, then spring to `b`. */
export type Segment = {
  from: number;
  a: number;
  b: number;
  cfg?: SpringConfig;
};

/**
 * A value that steps through segments as the frame advances.
 *
 * A segment with `a === b` is a hard freeze and returns the literal constant —
 * no spring is evaluated, so the frames really are identical rather than
 * differing in the sixth decimal place. That distinction is the whole reason
 * a freeze can be asserted in a test.
 */
export function ladder(frame: number, segments: Segment[], fps = FPS): number {
  if (segments.length === 0) {
    throw new Error("ladder() needs at least one segment");
  }

  let active = segments[0];
  for (const segment of segments) {
    if (frame >= segment.from) active = segment;
  }

  if (active.a === active.b) return active.a;

  const progress = spring(frame - active.from, active.cfg ?? HARD_SNAP, fps);
  return active.a + (active.b - active.a) * progress;
}

/**
 * Remap the tail of a clip onto its head so a replay is invisible.
 *
 * The last `cutLength` frames before `bodyEnd` are re-evaluated as frames
 * `0..cutLength`, which makes them identical to the opening by construction.
 * Matching them by hand — animating back to roughly the starting pose — is the
 * usual approach and it is never quite pixel-exact, so the loop visibly ticks.
 *
 * A viewer who does not notice the loop watches the whole thing twice, which on
 * a fifteen-second video is most of the retention the format has to offer.
 */
export function loopRemap(rawFrame: number, bodyEnd: number, cutLength: number): number {
  const cutStart = bodyEnd - cutLength;
  return rawFrame >= cutStart && rawFrame < bodyEnd ? rawFrame - cutStart : rawFrame;
}

/** A window with a spring-driven entrance, or null when the frame is outside it. */
export type Beat = { from: number; to: number };

export function within(frame: number, beat: Beat): boolean {
  return frame >= beat.from && frame < beat.to;
}

/**
 * Opacity that ramps in over `inFrames` and, optionally, back out at the end.
 * Three or four frames — long enough not to pop, short enough not to waste a
 * third of a one-second beat on a fade.
 */
export function fade(
  frame: number,
  beat: Beat,
  { inFrames = 4, outFrames = 0 }: { inFrames?: number; outFrames?: number } = {},
): number {
  const local = frame - beat.from;
  const length = beat.to - beat.from;
  if (outFrames > 0) {
    return interpolate(local, [0, inFrames, length - outFrames, length], [0, 1, 1, 0]);
  }
  return interpolate(local, [0, inFrames], [0, 1]);
}

/** Spring progress local to a beat, for scale and translate entrances. */
export function enter(
  frame: number,
  from: number,
  cfg: SpringConfig = POP,
  fps = FPS,
): number {
  return spring(frame - from, cfg, fps);
}

/**
 * Derive one value from another value rather than from time.
 *
 * `driven(logoH, [200, 280], [360, 30])` says the hero squashes because the
 * logo is 280px, not because it is second four. Retime the rung that grows the
 * logo and the squash retimes itself — which is what keeps a timeline free of
 * magic frame numbers scattered through the layout. It is the single most
 * reusable idea in the Day 1 build.
 */
export function driven(
  value: number,
  inRange: readonly number[],
  outRange: readonly number[],
  easing: Easing = Easing.linear,
): number {
  return interpolate(value, inRange, outRange, easing);
}
