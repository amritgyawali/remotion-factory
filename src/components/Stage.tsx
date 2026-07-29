import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Theme } from "../theme";

/**
 * Scenery: the thing a video is *about*, drawn rather than described.
 *
 * Every template was words on a colour field. A SiteRoast said "slow first
 * view" in large type; it never showed a page. A DevJoke said "local tests glow
 * green"; it never showed a terminal. That reads as a caption card, and a
 * caption card is what a viewer scrolls past — the frame carries no evidence
 * that anything is happening, so there is nothing to stop on.
 *
 * These components draw the subject procedurally: a browser window, a terminal,
 * a chart, a code block. Nothing here loads an asset. Everything is derived
 * from the theme, so a stage inherits the video's palette and typeface for free
 * and eight palettes produce eight genuinely different-looking stages.
 *
 * Performance is a real constraint, not a footnote. These render on a two-core
 * runner through a software GL path, where a full-frame `filter: blur()` costs
 * more than every other layer combined — the same lesson the grain tile in
 * Frame.tsx already paid for. So: glows are radial gradients, not blurs; motion
 * is transform and opacity; line work is SVG, which the rasteriser is good at.
 */

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Deterministic 0..1 from a string and an index — no Math.random in a render. */
function noise(seed: string, index: number): number {
  let hash = 2166136261 ^ index;
  for (let i = 0; i < seed.length; i += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

/**
 * Depth behind everything.
 *
 * A flat field plus a slow radial drift was doing all the work of "not frozen",
 * and it was not enough: the eye reads an unmoving background as a still image
 * with text animating on top. Three cheap layers give the frame somewhere to
 * be — a receding grid that implies a floor, two counter-drifting colour glows
 * that keep the field alive, and a vignette that pushes the corners down so
 * full-bleed type has something to sit against.
 */
export const Backdrop: React.FC<{ theme: Theme; seed?: string }> = ({ theme, seed = "x" }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = frame / Math.max(1, durationInFrames);

  /**
   * Every moving layer here is a *static* paint moved by `transform`, and that
   * distinction is the whole performance budget of this component.
   *
   * The first version animated the gradients in place — the position inside
   * `radial-gradient(... at X% Y% ...)` and `backgroundPosition` on the grid.
   * Both make the layer's own pixels change, so Chrome repaints 1080x1920 of
   * gradient twice per frame. Measured on a 60-frame render: 0.43s/frame before
   * this component existed, 1.21s/frame with it — near enough three times the
   * cost, which on a two-core runner is the difference between a render that
   * finishes inside its timeout and one that does not.
   *
   * Rasterise once, translate thereafter: the gradients never change, so they
   * are painted a single time and each frame only composites. Same picture,
   * back to roughly the original cost.
   */
  const glowA = {
    x: Math.sin(t * Math.PI * 1.1 + noise(seed, 1) * 6) * 170,
    y: Math.cos(t * Math.PI * 0.8 + noise(seed, 2) * 6) * 230,
  };
  const glowB = {
    x: Math.cos(t * Math.PI * 0.9 + noise(seed, 3) * 6) * 150,
    y: Math.sin(t * Math.PI * 1.3 + noise(seed, 4) * 6) * 270,
  };

  // The grid scrolls one cell over the clip. Tying it to duration rather than a
  // fixed rate means a 15s and a 30s video read at the same tempo.
  const gridShift = interpolate(frame, [0, durationInFrames], [0, 90]);

  const glow = (colour: string, size: number): React.CSSProperties => ({
    position: "absolute",
    width: size,
    height: size,
    borderRadius: "50%",
    background: `radial-gradient(circle, ${colour} 0%, transparent 62%)`,
  });

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div
        style={{
          ...glow(theme.groundLift, 1500),
          left: -280,
          top: -300,
          transform: `translate(${glowA.x}px, ${glowA.y}px)`,
        }}
      />
      <div
        style={{
          ...glow(`${theme.amber}24`, 1250),
          left: 380,
          top: 1050,
          transform: `translate(${glowB.x}px, ${glowB.y}px)`,
        }}
      />

      {/*
        A grid, drawn as two repeating gradients rather than hundreds of SVG
        lines: one paint op instead of one per line. Oversized and translated so
        the scroll is a composite, not a repaint, and the fade is a static
        overlay below rather than a mask — masking a full-frame layer is the
        other thing that would put the per-frame cost straight back.
      */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: -120,
          width: 1080,
          height: 1920 + 240,
          opacity: 0.22,
          backgroundImage:
            `repeating-linear-gradient(0deg, ${theme.rule} 0 1px, transparent 1px 90px),` +
            `repeating-linear-gradient(90deg, ${theme.rule} 0 1px, transparent 1px 90px)`,
          transform: `translateY(${gridShift}px)`,
        }}
      />

      <AbsoluteFill
        style={{
          background:
            `radial-gradient(120% 62% at 50% 80%, transparent 0%, ${theme.ground} 74%),` +
            "radial-gradient(120% 78% at 50% 42%, transparent 38%, rgba(0,0,0,0.46) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------------------- */
/* Window chrome — shared by the browser and terminal stages                   */
/* -------------------------------------------------------------------------- */

/**
 * The panel both window stages sit in.
 *
 * Rises and settles on a spring rather than fading: a fade reads as a slide
 * transition, while a physical arrival reads as an object entering the frame,
 * which is the difference between a deck and a video.
 */
const Panel: React.FC<{
  theme: Theme;
  from: number;
  title: React.ReactNode;
  accent: string;
  children: React.ReactNode;
}> = ({ theme, from, title, accent, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({
    frame: Math.max(0, frame - from),
    fps,
    config: { damping: 26, mass: 0.9, stiffness: 120 },
    durationInFrames: 26,
  });

  // A degree and a half of tilt, easing out as it lands. Enough to read as
  // dimensional; more than about two and the type inside starts to look wrong.
  const tilt = (1 - enter) * 1.6;

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 22,
        overflow: "hidden",
        background: "rgba(0,0,0,0.34)",
        border: `1px solid ${theme.rule}`,
        // Two shadows: a tight one for the edge, a wide soft one for lift.
        boxShadow: `0 2px 0 ${theme.paper}14, 0 34px 70px rgba(0,0,0,0.5)`,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 54}px) scale(${0.96 + enter * 0.04}) rotate(${tilt}deg)`,
        transformOrigin: "50% 100%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "18px 22px",
          borderBottom: `1px solid ${theme.rule}`,
          background: "rgba(255,255,255,0.04)",
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 15,
              height: 15,
              borderRadius: 999,
              background: i === 0 ? accent : `${theme.paper}2E`,
            }}
          />
        ))}
        <div style={{ flex: 1 }}>{title}</div>
      </div>
      {children}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* BrowserStage — SiteRoast                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The page under review, with each fault pinned to the part of it that is at
 * fault.
 *
 * The skeleton is deliberately generic — a hero, some copy, a call to action —
 * because the roast is about structure, not about one client's site. Faults
 * arrive on the same frames the spoken list does, so the marker and the words
 * land together and the viewer never has to work out which is which.
 */
export const BrowserStage: React.FC<{
  theme: Theme;
  /** One marker per fault, in order. Only the first three are pinned. */
  faults: string[];
  from: number;
  every: number;
  /** Frame the page "fixes itself" — skeleton straightens, markers clear. */
  fixAt?: number;
  /** Height of the page area. The panel is sized by its content, not the frame. */
  height?: number;
}> = ({ theme, faults, from, every, fixAt, height = 700 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fixed = fixAt
    ? spring({
        frame: Math.max(0, frame - fixAt),
        fps,
        config: { damping: 30, mass: 0.8 },
        durationInFrames: 20,
      })
    : 0;

  /**
   * Pinned in pixels to the rows below, not in percentages of the panel.
   *
   * Percentages tracked the panel, and the panel is taller than its content, so
   * the third marker floated in empty space while the second landed on top of
   * the call to action and buried the words underneath it. These are the y
   * centres of the hero, the copy block and the button; the third sits to the
   * right of the button rather than over it, because that is the one row whose
   * own text has to stay readable.
   */
  const pins = [
    { top: 128, left: "6%" },
    { top: 372, left: "6%" },
    { top: 588, left: "40%" },
  ];

  const scroll = interpolate(frame, [from, from + every * 3], [0, -46], clamp);

  return (
    <Panel
      theme={theme}
      from={from - 10}
      accent={interpolateHex(theme.amber, theme.seaglass, fixed)}
      title={
        <div
          style={{
            height: 30,
            borderRadius: 999,
            background: "rgba(0,0,0,0.4)",
            border: `1px solid ${theme.rule}`,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            fontFamily: theme.mono,
            fontSize: 17,
            letterSpacing: "0.06em",
            color: theme.paperDim,
          }}
        >
          {fixed > 0.5 ? "yoursite.com — fixed" : "yoursite.com"}
        </div>
      }
    >
      <div style={{ position: "relative", height, overflow: "hidden" }}>
        <div style={{ transform: `translateY(${scroll}px)`, padding: 38 }}>
          {/* Hero block. Washes out while broken, resolves as it is fixed. */}
          <div
            style={{
              height: 210,
              borderRadius: 16,
              // Broken: a muddy wash of paper at 7%. Fixed: the signal colour
              // comes up under it, so the hero reads as having found a subject.
              background: `linear-gradient(100deg, ${theme.paper}12, ${theme.paper}08),` +
                `linear-gradient(120deg, ${theme.seaglass}${Math.round(fixed * 44)
                  .toString(16)
                  .padStart(2, "0")}, transparent 70%)`,
              marginBottom: 34,
            }}
          />
          {[0.92, 0.78, 0.84, 0.52].map((w, i) => (
            <div
              key={i}
              style={{
                height: 24,
                width: `${w * 100 * (0.82 + fixed * 0.18)}%`,
                borderRadius: 999,
                background: `${theme.paper}${i === 3 ? "1A" : "22"}`,
                marginBottom: 21,
              }}
            />
          ))}
          {/* The call to action: buried and grey, then lit once fixed. */}
          <div
            style={{
              marginTop: 40,
              width: 310,
              height: 78,
              borderRadius: 14,
              background: fixed > 0.4 ? theme.seaglass : `${theme.paper}16`,
              display: "grid",
              placeItems: "center",
              fontFamily: theme.display,
              fontWeight: theme.weightMid,
              fontSize: 30,
              color: fixed > 0.4 ? "#12100E" : theme.paperDim,
              transform: `scale(${1 + fixed * 0.06})`,
            }}
          >
            Get started
          </div>

          {/*
            A second row below the fold. Without it the panel was visibly taller
            than the page inside it, which is the one thing a browser mock must
            never look like — the empty band under the button read as a bug
            rather than as a page continuing.
          */}
          <div style={{ display: "flex", gap: 22, marginTop: 40 }}>
            {[0, 1].map((i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 148,
                  borderRadius: 14,
                  background: `${theme.paper}0E`,
                  border: `1px solid ${theme.rule}`,
                }}
              />
            ))}
          </div>
        </div>

        {faults.slice(0, 3).map((fault, i) => {
          const at = from + i * every;
          const pop = spring({
            frame: Math.max(0, frame - at),
            fps,
            config: { damping: 18, mass: 0.6, stiffness: 160 },
            durationInFrames: 16,
          });
          // Markers clear as the page is fixed — the payoff of the whole clip.
          const alive = pop * (1 - fixed);

          return (
            <div
              key={fault}
              style={{
                position: "absolute",
                ...pins[i],
                display: "flex",
                alignItems: "center",
                gap: 12,
                opacity: alive,
                transform: `translateX(${(1 - pop) * -22}px) scale(${0.9 + pop * 0.1})`,
              }}
            >
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 999,
                  background: theme.amber,
                  color: "#12100E",
                  display: "grid",
                  placeItems: "center",
                  fontFamily: theme.mono,
                  fontWeight: theme.weightBody,
                  fontSize: 26,
                  // A soft ring that pulses once on arrival.
                  boxShadow: `0 0 0 ${(1 - pop) * 20}px ${theme.amber}22`,
                }}
              >
                !
              </div>
              <div
                style={{
                  padding: "12px 20px",
                  borderRadius: 11,
                  background: "rgba(0,0,0,0.72)",
                  border: `1px solid ${theme.amber}59`,
                  fontFamily: theme.mono,
                  fontSize: 27,
                  color: theme.paper,
                  whiteSpace: "nowrap",
                }}
              >
                {fault}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

/* -------------------------------------------------------------------------- */
/* TerminalStage — DevJoke, TechTip                                            */
/* -------------------------------------------------------------------------- */

/**
 * A terminal that actually types.
 *
 * The reveal is per-character on the command line and per-line for output,
 * because that is how a terminal behaves and the mismatch is what sells it —
 * a command that fades in whole reads as a screenshot of a terminal.
 */
export const TerminalStage: React.FC<{
  theme: Theme;
  command: string;
  lines: string[];
  from: number;
  every: number;
  /** Renders the last line in the signal colour, for a punchline or an error. */
  emphasiseLast?: boolean;
}> = ({ theme, command, lines, from, every, emphasiseLast = true }) => {
  const frame = useCurrentFrame();

  const typeFor = 18;
  const typed = Math.round(
    interpolate(frame, [from, from + typeFor], [0, command.length], clamp),
  );
  const caretOn = Math.floor(frame / 8) % 2 === 0;
  const outputFrom = from + typeFor + 6;

  return (
    <Panel
      theme={theme}
      from={from - 10}
      accent={theme.seaglass}
      title={
        <span
          style={{
            fontFamily: theme.mono,
            fontSize: 17,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: theme.paperDim,
          }}
        >
          zsh — 80×24
        </span>
      }
    >
      <div
        style={{
          padding: "32px 34px 40px",
          fontFamily: theme.mono,
          fontSize: 31,
          lineHeight: 1.66,
          minHeight: 560,
        }}
      >
        <div style={{ color: theme.paper }}>
          <span style={{ color: theme.seaglass }}>$ </span>
          {command.slice(0, typed)}
          <span style={{ opacity: caretOn && typed < command.length ? 1 : 0 }}>▌</span>
        </div>

        {lines.map((line, i) => {
          const at = outputFrom + i * every;
          const shown = interpolate(frame, [at, at + 7], [0, 1], clamp);
          const last = emphasiseLast && i === lines.length - 1;
          return (
            <div
              key={line}
              style={{
                marginTop: 12,
                opacity: shown,
                transform: `translateX(${(1 - shown) * 14}px)`,
                color: last ? theme.amber : theme.paperDim,
              }}
            >
              {last ? "→ " : "  "}
              {line}
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

/* -------------------------------------------------------------------------- */
/* ChatStage — DevJoke's client-feedback variants                              */
/* -------------------------------------------------------------------------- */

/**
 * A message thread, for the jokes whose setting is a client, not a machine.
 *
 * "Make the logo bigger. Again." is not a terminal joke — putting it in one
 * would be a stage that fights its own script. These beats are messages, so
 * they arrive as messages: from the left, one at a time, with the punchline
 * landing as the reply.
 */
export const ChatStage: React.FC<{
  theme: Theme;
  messages: string[];
  from: number;
  every: number;
  /** Rendered as the outgoing reply, right-aligned in the signal colour. */
  reply?: string;
  replyAt?: number;
}> = ({ theme, messages, from, every, reply, replyAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Panel
      theme={theme}
      from={from - 12}
      accent={theme.amber}
      title={
        <span
          style={{
            fontFamily: theme.mono,
            fontSize: 18,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: theme.paperDim,
          }}
        >
          client — today
        </span>
      }
    >
      <div
        style={{
          padding: "30px 28px 34px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          minHeight: 560,
        }}
      >
        {messages.map((message, i) => {
          const at = from + i * every;
          const pop = spring({
            frame: Math.max(0, frame - at),
            fps,
            config: { damping: 22, mass: 0.7, stiffness: 140 },
            durationInFrames: 18,
          });
          return (
            <div
              key={message}
              style={{
                alignSelf: "flex-start",
                maxWidth: "84%",
                padding: "20px 26px",
                borderRadius: "22px 22px 22px 6px",
                background: `${theme.paper}14`,
                border: `1px solid ${theme.rule}`,
                fontFamily: theme.display,
                fontWeight: theme.weightBody,
                fontSize: 40,
                lineHeight: 1.28,
                color: theme.paper,
                opacity: pop,
                transform: `translateY(${(1 - pop) * 24}px) scale(${0.94 + pop * 0.06})`,
                transformOrigin: "0% 100%",
              }}
            >
              {message}
            </div>
          );
        })}

        {reply ? (
          <div
            style={{
              alignSelf: "flex-end",
              maxWidth: "84%",
              marginTop: 6,
              padding: "20px 26px",
              borderRadius: "22px 22px 6px 22px",
              background: theme.seaglass,
              fontFamily: theme.display,
              fontWeight: theme.weightMid,
              fontSize: 40,
              lineHeight: 1.28,
              color: "#12100E",
              opacity: spring({
                frame: Math.max(0, frame - (replyAt ?? from + messages.length * every)),
                fps,
                config: { damping: 20, mass: 0.7 },
                durationInFrames: 16,
              }),
            }}
          >
            {reply}
          </div>
        ) : null}
      </div>
    </Panel>
  );
};

/* -------------------------------------------------------------------------- */
/* MetricStage — CaseStudy, StatCard                                           */
/* -------------------------------------------------------------------------- */

/**
 * Two bars and the distance between them.
 *
 * A case study's whole claim is "this moved". Printing a before string and an
 * after string states the claim; drawing the bars is the claim. The after bar
 * grows on a spring so the eye tracks the change rather than being shown a
 * finished result.
 */
export const MetricStage: React.FC<{
  theme: Theme;
  before: string;
  after: string;
  from: number;
  /** 0..1 — how much of the bar the "before" state fills. */
  beforeRatio?: number;
}> = ({ theme, before, after, from, beforeRatio = 0.34 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const grow = spring({
    frame: Math.max(0, frame - from - 14),
    fps,
    config: { damping: 24, mass: 1.1, stiffness: 90 },
    durationInFrames: 34,
  });

  const rows: { label: string; text: string; ratio: number; colour: string }[] = [
    { label: "BEFORE", text: before, ratio: beforeRatio, colour: `${theme.paper}2E` },
    { label: "AFTER", text: after, ratio: beforeRatio + (1 - beforeRatio) * grow, colour: theme.seaglass },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 46 }}>
      {rows.map((row, i) => {
        const appear = interpolate(frame, [from + i * 8, from + i * 8 + 10], [0, 1], clamp);
        return (
          <div key={row.label} style={{ opacity: appear }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 18,
              }}
            >
              <span
                style={{
                  fontFamily: theme.mono,
                  fontSize: 26,
                  letterSpacing: "0.2em",
                  color: i === 1 ? theme.seaglass : theme.paperDim,
                }}
              >
                {row.label}
              </span>
              <span
                style={{
                  fontFamily: theme.display,
                  fontWeight: theme.weightMid,
                  fontSize: 38,
                  color: theme.paper,
                  textAlign: "right",
                  maxWidth: 620,
                }}
              >
                {row.text}
              </span>
            </div>
            <div
              style={{
                height: 58,
                borderRadius: 999,
                background: "rgba(0,0,0,0.34)",
                border: `1px solid ${theme.rule}`,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(1, row.ratio) * 100}%`,
                  borderRadius: 999,
                  background:
                    i === 1
                      ? `linear-gradient(90deg, ${theme.seaglass}, ${theme.amber})`
                      : row.colour,
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

/** Blend two #rrggbb colours. Used to shift chrome from fault to fixed. */
function interpolateHex(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${mix(ar, br)}, ${mix(ag, bg)}, ${mix(ab, bb)})`;
}
