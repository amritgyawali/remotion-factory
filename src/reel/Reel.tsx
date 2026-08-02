import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { type ReelTheme, themeForReel } from "./theme";
import { SAFE } from "./brief";
import { resolveMechanism, type MechanismProps } from "./mechanisms";
import { TitleCard } from "./TitleCard";

/**
 * The props a reel render takes. These are exactly the fields the workflow
 * reads out of the brief JSON and hands to the composition — so the brief and
 * the component can never disagree about what a video is.
 *
 * `brief` may be present (the brief JSON wrapped) or the fields may sit at the
 * top level. Both work; the composition is tolerant on purpose because the
 * workflow already has the brief as a flat JSON object and wrapping it just to
 * satisfy a nesting convention is how a null `brief` slips through unchecked.
 */
export type ReelProps = {
  id: string;
  visualSystem?: string;
  title?: string;
  beats: { copy: string; highlight?: string }[];
  mechanism: string;
  /** Optional: a pre-resolved theme override, e.g. from a visual system. */
  theme?: ReelTheme;
  /** Convenience wrapper — either this or the flat fields above. */
  brief?: {
    id: string;
    visualSystem?: string;
    title?: string;
    beats: { copy: string; highlight?: string }[];
    mechanism: string;
  };
};

/**
 * The Reel is the composition that renders a single 30-second video.
 *
 * It owns the complete frame lifecycle and the five-beat structure: five
 * timed scenes matching the retention arc. Each scene has a backdrop layer (the
 * reel's own palette ground, drifting), a mechanism layer that literally enacts
 * the argument, and a copy layer. The title card occupies frames 0-30, then
 * plays unchanged.
 *
 * This is deliberately *not* a template. Templates take props and render their
 * own content; Reel takes a full brief and assembles the pieces the brief
 * specifies. A Reel with a different brief is a different video in every
 * measurable way.
 */
export const Reel: React.FC<ReelProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const brief = props.brief ?? props;
  const theme = props.theme ?? themeForReel(brief.id, brief.visualSystem);

  const Mechanism = resolveMechanism(brief.mechanism as any);

  // Five timed scenes at 0-180, 180-360, 360-540, 540-720, 720-900.
  // Each is a beat of the retention arc.
  const BEAT_FRAMES = [180, 180, 180, 180, 180];
  const BEAT_STARTS = [0, 180, 360, 540, 720];

  const currentBeat = Math.min(4, Math.floor(frame / 180));

  // Backdrop drift — a slow radial glow that moves across the full clip.
  const driftX = interpolate(frame, [0, durationInFrames], [-200, 200], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const driftY = interpolate(frame, [0, durationInFrames], [-100, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Beat entrance — copy fades in at the start of each beat, holds, fades out.
  const beatIn = frame - BEAT_STARTS[currentBeat];
  const beatDuration = BEAT_FRAMES[currentBeat];
  const copyOpacity = interpolate(
    beatIn,
    [0, 8, beatDuration - 12, beatDuration],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // End card — last 2 seconds (60 frames), matching the old Frame pattern.
  const endCardOpacity = interpolate(
    frame,
    [durationInFrames - fps * 2, durationInFrames - fps * 2 + 12],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const beat = brief.beats[currentBeat];
  const mechanismProps: MechanismProps = {
    frame,
    fps,
    beatIndex: currentBeat,
    theme,
    demonstration: beat?.copy ?? "",
    copy: beat?.copy ?? "",
  };

  return (
    <AbsoluteFill style={{ backgroundColor: theme.ground }}>
      {/* --- Backdrop layer --- */}
      <AbsoluteFill>
        <div
          style={{
            position: "absolute",
            top: "30%",
            left: "20%",
            width: 500,
            height: 500,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${theme.groundLift} 0%, transparent 70%)`,
            transform: `translate(${driftX}px, ${driftY}px)`,
            opacity: 0.55,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "55%",
            right: "10%",
            width: 340,
            height: 340,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${theme.amber}22 0%, transparent 70%)`,
            transform: `translate(${-driftX * 0.6}px, ${-driftY * 0.8}px)`,
            opacity: 0.4,
          }}
        />
      </AbsoluteFill>

      {/* --- Mechanism layer --- */}
      <AbsoluteFill
        style={{
          top: SAFE.top,
          bottom: SAFE.bottom,
          left: SAFE.left,
          right: SAFE.right,
          clipPath: `inset(${SAFE.top}px ${SAFE.right}px ${SAFE.bottom}px ${SAFE.left}px)`,
        }}
      >
        <Mechanism {...mechanismProps} />
      </AbsoluteFill>

      {/* --- Copy layer --- */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: `0 ${SAFE.left}px ${SAFE.bottom}px`,
          opacity: copyOpacity,
          zIndex: 5,
        }}
      >
        {beat?.copy.split("\n").map((line, index) => (
          <div
            key={index}
            style={{
              fontFamily: theme.display,
              fontWeight: theme.weightHeavy,
              fontSize: 72,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: beat.highlight && line.includes(beat.highlight)
                ? theme.amber
                : theme.paper,
              textShadow: `0 2px 24px ${theme.ground}`,
            }}
          >
            {line}
          </div>
        ))}
      </AbsoluteFill>

      {/* --- Title card (frames 0-30 only) --- */}
      <TitleCard title={brief.title ?? brief.id} theme={theme} />

      {/* --- End card (last 2s) --- */}
      <AbsoluteFill
        style={{
          zIndex: 20,
          backgroundColor: theme.ground,
          alignItems: "center",
          justifyContent: "center",
          opacity: endCardOpacity,
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
            color: theme.ground,
            fontFamily: theme.display,
            fontWeight: theme.weightHeavy,
            fontSize: 62,
            letterSpacing: "-0.08em",
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
            color: `${theme.paper}8C`,
          }}
        >
          Technologies
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
