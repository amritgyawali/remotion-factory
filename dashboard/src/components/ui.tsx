import type { ReactNode } from "react";

/**
 * The small set of shapes every page is built from. Kept deliberately plain:
 * a control plane earns trust by being legible, and each extra decorative
 * layer is one more thing between the operator and the number they came for.
 */

export function Card({
  title,
  action,
  children,
  dense,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  dense?: boolean;
}) {
  return (
    <section className="surface">
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className={dense ? "" : "p-4"}>{children}</div>
    </section>
  );
}

/**
 * A single headline number. This is the right form when the answer is one
 * value — a chart of one number is a chart doing nothing.
 */
export function StatTile({
  label,
  value,
  hint,
  status,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <div className="surface flex flex-col gap-1 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium tracking-wide uppercase muted">{label}</span>
        {status}
      </div>
      <span className="text-2xl leading-tight font-semibold">{value}</span>
      {hint ? <span className="text-xs secondary">{hint}</span> : null}
    </div>
  );
}

/**
 * Proportion of a known whole. One hue, light→dark, filled from the baseline
 * with a rounded data-end and a surface gap against the track.
 */
export function Meter({
  value,
  max,
  label,
  caption,
  tone = "var(--color-series-1)",
}: {
  value: number;
  max: number;
  label: string;
  caption?: string;
  tone?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="secondary">{label}</span>
        {caption ? <span className="muted tabular">{caption}</span> : null}
      </div>
      <div
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: "var(--grid)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: tone,
            // The 2px surface gap that keeps the fill from fusing with the track.
            boxShadow: pct > 0 && pct < 100 ? "2px 0 0 0 var(--surface)" : undefined,
          }}
        />
      </div>
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {detail ? <p className="max-w-md text-xs secondary">{detail}</p> : null}
    </div>
  );
}

/**
 * Failure is shown, never swallowed. Every page that talks to GitHub or Postiz
 * renders this instead of collapsing, so one bad credential cannot take the
 * whole dashboard down.
 */
export function ErrorNote({ title, detail }: { title: string; detail?: string }) {
  return (
    <div
      className="surface flex flex-col gap-1 p-4"
      style={{ borderColor: "var(--color-status-critical)" }}
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden="true" style={{ color: "var(--color-status-critical)" }}>
          ✕
        </span>
        {title}
      </p>
      {detail ? <p className="text-xs secondary break-words">{detail}</p> : null}
    </div>
  );
}

export function Grid({ children, min = "220px" }: { children: ReactNode; min?: string }) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}, 100%), 1fr))` }}
    >
      {children}
    </div>
  );
}
