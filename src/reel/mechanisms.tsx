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
 *    empty top zone) — the usable region is roughly x 100-910, y 200-1580;
 *  - animates on every frame of its beat window — no 2-second still;
 *  - shows *evidence*, never a caption. If the mechanism could be replaced by
 *    its copy line, it is not a mechanism.
 *
 * Five beats of 180 frames each, matching Reel's BEAT_STARTS (0/180/360/540/720).
 * Each mechanism receives beatIndex so it can push its argument one stage
 * further per beat, while `frame` supplies continuous motion within a beat.
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

/** Progress through the current beat, 0-1, clamped. Continuous motion driver. */
const beatProgress = (frame: number, beatIndex: number) =>
  interpolate(frame, [beatIndex * 180, beatIndex * 180 + 180], [0, 1], clamp);

/** Never a negative width/height/radius. SVG geometry eats negative values. */
const nonNeg = (value: number) => Math.max(0, value);

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

/** The usable horizontal band inside the safe area. */
const X = { left: 110, right: 910 };
const MID_X = (X.left + X.right) / 2;
const BAND = { top: 240, bottom: 1520 };
const MID_Y = (BAND.top + BAND.bottom) / 2;

/** A sealed volume with things trying to pass its boundary. */
const Containment: React.FC<MechanismProps> = ({ frame, fps, beatIndex, theme }) => {
  const pulse = Math.sin(frame / 6);

  const wallX = X.left;
  const wallY = 520;
  const wallW = X.right - X.left;
  const wallH = 700;

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
          opacity: 0.7 + 0.2 * Math.abs(pulse),
          boxShadow: `inset 0 0 80px ${theme.seaglass}44`,
        }}
      />
      {/* Permission rings opening one by one as beats advance */}
      {[0, 1, 2, 3].map((ring) => {
        const opened = beatIndex >= ring;
        const gap = ring * 24;
        return (
          <div
            key={ring}
            style={{
              position: "absolute",
              left: wallX + wallW / 2 - 110 - gap,
              top: wallY + wallH / 2 - 110 - gap,
              width: 220 + gap * 2,
              height: 220 + gap * 2,
              borderRadius: "50%",
              border: opened ? `3px solid ${theme.seaglass}` : `3px solid ${theme.groundLift}`,
              opacity: opened ? 0.6 : 0.15,
            }}
          />
        );
      })}
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
          boxShadow: `0 0 24px ${theme.amber}`,
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

  // The aperture closes as beats advance: a recording that seals itself.
  const aperture = beatIndex / 4;
  const apertureSize = 160 * (1 - aperture);

  return (
    <AbsoluteFill style={{ position: "absolute", inset: 0 }}>
      {/* The scan cone */}
      <div
        style={{
          position: "absolute",
          left: X.left,
          top,
          width: X.right - X.left,
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
          left: X.left + 200,
          top: 600,
          width: 300,
          height: 380,
          border: `3px solid ${theme.seaglass}`,
          borderRadius: 12,
          backgroundColor: `${theme.seaglass}22`,
          opacity: 0.8,
        }}
      />
      {/* Aperture — a lens iris that closes over the subject */}
      <div
        style={{
          position: "absolute",
          left: X.left + 320,
          top: 620,
          width: nonNeg(apertureSize),
          height: nonNeg(apertureSize),
          borderRadius: "50%",
          backgroundColor: theme.ground,
          border: `3px solid ${theme.amber}`,
          opacity: 0.85,
          display: "grid",
          placeItems: "center",
        }}
      >
        <div
          style={{
            width: nonNeg(apertureSize * 0.4),
            height: nonNeg(apertureSize * 0.4),
            borderRadius: "50%",
            backgroundColor: theme.amber,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

/** Cost travelling along a chain: token -> rack -> substation -> meter. */
const UtilityChain: React.FC<MechanismProps> = ({ frame, beatIndex, theme }) => {
  const y = MID_Y;
  const stations = 5;
  const bp = beatProgress(frame, beatIndex);

  // A packet flows along the chain on a looping course.
  const t = (frame % 120) / 120;
  const px = X.left + t * (X.right - X.left);
  const py = y + Math.sin(frame / 9) * 6;

  // The meter needle climbs as beats advance.
  const needle = interpolate(beatIndex * 180 + 60, [60, 900], [0.08, 0.92], clamp);

  return (
    <AbsoluteFill style={{ position: "absolute", inset: 0 }}>
      <svg width={1080} height={1920} style={{ position: "absolute", top: 0, left: 0 }}>
        {/* The chain rail */}
        <line
          x1={X.left}
          y1={y}
          x2={X.right}
          y2={y}
          stroke={theme.rule}
          strokeWidth={4}
        />
        {/* Stations */}
        {Array.from({ length: stations }, (_, index) => {
          const sx = X.left + ((X.right - X.left) * index) / (stations - 1);
          const lit = index <= beatIndex;
          return (
            <g key={index}>
              <rect
                x={sx - 26}
                y={y - 34}
                width={52}
                height={68}
                rx={8}
                fill={lit ? `${theme.seaglass}33` : theme.groundLift}
                stroke={lit ? theme.seaglass : theme.rule}
                strokeWidth={lit ? 3 : 2}
              />
              <line
                x1={sx}
                y1={y + 34}
                x2={sx}
                y2={y + 48}
                stroke={theme.paperDim}
                strokeWidth={2}
              />
            </g>
          );
        })}
        {/* The flowing packet */}
        <circle cx={px} cy={py} r={12} fill={theme.amber} opacity={0.9} />
        <circle cx={px} cy={py} r={22} fill={theme.amber} opacity={0.18} />
      </svg>
      {/* The meter at the end */}
      <div
        style={{
          position: "absolute",
          left: X.right - 150,
          top: y + 90,
          width: 130,
          height: 110,
          borderRadius: 14,
          border: `3px solid ${theme.seaglass}`,
          backgroundColor: `${theme.seaglass}1a`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 18,
            top: 14,
            width: 6,
            height: 70,
            borderRadius: 3,
            backgroundColor: `${theme.seaglass}44`,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: -3,
              bottom: Math.round(70 * needle),
              width: 12,
              height: 12,
              borderRadius: "50%",
              backgroundColor: theme.amber,
              boxShadow: `0 0 14px ${theme.amber}`,
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            right: 10,
            top: 14,
            width: 60,
            height: 70,
            display: "flex",
            alignItems: "flex-end",
            gap: 3,
          }}
        >
          {[1, 2, 3, 4, 5].map((bar) => (
            <div
              key={bar}
              style={{
                flex: 1,
                height: `${(bar / 5) * 100}%`,
                backgroundColor: bar / 5 <= needle ? theme.amber : `${theme.paper}22`,
                borderRadius: 2,
              }}
            />
          ))}
        </div>
      </div>
      {/* Progress note: nothing more appears before beat 2 */}
      <div
        style={{
          position: "absolute",
          left: X.left,
          top: y + 90,
          width: 220,
          height: 90,
          borderRadius: 14,
          border: `2px solid ${theme.rule}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: bp,
        }}
      >
        <div style={{ fontFamily: theme.mono, fontSize: 22, color: theme.paperDim }}>
          {`COST ${Math.round(bp * 100)}%`}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** A document, a stamp, and the probability behind a verdict. */
const Forensics: React.FC<MechanismProps> = ({ frame, beatIndex, theme }) => {
  const cx = MID_X;
  const docY = 620;
  const stampImpact = spring({
    frame: frame - 0,
    fps: 30,
    config: { damping: 8, mass: 0.6 },
    durationInFrames: 12,
  });

  // The stamp hits at beat 0, then cracks as beats advance.
  const stampScale = 0.4 + stampImpact * 0.6;
  const cracked = beatIndex >= 1;

  // The probability curve: a bell with uncertain, flat tails that grows.
  const curve = Array.from({ length: 21 }, (_, index) => {
    const t = index / 20 - 0.5;
    const sigma = 0.16 + (1 - beatProgress(frame, beatIndex)) * 0.06;
    const height = Math.exp(-(t * t) / (2 * sigma * sigma));
    return { x: cx - 180 + index * 18, y: 980 - height * 200 };
  });

  return (
    <AbsoluteFill style={{ position: "absolute", inset: 0 }}>
      {/* The document */}
      <div
        style={{
          position: "absolute",
          left: cx - 170,
          top: docY,
          width: 340,
          height: 420,
          borderRadius: 8,
          backgroundColor: theme.paper,
          opacity: 0.94,
          boxShadow: `0 20px 60px ${theme.ground}`,
        }}
      >
        {[0, 1, 2, 3, 4].map((line) => (
          <div
            key={line}
            style={{
              position: "absolute",
              left: 30,
              top: 70 + line * 66,
              width: line % 2 === 0 ? 200 : 150,
              height: 12,
              borderRadius: 6,
              backgroundColor: `${theme.ground}33`,
            }}
          />
        ))}
      </div>
      {/* The stamp, slamming down on the document */}
      <div
        style={{
          position: "absolute",
          left: cx - 80,
          top: docY + 120,
          width: 160,
          height: 160,
          borderRadius: 18,
          border: `5px solid ${theme.amber}`,
          display: "grid",
          placeItems: "center",
          transform: `scale(${stampScale}) rotate(${(1 - stampImpact) * -12}deg)`,
          opacity: stampImpact,
        }}
      >
        <div
          style={{
            fontFamily: theme.mono,
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: theme.amber,
            textAlign: "center",
          }}
        >
          NOT
          <br />
          PROOF
        </div>
      </div>
      {/* The probability curve the stamp breaks into */}
      <svg width={1080} height={1920} style={{ position: "absolute", top: 0, left: 0 }}>
        <polyline
          points={curve.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={cracked ? theme.amber : theme.rule}
          strokeWidth={4}
          opacity={beatIndex >= 1 ? 1 : 0.3}
        />
      </svg>
      {/* Evidence tabs counterweighting the stamp */}
      {[0, 1, 2].map((tab) => (
        <div
          key={tab}
          style={{
            position: "absolute",
            left: cx - 120 + tab * 120,
            top: 1150 + (tab % 2) * 24,
            width: 90,
            height: 46,
            borderRadius: 8,
            border: `2px solid ${theme.seaglass}`,
            backgroundColor: `${theme.seaglass}22`,
            display: "grid",
            placeItems: "center",
            opacity: beatIndex >= 2 ? 1 : 0,
          }}
        >
          <div style={{ fontFamily: theme.mono, fontSize: 16, color: theme.seaglass }}>
            {tab === 0 ? "DRAFT" : tab === 1 ? "CITES" : "EDITS"}
          </div>
        </div>
      ))}
    </AbsoluteFill>
  );
};

/** Two panels that turn out to be one object. */
const FoldedClaim: React.FC<MechanismProps> = ({ frame, beatIndex, theme }) => {
  const fold = beatProgress(frame, beatIndex);
  const center = MID_X;
  const y = MID_Y - 60;

  // Two panels rotate on the Y axis toward each other, folding into one cube.
  const leftAngle = interpolate(fold, [0, 1], [0, 90], clamp);
  const rightAngle = interpolate(fold, [0, 1], [0, -90], clamp);

  return (
    <AbsoluteFill style={{ position: "absolute", inset: 0 }}>
      {/* Left panel */}
      <div
        style={{
          position: "absolute",
          left: center - 190,
          top: y - 130,
          width: 190,
          height: 260,
          borderRadius: 10,
          border: `3px solid ${theme.seaglass}`,
          backgroundColor: `${theme.seaglass}26`,
          transform: `perspective(900px) rotateY(${leftAngle}deg)`,
          transformOrigin: "right center",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: theme.mono,
            fontSize: 20,
            color: theme.paperDim,
            textAlign: "center",
          }}
        >
          NOT CAUSED
        </div>
      </div>
      {/* Right panel */}
      <div
        style={{
          position: "absolute",
          left: center,
          top: y - 130,
          width: 190,
          height: 260,
          borderRadius: 10,
          border: `3px solid ${theme.amber}`,
          backgroundColor: `${theme.amber}26`,
          transform: `perspective(900px) rotateY(${rightAngle}deg)`,
          transformOrigin: "left center",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: theme.mono,
            fontSize: 20,
            color: theme.paperDim,
            textAlign: "center",
          }}
        >
          CHANGED WORK
        </div>
      </div>
      {/* The single object they fold into */}
      <div
        style={{
          position: "absolute",
          left: center - 95,
          top: y - 130,
          width: 190,
          height: 260,
          borderRadius: 10,
          border: `3px solid ${theme.amber}`,
          backgroundColor: `${theme.amber}33`,
          opacity: fold,
          display: "grid",
          placeItems: "center",
        }}
      >
        <div
          style={{
            fontFamily: theme.display,
            fontSize: 34,
            color: theme.paper,
          }}
        >
          1
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Stations and a queue, with a bottleneck that backs it up. */
const AssemblyLine: React.FC<MechanismProps> = ({ frame, beatIndex, theme }) => {
  const y = MID_Y;
  const stations = 4;
  const bp = beatProgress(frame, beatIndex);

  return (
    <AbsoluteFill style={{ position: "absolute", inset: 0 }}>
      {/* The line */}
      <svg width={1080} height={1920} style={{ position: "absolute", top: 0, left: 0 }}>
        <line x1={X.left} y1={y} x2={X.right} y2={y} stroke={theme.rule} strokeWidth={3} />
        {Array.from({ length: stations }, (_, index) => {
          const sx = X.left + ((X.right - X.left) * index) / (stations - 1);
          const isBottleneck = index === 2 && beatIndex >= 1;
          return (
            <rect
              key={index}
              x={sx - 30}
              y={y - 60}
              width={60}
              height={120}
              rx={8}
              fill={isBottleneck ? `${theme.amber}26` : `${theme.seaglass}1f`}
              stroke={isBottleneck ? theme.amber : theme.seaglass}
              strokeWidth={isBottleneck ? 4 : 2}
              opacity={index <= beatIndex ? 1 : 0.35}
            />
          );
        })}
        {/* Items flowing, bunching behind the bottleneck */}
        {Array.from({ length: 7 }, (_, index) => {
          const speed = index < 4 ? 1 : 1.6;
          const t = ((frame * speed + index * 26) % 240) / 240;
          const bx = X.left + 40 + t * (X.right - X.left - 80);
          const blocked = index >= 3 && beatIndex >= 1 && t > 0.55 && t < 0.75;
          return (
            <circle
              key={index}
              cx={bx}
              cy={y + 40}
              r={9}
              fill={blocked ? theme.amber : theme.paperDim}
              opacity={blocked ? 0.95 : 0.7}
            />
          );
        })}
      </svg>
      {/* Bottleneck label builds at beat 2+ */}
      <div
        style={{
          position: "absolute",
          left: X.left + ((X.right - X.left) * 2) / (stations - 1) - 70,
          top: y + 90,
          width: 140,
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: theme.mono,
          fontSize: 18,
          color: theme.amber,
          opacity: beatIndex >= 2 ? bp : 0,
        }}
      >
        BOTTLENECK
      </div>
    </AbsoluteFill>
  );
};

/** One sealed column against a wide, shallow field. */
const VaultVsField: React.FC<MechanismProps> = ({ frame, beatIndex, theme }) => {
  const bp = beatProgress(frame, beatIndex);
  const columnX = X.left + 60;
  const fieldX = X.left + 330;
  const fieldW = X.right - fieldX - 30;

  return (
    <AbsoluteFill style={{ position: "absolute", inset: 0 }}>
      {/* The sealed column — tall, narrow, one item deep */}
      <div
        style={{
          position: "absolute",
          left: columnX,
          top: MID_Y - 380,
          width: 150,
          height: 760,
          borderRadius: 12,
          border: `3px solid ${theme.amber}`,
          backgroundColor: `${theme.amber}14`,
          overflow: "hidden",
        }}
      >
        {/* Sealed bands across it */}
        {[0, 1, 2, 3].map((band) => (
          <div
            key={band}
            style={{
              position: "absolute",
              left: 0,
              top: 140 + band * 150,
              width: 150,
              height: 8,
              backgroundColor: theme.ground,
              borderBottom: `2px solid ${theme.amber}`,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            fontFamily: theme.mono,
            fontSize: 18,
            letterSpacing: "0.2em",
            color: theme.amber,
          }}
        >
          ONE
        </div>
      </div>
      {/* The wide shallow field — many small slots */}
      <div
        style={{
          position: "absolute",
          left: fieldX,
          top: MID_Y - 120,
          width: fieldW,
          height: 240,
          borderRadius: 12,
          border: `3px solid ${theme.seaglass}`,
          backgroundColor: `${theme.seaglass}0f`,
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gridTemplateRows: "repeat(3, 1fr)",
          gap: 4,
          padding: 8,
          boxSizing: "border-box",
        }}
      >
        {Array.from({ length: 24 }, (_, index) => (
          <div
            key={index}
            style={{
              borderRadius: 4,
              backgroundColor: index < beatIndex * 4 ? `${theme.seaglass}66` : `${theme.paper}14`,
            }}
          />
        ))}
      </div>
      {/* A marker travelling between them */}
      <div
        style={{
          position: "absolute",
          left: columnX + 150 + bp * (fieldX - columnX - 150) + 30,
          top: MID_Y + 60,
          width: 18,
          height: 18,
          borderRadius: "50%",
          backgroundColor: theme.amber,
          boxShadow: `0 0 18px ${theme.amber}`,
        }}
      />
    </AbsoluteFill>
  );
};

/** A graph that consumes its own sources. */
const FeedingWeb: React.FC<MechanismProps> = ({ frame, beatIndex, theme }) => {
  const cx = MID_X;
  const cy = MID_Y - 60;
  const sources = 5;
  const consume = beatProgress(frame, beatIndex);

  return (
    <AbsoluteFill style={{ position: "absolute", inset: 0 }}>
      <svg width={1080} height={1920} style={{ position: "absolute", top: 0, left: 0 }}>
        {/* Source nodes on a ring, being pulled toward the centre as beats advance */}
        {Array.from({ length: sources }, (_, index) => {
          const angle = (index / sources) * Math.PI * 2;
          const radius = 300 - beatIndex * 34;
          const sx = cx + Math.cos(angle) * radius;
          const sy = cy + Math.sin(angle) * radius;
          const pulled = beatIndex > 0;
          return (
            <g key={index}>
              <line
                x1={cx}
                y1={cy}
                x2={sx}
                y2={sy}
                stroke={theme.rule}
                strokeWidth={2}
                strokeDasharray="4 6"
              />
              <circle
                cx={sx}
                cy={sy}
                r={20}
                fill={pulled ? `${theme.seaglass}33` : theme.groundLift}
                stroke={pulled ? theme.seaglass : theme.rule}
                strokeWidth={2}
              />
            </g>
          );
        })}
        {/* The central node, growing as sources feed it */}
        <circle
          cx={cx}
          cy={cy}
          r={44 + beatIndex * 6 + Math.sin(frame / 10) * 3}
          fill={theme.amber}
          opacity={0.85}
        />
        <circle cx={cx} cy={cy} r={70 + beatIndex * 8} fill={theme.amber} opacity={0.12} />
      </svg>
      {/* Feeding pulses along the spokes */}
      {[0, 1, 2].map((pulse) => {
        const t = ((frame + pulse * 40) % 120) / 120;
        const angle = (pulse / 3) * Math.PI * 2;
        const radius = 60 + t * 240;
        return (
          <div
            key={pulse}
            style={{
              position: "absolute",
              left: cx + Math.cos(angle) * radius - 7,
              top: cy + Math.sin(angle) * radius - 7,
              width: 14,
              height: 14,
              borderRadius: "50%",
              backgroundColor: theme.paper,
              opacity: 1 - t,
            }}
          />
        );
      })}
      {/* Consumption meter — how much of the ring is drained */}
      <div
        style={{
          position: "absolute",
          left: cx - 90,
          top: cy + 160,
          width: 180,
          height: 16,
          borderRadius: 8,
          backgroundColor: `${theme.paper}1f`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.round(consume * 100)}%`,
            height: "100%",
            backgroundColor: theme.amber,
            borderRadius: 8,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

/** Two ledgers, with costs transferring between them. */
const OrbitalLedger: React.FC<MechanismProps> = ({ frame, beatIndex, theme }) => {
  const bp = beatProgress(frame, beatIndex);
  const ledgerY = MID_Y - 220;
  const ledgerW = 300;
  const ledgerH = 440;

  return (
    <AbsoluteFill style={{ position: "absolute", inset: 0 }}>
      {/* Left ledger (company) */}
      <div
        style={{
          position: "absolute",
          left: MID_X - ledgerW - 40,
          top: ledgerY,
          width: ledgerW,
          height: ledgerH,
          borderRadius: 12,
          border: `3px solid ${theme.seaglass}`,
          backgroundColor: `${theme.seaglass}14`,
          padding: 20,
          boxSizing: "border-box",
        }}
      >
        {[0, 1, 2, 3, 4].map((row) => (
          <div
            key={row}
            style={{
              height: 40,
              marginBottom: 12,
              borderRadius: 6,
              backgroundColor:
                beatIndex >= 3 ? theme.amber : `${theme.paper}1f`,
              opacity: 0.85,
            }}
          />
        ))}
      </div>
      {/* Right ledger (public) */}
      <div
        style={{
          position: "absolute",
          left: MID_X + 40,
          top: ledgerY,
          width: ledgerW,
          height: ledgerH,
          borderRadius: 12,
          border: `3px solid ${theme.amber}`,
          backgroundColor: `${theme.amber}14`,
          padding: 20,
          boxSizing: "border-box",
        }}
      >
        {[0, 1, 2, 3, 4].map((row) => (
          <div
            key={row}
            style={{
              height: 40,
              marginBottom: 12,
              borderRadius: 6,
              backgroundColor: beatIndex >= 3 ? theme.amber : `${theme.paper}1f`,
              opacity: 0.85,
            }}
          />
        ))}
      </div>
      {/* A cost token transferring left -> right as beats advance */}
      <div
        style={{
          position: "absolute",
          left: MID_X - 20 + bp * 40,
          top: ledgerY + ledgerH / 2 - 16,
          width: 32,
          height: 32,
          borderRadius: "50%",
          backgroundColor: theme.amber,
          boxShadow: `0 0 22px ${theme.amber}`,
          opacity: beatIndex >= 2 ? 1 : 0,
        }}
      />
      {/* The receiving meter fills on the right */}
      <div
        style={{
          position: "absolute",
          left: MID_X + 40,
          top: ledgerY + ledgerH + 24,
          width: ledgerW,
          height: 14,
          borderRadius: 7,
          backgroundColor: `${theme.paper}1f`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.round(bp * 100)}%`,
            height: "100%",
            backgroundColor: theme.amber,
            borderRadius: 7,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

/** A local action with a planetary halo. */
const SharedSky: React.FC<MechanismProps> = ({ frame, beatIndex, theme }) => {
  const cx = MID_X;
  const cy = MID_Y;
  const bp = beatProgress(frame, beatIndex);

  return (
    <AbsoluteFill style={{ position: "absolute", inset: 0 }}>
      {/* Concentric planetary rings expanding from the local object */}
      {[0, 1, 2, 3].map((ring) => {
        const t = ((frame + ring * 30) % 120) / 120;
        const radius = 60 + t * 420;
        return (
          <div
            key={ring}
            style={{
              position: "absolute",
              left: cx - radius,
              top: cy - radius,
              width: radius * 2,
              height: radius * 2,
              borderRadius: "50%",
              border: `2px solid ${theme.seaglass}`,
              opacity: (1 - t) * 0.7,
            }}
          />
        );
      })}
      {/* The local object — a small building at the centre */}
      <div
        style={{
          position: "absolute",
          left: cx - 60,
          top: cy - 70,
          width: 120,
          height: 140,
          borderRadius: 8,
          backgroundColor: theme.paper,
          opacity: 0.95,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: 12,
          boxSizing: "border-box",
        }}
      >
        {[0, 1, 2].map((window) => (
          <div
            key={window}
            style={{
              width: 30,
              height: 30,
              borderRadius: 4,
              backgroundColor: theme.amber,
              marginBottom: 10,
            }}
          />
        ))}
      </div>
      {/* Halo brightness scales with how far the local action travels */}
      <div
        style={{
          position: "absolute",
          left: cx - 200,
          top: cy - 200,
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.amber}22 0%, transparent 70%)`,
          opacity: 0.5 + bp * 0.4,
        }}
      />
    </AbsoluteFill>
  );
};

/** One waveform, branching inference, and consent gates. */
const SignalRights: React.FC<MechanismProps> = ({ frame, beatIndex, theme }) => {
  const cx = MID_X;
  const baseY = MID_Y - 300;
  const branches = 3;

  return (
    <AbsoluteFill style={{ position: "absolute", inset: 0 }}>
      {/* The base waveform */}
      <svg width={1080} height={1920} style={{ position: "absolute", top: 0, left: 0 }}>
        <path
          d={Array.from({ length: 41 }, (_, index) => {
            const x = cx - 200 + index * 10;
            const y = baseY + Math.sin(frame / 8 + index / 3) * 30;
            return `${index === 0 ? "M" : "L"}${x},${y}`;
          }).join(" ")}
          fill="none"
          stroke={theme.paperDim}
          strokeWidth={3}
        />
        {/* Branch paths fanning out, each with a consent gate */}
        {Array.from({ length: branches }, (_, index) => {
          const angle = -0.5 + index * 0.5;
          const branchProgress = beatProgress(frame, beatIndex);
          const open = index <= beatIndex;
          const endX = cx + Math.sin(angle) * 380;
          const endY = baseY + 360 + Math.cos(angle) * 120;
          const gateX = cx + Math.sin(angle) * 280;
          const gateY = baseY + 240;
          return (
            <g key={index}>
              <line
                x1={cx}
                y1={baseY}
                x2={endX}
                y2={endY}
                stroke={open ? theme.seaglass : theme.rule}
                strokeWidth={3}
                strokeDasharray={open ? "none" : "4 6"}
                opacity={0.8}
              />
              <circle
                cx={gateX}
                cy={gateY}
                r={26}
                fill={open ? `${theme.seaglass}22` : theme.groundLift}
                stroke={open ? theme.seaglass : theme.rule}
                strokeWidth={3}
                opacity={branchProgress}
              />
            </g>
          );
        })}
      </svg>
      {/* The gates render above the SVG as consent chips */}
      {[0, 1, 2].map((index) => {
        const gateX = cx + Math.sin(-0.5 + index * 0.5) * 280 - 22;
        const gateY = baseY + 240 - 22;
        const open = index <= beatIndex;
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: gateX,
              top: gateY,
              width: 44,
              height: 44,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              backgroundColor: open ? theme.seaglass : theme.ground,
              color: theme.ground,
              fontSize: 24,
              fontWeight: 700,
              opacity: open ? 1 : 0,
            }}
          >
            ✓
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** A machine improving as data enters it. */
const TrainingLoop: React.FC<MechanismProps> = ({ frame, beatIndex, theme }) => {
  const cx = MID_X;
  const cy = MID_Y - 40;
  const bp = beatProgress(frame, beatIndex);

  // Data dots entering on the left.
  const dataT = (frame % 100) / 100;

  return (
    <AbsoluteFill style={{ position: "absolute", inset: 0 }}>
      {/* The machine box */}
      <div
        style={{
          position: "absolute",
          left: cx - 200,
          top: cy - 130,
          width: 400,
          height: 260,
          borderRadius: 16,
          border: `3px solid ${theme.seaglass}`,
          backgroundColor: `${theme.seaglass}14`,
          overflow: "hidden",
        }}
      >
        {/* Inner rings suggesting the loop */}
        <div
          style={{
            position: "absolute",
            left: 40,
            top: 40,
            width: 320,
            height: 180,
            borderRadius: 10,
            border: `2px solid ${theme.rule}`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 110,
            top: 90,
            width: 180,
            height: 80,
            borderRadius: 10,
            border: `2px dashed ${theme.seaglass}`,
            display: "grid",
            placeItems: "center",
          }}
        >
          <div style={{ fontFamily: theme.mono, fontSize: 16, color: theme.paperDim }}>
            TRAIN
          </div>
        </div>
      </div>
      {/* Data dots entering from the left */}
      {[0, 1, 2].map((dot) => {
        const t = ((dataT + dot * 0.33) % 1);
        const x = cx - 260 + t * 90;
        const y = cy - 20 + dot * 40;
        return (
          <div
            key={dot}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 16,
              height: 16,
              borderRadius: "50%",
              backgroundColor: theme.amber,
              opacity: t < 0.8 ? 1 : 0,
            }}
          />
        );
      })}
      {/* Output dots exiting to the right, cleaner */}
      {[0, 1].map((dot) => {
        const t = ((dataT + 0.5 + dot * 0.5) % 1);
        const x = cx + 260 - t * 90;
        const y = cy - 10 + dot * 50;
        return (
          <div
            key={dot}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 22,
              height: 22,
              borderRadius: "50%",
              border: `3px solid ${theme.seaglass}`,
              backgroundColor: `${theme.seaglass}33`,
              opacity: t > 0.2 ? 1 : 0,
            }}
          />
        );
      })}
      {/* Accuracy curve rising with each beat */}
      <svg width={1080} height={1920} style={{ position: "absolute", top: 0, left: 0 }}>
        <path
          d={Array.from({ length: 5 }, (_, index) => {
            const x = cx - 200 + index * 100;
            const y = cy + 210 - Math.pow(index / 4, 0.7) * 140 - (index <= beatIndex ? 0 : 0);
            return `${index === 0 ? "M" : "L"}${x},${y}`;
          }).join(" ")}
          fill="none"
          stroke={theme.amber}
          strokeWidth={4}
          opacity={0.9}
        />
      </svg>
      {/* Accuracy percentage */}
      <div
        style={{
          position: "absolute",
          left: cx + 120,
          top: cy + 120,
          fontFamily: theme.mono,
          fontSize: 30,
          color: theme.amber,
        }}
      >
        {Math.round(40 + bp * 58)}%
      </div>
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
  "utility-chain": UtilityChain,
  forensics: Forensics,
  "folded-claim": FoldedClaim,
  "assembly-line": AssemblyLine,
  "vault-vs-field": VaultVsField,
  "feeding-web": FeedingWeb,
  "orbital-ledger": OrbitalLedger,
  "shared-sky": SharedSky,
  "signal-rights": SignalRights,
  "training-loop": TrainingLoop,
};

export const MECHANISM_IDS = Object.keys(MECHANISMS) as MechanismId[];

export function resolveMechanism(id: MechanismId): React.FC<MechanismProps> {
  const mechanism = MECHANISMS[id];
  if (!mechanism) {
    throw new Error(`brief names unknown mechanism "${id}"`);
  }
  return mechanism;
}
