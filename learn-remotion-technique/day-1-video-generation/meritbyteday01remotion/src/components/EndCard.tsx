import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { spring, interpolate, Easing } from '../lib/anim.js';
import { colors } from '../brand/colors.js';

/**
 * The brand close. Exactly 2 seconds / 60 frames, #191919, logo mark springs in
 * over 6 frames, wordmark + URL fade up, then completely still.
 *
 * One component, imported by all thirty compositions. Change it once and all
 * thirty videos update.
 */
export const EndCard: React.FC = () => {
  const local = useCurrentFrame();
  const markScale = 0.72 + 0.28 * spring(local, { stiffness: 400, damping: 28 });
  const markOpacity = interpolate(local, [0, 4], [0, 1]);
  const textOpacity = interpolate(local, [6, 20], [0, 1], { easing: Easing.out });

  return (
    <AbsoluteFill className="endcard" style={{ background: colors.ink }}>
      <div className="ecmark" style={{ transform: `scale(${markScale})`, opacity: markOpacity }}>
        <svg width="180" height="180" viewBox="0 0 100 100">
          <rect x="0" y="0" width="100" height="100" rx="26" fill={colors.accent} />
          <path
            d="M24 72 V32 L50 60 L76 32 V72"
            fill="none"
            stroke="#fff"
            strokeWidth="11"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="ecwords" style={{ opacity: textOpacity }}>
        <div className="ecname">MeritByte Technologies</div>
        <div className="ecurl">MeritByte.com</div>
      </div>
    </AbsoluteFill>
  );
};
