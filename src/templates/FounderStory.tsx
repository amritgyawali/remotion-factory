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
import type { FounderStoryProps } from "../types";

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

export const FounderStory: React.FC<FounderStoryProps> = ({
  eyebrow,
  day,
  hook,
  moments,
  turn,
  lesson,
  kicker,
  theme: overrides,
}) => {
  const theme = resolveTheme(overrides);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const line = interpolate(
    frame,
    [8, Math.max(40, durationInFrames * 0.55)],
    [0, 1],
    clamp,
  );
  const turnAt = Math.max(48, Math.floor(durationInFrames * 0.58));
  const momentFirst = 14;
  const momentLast = Math.max(momentFirst, turnAt - 22);
  const momentGap =
    moments.length > 1 ? (momentLast - momentFirst) / (moments.length - 1) : 0;
  const turnIn = spring({
    frame: frame - turnAt,
    fps,
    config: { damping: 200, mass: 0.7 },
    durationInFrames: 22,
  });
  const lessonIn = spring({
    frame: frame - (turnAt + 18),
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
            fontSize: 29,
            letterSpacing: "0.11em",
            color: theme.paperDim,
          }}
        >
          FROM THE BUILD LOG
        </div>

        <div
          style={{
            marginTop: 30,
            maxWidth: 890,
            fontFamily: display,
            fontWeight: 800,
            fontSize: 108,
            lineHeight: 0.94,
            letterSpacing: "-0.045em",
            color: theme.paper,
          }}
        >
          {hook}
        </div>

        <div
          style={{
            marginTop: 62,
            position: "relative",
            display: "flex",
            flexDirection: "column",
            gap: 34,
            paddingLeft: 74,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 18,
              top: 12,
              width: 3,
              height: `${line * 100}%`,
              backgroundColor: theme.amber,
              transformOrigin: "top",
            }}
          />
          {moments.map((moment, index) => {
            const enter = spring({
              frame: frame - (momentFirst + index * momentGap),
              fps,
              config: { damping: 200, mass: 0.65 },
              durationInFrames: 20,
            });
            return (
              <div
                key={`${moment}-${index}`}
                style={{
                  position: "relative",
                  minHeight: 72,
                  display: "flex",
                  alignItems: "center",
                  fontFamily: display,
                  fontSize: 50,
                  lineHeight: 1.08,
                  color: theme.paper,
                  opacity: enter,
                  transform: `translateX(${(1 - enter) * 30}px)`,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: -70,
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    border: `5px solid ${theme.amber}`,
                    backgroundColor: theme.ground,
                  }}
                />
                {moment}
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div
            style={{
              padding: "22px 28px",
              borderRadius: 18,
              border: `2px solid ${theme.seaglass}`,
              fontFamily: mono,
              fontSize: 44,
              lineHeight: 1.12,
              color: theme.seaglass,
              opacity: turnIn,
              transform: `translateY(${(1 - turnIn) * 24}px)`,
            }}
          >
            {turn}
          </div>
          <div
            style={{
              padding: "24px 28px",
              backgroundColor: theme.paper,
              fontFamily: display,
              fontWeight: 800,
              fontSize: 59,
              lineHeight: 1.02,
              color: theme.ground,
              opacity: lessonIn,
              transform: `translateY(${(1 - lessonIn) * 24}px)`,
            }}
          >
            {lesson}
          </div>
        </div>
      </AbsoluteFill>
    </Frame>
  );
};
