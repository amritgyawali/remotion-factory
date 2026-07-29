import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { Frame } from "../components/Frame";
import { BLEED_MARGIN, Eyebrow, KineticHeadline, MarchingList, PayoffBlock } from "../components/Kinetic";
import { themeFor } from "../theme";
import type { FounderStoryProps } from "../types";

/**
 * The slowest template, and deliberately so.
 *
 * The PDF's rule for this bed is "no music at all for the first three
 * seconds. Ever." The type honours the same restraint: the hook holds alone
 * for a beat before the moments start, and the moments are unnumbered — a
 * counted list reads as advice, and this one is a story.
 */
export const FounderStory: React.FC<FounderStoryProps> = ({
  hook,
  moments,
  turn,
  lesson,
  score,
  videoId,
  theme: overrides,
}) => {
  const theme = themeFor(videoId, overrides);
  const { durationInFrames } = useVideoConfig();

  const lessonAt = Math.max(72, Math.floor(durationInFrames * 0.74));
  const turnAt = Math.max(56, lessonAt - 52);
  // Nothing moves for the first ninety frames but the hook itself.
  const momentsFrom = 40;
  const momentEvery = Math.max(
    12,
    Math.floor((turnAt - momentsFrom - 14) / Math.max(1, moments.length)),
  );

  return (
    <Frame theme={theme} template="FounderStory" score={score} videoId={videoId}>
      <AbsoluteFill
        style={{
          boxSizing: "border-box",
          padding: `104px ${BLEED_MARGIN}px 0`,
          display: "flex",
          flexDirection: "column",
          gap: 36,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
          <Eyebrow text="FOUNDER STORY" theme={theme} />
          {/* Slower stagger: this hook should land like a sentence, not a hit. */}
          <KineticHeadline text={hook} theme={theme} from={8} maxLines={3} max={150} stagger={5} />
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 48,
          }}
        >
          <MarchingList
            items={moments}
            theme={theme}
            from={momentsFrom}
            every={momentEvery}
            numbered={false}
          />
          <KineticHeadline
            text={turn}
            theme={theme}
            from={turnAt}
            maxLines={2}
            min={50}
            max={90}
            color={theme.amber}
            stagger={3}
          />
        </div>

        <PayoffBlock text={lesson} theme={theme} from={lessonAt} />
      </AbsoluteFill>
    </Frame>
  );
};
