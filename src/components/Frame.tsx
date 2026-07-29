import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { type Theme } from "../theme";
import { Soundtrack } from "../audio/Score";
import { resolveScore } from "../audio/defaultScore";
import { Backdrop } from "./Stage";

const MARGIN = 72;

/**
 * Grain, as a repeating tile rather than a full-frame SVG filter.
 *
 * The grain never changes, but an feTurbulence filter covering the whole
 * 1080x1920 frame is re-evaluated on every single frame, and Perlin noise over
 * two million pixels is expensive: measured on this project it accounted for
 * roughly three quarters of total render time.
 *
 * A data-URI SVG is rasterised once and cached as an image, so the filter runs
 * a single time over a 256px tile — about 1/32nd of the pixels — and every
 * frame after that is a blit. The noise is high-frequency enough at this
 * baseFrequency that the tile seam is not visible.
 */
const GRAIN_TILE = 256;
const GRAIN_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${GRAIN_TILE}" height="${GRAIN_TILE}">` +
  '<filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3"/></filter>' +
  '<rect width="100%" height="100%" filter="url(#g)"/>' +
  "</svg>";
const GRAIN_URL = `url("data:image/svg+xml;utf8,${encodeURIComponent(GRAIN_SVG)}")`;

/**
 * The ground every video sits on: colour field, ambient drift, grain, and the
 * two-second brand close. Deliberately nothing else — see the note by
 * {children} below.
 */
export const Frame: React.FC<{
  theme: Theme;
  /** Composition id, which is also the bed name in the audio pack. */
  template: string;
  /** Beat-exact cue list off the plan. Falls back to the template's bed behaviour. */
  score?: unknown;
  /**
   * The plan item's id. Selects this video's bed — beds are written per id, not
   * per template, so that a shard of renders can share one bundle — and seeds
   * the backdrop, so two videos on one template do not get the same drift.
   */
  videoId?: string;
  children: React.ReactNode;
}> = ({ theme, template, score, videoId, children }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const endCardFrame = frame - Math.max(0, durationInFrames - fps * 2);
  const endCard = spring({
    frame: Math.max(0, endCardFrame),
    fps,
    config: { damping: 200, mass: 0.65 },
    durationInFrames: 10,
  });

  const exit = interpolate(
    frame,
    [durationInFrames - 10, durationInFrames - 1],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: theme.ground, opacity: exit }}>
      {/*
        Sound lives here rather than in each template, so no video can ship
        silent. The PDF is explicit that with no voiceover the audio track is
        "not decoration, it is the performance".
      */}
      <Soundtrack score={resolveScore(score, template, durationInFrames, fps)} videoId={videoId} />

      {/*
        Depth, not just a lit corner. The single drifting radial this replaces
        left the field reading as a still image with text moving on it; Backdrop
        adds a receding grid and two counter-drifting glows so the frame has
        somewhere to be behind the type. It derives its own clip-relative time
        from useCurrentFrame, so the ambient drift this file used to compute
        lives there now.
      */}
      <Backdrop theme={theme} seed={videoId ?? template} />

      {/* Grain. Keeps flat colour fields from banding after platform re-encode. */}
      <AbsoluteFill
        style={{
          opacity: 0.11,
          mixBlendMode: "overlay",
          backgroundImage: GRAIN_URL,
          backgroundRepeat: "repeat",
          backgroundSize: `${GRAIN_TILE}px ${GRAIN_TILE}px`,
        }}
      />

      {/*
        No header and no footer, by design. No eyebrow, no company name, no
        day counter, no kicker — nothing framing the content. The on-screen
        text is the entire script, so anything persistent around it competes
        with the only thing carrying the story.

        The two-second end card below is the exception, and it is the source
        PDF's one non-negotiable: "the same two seconds close every one of the
        thirty videos ... written as the final row of every script so it can
        never be forgotten". It is a brand close, not a frame around the video.
      */}
      {children}

      {/* Every PDF concept ends on the same two-second brand signature. */}
      <AbsoluteFill
        style={{
          zIndex: 20,
          backgroundColor: "#191919",
          alignItems: "center",
          justifyContent: "center",
          opacity: endCard,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: 142,
            height: 142,
            borderRadius: 34,
            display: "grid",
            placeItems: "center",
            backgroundColor: theme.amber,
            color: "#191919",
            fontFamily: theme.display,
            fontWeight: theme.weightHeavy,
            fontSize: 62,
            letterSpacing: "-0.08em",
            transform: `scale(${0.82 + endCard * 0.18}) rotate(${(1 - endCard) * -5}deg)`,
          }}
        >
          MB
        </div>
        <div
          style={{
            marginTop: 48,
            fontFamily: theme.display,
            fontWeight: theme.weightHeavy,
            fontSize: 74,
            lineHeight: 1,
            letterSpacing: "-0.03em",
            color: theme.paper,
            textAlign: "center",
            transform: `translateY(${(1 - endCard) * 24}px)`,
          }}
        >
          MeritByte
        </div>
        <div
          style={{
            marginTop: 14,
            fontFamily: theme.mono,
            fontSize: 25,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: theme.paperDim,
          }}
        >
          Technologies
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 190,
            fontFamily: theme.mono,
            fontSize: 27,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: theme.seaglass,
          }}
        >
          MERITBYTE.COM
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const CONTENT_MARGIN = MARGIN;
