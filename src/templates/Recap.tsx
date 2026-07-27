import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CONTENT_MARGIN, Frame } from "../components/Frame";
import { themeFor, type Theme } from "../theme";
import type { RecapProps } from "../types";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * The transparency recap: day 30, and the only script that needs the other
 * twenty-nine to exist first. Its components are the PDF's ThumbnailGrid,
 * Leaderboard and BlurCounter.
 */

/** A grid of the series so far. Abstract tiles — no humans, per the hard rules. */
const ThumbnailGrid: React.FC<{ theme: Theme; frame: number; fps: number; count: number }> = ({
  theme,
  frame,
  fps,
  count,
}) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(6, 1fr)",
      gap: 10,
    }}
  >
    {Array.from({ length: count }, (_, index) => {
      // Staggered so the grid fills like a contact sheet rather than appearing.
      const enter = spring({
        frame: frame - index * 1.2,
        fps,
        config: { damping: 200, mass: 0.5 },
        durationInFrames: 14,
      });
      const accent = index % 7 === 0 ? theme.amber : index % 5 === 0 ? theme.seaglass : theme.groundLift;
      return (
        <div
          key={index}
          style={{
            aspectRatio: "9 / 16",
            borderRadius: 8,
            backgroundColor: accent,
            opacity: 0.25 + enter * 0.75,
            transform: `scale(${0.7 + enter * 0.3})`,
          }}
        />
      );
    })}
  </div>
);

/** Counter that resolves from blur into a legible number. */
const BlurCounter: React.FC<{
  theme: Theme;
  frame: number;
  fps: number;
  value: number;
  label: string;
  delay: number;
}> = ({ theme, frame, fps, value, label, delay }) => {
  const local = Math.max(0, frame - delay);
  const progress = spring({ frame: local, fps, config: { damping: 200 }, durationInFrames: 30 });
  const shown = Math.round(interpolate(progress, [0, 1], [0, value]));
  const blur = interpolate(progress, [0, 0.85, 1], [14, 2, 0], clamp);

  return (
    <div style={{ opacity: progress }}>
      <div
        style={{
          fontFamily: theme.display,
          fontWeight: 800,
          fontSize: 92,
          lineHeight: 1,
          letterSpacing: theme.displayTracking,
          color: theme.paper,
          filter: `blur(${blur}px)`,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {shown.toLocaleString("en")}
      </div>
      <div
        style={{
          marginTop: 10,
          fontFamily: theme.mono,
          fontSize: 26,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: theme.paperDim,
        }}
      >
        {label}
      </div>
    </div>
  );
};

/** Ranked rows, bars growing in proportion to the top entry. */
const Leaderboard: React.FC<{
  theme: Theme;
  frame: number;
  fps: number;
  rows: RecapProps["leaderboard"];
  delay: number;
}> = ({ theme, frame, fps, rows, delay }) => {
  const top = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {rows.map((row, index) => {
        const enter = spring({
          frame: frame - delay - index * 6,
          fps,
          config: { damping: 200, mass: 0.6 },
          durationInFrames: 22,
        });
        return (
          <div key={row.label} style={{ opacity: enter }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                fontFamily: theme.mono,
                fontSize: 27,
                color: theme.paperDim,
                marginBottom: 8,
              }}
            >
              <span style={{ color: theme.paper }}>{row.label}</span>
              <span style={{ color: theme.amber, fontVariantNumeric: "tabular-nums" }}>
                {row.value.toLocaleString("en")}
              </span>
            </div>
            <div style={{ height: 12, borderRadius: 6, backgroundColor: theme.rule }}>
              <div
                style={{
                  height: 12,
                  borderRadius: 6,
                  width: `${(row.value / top) * 100 * enter}%`,
                  backgroundColor: index === 0 ? theme.amber : theme.seaglass,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const Recap: React.FC<RecapProps> = ({
  hook,
  totals,
  leaderboard,
  lesson,
  gridCount = 30,
  videoId,
  score,
  theme: overrides,
}) => {
  const theme = themeFor(videoId, overrides);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const body = durationInFrames - fps * 2;
  const lessonAt = Math.max(0, body - fps * 4);
  const lessonIn = spring({
    frame: frame - lessonAt,
    fps,
    config: { damping: 200, mass: 0.7 },
    durationInFrames: 20,
  });

  return (
    <Frame theme={theme} template="Recap" score={score}>
      <AbsoluteFill
        style={{
          boxSizing: "border-box",
          paddingTop: 120,
          paddingBottom: 150,
          paddingLeft: CONTENT_MARGIN,
          paddingRight: CONTENT_MARGIN,
          display: "flex",
          flexDirection: "column",
          gap: 34,
        }}
      >
        <div
          style={{
            fontFamily: theme.display,
            fontWeight: 800,
            fontSize: 96,
            lineHeight: 0.96,
            letterSpacing: theme.displayTracking,
            color: theme.paper,
            transform: `scale(${interpolate(frame, [0, 8], [1.02, 1], clamp)})`,
            transformOrigin: "left top",
          }}
        >
          {hook}
        </div>

        <ThumbnailGrid theme={theme} frame={frame} fps={fps} count={gridCount} />

        <div style={{ display: "flex", gap: 48 }}>
          {totals.map((total, index) => (
            <BlurCounter
              key={total.label}
              theme={theme}
              frame={frame}
              fps={fps}
              value={total.value}
              label={total.label}
              delay={fps * (2 + index * 0.8)}
            />
          ))}
        </div>

        <Leaderboard theme={theme} frame={frame} fps={fps} rows={leaderboard} delay={fps * 5} />

        <div
          style={{
            marginTop: "auto",
            padding: "22px 26px",
            borderLeft: `8px solid ${theme.amber}`,
            backgroundColor: theme.paper,
            color: theme.ground,
            fontFamily: theme.display,
            fontWeight: 800,
            fontSize: 52,
            lineHeight: 1.05,
            opacity: lessonIn,
            transform: `translateY(${(1 - lessonIn) * 28}px)`,
          }}
        >
          {lesson}
        </div>
      </AbsoluteFill>
    </Frame>
  );
};
