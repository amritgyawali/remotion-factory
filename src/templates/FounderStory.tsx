import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { Frame } from "../components/Frame";
import { BLEED_MARGIN, Eyebrow, KineticHeadline, PayoffBlock } from "../components/Kinetic";
import { Exhibit, resolveExhibit } from "../exhibits";
import { themeFor } from "../theme";
import type { FounderStoryProps } from "../types";

/**
 * The slowest template, and deliberately so.
 *
 * The PDF's rule for this bed is "no music at all for the first three
 * seconds. Ever." The frame honours the same restraint: the hook holds alone
 * for a beat before anything else arrives.
 *
 * The moments used to be an unnumbered text list, on the argument that a
 * counted list reads as advice and this one is a story. That argument was
 * right about numbering and wrong about form — a story is a sequence, and a
 * sequence is the one thing a list of centred sentences cannot show. They are
 * drawn now: a timeline the playhead crosses, stages the work waits in. The
 * turn still lands as type, because the turn is a sentence.
 */
export const FounderStory: React.FC<FounderStoryProps> = ({
  hook,
  moments,
  turn,
  lesson,
  exhibit,
  score,
  videoId,
  theme: overrides,
}) => {
  const theme = themeFor(videoId, overrides);
  const { durationInFrames } = useVideoConfig();
  const spec = resolveExhibit("FounderStory", { hook, moments, turn, lesson, exhibit }, videoId);

  const lessonAt = Math.max(72, Math.floor(durationInFrames * 0.74));
  const turnAt = Math.max(56, lessonAt - 52);
  // Nothing arrives for the first forty frames but the hook itself.
  const momentsFrom = 40;

  return (
    <Frame theme={theme} template="FounderStory" score={score} videoId={videoId}>
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
          <Eyebrow text="FOUNDER STORY" theme={theme} />
          {/* Slower stagger: this hook should land like a sentence, not a hit. */}
          <KineticHeadline text={hook} theme={theme} from={8} maxLines={3} max={150} stagger={5} />
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 48,
          }}
        >
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <Exhibit theme={theme} spec={spec} from={momentsFrom} />
          </div>
          <KineticHeadline
            text={turn}
            theme={theme}
            from={turnAt}
            maxLines={2}
            min={50}
            max={90}
            color={theme.amber}
            stagger={3}
          />
        </div>

        <PayoffBlock text={lesson} theme={theme} from={lessonAt} />
      </AbsoluteFill>
    </Frame>
  );
};
