import { VideoLibrary } from "@/components/VideoLibrary";
import { StatusPill } from "@/components/Status";
import { ErrorNote, Grid, StatTile } from "@/components/ui";
import { archiveFootprint, bufferedVideos, loadManifest, loadState } from "@/lib/factory";
import { listJobs, listRuns } from "@/lib/github";
import { formatBytes } from "@/lib/format";
import type { LibraryVideo, RenderInFlight } from "@/lib/library";
import { approvalOf } from "@/lib/buffer";

export const revalidate = 0;

/**
 * Every video the factory knows about, in one list.
 *
 * Three sources, because a video's life has three stages and the old page only
 * showed the last one: rendering right now on a runner, rendered and waiting
 * for review, or archived and published. Showing only the archive meant the
 * twenty minutes each morning when four videos are being made looked identical
 * to nothing happening.
 */
async function load() {
  const [manifest, state, footprint, runs] = await Promise.all([
    loadManifest(),
    loadState(),
    archiveFootprint(),
    listRuns(12),
  ]);

  const buffer = state ? bufferedVideos(state.data) : [];
  const posted = new Set(state?.data.posted ?? []);

  // A render batch that is still going. Its per-step names are what reveal
  // which video is on the runner right now.
  const live = runs.filter(
    (run) => run.status !== "completed" && run.name.startsWith("Render"),
  );
  const inFlight: RenderInFlight[] = [];
  for (const run of live) {
    const jobs = await listJobs(run.id).catch(() => []);
    for (const job of jobs) {
      const active = job.steps?.find((step) => step.status === "in_progress");
      inFlight.push({
        runId: run.id,
        runNumber: run.run_number,
        startedAt: run.run_started_at ?? run.created_at,
        step: active?.name ?? job.name,
        jobStatus: job.status,
      });
    }
  }

  const byId = new Map<string, LibraryVideo>();

  // Archive first, then let the buffer overwrite: a buffered entry carries the
  // review state, which is the more useful thing to show when both exist.
  for (const video of manifest) {
    byId.set(video.id, {
      id: video.id,
      week: video.week,
      template: video.template,
      url: video.url,
      bytes: video.bytes,
      durationSeconds: video.durationSeconds ?? null,
      sha256: video.sha256,
      at: video.archivedAt,
      stage: posted.has(video.id) ? "published" : "archived",
      approval: null,
    });
  }

  for (const entry of buffer) {
    byId.set(entry.id, {
      id: entry.id,
      week: entry.week,
      template: entry.template,
      url: entry.url,
      bytes: entry.bytes ?? 0,
      durationSeconds: entry.durationSeconds ?? null,
      sha256: entry.sha256 ?? "",
      at: entry.renderedAt ?? "",
      stage: "review",
      approval: approvalOf(entry),
    });
  }

  return {
    videos: [...byId.values()].sort((a, b) => (a.at < b.at ? 1 : -1)),
    inFlight,
    footprint,
    published: posted.size,
  };
}

export default async function VideosPage() {
  let data;
  try {
    data = await load();
  } catch (error) {
    return (
      <ErrorNote
        title="Could not read the video library"
        detail={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  const { videos, inFlight, footprint, published } = data;
  const awaiting = videos.filter((video) => video.stage === "review").length;
  const totalSeconds = videos.reduce((sum, video) => sum + (video.durationSeconds ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <Grid min="200px">
        <StatTile
          label="Rendering now"
          value={inFlight.length}
          hint={inFlight.length ? "live on a runner" : "no batch in flight"}
          status={
            inFlight.length > 0 ? <StatusPill role="running" label="Live" /> : undefined
          }
        />
        <StatTile
          label="Awaiting review"
          value={awaiting}
          hint={awaiting ? "rendered, not yet posted" : "review queue empty"}
          status={awaiting > 0 ? <StatusPill role="warning" label="Needs you" /> : undefined}
        />
        <StatTile label="Published" value={published} hint={`${videos.length} in the library`} />
        <StatTile
          label="Storage"
          value={formatBytes(footprint.bytes)}
          hint={`${footprint.assets} masters · ${Math.round(totalSeconds)}s total`}
        />
      </Grid>

      <VideoLibrary videos={videos} inFlight={inFlight} />
    </div>
  );
}
