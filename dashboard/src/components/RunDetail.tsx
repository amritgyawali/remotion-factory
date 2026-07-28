"use client";

import { useCallback, useEffect, useState } from "react";
import { LogViewer } from "./LogViewer";
import { StatusPill, runLabel, runRole } from "./Status";
import { Card } from "./ui";
import type { WorkflowJob, WorkflowRun } from "@/lib/github";
import { formatDateTime, formatDuration, relativeTime, shortSha } from "@/lib/format";

/**
 * A live view of one run. While the run is in flight it re-polls, so the step
 * list fills in without a reload; once it settles the polling stops rather
 * than burning a serverless invocation every few seconds for no reason.
 */
export function RunDetail({
  initialRun,
  initialJobs,
}: {
  initialRun: WorkflowRun;
  initialJobs: WorkflowJob[];
}) {
  const [run, setRun] = useState(initialRun);
  const [jobs, setJobs] = useState(initialJobs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = run.status !== "completed";

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/runs/${run.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { run: WorkflowRun; jobs: WorkflowJob[] };
      setRun(body.run);
      setJobs(body.jobs);
    } catch {
      /* a dropped poll is not worth surfacing; the next one will land */
    }
  }, [run.id]);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => void refresh(), 6000);
    return () => clearInterval(timer);
  }, [live, refresh]);

  async function act(action: "rerun" | "cancel") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, runId: run.id }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        setError(body.error ?? `Failed with ${response.status}`);
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="surface flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-semibold tracking-tight">{run.name}</h1>
            <span className="text-xs muted tabular">#{run.run_number}</span>
            <StatusPill role={runRole(run.status, run.conclusion)} label={runLabel(run.status, run.conclusion)} />
          </div>
          <p className="text-xs secondary">
            {run.event} · {shortSha(run.head_sha)} · started{" "}
            <span title={formatDateTime(run.run_started_at ?? run.created_at)}>
              {relativeTime(run.run_started_at ?? run.created_at)}
            </span>{" "}
            · took {formatDuration(run.run_started_at ?? run.created_at, run.status === "completed" ? run.updated_at : null)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {live ? (
            <button type="button" className="btn" disabled={busy} onClick={() => void act("cancel")}>
              Cancel run
            </button>
          ) : run.conclusion === "failure" ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act("rerun")}>
              Re-run failed jobs
            </button>
          ) : null}
          <a href={run.html_url} target="_blank" rel="noreferrer" className="btn">
            Open on GitHub
          </a>
        </div>
      </div>

      {error ? (
        <p className="text-xs" style={{ color: "var(--color-status-critical)" }} role="alert">
          {error}
        </p>
      ) : null}

      {live ? (
        <p className="text-xs muted" aria-live="polite">
          Live — refreshing every 6 seconds.
        </p>
      ) : null}

      {jobs.map((job) => (
        <Card
          key={job.id}
          title={job.name}
          action={
            <StatusPill role={runRole(job.status, job.conclusion)} label={runLabel(job.status, job.conclusion)} />
          }
          dense
        >
          <ol className="border-b">
            {(job.steps ?? []).map((step) => (
              <li
                key={`${job.id}-${step.number}`}
                className="flex items-center justify-between gap-3 border-b px-4 py-1.5 last:border-b-0"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-6 shrink-0 text-xs muted tabular">{step.number}</span>
                  <span
                    className="truncate text-sm"
                    style={{ color: step.conclusion === "skipped" ? "var(--ink-muted)" : undefined }}
                  >
                    {step.name}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-xs muted tabular">
                    {formatDuration(step.started_at, step.completed_at)}
                  </span>
                  <StatusPill role={runRole(step.status, step.conclusion)} label={runLabel(step.status, step.conclusion)} />
                </span>
              </li>
            ))}
          </ol>
          <LogViewer jobId={job.id} failed={job.conclusion === "failure"} />
        </Card>
      ))}
    </div>
  );
}
