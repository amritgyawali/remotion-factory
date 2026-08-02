import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { Frame } from "../components/Frame";
import { BLEED_MARGIN, Eyebrow, KineticHeadline, PayoffBlock } from "../components/Kinetic";
import { ChatStage, TerminalStage } from "../components/Stage";
import { Exhibit, drawsOwnStage, resolveExhibit } from "../exhibits";
import { themeFor } from "../theme";
import type { DevJokeProps } from "../types";

const variantLabel: Record<DevJokeProps["variant"], string> = {
  terminal: "WORKS ON MINE",
  qa: "QA",
  timer: "STANDUP",
  scope: "JUST ONE THING",
  deploy: "FRIDAY DEPLOY",
  comments: "FEEDBACK",
  cache: "CACHE",
};

/**
 * Where each joke is set.
 *
 * Half these variants are about a machine and half are about a person, and one
 * stage cannot serve both: "make the logo bigger, again" in a terminal is a
 * frame arguing with its own script. The dev variants get a shell and a command
 * that would plausibly produce the beats; the client variants get a message
 * thread, because that is literally where the joke happens.
 */
const SHELL: Partial<Record<DevJokeProps["variant"], string>> = {
  terminal: "npm test && npm run deploy",
  deploy: "git push origin main --force",
  cache: "rm -rf .next && npm run build",
  qa: "npm run test:e2e -- --grep 'order'",
  timer: "standup --duration 15m",
};

/**
 * Setup, beats, punchline.
 *
 * The PDF's note for this template is that the bed "stops dead before the
 * punchline card" — the joke needs the silence. The layout matches it: the
 * beats stack, then the punchline arrives as a full-bleed block, wiping up
 * into the frame rather than fading politely.
 */
export const DevJoke: React.FC<DevJokeProps> = ({
  hook,
  beats,
  punchline,
  variant,
  exhibit,
  score,
  videoId,
  theme: overrides,
}) => {
  const theme = themeFor(videoId, overrides);
  const { durationInFrames } = useVideoConfig();
  /**
   * The shell and the thread are this template's native stages and stay the
   * default. A script may still name a different figure — a trace of the same
   * beats, an editor panel, a timeline — and when it does, that is what draws.
   * The band is filled either way, which is the only invariant that matters.
   */
  const spec = resolveExhibit("DevJoke", { hook, beats, punchline, variant, exhibit }, videoId);
  const nativeStage = drawsOwnStage(spec);

  const punchAt = Math.max(54, Math.floor(durationInFrames * 0.62));
  const beatsFrom = 34;
  // Capped for the same reason as SiteRoast's faults: spreading the beats over
  // the whole setup left seconds of a motionless stage between them, and a joke
  // that pauses that long between beats is not landing.
  const beatEvery = Math.min(
    40,
    Math.max(13, Math.floor((punchAt - beatsFrom - 18) / Math.max(1, beats.length))),
  );
  const command = SHELL[variant];

  return (
    <Frame theme={theme} template="DevJoke" score={score} videoId={videoId}>
      <AbsoluteFill
        style={{
          boxSizing: "border-box",
          padding: `78px ${BLEED_MARGIN}px 0`,
          display: "flex",
          flexDirection: "column",
          gap: 30,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Eyebrow text={variantLabel[variant]} theme={theme} color={theme.amber} />
          <KineticHeadline text={hook} theme={theme} from={4} maxLines={2} max={132} />
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {!nativeStage ? (
            <Exhibit theme={theme} spec={spec} from={beatsFrom} />
          ) : command ? (
            <TerminalStage
              theme={theme}
              command={command}
              lines={beats}
              from={beatsFrom}
              every={beatEvery}
            />
          ) : (
            <ChatStage theme={theme} messages={beats} from={beatsFrom} every={beatEvery} />
          )}
        </div>

        <PayoffBlock
          text={punchline}
          theme={theme}
          from={punchAt}
          background={theme.amber}
          color={theme.ground}
        />
      </AbsoluteFill>
    </Frame>
  );
};
