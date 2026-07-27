import { loadFont as loadDisplayFont } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadMonoFont } from "@remotion/google-fonts/JetBrainsMono";

// If either import above ever breaks (Google Fonts renames things
// occasionally), swap to "@remotion/google-fonts/Anton" and
// "@remotion/google-fonts/IBMPlexMono" — nothing else needs to change.
export const display = loadDisplayFont().fontFamily;
export const mono = loadMonoFont().fontFamily;

/**
 * Aubergine ground, warm paper type, amber signal.
 * Chosen over the usual near-black + acid-green because a mid-dark
 * chromatic ground keeps its identity when a feed compresses it.
 */
export const palette = {
  ground: "#221033",
  groundLift: "#3A1C55",
  paper: "#F4EFE4",
  paperDim: "rgba(244, 239, 228, 0.55)",
  amber: "#FFB25C",
  seaglass: "#6FD3BE",
  rule: "rgba(244, 239, 228, 0.22)",
} as const;

export type Theme = typeof palette;

/** plan.json can override any single token per video. */
export const resolveTheme = (overrides?: Partial<Theme>): Theme => ({
  ...palette,
  ...(overrides ?? {}),
});

export const SERIES_LENGTH = 30;
