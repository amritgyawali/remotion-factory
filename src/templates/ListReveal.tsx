import React from "react";
import { AbsoluteFill } from "remotion";
import { Frame } from "../components/Frame";
import { BLEED_MARGIN, Eyebrow, KineticHeadline } from "../components/Kinetic";
import { Exhibit, resolveExhibit } from "../exhibits";
import { themeFor } from "../theme";
import type { ListRevealProps } from "../types";

/**
 * A headline and the thing its list is about.
 *
 * The list used to be set as type marching up the frame, and for a checklist of
 * four short lines that is nearly the right answer — the failure was that it
 * was the *only* thing on screen below the headline, so two thirds of the frame
 * was a colour field with numbered sentences on it.
 *
 * The items now arrive as an exhibit instead of as a text list. That is a
 * substitution, not an addition: drawing both would be the same four lines
 * twice. Which figure they arrive in rotates across the campaign — steps that
 * resolve, satellites that land on an orbit, stages a packet crosses — so four
 * checklists in one week do not read as one video posted four times.
 */
export const ListReveal: React.FC<ListRevealProps> = ({
  eyebrow,
  headline,
  items,
  exhibit,
  score,
  videoId,
  theme: overrides,
}) => {
  const theme = themeFor(videoId, overrides);
  const spec = resolveExhibit("ListReveal", { headline, items, exhibit }, videoId);

  return (
    <Frame theme={theme} template="ListReveal" score={score} videoId={videoId}>
      <AbsoluteFill
        style={{
          boxSizing: "border-box",
          padding: `104px ${BLEED_MARGIN}px 108px`,
          display: "flex",
          flexDirection: "column",
          gap: 40,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
          <Eyebrow text={eyebrow} theme={theme} color={theme.amber} />
          <KineticHeadline text={headline} theme={theme} from={4} maxLines={3} max={140} />
        </div>

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Exhibit theme={theme} spec={spec} from={20} />
        </div>
      </AbsoluteFill>
    </Frame>
  );
};
