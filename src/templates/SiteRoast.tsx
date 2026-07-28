import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { Frame } from "../components/Frame";
import { BLEED_MARGIN, Eyebrow, KineticHeadline, MarchingList, PayoffBlock } from "../components/Kinetic";
import { themeFor } from "../theme";
import type { SiteRoastProps } from "../types";

/**
 * Problems, then the rebuild, then the score.
 *
 * The PDF has the bed drop out for the rebuild and return bigger for the
 * verdict, so the fix and the verdict are two separate arrivals rather than
 * one block: the pause between them is where the music does its work.
 */
export const SiteRoast: React.FC<SiteRoastProps> = ({
  hook,
  episode,
  problems,
  fix,
  verdict,
  score,
  videoId,
  theme: overrides,
}) => {
  const theme = themeFor(videoId, overrides);
  const { durationInFrames } = useVideoConfig();

  const verdictAt = Math.max(70, Math.floor(durationInFrames * 0.72));
  const fixAt = Math.max(52, verdictAt - 46);
  const problemsFrom = 24;
  const problemEvery = Math.max(
    9,
    Math.floor((fixAt - problemsFrom - 16) / Math.max(1, problems.length)),
  );

  return (
    <Frame theme={theme} template="SiteRoast" score={score}>
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
          <Eyebrow text={`ROAST ${episode}`} theme={theme} />
          <KineticHeadline text={hook} theme={theme} from={4} maxLines={3} max={156} />
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 44,
          }}
        >
          <MarchingList items={problems} theme={theme} from={problemsFrom} every={problemEvery} />
          <KineticHeadline
            text={fix}
            theme={theme}
            from={fixAt}
            maxLines={2}
            min={48}
            max={86}
            color={theme.seaglass}
            stagger={2}
          />
        </div>

        <PayoffBlock text={verdict} theme={theme} from={verdictAt} background={theme.amber} />
      </AbsoluteFill>
    </Frame>
  );
};
