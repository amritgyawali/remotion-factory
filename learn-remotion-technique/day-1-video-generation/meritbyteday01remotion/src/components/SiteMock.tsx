import React from 'react';
import { interpolate } from '../lib/anim.js';
import { colors } from '../brand/colors.js';
import type { Day01State } from '../lib/timeline.js';

const FEATURES: [string, string][] = [
  ['Deploy', colors.accent],
  ['Observe', colors.amber],
  ['Scale', colors.green],
];
const STATS: [string, string][] = [
  ['99.99%', 'uptime'],
  ['40ms', 'p95 latency'],
  ['12k', 'teams'],
];

/** Width of the client logo lockup, so nav items can be pushed right accurately. */
let ctx: CanvasRenderingContext2D | null = null;
const wordmarkWidth = (fontSize: number) => {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  ctx!.font = `700 ${fontSize}px 'Liberation Sans','DejaVu Sans',Arial,sans-serif`;
  return ctx!.measureText('VERTEX').width + fontSize * 0.09 * 5;
};

/**
 * The client homepage, rebuilt as components — never captured. Nothing here is a
 * screenshot: the nav, the hero and the logo are all real DOM driven by the
 * logo height, which is why the layout can visibly break on cue.
 */
export const SiteMock: React.FC<{ state: Day01State }> = ({ state }) => {
  const h = state.logoH;
  const markSize = h;
  const wordSize = h * 0.58;
  const logoWidth = markSize + h * 0.18 + wordmarkWidth(wordSize);

  // nav grows with the logo up to 200px, then the logo spills over the hero
  const navH = Math.min(h + 48, 200) + (state.navWrapped && !state.navClipped ? 64 : 0);

  const navItemsStyle: React.CSSProperties =
    state.navWrapped && !state.navClipped
      ? { left: 32, top: navH - 56 }                       // 2-3s: wraps to a second line
      : { left: state.logoX + logoWidth + 32, top: Math.min(navH, 200) / 2 - 22 };

  const headlineShift = interpolate(h, [96, 200], [0, 110]);

  return (
    <div className="site" style={{ transform: `translateY(${-state.scrollY}px)` }}>
      <div className="nav" style={{ height: navH }}>
        <div className="navitems" style={navItemsStyle}>
          {['Product', 'Solutions', 'Pricing', 'Docs'].map((i) => (
            <span className="ni" key={i}>{i}</span>
          ))}
          <span className="cta">Get started</span>
        </div>
      </div>

      <div className="hero" style={{ marginTop: state.contentPush }}>
        <div className="eyebrow">PLATFORM</div>
        <h1
          style={{
            marginTop: headlineShift,
            // 5-6s: the headline's z-index fights the logo and wins
            textShadow: state.logoOverlaps ? '0 0 22px #fff, 0 0 42px #fff' : undefined,
          }}
        >
          Ship faster with Vertex
        </h1>
        <p>The infrastructure layer for modern product teams.</p>
        <div className="btnrow">
          <span className="btn primary">Start free</span>
          <span className="btn ghost">Book a demo</span>
        </div>
        <div className="heroimg" style={{ height: state.heroImgH }}>
          <div className="hi-a" />
          <div className="hi-b" />
          <div className="hi-c" />
        </div>
      </div>

      <div className="features">
        {FEATURES.map(([title, c]) => (
          <div className="fcard" key={title}>
            <div className="fdot" style={{ background: c }} />
            <div className="ftitle">{title}</div>
            <div className="fline w1" />
            <div className="fline w2" />
            <div className="fline w3" />
          </div>
        ))}
      </div>

      <div className="stats">
        {STATS.map(([v, l]) => (
          <div className="stat" key={l}>
            <div className="sv">{v}</div>
            <div className="sl">{l}</div>
          </div>
        ))}
      </div>

      <div className="foot">
        {['© Vertex', 'Privacy', 'Terms', 'Status'].map((f) => <span key={f}>{f}</span>)}
      </div>

      {/* The logo lives in its own layer so it can spill over the hero and bleed
          past both edges of the viewport once it stops fitting in the nav. */}
      <div
        className="logo"
        style={{ left: state.logoX, top: 24, height: markSize, gap: h * 0.18 }}
      >
        <svg width={markSize} height={markSize} viewBox="0 0 100 100" style={{ display: 'block' }}>
          <rect x="0" y="0" width="100" height="100" rx="24" fill={colors.clientBrand} />
          <path d="M26 30 L50 72 L74 30" fill="none" stroke="#fff" strokeWidth="13"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: wordSize, letterSpacing: wordSize * 0.09 }}>VERTEX</span>
      </div>
    </div>
  );
};

export const BrowserFrame: React.FC<{ state: Day01State }> = ({ state }) => (
  <div className="browser">
    <div className="chrome">
      <span className="dot" style={{ background: '#FF5F57' }} />
      <span className="dot" style={{ background: '#FEBC2E' }} />
      <span className="dot" style={{ background: '#28C840' }} />
      <div className="urlpill">vertex.io</div>
    </div>
    <div className="viewport">
      <SiteMock state={state} />
    </div>
  </div>
);
