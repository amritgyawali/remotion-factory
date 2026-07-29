import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { Frame } from "../components/Frame";
import { BLEED_MARGIN, Eyebrow, KineticHeadline, PayoffBlock } from "../components/Kinetic";
import { BrowserStage } from "../components/Stage";
import { themeFor } from "../theme";
import type { SiteRoastProps } from "../types";

/**
 * The page, its faults, and the fix — shown, then said.
 *
 * This used to be a headline over a numbered list over a verdict: three stacks
 * of type on a flat field, with the middle third of the frame empty. Nothing on
 * screen was a website, so "this polished page still loses intent" was a claim
 * the viewer had to take on faith.
 *
 * Now the page is on screen. Each fault pins itself to the part of the mock it
 * is about, on the same frame the words arrive, and at `fixAt` the markers
 * clear and the skeleton resolves — the call to action lights up, the chrome
 * turns from amber to seaglass. The fix is a thing that visibly happens rather
 * than a line of copy claiming it did.
 *
 * The PDF's beat is unchanged: problems, a pause, the rebuild, the score. The
 * pause is still where the bed drops out.
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
  const problemsFrom = 30;
  /**
   * Capped, not just spread. Dividing the whole pre-fix span by the fault count
   * put 142 frames between markers on a 24s clip — nearly five seconds of a
   * static browser between one fault and the next, which is exactly the stall
   * this redesign existed to remove. Faults land in the first third and the
   * page then sits fully marked up, which is also the more honest picture: the
   * problems coexist, they do not queue.
   */
  const problemEvery = Math.min(
    46,
    Math.max(14, Math.floor((fixAt - problemsFrom - 16) / Math.max(1, problems.length))),
  );

  return (
    <Frame theme={theme} template="SiteRoast" score={score} videoId={videoId}>
      <AbsoluteFill
        style={{
          boxSizing: "border-box",
          padding: `74px ${BLEED_MARGIN}px 0`,
          display: "flex",
          flexDirection: "column",
          gap: 26,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <Eyebrow text={`ROAST ${episode}`} theme={theme} />
          {/*
            Two lines, not three. The browser below needs the room, and a hook
            that has to wrap three times was never the strongest one available.
          */}
          <KineticHeadline text={hook} theme={theme} from={4} maxLines={2} max={128} />
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <BrowserStage
            theme={theme}
            faults={problems}
            from={problemsFrom}
            every={problemEvery}
            fixAt={fixAt}
            height={880}
          />
        </div>

        {/*
          The fix is spoken over the repaired page rather than replacing it, so
          the viewer reads the words while the evidence is still on screen.
        */}
        <KineticHeadline
          text={fix}
          theme={theme}
          from={fixAt + 6}
          maxLines={2}
          min={44}
          max={74}
          color={theme.seaglass}
          stagger={2}
        />

        <PayoffBlock text={verdict} theme={theme} from={verdictAt} background={theme.amber} />
      </AbsoluteFill>
    </Frame>
  );
};
