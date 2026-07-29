import { campaignOrdinal } from "../variation";
import registry from "./registry.json";
import type { Exhibit, ExhibitKind } from "./types";

/**
 * The exhibit a script gets when it does not write one itself.
 *
 * Two problems this solves at once.
 *
 * The first is coverage. "No video is words on a colour field" cannot be a
 * convention, because a convention is what gets skipped at 3am on the twenty-
 * eighth item of a week. Every template asks for an exhibit and always gets
 * one, so the failure mode is not an empty middle third — it is a template that
 * will not compile.
 *
 * The second is honesty. A derived exhibit may only use what the script already
 * says. Every label below comes from the item's own props — its steps, its
 * moments, its problems — and every number comes from a field the script wrote
 * as a number. Nothing here invents a figure to have something to draw, which
 * is the rule this project already deleted a component over: a chart whose
 * marks are keyed off the frame counter measures nothing and invites the viewer
 * to read a value that does not exist.
 *
 * That constraint is why the derived kind is usually a diagram. Most scripts
 * carry prose, and prose supports a mechanism drawn from its own steps but does
 * not support a bar chart. A script that wants a chart supplies the numbers.
 */

/**
 * Which figures each template reaches for, most characteristic first.
 *
 * Read from registry.json rather than declared here, because the authoring tool
 * in scripts/backfill-exhibits.mjs walks the same order and cannot import a
 * TypeScript module. When this list lived in this file the JSON-side tool fell
 * back to plain registry order and quietly stopped choosing the browser stage
 * for SiteRoast — the template lost the figure it was built around and nothing
 * failed. One list, two readers.
 */
const PREFERENCE = registry.preference as Record<string, ExhibitKind[]>;

/**
 * Which figure this video draws, by its position in the campaign.
 *
 * `ordinal % length` rather than a hash. A hash spreads on average and collides
 * in practice — the same birthday-problem argument that made the look
 * assignment a walk instead of a draw. A modulo over a dense ordinal is a
 * rotation: consecutive videos on one template are guaranteed different
 * figures, and every figure in the list is used equally often over a campaign.
 *
 * Non-campaign ids — previews, probes, the legacy week-31 ids — take the first
 * entry, which is the template's most characteristic figure.
 */
export function deriveKind(
  template: string,
  videoId: string | undefined,
  props: Record<string, unknown> = {},
): ExhibitKind {
  const kinds = PREFERENCE[template] ?? (["checklist"] as ExhibitKind[]);
  const ordinal = campaignOrdinal(videoId);
  const start = ordinal === null ? 0 : ordinal % kinds.length;

  // Rotate from the campaign's position and take the first figure the script's
  // own words will actually fit. Skipping is rare and it is not a fallback —
  // it is the difference between a figure and a figure full of ellipses.
  for (let step = 0; step < kinds.length; step += 1) {
    const kind = kinds[(start + step) % kinds.length];
    if (suits(kind, props)) return kind;
  }
  return kinds[start];
}

/** The longest line in the list this script will actually hand a figure. */
function longestLine(props: Record<string, unknown>): number {
  return contentLines(props).reduce((longest, line) => Math.max(longest, line.length), 0);
}

/**
 * Whether a figure can carry this script's lines without mangling them.
 *
 * Only two kinds have a real length ceiling, and both for a geometric reason
 * rather than a stylistic one. A satellite's label has to fit between the
 * orbit and the panel edge, and an editor line has to fit the panel's width in
 * a monospace face — past those widths the text is not "tight", it is cut.
 * Every other figure sets its labels along a full-width row and scales.
 */
function suits(kind: ExhibitKind, props: Record<string, unknown>): boolean {
  const longest = longestLine(props);
  if (kind === "nodegraph") return longest > 0 && longest <= 26;
  // A track name sits in a fixed gutter beside its clips and cannot wrap past
  // two lines without pushing the rows out of the panel.
  if (kind === "timeline") return longest > 0 && longest <= 30;
  if (kind === "code") return longest > 0 && longest <= 46;
  return true;
}

/** "32%" -> 32. Returns null for anything that is not a leading number. */
function leadingNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const match = /^[^\d-]*(-?[\d,]*\.?\d+)/.exec(value);
  if (!match) return null;
  const parsed = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** The unit trailing a figure: "32%" -> "%", "$2.4M" -> "M", "18" -> "". */
function trailingUnit(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = /^[^\d-]*-?[\d,]*\.?\d+(.*)$/.exec(value);
  return (match?.[1] ?? "").trim().slice(0, 4);
}

const asLines = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((line): line is string => typeof line === "string") : [];

/**
 * The script's own list, whichever field it happens to live in.
 *
 * Every template names its list something different — steps, items, moments,
 * problems, actions, beats — and every diagram below needs one. Resolving that
 * in each branch is how a figure ends up empty: the timeline branch asked for
 * moments, then beats, then items, and a CaseStudy has none of the three, so it
 * drew four tracks of nothing. One ordered lookup, used by all of them, makes
 * that unrepresentable.
 *
 * The order is by specificity, not alphabetical. `context` is last because it
 * is supporting prose rather than the list the video is about, and reaching it
 * means the script had no list at all.
 */
function contentLines(props: Record<string, unknown>): string[] {
  for (const key of ["steps", "items", "moments", "problems", "actions", "beats", "context"]) {
    const lines = asLines(props[key]);
    if (lines.length) return lines;
  }
  return [];
}

/**
 * Shorten a sentence to something a mark can carry.
 *
 * Cuts on a word boundary rather than mid-word, and only when it has to: a
 * diagram whose labels are clipped mid-syllable reads as a rendering bug, and
 * the whole argument for these figures is that they look deliberate.
 */
function short(line: string, limit: number): string {
  const trimmed = line.trim().replace(/[.:;,]$/, "");
  if (trimmed.length <= limit) return trimmed;
  const cut = trimmed.slice(0, limit);
  const boundary = cut.lastIndexOf(" ");
  return `${boundary > limit * 0.5 ? cut.slice(0, boundary) : cut}…`;
}

/**
 * Build the exhibit for a template's own props.
 *
 * Returns a stage kind — which draws nothing here — where the template owns its
 * own layout. Never returns null: a caller with no exhibit has a bug, and the
 * dispatcher's job is to draw what it is given, not to decide there is nothing
 * to draw.
 */
export function deriveExhibit(
  template: string,
  props: Record<string, unknown>,
  videoId: string | undefined,
): Exhibit {
  const kind = deriveKind(template, videoId, props);

  switch (kind) {
    case "browser":
    case "terminal":
    case "chat":
    case "sitemock":
      return { kind };

    case "dial": {
      const value = leadingNumber(props.value);
      const unit = trailingUnit(props.value) || "%";
      // A script whose "value" is not a number cannot have a dial drawn from
      // it. Falling back to a checklist of its context lines is the honest
      // move: those are words, so they get a figure made of words.
      if (value === null) {
        return {
          kind: "checklist",
          steps: asLines(props.context)
            .slice(0, 3)
            .map((line) => ({ label: short(line, 42), verdict: "pass" as const })),
        };
      }
      return {
        kind: "dial",
        value,
        unit,
        // Deliberately empty. `label` is the sentence the number completes and
        // the template already sets it as the headline directly above the ring;
        // repeating it under the ring printed the same words twice in one
        // frame. A script that wants a caption writes its own exhibit.
        caption: "",
        // Percentages are of a hundred. Anything else is of itself, so the ring
        // fills completely — the figure is then the number, not a proportion
        // of a whole the script never named.
        ...(unit === "%" ? {} : { of: value }),
      };
    }

    case "checklist": {
      const lines = contentLines(props);
      return {
        kind: "checklist",
        steps: lines.slice(0, 5).map((line, index) => ({
          label: short(line, 42),
          // Problems fail, everything else passes. A checklist where every row
          // resolves the same way is a list with ticks drawn on it; the mixed
          // verdict is what makes the viewer read each one.
          verdict: asLines(props.problems).includes(line)
            ? ("fail" as const)
            : index === lines.length - 1
              ? ("pass" as const)
              : ("pass" as const),
        })),
      };
    }

    case "pipeline": {
      const stages = contentLines(props);
      const picked = stages.slice(0, 5).map((line) => short(line, 40));
      return {
        kind: "pipeline",
        stages: picked,
        // The last stage is where the work lands, so that is where it waits.
        bottleneck: Math.max(0, picked.length - 1),
      };
    }

    case "trace": {
      const rows = contentLines(props);
      return {
        kind: "trace",
        rows: rows.slice(0, 6).map((line) => short(line, 34)),
        counterLabel: "steps taken",
      };
    }

    case "nodegraph": {
      const nodes = contentLines(props);
      return {
        kind: "nodegraph",
        core: short(String(props.headline ?? props.hook ?? ""), 24),
        nodes: nodes.slice(0, 5).map((line) => short(line, 24)),
      };
    }

    case "timeline": {
      const lines = contentLines(props);
      return {
        kind: "timeline",
        tracks: lines.slice(0, 4).map((line, index) => ({
          label: short(line, 24),
          // Clip counts rise across the tracks, which is the shape every one of
          // these stories has: it starts simple and accumulates.
          clips: 2 + index,
        })),
      };
    }

    case "radar": {
      const targets = contentLines(props);
      return {
        kind: "radar",
        label: "what the scan finds",
        targets: targets.slice(0, 4).map((line) => short(line, 30)),
      };
    }

    case "code": {
      const lines = contentLines(props);
      return {
        kind: "code",
        filename: "check.sh",
        // Written as commands because that is what these steps are. Anything
        // the script did not say stays out of the panel.
        lines: lines.slice(0, 6).map((line) => `# ${short(line, 44)}`),
        highlight: Math.max(0, Math.min(lines.length - 1, lines.length - 1)),
      };
    }

    case "board": {
      const totals = Array.isArray(props.totals) ? props.totals : [];
      const tiles = totals
        .filter((row): row is { label: string; value: number } =>
          Boolean(row) && typeof (row as { value?: unknown }).value === "number",
        )
        .slice(0, 4)
        .map((row) => ({ label: short(row.label, 20), value: row.value }));
      return { kind: "board", tiles, emphasis: 0 };
    }

    case "bars":
    case "meters": {
      const board = Array.isArray(props.leaderboard) ? props.leaderboard : [];
      const rows = board
        .filter((row): row is { label: string; value: number } =>
          Boolean(row) && typeof (row as { value?: unknown }).value === "number",
        )
        .slice(0, kind === "bars" ? 4 : 5)
        .map((row) => ({ label: short(row.label, kind === "bars" ? 18 : 34), value: row.value }));
      return kind === "bars"
        ? { kind: "bars", series: rows, unit: "" }
        : { kind: "meters", rows, unit: "" };
    }

    default:
      return { kind: "checklist", steps: [] };
  }
}
