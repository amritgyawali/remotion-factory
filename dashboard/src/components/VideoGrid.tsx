"use client";

import { useMemo, useState } from "react";
import { Card } from "./ui";
import type { ArchiveEntry } from "@/lib/factory";
import { formatBytes, formatDateTime, formatSeconds } from "@/lib/format";

/**
 * The archive, playable.
 *
 * Videos stream straight from their Release asset URL rather than through a
 * serverless proxy: the masters are megabytes each, a Hobby function would be
 * a pointless bottleneck, and a plain <video src> needs no CORS grant.
 * Nothing is preloaded — metadata only, until the operator presses play.
 */
export function VideoGrid({ videos }: { videos: ArchiveEntry[] }) {
  const [week, setWeek] = useState<string>("all");
  const [template, setTemplate] = useState<string>("all");
  const [playing, setPlaying] = useState<string | null>(null);

  const weeks = useMemo(() => [...new Set(videos.map((v) => v.week))].sort(), [videos]);
  const templates = useMemo(() => [...new Set(videos.map((v) => v.template))].sort(), [videos]);

  const filtered = useMemo(
    () =>
      videos
        .filter((video) => (week === "all" || video.week === week) && (template === "all" || video.template === template))
        .sort((a, b) => (a.archivedAt < b.archivedAt ? 1 : -1)),
    [videos, week, template],
  );

  return (
    <Card
      title={`Archive — ${filtered.length} video${filtered.length === 1 ? "" : "s"}`}
      action={
        <div className="flex items-center gap-2">
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
          <select
            value={template}
            onChange={(event) => setTemplate(event.target.value)}
            className="field w-auto py-1 text-xs"
            aria-label="Filter by template"
          >
            <option value="all">All templates</option>
            {templates.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      }
    >
      <ul
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))" }}
      >
        {filtered.map((video) => (
          <li key={video.id} className="surface flex flex-col overflow-hidden">
            <div
              className="relative flex items-center justify-center"
              style={{ aspectRatio: "9 / 16", background: "var(--plane)" }}
            >
              {playing === video.id ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption -- no dialogue: these videos have no speech by design
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
                  className="flex h-full w-full flex-col items-center justify-center gap-2 transition-colors hover:bg-[var(--wash)]"
                  aria-label={`Play ${video.id}`}
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

            <div className="flex flex-col gap-1 border-t p-3">
              <div className="flex items-center justify-between gap-2">
                <code className="truncate text-sm font-medium">{video.id}</code>
                <span className="shrink-0 text-xs muted">{video.template}</span>
              </div>
              <p className="text-xs muted tabular">
                {formatBytes(video.bytes)} · {video.week}
              </p>
              <p className="text-xs muted">{formatDateTime(video.archivedAt)}</p>
              <div className="flex items-center gap-3 pt-1">
                <a
                  href={video.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs"
                  style={{ color: "var(--accent)" }}
                >
                  Download
                </a>
                <span className="truncate font-mono text-[10px] muted" title={video.sha256}>
                  {video.sha256?.slice(0, 12)}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
