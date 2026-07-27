import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CONTENT_MARGIN, Frame } from "../components/Frame";
import { themeFor, type Theme } from "../theme";
import type { DevJokeProps } from "../types";

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

const Motif: React.FC<{
  variant: DevJokeProps["variant"];
  theme: Theme;
  frame: number;
}> = ({ variant, theme, frame }) => {
  const { fps } = useVideoConfig();
  const pulse = spring({
    frame,
    fps,
    config: { damping: 12, mass: 0.55 },
    durationInFrames: 20,
  });
  const error = "#FF7A78";

  const shell: React.CSSProperties = {
    height: 260,
    border: `2px solid ${theme.rule}`,
    borderRadius: 28,
    backgroundColor: "rgba(18, 7, 29, 0.62)",
    overflow: "hidden",
    position: "relative",
  };

  if (variant === "logo") {
    return (
      <div style={{ ...shell, display: "grid", placeItems: "center" }}>
        {[1, 0.74, 0.48].map((size, index) => (
          <div
            key={size}
            style={{
              position: "absolute",
              width: 520 * size,
              height: 180 * size,
              border: `3px solid ${index === 0 ? theme.amber : theme.rule}`,
              borderRadius: 24,
              opacity: 0.3 + index * 0.2,
              transform: `scale(${0.8 + pulse * (0.2 + index * 0.05)})`,
            }}
          />
        ))}
        <div
          style={{
            fontFamily: theme.display,
            fontWeight: 800,
            fontSize: 82,
            color: theme.paper,
            transform: `scale(${0.82 + pulse * 0.18})`,
          }}
        >
          MERITBYTE
        </div>
      </div>
    );
  }

  if (variant === "terminal") {
    return (
      <div style={{ ...shell, display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {[
          { label: "LOCAL", value: "47 PASSING", color: theme.seaglass },
          { label: "PROD", value: "47 FAILING", color: error },
        ].map((panel, index) => (
          <div
            key={panel.label}
            style={{
              padding: 34,
              borderLeft: index ? `2px solid ${theme.rule}` : undefined,
              transform: `translateY(${(1 - pulse) * (index ? -24 : 24)}px)`,
            }}
          >
            <div style={{ fontFamily: theme.mono, fontSize: 30, color: panel.color }}>
              {panel.label}
            </div>
            <div
              style={{
                marginTop: 44,
                fontFamily: theme.mono,
                fontSize: 42,
                fontWeight: 700,
                color: theme.paper,
              }}
            >
              {panel.value}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "qa") {
    const orders = ["0", "-1", "NULL", "999999"];
    return (
      <div style={{ ...shell, padding: 28 }}>
        {orders.map((order, index) => {
          const enter = spring({
            frame: frame - index * 4,
            fps,
            config: { damping: 16 },
            durationInFrames: 18,
          });
          return (
            <div
              key={order}
              style={{
                position: "absolute",
                left: 30 + index * 190,
                top: 34 + index * 24,
                width: 210,
                height: 150,
                padding: 22,
                borderRadius: 18,
                backgroundColor: index % 2 ? theme.paper : theme.amber,
                color: theme.ground,
                fontFamily: theme.mono,
                fontSize: 32,
                fontWeight: 700,
                opacity: enter,
                transform: `rotate(${index * 3 - 5}deg) translateY(${(1 - enter) * 70}px)`,
              }}
            >
              ORDER
              <div style={{ marginTop: 26, fontSize: 48 }}>{order}</div>
            </div>
          );
        })}
      </div>
    );
  }

  if (variant === "timer") {
    const minutes = Math.floor(interpolate(frame, [0, 120], [0, 51], clamp));
    return (
      <div style={{ ...shell, display: "grid", placeItems: "center" }}>
        <div
          style={{
            position: "absolute",
            inset: 24,
            border: `2px dashed ${error}`,
            borderRadius: 20,
            opacity: 0.45,
          }}
        />
        <div
          style={{
            fontFamily: theme.mono,
            fontWeight: 700,
            fontSize: 116,
            letterSpacing: "-0.06em",
            color: minutes > 15 ? error : theme.paper,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          +{String(minutes).padStart(2, "0")}:00
        </div>
      </div>
    );
  }

  if (variant === "scope" || variant === "cache") {
    const labels =
      variant === "scope"
        ? ["one button", "+ a form", "+ accounts"]
        : ["BROWSER", "CACHE", "SERVER"];
    return (
      <div
        style={{
          ...shell,
          padding: 28,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {labels.map((label, index) => {
          const enter = spring({
            frame: frame - index * 5,
            fps,
            config: { damping: 18 },
            durationInFrames: 16,
          });
          return (
            <div
              key={label}
              style={{
                alignSelf: index % 2 ? "flex-end" : "flex-start",
                width: `${58 + index * 12}%`,
                padding: "17px 24px",
                borderRadius: 18,
                backgroundColor: index === labels.length - 1 ? theme.amber : theme.groundLift,
                color: index === labels.length - 1 ? theme.ground : theme.paper,
                fontFamily: theme.mono,
                fontSize: 34,
                fontWeight: 700,
                opacity: enter,
                transform: `translateX(${(1 - enter) * (index % 2 ? 50 : -50)}px)`,
              }}
            >
              {label}
            </div>
          );
        })}
      </div>
    );
  }

  if (variant === "deploy") {
    const progress = interpolate(frame, [0, 34], [0, 1], clamp);
    const points = `20,205 145,190 265,194 390,170 510,178 620,42 760,28 880,18`;
    return (
      <div style={{ ...shell }}>
        <svg width="100%" height="100%" viewBox="0 0 900 260">
          <polyline
            points={points}
            fill="none"
            stroke={error}
            strokeWidth="12"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - progress}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            right: 28,
            top: 30,
            padding: "12px 18px",
            borderRadius: 12,
            backgroundColor: error,
            color: theme.ground,
            fontFamily: theme.mono,
            fontSize: 30,
            fontWeight: 800,
          }}
        >
          ERRORS
        </div>
      </div>
    );
  }

  const comments = ["#04 make it pop", "#27 smaller", "#31 use the old one"];
  return (
    <div
      style={{
        ...shell,
        padding: 28,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 14,
      }}
    >
      {comments.map((comment, index) => (
        <div
          key={comment}
          style={{
            width: index === 2 ? "88%" : "68%",
            marginLeft: index * 60,
            padding: "17px 22px",
            borderRadius: 16,
            backgroundColor: index === 2 ? theme.amber : theme.groundLift,
            color: index === 2 ? theme.ground : theme.paper,
            fontFamily: theme.mono,
            fontSize: 32,
            transform: `translateX(${interpolate(frame, [index * 4, index * 4 + 14], [80, 0], clamp)}px)`,
          }}
        >
          {comment}
        </div>
      ))}
    </div>
  );
};

export const DevJoke: React.FC<DevJokeProps> = ({
  eyebrow,
  day,
  hook,
  beats,
  punchline,
  variant,
  kicker,
  score,
  videoId,
  theme: overrides,
}) => {
  const theme = themeFor(videoId, overrides);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const punchAt = Math.max(48, Math.floor(durationInFrames * 0.62));
  const beatFirst = 18;
  const beatLast = Math.max(beatFirst, punchAt - 22);
  const beatStep = beats.length > 1 ? (beatLast - beatFirst) / (beats.length - 1) : 0;
  const punch = spring({
    frame: frame - punchAt,
    fps,
    config: { damping: 14, mass: 0.65 },
    durationInFrames: 18,
  });

  return (
    <Frame theme={theme} template="DevJoke" score={score}>
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
            fontFamily: theme.display,
            fontWeight: 800,
            fontSize: 104,
            lineHeight: 0.95,
            letterSpacing: "-0.04em",
            color: theme.paper,
            transform: `scale(${interpolate(frame, [0, 8], [1.025, 1], clamp)})`,
            transformOrigin: "left top",
          }}
        >
          {hook}
        </div>

        <div style={{ marginTop: 34 }}>
          <Motif variant={variant} theme={theme} frame={frame} />
        </div>

        <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 13 }}>
          {beats.map((beat, index) => {
            const enter = spring({
              frame: frame - (beatFirst + index * beatStep),
              fps,
              config: { damping: 200, mass: 0.55 },
              durationInFrames: 18,
            });
            return (
              <div
                key={`${beat}-${index}`}
                style={{
                  display: "flex",
                  gap: 20,
                  alignItems: "baseline",
                  opacity: enter,
                  transform: `translateX(${(1 - enter) * -28}px)`,
                }}
              >
                <span style={{ fontFamily: theme.mono, fontSize: 28, color: theme.amber }}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  style={{
                    fontFamily: theme.display,
                    fontSize: 46,
                    lineHeight: 1.08,
                    color: theme.paperDim,
                  }}
                >
                  {beat}
                </span>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: "auto",
            padding: "24px 28px",
            borderLeft: `8px solid ${theme.amber}`,
            backgroundColor: theme.paper,
            color: theme.ground,
            fontFamily: theme.display,
            fontWeight: 800,
            fontSize: 60,
            lineHeight: 1,
            opacity: punch,
            transform: `translateY(${(1 - punch) * 32}px) scale(${0.96 + punch * 0.04})`,
            transformOrigin: "left bottom",
          }}
        >
          {punchline}
        </div>
      </AbsoluteFill>
    </Frame>
  );
};
