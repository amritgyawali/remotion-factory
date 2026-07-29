import React from 'react';
import { colors } from '../brand/colors.js';
import { clamp } from '../lib/anim.js';
import type { Day01State } from '../lib/timeline.js';

/** The escalation counter. Top right, one per "ROUND n" row. */
export const CounterChip: React.FC<{ label: string; scale: number; opacity: number }> = ({
  label, scale, opacity,
}) => (
  <div className="chip" style={{ transform: `scale(${scale})`, opacity }}>{label}</div>
);

/**
 * The silent hook. 96px, five words, fully readable by frame 6 — so it does not
 * animate in, it is simply there while the logo springs behind it.
 */
export const HookCard: React.FC<{ opacity: number }> = ({ opacity }) => (
  <>
    <div className="hookscrim" style={{ opacity }} />
    <div className="hook" style={{ opacity }}>
      <div className="hooktext">
        MAKE THE<br />LOGO BIGGER
      </div>
      <div className="hooksub">round 7 of 7</div>
    </div>
  </>
);

/** Lower-case asides that carry the narration a voice would normally carry. */
export const TextCard: React.FC<{ text: string; opacity: number; y: number }> = ({
  text, opacity, y,
}) => (
  <div className="aside" style={{ opacity, transform: `translateY(${y}px)` }}>{text}</div>
);

/** Persistent lower-left lockup: keeps the brand present across the seamless loop. */
export const BrandLockup: React.FC = () => (
  <div className="lockup">
    <span className="lmark" />
    MeritByte.com
  </div>
);

/** 13-14s. Green tick drawn on with a stroke-dashoffset animation. */
export const PayoffTick: React.FC<{ payoff: NonNullable<Day01State['payoff']> }> = ({ payoff: p }) => {
  const R = 42;
  const CIRC = 2 * Math.PI * R;
  const CHECK = 220;
  return (
    <div className="payoff" style={{ opacity: p.opacity }}>
      <div className="payoffscrim" />
      <div className="tickwrap" style={{ transform: `scale(${p.scale})` }}>
        <svg width="340" height="340" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r={R}
            fill="rgba(34,197,94,0.14)" stroke={colors.green} strokeWidth="4"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - p.tickProgress)}
            transform="rotate(-90 50 50)"
          />
          <path
            d="M30 51 L44 65 L71 36"
            fill="none" stroke={colors.green} strokeWidth="9"
            strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={CHECK}
            strokeDashoffset={CHECK * (1 - clamp((p.tickProgress - 0.35) / 0.65, 0, 1))}
          />
        </svg>
      </div>
      <div className="payofftext" style={{ transform: `scale(${p.scale})` }}>{p.text}</div>
    </div>
  );
};
