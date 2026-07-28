import type { RunConclusion, RunStatus } from "@/lib/github";

/**
 * Status is never colour alone: every pill carries a glyph and a word as well.
 * Two of the four status colours sit below 3:1 on the light surface by design,
 * and colour-blind readers cannot separate warning from good — the icon and
 * the label are what actually carry the state.
 */

export type StatusRole = "good" | "warning" | "serious" | "critical" | "neutral" | "running";

const ROLE_STYLE: Record<StatusRole, { color: string; glyph: string }> = {
  good: { color: "var(--color-status-good)", glyph: "●" },
  warning: { color: "var(--color-status-warning)", glyph: "▲" },
  serious: { color: "var(--color-status-serious)", glyph: "▲" },
  critical: { color: "var(--color-status-critical)", glyph: "✕" },
  running: { color: "var(--color-series-1)", glyph: "◐" },
  neutral: { color: "var(--ink-muted)", glyph: "○" },
};

export function runRole(status: RunStatus, conclusion: RunConclusion): StatusRole {
  if (status !== "completed") return "running";
  switch (conclusion) {
    case "success":
      return "good";
    case "failure":
      return "critical";
    case "timed_out":
      return "serious";
    case "cancelled":
    case "stale":
      return "warning";
    case "skipped":
    case "neutral":
      return "neutral";
    case "action_required":
      return "serious";
    default:
      return "neutral";
  }
}

export function runLabel(status: RunStatus, conclusion: RunConclusion): string {
  if (status === "in_progress") return "Running";
  if (status === "queued" || status === "pending" || status === "requested") return "Queued";
  if (status === "waiting") return "Waiting";
  if (!conclusion) return "Unknown";
  return conclusion.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function StatusPill({
  role,
  label,
  title,
}: {
  role: StatusRole;
  label: string;
  title?: string;
}) {
  const { color, glyph } = ROLE_STYLE[role];
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ borderColor: "var(--hairline)" }}
    >
      <span aria-hidden="true" style={{ color }} className={role === "running" ? "animate-pulse" : undefined}>
        {glyph}
      </span>
      <span>{label}</span>
    </span>
  );
}

export function StatusDot({ role, label }: { role: StatusRole; label: string }) {
  const { color, glyph } = ROLE_STYLE[role];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span aria-hidden="true" style={{ color }}>
        {glyph}
      </span>
      <span className="sr-only">{label}: </span>
    </span>
  );
}
