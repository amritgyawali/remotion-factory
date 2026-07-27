import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { display, mono, SERIES_LENGTH, type Theme } from "../theme";

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
 * The signature element: a ledger rule that measures the video's position
 * in the seven-day run. The numbering is meaningful here: a returning viewer
 * can see where this video sits in the current weekly edition.
 */
export const Frame: React.FC<{
  theme: Theme;
  day: number;
  eyebrow: string;
  kicker?: string;
  children: React.ReactNode;
}> = ({ theme, day, eyebrow, kicker, children }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width } = useVideoConfig();

  const draw = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 24 });
  const ruleWidth = (width - MARGIN * 2) * (day / SERIES_LENGTH) * draw;
  const endCardFrame = frame - Math.max(0, durationInFrames - fps * 2);
  const endCard = spring({
    frame: Math.max(0, endCardFrame),
    fps,
    config: { damping: 200, mass: 0.65 },
    durationInFrames: 10,
  });

  // Slow ambient drift so a static composition never looks frozen.
  const drift = interpolate(frame, [0, durationInFrames], [0, 1]);

  const exit = interpolate(
    frame,
    [durationInFrames - 10, durationInFrames - 1],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: theme.ground, opacity: exit }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 70% at ${18 + drift * 24}% ${
            12 + drift * 10
          }%, ${theme.groundLift} 0%, transparent 62%)`,
        }}
      />

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

      {/* Eyebrow */}
      <div
        style={{
          position: "absolute",
          top: MARGIN + 24,
          left: MARGIN,
          right: MARGIN,
          fontFamily: mono,
          fontSize: 28,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: theme.amber,
          opacity: draw,
        }}
      >
        {eyebrow}
      </div>

      {children}

      {/* Ledger rule */}
      <div style={{ position: "absolute", left: MARGIN, right: MARGIN, bottom: 232 }}>
        <div style={{ height: 2, backgroundColor: theme.rule, width: "100%" }} />
        <div
          style={{
            height: 2,
            backgroundColor: theme.amber,
            width: ruleWidth,
            marginTop: -2,
          }}
        />
        <div
          style={{
            fontFamily: mono,
            fontSize: 24,
            letterSpacing: "0.14em",
            color: theme.paperDim,
            marginTop: 22,
            display: "flex",
            justifyContent: "space-between",
            opacity: draw,
          }}
        >
          <span>
            DAY {String(day).padStart(2, "0")} / {SERIES_LENGTH}
          </span>
          {kicker ? <span style={{ color: theme.seaglass }}>{kicker}</span> : null}
        </div>
      </div>

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
            fontFamily: display,
            fontWeight: 900,
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
            fontFamily: display,
            fontWeight: 800,
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
            fontFamily: mono,
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
            fontFamily: mono,
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
