import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Theme } from "../theme";
import { arrival, MARKS, MarkLabel } from "./Figure";
import type {
  ChecklistExhibit,
  CodeExhibit,
  NodeGraphExhibit,
  PipelineExhibit,
  RadarExhibit,
  TimelineExhibit,
  TraceExhibit,
} from "./types";

/**
 * The exhibits that depict a mechanism rather than plot a measurement.
 *
 * These take their labels from the script's own lines, which is what makes them
 * honest. A pipeline drawn from the three steps a TechTip already lists is not
 * inventing anything — it is the same three steps, arranged so the viewer can
 * see that they are a sequence and see where the sequence stalls. Nothing here
 * puts a number on screen that the script did not write.
 *
 * That distinction is why `family` exists in the registry. A chart's marks
 * assert a quantity and are held to it; a diagram's marks assert a shape, and
 * the shape is the one the words already describe.
 *
 * Performance follows the same rules the rest of this project pays for: no
 * full-frame blur, no filter re-evaluated per frame, glows are radial gradients,
 * motion is transform and opacity, and line work is SVG. The runner has two
 * cores and a software GL path.
 */

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Deterministic 0..1 from a string and an index. Never Math.random in a render. */
function noise(seed: string, index: number): number {
  let hash = 2166136261 ^ index;
  for (let i = 0; i < seed.length; i += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

/* -------------------------------------------------------------------------- */
/* Pipeline — stages, and where the work waits                                 */
/* -------------------------------------------------------------------------- */

/**
 * Stages in sequence with a packet travelling through them.
 *
 * The packet is the reason this is a video and not a slide. A row of labelled
 * boxes says "there are four stages"; a packet that crosses three of them
 * briskly and then sits in the fourth says which stage is the problem, without
 * a word of narration — which matters when the whole series is watched muted.
 *
 * `bottleneck` is where it sits. Left unset the packet crosses evenly, which is
 * the correct picture for a sequence that has no stall.
 */
export const Pipeline: React.FC<{ theme: Theme; spec: PipelineExhibit; from: number }> = ({
  theme,
  spec,
  from,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stages = spec.stages.slice(0, 5);
  const stall = spec.bottleneck ?? -1;

  // The packet's journey, as a set of keyframes. A stalled stage is given three
  // times the dwell of a clear one, so "slow" is legible as duration rather
  // than announced by a colour.
  const dwell = stages.map((_, index) => (index === stall ? 3 : 1));
  const total = dwell.reduce((a, b) => a + b, 0);
  const span = Math.max(30, 96);
  const stops: number[] = [];
  let elapsed = 0;
  for (const weight of dwell) {
    stops.push(from + 14 + (elapsed / total) * span);
    elapsed += weight;
  }
  stops.push(from + 14 + span);

  const position = interpolate(
    frame,
    stops,
    stages.map((_, index) => index).concat(stages.length - 1),
    clamp,
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 26 }}>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: MARKS.gap * 5 }}>
        {stages.map((stage, index) => {
          const enter = arrival(theme, from + index * 6, frame, fps, 22);
          // How much of the packet is inside this stage right now.
          const occupancy = Math.max(0, 1 - Math.abs(position - index));
          const stalled = index === stall && occupancy > 0.2;

          return (
            <div
              key={`${stage}-${index}`}
              style={{
                position: "relative",
                boxSizing: "border-box",
                padding: "22px 26px",
                borderRadius: 16,
                background: stalled ? `${theme.chart.primary}1A` : "rgba(0,0,0,0.28)",
                border: `${MARKS.hairline}px solid ${
                  occupancy > 0.2 ? theme.chart.primary : theme.rule
                }`,
                display: "flex",
                alignItems: "center",
                gap: 22,
                opacity: enter,
                transform: `translateX(${(1 - enter) * 26 * theme.motion.listFrom}px)`,
              }}
            >
              <span
                style={{
                  width: 46,
                  height: 46,
                  flexShrink: 0,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  background: occupancy > 0.2 ? theme.chart.primary : theme.chart.track,
                  color: occupancy > 0.2 ? theme.ground : theme.paperDim,
                  fontFamily: theme.mono,
                  fontSize: 24,
                }}
              >
                {index + 1}
              </span>
              <span
                style={{
                  flex: 1,
                  fontFamily: theme.display,
                  fontWeight: theme.weightMid,
                  fontSize: 40,
                  lineHeight: 1.12,
                  letterSpacing: "-0.02em",
                  color: theme.paper,
                }}
              >
                {stage}
              </span>
              {stalled ? (
                <MarkLabel theme={theme} text="waiting" size={24} swatch={theme.chart.primary} />
              ) : null}
            </div>
          );
        })}
      </div>

      {spec.note ? <MarkLabel theme={theme} text={spec.note} size={26} /> : null}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Trace — the cost of a repeated operation                                    */
/* -------------------------------------------------------------------------- */

/**
 * Rows filling in one at a time under a counter that climbs with them.
 *
 * The subject is repetition, and repetition is only legible if you watch it
 * repeat. A still frame of this figure would show a list; the video shows the
 * counter going up once per row, which is the entire argument.
 *
 * The counter is a count of the rows on screen. It is not a measurement of
 * anything outside the figure, which is why this is a diagram and not a chart —
 * nothing here claims a millisecond figure the script did not supply.
 */
export const Trace: React.FC<{ theme: Theme; spec: TraceExhibit; from: number }> = ({
  theme,
  spec,
  from,
}) => {
  const frame = useCurrentFrame();
  const rows = spec.rows.slice(0, 7);
  const every = 12;

  const landed = rows.filter((_, index) => frame >= from + 10 + index * every).length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 20,
        }}
      >
        <MarkLabel theme={theme} text={spec.counterLabel} size={27} />
        <span
          style={{
            fontFamily: theme.display,
            fontWeight: theme.weightHeavy,
            fontSize: 78,
            lineHeight: 1,
            letterSpacing: "-0.04em",
            color: theme.paper,
          }}
        >
          {landed}
          {spec.unit ? (
            <span style={{ fontSize: 40, color: theme.paperDim }}>{spec.unit}</span>
          ) : null}
        </span>
      </div>

      {/*
        A meter of how far through the repetition we are. Its length is
        landed/total — a real proportion of a real count, not a decoration
        keyed off the frame number.
      */}
      <div
        style={{
          height: MARKS.line * 2,
          borderRadius: 999,
          background: theme.chart.track,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${(landed / Math.max(1, rows.length)) * 100}%`,
            height: "100%",
            background: theme.chart.primary,
          }}
        />
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: MARKS.gap * 3 }}>
        {rows.map((row, index) => {
          const at = from + 10 + index * every;
          const shown = interpolate(frame, [at, at + 8], [0, 1], clamp);
          const newest = index === landed - 1;

          return (
            <div
              key={`${row}-${index}`}
              style={{
                flex: 1,
                boxSizing: "border-box",
                padding: "0 22px",
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 18,
                background: newest ? `${theme.chart.primary}1A` : "rgba(0,0,0,0.24)",
                border: `${MARKS.hairline}px solid ${newest ? theme.chart.primary : theme.rule}`,
                fontFamily: theme.mono,
                fontSize: 29,
                color: theme.paper,
                opacity: shown,
                transform: `translateX(${(1 - shown) * 18}px)`,
              }}
            >
              <span>{row}</span>
              <span style={{ color: theme.paperDim, fontVariantNumeric: "tabular-nums" }}>
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Checklist — steps that resolve                                              */
/* -------------------------------------------------------------------------- */

/**
 * Steps that run and settle into a verdict.
 *
 * A printed checklist is a caption. A checklist that runs — each row sitting in
 * a pending state for a beat and then resolving — is a demonstration, and the
 * beat of hesitation before each verdict is what makes the viewer wait for it.
 *
 * Verdicts carry an icon and a word as well as a colour. Status colour alone is
 * the classic accessibility failure, and this is a medium with no tooltip to
 * fall back on.
 */
export const Checklist: React.FC<{ theme: Theme; spec: ChecklistExhibit; from: number }> = ({
  theme,
  spec,
  from,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const steps = spec.steps.slice(0, 5);
  const every = 20;

  const mark = {
    pass: { glyph: "✓", word: "pass", tone: theme.chart.secondary },
    warn: { glyph: "!", word: "check", tone: theme.chart.primary },
    fail: { glyph: "✕", word: "fail", tone: theme.chart.primary },
  } as const;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: MARKS.gap * 5,
      }}
    >
      {steps.map((step, index) => {
        const at = from + 8 + index * every;
        const enter = arrival(theme, at, frame, fps, 20);
        // The verdict lands a beat after the row does. That gap is the whole
        // device: it is the pause in which the viewer forms an expectation.
        const resolved = interpolate(frame, [at + 12, at + 20], [0, 1], clamp);
        const verdict = mark[step.verdict];

        return (
          <div
            key={`${step.label}-${index}`}
            style={{
              // Rows share the panel's height rather than stacking at their own
              // and leaving the rest as slack. A panel with a third of its area
              // empty reads as a layout that ran out of content.
              flex: 1,
              boxSizing: "border-box",
              padding: "0 24px",
              borderRadius: 16,
              background: "rgba(0,0,0,0.26)",
              border: `${MARKS.hairline}px solid ${
                resolved > 0.5 ? `${verdict.tone}80` : theme.rule
              }`,
              display: "flex",
              alignItems: "center",
              gap: 20,
              opacity: enter,
              transform: `translateY(${(1 - enter) * 18}px)`,
            }}
          >
            <span
              style={{
                width: 52,
                height: 52,
                flexShrink: 0,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                background: resolved > 0.5 ? verdict.tone : theme.chart.track,
                color: resolved > 0.5 ? theme.ground : theme.paperDim,
                fontFamily: theme.mono,
                fontSize: 30,
                // A single soft ring pulsing out as the verdict lands.
                boxShadow: `0 0 0 ${(1 - resolved) * 16}px ${verdict.tone}1F`,
              }}
            >
              {resolved > 0.5 ? verdict.glyph : "…"}
            </span>
            <span
              style={{
                flex: 1,
                fontFamily: theme.display,
                fontWeight: theme.weightMid,
                fontSize: 38,
                lineHeight: 1.12,
                letterSpacing: "-0.02em",
                color: theme.paper,
              }}
            >
              {step.label}
            </span>
            <span
              style={{
                fontFamily: theme.mono,
                fontSize: 25,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: theme.paperDim,
                opacity: resolved,
              }}
            >
              {verdict.word}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* NodeGraph — one thing feeding many                                          */
/* -------------------------------------------------------------------------- */

/**
 * A lit core with labelled satellites arriving onto an orbit.
 *
 * For a subject whose shape is one thing feeding several — a stack, a service
 * and its clients, an idea and its consequences. The satellites arrive in the
 * script's own order, and their edges draw themselves in as they land, so the
 * viewer sees the structure assemble rather than being shown a finished map.
 *
 * The glow is a radial gradient, never a blur filter. A full-frame blur was
 * measured at roughly three times the cost of every other layer combined on the
 * runner this renders on.
 */
export const NodeGraph: React.FC<{ theme: Theme; spec: NodeGraphExhibit; from: number }> = ({
  theme,
  spec,
  from,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nodes = spec.nodes.slice(0, 6);

  /**
   * Sized to the panel's inner width, not to a guess.
   *
   * The first version used a 560px circle with a 37% orbit, and the satellites
   * landed on top of the core: a label reading "What is already written" is
   * ~320px of type, so at a 207px orbit radius its inner edge was 160px *past*
   * the centre. Radial layouts fail this way whenever the label is longer than
   * the radius, and the fix is both halves of that — a wider orbit, and labels
   * anchored so they grow outward from the ring instead of across it.
   */
  const size = 860;
  const centre = size / 2;
  /**
   * The orbit is solved, not chosen.
   *
   * A satellite's label starts at its node and grows outward, so the figure
   * fits only while `centre + orbit + LABEL_WIDTH <= size`. At a 34% orbit the
   * right-hand labels ran 150px past the panel and were clipped by its own
   * rounded corner. 232 is the largest radius that clears both constraints at
   * once: the core's half-width on the inside, the label's width on the
   * outside. Anything wider has to come out of the label, and a satellite whose
   * text is cut mid-word is worse than a smaller ring.
   */
  const LABEL_WIDTH = 190;
  const orbit = 232;
  const coreEnter = arrival(theme, from, frame, fps, 24);
  // A slow rotation of the whole orbit, so the figure is never quite still.
  const spin = interpolate(frame, [from, from + 300], [0, 14], clamp);

  const placed = nodes.map((label, index) => {
    const angle = ((index / nodes.length) * 360 + spin - 90) * (Math.PI / 180);
    const cos = Math.cos(angle);
    return {
      label,
      x: centre + cos * orbit,
      y: centre + Math.sin(angle) * orbit,
      /**
       * Which way the label grows from its own node.
       *
       * A label centred on its node extends equally both ways, and on the left
       * and right of the ring that means straight through the middle of the
       * figure. Anchoring by the sign of cos pushes each one outward: the
       * right-hand nodes grow rightward, the left-hand ones leftward, and only
       * the top and bottom — where there is nothing to collide with — stay
       * centred.
       */
      anchor: cos > 0.35 ? "start" : cos < -0.35 ? "end" : "centre",
      enter: arrival(theme, from + 14 + index * 9, frame, fps, 22),
    };
  });

  const shift = (anchor: string) =>
    anchor === "start" ? "0%" : anchor === "end" ? "-100%" : "-50%";

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "relative", width: size, height: size }}>
        {/* Edges first, so the nodes sit on top of their own connections. */}
        <svg width={size} height={size} style={{ position: "absolute", inset: 0 }}>
          <circle
            cx={centre}
            cy={centre}
            r={orbit}
            fill="none"
            stroke={theme.chart.grid}
            strokeWidth={MARKS.hairline}
          />
          {placed.map((node) => (
            <line
              key={`edge-${node.label}`}
              x1={centre}
              y1={centre}
              x2={centre + (node.x - centre) * node.enter}
              y2={centre + (node.y - centre) * node.enter}
              stroke={theme.chart.primary}
              strokeWidth={MARKS.line}
              strokeLinecap="round"
              opacity={0.5 * node.enter}
            />
          ))}
        </svg>

        {/* The core's glow: a static radial gradient, scaled, never blurred. */}
        <div
          style={{
            position: "absolute",
            left: centre - 190,
            top: centre - 190,
            width: 380,
            height: 380,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${theme.chart.primary}3D 0%, transparent 66%)`,
            transform: `scale(${0.7 + coreEnter * 0.3})`,
          }}
        />

        <div
          style={{
            position: "absolute",
            left: centre,
            top: centre,
            transform: `translate(-50%, -50%) scale(${0.86 + coreEnter * 0.14})`,
            padding: "22px 30px",
            borderRadius: 18,
            background: theme.chart.primary,
            color: theme.ground,
            fontFamily: theme.display,
            fontWeight: theme.weightHeavy,
            fontSize: 38,
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            textAlign: "center",
            maxWidth: 300,
            opacity: coreEnter,
          }}
        >
          {spec.core}
        </div>

        {placed.map((node) => (
          <div
            key={`node-${node.label}`}
            style={{
              position: "absolute",
              left: node.x,
              top: node.y,
              transform: `translate(${shift(node.anchor)}, -50%) scale(${0.88 + node.enter * 0.12})`,
              padding: "14px 20px",
              borderRadius: 12,
              background: "rgba(0,0,0,0.72)",
              border: `${MARKS.hairline}px solid ${theme.chart.secondary}80`,
              fontFamily: theme.mono,
              fontSize: 24,
              lineHeight: 1.2,
              color: theme.paper,
              maxWidth: LABEL_WIDTH,
              opacity: node.enter,
            }}
          >
            {node.label}
          </div>
        ))}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Timeline — sequence and duration                                            */
/* -------------------------------------------------------------------------- */

/**
 * Editor tracks with clips, and a playhead crossing them.
 *
 * For anything whose subject is sequence or elapsed time. The playhead is a
 * clock the viewer reads without a number on screen, and clips lighting as it
 * passes is what turns a static track layout into a thing being played.
 */
export const Timeline: React.FC<{ theme: Theme; spec: TimelineExhibit; from: number }> = ({
  theme,
  spec,
  from,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tracks = spec.tracks.slice(0, 4);
  const rest = spec.restAt ?? 0.82;

  const head = interpolate(frame, [from + 16, from + 130], [0, rest], clamp);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Ruler. Ticks are a repeating gradient rather than forty elements. */}
      <div
        style={{
          height: 34,
          borderRadius: 8,
          backgroundImage: `repeating-linear-gradient(90deg, ${theme.chart.grid} 0 ${MARKS.hairline}px, transparent ${MARKS.hairline}px 56px)`,
          borderBottom: `${MARKS.hairline}px solid ${theme.chart.grid}`,
        }}
      />

      <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", gap: MARKS.gap * 4 }}>
        {tracks.map((track, trackIndex) => {
          const enter = arrival(theme, from + trackIndex * 7, frame, fps, 20);
          const clips = Math.max(1, Math.min(6, track.clips));

          return (
            <div
              key={`${track.label}-${trackIndex}`}
              style={{ flex: 1, display: "flex", alignItems: "center", gap: 18, opacity: enter }}
            >
              {/* A wider gutter than looks necessary, because the alternative
                  is a track name cut to "WHO SIGNS OFF…". A timeline whose rows
                  cannot be named is a picture of some rectangles. */}
              <span
                style={{
                  width: 230,
                  flexShrink: 0,
                  fontFamily: theme.mono,
                  fontSize: 22,
                  lineHeight: 1.24,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: theme.paperDim,
                }}
              >
                {track.label}
              </span>
              <div style={{ flex: 1, height: "100%", display: "flex", gap: MARKS.gap * 3 }}>
                {Array.from({ length: clips }, (_, clipIndex) => {
                  // Clip widths vary deterministically off the track name, so
                  // two timelines in one campaign do not draw the same bricks.
                  const weight = 0.7 + noise(track.label, clipIndex) * 0.6;
                  // Lit once the playhead has reached this clip's share.
                  const reached = head > (clipIndex + 0.5) / clips;
                  return (
                    <div
                      key={clipIndex}
                      style={{
                        flex: weight,
                        borderRadius: 10,
                        background: reached
                          ? `${theme.chart.primary}59`
                          : "rgba(0,0,0,0.3)",
                        border: `${MARKS.hairline}px solid ${
                          reached ? theme.chart.primary : theme.rule
                        }`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* The playhead, over every track. */}
        <div
          style={{
            position: "absolute",
            top: -14,
            bottom: -6,
            // Offset by the label gutter so the head tracks the clips, not the row.
            left: 248,
            right: 0,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${head * 100}%`,
              width: MARKS.line,
              background: theme.paper,
              opacity: interpolate(frame, [from + 12, from + 20], [0, 0.9], clamp),
            }}
          />
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Radar — coverage, and what the sweep finds                                  */
/* -------------------------------------------------------------------------- */

/**
 * A polar lattice with a sweeping arm and a readout beside it.
 *
 * For coverage and blind spots. Targets appear as the arm passes over them
 * rather than all at once, which is what a scan is — and it gives a slow
 * template something happening on every frame without the frame changing shape.
 */
export const Radar: React.FC<{ theme: Theme; spec: RadarExhibit; from: number }> = ({
  theme,
  spec,
  from,
}) => {
  const frame = useCurrentFrame();
  const targets = spec.targets.slice(0, 4);

  const size = 470;
  const centre = size / 2;
  const radius = size * 0.44;
  // Just over one full turn across the body, so every target is found once.
  const sweep = interpolate(frame, [from + 10, from + 170], [0, 400], clamp);

  const placed = targets.map((label, index) => {
    const angle = 40 + index * (300 / Math.max(1, targets.length));
    const distance = 0.42 + noise(label, index) * 0.5;
    const radians = (angle - 90) * (Math.PI / 180);
    return {
      label,
      angle,
      x: centre + Math.cos(radians) * radius * distance,
      y: centre + Math.sin(radians) * radius * distance,
      found: sweep > angle,
    };
  });

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 26 }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ display: "block" }}>
          {[0.34, 0.67, 1].map((ring) => (
            <circle
              key={ring}
              cx={centre}
              cy={centre}
              r={radius * ring}
              fill="none"
              stroke={theme.chart.grid}
              strokeWidth={MARKS.hairline}
            />
          ))}
          {[0, 45, 90, 135].map((angle) => {
            const radians = (angle * Math.PI) / 180;
            return (
              <line
                key={angle}
                x1={centre - Math.cos(radians) * radius}
                y1={centre - Math.sin(radians) * radius}
                x2={centre + Math.cos(radians) * radius}
                y2={centre + Math.sin(radians) * radius}
                stroke={theme.chart.grid}
                strokeWidth={MARKS.hairline}
              />
            );
          })}

          {placed.map((target) => (
            <circle
              key={`blip-${target.label}`}
              cx={target.x}
              cy={target.y}
              r={MARKS.marker / 2}
              fill={theme.chart.primary}
              // The surface ring, so a blip crossing a lattice line stays legible.
              stroke={theme.chart.surface}
              strokeWidth={MARKS.gap}
              opacity={target.found ? 1 : 0}
            />
          ))}
        </svg>

        {/* The arm. A rotated wedge — one composited layer, no repaint. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            overflow: "hidden",
            transform: `rotate(${sweep}deg)`,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              width: "50%",
              height: "50%",
              transformOrigin: "0% 100%",
              background: `conic-gradient(from 0deg, ${theme.chart.primary}00, ${theme.chart.primary}4D)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "8%",
              width: MARKS.hairline * 2,
              height: "42%",
              background: theme.chart.primary,
            }}
          />
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
        {placed.map((target) => (
          <div
            key={`row-${target.label}`}
            style={{
              padding: "14px 18px",
              borderRadius: 12,
              background: "rgba(0,0,0,0.28)",
              border: `${MARKS.hairline}px solid ${
                target.found ? `${theme.chart.primary}80` : theme.rule
              }`,
              fontFamily: theme.mono,
              fontSize: 25,
              color: target.found ? theme.paper : theme.paperDim,
              opacity: target.found ? 1 : 0.45,
            }}
          >
            {target.label}
          </div>
        ))}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Code — when the subject is literally code                                   */
/* -------------------------------------------------------------------------- */

/**
 * An editor panel typing a snippet, with one line marked.
 *
 * The reveal is per-line rather than per-character except on the marked line,
 * which types. That mismatch is deliberate and it is the same trick the
 * terminal stage uses: a block that appears whole reads as a screenshot, and a
 * block that types every character makes the viewer wait through the boring
 * parts. Typing only the line that carries the argument puts the pace exactly
 * where the attention should be.
 *
 * There is no syntax highlighter here on purpose. Tokenising arbitrary snippets
 * would mean shipping a parser and guessing the language; instead the marked
 * line takes the signal colour and everything else is ink, which is the only
 * distinction a viewer makes at this size anyway.
 */
export const CodePanel: React.FC<{ theme: Theme; spec: CodeExhibit; from: number }> = ({
  theme,
  spec,
  from,
}) => {
  const frame = useCurrentFrame();
  const lines = spec.lines.slice(0, 8);
  const highlight = Math.max(0, Math.min(lines.length - 1, spec.highlight));
  const every = 9;

  const markedAt = from + 12 + highlight * every;
  const typed = Math.round(
    interpolate(frame, [markedAt, markedAt + 22], [0, lines[highlight]?.length ?? 0], clamp),
  );
  const caretOn = Math.floor(frame / 8) % 2 === 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
      <MarkLabel theme={theme} text={spec.filename} size={25} />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 4,
          fontFamily: theme.mono,
          fontSize: 30,
          lineHeight: 1.5,
        }}
      >
        {lines.map((line, index) => {
          const at = from + 12 + index * every;
          const shown = interpolate(frame, [at, at + 7], [0, 1], clamp);
          const marked = index === highlight;
          const text = marked ? line.slice(0, typed) : line;

          return (
            <div
              key={`${line}-${index}`}
              style={{
                display: "flex",
                gap: 22,
                padding: "5px 16px",
                borderRadius: 8,
                background: marked ? `${theme.chart.primary}1F` : "transparent",
                // A left rule marks the line rather than a full border, which
                // would box the argument in and add ink that says nothing.
                boxShadow: marked ? `inset ${MARKS.line}px 0 0 ${theme.chart.primary}` : undefined,
                opacity: shown,
                transform: `translateX(${(1 - shown) * 12}px)`,
              }}
            >
              <span style={{ color: theme.paperDim, fontVariantNumeric: "tabular-nums" }}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span style={{ color: marked ? theme.paper : theme.paperDim, whiteSpace: "pre" }}>
                {text}
                {marked && typed < line.length ? (
                  <span style={{ opacity: caretOn ? 1 : 0 }}>▌</span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
