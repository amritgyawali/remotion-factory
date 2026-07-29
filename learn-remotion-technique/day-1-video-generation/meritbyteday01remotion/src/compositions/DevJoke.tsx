import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { getState, ROWS, END_CARD, DURATION } from '../lib/timeline.js';
import { CSS } from '../brand/styles.js';
import { BrowserFrame } from '../components/SiteMock.js';
import { ChatPanel } from '../components/ChatPanel.js';
import { CounterChip, HookCard, TextCard, BrandLockup, PayoffTick } from '../components/Overlays.js';
import { EndCard } from '../components/EndCard.js';

export interface DevJokeProps {
  /** Pre-mixed voiceless track: bed + every SFX cue, already ducked and mastered. */
  audioSrc: string;
}

/**
 * DAY 1 — Make The Logo Bigger.
 *
 * Every row of the script is a Sequence. Every animated value is a pure function
 * of the frame, resolved in src/lib/timeline.js, which is also what the preview
 * renderer reads — so the studio, the CLI render and the preview all agree.
 *
 * Rule check for this composition:
 *   no humans     — the only "person" in the video is a two-letter initials chip
 *   no voice      — audioSrc is synthesised; there is no vocal content in it
 *   sound only    — the on-screen text is the narrator
 *   Remotion only — nothing here is footage, a screenshot or a screen recording
 */
export const DevJoke: React.FC<DevJokeProps> = ({ audioSrc }) => {
  const frame = useCurrentFrame();
  const s = getState(frame);

  return (
    <AbsoluteFill>
      <style>{CSS}</style>
      <Audio src={staticFile(audioSrc)} />

      <AbsoluteFill className="mb-stage">
        {/* ---- rows 1-15: the 15s body ---- */}
        {frame < END_CARD && (
          <>
            {s.scene === 'chat' ? <ChatPanel state={s} /> : <BrowserFrame state={s} />}

            {/* one Sequence per script row that puts text on screen */}
            {ROWS.filter((r) => r.text && r.from < END_CARD).map((r) => (
              <Sequence key={r.from} from={r.from} durationInFrames={r.to - r.from} layout="none">
                <RowOverlay rowStart={r.from} />
              </Sequence>
            ))}

            {s.lockup && <BrandLockup />}
          </>
        )}

        {/* ---- final row: the brand close, identical on all thirty videos ---- */}
        <Sequence from={END_CARD} durationInFrames={DURATION - END_CARD} layout="none">
          <EndCard />
        </Sequence>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * The text layer for whichever row is currently playing. Reading state rather
 * than hard-coding per row keeps the 14-15s loop cut pixel-identical to 0-1s.
 */
const RowOverlay: React.FC<{ rowStart: number }> = ({ rowStart }) => {
  // useCurrentFrame() is Sequence-relative, so add the row start back to get the
  // absolute frame the timeline is defined against.
  const s = getState(useCurrentFrame() + rowStart);
  return (
    <>
      {s.chip && <CounterChip {...s.chip} />}
      {s.hook.opacity > 0 && <HookCard opacity={s.hook.opacity} />}
      {s.aside && <TextCard {...s.aside} />}
      {s.payoff && <PayoffTick payoff={s.payoff} />}
    </>
  );
};
