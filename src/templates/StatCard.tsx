import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CONTENT_MARGIN, Frame } from "../components/Frame";
import { themeFor } from "../theme";
import type { StatCardProps } from "../types";

/** "$2.4M" -> { pre: "$", num: "2.4", post: "M" } */
const splitValue = (value: string) => {
  const match = /^([^\d]*)([\d.,]+)(.*)$/.exec(value);
  if (!match) return { pre: "", num: null as string | null, post: value };
  return { pre: match[1], num: match[2], post: match[3] };
};

export const StatCard: React.FC<StatCardProps> = ({
  eyebrow,
  day,
  value,
  label,
  context,
  kicker,
  score,
  videoId,
  theme: overrides,
}) => {
  const theme = themeFor(videoId, overrides);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const { pre, num, post } = splitValue(value);
  const count = spring({ frame, fps, config: { damping: 200, mass: 0.7 }, durationInFrames: 34 });

  let shown = value;
  if (num !== null) {
    const target = Number(num.replace(/,/g, ""));
    const decimals = num.includes(".") ? num.split(".")[1].length : 0;
    shown = `${pre}${(target * count).toFixed(decimals)}${post}`;
  }

  const rise = (delay: number) =>
    spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 22 });

  return (
    <Frame theme={theme} template="StatCard" score={score}>
      <AbsoluteFill
        style={{
          justifyContent: "center",
          paddingLeft: CONTENT_MARGIN,
          paddingRight: CONTENT_MARGIN,
          paddingBottom: 120,
        }}
      >
        <div
          style={{
            fontFamily: theme.display,
            fontWeight: 800,
            fontSize: 320,
            lineHeight: 0.82,
            letterSpacing: "-0.05em",
            color: theme.paper,
            fontVariantNumeric: "tabular-nums",
            transform: `scale(${0.94 + count * 0.06})`,
            transformOrigin: "left center",
          }}
        >
          {shown}
        </div>

        <div
          style={{
            fontFamily: theme.display,
            fontWeight: 600,
            fontSize: 76,
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            color: theme.amber,
            marginTop: 44,
            opacity: rise(12),
            transform: `translateY(${(1 - rise(12)) * 28}px)`,
          }}
        >
          {label}
        </div>

        <div style={{ marginTop: 56, display: "flex", flexDirection: "column", gap: 18 }}>
          {context.map((line, i) => {
            const p = rise(24 + i * 7);
            return (
              <div
                key={line}
                style={{
                  fontFamily: theme.mono,
                  fontSize: 34,
                  lineHeight: 1.4,
                  color: theme.paperDim,
                  opacity: p,
                  transform: `translateY(${(1 - p) * 18}px)`,
                }}
              >
                {line}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </Frame>
  );
};
