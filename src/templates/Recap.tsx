import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Frame } from "../components/Frame";
import { BLEED_MARGIN, Eyebrow, KineticHeadline, PayoffBlock, fittedSize } from "../components/Kinetic";
import { themeFor, type Theme } from "../theme";
import type { RecapProps } from "../types";

/**
 * Day 30: the numbers, stated plainly.
 *
 * This is the one template whose marks are real — every bar length is the
 * row's own value over the largest value in its set, so the picture is the
 * data rather than a decoration sized by the frame counter.
 */
const Rows: React.FC<{
  rows: { label: string; value: number }[];
  theme: Theme;
  from: number;
  every: number;
  highlightFirst?: boolean;
}> = ({ rows, theme, from, every, highlightFirst = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const peak = Math.max(1, ...rows.map((row) => row.value));
  const longest = rows.reduce((a, b) => (a.label.length >= b.label.length ? a : b), rows[0]);
  const size = fittedSize({
    text: longest?.label ?? "",
    boxWidth: 620,
    maxLines: 1,
    fontFamily: theme.display,
    fontWeight: theme.weightMid,
    letterSpacing: "-0.02em",
    min: 34,
    max: 58,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: size * 0.5 }}>
      {rows.map((row, index) => {
        const enter = spring({
          frame: frame - (from + index * every),
          fps,
          config: { damping: 200, mass: 0.6 },
          durationInFrames: 22,
        });
        const tone = highlightFirst && index === 0 ? theme.amber : theme.seaglass;

        return (
          <div key={row.label} style={{ opacity: enter }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: size * 0.24,
              }}
            >
              <span
                style={{
                  fontFamily: theme.display,
                  fontWeight: theme.weightMid,
                  fontSize: size,
                  letterSpacing: "-0.02em",
                  color: theme.paper,
                }}
              >
                {row.label}
              </span>
              <span
                style={{
                  fontFamily: theme.mono,
                  fontSize: size * 0.92,
                  color: tone,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {Math.round(row.value * enter).toLocaleString()}
              </span>
            </div>
            <div style={{ height: size * 0.28, backgroundColor: theme.groundLift, borderRadius: 999 }}>
              <div
                style={{
                  // Real proportion: this row against the largest in the set.
                  width: `${(row.value / peak) * 100 * enter}%`,
                  height: "100%",
                  borderRadius: 999,
                  backgroundColor: tone,
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
  score,
  videoId,
  theme: overrides,
}) => {
  const theme = themeFor(videoId, overrides);
  const { durationInFrames } = useVideoConfig();

  const lessonAt = Math.max(80, Math.floor(durationInFrames * 0.76));
  const totalsFrom = 22;
  const boardFrom = totalsFrom + Math.max(30, totals.length * 12);

  return (
    <Frame theme={theme} template="Recap" score={score} videoId={videoId}>
      <AbsoluteFill
        style={{
          boxSizing: "border-box",
          padding: `104px ${BLEED_MARGIN}px 0`,
          display: "flex",
          flexDirection: "column",
          gap: 34,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <Eyebrow text="THE REAL NUMBERS" theme={theme} color={theme.amber} />
          <KineticHeadline text={hook} theme={theme} from={4} maxLines={2} max={132} />
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 46,
          }}
        >
          <Rows rows={totals} theme={theme} from={totalsFrom} every={11} />
          <Rows rows={leaderboard} theme={theme} from={boardFrom} every={9} highlightFirst />
        </div>

        <PayoffBlock text={lesson} theme={theme} from={lessonAt} />
      </AbsoluteFill>
    </Frame>
  );
};
