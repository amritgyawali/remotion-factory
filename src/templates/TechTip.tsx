import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { Frame } from "../components/Frame";
import { BLEED_MARGIN, Eyebrow, KineticHeadline, PayoffBlock } from "../components/Kinetic";
import { Exhibit, resolveExhibit } from "../exhibits";
import { themeFor } from "../theme";
import type { TechTipProps } from "../types";

const variantLabel: Record<TechTipProps["variant"], string> = {
  security: "SECURITY CHECK",
  devtools: "DEVTOOLS",
  "tool-audit": "STACK AUDIT",
  prompt: "ONE PROMPT",
  vitals: "WEB VITALS",
  "index-check": "INDEX CHECK",
  "design-code": "DESIGN → CODE",
};

/**
 * Hook, the steps happening, payoff.
 *
 * A console mock used to sit here and was deleted for cause: it rendered three
 * bars whose heights were `progress * (0.76 + index * 0.12)` — a number derived
 * from the frame counter and nothing else. It looked like a chart and measured
 * nothing, which is worse than no chart at all, because it invites the viewer
 * to read a value that does not exist.
 *
 * What replaces it is the opposite of that mistake rather than a return to it.
 * The steps are not decorated with a chart; they are *drawn as themselves* — a
 * checklist that resolves each one, a pipeline a packet crosses, a scan that
 * finds them one at a time. Every label on screen is a line the script already
 * wrote, and no mark claims a quantity. A script that does want a measurement
 * supplies the numbers and gets a real chart.
 */
export const TechTip: React.FC<TechTipProps> = ({
  hook,
  steps,
  result,
  variant,
  exhibit,
  score,
  videoId,
  theme: overrides,
}) => {
  const theme = themeFor(videoId, overrides);
  const { durationInFrames } = useVideoConfig();
  const spec = resolveExhibit("TechTip", { hook, steps, result, variant, exhibit }, videoId);

  // The payoff lands with roughly a third of the runtime left, so it is on
  // screen long enough to be read twice before the end card takes over.
  const payoffAt = Math.max(60, Math.floor(durationInFrames * 0.6));

  return (
    <Frame theme={theme} template="TechTip" score={score} videoId={videoId}>
      <AbsoluteFill
        style={{
          boxSizing: "border-box",
          // No bottom padding: the payoff runs to the frame edge, which is
          // what makes it read as the answer rather than the last list item.
          padding: `104px ${BLEED_MARGIN}px 0`,
          display: "flex",
          flexDirection: "column",
          gap: 40,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
          <Eyebrow text={variantLabel[variant]} theme={theme} />
          <KineticHeadline text={hook} theme={theme} from={6} maxLines={3} max={168} />
        </div>

        {/* Takes all remaining height, so the slack above and below the figure
            is always equal however long the hook wrapped. `space-between` split
            it unevenly. */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Exhibit theme={theme} spec={spec} from={22} />
        </div>

        <PayoffBlock text={result} theme={theme} from={payoffAt} />
      </AbsoluteFill>
    </Frame>
  );
};
