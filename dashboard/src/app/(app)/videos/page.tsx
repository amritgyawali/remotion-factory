import { VideoGrid } from "@/components/VideoGrid";
import { StatusPill } from "@/components/Status";
import { EmptyState, ErrorNote, Grid, StatTile } from "@/components/ui";
import { archiveFootprint, loadManifest } from "@/lib/factory";
import { formatBytes } from "@/lib/format";

export const revalidate = 0;

export default async function VideosPage() {
  let videos;
  let footprint;
  try {
    [videos, footprint] = await Promise.all([loadManifest(), archiveFootprint()]);
  } catch (error) {
    return (
      <ErrorNote
        title="Could not read the archive"
        detail={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  if (videos.length === 0) {
    return (
      <EmptyState
        title="Nothing archived yet"
        detail="archive/manifest.json is empty or missing. It fills in as the publish workflow uploads each master to that week's GitHub Release."
      />
    );
  }

  const totalSeconds = videos.reduce((sum, video) => sum + (video.durationSeconds ?? 0), 0);
  const templates = new Set(videos.map((video) => video.template));

  return (
    <div className="flex flex-col gap-4">
      <Grid min="200px">
        <StatTile label="Videos archived" value={videos.length} hint={`${templates.size} templates used`} />
        <StatTile label="Total runtime" value={`${Math.round(totalSeconds)}s`} hint="excluding the end card" />
        <StatTile
          label="Release storage"
          value={formatBytes(footprint.bytes)}
          hint={`${footprint.assets} assets across ${footprint.releases} releases`}
        />
        <StatTile
          label="Fingerprints"
          value={videos.filter((video) => video.sha256).length}
          hint="every master is hashed and checked for uniqueness"
          status={<StatusPill role="good" label="Verified" />}
        />
      </Grid>

      <VideoGrid videos={videos} />
    </div>
  );
}
