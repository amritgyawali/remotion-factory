"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ItemFields } from "./ItemFields";
import { StatusPill } from "./Status";
import { Card, Grid, StatTile } from "./ui";
import {
  countIssues,
  positionLabel,
  templateSpec,
  validatePlan,
  type Issue,
  type PlanItem,
  type WeeklyPlan,
} from "@/lib/plan-schema";

interface WeekFile {
  path: string;
  sha: string;
  plan: WeeklyPlan;
}

/**
 * Edits an accepted week in place.
 *
 * Two properties matter more than convenience here. Validation runs on every
 * keystroke against the same rules the Node validator applies, so a plan that
 * cannot pass CI cannot be saved. And an item already in state.json is locked:
 * the video has shipped, and rewriting its record would leave the archive
 * describing something that was never published.
 */
export function PlanEditor({ weeks, posted }: { weeks: WeekFile[]; posted: string[] }) {
  const router = useRouter();
  const [weekIndex, setWeekIndex] = useState(0);
  const active = weeks[weekIndex];

  const [draft, setDraft] = useState<WeeklyPlan>(() => structuredClone(active!.plan));
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const postedSet = useMemo(() => new Set(posted), [posted]);
  const issues = useMemo(() => validatePlan(draft), [draft]);
  const { errors, warnings } = countIssues(issues);
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(active!.plan),
    [draft, active],
  );

  const byItem = useMemo(() => {
    const map = new Map<number, Issue[]>();
    for (const issue of issues) {
      if (issue.itemIndex === null) continue;
      const list = map.get(issue.itemIndex) ?? [];
      list.push(issue);
      map.set(issue.itemIndex, list);
    }
    return map;
  }, [issues]);

  function switchWeek(index: number) {
    if (dirty && !confirm("Discard unsaved changes to this week?")) return;
    setWeekIndex(index);
    setDraft(structuredClone(weeks[index]!.plan));
    setOpenItem(null);
    setResult(null);
  }

  function updateItem(index: number, next: PlanItem) {
    setDraft((current) => {
      const items = current.items.slice();
      items[index] = next;
      return { ...current, items };
    });
  }

  async function save() {
    setSaving(true);
    setResult(null);
    try {
      const response = await fetch("/api/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: active!.path, sha: active!.sha, plan: draft }),
      });
      const body = (await response.json()) as { error?: string; commit?: string };

      if (!response.ok) {
        setResult({ tone: "bad", text: body.error ?? `Failed with ${response.status}` });
        return;
      }
      setResult({
        tone: "good",
        text: `Committed ${body.commit?.slice(0, 7)}. Accept weekly plan will run on the push.`,
      });
      router.refresh();
    } catch (error) {
      setResult({ tone: "bad", text: error instanceof Error ? error.message : "Network error" });
    } finally {
      setSaving(false);
    }
  }

  const days = useMemo(() => {
    const grouped: { day: number; items: { item: PlanItem; index: number }[] }[] = [];
    draft.items.forEach((item, index) => {
      const day = Math.floor(index / 4) + 1;
      let bucket = grouped.find((entry) => entry.day === day);
      if (!bucket) {
        bucket = { day, items: [] };
        grouped.push(bucket);
      }
      bucket.items.push({ item, index });
    });
    return grouped;
  }, [draft.items]);

  return (
    <div className="flex flex-col gap-4">
      <Grid min="200px">
        <StatTile label="Week" value={draft.week?.id ?? "—"} hint={`order ${draft.week?.order ?? "—"}`} />
        <StatTile
          label="Items"
          value={draft.items.length}
          hint="a weekly queue is exactly 28"
          status={
            draft.items.length === 28 ? (
              <StatusPill role="good" label="Complete" />
            ) : (
              <StatusPill role="critical" label="Wrong count" />
            )
          }
        />
        <StatTile
          label="Validation"
          value={errors === 0 ? "Passes" : `${errors} error${errors === 1 ? "" : "s"}`}
          hint={warnings > 0 ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "no warnings"}
          status={
            errors > 0 ? (
              <StatusPill role="critical" label="Blocked" />
            ) : warnings > 0 ? (
              <StatusPill role="warning" label="Warnings" />
            ) : (
              <StatusPill role="good" label="Clean" />
            )
          }
        />
        <StatTile
          label="Post type"
          value={draft.postType}
          hint={draft.postType === "draft" ? "queued into Postiz for review" : "publishes on render"}
          status={draft.postType === "now" ? <StatusPill role="serious" label="Live" /> : undefined}
        />
      </Grid>

      <Card
        title="Week"
        action={
          <div className="flex items-center gap-2">
            {weeks.length > 1 ? (
              <select
                value={weekIndex}
                onChange={(event) => switchWeek(Number(event.target.value))}
                className="field w-auto py-1 text-xs"
                aria-label="Week"
              >
                {weeks.map((week, index) => (
                  <option key={week.path} value={index}>
                    {week.plan.week?.id ?? week.path}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              disabled={!dirty || errors > 0 || saving}
              onClick={() => void save()}
              title={
                errors > 0
                  ? "Fix the errors first — an invalid plan fails inside a workflow run instead"
                  : !dirty
                    ? "No changes"
                    : undefined
              }
            >
              {saving ? "Committing…" : "Commit to branch"}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wide uppercase muted">Post type</span>
            <select
              value={draft.postType}
              onChange={(event) =>
                setDraft((current) => ({ ...current, postType: event.target.value as WeeklyPlan["postType"] }))
              }
              className="field w-auto"
            >
              <option value="draft">draft — queue into Postiz for review</option>
              <option value="now">now — publish immediately after each render</option>
            </select>
          </label>
          <p className="text-xs muted">
            Changing the post type is allowed mid-week. Item content is frozen once its id appears in{" "}
            <code>state.json</code>.
          </p>

          {result ? (
            <p
              role="status"
              className="text-xs"
              style={{
                color: result.tone === "good" ? "var(--color-status-good)" : "var(--color-status-critical)",
              }}
            >
              {result.text}
            </p>
          ) : null}
        </div>
      </Card>

      {issues.some((issue) => issue.itemIndex === null) ? (
        <Card title="Plan-level problems">
          <ul className="flex flex-col gap-1 text-xs">
            {issues
              .filter((issue) => issue.itemIndex === null)
              .map((issue, n) => (
                <li key={n} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    style={{
                      color:
                        issue.level === "error"
                          ? "var(--color-status-critical)"
                          : "var(--color-status-warning)",
                    }}
                  >
                    {issue.level === "error" ? "✕" : "▲"}
                  </span>
                  <span className="secondary">{issue.message}</span>
                </li>
              ))}
          </ul>
        </Card>
      ) : null}

      {days.map(({ day, items }) => (
        <Card key={day} title={`Day ${day}`} dense>
          <ul>
            {items.map(({ item, index }) => {
              const locked = postedSet.has(item.id);
              const itemIssues = byItem.get(index) ?? [];
              const itemErrors = itemIssues.filter((issue) => issue.level === "error").length;
              const expanded = openItem === item.id;

              return (
                <li key={item.id || index} className="border-b last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setOpenItem(expanded ? null : item.id)}
                    aria-expanded={expanded}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--wash)]"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-2">
                        <code className="text-sm font-medium">{item.id}</code>
                        <span className="text-xs muted">{item.template}</span>
                      </span>
                      <span className="truncate text-xs secondary">
                        {typeof item.props?.hook === "string"
                          ? String(item.props.hook)
                          : positionLabel(index)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {locked ? <StatusPill role="good" label="Posted" /> : null}
                      {itemErrors > 0 ? (
                        <StatusPill role="critical" label={`${itemErrors}`} title={`${itemErrors} error(s)`} />
                      ) : itemIssues.length > 0 ? (
                        <StatusPill role="warning" label={`${itemIssues.length}`} title="warnings" />
                      ) : null}
                      <span className="muted" aria-hidden="true">
                        {expanded ? "▾" : "▸"}
                      </span>
                    </span>
                  </button>

                  {expanded ? (
                    <div className="border-t px-4 py-3">
                      {locked ? (
                        <p className="mb-3 text-xs" style={{ color: "var(--color-status-warning)" }}>
                          ▲ This item has already been posted. Its content is locked — the archive
                          records what actually shipped.
                        </p>
                      ) : null}
                      <ItemFields
                        item={item}
                        index={index}
                        spec={templateSpec(item.template)}
                        issues={itemIssues}
                        disabled={locked}
                        onChange={(next) => updateItem(index, next)}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
