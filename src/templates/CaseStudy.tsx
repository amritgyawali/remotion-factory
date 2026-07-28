import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { Frame } from "../components/Frame";
import {
  BeforeAfter,
  BLEED_MARGIN,
  Eyebrow,
  KineticHeadline,
  MarchingList,
  PayoffBlock,
} from "../components/Kinetic";
import { themeFor } from "../theme";
import type { CaseStudyProps } from "../types";

/**
 * A change, the work behind it, and what it cost.
 *
 * The before figure is struck through as the after arrives, which states the
 * relationship without a chart. The bars this template used to draw were
 * proportional to the frame counter, not to the numbers.
 */
export const CaseStudy: React.FC<CaseStudyProps> = ({
  hook,
  before,
  after,
  actions,
  lesson,
  score,
  videoId,
  theme: overrides,
}) => {
  const theme = themeFor(videoId, overrides);
  const { durationInFrames } = useVideoConfig();

  const lessonAt = Math.max(66, Math.floor(durationInFrames * 0.68));
  const comparisonAt = 20;
  const actionsFrom = comparisonAt + 54;
  const actionEvery = Math.max(
    9,
    Math.floor((lessonAt - actionsFrom - 16) / Math.max(1, actions.length)),
  );

  return (
    <Frame theme={theme} template="CaseStudy" score={score}>
      <AbsoluteFill
        style={{
          boxSizing: "border-box",
          padding: `104px ${BLEED_MARGIN}px 0`,
          display: "flex",
          flexDirection: "column",
          gap: 36,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <Eyebrow text="CASE STUDY" theme={theme} />
          <KineticHeadline text={hook} theme={theme} from={4} maxLines={2} max={140} />
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 52,
          }}
        >
          <BeforeAfter before={before} after={after} theme={theme} from={comparisonAt} />
          <MarchingList
            items={actions}
            theme={theme}
            from={actionsFrom}
            every={actionEvery}
            numbered={false}
          />
        </div>

        <PayoffBlock text={lesson} theme={theme} from={lessonAt} />
      </AbsoluteFill>
    </Frame>
  );
};
