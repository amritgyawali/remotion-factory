import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { mono, SERIES_LENGTH, type Theme } from "../theme";

const MARGIN = 72;

/**
 * The signature element: a ledger rule that measures the video's position
 * in the 30-day run. The numbering is meaningful here — this genuinely is
 * a sequence, and day 24 of 30 tells a returning viewer something true.
 */
export const Frame: React.FC<{
  theme: Theme;
  day: number;
  eyebrow: string;
  kicker?: string;
  children: React.ReactNode;
}> = ({ theme, day, eyebrow, kicker, children }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width } = useVideoConfig();

  const draw = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 24 });
  const ruleWidth = (width - MARGIN * 2) * (day / SERIES_LENGTH) * draw;

  // Slow ambient drift so a static composition never looks frozen.
  const drift = interpolate(frame, [0, durationInFrames], [0, 1]);

  const exit = interpolate(
    frame,
    [durationInFrames - 10, durationInFrames - 1],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: theme.ground, opacity: exit }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 70% at ${18 + drift * 24}% ${
            12 + drift * 10
          }%, ${theme.groundLift} 0%, transparent 62%)`,
        }}
      />

      {/* Grain. Keeps flat colour fields from banding after platform re-encode. */}
      <AbsoluteFill style={{ opacity: 0.11, mixBlendMode: "overlay" }}>
        <svg width="100%" height="100%">
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={3} />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
      </AbsoluteFill>

      {/* Eyebrow */}
      <div
        style={{
          position: "absolute",
          top: MARGIN + 24,
          left: MARGIN,
          right: MARGIN,
          fontFamily: mono,
          fontSize: 28,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: theme.amber,
          opacity: draw,
        }}
      >
        {eyebrow}
      </div>

      {children}

      {/* Ledger rule */}
      <div style={{ position: "absolute", left: MARGIN, right: MARGIN, bottom: 232 }}>
        <div style={{ height: 2, backgroundColor: theme.rule, width: "100%" }} />
        <div
          style={{
            height: 2,
            backgroundColor: theme.amber,
            width: ruleWidth,
            marginTop: -2,
          }}
        />
        <div
          style={{
            fontFamily: mono,
            fontSize: 24,
            letterSpacing: "0.14em",
            color: theme.paperDim,
            marginTop: 22,
            display: "flex",
            justifyContent: "space-between",
            opacity: draw,
          }}
        >
          <span>
            DAY {String(day).padStart(2, "0")} / {SERIES_LENGTH}
          </span>
          {kicker ? <span style={{ color: theme.seaglass }}>{kicker}</span> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const CONTENT_MARGIN = MARGIN;
