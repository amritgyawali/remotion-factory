import React from "react";
import type { Theme } from "../theme";
import { Figure } from "./Figure";
import { Bars, Board, Cartogram, Compare, Dial, Meters } from "./charts";
import { Checklist, CodePanel, NodeGraph, Pipeline, Radar, Timeline, Trace } from "./diagrams";
import { deriveExhibit } from "./derive";
import { asExhibit, EXHIBIT_BAND, EXHIBIT_KINDS, type Exhibit as ExhibitSpec } from "./types";

export { EXHIBIT_BAND, EXHIBIT_KINDS, asExhibit, deriveExhibit };

/**
 * The exhibit this video draws: the script's own, or one built from its props.
 *
 * The order is the whole policy. A script that names its figure always wins —
 * that is the point of writing one. A script that does not still gets a figure,
 * derived from the words it did write, so "every video shows something" holds
 * for the un-backfilled item as well as the curated one.
 *
 * `asExhibit` returning null covers the case that matters most: a plan naming a
 * kind no component knows how to draw. That must not fall through to an empty
 * band, so it falls through to the derivation, and the plan validator refuses
 * the week before it can be rendered at all.
 */
export function resolveExhibit(
  template: string,
  props: Record<string, unknown>,
  videoId: string | undefined,
): ExhibitSpec {
  return asExhibit(props.exhibit) ?? deriveExhibit(template, props, videoId);
}
// Aliased on the way out: `Exhibit` is the component below, and a template
// reads better asking for an `ExhibitSpec` prop and rendering an `<Exhibit>`.
export type { Exhibit as ExhibitSpec, ExhibitKind } from "./types";
export { MARKS, MARK_SCALE } from "./Figure";

/**
 * One exhibit, drawn.
 *
 * This is the component that makes the rule enforceable. "Every video shows
 * something" is a wish if each template decides for itself what showing means;
 * it becomes a property of the system when every template asks this one
 * component for a figure, in the same band of the frame, and the plan validator
 * refuses a script that does not name one.
 *
 * The stage kinds — browser, terminal, chat, sitemock — return null. They are
 * not a gap: those four are drawn by the template that owns them, because they
 * are not panels sitting in the middle third but whole layouts (LogoLadder
 * spends fifteen seconds wrecking a page; it does not also need a chart). The
 * verifier knows about them and checks the same band regardless — what has to
 * be true is that the band is not empty, not that this file filled it.
 */

/** The header a figure carries when the script does not write its own. */
function defaultTitle(spec: ExhibitSpec): string {
  switch (spec.kind) {
    case "dial":
      return spec.caption.length <= 34 ? "share" : "measured";
    case "bars":
      return "compared";
    case "meters":
      return "breakdown";
    case "compare":
      return "before / after";
    case "board":
      return "the numbers";
    case "cartogram":
      return spec.label;
    case "pipeline":
      return "the sequence";
    case "trace":
      return spec.counterLabel;
    case "checklist":
      return "the checks";
    case "nodegraph":
      return spec.core;
    case "timeline":
      return "timeline";
    case "radar":
      return spec.label;
    case "code":
      return spec.filename;
    default:
      return "exhibit";
  }
}

/** The unit or scale note in the figure's top-right corner, where there is one. */
function defaultNote(spec: ExhibitSpec): string | undefined {
  switch (spec.kind) {
    case "dial":
      return spec.of ? `of ${spec.of}${spec.unit}` : undefined;
    case "bars":
    case "meters":
    case "compare":
      return spec.unit;
    case "cartogram":
      return spec.unit;
    case "trace":
      return "one row per call";
    default:
      return undefined;
  }
}

export const Exhibit: React.FC<{
  theme: Theme;
  spec: ExhibitSpec;
  /** Frame the figure's panel arrives on. Marks follow it. */
  from: number;
  /** Fixed panel height, so the band is identical across templates. */
  height?: number;
  /** Overrides both the script's title and the derived one. Rarely needed. */
  title?: string;
}> = ({ theme, spec, from, height, title }) => {
  const body = (() => {
    switch (spec.kind) {
      case "dial":
        return <Dial theme={theme} spec={spec} from={from} />;
      case "bars":
        return <Bars theme={theme} spec={spec} from={from} />;
      case "meters":
        return <Meters theme={theme} spec={spec} from={from} />;
      case "compare":
        return <Compare theme={theme} spec={spec} from={from} />;
      case "board":
        return <Board theme={theme} spec={spec} from={from} />;
      case "cartogram":
        return <Cartogram theme={theme} spec={spec} from={from} />;
      case "pipeline":
        return <Pipeline theme={theme} spec={spec} from={from} />;
      case "trace":
        return <Trace theme={theme} spec={spec} from={from} />;
      case "checklist":
        return <Checklist theme={theme} spec={spec} from={from} />;
      case "nodegraph":
        return <NodeGraph theme={theme} spec={spec} from={from} />;
      case "timeline":
        return <Timeline theme={theme} spec={spec} from={from} />;
      case "radar":
        return <Radar theme={theme} spec={spec} from={from} />;
      case "code":
        return <CodePanel theme={theme} spec={spec} from={from} />;
      default:
        // browser / terminal / chat / sitemock — the template draws its own.
        return null;
    }
  })();

  if (!body) return null;

  return (
    <Figure
      theme={theme}
      label={title ?? spec.title ?? defaultTitle(spec)}
      note={defaultNote(spec)}
      from={from}
      height={height}
    >
      {body}
    </Figure>
  );
};

/**
 * Whether a template must place an <Exhibit> itself.
 *
 * False for the four stage kinds, whose template already fills the band with
 * its own layout. Templates ask this rather than testing kind names inline, so
 * adding a stage kind is one edit here and not a hunt through ten files.
 */
export function drawsOwnStage(spec: ExhibitSpec | null): boolean {
  return (
    spec === null ||
    spec.kind === "browser" ||
    spec.kind === "terminal" ||
    spec.kind === "chat" ||
    spec.kind === "sitemock"
  );
}
