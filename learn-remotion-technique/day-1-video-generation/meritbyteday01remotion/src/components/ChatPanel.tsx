import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { Day01State } from '../lib/timeline.js';

const Dots: React.FC<{ phase: number }> = ({ phase }) => (
  <>
    {[0, 1, 2].map((i) => (
      <span className="tdot" key={i} style={{ opacity: phase === i ? 1 : 0.28 }} />
    ))}
  </>
);

/**
 * 9-12s. A Slack-style panel rebuilt as components — never a screen recording.
 * The sender is an initials chip, never an avatar photo, because a person is
 * never allowed on screen.
 */
export const ChatPanel: React.FC<{ state: Day01State }> = ({ state }) => {
  const c = state.chat!;
  return (
    <AbsoluteFill className="chat">
      <div className="chead">
        <span className="chash">#</span>
        <span className="cname">vertex-website</span>
        <span className="cmeta">redesign · feedback</span>
      </div>

      <div className="crow">
        <div className="initials">VC</div>
        <div className="cbody">
          <div className="cwho">
            Vertex Co. <span className="ctime">16:41</span>
          </div>
          {c.landed || c.text.length > 0 ? (
            <div className="bubble" style={{ transform: `scale(${c.bubbleScale})` }}>
              {c.text}
              {!c.landed && <span className="caret" />}
            </div>
          ) : (
            <div className="bubble ghost" style={{ width: 140 + c.ghostWidth * 620 }}>
              <Dots phase={c.dotPhase} />
            </div>
          )}
        </div>
      </div>

      {c.status && (
        <div className="cstatus">
          <Dots phase={c.dotPhase} />
          <span>{c.status}</span>
        </div>
      )}
    </AbsoluteFill>
  );
};
