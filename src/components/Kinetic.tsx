import React from "react";
import { fitTextOnNLines } from "@remotion/layout-utils";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Theme } from "../theme";

/**
 * Full-bleed kinetic type.
 *
 * The old layout put every element in a fixed-size box and stacked them from
 * the top, which left the bottom half of a 1080x1920 frame empty on most
 * videos — the single loudest "amateur" signal in a vertical feed. These
 * components size themselves to the space they are given instead, so the frame
 * is always full, and they reveal a word at a time so there is motion on
 * almost every frame rather than one entrance and then stillness.
 *
 * Sizes are measured, never guessed. `fitTextOnNLines` rasterises the actual
 * loaded face to find the largest size that fits the box in at most N lines,
 * which is the only way "edge to edge" survives a caption that is three words
 * longer than the last one.
 */

/** Frame is 1080 wide; a 44px gutter is as close to the edge as type should go. */
export const BLEED_MARGIN = 44;
export const SAFE_WIDTH = 1080 - BLEED_MARGIN * 2;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * Where an element sits when it has not arrived yet.
 *
 * `distance` is how far away it starts and `progress` closes that gap, so at
 * progress 1 every signature returns the identity transform and the finished
 * layout is the same whichever direction the video moves in. That is the whole
 * constraint on this axis: motion may vary, composition may not.
 */
function enterOffset(
  entry: Theme["motion"]["entry"],
  distance: number,
  progress: number,
): string {
  const away = (1 - progress) * distance;
  switch (entry) {
    case "down":
      return `translateY(${-away}px)`;
    case "left":
      return `translateX(${-away}px)`;
    case "right":
      return `translateX(${away}px)`;
    case "up":
    default:
      return `translateY(${away}px)`;
  }
}

/**
 * The largest size at which `text` fits `maxLines` lines of `boxWidth`.
 *
 * Clamped at both ends: a two-word hook would otherwise render at 400px and
 * look like a mistake, and a long one must not shrink below readable on a
 * phone held at arm's length.
 */
export function fittedSize({
  text,
  boxWidth = SAFE_WIDTH,
  maxLines,
  fontFamily,
  fontWeight,
  letterSpacing,
  min,
  max,
}: {
  text: string;
  boxWidth?: number;
  maxLines: number;
  fontFamily: string;
  fontWeight: number;
  letterSpacing: string;
  min: number;
  max: number;
}): number {
  const { fontSize } = fitTextOnNLines({
    text,
    maxLines,
    maxBoxWidth: boxWidth,
    fontFamily,
    fontWeight: String(fontWeight),
    letterSpacing,
  });
  return Math.max(min, Math.min(max, fontSize));
}

/**
 * A headline that fills its box, revealed one word at a time.
 *
 * Words rise and fade rather than typing out: a typewriter reveal forces the
 * viewer to read at the machine's pace, while a staggered rise lets them read
 * ahead and still feel the rhythm.
 */
export const KineticHeadline: React.FC<{
  text: string;
  theme: Theme;
  /** Frame the first word lands on. */
  from?: number;
  maxLines?: number;
  boxWidth?: number;
  min?: number;
  max?: number;
  color?: string;
  /** Frames between consecutive words. Lower is more urgent. */
  stagger?: number;
}> = ({
  text,
  theme,
  from = 0,
  maxLines = 4,
  boxWidth = SAFE_WIDTH,
  min = 62,
  max = 178,
  color,
  stagger,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Per-video motion. A caller may still pass an explicit stagger where a
  // script's beats are timed against a specific rhythm — WorksOnMyMachine and
  // LogoLadder both do — and an explicit value always wins.
  const motion = theme.motion;
  const step = stagger ?? motion.stagger;

  const fontSize = fittedSize({
    text,
    boxWidth,
    maxLines,
    fontFamily: theme.display,
    fontWeight: theme.weightHeavy,
    letterSpacing: theme.displayTracking,
    min,
    max,
  });

  const words = text.split(/\s+/).filter(Boolean);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        // Word gap is proportional so tracking stays right at any fitted size.
        columnGap: fontSize * 0.24,
        rowGap: fontSize * 0.06,
        fontFamily: theme.display,
        fontWeight: theme.weightHeavy,
        fontSize,
        lineHeight: 0.92,
        letterSpacing: theme.displayTracking,
        color: color ?? theme.paper,
      }}
    >
      {words.map((word, index) => {
        const enter = spring({
          frame: frame - (from + index * step),
          fps,
          config: { damping: motion.springDamping, mass: motion.springMass },
          durationInFrames: 16,
        });
        return (
          <span
            key={`${word}-${index}`}
            style={{
              display: "inline-block",
              opacity: enter,
              transform: enterOffset(motion.entry, fontSize * motion.travel, enter),
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

/**
 * Numbered lines that march up as each one lands.
 *
 * The list grows downward from a fixed top, and each arriving line nudges the
 * whole stack up by a fraction of a row, so the block stays optically centred
 * in its space instead of drifting toward the bottom edge as it fills.
 */
export const MarchingList: React.FC<{
  items: readonly string[];
  theme: Theme;
  from: number;
  /** Frames between consecutive items. */
  every: number;
  boxWidth?: number;
  accent?: string;
  numbered?: boolean;
}> = ({ items, theme, from, every, boxWidth = SAFE_WIDTH, accent, numbered = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const longest = items.reduce((a, b) => (a.length >= b.length ? a : b), "");
  const fontSize = fittedSize({
    text: longest,
    // Room for the numeral gutter.
    boxWidth: numbered ? boxWidth - 108 : boxWidth,
    maxLines: 1,
    fontFamily: theme.display,
    fontWeight: theme.weightMid,
    letterSpacing: "-0.02em",
    min: 40,
    max: 78,
  });

  const landed = items.filter((_, index) => frame >= from + index * every).length;
  const lift = interpolate(landed, [0, items.length], [0, fontSize * 0.5], clamp);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: fontSize * 0.42,
        transform: `translateY(${-lift}px)`,
      }}
    >
      {items.map((item, index) => {
        const enter = spring({
          frame: frame - (from + index * every),
          fps,
          config: { damping: theme.motion.springDamping, mass: theme.motion.springMass },
          durationInFrames: 18,
        });
        return (
          <div
            key={`${item}-${index}`}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 26,
              opacity: enter,
              // Rows always arrive horizontally — a list that dropped in
              // vertically would collide with the stack's own upward march —
              // so the signature only chooses which side they come from.
              transform: `translateX(${(1 - enter) * 34 * theme.motion.listFrom}px)`,
            }}
          >
            {numbered ? (
              <span
                style={{
                  fontFamily: theme.mono,
                  fontSize: fontSize * 0.5,
                  fontWeight: theme.weightBody,
                  color: accent ?? theme.seaglass,
                  minWidth: 82,
                  letterSpacing: "0.02em",
                }}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
            ) : null}
            <span
              style={{
                fontFamily: theme.display,
                fontWeight: theme.weightMid,
                fontSize,
                lineHeight: 1.02,
                letterSpacing: "-0.02em",
                color: theme.paper,
              }}
            >
              {item}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/**
 * The closing statement, as a full-bleed block rather than a rounded card.
 *
 * It runs past both margins deliberately: a payoff inset like every other
 * element reads as one more list item, and the point is that it is the answer.
 */
export const PayoffBlock: React.FC<{
  text: string;
  theme: Theme;
  from: number;
  background?: string;
  color?: string;
}> = ({ text, theme, from, background, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({
    frame: frame - from,
    fps,
    config: { damping: theme.motion.springDamping, mass: theme.motion.springMass + 0.2 },
    durationInFrames: 22,
  });

  const fontSize = fittedSize({
    text,
    boxWidth: 1080 - 96,
    maxLines: 3,
    fontFamily: theme.display,
    fontWeight: theme.weightHeavy,
    letterSpacing: "-0.03em",
    min: 46,
    max: 96,
  });

  return (
    <div
      style={{
        // Cancels the parent's gutter so the block reaches both edges.
        marginLeft: -BLEED_MARGIN,
        marginRight: -BLEED_MARGIN,
        padding: `${fontSize * 0.42}px 48px`,
        backgroundColor: background ?? theme.seaglass,
        color: color ?? theme.ground,
        fontFamily: theme.display,
        fontWeight: theme.weightHeavy,
        fontSize,
        lineHeight: 1.0,
        letterSpacing: "-0.03em",
        opacity: enter,
        // Wipes up from its own bottom edge instead of sliding in as a card.
        clipPath: `inset(${(1 - enter) * 100}% 0 0 0)`,
        transform: `translateY(${(1 - enter) * 18}px)`,
      }}
    >
      {text}
    </div>
  );
};

/** Split "43%" into the animatable number and its fixed prefix/suffix. */
function splitValue(value: string): { pre: string; num: string | null; post: string } {
  const match = /^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/.exec(value);
  if (!match) return { pre: value, num: null, post: "" };
  return { pre: match[1] ?? "", num: match[2] ?? null, post: match[3] ?? "" };
}

/**
 * The hero figure, counting up and sized to the frame.
 *
 * StatCard's whole job is one number, so it gets the full width — measured,
 * because "$2.4M" and "1 in 6" are wildly different widths at the same size
 * and a fixed 320px would overflow one and strand the other.
 */
export const HeroNumber: React.FC<{ value: string; theme: Theme; from?: number }> = ({
  value,
  theme,
  from = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const count = spring({
    frame: frame - from,
    fps,
    config: { damping: 200, mass: 0.7 },
    durationInFrames: 34,
  });

  const { pre, num, post } = splitValue(value);
  let shown = value;
  if (num !== null) {
    const target = Number(num.replace(/,/g, ""));
    const decimals = num.includes(".") ? (num.split(".")[1]?.length ?? 0) : 0;
    shown = `${pre}${(target * count).toFixed(decimals)}${post}`;
  }

  // Measured on the final string, not the animating one, so the figure does
  // not resize itself while it counts.
  const fontSize = fittedSize({
    text: value,
    maxLines: 1,
    fontFamily: theme.display,
    fontWeight: theme.weightHeavy,
    letterSpacing: "-0.05em",
    min: 150,
    max: 400,
  });

  return (
    <div
      style={{
        fontFamily: theme.display,
        fontWeight: theme.weightHeavy,
        fontSize,
        lineHeight: 0.84,
        letterSpacing: "-0.05em",
        color: theme.paper,
        fontVariantNumeric: "tabular-nums",
        transform: `scale(${0.95 + count * 0.05})`,
        transformOrigin: "left center",
      }}
    >
      {shown}
    </div>
  );
};

/**
 * Two figures set against each other, the second landing after the first.
 * Used where the story is a change rather than a list.
 */
export const BeforeAfter: React.FC<{
  before: string;
  after: string;
  theme: Theme;
  from: number;
}> = ({ before, after, theme, from }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const size = fittedSize({
    text: before.length >= after.length ? before : after,
    boxWidth: SAFE_WIDTH,
    maxLines: 2,
    fontFamily: theme.display,
    fontWeight: theme.weightHeavy,
    letterSpacing: "-0.03em",
    min: 54,
    max: 118,
  });

  const row = (text: string, delay: number, tone: string, struck: boolean) => {
    const enter = spring({
      frame: frame - delay,
      fps,
      config: { damping: 200, mass: 0.55 },
      durationInFrames: 20,
    });
    return (
      <div
        style={{
          fontFamily: theme.display,
          fontWeight: theme.weightHeavy,
          fontSize: size,
          lineHeight: 1.0,
          letterSpacing: "-0.03em",
          color: tone,
          opacity: enter,
          transform: `translateX(${(1 - enter) * -30}px)`,
          // The old value is struck through as the new one arrives, so the
          // relationship reads without a label saying "before".
          textDecoration: struck ? "line-through" : "none",
          textDecorationThickness: struck ? size * 0.05 : undefined,
        }}
      >
        {text}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: size * 0.18 }}>
      {row(before, from, theme.paperDim, frame >= from + 26)}
      {row(after, from + 26, theme.amber, false)}
    </div>
  );
};

/**
 * Small mono label with a lit dot. The one piece of chrome that survives,
 * because a vertical video needs something to say what it is in frame one.
 */
export const Eyebrow: React.FC<{ text: string; theme: Theme; color?: string }> = ({
  text,
  theme,
  color,
}) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 12], [0, 1], clamp);
  const tone = color ?? theme.seaglass;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        fontFamily: theme.mono,
        fontSize: 30,
        letterSpacing: "0.14em",
        color: tone,
        opacity: enter,
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 999,
          backgroundColor: tone,
          boxShadow: `0 0 26px ${tone}`,
        }}
      />
      {text}
    </div>
  );
};
