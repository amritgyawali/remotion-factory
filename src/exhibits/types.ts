import registry from "./registry.json";

/**
 * What a script is allowed to ask to be drawn.
 *
 * The catalogue in registry.json is the shared contract — the plan validator
 * and the pixel verifier both read it — and this file is the typed half of it:
 * the shape of the data each kind needs, so a template cannot render a `dial`
 * without a number to put in it.
 *
 * The union is deliberately closed. "Any object with a kind" would let a plan
 * introduce an exhibit no component knows how to draw, and the failure would be
 * an empty middle third of the frame on a video nobody watched before it posted.
 */

export const EXHIBIT_BAND = registry.band;
export const EXHIBIT_KINDS = Object.keys(registry.kinds) as ExhibitKind[];

export type ExhibitKind = keyof typeof registry.kinds;

/** One labelled figure. `value` is the measurement; `unit` travels beside it. */
export type Datum = {
  label: string;
  value: number;
  /** Optional per-row note, e.g. what the figure was measured on. */
  note?: string;
};

/* -------------------------------------------------------------------------- */
/* Chart family — the marks encode a measurement                              */
/* -------------------------------------------------------------------------- */

export type DialExhibit = {
  kind: "dial";
  /** 0–100 when `unit` is "%", otherwise any figure with `of` as its whole. */
  value: number;
  unit: string;
  /** What the ratio is of. Sits under the number, never inside the ring. */
  caption: string;
  /** The whole the value is a part of. Defaults to 100 for percentages. */
  of?: number;
};

export type BarsExhibit = {
  kind: "bars";
  /** Two to four. Past four, columns stop being readable at phone size. */
  series: Datum[];
  unit: string;
  /** Index of the column the story is about. It gets `primary`; rest recede. */
  emphasis?: number;
};

export type MetersExhibit = {
  kind: "meters";
  rows: Datum[];
  unit: string;
  /** The whole each row is measured against. Defaults to the largest row. */
  of?: number;
};

export type CompareExhibit = {
  kind: "compare";
  from: Datum;
  to: Datum;
  unit: string;
};

export type BoardExhibit = {
  kind: "board";
  /** Exactly four. It is a KPI row, and a KPI row with seven tiles is a table. */
  tiles: (Datum & { suffix?: string })[];
  /** Index of the one tile that carries the story. Exactly one. */
  emphasis: number;
};

export type CartogramExhibit = {
  kind: "cartogram";
  label: string;
  unit: string;
  /** Named regions. Cells not named here are drawn as absent, not as zero. */
  regions: Datum[];
};

/* -------------------------------------------------------------------------- */
/* Diagram family — the marks depict a mechanism                              */
/* -------------------------------------------------------------------------- */

export type PipelineExhibit = {
  kind: "pipeline";
  /** Three to five stages, in order. */
  stages: string[];
  /** Index of the stage where the packet visibly stalls. */
  bottleneck?: number;
  note?: string;
};

export type TraceExhibit = {
  kind: "trace";
  /** Rows that fill in one at a time. */
  rows: string[];
  /** What the climbing counter is counting, e.g. "queries". */
  counterLabel: string;
  unit?: string;
};

export type ChecklistExhibit = {
  kind: "checklist";
  steps: { label: string; verdict: "pass" | "fail" | "warn" }[];
};

export type NodeGraphExhibit = {
  kind: "nodegraph";
  core: string;
  /** Three to six satellites. */
  nodes: string[];
};

export type TimelineExhibit = {
  kind: "timeline";
  tracks: { label: string; clips: number }[];
  /** 0–1. Where the playhead comes to rest. */
  restAt?: number;
};

export type RadarExhibit = {
  kind: "radar";
  label: string;
  /** What the sweep finds, in the order it finds them. */
  targets: string[];
};

export type CodeExhibit = {
  kind: "code";
  filename: string;
  lines: string[];
  /** Index of the line the argument is about. */
  highlight: number;
};

/** The three stages that predate this catalogue and are drawn by their template. */
export type StageExhibit = { kind: "browser" | "terminal" | "chat" | "sitemock" };

/**
 * Every exhibit may name its own figure.
 *
 * Added as an intersection rather than by repeating the field on thirteen
 * types, which keeps `kind` the only discriminant and so keeps the union
 * narrowing in a switch. The dispatcher derives a title when a script omits
 * one, but a script that knows what it is measuring should say so — "queries
 * per page load" is a better header than "the sequence".
 */
type Titled<T> = T & { title?: string };

export type Exhibit =
  | Titled<DialExhibit>
  | Titled<BarsExhibit>
  | Titled<MetersExhibit>
  | Titled<CompareExhibit>
  | Titled<BoardExhibit>
  | Titled<CartogramExhibit>
  | Titled<PipelineExhibit>
  | Titled<TraceExhibit>
  | Titled<ChecklistExhibit>
  | Titled<NodeGraphExhibit>
  | Titled<TimelineExhibit>
  | Titled<RadarExhibit>
  | Titled<CodeExhibit>
  | Titled<StageExhibit>;

/**
 * Narrow an untyped value off the plan into an Exhibit.
 *
 * Returns null rather than throwing or substituting a default. A template that
 * gets null draws its own fallback stage and the plan validator has already
 * refused to accept the week — a silently substituted exhibit would mean the
 * video shipped showing something its script never asked for.
 */
export function asExhibit(value: unknown): Exhibit | null {
  if (!value || typeof value !== "object") return null;
  const kind = (value as { kind?: unknown }).kind;
  if (typeof kind !== "string" || !(kind in registry.kinds)) return null;
  return value as Exhibit;
}
