import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { Frame } from "../components/Frame";
import {
  BLEED_MARGIN,
  Eyebrow,
  HeroNumber,
  KineticHeadline,
  MarchingList,
} from "../components/Kinetic";
import { themeFor } from "../theme";
import type { StatCardProps } from "../types";

/**
 * One number, at the size a number that matters deserves.
 *
 * The figure counts up from zero and is measured against the frame width, so
 * "43%" and "$2.4M" both fill it — the old fixed 320px overflowed the long
 * ones and left half the width empty on the short ones.
 */
export const StatCard: React.FC<StatCardProps> = ({
  eyebrow,
  value,
  label,
  context,
  score,
  videoId,
  theme: overrides,
}) => {
  const theme = themeFor(videoId, overrides);
  const { durationInFrames } = useVideoConfig();
  const contextFrom = Math.max(40, Math.floor(durationInFrames * 0.34));

  return (
    <Frame theme={theme} template="StatCard" score={score}>
      <AbsoluteFill
        style={{
          boxSizing: "border-box",
          padding: `104px ${BLEED_MARGIN}px 108px`,
          display: "flex",
          flexDirection: "column",
          gap: 44,
        }}
      >
        <Eyebrow text={eyebrow} theme={theme} color={theme.amber} />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 40,
          }}
        >
          <HeroNumber value={value} theme={theme} />
          <KineticHeadline
            text={label}
            theme={theme}
            from={14}
            maxLines={3}
            min={52}
            max={92}
            color={theme.amber}
            stagger={2}
          />
        </div>

        <MarchingList items={context} theme={theme} from={contextFrom} every={9} numbered={false} />
      </AbsoluteFill>
    </Frame>
  );
};
