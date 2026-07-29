import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { Frame } from "../components/Frame";
import {
  BLEED_MARGIN,
  Eyebrow,
  KineticHeadline,
  MarchingList,
  PayoffBlock,
} from "../components/Kinetic";
import { MetricStage } from "../components/Stage";
import { themeFor } from "../theme";
import type { CaseStudyProps } from "../types";

/**
 * A change, the work behind it, and what it cost.
 *
 * The claim of a case study is "this moved", and the template used to make that
 * claim in words — a before string struck through as an after string arrived.
 * Stating a change and showing one are different things, and only one of them
 * survives being watched with the sound off.
 *
 * MetricStage draws the distance instead: the after bar grows on a spring so
 * the eye tracks the movement rather than being handed a finished result. The
 * bars are deliberately not scaled to the copy — `before` and `after` here are
 * prose ("slow paint hides the offer"), not figures, so a proportional chart
 * would be inventing precision the script does not have. What is honest to show
 * is direction and magnitude, which is what this does.
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
    <Frame theme={theme} template="CaseStudy" score={score} videoId={videoId}>
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
          <MetricStage before={before} after={after} theme={theme} from={comparisonAt} />
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
