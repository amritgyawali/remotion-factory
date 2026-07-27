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
import type { SiteRoastProps } from "../types";

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

export const SiteRoast: React.FC<SiteRoastProps> = ({
  eyebrow,
  day,
  hook,
  episode,
  problems,
  fix,
  verdict,
  kicker,
  theme: overrides,
}) => {
  const theme = resolveTheme(overrides);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const marker = interpolate(frame, [2, 20], [0, 1], clamp);
  const fixAt = Math.max(44, Math.floor(durationInFrames * 0.56));
  const problemFirst = 18;
  const problemLast = Math.max(problemFirst, fixAt - 22);
  const problemGap =
    problems.length > 1 ? (problemLast - problemFirst) / (problems.length - 1) : 0;
  const fixIn = spring({
    frame: frame - fixAt,
    fps,
    config: { damping: 16, mass: 0.7 },
    durationInFrames: 22,
  });
  const verdictIn = spring({
    frame: frame - (fixAt + 18),
    fps,
    config: { damping: 200 },
    durationInFrames: 18,
  });

  return (
    <Frame theme={theme} day={day} eyebrow={eyebrow} kicker={kicker}>
      <AbsoluteFill
        style={{
          boxSizing: "border-box",
          paddingTop: 188,
          paddingBottom: 350,
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
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <div
            style={{
              fontFamily: mono,
              fontSize: 30,
              letterSpacing: "0.1em",
              color: theme.amber,
            }}
          >
            SITE AUDIT
          </div>
          <div
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              border: `2px solid ${theme.amber}`,
              fontFamily: mono,
              fontSize: 28,
              color: theme.paper,
            }}
          >
            {episode}
          </div>
        </div>

        <div
          style={{
            marginTop: 24,
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
            height: 292,
            borderRadius: 24,
            backgroundColor: theme.paper,
            padding: 28,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ height: 22, display: "flex", gap: 9 }}>
            {[0, 1, 2].map((dot) => (
              <div
                key={dot}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  backgroundColor: dot === 0 ? "#FF736F" : theme.groundLift,
                }}
              />
            ))}
          </div>
          <div
            style={{
              marginTop: 25,
              height: 42,
              width: "42%",
              borderRadius: 8,
              backgroundColor: theme.ground,
            }}
          />
          <div
            style={{
              marginTop: 18,
              height: 18,
              width: "70%",
              borderRadius: 8,
              backgroundColor: "rgba(34, 16, 51, 0.2)",
            }}
          />
          <div
            style={{
              marginTop: 12,
              height: 18,
              width: "55%",
              borderRadius: 8,
              backgroundColor: "rgba(34, 16, 51, 0.2)",
            }}
          />
          <div
            style={{
              marginTop: 28,
              width: 180,
              height: 48,
              borderRadius: 10,
              backgroundColor: theme.groundLift,
            }}
          />
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 900 292"
            style={{ position: "absolute", inset: 0 }}
          >
            <ellipse
              cx="250"
              cy="147"
              rx="180"
              ry="90"
              fill="none"
              stroke="#E94F57"
              strokeWidth="12"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - marker}
              strokeLinecap="round"
              transform="rotate(-7 250 147)"
            />
          </svg>
          <div
            style={{
              position: "absolute",
              right: 24,
              bottom: 24,
              padding: "12px 18px",
              backgroundColor: "#E94F57",
              borderRadius: 10,
              fontFamily: mono,
              fontSize: 30,
              fontWeight: 800,
              color: theme.paper,
              transform: `rotate(-3deg) scale(${0.9 + marker * 0.1})`,
            }}
          >
            NEEDS WORK
          </div>
        </div>

        <div
          style={{
            marginTop: 24,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
          }}
        >
          {problems.map((problem, index) => {
            const enter = spring({
              frame: frame - (problemFirst + index * problemGap),
              fps,
              config: { damping: 200, mass: 0.55 },
              durationInFrames: 17,
            });
            return (
              <div
                key={`${problem}-${index}`}
                style={{
                  minHeight: 90,
                  padding: "18px 20px",
                  border: `2px solid ${theme.rule}`,
                  borderRadius: 16,
                  fontFamily: display,
                  fontSize: 44,
                  lineHeight: 1.05,
                  color: theme.paper,
                  opacity: enter,
                  transform: `translateY(${(1 - enter) * 20}px)`,
                }}
              >
                <span style={{ color: "#FF8B87" }}>{index + 1}. </span>
                {problem}
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "grid",
            gridTemplateColumns: "1.3fr 0.7fr",
            gap: 16,
          }}
        >
          <div
            style={{
              padding: "22px 24px",
              borderRadius: 18,
              backgroundColor: theme.paper,
              fontFamily: display,
              fontWeight: 700,
              fontSize: 47,
              lineHeight: 1.05,
              color: theme.ground,
              opacity: fixIn,
              transform: `translateX(${(1 - fixIn) * -34}px)`,
            }}
          >
            {fix}
          </div>
          <div
            style={{
              padding: "22px 20px",
              borderRadius: 18,
              backgroundColor: theme.amber,
              display: "grid",
              placeItems: "center",
              textAlign: "center",
              fontFamily: mono,
              fontWeight: 800,
              fontSize: 36,
              lineHeight: 1.05,
              color: theme.ground,
              opacity: verdictIn,
              transform: `scale(${0.9 + verdictIn * 0.1}) rotate(-2deg)`,
            }}
          >
            {verdict}
          </div>
        </div>
      </AbsoluteFill>
    </Frame>
  );
};
