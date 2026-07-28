import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { Frame } from "../components/Frame";
import { BLEED_MARGIN, Eyebrow, KineticHeadline, MarchingList, PayoffBlock } from "../components/Kinetic";
import { themeFor } from "../theme";
import type { TechTipProps } from "../types";

const variantLabel: Record<TechTipProps["variant"], string> = {
  security: "SECURITY CHECK",
  devtools: "DEVTOOLS",
  "tool-audit": "STACK AUDIT",
  vitals: "WEB VITALS",
  "index-check": "INDEX CHECK",
  "design-code": "DESIGN → CODE",
};

/**
 * Hook, three steps, payoff — as type filling the frame.
 *
 * The console mock this template used to draw is gone. It rendered three bars
 * whose heights were `progress * (0.76 + index * 0.12)`: a number derived from
 * the frame counter and nothing else. It looked like a chart and measured
 * nothing, which is worse than no chart at all — it invites the viewer to read
 * a value that does not exist. The steps it framed are the actual content and
 * they now get the space.
 */
export const TechTip: React.FC<TechTipProps> = ({
  hook,
  steps,
  result,
  variant,
  score,
  videoId,
  theme: overrides,
}) => {
  const theme = themeFor(videoId, overrides);
  const { durationInFrames } = useVideoConfig();

  // The payoff lands with roughly a third of the runtime left, so it is on
  // screen long enough to be read twice before the end card takes over.
  const payoffAt = Math.max(60, Math.floor(durationInFrames * 0.6));
  const stepsFrom = 26;
  const stepEvery = Math.max(
    10,
    Math.floor((payoffAt - stepsFrom - 20) / Math.max(1, steps.length)),
  );

  return (
    <Frame theme={theme} template="TechTip" score={score}>
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

        {/* Takes all remaining height and centres itself in it, so the slack
            above and below the steps is always equal however long the hook
            wrapped. `space-between` split it unevenly. */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <MarchingList items={steps} theme={theme} from={stepsFrom} every={stepEvery} />
        </div>

        <PayoffBlock text={result} theme={theme} from={payoffAt} />
      </AbsoluteFill>
    </Frame>
  );
};
