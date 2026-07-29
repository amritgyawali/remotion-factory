// DAY 1 scene graph. Pure function: state -> HTML.
// The Remotion components in src/components mirror this markup 1:1 and read the
// same numbers from src/lib/timeline.js.

import { colors as C, type as T } from '../src/brand/colors.js';
import { interpolate, clamp } from '../src/lib/anim.js';

// ---- layout constants (1080 x 1920) ---------------------------------------
export const L = {
  frameX: 40,
  frameY: 430,
  frameW: 1000,
  frameH: 1230,
  chromeH: 64,
  get viewportH() { return this.frameH - this.chromeH; }, // 1166
  siteW: 1000,
  logoTop: 24,
  logoLeftBase: 44,
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Measure the client wordmark so nav items can be pushed right accurately.
let _measureCtx = null;
function measureWordmark(fontSize) {
  if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d');
  _measureCtx.font = `700 ${fontSize}px ${T.sans}`;
  return _measureCtx.measureText('VERTEX').width + fontSize * 0.09 * 5; // + letter-spacing
}

function logoBlock(state) {
  const h = state.logoH;
  const fs = h * 0.58;
  const markSvg = `
    <svg width="${h}" height="${h}" viewBox="0 0 100 100" style="display:block">
      <rect x="0" y="0" width="100" height="100" rx="24" fill="${C.clientBrand}"/>
      <path d="M26 30 L50 72 L74 30" fill="none" stroke="#fff" stroke-width="13"
            stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  const w = h + h * 0.18 + measureWordmark(fs);
  return {
    width: w,
    html: `<div class="logo" style="left:${state.logoX}px;top:${L.logoTop}px;height:${h}px;gap:${h * 0.18}px">
      ${markSvg}
      <span style="font-size:${fs}px;letter-spacing:${fs * 0.09}px">VERTEX</span>
    </div>`,
  };
}

function siteHTML(state) {
  const h = state.logoH;
  const lb = logoBlock(state);
  const navH = Math.min(h + 48, 200) + (state.navWrapped && !state.navClipped ? 64 : 0);

  const items = ['Product', 'Solutions', 'Pricing', 'Docs']
    .map((i) => `<span class="ni">${i}</span>`).join('');
  const navInner = `${items}<span class="cta">Get started</span>`;

  let navItemsStyle;
  if (state.navWrapped && !state.navClipped) {
    // 2-3s: nav wraps to a second line
    navItemsStyle = `left:32px;top:${navH - 56}px`;
  } else {
    // items pushed right by the logo; past 200px they run off the edge and are
    // clipped by the viewport's overflow:hidden
    navItemsStyle = `left:${state.logoX + lb.width + 32}px;top:${Math.min(navH, 200) / 2 - 22}px`;
  }

  const headlineShift = interpolate(h, [96, 200], [0, 110]);
  const heroImgH = state.heroImgH;
  const fighting = state.logoOverlaps;

  return `
  <div class="site" style="transform:translateY(${-state.scrollY}px)">
    <div class="nav" style="height:${navH}px">
      <div class="navitems" style="${navItemsStyle}">${navInner}</div>
    </div>

    <div class="hero" style="margin-top:${state.contentPush}px">
      <div class="eyebrow">PLATFORM</div>
      <h1 style="margin-top:${headlineShift}px;${fighting ? 'text-shadow:0 0 22px #fff,0 0 42px #fff;' : ''}">Ship faster with Vertex</h1>
      <p>The infrastructure layer for modern product teams.</p>
      <div class="btnrow">
        <span class="btn primary">Start free</span>
        <span class="btn ghost">Book a demo</span>
      </div>
      <div class="heroimg" style="height:${heroImgH}px">
        <div class="hi-a"></div><div class="hi-b"></div><div class="hi-c"></div>
      </div>
    </div>

    <div class="features">
      ${['Deploy', 'Observe', 'Scale'].map((t, i) => `
        <div class="fcard">
          <div class="fdot" style="background:${[C.accent, C.amber, C.green][i]}"></div>
          <div class="ftitle">${t}</div>
          <div class="fline w1"></div><div class="fline w2"></div><div class="fline w3"></div>
        </div>`).join('')}
    </div>

    <div class="stats">
      ${[['99.99%', 'uptime'], ['40ms', 'p95 latency'], ['12k', 'teams']].map(([a, b]) => `
        <div class="stat"><div class="sv">${a}</div><div class="sl">${b}</div></div>`).join('')}
    </div>

    <div class="foot"><span>© Vertex</span><span>Privacy</span><span>Terms</span><span>Status</span></div>

    <!-- logo lives in its own layer so it can spill over the hero and bleed past
         both edges of the viewport once it stops fitting in the nav -->
    ${lb.html}
  </div>`;
}

function browserHTML(state) {
  return `
  <div class="browser">
    <div class="chrome">
      <span class="dot" style="background:#FF5F57"></span>
      <span class="dot" style="background:#FEBC2E"></span>
      <span class="dot" style="background:#28C840"></span>
      <div class="urlpill">vertex.io</div>
    </div>
    <div class="viewport">${siteHTML(state)}</div>
  </div>`;
}

function chatHTML(state) {
  const c = state.chat;
  const dots = [0, 1, 2].map((i) =>
    `<span class="tdot" style="opacity:${c.dotPhase === i ? 1 : 0.28}"></span>`).join('');

  const body = c.landed || c.text.length
    ? `<div class="bubble" style="transform:scale(${c.bubbleScale})">${esc(c.text)}${
        c.landed ? '' : '<span class="caret"></span>'}</div>`
    : `<div class="bubble ghost" style="width:${140 + c.ghostWidth * 620}px">${dots}</div>`;

  return `
  <div class="chat">
    <div class="chead">
      <span class="chash">#</span><span class="cname">vertex-website</span>
      <span class="cmeta">redesign · feedback</span>
    </div>
    <div class="crow">
      <div class="initials">VC</div>
      <div class="cbody">
        <div class="cwho">Vertex Co. <span class="ctime">16:41</span></div>
        ${body}
      </div>
    </div>
    ${c.status ? `<div class="cstatus">${dots}<span>${esc(c.status)}</span></div>` : ''}
  </div>`;
}

function endCardHTML(state) {
  const e = state.endcard;
  return `
  <div class="endcard">
    <div class="ecmark" style="transform:scale(${e.markScale});opacity:${e.markOpacity}">
      <svg width="180" height="180" viewBox="0 0 100 100">
        <rect x="0" y="0" width="100" height="100" rx="26" fill="${C.accent}"/>
        <path d="M24 72 V32 L50 60 L76 32 V72" fill="none" stroke="#fff" stroke-width="11"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <div class="ecwords" style="opacity:${e.textOpacity}">
      <div class="ecname">MeritByte Technologies</div>
      <div class="ecurl">MeritByte.com</div>
    </div>
  </div>`;
}

function payoffHTML(p) {
  const LEN = 220;
  return `
  <div class="payoff" style="opacity:${p.opacity}">
    <div class="payoffscrim"></div>
    <div class="tickwrap" style="transform:scale(${p.scale})">
      <svg width="340" height="340" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" fill="rgba(34,197,94,0.14)" stroke="${C.green}" stroke-width="4"
                stroke-dasharray="${2 * Math.PI * 42}"
                stroke-dashoffset="${2 * Math.PI * 42 * (1 - p.tickProgress)}"
                transform="rotate(-90 50 50)"/>
        <path d="M30 51 L44 65 L71 36" fill="none" stroke="${C.green}" stroke-width="9"
              stroke-linecap="round" stroke-linejoin="round"
              stroke-dasharray="${LEN}"
              stroke-dashoffset="${LEN * (1 - clamp((p.tickProgress - 0.35) / 0.65, 0, 1))}"/>
      </svg>
    </div>
    <div class="payofftext" style="transform:scale(${p.scale})">PERFECT. Ship it.</div>
  </div>`;
}

export function buildHTML(state) {
  if (state.scene === 'endcard') return endCardHTML(state);

  const parts = [];
  parts.push(state.scene === 'chat' ? chatHTML(state) : browserHTML(state));

  if (state.chip) {
    parts.push(`<div class="chip" style="transform:scale(${state.chip.scale});opacity:${state.chip.opacity}">${state.chip.label}</div>`);
  }
  if (state.hook.opacity > 0) {
    parts.push(`
      <div class="hookscrim" style="opacity:${state.hook.opacity}"></div>
      <div class="hook" style="opacity:${state.hook.opacity}">
        <div class="hooktext">MAKE THE<br>LOGO BIGGER</div>
        <div class="hooksub">round 7 of 7</div>
      </div>`);
  }
  if (state.aside) {
    parts.push(`<div class="aside" style="opacity:${state.aside.opacity};transform:translateY(${state.aside.y}px)">${esc(state.aside.text)}</div>`);
  }
  if (state.payoff) parts.push(payoffHTML(state.payoff));
  if (state.lockup) {
    parts.push(`<div class="lockup"><span class="lmark"></span>MeritByte.com</div>`);
  }
  return parts.join('');
}
