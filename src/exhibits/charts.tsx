import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Theme } from "../theme";
import { arrival, compact, counted, Figure, MARKS, MarkLabel } from "./Figure";
import type {
  BarsExhibit,
  BoardExhibit,
  CartogramExhibit,
  CompareExhibit,
  DialExhibit,
  MetersExhibit,
} from "./types";

/**
 * The exhibits whose marks encode a measurement.
 *
 * Every length, angle and shade in this file is `value / scale`. That sounds
 * like a truism and it is the one rule this project has already paid for
 * breaking: TechTip used to draw three bars whose heights were
 * `progress * (0.76 + index * 0.12)` — a number derived from the frame counter
 * and nothing else. It looked like a chart and measured nothing, which is worse
 * than no chart, because it invites the viewer to read a value that does not
 * exist. That component was deleted rather than fixed.
 *
 * So these components take numbers or they do not render. There is no "make
 * something chart-shaped" path through this file, and the plan validator
 * refuses a chart-family exhibit whose numeric fields are not numbers.
 *
 * Colour follows the four-jobs rule. Two series that must be told apart get
 * `chart.primary` and `chart.secondary`, the pair measured for colourblind
 * separation in theme.ts. A single series against its own whole gets one hue in
 * two steps. Magnitude across many cells gets one hue, light to dark. Nothing
 * here cycles hues, and no figure has two y-scales.
 */

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Blend two #rrggbb colours. Used where a mark fades toward the ground. */
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const at = Math.max(0, Math.min(1, t));
  const step = (x: number, y: number) => Math.round(x + (y - x) * at);
  return `rgb(${step(ar, br)}, ${step(ag, bg)}, ${step(ab, bb)})`;
}

/**
 * The sequential ramp: one hue, dark to light, at a fixed proportion of the
 * signal colour.
 *
 * Both halves of that sentence are corrections of the obvious implementation,
 * which was to fade the signal colour toward the ground.
 *
 * Fading toward the ground is not one hue. The ground is chromatic — that is
 * the whole point of the eight palettes — so a step halfway between an orange
 * signal and a purple ground is a muddy *brown*, and the ramp measured a 45°
 * hue spread on aubergine. A ramp whose hue moves is a ramp the reader has to
 * decode instead of read. Scaling every channel by the same factor is exactly
 * a lightness change and leaves hue untouched: measured spread is now 1°.
 *
 * The floor is 0.5 rather than 0, because the bottom of the ramp still has to
 * be a visible mark. At a 0.18 floor the lowest cell measured 1.45:1 against
 * its ground — a region carrying real data, rendered invisible. 0.5 is the
 * smallest floor that clears 2:1 on all eight grounds (the tightest, oxblood,
 * lands at 2.30:1).
 */
export const RAMP_FLOOR = 0.5;

function rampStep(signal: string, intensity: number): string {
  const scale = RAMP_FLOOR + Math.max(0, Math.min(1, intensity)) * (1 - RAMP_FLOOR);
  const hex = (value: number) => Math.round(value * scale).toString(16).padStart(2, "0");
  const [r, g, b] = channels(signal);
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * Ink for a label sitting *inside* a filled mark.
 *
 * A label on a data colour is the one place text may not wear an ink token,
 * because the fill is what it has to clear — so the choice is made by measuring
 * the fill rather than by picking a threshold on the value that produced it.
 * Relative luminance, WCAG's own formula: above the midpoint the fill is light
 * and the label goes dark, below it the reverse.
 */
function inkOn(fill: string, theme: Theme): string {
  const toLinear = (value: number) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = channels(fill);
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.32 ? theme.ground : theme.paper;
}

/* -------------------------------------------------------------------------- */
/* Dial — one ratio against its whole                                          */
/* -------------------------------------------------------------------------- */

/**
 * A ring gauge, drawn as an SVG arc.
 *
 * A single ratio against a limit is a meter, and a meter's unfilled track is a
 * lighter step of the same hue rather than a neutral grey — state then reads
 * across the whole ring instead of only across the part that happens to be
 * filled. A two-slice pie would be the obvious alternative and is the wrong
 * one: the eye compares angles badly and the second slice carries no meaning.
 *
 * The arc opens from twelve o'clock and the number counts on the same spring,
 * so the digits and the ink finish together.
 */
export const Dial: React.FC<{ theme: Theme; spec: DialExhibit; from: number }> = ({
  theme,
  spec,
  from,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const whole = spec.of ?? (spec.unit === "%" ? 100 : Math.max(spec.value, 1));
  const shown = counted(spec.value, from + 6, frame, fps, 34);
  const ratio = Math.max(0, Math.min(1, shown / whole));

  // Sized against the band the panel now fills, not against the smaller panel
  // it used to shrink to. A gauge is the whole figure when it is the figure.
  const size = 620;
  const stroke = MARKS.barThickness;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 26,
      }}
    >
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ display: "block" }}>
          {/* Track first, so the fill paints over it at the seam. */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={theme.chart.track}
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={theme.chart.primary}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference * ratio} ${circumference}`}
            // Opens from twelve o'clock, clockwise, which is the direction a
            // dial is read. Rotating the element is cheaper than recomputing
            // the path and keeps this a single composited layer.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <div
            style={{
              fontFamily: theme.display,
              fontWeight: theme.weightHeavy,
              fontSize: 176,
              lineHeight: 0.9,
              letterSpacing: "-0.04em",
              color: theme.paper,
            }}
          >
            {Math.round(shown)}
            <span style={{ fontSize: 96 }}>{spec.unit}</span>
          </div>
        </div>
      </div>

      {spec.caption ? (
        <MarkLabel theme={theme} text={spec.caption} swatch={theme.chart.primary} size={30} />
      ) : null}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Bars — magnitude, on one baseline                                           */
/* -------------------------------------------------------------------------- */

/**
 * Two to four columns, growing from a single baseline.
 *
 * One scale and one baseline, always. A second y-axis is the single most
 * common way a chart lies, and there is no case for one here: two measures of
 * different scale are two figures, not one figure with two rulers.
 *
 * The mark spec says cap a bar at 24 reference pixels and let the rest of its
 * band be air. That cap assumes a chart sharing a dashboard with five others.
 * This figure *is* the frame, so the cap is proportional instead — a bar takes
 * at most 62% of its band, which keeps the same "leftover is air" relationship
 * the spec is protecting while letting the marks read on a phone.
 */
export const Bars: React.FC<{ theme: Theme; spec: BarsExhibit; from: number }> = ({
  theme,
  spec,
  from,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const series = spec.series.slice(0, 4);
  const peak = Math.max(1, ...series.map((datum) => datum.value));
  const emphasis = spec.emphasis ?? series.findIndex((d) => d.value === peak);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 22 }}>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "flex-end",
          // The surface gap does the separating between adjacent bars. A stroke
          // round each one would add ink that is not data.
          gap: MARKS.gap * 4,
        }}
      >
        {series.map((datum, index) => {
          const grow = arrival(theme, from + 8 + index * 7, frame, fps, 30);
          const height = (datum.value / peak) * grow;
          // Emphasis, not categorical: one bar is the story and the rest are
          // context, so they take a receding step of the same hue rather than
          // a hue of their own. Colour that changes with rank would be a lie —
          // it is the entity that matters, not its position.
          const lit = index === emphasis;

          return (
            <div
              key={`${datum.label}-${index}`}
              style={{
                flex: 1,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 16,
              }}
            >
              <div
                style={{
                  fontFamily: theme.display,
                  fontWeight: theme.weightHeavy,
                  fontSize: 62,
                  lineHeight: 1,
                  letterSpacing: "-0.03em",
                  color: theme.paper,
                  opacity: grow,
                }}
              >
                {compact(datum.value * grow)}
                <span style={{ fontSize: 34, color: theme.paperDim }}>{spec.unit}</span>
              </div>
              <div
                style={{
                  width: "62%",
                  height: `${height * 100}%`,
                  background: lit ? theme.chart.primary : theme.chart.track,
                  // Rounded at the data end, square at the baseline: the tip is
                  // the value, and a rounded foot would lift the mark off the
                  // line it is measured from.
                  borderRadius: `${MARKS.cap}px ${MARKS.cap}px 0 0`,
                }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: MARKS.gap * 4 }}>
        {series.map((datum, index) => (
          <div
            key={`${datum.label}-label-${index}`}
            style={{ flex: 1, display: "flex", justifyContent: "center", textAlign: "center" }}
          >
            <MarkLabel
              theme={theme}
              text={datum.label}
              size={26}
              opacity={interpolate(frame, [from + 8 + index * 7, from + 20 + index * 7], [0, 1], clamp)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Meters — part-to-whole, one row per item                                    */
/* -------------------------------------------------------------------------- */

/**
 * Horizontal meters, because the labels are sentences.
 *
 * A column chart cannot carry "Headaches by mid-afternoon" under its bar at any
 * size a phone can read, so the categories go horizontal and the bars run left
 * to right beside them. Same rule as the dial for the track: a lighter step of
 * the fill's own hue, so an empty row still reads as the same measurement.
 */
export const Meters: React.FC<{ theme: Theme; spec: MetersExhibit; from: number }> = ({
  theme,
  spec,
  from,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rows = spec.rows.slice(0, 5);
  const whole = spec.of ?? Math.max(1, ...rows.map((row) => row.value));

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        // Distributed rather than centred: four rows centred in a tall panel
        // leave the top third bare, and a meter must not be stretched to fill
        // it — its bar height is a mark spec, not a layout value.
        justifyContent: "space-evenly",
        gap: 24,
      }}
    >
      {rows.map((row, index) => {
        const grow = arrival(theme, from + 6 + index * 9, frame, fps, 28);
        const shown = row.value * grow;

        return (
          <div key={`${row.label}-${index}`} style={{ opacity: grow }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 20,
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  fontFamily: theme.display,
                  fontWeight: theme.weightMid,
                  fontSize: 38,
                  letterSpacing: "-0.02em",
                  color: theme.paper,
                }}
              >
                {row.label}
              </span>
              <span
                style={{
                  fontFamily: theme.mono,
                  fontSize: 36,
                  color: theme.paperDim,
                  // A column of numbers that must line up vertically — the one
                  // place tabular figures are the right call.
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {compact(shown)}
                {spec.unit}
              </span>
            </div>
            <div
              style={{
                height: MARKS.barThickness * 0.62,
                borderRadius: MARKS.cap,
                background: theme.chart.track,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(1, row.value / whole) * grow * 100}%`,
                  height: "100%",
                  borderRadius: MARKS.cap,
                  background: theme.chart.primary,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Compare — before against after                                              */
/* -------------------------------------------------------------------------- */

/**
 * Two concentric arcs and the distance between them.
 *
 * Before-and-after is one measure at two times, not two series, so this uses
 * one hue in two steps rather than the categorical pair. That is not only house
 * style: two steps of one hue can never fail a colourblind separation check,
 * because lightness survives every form of colour vision loss. The outer arc is
 * the old value, the inner one the new, and the inner arc's being visibly
 * shorter is the claim the script is making.
 */
export const Compare: React.FC<{ theme: Theme; spec: CompareExhibit; from: number }> = ({
  theme,
  spec,
  from,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const worst = Math.max(spec.from.value, spec.to.value, 1);
  const outerCount = counted(spec.from.value, from + 6, frame, fps, 26);
  const innerCount = counted(spec.to.value, from + 18, frame, fps, 30);

  // Solved against the panel, like the nodegraph's orbit: the rings and the
  // readout column sit side by side, so size + gap + readout must clear the
  // panel's inner width of 928.
  const size = 600;
  const stroke = MARKS.barThickness * 0.86;
  // Two rings with a surface gap between them, never a stroke.
  const outerRadius = (size - stroke) / 2;
  const innerRadius = outerRadius - stroke - MARKS.gap * 2;

  const arc = (radius: number, value: number, colour: string) => {
    const circumference = 2 * Math.PI * radius;
    const ratio = Math.max(0, Math.min(1, value / worst));
    return (
      <>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={theme.chart.track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * ratio} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </>
    );
  };

  // The old value recedes to a lighter step; the new one takes the full hue.
  const wasColour = mix(theme.chart.primary, theme.ground, 0.55);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
      }}
    >
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ display: "block" }}>
          {arc(outerRadius, outerCount, wasColour)}
          {arc(innerRadius, innerCount, theme.chart.primary)}
        </svg>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 34 }}>
        {[
          { datum: spec.from, counted: outerCount, colour: wasColour },
          { datum: spec.to, counted: innerCount, colour: theme.chart.primary },
        ].map((row, index) => (
          <div key={`${row.datum.label}-${index}`}>
            <MarkLabel theme={theme} text={row.datum.label} swatch={row.colour} size={27} />
            <div
              style={{
                marginTop: 8,
                fontFamily: theme.display,
                fontWeight: theme.weightHeavy,
                fontSize: index === 1 ? 96 : 72,
                lineHeight: 1,
                letterSpacing: "-0.04em",
                color: index === 1 ? theme.paper : theme.paperDim,
              }}
            >
              {compact(row.counted)}
              <span style={{ fontSize: index === 1 ? 46 : 36, color: theme.paperDim }}>
                {spec.unit}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Board — four headline figures, one of them the story                        */
/* -------------------------------------------------------------------------- */

/**
 * A four-tile figure board.
 *
 * A handful of headline numbers is a KPI row, not a grouped bar chart — there
 * is no shared scale to compare them on, so drawing bars would invent a
 * relationship the numbers do not have. Exactly one tile is lit, because a
 * board where everything is emphasised is a board where nothing is.
 */
export const Board: React.FC<{ theme: Theme; spec: BoardExhibit; from: number }> = ({
  theme,
  spec,
  from,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tiles = spec.tiles.slice(0, 4);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "grid",
        // Four tiles read as a 2x2 block. Three in the same grid leaves a hole
        // where a fourth should be, which reads as a missing figure rather than
        // as a choice, so three stack instead.
        gridTemplateColumns: tiles.length === 3 ? "1fr" : "1fr 1fr",
        gridAutoRows: "1fr",
        gap: MARKS.gap * 5,
      }}
    >
      {tiles.map((tile, index) => {
        const enter = arrival(theme, from + 6 + index * 8, frame, fps, 24);
        const lit = index === spec.emphasis;
        const shown = counted(tile.value, from + 10 + index * 8, frame, fps, 28);

        return (
          <div
            key={`${tile.label}-${index}`}
            style={{
              boxSizing: "border-box",
              padding: "24px 26px",
              borderRadius: 18,
              background: lit ? `${theme.chart.primary}1F` : "rgba(0,0,0,0.28)",
              border: `${MARKS.hairline}px solid ${lit ? theme.chart.primary : theme.rule}`,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 12,
              opacity: enter,
              transform: `translateY(${(1 - enter) * 22}px)`,
            }}
          >
            <span
              style={{
                fontFamily: theme.mono,
                fontSize: 23,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: theme.paperDim,
              }}
            >
              {tile.label}
            </span>
            <span
              style={{
                fontFamily: theme.display,
                fontWeight: theme.weightHeavy,
                fontSize: lit ? 96 : 74,
                lineHeight: 0.92,
                letterSpacing: "-0.04em",
                color: theme.paper,
              }}
            >
              {compact(shown)}
              {tile.suffix ? (
                <span style={{ fontSize: lit ? 52 : 40, color: theme.paperDim }}>
                  {tile.suffix}
                </span>
              ) : null}
            </span>
            {tile.note ? (
              <span
                style={{
                  fontFamily: theme.mono,
                  fontSize: 22,
                  lineHeight: 1.32,
                  color: theme.paperDim,
                }}
              >
                {tile.note}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Cartogram — magnitude across regions                                        */
/* -------------------------------------------------------------------------- */

/**
 * A tile grid map: one equal cell per region, shaded on one hue.
 *
 * Deliberately a cartogram and not a projection. A real choropleth would need
 * boundary geometry this project has no business shipping, would give Russia
 * forty times the ink of Singapore for the same one data point, and would be
 * unreadable at the size a phone renders it. Equal tiles give every region the
 * same weight, stay legible, and — the honest part — never imply a geographic
 * precision the script does not have.
 *
 * One hue, light to dark, because the job is magnitude. A rainbow scale here
 * would make the reader learn a legend to answer "which is bigger".
 */
const WORLD_TILES: { code: string; column: number; row: number }[] = [
  { code: "CAN", column: 0, row: 0 },
  { code: "UK", column: 2, row: 0 },
  { code: "NEU", column: 3, row: 0 },
  { code: "RUS", column: 4, row: 0 },
  { code: "USA", column: 0, row: 1 },
  { code: "SEU", column: 2, row: 1 },
  { code: "MEA", column: 3, row: 1 },
  { code: "CHN", column: 4, row: 1 },
  { code: "JPN", column: 5, row: 1 },
  { code: "MEX", column: 0, row: 2 },
  { code: "BRA", column: 1, row: 2 },
  { code: "WAF", column: 2, row: 2 },
  { code: "EAF", column: 3, row: 2 },
  { code: "IND", column: 4, row: 2 },
  { code: "SEA", column: 5, row: 2 },
  { code: "ARG", column: 1, row: 3 },
  { code: "ZAF", column: 3, row: 3 },
  { code: "AUS", column: 5, row: 3 },
];

export const CARTOGRAM_CODES = WORLD_TILES.map((tile) => tile.code);

export const Cartogram: React.FC<{ theme: Theme; spec: CartogramExhibit; from: number }> = ({
  theme,
  spec,
  from,
}) => {
  const frame = useCurrentFrame();
  const byCode = new Map(spec.regions.map((region) => [region.label, region.value]));
  const peak = Math.max(1, ...spec.regions.map((region) => region.value));
  const columns = 6;
  const rows = 4;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 22 }}>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          gap: MARKS.gap * 3,
        }}
      >
        {Array.from({ length: columns * rows }, (_, cell) => {
          const column = cell % columns;
          const row = Math.floor(cell / columns);
          const tile = WORLD_TILES.find((t) => t.column === column && t.row === row);
          const value = tile ? byCode.get(tile.code) : undefined;

          // Cells arrive in reading order so the map fills rather than appears.
          const shown = interpolate(frame, [from + cell, from + cell + 10], [0, 1], clamp);

          // An unnamed cell is drawn as absent — a faint outline — never as
          // zero. Shading it as the lightest step would put a measurement on
          // the map that the script never made.
          if (!tile || value === undefined) {
            return (
              <div
                key={cell}
                style={{
                  borderRadius: 10,
                  border: `${MARKS.hairline}px solid ${theme.chart.grid}`,
                  opacity: shown * 0.5,
                }}
              />
            );
          }

          const intensity = value / peak;
          const fill = rampStep(theme.chart.primary, intensity * shown);
          return (
            <div
              key={cell}
              style={{
                borderRadius: 10,
                display: "grid",
                placeItems: "center",
                background: fill,
                fontFamily: theme.mono,
                fontSize: 21,
                letterSpacing: "0.06em",
                color: inkOn(fill, theme),
                opacity: shown,
              }}
            >
              {tile.code}
            </div>
          );
        })}
      </div>

      {/* The ramp legend. A sequential scale needs its ends named, because
          "darker is more" is a convention, not a fact the picture states. */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <MarkLabel theme={theme} text="0" size={24} />
        <div
          style={{
            flex: 1,
            height: 16,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${rampStep(theme.chart.primary, 0)}, ${theme.chart.primary})`,
          }}
        />
        <MarkLabel theme={theme} text={`${compact(peak)}${spec.unit}`} size={24} />
      </div>
    </div>
  );
};

/** Wraps a chart in the shared panel with the title it needs. */
export const ChartFigure: React.FC<{
  theme: Theme;
  label: string;
  note?: string;
  from: number;
  height?: number;
  children: React.ReactNode;
}> = ({ theme, label, note, from, height, children }) => (
  <Figure theme={theme} label={label} note={note} from={from} height={height}>
    {children}
  </Figure>
);
