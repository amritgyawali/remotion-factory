"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Card } from "./ui";

/**
 * The one place a human starts a run.
 *
 * A live publish is not undoable — it puts a video in front of real accounts —
 * so it is a deliberate two-step: choose the mode, then confirm. A dry run is
 * harmless and stays one click.
 */
export function TriggerPanel({ due, queueEmpty }: { due: boolean; queueEmpty: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function dispatch(dryRun: boolean, force: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dispatch", workflow: "publish-next.yml", dryRun, force }),
      });
      const body = (await response.json()) as { note?: string; error?: string };

      if (!response.ok) {
        setMessage({ tone: "bad", text: body.error ?? `Failed with ${response.status}` });
        return;
      }
      setMessage({ tone: "good", text: body.note ?? "Dispatched." });
      setConfirming(false);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage({ tone: "bad", text: error instanceof Error ? error.message : "Network error" });
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || pending;

  return (
    <Card title="Run now">
      <div className="flex flex-col gap-3">
        <p className="text-xs secondary">
          A dry run renders the next item and touches neither Postiz nor{" "}
          <code>state.json</code>. A live run publishes it and advances the queue.
        </p>

        <button
          type="button"
          className="btn justify-center"
          disabled={disabled}
          onClick={() => void dispatch(true, false)}
        >
          {busy ? "Dispatching…" : "Dry run"}
        </button>

        {confirming ? (
          <div
            className="flex flex-col gap-2 rounded-lg border p-3"
            style={{ borderColor: "var(--color-status-serious)" }}
          >
            <p className="text-xs">
              This renders and sends the next item to Postiz, then commits{" "}
              <code>state.json</code>. {queueEmpty ? "The queue is empty — nothing will be sent." : null}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary flex-1 justify-center"
                disabled={disabled}
                onClick={() => void dispatch(false, !due)}
              >
                {busy ? "Dispatching…" : due ? "Publish next" : "Publish now (override gap)"}
              </button>
              <button type="button" className="btn" disabled={disabled} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn justify-center"
            disabled={disabled || queueEmpty}
            onClick={() => setConfirming(true)}
            title={queueEmpty ? "The queue is empty" : undefined}
          >
            Publish next…
          </button>
        )}

        {!due && !confirming ? (
          <p className="text-xs muted">
            Not due yet. A manual publish overrides the gap, which will shift the following slots.
          </p>
        ) : null}

        {message ? (
          <p
            role="status"
            className="flex items-start gap-2 text-xs"
            style={{
              color: message.tone === "good" ? "var(--color-status-good)" : "var(--color-status-critical)",
            }}
          >
            <span aria-hidden="true">{message.tone === "good" ? "●" : "✕"}</span>
            <span className="secondary">{message.text}</span>
          </p>
        ) : null}
      </div>
    </Card>
  );
}
