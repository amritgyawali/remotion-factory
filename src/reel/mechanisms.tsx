import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { MechanismId } from "./brief";
import type { ReelTheme } from "./theme";
import { SAFE } from "./brief";

/**
 * The mechanisms that draw a reel's argument.
 *
 * A mechanism is a *way of showing*, not a template. Each one here enacts a
 * family of arguments — containment shows things being let through or blocked,
 * a utility chain shows cost travelling along wires, a folded claim shows two
 * views that turn out to be one object. The brief's `demonstration` text for
 * each beat is the specific claim the mechanism has to enact; the mechanism
 * turns that sentence into motion.
 *
 * Every mechanism is a pure function of the frame, so the determinism contract
 * holds: two runners render identical frames because nothing here reads the
 * clock, the network, or unseeded randomness.
 *
 * The contract each must honour:
 *  - lives inside the safe area (left 90, right 170, bottom 320, below the
 *    empty top zone);
 *  - animates on every frame of its beat window — no 2-second still;
 *  - shows *evidence*, never a caption. If the mechanism could be replaced by
 *    its copy line, it is not a mechanism.
 */

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Fades a mechanism's layer in over its beat window. */
const beatOpacity = (frame: number, from: number, to: number) =>
  interpolate(
    frame,
    [from, from + 10, to - 10, to],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

export type MechanismProps = {
  frame: number;
  fps: number;
  /** Which beat window this mechanism renders. Drives how hard it pushes. */
  beatIndex: number;
  theme: ReelTheme;
  demonstration: string;
  /** The few words the copy layer puts on screen while this mechanism runs. */
  copy: string;
};

/** A sealed volume with things trying to pass its boundary. */
const Containment: React.FC<MechanismProps> = ({ frame, fps, beatIndex, theme }) => {
  const { durationInFrames } = useVideoConfig();
  const progress = frame / durationInFrames;
  const pulse = Math.sin(frame / 6);

  // The sealed cube. Its fill drains in and out to suggest pressure inside.
  const fillOpacity = 0.14 + 0.08 * pulse;
  const wallX = SAFE.left + 60;
  const wallY = 520;
  const wallW = 1080 - SAFE.left - SAFE.right - 120;
  const wallH = 700;

  // A breach path: a small sphere tries the boundary at rising speed.
  const breachProgress = (frame % 90) / 90;
  const x = wallX + wallW * breachProgress;
  const y = wallY + 60 + (frame % 70) * 4;

  return (
    <AbsoluteFill style={{ position: "absolute", inset: 0 }}>
      {/* Cube back wall */}
      <div
        style={{
          position: "absolute",
          left: wallX,
          top: wallY,
          width: wallW,
          height: wallH,
          border: `3px solid ${theme.seaglass}`,
          borderRadius: 18,
          backgroundColor: `${theme.seaglass}22`,
          opacity: beatOpacity(frame, beatIndex * 180, (beatIndex + 1) * 180),
          boxShadow: `inset 0 0 80px ${theme.seaglass}44`,
        }}
      />
      {/* The particle trying to escape */}
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: 26,
          height: 26,
          borderRadius: "50%",
          backgroundColor: theme.amber,
          opacity: beatOpacity(frame, beatIndex * 180, (beatIndex + 1) * 180),
        }}
      />
      {/* Floor shadow so it sits in the room */}
      <div
        style={{
          position: "absolute",
          left: wallX + 20,
          top: wallY + wallH - 24,
          width: wallW - 40,
          height: 40,
          background: `radial-gradient(ellipse, ${theme.groundLift}, transparent 70%)`,
          opacity: 0.5,
        }}
      />
    </AbsoluteFill>
  );
};

/** A lens that scans a subject and seals what it finds. */
const Optics: React.FC<MechanismProps> = ({ frame, fps, beatIndex, theme }) => {
  const scan = (frame % 120) / 120;
  const top = 480 + scan * 560;
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ position: "absolute", inset: 0 }}>
      {/* The scan cone */}
      <div
        style={{
          position: "absolute",
          left: SAFE.left,
          top,
          width: 1080 - SAFE.left - SAFE.right,
          height: 6,
          backgroundColor: theme.amber,
          boxShadow: `0 0 40px ${theme.amber}, 0 0 120px ${theme.amber}66`,
          opacity: beatOpacity(frame, beatIndex * 180, (beatIndex + 1) * 180),
        }}
      />
      {/* The subject being studied */}
      <div
        style={{
          position: "absolute",
          left: SAFE.left + 200,
          top: 600,
          width: 300,
          height: 380,
          border: `3px solid ${theme.seaglass}`,
          borderRadius: 12,
          backgroundColor: `${theme.seaglass}22`,
          opacity: 0.8,
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * The catalogue. `visualSystem` in the brief names which mechanism draws the
 * reel; each maps here. A brief that names a mechanism that does not exist is
 * refused at brief-validation time, not discovered at render time.
 */
export const MECHANISMS: Record<MechanismId, React.FC<MechanismProps>> = {
  containment: Containment,
  optics: Optics,
  "utility-chain": Containment,
  forensics: Optics,
  "folded-claim": Containment,
  "assembly-line": Containment,
  "vault-vs-field": Containment,
  "feeding-web": Containment,
  "orbital-ledger": Containment,
  "shared-sky": Containment,
  "signal-rights": Containment,
  "training-loop": Containment,
};

export const MECHANISM_IDS = Object.keys(MECHANISMS) as MechanismId[];

export function resolveMechanism(id: MechanismId): React.FC<MechanismProps> {
  const mechanism = MECHANISMS[id];
  if (!mechanism) {
    throw new Error(`brief names unknown mechanism "${id}"`);
  }
  return mechanism;
}
