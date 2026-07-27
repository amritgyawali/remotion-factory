import type { Theme } from "./theme";

/**
 * Every template takes these. This is the whole trick: you never write
 * video code again, you feed different data into the same shapes.
 */
export type BaseProps = {
  /** Small all-caps label above the headline. Keep under ~24 chars. */
  eyebrow: string;
  /** Day index in the series, drives the progress rule. */
  day: number;
  /** Seconds. Remotion turns this into durationInFrames. */
  durationInSeconds: number;
  /** Optional per-video colour overrides. */
  theme?: Partial<Theme>;
  /**
   * The plan item's id. Seeds this video's palette, typeface pairing and
   * musical key, so two videos are never the same picture with new words.
   * Derived from the id rather than randomised so a retried render is
   * byte-identical — the duplicate detector compares fingerprints.
   */
  videoId?: string;
  /**
   * Beat-exact soundtrack for this video, transcribed from its script page:
   * which bed layers are audible from which frame, and every SFX cue with the
   * frame it lands on. Omitted, the template's documented bed behaviour is
   * generated instead — see src/audio/defaultScore.ts.
   */
  score?: {
    bed: { frame: number; layers: string[]; detune?: number }[];
    cues: { frame: number; sfx: string; db?: number; major?: boolean }[];
  };
};

export type StatCardProps = BaseProps & {
  /** e.g. "43%", "1 in 6", "$2.4M". Leading digits animate, the rest doesn't. */
  value: string;
  /** One line under the number. */
  label: string;
  /** Two short lines of context. Keep each under ~48 chars. */
  context: string[];
  /** Bottom-of-frame prompt. */
  kicker?: string;
};

export type ListRevealProps = BaseProps & {
  headline: string;
  /** 3–5 items. Any more and they get unreadable at phone size. */
  items: string[];
  kicker?: string;
};

export type DevJokeVariant =
  | "logo"
  | "terminal"
  | "qa"
  | "timer"
  | "scope"
  | "deploy"
  | "comments"
  | "cache";

export type DevJokeProps = BaseProps & {
  hook: string;
  beats: string[];
  punchline: string;
  variant: DevJokeVariant;
  kicker?: string;
};

export type TechTipVariant =
  | "security"
  | "devtools"
  | "tool-audit"
  | "vitals"
  | "index-check"
  | "design-code";

export type TechTipProps = BaseProps & {
  hook: string;
  steps: string[];
  result: string;
  variant: TechTipVariant;
  kicker?: string;
};

export type SiteRoastProps = BaseProps & {
  hook: string;
  episode: string;
  problems: string[];
  fix: string;
  verdict: string;
  kicker?: string;
};

export type CaseStudyProps = BaseProps & {
  hook: string;
  before: string;
  after: string;
  actions: string[];
  lesson: string;
  kicker?: string;
};

export type FounderStoryProps = BaseProps & {
  hook: string;
  moments: string[];
  turn: string;
  lesson: string;
  kicker?: string;
};

export type RecapProps = BaseProps & {
  hook: string;
  /** Headline figures, revealed one at a time. */
  totals: { label: string; value: number }[];
  /** Ranked rows; the first is highlighted. */
  leaderboard: { label: string; value: number }[];
  lesson: string;
  /** Tiles in the contact sheet. Defaults to the series length. */
  gridCount?: number;
  kicker?: string;
};

export type TemplateId =
  | "StatCard"
  | "ListReveal"
  | "DevJoke"
  | "TechTip"
  | "SiteRoast"
  | "CaseStudy"
  | "FounderStory"
  | "Recap";

/** One entry in plan.json. */
export type PlanItem = {
  id: string;
  /** Stable provenance slug used to reject recycled weekly ideas. */
  sourceId?: string;
  template: TemplateId;
  /** ISO 8601 for legacy calendar plans. Queue items deliberately omit it. */
  publishAt?: string;
  /** Caption text posted alongside the video. */
  caption: string;
  /** Which connected Postiz channels to post to. Empty = all of them. */
  channels?: string[];
  props: Record<string, unknown>;
};

export type Plan = {
  series: string;
  /** Queue mode renders the first id not listed in state.json. */
  mode?: "queue";
  /** One replaceable seven-day inbox; accepted copies live under plans/. */
  week?: {
    id: string;
    order: number;
  };
  /** "draft" | "schedule" | "now" — start on draft. */
  postType: "draft" | "schedule" | "now";
  /**
   * Default channels for every item, as Postiz integration IDs.
   * Use IDs, not identifiers — two accounts on one platform share an identifier.
   */
  channels?: string[];
  /** Extra required settings per platform, keyed by Postiz identifier. */
  channelSettings?: Record<string, Record<string, unknown>>;
  items: PlanItem[];
};
