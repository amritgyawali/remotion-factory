/**
 * The render buffer's shape and the pure functions over it.
 *
 * Deliberately free of any server-only import. The review UI is a client
 * component and needs these, and pulling them from factory.ts dragged the
 * GitHub client — and the token with it — into the browser bundle. The build
 * refused, correctly; this module is the seam that keeps both sides honest.
 */

export type Approval = "pending" | "approved" | "rejected";

/**
 * A rendered video parked between the morning batch and a publish slot.
 * Written by scripts/render-batch.mjs, consumed by scripts/publish-one.mjs,
 * and reviewed in between by this dashboard.
 */
export interface BufferEntry {
  id: string;
  week: string;
  template: string;
  url: string;
  sha256?: string;
  bytes?: number;
  durationSeconds?: number;
  renderedAt?: string;
  approval?: Approval;
  reviewedAt?: string;
}

export interface QueueState {
  posted: string[];
  lastPostedAt?: string;
  rendered?: BufferEntry[];
}

/** Absent means pending: entries written before review existed are unreviewed. */
export const approvalOf = (entry: BufferEntry): Approval => entry.approval ?? "pending";

/** Rendered and not yet posted, oldest first — what the review queue shows. */
export function bufferedVideos(state: QueueState): BufferEntry[] {
  const posted = new Set(state.posted);
  return (state.rendered ?? []).filter((entry) => !posted.has(entry.id));
}

/** Mirrors publishable() in scripts/queue.mjs so the UI predicts the same order. */
export function publishableVideos(state: QueueState, approvalRequired: boolean): BufferEntry[] {
  return bufferedVideos(state).filter((entry) => {
    const approval = approvalOf(entry);
    if (approval === "rejected") return false;
    return approvalRequired ? approval === "approved" : true;
  });
}
