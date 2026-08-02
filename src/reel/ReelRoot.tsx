import React from "react";
import { Composition } from "remotion";
import { Reel } from "./Reel";

/**
 * Register every reel composition so the bundle includes them.
 *
 * Each video in the campaign is its own composition, keyed by id. The bundler
 * needs every composition registered at build time — a composition that is not
 * registered is invisible to selectComposition(), so the render step would fail
 * with a clear "composition not found" rather than a mysterious blank render.
 *
 * `inputProps` comes from the brief JSON the workflow passes. This is deliberate
 * rather than using `defaultProps`: the props are not defaults, they are the
 * actual copy, mechanism and beat structure for that video. A render without
 * props renders nothing useful.
 */

/**
 * The reel template accepts every brief field that affects the render.
 * The composition only needs to exist — the real props arrive from the workflow.
 */
export type ReelProps = {
  id: string;
  visualSystem: string;
  beats: { copy: string; highlight?: string }[];
  mechanism: string;
  title: string;
  audio?: {
    rootHz: number;
    bpm: number;
    peak: number;
    cues: {
      frame: number;
      kind: "tone" | "sweep" | "noise";
      seconds?: number;
      gain?: number;
      hz?: number;
      sweep?: number;
    }[];
  };
  caption?: string;
  hashtags?: string[];
  day?: number;
  slot?: string;
};

const FPS = 30;
const VERTICAL = { width: 1080, height: 1920, fps: FPS } as const;

/**
 * Minimal valid props so the composition exists in the bundle.
 * Real props arrive via inputProps from the workflow.
 */
const DEFAULT_REEL_PROPS: ReelProps = {
  id: "placeholder",
  visualSystem: "sandbox",
  beats: [
    { copy: "Beat one" },
    { copy: "Beat two" },
    { copy: "Beat three" },
    { copy: "Beat four" },
    { copy: "Beat five" },
  ],
  mechanism: "containment",
  title: "Placeholder Reel",
};

/**
 * The reel composition, registered once.
 *
 * A single composition handles every video. Each video gets its own brief file
 * that describes its copy, mechanism, palette and audio, and the workflow
 * passes that brief as inputProps when it calls selectComposition.
 *
 * This means:
 * - The bundle is one webpack build, not 120.
 * - A change to the Reel component applies to every video on the next render.
 * - Each video's uniqueness comes from its props, not from being a different
 *   component.
 */
export const ReelCompositions: React.FC = () => (
  <Composition
    id="Reel"
    component={Reel}
    {...VERTICAL}
    durationInFrames={900}
    defaultProps={DEFAULT_REEL_PROPS}
  />
);
