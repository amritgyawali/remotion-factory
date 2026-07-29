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

/**
 * An escalation joke told by breaking a real page. Fixed at 17s (15s body plus
 * the 2s brand close) because the whole structure — six rounds, the freeze, the
 * silence, the snap-back, the loop — is timed in seconds against that length.
 * `durationInSeconds` is ignored for this template rather than honoured badly.
 */
export type LogoLadderProps = BaseProps & {
  /** Two lines at most. Readable by frame 6, so it never animates in. */
  hook: string;
  /** The retention promise, e.g. "round 7 of 7". A number the viewer stays for. */
  promise: string;
  /** What the client sends at 10s. The turn the whole build is waiting on. */
  message: string;
  /** The release, on the green tick. */
  payoff: string;
  /**
   * The site being wrecked. Varying it is what lets one template carry a week:
   * archive uniqueness compares frame fingerprints, so twenty-eight identical
   * mocks would be rejected after paying for every render.
   */
  client?: Partial<import("./components/SiteMock").Client>;
};

/**
 * Day 5 — "It Works On My Machine". Fixed at 15s (13s body + the 2s brand
 * close): the freeze at 6-7s, the silence at 8-9s and the loop cut at 12-13s
 * are timed in seconds against that body, so a different duration would move
 * the beats out from under the soundtrack.
 */
export type WorksOnMyMachineProps = BaseProps & {
  /** On screen in the first three seconds, per the brief. Never animates in. */
  hook: string;
};

export type TemplateId =
  | "StatCard"
  | "ListReveal"
  | "DevJoke"
  | "TechTip"
  | "SiteRoast"
  | "CaseStudy"
  | "FounderStory"
  | "Recap"
  | "LogoLadder"
  | "WorksOnMyMachine";

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
