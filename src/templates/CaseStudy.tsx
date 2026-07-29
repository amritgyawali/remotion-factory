import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { Frame } from "../components/Frame";
import { BLEED_MARGIN, Eyebrow, KineticHeadline, PayoffBlock } from "../components/Kinetic";
import { Exhibit, resolveExhibit } from "../exhibits";
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
 * An exhibit draws the distance instead. Which one depends on what the script
 * gave it, and that dependency is the honest part: `before` and `after` are
 * usually prose ("slow paint hides the offer"), and prose cannot be scaled, so
 * a script with only words gets a mechanism — the stages the work moves
 * through, the sequence it moves through them in. A script that supplies two
 * real figures gets the two arcs and the gap between them, drawn to scale.
 * Neither path invents a proportion the script did not state.
 */
export const CaseStudy: React.FC<CaseStudyProps> = ({
  hook,
  before,
  after,
  actions,
  lesson,
  exhibit,
  score,
  videoId,
  theme: overrides,
}) => {
  const theme = themeFor(videoId, overrides);
  const { durationInFrames } = useVideoConfig();
  const spec = resolveExhibit(
    "CaseStudy",
    { hook, before, after, actions, lesson, exhibit },
    videoId,
  );

  const lessonAt = Math.max(66, Math.floor(durationInFrames * 0.68));
  const comparisonAt = 20;

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
          {/*
            The actions are inside the figure, not beside it.
            A list of the three actions under a diagram built from the same
            three actions is the same words twice in one frame — the probe
            render printed "Resize media" as stage one of the pipeline and
            again as the first line below it. Whichever figure this script
            draws, it is carrying the actions, so the template does not.
          */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <Exhibit theme={theme} spec={spec} from={comparisonAt} />
          </div>
        </div>

        <PayoffBlock text={lesson} theme={theme} from={lessonAt} />
      </AbsoluteFill>
    </Frame>
  );
};
