"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { StatusPill } from "./Status";
import { Card, EmptyState } from "./ui";
import { STAGE_LABEL, type LibraryVideo, type RenderInFlight, type Stage } from "@/lib/library";
import { formatBytes, formatDateTime, formatDuration, formatSeconds, relativeTime } from "@/lib/format";

/**
 * The whole library: rendering now, awaiting review, archived and published.
 *
 * Masters stream and download straight from their Release asset URL rather
 * than through a serverless function. They are megabytes each, a Hobby
 * function would be a pointless bottleneck, and a plain <video src> needs no
 * CORS grant. The file offered is the master itself — the same bytes the
 * publisher sends to Postiz, at full quality, not a re-encode.
 */
export function VideoLibrary({
  videos,
  inFlight,
}: {
  videos: LibraryVideo[];
  inFlight: RenderInFlight[];
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage | "all">("all");
  const [week, setWeek] = useState("all");
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);

  // While a batch is on a runner the page is stale the moment it renders, so
  // it refreshes itself. Only while something is actually in flight — polling
  // an idle factory would burn invocations for no new information.
  useEffect(() => {
    if (inFlight.length === 0) return;
    const timer = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(timer);
  }, [inFlight.length, router]);

  const weeks = useMemo(() => [...new Set(videos.map((video) => video.week))].sort(), [videos]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return videos.filter((video) => {
      if (stage !== "all" && video.stage !== stage) return false;
      if (week !== "all" && video.week !== week) return false;
      if (needle && !`${video.id} ${video.template}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [videos, stage, week, query]);

  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const video of videos) tally[video.stage] = (tally[video.stage] ?? 0) + 1;
    return tally;
  }, [videos]);

  return (
    <div className="flex flex-col gap-4">
      {inFlight.length > 0 ? (
        <Card title="Rendering now" dense>
          <ul>
            {inFlight.map((render) => (
              <li
                key={`${render.runId}-${render.step}`}
                className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2">
                    <StatusPill role="running" label="Live" />
                    <span className="truncate text-sm font-medium">{render.step}</span>
                  </span>
                  <span className="text-xs muted">
                    Render batch #{render.runNumber} · running{" "}
                    {formatDuration(render.startedAt, null)}
                  </span>
                </span>
                <a
                  href={`/runs/${render.runId}`}
                  className="text-xs"
                  style={{ color: "var(--accent)" }}
                >
                  Watch the run →
                </a>
              </li>
            ))}
          </ul>
          <p className="border-t px-4 py-2 text-xs muted">
            Refreshing every 15 seconds while a batch is in flight. Videos appear below as each
            render finishes and uploads.
          </p>
        </Card>
      ) : null}

      <Card
        title={`Library — ${filtered.length} of ${videos.length}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find by id or template…"
              aria-label="Search videos"
              className="field w-auto py-1 text-xs"
            />
            <select
              value={stage}
              onChange={(event) => setStage(event.target.value as Stage | "all")}
              className="field w-auto py-1 text-xs"
              aria-label="Filter by stage"
            >
              <option value="all">All stages</option>
              {(["review", "archived", "published"] as Stage[]).map((value) => (
                <option key={value} value={value}>
                  {STAGE_LABEL[value]} ({counts[value] ?? 0})
                </option>
              ))}
            </select>
            <select
              value={week}
              onChange={(event) => setWeek(event.target.value)}
              className="field w-auto py-1 text-xs"
              aria-label="Filter by week"
            >
              <option value="all">All weeks</option>
              {weeks.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            title="Nothing matches"
            detail={
              videos.length === 0
                ? "No videos yet. The morning batch renders the first four at 09:30 Kathmandu."
                : "Try a wider filter."
            }
          />
        ) : (
          <ul
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(230px, 100%), 1fr))" }}
          >
            {filtered.map((video) => (
              <li key={video.id} className="surface flex flex-col overflow-hidden">
                <div
                  className="relative flex items-center justify-center"
                  style={{ aspectRatio: "9 / 16", background: "var(--plane)" }}
                >
                  {playing === video.id ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption -- no dialogue by design
                    <video
                      src={video.url}
                      controls
                      autoPlay
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPlaying(video.id)}
                      aria-label={`Play ${video.id}`}
                      className="flex h-full w-full flex-col items-center justify-center gap-2 transition-colors hover:bg-[var(--wash)]"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-11 w-11 items-center justify-center rounded-full text-sm"
                        style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
                      >
                        ▶
                      </span>
                      <span className="text-xs muted">{formatSeconds(video.durationSeconds)}</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-1 border-t p-3">
                  <div className="flex items-center justify-between gap-2">
                    <code className="truncate text-sm font-medium">{video.id}</code>
                    <span className="shrink-0 text-xs muted">{video.template}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 py-0.5">
                    {video.stage === "published" ? (
                      <StatusPill role="good" label="Published" />
                    ) : video.stage === "review" ? (
                      video.approval === "approved" ? (
                        <StatusPill role="good" label="Approved" />
                      ) : video.approval === "rejected" ? (
                        <StatusPill role="critical" label="Rejected" />
                      ) : (
                        <StatusPill role="warning" label="Needs review" />
                      )
                    ) : (
                      <StatusPill role="neutral" label="Archived" />
                    )}
                    <span className="text-xs muted">{video.week}</span>
                  </div>

                  <p className="text-xs muted tabular">
                    {formatBytes(video.bytes)} · 1080×1920
                  </p>
                  <p className="text-xs muted" title={formatDateTime(video.at)}>
                    {relativeTime(video.at)}
                  </p>

                  <div className="mt-auto flex items-center gap-3 pt-1.5">
                    <a
                      href={video.url}
                      download={`${video.id}.mp4`}
                      className="text-xs"
                      style={{ color: "var(--accent)" }}
                      title="The master itself, full quality — not a re-encode"
                    >
                      Download master
                    </a>
                    {video.sha256 ? (
                      <span
                        className="truncate font-mono text-[10px] muted"
                        title={`sha256 ${video.sha256}`}
                      >
                        {video.sha256.slice(0, 10)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
