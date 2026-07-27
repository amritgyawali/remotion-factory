import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CONTENT_MARGIN, Frame } from "../components/Frame";
import { display, mono, resolveTheme, type Theme } from "../theme";
import type { TechTipProps } from "../types";

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

const variantLabel: Record<TechTipProps["variant"], string> = {
  security: "SECURITY CHECK",
  devtools: "DEVTOOLS",
  "tool-audit": "STACK AUDIT",
  vitals: "WEB VITALS",
  "index-check": "INDEX CHECK",
  "design-code": "DESIGN → CODE",
};

const ConsoleVisual: React.FC<{
  variant: TechTipProps["variant"];
  theme: Theme;
  frame: number;
}> = ({ variant, theme, frame }) => {
  const progress = interpolate(frame, [0, 40], [0.08, 1], clamp);
  const rows =
    variant === "vitals"
      ? ["LCP", "INP", "CLS"]
      : variant === "tool-audit"
        ? ["USED", "UNUSED", "CANCEL"]
        : variant === "design-code"
          ? ["DESIGN", "BUILD", "CHECK"]
          : variant === "devtools"
            ? ["⌘⇧P", "FETCH", "BREAK"]
            : ["SCAN", "VERIFY", "FIX"];

  return (
    <div
      style={{
        height: 270,
        border: `2px solid ${theme.seaglass}`,
        borderRadius: 24,
        overflow: "hidden",
        backgroundColor: "rgba(11, 25, 30, 0.58)",
      }}
    >
      <div
        style={{
          height: 58,
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderBottom: `2px solid ${theme.rule}`,
          fontFamily: mono,
          fontSize: 26,
          color: theme.paperDim,
        }}
      >
        <span style={{ color: "#FF7A78" }}>●</span>
        <span style={{ color: theme.amber }}>●</span>
        <span style={{ color: theme.seaglass }}>●</span>
        <span style={{ marginLeft: 16 }}>{variantLabel[variant]}</span>
      </div>
      <div
        style={{
          height: 210,
          padding: 24,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          alignItems: "end",
        }}
      >
        {rows.map((row, index) => {
          const value = Math.min(1, progress * (0.76 + index * 0.12));
          return (
            <div
              key={row}
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                gap: 14,
              }}
            >
              <div
                style={{
                  height: 104,
                  borderRadius: 12,
                  backgroundColor: theme.groundLift,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: `${value * 100}%`,
                    backgroundColor: index === 2 ? theme.amber : theme.seaglass,
                  }}
                />
              </div>
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 27,
                  fontWeight: 700,
                  color: theme.paper,
                  textAlign: "center",
                }}
              >
                {row}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const TechTip: React.FC<TechTipProps> = ({
  eyebrow,
  day,
  hook,
  steps,
  result,
  variant,
  kicker,
  score,
  theme: overrides,
}) => {
  const theme = resolveTheme(overrides);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const resultAt = Math.max(48, Math.floor(durationInFrames * 0.64));
  const stepFirst = 18;
  const stepLast = Math.max(stepFirst, resultAt - 22);
  const stepGap = steps.length > 1 ? (stepLast - stepFirst) / (steps.length - 1) : 0;
  const resultIn = spring({
    frame: frame - resultAt,
    fps,
    config: { damping: 200, mass: 0.6 },
    durationInFrames: 20,
  });

  return (
    <Frame theme={theme} template="TechTip" score={score}>
      <AbsoluteFill
        style={{
          boxSizing: "border-box",
          paddingTop: 120,
          paddingBottom: 150,
          paddingLeft: CONTENT_MARGIN,
          paddingRight: CONTENT_MARGIN,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginBottom: 22,
            fontFamily: mono,
            fontSize: 30,
            letterSpacing: "0.1em",
            color: theme.seaglass,
          }}
        >
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: 999,
              backgroundColor: theme.seaglass,
              boxShadow: `0 0 28px ${theme.seaglass}`,
            }}
          />
          {variantLabel[variant]}
        </div>

        <div
          style={{
            fontFamily: display,
            fontWeight: 800,
            fontSize: 100,
            lineHeight: 0.96,
            letterSpacing: "-0.04em",
            color: theme.paper,
          }}
        >
          {hook}
        </div>

        <div style={{ marginTop: 32 }}>
          <ConsoleVisual variant={variant} theme={theme} frame={frame} />
        </div>

        <div
          style={{
            marginTop: 28,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {steps.map((step, index) => {
            const enter = spring({
              frame: frame - (stepFirst + index * stepGap),
              fps,
              config: { damping: 200, mass: 0.55 },
              durationInFrames: 18,
            });
            return (
              <div
                key={`${step}-${index}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "68px 1fr",
                  gap: 20,
                  alignItems: "center",
                  opacity: enter,
                  transform: `translateY(${(1 - enter) * 20}px)`,
                }}
              >
                <div
                  style={{
                    width: 60,
                    height: 60,
                    display: "grid",
                    placeItems: "center",
                    border: `2px solid ${theme.seaglass}`,
                    borderRadius: 14,
                    fontFamily: mono,
                    fontSize: 28,
                    color: theme.seaglass,
                  }}
                >
                  {index + 1}
                </div>
                <div
                  style={{
                    fontFamily: display,
                    fontSize: 47,
                    lineHeight: 1.08,
                    color: theme.paper,
                  }}
                >
                  {step}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: "auto",
            padding: "22px 28px",
            borderRadius: 20,
            backgroundColor: theme.seaglass,
            color: theme.ground,
            fontFamily: display,
            fontWeight: 800,
            fontSize: 57,
            lineHeight: 1.02,
            opacity: resultIn,
            transform: `translateY(${(1 - resultIn) * 26}px)`,
          }}
        >
          {result}
        </div>
      </AbsoluteFill>
    </Frame>
  );
};
