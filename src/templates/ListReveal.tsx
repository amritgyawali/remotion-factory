import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { Frame } from "../components/Frame";
import { BLEED_MARGIN, Eyebrow, KineticHeadline, MarchingList } from "../components/Kinetic";
import { themeFor } from "../theme";
import type { ListRevealProps } from "../types";

/** A headline and its list, both filling the frame. */
export const ListReveal: React.FC<ListRevealProps> = ({
  eyebrow,
  headline,
  items,
  score,
  videoId,
  theme: overrides,
}) => {
  const theme = themeFor(videoId, overrides);
  const { durationInFrames } = useVideoConfig();

  const from = 22;
  // Spread across the middle so the last item is still readable before the
  // end card takes the frame.
  const every = Math.max(11, Math.floor((durationInFrames - 70 - from) / Math.max(1, items.length)));

  return (
    <Frame theme={theme} template="ListReveal" score={score} videoId={videoId}>
      <AbsoluteFill
        style={{
          boxSizing: "border-box",
          padding: `104px ${BLEED_MARGIN}px 108px`,
          display: "flex",
          flexDirection: "column",
          gap: 46,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
          <Eyebrow text={eyebrow} theme={theme} color={theme.amber} />
          <KineticHeadline text={headline} theme={theme} from={4} maxLines={3} max={156} />
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <MarchingList items={items} theme={theme} from={from} every={every} accent={theme.amber} />
        </div>
      </AbsoluteFill>
    </Frame>
  );
};
