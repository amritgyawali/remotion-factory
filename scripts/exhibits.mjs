import { createRequire } from "node:module";

/**
 * The plan-side half of the exhibit contract.
 *
 * Everything here is checked before a frame is rendered, which is the only
 * useful time to check it: the alternative is discovering that a week's worth
 * of scripts specify a figure nobody can draw after paying eight minutes of
 * runner time per video to find out.
 *
 * The catalogue itself is imported, not restated. src/exhibits/registry.json is
 * the single source of truth for which kinds exist, which templates may draw
 * them, and what data each one needs; a second hand-maintained copy in this
 * file would be a copy that drifts, and the drift would show up as a video that
 * passed validation and rendered an empty band.
 */
const require = createRequire(import.meta.url);
const registry = require("../src/exhibits/registry.json");

export const EXHIBIT_KINDS = Object.keys(registry.kinds);
export const EXHIBIT_BAND = registry.band;

/**
 * The campaign week the exhibit rule starts at.
 *
 * Weeks 31 and 32 predate it. 31 is published and its plan is frozen, so its
 * scripts are not ours to rewrite; 32 is LogoLadder and WorksOnMyMachine, both
 * of which spend their whole runtime wrecking a real page and were never the
 * problem this rule exists to solve. Applying the rule retroactively would fail
 * validation on two weeks that cannot be fixed, which is a check that has to be
 * disabled to get any work done — the worst kind.
 *
 * Deliberately the same boundary as CAMPAIGN_FIRST_WEEK in src/variation.ts.
 * One line in the history of this project, not two.
 */
export const EXHIBIT_FIRST_WEEK = 33;

const WEEK_ID = /^(\d{4})-w(\d{1,2})$/;
const ITEM_WEEK = /^w(\d{1,3})-d\d{1,2}-[a-d]$/;

/** The campaign week number an item belongs to, or null if it has no position. */
export function weekNumberOf(item, weekId) {
  const fromItem = ITEM_WEEK.exec(item?.id ?? "");
  if (fromItem) return Number(fromItem[1]);
  const fromWeek = WEEK_ID.exec(weekId ?? "");
  return fromWeek ? Number(fromWeek[2]) : null;
}

/** Whether this item is old enough to predate the rule. */
export function exhibitRequired(item, weekId) {
  const week = weekNumberOf(item, weekId);
  return week !== null && week >= EXHIBIT_FIRST_WEEK;
}

/** Resolve "series[].value" against a spec, returning every value it names. */
function valuesAt(spec, path) {
  const [head, ...rest] = path.split(".");
  if (head.endsWith("[]")) {
    const list = spec[head.slice(0, -2)];
    if (!Array.isArray(list)) return [undefined];
    return list.map((entry) => (rest.length ? entry?.[rest.join(".")] : entry));
  }
  return [rest.length ? spec[head]?.[rest.join(".")] : spec[head]];
}

/** Bounds a figure stops being readable outside of, at phone size. */
const LIST_BOUNDS = {
  bars: { key: "series", min: 2, max: 4 },
  meters: { key: "rows", min: 2, max: 5 },
  board: { key: "tiles", min: 4, max: 4 },
  cartogram: { key: "regions", min: 2, max: 18 },
  pipeline: { key: "stages", min: 3, max: 5 },
  trace: { key: "rows", min: 3, max: 7 },
  checklist: { key: "steps", min: 2, max: 5 },
  nodegraph: { key: "nodes", min: 3, max: 6 },
  timeline: { key: "tracks", min: 2, max: 4 },
  radar: { key: "targets", min: 2, max: 4 },
  code: { key: "lines", min: 2, max: 8 },
};

/**
 * Every reason this exhibit could not be drawn as specified.
 *
 * Returns human-readable strings rather than throwing, so one bad item reports
 * alongside the rest of the week instead of hiding them.
 */
export function exhibitProblems(exhibit, template) {
  const problems = [];

  if (exhibit === undefined || exhibit === null) {
    return ["props.exhibit is missing — every video from week 33 on must show something"];
  }
  if (typeof exhibit !== "object" || Array.isArray(exhibit)) {
    return [`props.exhibit must be an object — got ${Array.isArray(exhibit) ? "an array" : typeof exhibit}`];
  }

  const spec = registry.kinds[exhibit.kind];
  if (!spec) {
    return [
      `props.exhibit.kind "${exhibit.kind}" is not a known figure — have ${EXHIBIT_KINDS.join(", ")}`,
    ];
  }

  if (!spec.templates.includes(template)) {
    problems.push(
      `props.exhibit.kind "${exhibit.kind}" is not available to ${template} — ` +
        `it draws ${spec.templates.join(", ")}`,
    );
  }

  for (const field of spec.requires) {
    if (exhibit[field] === undefined) {
      problems.push(`props.exhibit.${field} is required by kind "${exhibit.kind}"`);
    }
  }

  /**
   * The rule the whole `family` split exists for.
   *
   * A chart's marks are lengths and angles, and a length is a claim about a
   * quantity. This project has already deleted one component for drawing bars
   * whose heights came from the frame counter — it looked like a chart and
   * measured nothing, which invites the viewer to read a value that does not
   * exist. So a chart-family exhibit either carries real numbers or it is not a
   * chart, and that is enforced here rather than left to the author.
   */
  if (spec.family === "chart") {
    for (const path of spec.numeric) {
      for (const value of valuesAt(exhibit, path)) {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          problems.push(
            `props.exhibit.${path} must be a finite number on a chart-family figure — ` +
              `got ${JSON.stringify(value)}. Use a diagram kind if the script has no measurement.`,
          );
        }
      }
    }
  }

  const bounds = LIST_BOUNDS[exhibit.kind];
  if (bounds) {
    const list = exhibit[bounds.key];
    if (!Array.isArray(list)) {
      problems.push(`props.exhibit.${bounds.key} must be an array`);
    } else if (list.length < bounds.min || list.length > bounds.max) {
      problems.push(
        `props.exhibit.${bounds.key} must hold ${bounds.min}` +
          (bounds.min === bounds.max ? "" : `–${bounds.max}`) +
          ` entries — got ${list.length}`,
      );
    }
  }

  if (exhibit.kind === "board" && Array.isArray(exhibit.tiles)) {
    const emphasis = exhibit.emphasis;
    if (!Number.isInteger(emphasis) || emphasis < 0 || emphasis >= exhibit.tiles.length) {
      problems.push(
        `props.exhibit.emphasis must index one of the ${exhibit.tiles.length} tiles — ` +
          "a board where everything is emphasised is a board where nothing is",
      );
    }
  }

  if (exhibit.kind === "checklist" && Array.isArray(exhibit.steps)) {
    exhibit.steps.forEach((step, index) => {
      if (!["pass", "fail", "warn"].includes(step?.verdict)) {
        problems.push(
          `props.exhibit.steps[${index}].verdict must be "pass", "fail" or "warn"`,
        );
      }
    });
  }

  if (exhibit.kind === "code" && Array.isArray(exhibit.lines)) {
    const highlight = exhibit.highlight;
    if (!Number.isInteger(highlight) || highlight < 0 || highlight >= exhibit.lines.length) {
      problems.push(`props.exhibit.highlight must index one of the ${exhibit.lines.length} lines`);
    }
  }

  return problems;
}

/**
 * Figures repeating inside a single day.
 *
 * Four posts go out six hours apart, and four dials in one day is one video
 * posted four times as far as a viewer scrolling that feed is concerned. The
 * look walk already guarantees a distinct palette, typeface and motion per
 * video; this guarantees the *figure* differs too, which is the axis a viewer
 * actually notices.
 *
 * Stage kinds are exempt. A week of LogoLadder is 28 videos of one template
 * wrecking a different page each time, and its uniqueness comes from the page,
 * which the frame fingerprint checks after the render.
 */
export function repeatedWithinDay(items) {
  const stages = new Set(["browser", "terminal", "chat", "sitemock"]);
  const problems = [];

  for (let start = 0; start < items.length; start += 4) {
    const day = items.slice(start, start + 4);
    const seen = new Map();

    for (const item of day) {
      const kind = item.props?.exhibit?.kind;
      if (!kind || stages.has(kind)) continue;
      const first = seen.get(kind);
      if (first !== undefined) {
        problems.push(
          `${item.id}: draws the same figure ("${kind}") as ${first} on the same day — ` +
            "four posts six hours apart should not all be the same picture",
        );
      } else {
        seen.set(kind, item.id);
      }
    }
  }

  return problems;
}

/**
 * Anything in a script that would put a voice on the soundtrack.
 *
 * The series has no narration by design, and the check is here rather than in
 * the renderer because by render time the decision has already been made. Cue
 * names resolve to synthesised one-shots built by scripts/audio/sfx.mjs; a cue
 * naming a file instead would be an audio asset nothing in this repository
 * generated, which is the only way a voice could reach the mix.
 */
export function voiceProblems(props) {
  const problems = [];
  const banned = ["voiceover", "narration", "vo", "speech", "tts"];

  for (const key of Object.keys(props ?? {})) {
    if (banned.includes(key.toLowerCase())) {
      problems.push(`props.${key} is not a field this series has — every video is scored, never narrated`);
    }
  }

  for (const [index, cue] of (props?.score?.cues ?? []).entries()) {
    if (typeof cue?.sfx !== "string") {
      problems.push(`props.score.cues[${index}].sfx must be the name of a generated one-shot`);
    } else if (/[./\\]/.test(cue.sfx)) {
      problems.push(
        `props.score.cues[${index}].sfx "${cue.sfx}" looks like a file path. Cues name a ` +
          "synthesised one-shot, and a file would be audio this repository did not generate.",
      );
    }
  }

  return problems;
}
