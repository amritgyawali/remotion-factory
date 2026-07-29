import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Soundtrack } from "../audio/Score";
import { resolveScore } from "../audio/defaultScore";
import { themeFor } from "../theme";
import type { WorksOnMyMachineProps } from "../types";
import {
  ALERTS,
  FAILING,
  getState,
  machineScore,
  PASSING,
  type MachineState,
} from "./machine.timeline";

/**
 * Day 5 — "It Works On My Machine".
 *
 * A split composition: the same commit, green on the left and on fire on the
 * right. Everything below is a pure draw call — the state for this frame
 * arrives as numbers and this file renders them. No spring(), no interpolate().
 *
 * The split is the whole argument of the joke, so it is structural rather than
 * decorative: two panes of identical width, identical type, identical row
 * height, differing only in colour and content. Any asymmetry in the layout
 * would read as one side mattering more than the other, which is exactly the
 * assumption the punchline demolishes.
 */

const CANVAS = "#0F1012";
const INK = "#191919";
const GREEN = "#22C55E";
const RED = "#FF4D4D";
const AMBER = "#FFB020";
const ACCENT = "#3B6DF6";

/**
 * The stage fills the frame between the hook band and the lockup. Sized once
 * here because both panes and the diff overlay are positioned from it — the
 * split has to stay symmetrical, and two panes with independently tuned
 * heights is how that quietly stops being true.
 */
const PANE_TOP = 380;
const PANE_H = 1240;

const Pane: React.FC<{
  theme: ReturnType<typeof themeFor>;
  title: string;
  accent: string;
  side: "left" | "right";
  children: React.ReactNode;
}> = ({ theme, title, accent, side, children }) => (
  <div
    style={{
      position: "absolute",
      top: PANE_TOP,
      [side]: 36,
      width: 494,
      height: PANE_H,
      borderRadius: 20,
      overflow: "hidden",
      background: "rgba(0,0,0,0.5)",
      border: `1px solid ${accent}44`,
      boxShadow: `0 24px 60px rgba(0,0,0,0.5)`,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "16px 18px",
        borderBottom: `1px solid ${accent}33`,
        background: `${accent}14`,
      }}
    >
      <div style={{ width: 12, height: 12, borderRadius: 999, background: accent }} />
      <span
        style={{
          fontFamily: theme.mono,
          fontSize: 21,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: accent,
        }}
      >
        {title}
      </span>
    </div>
    <div style={{ position: "relative", height: PANE_H - 54, overflow: "hidden" }}>{children}</div>
  </div>
);

const Line: React.FC<{ theme: ReturnType<typeof themeFor>; colour: string; text: string }> = ({
  theme,
  colour,
  text,
}) => (
  <div
    style={{
      fontFamily: theme.mono,
      fontSize: 21,
      lineHeight: 1.62,
      color: colour,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    }}
  >
    {text}
  </div>
);

/** The error-rate graph: a path that goes vertical, drawn not faded. */
const ErrorGraph: React.FC<{ rate: number }> = ({ rate }) => {
  const H = 150;
  const W = 440;
  // Flat, then a near-vertical climb. Derived from the rate, not from time, so
  // retiming the beat retimes the curve.
  const kneeX = W * 0.55;
  const topY = H - H * rate;
  const d = `M0 ${H - H * 0.04} L${kneeX} ${H - H * 0.09} Q${kneeX + 40} ${topY + 30} ${W} ${topY}`;

  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <path d={`${d} L${W} ${H} L0 ${H} Z`} fill={`${RED}22`} />
      <path d={d} fill="none" stroke={RED} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
};

const EndCard: React.FC<{
  endcard: NonNullable<MachineState["endcard"]>;
  theme: ReturnType<typeof themeFor>;
}> = ({ endcard, theme }) => (
  <AbsoluteFill style={{ background: INK, alignItems: "center", justifyContent: "center" }}>
    <div
      style={{
        width: 150,
        height: 150,
        borderRadius: 34,
        background: ACCENT,
        display: "grid",
        placeItems: "center",
        opacity: endcard.markOpacity,
        transform: `scale(${endcard.markScale})`,
      }}
    >
      <svg width="86" height="86" viewBox="0 0 100 100">
        <path
          d="M24 72 V32 L50 60 L76 32 V72"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
    <div
      style={{
        marginTop: 46,
        fontFamily: theme.display,
        fontWeight: theme.weightHeavy,
        fontSize: 74,
        letterSpacing: "-0.03em",
        color: "#FFFFFF",
        opacity: endcard.textOpacity,
      }}
    >
      MeritByte
    </div>
    <div
      style={{
        marginTop: 14,
        fontFamily: theme.mono,
        fontSize: 26,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.55)",
        opacity: endcard.textOpacity,
      }}
    >
      Technologies
    </div>
  </AbsoluteFill>
);

export const WorksOnMyMachine: React.FC<WorksOnMyMachineProps> = ({
  hook,
  score,
  videoId,
  theme: overrides,
}) => {
  const theme = themeFor(videoId, overrides);
  const s = getState(useCurrentFrame());

  if (s.scene === "endcard" && s.endcard) {
    return (
      <AbsoluteFill style={{ background: CANVAS }}>
        <Soundtrack score={resolveScore(score ?? machineScore(), "DevJoke", 15 * 30, 30)} videoId={videoId} />
        <EndCard endcard={s.endcard} theme={theme} />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ background: CANVAS }}>
      <Soundtrack score={resolveScore(score ?? machineScore(), "DevJoke", 15 * 30, 30)} videoId={videoId} />

      {/* Hook band. On screen from frame 1, never animates in. */}
      <div
        style={{
          position: "absolute",
          top: 96,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: s.hookOpacity,
          fontFamily: theme.display,
          fontWeight: theme.weightHeavy,
          fontSize: 92,
          lineHeight: 1.04,
          letterSpacing: "-0.03em",
          color: "#FFFFFF",
        }}
      >
        {hook}
      </div>

      {/* The beat caption, in the same band, so the eye never re-hunts. */}
      {s.caption ? (
        <div
          style={{
            position: "absolute",
            top: 150,
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: theme.mono,
            fontSize: 52,
            letterSpacing: "0.02em",
            color: s.caption.includes("failing") || s.caption.includes("alerts")
              ? RED
              : s.caption === "error rate"
                ? AMBER
                : GREEN,
          }}
        >
          {s.caption}
        </div>
      ) : null}

      <Pane theme={theme} title="local" accent={GREEN} side="left">
        <div style={{ padding: "20px 18px" }}>
          {PASSING.slice(0, s.passing).map((line) => (
            <Line key={line} theme={theme} colour={GREEN} text={line} />
          ))}
          <div
            style={{
              marginTop: 18,
              fontFamily: theme.mono,
              fontSize: 23,
              color: GREEN,
              opacity: s.passing >= PASSING.length ? 1 : 0.5,
            }}
          >
            ✓ 47 passing
          </div>
          <div style={{ marginTop: 10, fontFamily: theme.mono, fontSize: 21, color: GREEN }}>
            ${" "}
            <span style={{ opacity: s.caret ? 1 : 0 }}>▌</span>
          </div>
        </div>
      </Pane>

      <Pane theme={theme} title="production" accent={RED} side="right">
        <div style={{ padding: "20px 18px", transform: `translateY(${-s.traceScroll}px)` }}>
          {FAILING.slice(0, s.failing).map((line) => (
            <Line
              key={line}
              theme={theme}
              colour={line.startsWith("  ") ? "rgba(255,77,77,0.6)" : RED}
              text={line}
            />
          ))}
        </div>

        {/* 3-4s: six alert cards pile up. */}
        <div style={{ position: "absolute", left: 16, right: 16, bottom: 190 }}>
          {ALERTS.slice(0, s.alerts).map((alert, i) => (
            <div
              key={alert}
              style={{
                marginTop: 8,
                padding: "12px 14px",
                borderRadius: 10,
                background: "rgba(255,77,77,0.16)",
                border: `1px solid ${RED}55`,
                fontFamily: theme.mono,
                fontSize: 19,
                color: "#FFFFFF",
                opacity: s.alertPop[i],
                transform: `translateY(${(1 - s.alertPop[i]) * 20}px)`,
              }}
            >
              {alert}
            </div>
          ))}
        </div>

        {/* 5-6s: the error rate goes vertical. */}
        <div style={{ position: "absolute", left: 16, right: 16, bottom: 20 }}>
          <ErrorGraph rate={s.errorRate} />
        </div>
      </Pane>

      {/*
        7-8s: the diff wipes in over both panes. It is the answer to the whole
        argument — one line of config that only exists on one machine — so it
        covers the split rather than sitting beside it.
      */}
      {s.diffWipe > 0 ? (
        <div
          style={{
            position: "absolute",
            top: PANE_TOP + 430,
            left: 36,
            width: 1008,
            borderRadius: 18,
            overflow: "hidden",
            background: "#12141A",
            border: "1px solid rgba(255,255,255,0.16)",
            boxShadow: "0 30px 70px rgba(0,0,0,0.7)",
            clipPath: `inset(0 ${(1 - s.diffWipe) * 100}% 0 0)`,
          }}
        >
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid rgba(255,255,255,0.12)",
              fontFamily: theme.mono,
              fontSize: 20,
              color: "rgba(255,255,255,0.5)",
            }}
          >
            git diff — config
          </div>
          <div style={{ padding: "18px 20px", fontFamily: theme.mono, fontSize: 26, lineHeight: 1.7 }}>
            <div style={{ color: "rgba(255,255,255,0.42)" }}> .gitignore</div>
            <div style={{ color: "rgba(255,255,255,0.42)" }}> package.json</div>
            <div
              style={{
                margin: "6px -20px",
                padding: "8px 20px",
                background: `rgba(255,176,32,${0.2 * s.diffHighlight})`,
                borderLeft: `4px solid ${AMBER}`,
                color: AMBER,
                opacity: 0.45 + 0.55 * s.diffHighlight,
              }}
            >
              − .env.local
            </div>
            <div style={{ color: "rgba(255,255,255,0.42)" }}> README.md</div>
          </div>
        </div>
      ) : null}

      {/* 9-11s: the punchline stamps down over the diff. */}
      {s.punchline ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <AbsoluteFill style={{ background: "rgba(0,0,0,0.62)" }} />
          <div
            style={{
              fontFamily: theme.display,
              fontWeight: theme.weightHeavy,
              fontSize: 96,
              lineHeight: 1.04,
              letterSpacing: "-0.03em",
              color: "#FFFFFF",
              textAlign: "center",
              padding: "0 60px",
              opacity: s.punchline.opacity,
              transform: `scale(${s.punchline.scale})`,
            }}
          >
            It works on{" "}
            <span style={{ color: AMBER, textDecoration: "underline", textUnderlineOffset: 14 }}>
              MY
            </span>{" "}
            machine.
          </div>
        </AbsoluteFill>
      ) : null}

      {/* 11-12s: the shipping label slides in. */}
      {s.ship ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 300,
            display: "flex",
            justifyContent: "center",
            opacity: s.ship.opacity,
            transform: `translateX(${s.ship.x}px)`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
              padding: "26px 40px",
              borderRadius: 16,
              background: "#F3F5F8",
              border: "3px dashed #9AA3B2",
              boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
            }}
          >
            {/* A crate, drawn: no icon library anywhere in this project. */}
            <svg width="72" height="72" viewBox="0 0 100 100">
              <rect x="12" y="26" width="76" height="58" rx="8" fill="#2C6EF2" />
              <rect x="12" y="26" width="76" height="16" rx="6" fill="#1E4FB8" />
              <rect x="42" y="42" width="16" height="42" fill="#FFFFFF" opacity="0.85" />
            </svg>
            <div>
              <div
                style={{
                  fontFamily: theme.display,
                  fontWeight: theme.weightHeavy,
                  fontSize: 44,
                  color: "#0D1116",
                  letterSpacing: "-0.02em",
                }}
              >
                {s.ship.text}
              </div>
              <div style={{ fontFamily: theme.mono, fontSize: 28, color: "#5A6472", marginTop: 6 }}>
                {s.ship.sub}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {s.lockup ? (
        <div
          style={{
            position: "absolute",
            left: 48,
            bottom: 44,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ width: 24, height: 24, borderRadius: 7, background: ACCENT }} />
          <span
            style={{
              fontFamily: theme.display,
              fontWeight: theme.weightMid,
              fontSize: 30,
              color: "rgba(255,255,255,0.62)",
            }}
          >
            MeritByte.com
          </span>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
