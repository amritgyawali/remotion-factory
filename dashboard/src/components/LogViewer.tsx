"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Raw job logs, fetched on demand.
 *
 * A failed job opens itself — the whole point of this dashboard is that the
 * reason for a failure should be in front of you, not three clicks away. A
 * successful job stays collapsed, because its log is 4000 lines of apt output
 * and nobody wants it by default.
 */
export function LogViewer({ jobId, failed }: { jobId: number; failed: boolean }) {
  const [open, setOpen] = useState(failed);
  const [log, setLog] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(failed);
  const requested = useRef(false);

  useEffect(() => {
    if (!open || requested.current) return;
    requested.current = true;

    void (async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/jobs/${jobId}/logs`, { cache: "no-store" });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? `Could not load logs (${response.status})`);
          return;
        }
        setLog(await response.text());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, jobId]);

  const lines = useMemo(() => {
    if (!log) return [];
    const all = log.split(/\r?\n/);
    const needle = filter.trim().toLowerCase();

    return all
      .map((text, index) => ({ text, index, problem: isProblem(text) }))
      .filter((line) => {
        if (onlyProblems && !line.problem) return false;
        if (needle && !line.text.toLowerCase().includes(needle)) return false;
        return line.text.trim().length > 0;
      });
  }, [log, filter, onlyProblems]);

  const problemCount = useMemo(
    () => (log ? log.split(/\r?\n/).filter(isProblem).length : 0),
    [log],
  );

  return (
    <div className="border-t">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-xs font-medium transition-colors hover:bg-[var(--wash)]"
      >
        <span className="secondary">{open ? "Hide log" : "Show log"}</span>
        <span className="muted" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open ? (
        <div className="flex flex-col gap-2 px-4 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter lines…"
              aria-label="Filter log lines"
              className="field max-w-56 py-1 text-xs"
            />
            <label className="flex items-center gap-1.5 text-xs secondary">
              <input
                type="checkbox"
                checked={onlyProblems}
                onChange={(event) => setOnlyProblems(event.target.checked)}
              />
              Errors and warnings only
              {problemCount > 0 ? <span className="muted tabular">({problemCount})</span> : null}
            </label>
            {log ? (
              <a
                href={`/api/jobs/${jobId}/logs`}
                download={`job-${jobId}.log`}
                className="ml-auto text-xs"
                style={{ color: "var(--accent)" }}
              >
                Download raw
              </a>
            ) : null}
          </div>

          {loading ? <p className="text-xs muted">Loading…</p> : null}
          {error ? (
            <p className="text-xs" style={{ color: "var(--color-status-serious)" }}>
              {error}
            </p>
          ) : null}

          {log && lines.length === 0 ? (
            <p className="text-xs muted">Nothing matches that filter.</p>
          ) : null}

          {lines.length > 0 ? (
            <pre
              className="scroll-x max-h-[28rem] overflow-y-auto rounded-lg p-3 font-mono text-[11px] leading-relaxed"
              style={{ background: "var(--plane)" }}
            >
              {lines.map((line) => (
                <div
                  key={line.index}
                  className="whitespace-pre"
                  style={{ color: line.problem ? "var(--color-status-serious)" : undefined }}
                >
                  {stripTimestamp(line.text)}
                </div>
              ))}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Actions prefixes every line with an ISO timestamp; it wastes half the width. */
function stripTimestamp(line: string): string {
  return line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s?/, "");
}

function isProblem(line: string): boolean {
  return (
    line.includes("##[error]") ||
    line.includes("##[warning]") ||
    /\berror\b/i.test(line) ||
    /\bwarning\b/i.test(line) ||
    line.includes("FAILED") ||
    line.includes("Process completed with exit code")
  );
}
