import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CONTENT_MARGIN, Frame } from "../components/Frame";
import { display, mono, resolveTheme } from "../theme";
import type { ListRevealProps } from "../types";

export const ListReveal: React.FC<ListRevealProps> = ({
  eyebrow,
  day,
  headline,
  items,
  kicker,
  theme: overrides,
}) => {
  const theme = resolveTheme(overrides);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const head = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 24 });

  // Spread the items across the middle 70% of the video so the last one
  // still has time to breathe before the exit fade.
  const first = 20;
  const last = Math.max(first + 12, durationInFrames - 60);
  const step = items.length > 1 ? (last - first) / (items.length - 1) : 0;

  return (
    <Frame theme={theme} day={day} eyebrow={eyebrow} kicker={kicker}>
      <AbsoluteFill
        style={{
          justifyContent: "center",
          paddingLeft: CONTENT_MARGIN,
          paddingRight: CONTENT_MARGIN,
          paddingBottom: 140,
        }}
      >
        <div
          style={{
            fontFamily: display,
            fontWeight: 800,
            fontSize: 108,
            lineHeight: 0.98,
            letterSpacing: "-0.035em",
            color: theme.paper,
            opacity: head,
            transform: `translateY(${(1 - head) * 32}px)`,
          }}
        >
          {headline}
        </div>

        <div style={{ marginTop: 76, display: "flex", flexDirection: "column", gap: 40 }}>
          {items.map((item, i) => {
            const p = spring({
              frame: frame - (first + i * step),
              fps,
              config: { damping: 200, mass: 0.6 },
              durationInFrames: 20,
            });
            return (
              <div
                key={item}
                style={{
                  display: "flex",
                  gap: 32,
                  alignItems: "flex-start",
                  opacity: p,
                  transform: `translateX(${(1 - p) * -40}px)`,
                }}
              >
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: 34,
                    lineHeight: 1.5,
                    color: theme.amber,
                    fontVariantNumeric: "tabular-nums",
                    paddingTop: 8,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div
                  style={{
                    flex: 1,
                    fontFamily: display,
                    fontWeight: 500,
                    fontSize: 56,
                    lineHeight: 1.22,
                    letterSpacing: "-0.015em",
                    color: theme.paper,
                    borderBottom: `2px solid ${theme.rule}`,
                    paddingBottom: 28,
                  }}
                >
                  {item}
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </Frame>
  );
};
