import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Theme } from "../theme";

/**
 * The chrome every exhibit sits in, and the mark specs they all draw with.
 *
 * Two things are centralised here rather than repeated in thirteen components.
 *
 * The first is the panel: an exhibit has to lift off a backdrop that is itself
 * drifting, or the figure reads as part of the wallpaper. It arrives on a
 * spring rather than a fade for the reason the window stages already do — a
 * fade reads as a slide transition, a physical arrival reads as an object
 * entering the frame.
 *
 * The second is the mark specs. They are a house style with one number in them
 * that is easy to get wrong, so it is derived here once and imported everywhere.
 */

/**
 * Frame pixels per reference pixel.
 *
 * Chart mark specs — a 24px bar cap, a 2px line, an 8px marker, a 2px gap
 * between touching marks — are written for a chart on a desktop screen, where
 * a CSS pixel is a pixel. This frame is 1080 wide but it is watched on a phone
 * roughly 390pt across, so a mark drawn at its literal spec appears at about a
 * third of its intended size: a 24px bar arrives on the viewer's screen as 9
 * points of ink, which is a hairline.
 *
 * 1080 / 390 = 2.77. Every spec below is the reference figure times this, so
 * the marks land on the viewer's eye at the size the specs were calibrated for
 * rather than at the size the frame buffer happens to be.
 */
export const MARK_SCALE = 1080 / 390;

const scaled = (referencePx: number) => Math.round(referencePx * MARK_SCALE);

export const MARKS = {
  /** Bar/column thickness cap. Never fill the band — the leftover is air. */
  barThickness: scaled(24),
  /** Line weight, round join and cap. */
  line: scaled(2),
  /** Marker and end-dot diameter. */
  marker: scaled(8),
  /**
   * The surface gap. Touching marks are separated by a gap in the surface
   * colour, never by a stroke drawn round them — a border adds ink that is not
   * data. One consistent width across a whole figure.
   */
  gap: scaled(2),
  /** Hairline grid and axis. Solid, never dashed, and always recessive. */
  hairline: Math.max(1, scaled(1)),
  /** Rounded data-end on a bar. Square at the baseline, rounded at the tip. */
  cap: scaled(4),
} as const;

/**
 * Figures are formatted for reading aloud in one glance, not for a table.
 *
 * `tabular-nums` is deliberately not applied to large standalone values: it
 * gives every digit the width of a zero, which at 120px makes "121" look like
 * it has been kerned by an accident. Columns of numbers that must align — a
 * meter's row values, an axis — ask for it explicitly.
 */
export function compact(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000) return `${trim(value / 1_000_000)}M`;
  if (magnitude >= 10_000) return `${trim(value / 1_000)}K`;
  if (magnitude >= 1_000) return value.toLocaleString("en-US");
  return trim(value);
}

const trim = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");

/**
 * A number that counts up to its value.
 *
 * The count is the reason a figure belongs in a video: a finished number is a
 * screenshot, a number arriving is an event. It rides the same spring the mark
 * it labels does, so the digits and the ink they describe stay in step — a
 * value that finishes before its bar does reads as two unrelated animations.
 *
 * Pure, taking `frame` and `fps`, rather than a hook that reads them itself.
 * Every exhibit draws a *list* of marks, so the timing call happens inside a
 * `map`, and a hook called in a loop is a hook whose call order changes with
 * the data. The components below read the frame once at the top and pass it
 * down — the same shape `Stage.tsx` already uses for the same reason.
 */
export function counted(
  target: number,
  from: number,
  frame: number,
  fps: number,
  frames = 30,
): number {
  return (
    target *
    spring({
      frame: Math.max(0, frame - from),
      fps,
      config: { damping: 200, mass: 0.7 },
      durationInFrames: frames,
    })
  );
}

/** Progress 0..1 for a mark that arrives at `from`, on the video's own spring. */
export function arrival(
  theme: Theme,
  from: number,
  frame: number,
  fps: number,
  frames = 24,
): number {
  return spring({
    frame: Math.max(0, frame - from),
    fps,
    config: { damping: theme.motion.springDamping, mass: theme.motion.springMass },
    durationInFrames: frames,
  });
}

/**
 * The panel an exhibit is drawn on.
 *
 * `label` is the figure's title and carries what is being measured, which is
 * why no exhibit below draws a legend box: with at most two series and a title
 * that names them, a legend would restate the title and cost the space the
 * marks need. Identity comes from direct labels riding the marks instead.
 */
export const Figure: React.FC<{
  theme: Theme;
  /** Small mono title. What this figure is of. */
  label: string;
  /** Optional right-hand note — a unit, a source, a scale. */
  note?: string;
  from: number;
  /**
   * Fixed height, in the rare case a template needs one. Left unset the panel
   * takes all the height its container offers, which is the behaviour that
   * keeps the band honest: a panel sized to its own contents left the bottom
   * third of a 1080x1920 frame as bare colour field for the first six seconds,
   * which is the single loudest "amateur" signal in a vertical feed and the
   * exact failure the kinetic layout was built to remove.
   */
  height?: number;
  children: React.ReactNode;
}> = ({ theme, label, note, from, height, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = arrival(theme, from, frame, fps, 26);

  return (
    <div
      style={{
        position: "relative",
        height,
        flex: height === undefined ? 1 : undefined,
        minHeight: 0,
        boxSizing: "border-box",
        borderRadius: 26,
        overflow: "hidden",
        background: theme.chart.panel,
        border: `${MARKS.hairline}px solid ${theme.rule}`,
        boxShadow: `0 2px 0 ${theme.paper}14, 0 34px 70px rgba(0,0,0,0.5)`,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 46}px) scale(${0.965 + enter * 0.035})`,
        transformOrigin: "50% 100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 20,
          padding: "26px 32px 0",
          fontFamily: theme.mono,
          fontSize: 26,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          // Text wears an ink token, never a series colour: a light categorical
          // hue is illegible as type, and identity is meant to come from the
          // coloured mark beside the words rather than from the words.
          color: theme.paperDim,
        }}
      >
        <span>{label}</span>
        {note ? <span style={{ letterSpacing: "0.1em" }}>{note}</span> : null}
      </div>

      <div style={{ flex: 1, minHeight: 0, padding: "28px 32px 32px", display: "flex" }}>
        {children}
      </div>
    </div>
  );
};

/**
 * A direct label riding a mark.
 *
 * Direct labels are not a nicety in this medium, they are the whole
 * accessibility story. A chart in a browser can fall back to a tooltip, a
 * legend and a table view; a chart in a video has none of those, so the label
 * beside the mark is the only channel left when colour fails. Every exhibit
 * below labels every mark it draws for that reason — the usual advice to label
 * selectively assumes a reader who can hover for the rest.
 */
export const MarkLabel: React.FC<{
  theme: Theme;
  text: string;
  /** The mark's colour, shown as a swatch. Never applied to the text. */
  swatch?: string;
  size?: number;
  opacity?: number;
}> = ({ theme, text, swatch, size = 28, opacity = 1 }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: size * 0.42,
      fontFamily: theme.mono,
      fontSize: size,
      letterSpacing: "0.04em",
      color: theme.paperDim,
      opacity,
    }}
  >
    {swatch ? (
      <span
        style={{
          width: size * 0.44,
          height: size * 0.44,
          borderRadius: 999,
          background: swatch,
          flexShrink: 0,
        }}
      />
    ) : null}
    {text}
  </span>
);
