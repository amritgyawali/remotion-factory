import "server-only";
import { minGapHours } from "./env";
import { listDirectory, listReleases, readJsonFile, type RepoFile } from "./github";
import type { PlanItem, WeeklyPlan } from "./plan-schema";

/**
 * The factory's own domain model, read straight out of the repository — the
 * same files the workflow reads. There is no database: state.json on main is
 * the single source of truth for what has shipped, so the dashboard cannot
 * drift from what the pipeline believes.
 *
 * Mirrors scripts/queue.mjs and scripts/due.mjs.
 */

// The buffer's shape and pure helpers live in ./buffer, which imports nothing
// server-only, so client components can use them without pulling the GitHub
// token into the browser bundle. Re-exported here so server code has one
// import site, and imported too because a re-export alone is not in scope.
import type { QueueState } from "./buffer";

export {
  approvalOf,
  bufferedVideos,
  publishableVideos,
  type Approval,
  type BufferEntry,
  type QueueState,
} from "./buffer";

export interface ArchiveEntry {
  id: string;
  week: string;
  template: string;
  sourceId: string | null;
  bytes: number;
  durationSeconds: number | null;
  sha256: string;
  url: string;
  archivedAt: string;
}

export interface WeekFile {
  path: string;
  sha: string;
  plan: WeeklyPlan;
}

export interface QueueSnapshot {
  posted: number;
  remaining: number;
  total: number;
  next: PlanItem | null;
  nextWeek: string | null;
  nextPlanPath: string | null;
  pending: PlanItem[];
  unknown: string[];
}

export interface DueDecision {
  due: boolean;
  reason: string;
  /** ISO timestamp of the earliest moment the next post may go out. */
  opensAt: string | null;
  hoursSinceLast: number | null;
}

export const QUEUE_LOW_WATER = 12;

/* -------------------------------------------------------------------------- */

export async function loadState(): Promise<RepoFile<QueueState> | null> {
  return readJsonFile<QueueState>("state.json");
}

export async function loadWeeks(): Promise<WeekFile[]> {
  const entries = await listDirectory("plans");
  const files = await Promise.all(
    entries
      .filter((entry) => entry.name.endsWith(".json"))
      .map(async (entry) => {
        const file = await readJsonFile<WeeklyPlan>(entry.path);
        return file ? { path: file.path, sha: file.sha, plan: file.data } : null;
      }),
  );

  return files
    .filter((file): file is WeekFile => file !== null)
    .sort((a, b) => (a.plan.week?.order ?? 0) - (b.plan.week?.order ?? 0));
}

export async function loadManifest(): Promise<ArchiveEntry[]> {
  const file = await readJsonFile<{ videos: ArchiveEntry[] }>("archive/manifest.json");
  return file?.data.videos ?? [];
}

/** Ordered across weeks exactly as getArchivedQueue does, oldest week first. */
export function queueSnapshot(weeks: WeekFile[], state: QueueState): QueueSnapshot {
  const entries = weeks.flatMap((week) =>
    week.plan.items.map((item) => ({ item, week: week.plan.week?.id ?? "unfiled", path: week.path })),
  );
  const known = new Set(entries.map((entry) => entry.item.id));
  const posted = new Set(state.posted);
  const pending = entries.filter((entry) => !posted.has(entry.item.id));
  const next = pending[0] ?? null;

  return {
    posted: state.posted.length,
    remaining: pending.length,
    total: entries.length,
    next: next?.item ?? null,
    nextWeek: next?.week ?? null,
    nextPlanPath: next?.path ?? null,
    pending: pending.map((entry) => entry.item),
    unknown: state.posted.filter((id) => !known.has(id)),
  };
}

/** Mirrors publishDecision in scripts/due.mjs, including the future-stamp guard. */
export function dueDecision(state: QueueState, now = Date.now()): DueDecision {
  const gap = minGapHours();

  if (!state.lastPostedAt) {
    return { due: true, reason: "nothing has been posted yet", opensAt: null, hoursSinceLast: null };
  }

  const last = Date.parse(state.lastPostedAt);
  const elapsed = (now - last) / 3_600_000;
  const opensAt = new Date(last + gap * 3_600_000).toISOString();

  if (elapsed < 0) {
    return {
      due: false,
      reason: `lastPostedAt (${state.lastPostedAt}) is in the future — publishing is held until it passes`,
      opensAt: state.lastPostedAt,
      hoursSinceLast: elapsed,
    };
  }
  if (elapsed >= gap) {
    return {
      due: true,
      reason: `${elapsed.toFixed(1)}h since the last post, gap is ${gap}h`,
      opensAt,
      hoursSinceLast: elapsed,
    };
  }
  return {
    due: false,
    reason: `only ${elapsed.toFixed(1)}h since the last post — next slot opens in ${(gap - elapsed).toFixed(1)}h`,
    opensAt,
    hoursSinceLast: elapsed,
  };
}

/**
 * The next moment GitHub will attempt a run, from the workflow's cron: every
 * two hours at :32 UTC. An attempt is not a post — `dueDecision` still decides
 * — but seeing it explains why nothing has happened for the last ninety
 * minutes, which is the question this dashboard exists to answer.
 */
export function nextAttempt(now = new Date()): Date {
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(32);
  if (next <= now) next.setUTCHours(next.getUTCHours() + 1);
  while (next.getUTCHours() % 2 !== 0) next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

/** Bytes held in GitHub Releases, which is the archive with no explicit budget. */
export async function archiveFootprint(): Promise<{ bytes: number; assets: number; releases: number }> {
  const releases = await listReleases();
  let bytes = 0;
  let assets = 0;
  for (const release of releases) {
    for (const asset of release.assets) {
      bytes += asset.size;
      assets += 1;
    }
  }
  return { bytes, assets, releases: releases.length };
}
