import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { Frame } from "../components/Frame";
import { BLEED_MARGIN, Eyebrow, KineticHeadline, MarchingList } from "../components/Kinetic";
import { Exhibit, resolveExhibit } from "../exhibits";
import { themeFor } from "../theme";
import type { StatCardProps } from "../types";

/**
 * One number, drawn rather than typed.
 *
 * This template used to set the figure as 400px of display type and stop there,
 * and a number set large is still a caption card — the frame carried no
 * evidence that anything was being measured, only an assertion in a big font.
 *
 * The figure now arrives as an exhibit: a ring filling to its own proportion by
 * default, or whatever else the script asked for. The count is unchanged, which
 * matters, because the counting was always the good part — the difference is
 * that the number now has a shape climbing beside it, so a viewer who reads no
 * words still sees a quantity arrive.
 *
 * `label` moves above the figure and becomes the headline, which is what it
 * always was: the sentence the number completes.
 */
export const StatCard: React.FC<StatCardProps> = ({
  eyebrow,
  value,
  label,
  context,
  exhibit,
  score,
  videoId,
  theme: overrides,
}) => {
  const theme = themeFor(videoId, overrides);
  const { durationInFrames } = useVideoConfig();
  const spec = resolveExhibit("StatCard", { value, label, context, exhibit }, videoId);
  // Early enough that the lower frame is never bare for long: the ring is
  // still filling when the first context line lands under it.
  const contextFrom = Math.max(34, Math.floor(durationInFrames * 0.42));

  return (
    <Frame theme={theme} template="StatCard" score={score} videoId={videoId}>
      <AbsoluteFill
        style={{
          boxSizing: "border-box",
          padding: `104px ${BLEED_MARGIN}px 108px`,
          display: "flex",
          flexDirection: "column",
          gap: 36,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <Eyebrow text={eyebrow} theme={theme} color={theme.amber} />
          <KineticHeadline
            text={label}
            theme={theme}
            from={6}
            maxLines={3}
            min={54}
            max={116}
            stagger={2}
          />
        </div>

        {/* The exhibit band. Every template puts its figure here, at the same
            fraction of the frame, which is what lets one verifier check all of
            them by looking at the same pixels. */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Exhibit theme={theme} spec={spec} from={14} />
        </div>

        <MarchingList items={context} theme={theme} from={contextFrom} every={9} numbered={false} />
      </AbsoluteFill>
    </Frame>
  );
};
