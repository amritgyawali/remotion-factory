import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Soundtrack } from "../audio/Score";
import { resolveScore } from "../audio/defaultScore";
import { CLIENT_BRAND, SiteMock } from "../components/SiteMock";
import { themeFor } from "../theme";
import type { LogoLadderProps } from "../types";
import { getState, ladderScore, type LadderState } from "./logoLadder.timeline";

/**
 * An escalation joke, told by breaking a real page.
 *
 * Every component in this file is a pure draw call: it receives the state for
 * this frame and renders it. There is not one `spring()` or `interpolate()`
 * below — all of it lives in logoLadder.timeline.ts, which is the whole point.
 * Scattering timing across components is how the older templates ended up with
 * markers landing on top of the copy they were annotating, with no single place
 * that knew what the frame was meant to look like.
 *
 * This template does not use Frame.tsx. The kinetic-type system there assumes a
 * dark full-bleed field and owns the whole canvas; this needs a light page on a
 * dark stage with its own grid. It keeps the two things Frame guarantees — the
 * soundtrack, so no video can ship silent, and the two-second brand close.
 */

const CANVAS = "#0F1012";
const INK = "#191919";
const AMBER = "#FFB020";
const GREEN = "#22C55E";
const ACCENT = "#3B6DF6";

/* -------------------------------------------------------------------------- */

const Lockup: React.FC<{ theme: ReturnType<typeof themeFor> }> = ({ theme }) => (
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
);

/**
 * The payoff tick, drawn rather than faded in.
 *
 * `stroke-dashoffset` on a path whose dasharray equals its own length makes the
 * ring and the check appear to be drawn by a hand — without a hand, which is
 * the constraint the whole series runs under. The check starts at 35% so the
 * ring draws first and the tick lands on top of a finished circle.
 */
const Tick: React.FC<{ progress: number }> = ({ progress }) => {
  const R = 42;
  const ring = 2 * Math.PI * R;
  const check = 96;
  const checkProgress = Math.max(0, (progress - 0.35) / 0.65);

  return (
    <svg width={220} height={220} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={R} fill="rgba(34,197,94,0.16)" />
      <circle
        cx="50"
        cy="50"
        r={R}
        fill="none"
        stroke={GREEN}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={ring}
        strokeDashoffset={ring * (1 - progress)}
        transform="rotate(-90 50 50)"
      />
      <path
        d="M30 51 L44 65 L71 36"
        fill="none"
        stroke={GREEN}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={check}
        strokeDashoffset={check * (1 - checkProgress)}
      />
    </svg>
  );
};

/**
 * The chat panel. `VC` in a rounded square is how you show that a person said
 * something without a person — never an avatar, never a photo, never an
 * illustrated character. Reuse it anywhere a human would normally appear.
 */
const ChatPanel: React.FC<{
  chat: NonNullable<LadderState["chat"]>;
  theme: ReturnType<typeof themeFor>;
}> = ({ chat, theme }) => (
  <AbsoluteFill style={{ paddingTop: 700, paddingLeft: 60, paddingRight: 60 }}>
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 14,
        paddingBottom: 18,
        borderBottom: "1px solid rgba(255,255,255,0.14)",
      }}
    >
      <span style={{ fontFamily: theme.mono, fontSize: 30, color: "rgba(255,255,255,0.45)" }}>#</span>
      <span
        style={{
          fontFamily: theme.display,
          fontWeight: theme.weightHeavy,
          fontSize: 34,
          color: "#FFFFFF",
        }}
      >
        vertex-website
      </span>
      <span style={{ fontFamily: theme.display, fontSize: 24, color: "rgba(255,255,255,0.4)" }}>
        redesign · feedback
      </span>
    </div>

    <div style={{ display: "flex", gap: 20, marginTop: 34 }}>
      <div
        style={{
          width: 62,
          height: 62,
          borderRadius: 14,
          background: CLIENT_BRAND,
          display: "grid",
          placeItems: "center",
          fontFamily: theme.display,
          fontWeight: theme.weightHeavy,
          fontSize: 26,
          color: "#FFFFFF",
          flexShrink: 0,
        }}
      >
        VC
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span
            style={{
              fontFamily: theme.display,
              fontWeight: theme.weightHeavy,
              fontSize: 28,
              color: "#FFFFFF",
            }}
          >
            Vertex Co.
          </span>
          <span style={{ fontFamily: theme.mono, fontSize: 20, color: "rgba(255,255,255,0.4)" }}>
            16:41
          </span>
        </div>

        {chat.typing ? (
          <div style={{ display: "flex", gap: 10, marginTop: 22, alignItems: "center", height: 44 }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  background: "#FFFFFF",
                  opacity: chat.dotPhase === i ? 0.95 : 0.3,
                }}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              marginTop: 16,
              padding: "26px 30px",
              borderRadius: "6px 22px 22px 22px",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              fontFamily: theme.display,
              fontWeight: theme.weightBody,
              fontSize: 40,
              lineHeight: 1.3,
              color: "#FFFFFF",
              transform: `scale(${chat.bubbleScale})`,
              transformOrigin: "0% 0%",
            }}
          >
            {chat.text}
            {!chat.landed ? <span style={{ opacity: 0.7 }}>▌</span> : null}
          </div>
        )}
      </div>
    </div>
  </AbsoluteFill>
);

const EndCard: React.FC<{
  endcard: NonNullable<LadderState["endcard"]>;
  theme: ReturnType<typeof themeFor>;
}> = ({ endcard, theme }) => (
  <AbsoluteFill
    style={{ background: INK, alignItems: "center", justifyContent: "center", zIndex: 30 }}
  >
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

/* -------------------------------------------------------------------------- */

export const LogoLadder: React.FC<LogoLadderProps> = ({
  hook,
  promise,
  message,
  payoff,
  score,
  videoId,
  theme: overrides,
}) => {
  const theme = themeFor(videoId, overrides);
  const frame = useCurrentFrame();
  const s = getState(frame, { hook, promise, message, payoff });

  return (
    <AbsoluteFill style={{ background: CANVAS }}>
      {/*
        The generated ladder score is the default, not the fallback. A day whose
        cues have been transcribed by hand still wins, but the escalation, the
        strip at the freeze and the dead stop at 11-12s are structural to this
        template and must not depend on someone remembering to write them out.
      */}
      <Soundtrack score={resolveScore(score ?? ladderScore(), "DevJoke", 17 * 30, 30)} />

      {s.scene === "endcard" && s.endcard ? (
        <EndCard endcard={s.endcard} theme={theme} />
      ) : (
        <>
          {/*
            Hook band, stage, aside band: three fixed zones. Fixed matters —
            a zone that resizes between beats makes the eye re-hunt for the
            text, which is fatal on a fifteen-second video.
          */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 430,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              opacity: s.hookOpacity,
            }}
          >
            <div
              style={{
                fontFamily: theme.display,
                fontWeight: theme.weightHeavy,
                fontSize: 96,
                lineHeight: 1.02,
                letterSpacing: "-0.03em",
                color: "#FFFFFF",
                textAlign: "center",
              }}
            >
              {hook}
            </div>
            <div
              style={{
                marginTop: 20,
                fontFamily: theme.display,
                fontWeight: theme.weightMid,
                fontSize: 40,
                color: AMBER,
              }}
            >
              {promise}
            </div>
          </div>

          {s.scene === "chat" && s.chat ? (
            <ChatPanel chat={s.chat} theme={theme} />
          ) : (
            <div
              style={{
                position: "absolute",
                top: 430,
                left: 40,
                width: 1000,
                height: 1230,
              }}
            >
              <SiteMock state={s.site} theme={theme} />
            </div>
          )}

          {s.chip ? (
            <div
              style={{
                position: "absolute",
                right: 60,
                top: 296,
                padding: "12px 22px",
                borderRadius: 999,
                background: AMBER,
                color: INK,
                fontFamily: theme.display,
                fontWeight: theme.weightHeavy,
                fontSize: 46,
                letterSpacing: "0.02em",
                opacity: s.chip.opacity,
                transform: `scale(${s.chip.scale})`,
              }}
            >
              {s.chip.label}
            </div>
          ) : null}

          {s.aside ? (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 1698,
                textAlign: "center",
                fontFamily: theme.display,
                fontWeight: theme.weightHeavy,
                fontSize: 62,
                color: "#FFFFFF",
                opacity: s.aside.opacity,
                transform: `translateY(${s.aside.y}px)`,
              }}
            >
              {s.aside.text}
            </div>
          ) : null}

          {s.payoff ? (
            <AbsoluteFill
              style={{
                alignItems: "center",
                justifyContent: "center",
                opacity: s.payoff.opacity,
              }}
            >
              {/*
                A scrim, because white payoff type over a white page is
                unreadable and a text-shadow alone does not save it. The whole
                page dims and the tick is the only lit thing left — which is
                also why green appears exactly once in the video: it means
                something when it finally arrives.
              */}
              <AbsoluteFill
                style={{
                  background:
                    "radial-gradient(52% 30% at 50% 48%, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.74) 60%)",
                }}
              />
              <div style={{ transform: `scale(${s.payoff.scale})` }}>
                <Tick progress={s.payoff.tick} />
              </div>
              <div
                style={{
                  position: "absolute",
                  bottom: 300,
                  fontFamily: theme.display,
                  fontWeight: theme.weightHeavy,
                  fontSize: 84,
                  letterSpacing: "-0.02em",
                  color: "#FFFFFF",
                  textShadow: "0 6px 40px rgba(0,0,0,0.8)",
                }}
              >
                {s.payoff.text}
              </div>
            </AbsoluteFill>
          ) : null}

          {s.lockup ? <Lockup theme={theme} /> : null}
        </>
      )}
    </AbsoluteFill>
  );
};
