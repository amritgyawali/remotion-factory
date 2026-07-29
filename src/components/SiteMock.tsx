import React from "react";
import type { Theme } from "../theme";

/**
 * A real-looking product page, rebuilt as DOM so it can break on cue.
 *
 * This is the creative unlock in the whole approach and it is worth being
 * explicit about: if you screen-record a real website, the logo cannot grow. A
 * page that is actually DOM driven by one variable breaks *for real* — the nav
 * genuinely wraps, genuinely gets pushed past the right edge, and is genuinely
 * clipped by `overflow: hidden` on the viewport. The joke is only possible
 * because the constraint forced the UI to be rebuilt rather than filmed.
 *
 * Two deliberate departures from the rest of this project:
 *
 * Light, not dark. Everything else here is warm type on a mid-dark ground. A
 * white page inside a browser frame on that dark canvas is the highest-contrast
 * thing the system can produce, and it reads as "a website" in one frame with
 * no label. The browser frame is not decoration — its rounded corners separate
 * white UI from dark canvas, and its `overflow: hidden` *is* the clipping
 * mechanism the gag depends on.
 *
 * Desktop proportions, not mobile. A desktop nav is what visibly wraps and
 * clips. A mobile nav would collapse to a hamburger and the joke would die.
 *
 * The client's brand colour is deliberately not MeritByte's, so nobody watching
 * thinks MeritByte's own site is the one falling apart.
 */

/** Fallback only. Every video should pass its own client through. */
export const CLIENT_BRAND = "#6B4EFF";

/**
 * The site being wrecked, as data.
 *
 * Hardcoding one fictional company would have made twenty-eight videos that
 * are the same picture with new captions — and this project already refuses
 * those: archive uniqueness compares frame fingerprints, so a week of
 * identical mocks would be rejected at the archive step after paying for
 * every render. Varying the client is what makes one template carry a week.
 */
export type Client = {
  name: string;
  /** Deliberately never MeritByte blue, so nobody thinks it is our site breaking. */
  brand: string;
  domain: string;
  eyebrow: string;
  headline: string;
  sub: string;
  nav: string[];
  cta: string;
  stats: { v: string; l: string }[];
  cards: { dot: string; title: string }[];
};

export const DEFAULT_CLIENT: Client = {
  name: "VERTEX",
  brand: CLIENT_BRAND,
  domain: "vertex.io",
  eyebrow: "PLATFORM",
  headline: "Ship faster with Vertex",
  sub: "The infrastructure layer for modern product teams.",
  nav: ["Product", "Solutions", "Pricing", "Docs"],
  cta: "Get started",
  stats: [
    { v: "99.99%", l: "uptime" },
    { v: "40ms", l: "p95 latency" },
    { v: "12k", l: "teams" },
  ],
  cards: [
    { dot: "#6B4EFF", title: "Deploy" },
    { dot: "#F2A93B", title: "Observe" },
    { dot: "#22C55E", title: "Scale" },
  ],
};

const INK = "#0D1116";
const MID = "#5A6472";
const DIM = "#8B94A3";
const LINE = "#E4E8EF";
const PAPER_ALT = "#F3F5F8";

export type SiteState = {
  /** The driving value. Everything else on the page is derived from it. */
  logoH: number;
  logoX: number;
  navWrapped: boolean;
  navClipped: boolean;
  navShift: number;
  heroImgH: number;
  headlineShift: number;
  contentPush: number;
  scrollY: number;
};

/** The client's mark: a rounded square and a stroked V. Hand-drawn SVG, no icon set. */
const ClientMark: React.FC<{ size: number; brand: string; letter: string }> = ({
  size,
  brand,
  letter,
}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block", flexShrink: 0 }}>
    <rect width="100" height="100" rx="24" fill={brand} />
    <text
      x="50"
      y="50"
      textAnchor="middle"
      dominantBaseline="central"
      fill="#FFFFFF"
      fontSize="58"
      fontWeight="700"
      fontFamily="system-ui, sans-serif"
    >
      {letter}
    </text>
    <path
      d="M26 30 L50 72 L74 30"
      display="none"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="13"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const SiteMock: React.FC<{ state: SiteState; theme: Theme; client?: Client }> = ({
  state,
  theme,
  client = DEFAULT_CLIENT,
}) => {
  const {
    logoH,
    logoX,
    navWrapped,
    navClipped,
    navShift,
    heroImgH,
    headlineShift,
    contentPush,
    scrollY,
  } = state;

  const wordmarkSize = Math.max(20, logoH * 0.46);

  return (
    <div
      style={{
        position: "relative",
        width: 1000,
        height: 1230,
        borderRadius: 26,
        overflow: "hidden",
        background: "#FFFFFF",
        boxShadow: "0 40px 90px rgba(0,0,0,0.55)",
      }}
    >
      {/* Browser chrome. Says "this is a website" without a word of copy. */}
      <div
        style={{
          height: 64,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 20px",
          background: PAPER_ALT,
          borderBottom: `1px solid ${LINE}`,
        }}
      >
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <div key={c} style={{ width: 14, height: 14, borderRadius: 999, background: c }} />
        ))}
        <div
          style={{
            marginLeft: 14,
            flex: 1,
            height: 30,
            borderRadius: 999,
            background: "#FFFFFF",
            border: `1px solid ${LINE}`,
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            fontFamily: theme.mono,
            fontSize: 15,
            color: DIM,
          }}
        >
          {client.domain}
        </div>
      </div>

      {/* The viewport. overflow:hidden here is what clips the nav and the logo. */}
      <div style={{ position: "relative", height: 1166, overflow: "hidden" }}>
        <div style={{ transform: `translateY(${-scrollY}px)` }}>
          {/* Header: the logo and the nav share one row, and the logo wins. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 22,
              padding: "22px 26px",
              borderBottom: `1px solid ${LINE}`,
              flexWrap: navWrapped ? "wrap" : "nowrap",
              minHeight: 78,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: Math.max(10, logoH * 0.22),
                marginLeft: logoX,
                flexShrink: 0,
              }}
            >
              <ClientMark size={logoH} brand={client.brand} letter={client.name.slice(0, 1)} />
              <span
                style={{
                  fontFamily: theme.display,
                  fontWeight: theme.weightHeavy,
                  fontSize: wordmarkSize,
                  letterSpacing: "0.02em",
                  color: INK,
                  whiteSpace: "nowrap",
                }}
              >
                {client.name}
              </span>
            </div>

            {/*
              Pushed by the logo, not by a timer. Once the logo is large enough
              these are simply off the right edge of a container that clips.
            */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                marginLeft: navClipped ? navShift : 0,
                flexShrink: 0,
                opacity: navClipped ? 0.9 : 1,
              }}
            >
              {client.nav.map((item) => (
                <span
                  key={item}
                  style={{
                    fontFamily: theme.display,
                    fontWeight: theme.weightBody,
                    fontSize: 20,
                    color: MID,
                    whiteSpace: "nowrap",
                  }}
                >
                  {item}
                </span>
              ))}
              <span
                style={{
                  padding: "10px 18px",
                  borderRadius: 9,
                  background: client.brand,
                  color: "#FFFFFF",
                  fontFamily: theme.display,
                  fontWeight: theme.weightMid,
                  fontSize: 19,
                  whiteSpace: "nowrap",
                }}
              >
                {client.cta}
              </span>
            </div>
          </div>

          {/* Everything below is shoved down once the logo passes the fold. */}
          <div style={{ padding: "34px 34px 40px", transform: `translateY(${contentPush + headlineShift}px)` }}>
            <div
              style={{
                fontFamily: theme.mono,
                fontSize: 17,
                letterSpacing: "0.18em",
                color: client.brand,
                marginBottom: 14,
              }}
            >
              {client.eyebrow}
            </div>
            <div
              style={{
                fontFamily: theme.display,
                fontWeight: theme.weightHeavy,
                fontSize: 58,
                lineHeight: 1.06,
                letterSpacing: "-0.02em",
                color: INK,
              }}
            >
              {client.headline}
            </div>
            <div
              style={{
                marginTop: 16,
                fontFamily: theme.display,
                fontWeight: theme.weightBody,
                fontSize: 24,
                color: MID,
              }}
            >
              {client.sub}
            </div>

            <div
              style={{
                display: "flex",
                gap: 16,
                marginTop: 26,
              }}
            >
              <span
                style={{
                  padding: "16px 26px",
                  borderRadius: 10,
                  background: INK,
                  color: "#FFFFFF",
                  fontFamily: theme.display,
                  fontWeight: theme.weightMid,
                  fontSize: 22,
                }}
              >
                Start free
              </span>
              <span
                style={{
                  padding: "16px 26px",
                  borderRadius: 10,
                  border: `1px solid ${LINE}`,
                  color: INK,
                  fontFamily: theme.display,
                  fontWeight: theme.weightMid,
                  fontSize: 22,
                }}
              >
                Book a demo
              </span>
            </div>

            {/* The hero image squashes as a function of the logo height. */}
            <div
              style={{
                marginTop: 30,
                height: heroImgH,
                borderRadius: 16,
                background: `linear-gradient(120deg, ${PAPER_ALT}, #E7EBF4)`,
                border: `1px solid ${LINE}`,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  right: 40,
                  top: 40,
                  width: 240,
                  height: 150,
                  borderRadius: 14,
                  background: `${client.brand}66`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 40,
                  top: 56,
                  width: 300,
                  height: 16,
                  borderRadius: 999,
                  background: "#D8DEE9",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 18, marginTop: 30 }}>
              {client.cards.map((card) => (
                <div
                  key={card.title}
                  style={{
                    flex: 1,
                    padding: 22,
                    borderRadius: 14,
                    border: `1px solid ${LINE}`,
                    background: "#FFFFFF",
                  }}
                >
                  <div
                    style={{ width: 22, height: 22, borderRadius: 6, background: card.dot, marginBottom: 16 }}
                  />
                  <div
                    style={{
                      fontFamily: theme.display,
                      fontWeight: theme.weightMid,
                      fontSize: 22,
                      color: INK,
                      marginBottom: 12,
                    }}
                  >
                    {card.title}
                  </div>
                  {[0.9, 0.6].map((w, i) => (
                    <div
                      key={i}
                      style={{
                        height: 10,
                        width: `${w * 100}%`,
                        borderRadius: 999,
                        background: "#E9EDF4",
                        marginBottom: 8,
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                marginTop: 26,
                borderRadius: 14,
                border: `1px solid ${LINE}`,
                overflow: "hidden",
              }}
            >
              {client.stats.map((stat, i) => (
                <div
                  key={stat.l}
                  style={{
                    flex: 1,
                    padding: "24px 0",
                    textAlign: "center",
                    borderLeft: i === 0 ? "none" : `1px solid ${LINE}`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: theme.display,
                      fontWeight: theme.weightHeavy,
                      fontSize: 34,
                      color: INK,
                    }}
                  >
                    {stat.v}
                  </div>
                  <div style={{ fontFamily: theme.mono, fontSize: 15, color: DIM, marginTop: 6 }}>
                    {stat.l}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
