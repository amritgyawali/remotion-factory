"use client";

import { useMemo } from "react";
import type { Issue, PlanItem, TEMPLATES } from "@/lib/plan-schema";

type Spec = (typeof TEMPLATES)[keyof typeof TEMPLATES] | undefined;

/**
 * Fields generated from the template spec rather than hand-written per
 * template. Eight templates with overlapping prop sets would otherwise be
 * eight forms to keep in step with the validator; here a new required prop or
 * a changed character limit shows up in the UI the moment the spec changes.
 */
export function ItemFields({
  item,
  index,
  spec,
  issues,
  disabled,
  onChange,
}: {
  item: PlanItem;
  index: number;
  spec: Spec;
  issues: Issue[];
  disabled: boolean;
  onChange: (next: PlanItem) => void;
}) {
  const limits = (spec?.limits ?? {}) as Record<string, number>;
  const arraySpec = spec && "array" in spec ? spec.array : undefined;
  const variants = spec && "variants" in spec ? spec.variants : undefined;

  // Spec order first so required props read in a predictable order, then any
  // extra props the plan carries, so nothing is silently uneditable.
  const propKeys = useMemo(() => {
    const ordered = [...(spec?.required ?? [])] as string[];
    for (const key of Object.keys(item.props ?? {})) {
      if (!ordered.includes(key)) ordered.push(key);
    }
    return ordered;
  }, [spec, item.props]);

  function setProp(key: string, value: unknown) {
    onChange({ ...item, props: { ...item.props, [key]: value } });
  }

  const hashtags = item.caption?.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {issues.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs">
          {issues.map((issue, n) => (
            <li key={n} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                style={{
                  color:
                    issue.level === "error" ? "var(--color-status-critical)" : "var(--color-status-warning)",
                }}
              >
                {issue.level === "error" ? "✕" : "▲"}
              </span>
              <span className="secondary">{issue.message}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <Field
        label="Caption"
        hint={
          <span className={hashtags === 3 ? "muted" : ""} style={hashtags === 3 ? undefined : { color: "var(--color-status-critical)" }}>
            {item.caption?.length ?? 0} chars · {hashtags}/3 hashtags
          </span>
        }
      >
        <textarea
          value={item.caption ?? ""}
          disabled={disabled}
          rows={4}
          onChange={(event) => onChange({ ...item, caption: event.target.value })}
          className="field font-mono text-xs"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        {propKeys.map((key) => {
          const value = item.props?.[key];
          const limit = limits[key];

          if (arraySpec && key === arraySpec.key) {
            return (
              <div key={key} className="sm:col-span-2">
                <ArrayField
                  label={key}
                  values={Array.isArray(value) ? (value as string[]) : []}
                  min={arraySpec.min}
                  max={arraySpec.max}
                  line={arraySpec.line}
                  disabled={disabled}
                  onChange={(next) => setProp(key, next)}
                />
              </div>
            );
          }

          if (variants && key === "variant") {
            return (
              <Field key={key} label={key}>
                <select
                  value={typeof value === "string" ? value : ""}
                  disabled={disabled}
                  onChange={(event) => setProp(key, event.target.value)}
                  className="field"
                >
                  <option value="">— choose —</option>
                  {variants.map((variant) => (
                    <option key={variant} value={variant}>
                      {variant}
                    </option>
                  ))}
                </select>
              </Field>
            );
          }

          if (typeof value === "number" || key === "day" || key === "durationInSeconds") {
            const readOnly = key === "day";
            return (
              <Field
                key={key}
                label={key}
                hint={readOnly ? <span className="muted">fixed by weekly position</span> : undefined}
              >
                <input
                  type="number"
                  value={typeof value === "number" ? value : ""}
                  disabled={disabled || readOnly}
                  onChange={(event) => setProp(key, event.target.value === "" ? undefined : Number(event.target.value))}
                  className="field tabular"
                />
              </Field>
            );
          }

          if (Array.isArray(value)) {
            return (
              <div key={key} className="sm:col-span-2">
                <ArrayField
                  label={key}
                  values={value as string[]}
                  disabled={disabled}
                  onChange={(next) => setProp(key, next)}
                />
              </div>
            );
          }

          if (value !== null && typeof value === "object") {
            return (
              <div key={key} className="sm:col-span-2">
                <Field label={key} hint={<span className="muted">nested object — edited as JSON</span>}>
                  <JsonField
                    value={value}
                    disabled={disabled}
                    onChange={(next) => setProp(key, next)}
                  />
                </Field>
              </div>
            );
          }

          const text = typeof value === "string" ? value : "";
          const over = limit !== undefined && text.length > limit;
          return (
            <Field
              key={key}
              label={key}
              hint={
                limit !== undefined ? (
                  <span style={over ? { color: "var(--color-status-warning)" } : undefined} className={over ? "" : "muted"}>
                    {text.length}/{limit}
                  </span>
                ) : undefined
              }
            >
              <input
                type="text"
                value={text}
                disabled={disabled}
                onChange={(event) => setProp(key, event.target.value)}
                className="field"
              />
            </Field>
          );
        })}
      </div>

      <p className="text-xs muted">
        Position {index + 1} of 28 · source <code>{item.sourceId ?? "—"}</code>
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium tracking-wide uppercase muted">{label}</span>
        {hint ? <span className="text-xs tabular">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function ArrayField({
  label,
  values,
  min,
  max,
  line,
  disabled,
  onChange,
}: {
  label: string;
  values: string[];
  min?: number;
  max?: number;
  line?: number;
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  const canAdd = max === undefined || values.length < max;
  const canRemove = min === undefined || values.length > min;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium tracking-wide uppercase muted">{label}</span>
        <span className="text-xs muted tabular">
          {values.length}
          {min !== undefined && max !== undefined ? ` / ${min === max ? min : `${min}–${max}`}` : ""}
        </span>
      </span>

      <div className="flex flex-col gap-1.5">
        {values.map((value, index) => {
          const over = line !== undefined && value.length > line;
          return (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={value}
                disabled={disabled}
                aria-label={`${label} line ${index + 1}`}
                onChange={(event) => {
                  const next = values.slice();
                  next[index] = event.target.value;
                  onChange(next);
                }}
                className="field"
                style={over ? { borderColor: "var(--color-status-warning)" } : undefined}
              />
              <span className="w-12 shrink-0 text-right text-xs muted tabular">
                {line !== undefined ? `${value.length}/${line}` : value.length}
              </span>
              <button
                type="button"
                className="btn px-2 py-1 text-xs"
                disabled={disabled || !canRemove}
                onClick={() => onChange(values.filter((_, n) => n !== index))}
                aria-label={`Remove ${label} line ${index + 1}`}
              >
                −
              </button>
            </div>
          );
        })}
      </div>

      {canAdd ? (
        <button
          type="button"
          className="btn self-start px-2 py-1 text-xs"
          disabled={disabled}
          onClick={() => onChange([...values, ""])}
        >
          + Add line
        </button>
      ) : null}
    </div>
  );
}

/**
 * Objects like Recap's totals and leaderboard have no fixed shape in the spec,
 * so they are edited as JSON. Invalid JSON is kept in the box and flagged
 * rather than thrown away mid-typing.
 */
function JsonField({
  value,
  disabled,
  onChange,
}: {
  value: unknown;
  disabled: boolean;
  onChange: (next: unknown) => void;
}) {
  const text = useMemo(() => JSON.stringify(value, null, 2), [value]);

  return (
    <textarea
      defaultValue={text}
      disabled={disabled}
      rows={6}
      onBlur={(event) => {
        try {
          onChange(JSON.parse(event.target.value));
          event.target.setCustomValidity("");
        } catch {
          event.target.setCustomValidity("Not valid JSON — the previous value was kept.");
          event.target.reportValidity();
        }
      }}
      className="field font-mono text-xs"
    />
  );
}
