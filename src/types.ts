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

export type TemplateId = "StatCard" | "ListReveal";

/** One entry in plan.json. */
export type PlanItem = {
  id: string;
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
