import { lookFor } from "../theme";
import type { Theme } from "../theme";

/**
 * The theme a reel renders on, resolved from its composition id.
 *
 * This delegates to the same campaign walk as the old templates — `lookFor` —
 * so the 336-combination guarantee that no two campaign videos share a palette,
 * typeface and motion signature still holds for reels. The ledger's three visual
 * axes (typeface pair, palette, motion vocabulary) are exactly the three the
 * walk spreads, and scripts/ledger-check.mjs reads the brief's declared ledger
 * against the walk's assignment so a brief that disagrees with the machinery
 * fails before a render is spent on it.
 *
 * `resolveTheme` would accept colour overrides, and reels deliberately do not
 * pass any. The document gives each reel a named visual system — a sandbox
 * study is not burgundy — and the palette walk cannot know that. So the brief's
 * `visualSystem` maps to an explicit palette override *before* the walk, rather
 * than after it. That is the one place a reel may retint the machinery.
 */
export type ReelTheme = Theme;

export const VISUAL_SYSTEM_PALETTES: Record<string, Partial<Theme>> = {
  "sandbox": { ground: "#0E1A16", groundLift: "#1B2F27", paper: "#EAF2EC", amber: "#7DD9A8", seaglass: "#9BC5E0" },
  "museum-optics": { ground: "#1A0E12", groundLift: "#331B24", paper: "#F3E9E6", amber: "#E8B98C", seaglass: "#A9C7C2" },
  "utility-room": { ground: "#17140C", groundLift: "#2C2613", paper: "#F2EBD9", amber: "#D9A05B", seaglass: "#8FBFA0" },
  "paper-lab": { ground: "#14101C", groundLift: "#29213A", paper: "#EFEAF4", amber: "#C9A26B", seaglass: "#9FB6D9" },
};

export function themeForReel(id: string | undefined, visualSystem?: string): ReelTheme {
  const override = visualSystem ? VISUAL_SYSTEM_PALETTES[visualSystem.toLowerCase()] : undefined;
  return lookFor(id, override).theme;
}

export const paletteNameForReel = (id: string | undefined): string => lookFor(id, undefined).paletteName;
export const typefaceForReel = (id: string | undefined): string => lookFor(id, undefined).typefaceName;
export const motionForReel = (id: string | undefined): string => lookFor(id, undefined).motion.name;
