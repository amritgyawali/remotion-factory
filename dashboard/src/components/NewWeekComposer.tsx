"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ItemFields } from "./ItemFields";
import { StatusPill } from "./Status";
import { Card, Grid, StatTile } from "./ui";
import {
  countIssues,
  expectedPosition,
  templateSpec,
  validatePlan,
  type Issue,
  type PlanItem,
  type WeeklyPlan,
} from "@/lib/plan-schema";

/**
 * Compose a new 28-item week and submit it.
 *
 * It writes plan.json, the inbox — not plans/, the archive. Pushing plan.json
 * is what triggers Accept weekly plan, and that workflow owns the rules this
 * page does not reimplement: cross-week uniqueness and the freeze on a started
 * week. Writing the archive directly would route around both.
 *
 * The scaffold is derived from the current inbox rather than invented, so a
 * new week starts with channels and settings that already validate.
 */

const SLOTS = ["a", "b", "c", "d"] as const;

/** Next ISO week id after the highest accepted one, e.g. "2026-w32". */
function suggestWeekId(highestOrder: number): { id: string; order: number } {
  if (highestOrder > 0) {
    const year = Math.floor(highestOrder / 100);
    const week = highestOrder % 100;
    // Week 52 rolls into the next year rather than producing "w53".
    const next = week >= 52 ? { year: year + 1, week: 1 } : { year, week: week + 1 };
    return {
      id: `${next.year}-w${String(next.week).padStart(2, "0")}`,
      order: next.year * 100 + next.week,
    };
  }
  const now = new Date();
  return { id: `${now.getUTCFullYear()}-w01`, order: now.getUTCFullYear() * 100 + 1 };
}

function scaffold(template: WeeklyPlan | null, week: { id: string; order: number }): WeeklyPlan {
  const compact = week.id.replace("-", "");

  const items: PlanItem[] = Array.from({ length: 28 }, (_, index) => {
    const day = Math.floor(index / 4) + 1;
    const source = template?.items?.[index];
    const position = expectedPosition(index);

    // Props are copied from the same weekly position of the previous week, so
    // every required key for that template is present and the shape validates
    // from the first render. The words are placeholders to be replaced.
    const props = source ? structuredClone(source.props) : {};
    props.day = day;

    return {
      id: position,
      sourceId: `${compact}-${String(index + 1).padStart(2, "0")}`,
      template: source?.template ?? "TechTip",
      caption: `Replace this caption for ${position}.\n\n#MeritByte #BuildBetter #Web`,
      props,
    };
  });

  return {
    series: template?.series ?? "MeritByte — Build Better",
    mode: "queue",
    week,
    postType: "draft",
    channels: template?.channels ?? [],
    channelSettings: template?.channelSettings ?? {},
    items,
  };
}

export function NewWeekComposer({
  highestOrder,
  acceptedIds,
  template,
}: {
  highestOrder: number;
  acceptedIds: string[];
  template: WeeklyPlan | null;
}) {
  const router = useRouter();
  const suggested = useMemo(() => suggestWeekId(highestOrder), [highestOrder]);

  const [plan, setPlan] = useState<WeeklyPlan>(() => scaffold(template, suggested));
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const issues = useMemo(() => validatePlan(plan), [plan]);
  const { errors, warnings } = countIssues(issues);

  const byItem = useMemo(() => {
    const map = new Map<number, Issue[]>();
    for (const issue of issues) {
      if (issue.itemIndex === null) continue;
      map.set(issue.itemIndex, [...(map.get(issue.itemIndex) ?? []), issue]);
    }
    return map;
  }, [issues]);

  function setWeekId(id: string) {
    setPlan((current) => ({ ...current, week: { ...current.week, id } }));
  }

  async function submit() {
    setSaving(true);
    setResult(null);
    try {
      const response = await fetch("/api/new-week", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = (await response.json()) as { error?: string; commit?: string; note?: string };

      if (!response.ok) {
        setResult({ tone: "bad", text: body.error ?? `Failed with ${response.status}` });
        return;
      }
      setResult({
        tone: "good",
        text: `Committed ${body.commit?.slice(0, 7)}. ${body.note ?? ""}`,
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
    plan.items.forEach((item, index) => {
      const day = Math.floor(index / 4) + 1;
      let bucket = grouped.find((entry) => entry.day === day);
      if (!bucket) {
        bucket = { day, items: [] };
        grouped.push(bucket);
      }
      bucket.items.push({ item, index });
    });
    return grouped;
  }, [plan.items]);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/plan" className="text-xs" style={{ color: "var(--accent)" }}>
        ← Accepted weeks
      </Link>

      <Grid min="200px">
        <StatTile label="New week" value={plan.week.id} hint={`order ${plan.week.order}`} />
        <StatTile
          label="Items"
          value={plan.items.length}
          hint="a weekly queue is exactly 28"
          status={
            plan.items.length === 28 ? (
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
            ) : (
              <StatusPill role="good" label="Clean" />
            )
          }
        />
        <StatTile label="Already accepted" value={acceptedIds.length} hint={acceptedIds.join(", ") || "none"} />
      </Grid>

      <Card
        title="Submit"
        action={
          <button
            type="button"
            className="btn btn-primary"
            disabled={errors > 0 || saving}
            onClick={() => void submit()}
            title={errors > 0 ? "Fix the errors first" : "Writes plan.json and triggers acceptance"}
          >
            {saving ? "Committing…" : "Commit plan.json"}
          </button>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex max-w-xs flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wide uppercase muted">Week id</span>
            <input
              type="text"
              value={plan.week.id}
              onChange={(event) => setWeekId(event.target.value)}
              className="field"
            />
          </label>

          <p className="text-xs muted">
            This writes <code>plan.json</code>, the inbox. Pushing it triggers{" "}
            <strong>Accept weekly plan</strong>, which archives it into <code>plans/</code> after
            checking uniqueness against every accepted week. Items are scaffolded from the current
            inbox so each template&rsquo;s required props are already present — replace the words.
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
              .map((issue, index) => (
                <li key={index} className="flex items-start gap-2">
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

      <Card
        title="Paste a whole plan"
        action={
          <button type="button" className="btn" onClick={() => setShowJson((value) => !value)}>
            {showJson ? "Hide" : "Show"}
          </button>
        }
      >
        {showJson ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs muted">
              Faster than 28 forms if the week was written elsewhere. Validated on paste; the fields
              below update to match.
            </p>
            <textarea
              rows={12}
              defaultValue={JSON.stringify(plan, null, 2)}
              onBlur={(event) => {
                try {
                  const parsed = JSON.parse(event.target.value) as WeeklyPlan;
                  setPlan(parsed);
                  setJsonError(null);
                } catch (error) {
                  setJsonError(error instanceof Error ? error.message : "Not valid JSON");
                }
              }}
              className="field font-mono text-xs"
            />
            {jsonError ? (
              <p className="text-xs" style={{ color: "var(--color-status-critical)" }}>
                {jsonError} — the previous plan was kept.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs muted">
            Paste a complete week as JSON instead of filling in each item.
          </p>
        )}
      </Card>

      {days.map(({ day, items }) => (
        <Card key={day} title={`Day ${day}`} dense>
          <ul>
            {items.map(({ item, index }) => {
              const itemIssues = byItem.get(index) ?? [];
              const itemErrors = itemIssues.filter((issue) => issue.level === "error").length;
              const expanded = openItem === item.id;

              return (
                <li key={`${item.id}-${index}`} className="border-b last:border-b-0">
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
                          : `Day ${day} · slot ${SLOTS[index % 4]}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {itemErrors > 0 ? (
                        <StatusPill role="critical" label={String(itemErrors)} />
                      ) : itemIssues.length > 0 ? (
                        <StatusPill role="warning" label={String(itemIssues.length)} />
                      ) : (
                        <StatusPill role="good" label="OK" />
                      )}
                      <span className="muted" aria-hidden="true">
                        {expanded ? "▾" : "▸"}
                      </span>
                    </span>
                  </button>

                  {expanded ? (
                    <div className="border-t px-4 py-3">
                      <label className="mb-3 flex max-w-xs flex-col gap-1.5">
                        <span className="text-xs font-medium tracking-wide uppercase muted">
                          Template
                        </span>
                        <select
                          value={item.template}
                          onChange={(event) => {
                            const next = plan.items.slice();
                            next[index] = { ...item, template: event.target.value };
                            setPlan((current) => ({ ...current, items: next }));
                          }}
                          className="field"
                        >
                          {["StatCard", "ListReveal", "DevJoke", "TechTip", "SiteRoast", "CaseStudy", "Recap", "FounderStory"].map(
                            (name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ),
                          )}
                        </select>
                      </label>

                      <ItemFields
                        item={item}
                        index={index}
                        spec={templateSpec(item.template)}
                        issues={itemIssues}
                        disabled={false}
                        onChange={(next) => {
                          const items = plan.items.slice();
                          items[index] = next;
                          setPlan((current) => ({ ...current, items }));
                        }}
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
