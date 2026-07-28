import type { Approval } from "./buffer";

/**
 * One row of the video library, whatever stage it is at.
 *
 * No server-only import: the library grid is a client component, and pulling
 * these from factory.ts would drag the GitHub token into the browser bundle.
 */

/** Where a video is in its life. Ordered as it actually progresses. */
export type Stage = "rendering" | "review" | "archived" | "published";

export interface LibraryVideo {
  id: string;
  week: string;
  template: string;
  /** Direct Release asset URL — played and downloaded straight from GitHub. */
  url: string;
  bytes: number;
  durationSeconds: number | null;
  sha256: string;
  /** Archived-at or rendered-at, whichever the source provided. */
  at: string;
  stage: Stage;
  /** Only meaningful while a video is in the review buffer. */
  approval: Approval | null;
}

/** A render happening on a runner right now. */
export interface RenderInFlight {
  runId: number;
  runNumber: number;
  startedAt: string;
  /** The step currently executing, which names the video being rendered. */
  step: string;
  jobStatus: string;
}

export const STAGE_LABEL: Record<Stage, string> = {
  rendering: "Rendering",
  review: "Awaiting review",
  archived: "Archived",
  published: "Published",
};
