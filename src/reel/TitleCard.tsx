import React from "react";
import { fitTextOnNLines } from "@remotion/layout-utils";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { SAFE, TITLE_CARD_FRAMES, WIDTH } from "./brief";
import type { ReelTheme } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * One second of title, then out of the way.
 *
 * The point is orientation: a viewer arriving mid-scroll gets the subject before
 * the demonstration starts, so the opening seconds are not spent working out
 * what they are looking at.
 *
 * Three things this deliberately does not do.
 *
 * It does not extend the reel. 900 frames is a locked delivery spec, so the card
 * lives inside frames 0-30 and beat one starts at 30 instead of 0. The
 * demonstration still owns the frame from second one.
 *
 * It does not persist. The document forbids any fixed element, and a title that
 * lingered would become exactly the header the spec rules out — so it is gone by
 * frame 30 and never returns.
 *
 * It does not enter the top 180 px. The card is centred in the frame's middle
 * band, which is well clear of the empty zone, and the measured type size is
 * capped so a long title grows in line count rather than upward.
 */
export const TitleCard: React.FC<{
  title: string;
  theme: ReelTheme;
}> = ({ title, theme }) => {
  const frame = useCurrentFrame();

  // Gone by 30. The fade finishes two frames early so frame 29 is already clear
  // rather than holding a nearly-invisible ghost over the first beat.
  const out = interpolate(frame, [TITLE_CARD_FRAMES - 8, TITLE_CARD_FRAMES - 2], [1, 0], clamp);
  if (frame >= TITLE_CARD_FRAMES) return null;

  // Arrives fast — a title that eased in over 15 frames would eat half its own
  // airtime. Weight and scale settle by frame 6.
  const arrive = interpolate(frame, [0, 6], [0, 1], clamp);

  const boxWidth = WIDTH - SAFE.left - SAFE.right;
  const fontSize = Math.min(
    132,
    Math.max(
      64,
      fitTextOnNLines({
        text: title,
        maxLines: 4,
        maxBoxWidth: boxWidth,
        fontFamily: theme.display,
        fontWeight: theme.weightHeavy,
        letterSpacing: "-0.03em",
      }).fontSize,
    ),
  );

  return (
    <AbsoluteFill
      style={{
        zIndex: 30,
        opacity: out,
        // The reel's own background, per the spec — not a separate black card,
        // which would read as a cut to a different video.
        backgroundColor: theme.ground,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        paddingLeft: SAFE.left,
        paddingRight: SAFE.right,
        // Clear of the empty top zone by a wide margin, and of the bottom safe
        // area, so the card is centred in the readable band rather than the
        // geometric one.
        paddingTop: SAFE.top,
        paddingBottom: SAFE.bottom,
      }}
    >
      <div
        style={{
          fontFamily: theme.display,
          fontWeight: theme.weightHeavy,
          fontSize,
          lineHeight: 1.02,
          letterSpacing: "-0.03em",
          color: theme.paper,
          textAlign: "center",
          textWrap: "balance",
          transform: `scale(${0.94 + arrive * 0.06})`,
          opacity: arrive,
        }}
      >
        {title}
      </div>
    </AbsoluteFill>
  );
};
