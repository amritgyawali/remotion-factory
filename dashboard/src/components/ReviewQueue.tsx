"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusPill } from "./Status";
import { Card, EmptyState } from "./ui";
import { approvalOf, type BufferEntry } from "@/lib/buffer";
import { formatBytes, formatSeconds, relativeTime } from "@/lib/format";

/**
 * The review step between rendering and posting.
 *
 * A video renders in the morning and sits here until someone watches it and
 * decides. Approving makes it eligible for the next publish slot; rejecting
 * holds it back permanently; discarding drops the pointer so the next batch
 * renders it again — the master stays in its Release either way, so a mistaken
 * discard costs one re-render and nothing else.
 */
export function ReviewQueue({
  entries,
  approvalRequired,
}: {
  entries: BufferEntry[];
  approvalRequired: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);

  async function act(id: string, action: "approve" | "reject" | "discard") {
    setBusy(`${id}:${action}`);
    setError(null);
    try {
      const response = await fetch("/api/buffer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? `Failed with ${response.status}`);
        return;
      }
      setConfirmDiscard(null);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(null);
    }
  }

  if (entries.length === 0) {
    return (
      <Card title="Waiting for review">
        <EmptyState
          title="Nothing rendered is waiting"
          detail="The morning batch renders the next four videos at 09:30 Kathmandu. They appear here for review before anything reaches Postiz."
        />
      </Card>
    );
  }

  const awaiting = entries.filter((entry) => approvalOf(entry) === "pending").length;

  return (
    <Card
      title={`Waiting for review — ${entries.length}`}
      action={
        awaiting > 0 && approvalRequired ? (
          <StatusPill role="warning" label={`${awaiting} need a decision`} />
        ) : null
      }
      dense
    >
      {error ? (
        <p
          role="alert"
          className="border-b px-4 py-2 text-xs"
          style={{ color: "var(--color-status-critical)" }}
        >
          {error}
        </p>
      ) : null}

      <ul>
        {entries.map((entry) => {
          const approval = approvalOf(entry);
          const disabled = busy !== null || pending;

          return (
            <li key={entry.id} className="border-b p-4 last:border-b-0">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div
                  className="w-full shrink-0 overflow-hidden rounded-lg sm:w-40"
                  style={{ aspectRatio: "9 / 16", background: "var(--plane)" }}
                >
                  {playing === entry.id ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption -- no dialogue by design
                    <video
                      src={entry.url}
                      controls
                      autoPlay
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPlaying(entry.id)}
                      aria-label={`Play ${entry.id}`}
                      className="flex h-full w-full flex-col items-center justify-center gap-2 transition-colors hover:bg-[var(--wash)]"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 items-center justify-center rounded-full text-sm"
                        style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
                      >
                        ▶
                      </span>
                      <span className="text-xs muted">{formatSeconds(entry.durationSeconds)}</span>
                    </button>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-sm font-semibold">{entry.id}</code>
                    <span className="text-xs muted">{entry.template}</span>
                    <span className="text-xs muted">· {entry.week}</span>
                    {approval === "approved" ? (
                      <StatusPill role="good" label="Approved" />
                    ) : approval === "rejected" ? (
                      <StatusPill role="critical" label="Rejected" />
                    ) : (
                      <StatusPill role="warning" label="Needs review" />
                    )}
                  </div>

                  <p className="text-xs muted tabular">
                    {formatBytes(entry.bytes ?? 0)} · rendered {relativeTime(entry.renderedAt)}
                    {entry.reviewedAt ? ` · reviewed ${relativeTime(entry.reviewedAt)}` : ""}
                  </p>

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={disabled || approval === "approved"}
                      onClick={() => void act(entry.id, "approve")}
                      title={
                        approvalRequired
                          ? "Makes this eligible for the next publish slot"
                          : "Approval is off, so this publishes regardless — this only records the decision"
                      }
                    >
                      {busy === `${entry.id}:approve` ? "Approving…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={disabled || approval === "rejected"}
                      onClick={() => void act(entry.id, "reject")}
                      title="Holds it back; it will never be published"
                    >
                      {busy === `${entry.id}:reject` ? "Rejecting…" : "Reject"}
                    </button>

                    {confirmDiscard === entry.id ? (
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          className="btn"
                          style={{ borderColor: "var(--color-status-critical)" }}
                          disabled={disabled}
                          onClick={() => void act(entry.id, "discard")}
                        >
                          {busy === `${entry.id}:discard` ? "Discarding…" : "Confirm discard"}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          disabled={disabled}
                          onClick={() => setConfirmDiscard(null)}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        disabled={disabled}
                        onClick={() => setConfirmDiscard(entry.id)}
                        title="Drops it from the buffer so the next batch renders it again"
                      >
                        Discard & re-render
                      </button>
                    )}

                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-xs"
                      style={{ color: "var(--accent)" }}
                    >
                      Download
                    </a>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {!approvalRequired ? (
        <p className="border-t px-4 py-2 text-xs muted">
          <code>REQUIRE_APPROVAL=0</code> is set on the workflow, so videos publish without waiting
          for a decision here. These buttons still record one.
        </p>
      ) : null}
    </Card>
  );
}
