import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CONTENT_MARGIN, Frame } from "../components/Frame";
import { display, mono, resolveTheme } from "../theme";
import type { CaseStudyProps } from "../types";

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

export const CaseStudy: React.FC<CaseStudyProps> = ({
  eyebrow,
  day,
  hook,
  before,
  after,
  actions,
  lesson,
  kicker,
  theme: overrides,
}) => {
  const theme = resolveTheme(overrides);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const graph = interpolate(frame, [8, 54], [0, 1], clamp);
  const compare = spring({
    frame: frame - 8,
    fps,
    config: { damping: 200, mass: 0.65 },
    durationInFrames: 24,
  });
  const lessonAt = Math.max(54, Math.floor(durationInFrames * 0.65));
  const actionFirst = 22;
  const actionLast = Math.max(actionFirst, lessonAt - 22);
  const actionGap =
    actions.length > 1 ? (actionLast - actionFirst) / (actions.length - 1) : 0;
  const lessonIn = spring({
    frame: frame - lessonAt,
    fps,
    config: { damping: 200, mass: 0.6 },
    durationInFrames: 20,
  });

  return (
    <Frame theme={theme}>
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
            fontFamily: mono,
            fontSize: 30,
            letterSpacing: "0.1em",
            color: theme.seaglass,
          }}
        >
          BEFORE / AFTER
        </div>

        <div
          style={{
            marginTop: 22,
            fontFamily: display,
            fontWeight: 800,
            fontSize: 98,
            lineHeight: 0.96,
            letterSpacing: "-0.04em",
            color: theme.paper,
          }}
        >
          {hook}
        </div>

        <div
          style={{
            marginTop: 32,
            height: 310,
            border: `2px solid ${theme.rule}`,
            borderRadius: 24,
            position: "relative",
            overflow: "hidden",
            backgroundColor: "rgba(18, 7, 29, 0.52)",
          }}
        >
          <svg width="100%" height="100%" viewBox="0 0 900 310">
            {[70, 150, 230].map((y) => (
              <line
                key={y}
                x1="30"
                y1={y}
                x2="870"
                y2={y}
                stroke={theme.rule}
                strokeWidth="2"
              />
            ))}
            <polyline
              points="30,254 145,246 260,250 375,230 490,218 605,154 720,98 870,42"
              fill="none"
              stroke={theme.seaglass}
              strokeWidth="13"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - graph}
            />
          </svg>
          <div
            style={{
              position: "absolute",
              left: 28,
              bottom: 24,
              fontFamily: mono,
              fontSize: 26,
              color: theme.paperDim,
            }}
          >
            EVIDENCE, NOT HYPE
          </div>
        </div>

        <div
          style={{
            marginTop: -20,
            paddingLeft: 28,
            paddingRight: 28,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            opacity: compare,
            transform: `translateY(${(1 - compare) * 26}px)`,
          }}
        >
          <div
            style={{
              minHeight: 136,
              padding: "20px 22px",
              borderRadius: 18,
              backgroundColor: theme.groundLift,
            }}
          >
            <div style={{ fontFamily: mono, fontSize: 27, color: theme.paperDim }}>BEFORE</div>
            <div
              style={{
                marginTop: 12,
                fontFamily: display,
                fontSize: 49,
                lineHeight: 1.02,
                fontWeight: 700,
                color: theme.paper,
              }}
            >
              {before}
            </div>
          </div>
          <div
            style={{
              minHeight: 136,
              padding: "20px 22px",
              borderRadius: 18,
              backgroundColor: theme.seaglass,
            }}
          >
            <div style={{ fontFamily: mono, fontSize: 27, color: theme.ground }}>
              AFTER
            </div>
            <div
              style={{
                marginTop: 12,
                fontFamily: display,
                fontSize: 49,
                lineHeight: 1.02,
                fontWeight: 800,
                color: theme.ground,
              }}
            >
              {after}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 26,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {actions.map((action, index) => {
            const enter = spring({
              frame: frame - (actionFirst + index * actionGap),
              fps,
              config: { damping: 200, mass: 0.55 },
              durationInFrames: 18,
            });
            return (
              <div
                key={`${action}-${index}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "48px 1fr",
                  gap: 18,
                  alignItems: "center",
                  fontFamily: display,
                  fontSize: 45,
                  lineHeight: 1.06,
                  color: theme.paper,
                  opacity: enter,
                  transform: `translateX(${(1 - enter) * -28}px)`,
                }}
              >
                <span style={{ fontFamily: mono, fontSize: 28, color: theme.amber }}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                {action}
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: "auto",
            padding: "22px 28px",
            borderTop: `3px solid ${theme.amber}`,
            fontFamily: display,
            fontWeight: 700,
            fontSize: 55,
            lineHeight: 1.04,
            color: theme.amber,
            opacity: lessonIn,
            transform: `translateY(${(1 - lessonIn) * 24}px)`,
          }}
        >
          {lesson}
        </div>
      </AbsoluteFill>
    </Frame>
  );
};
