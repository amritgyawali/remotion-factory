import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { exhibitProblems, exhibitRequired, voiceProblems } from "./exhibits.mjs";
import { bandProblems, inspectBand } from "./inspect-band.mjs";
import { canonicalJson } from "./weekly-plan.mjs";

/**
 * Did this file turn out to be the video its script asked for?
 *
 * scripts/verify-video.mjs answers a different and easier question — is this a
 * well-formed, non-blank, non-silent MP4 of the right length. A render can pass
 * every check in that file and still be the wrong video: the right length, the
 * right resolution, sound on the track, and a figure nobody asked for in the
 * middle of it, or no figure at all.
 *
 * This closes that gap, and the way it closes it is worth being exact about,
 * because there is a tempting wrong answer.
 *
 * The tempting wrong answer is to look at the pixels and try to recognise the
 * figure. That does not work — see the measurements in inspect-band.mjs, where
 * a text-only render scored *higher* on every "is this a chart" statistic than
 * the exhibit render of the same script. A check that cannot separate the two
 * cases is not a check.
 *
 * What works is a chain of things that are each individually provable:
 *
 *   1. The script names a figure, and the figure is one that exists, is allowed
 *      on that template, and has every field it needs. Proved by reading the
 *      plan against the catalogue.
 *   2. The renderer was handed exactly that script. Proved by comparing the
 *      props file the render actually used against the plan item, canonically.
 *   3. Renders are a pure function of their props — the whole project depends
 *      on this already, because a retry that produced a different video would
 *      invalidate the fingerprint stored for that id.
 *   4. Therefore the video contains that figure.
 *
 * The pixels are still inspected, and still gate, but for what they can
 * actually prove: that the band is occupied, alive and held. That catches the
 * failures a props comparison cannot — a font that never loaded, a component
 * that threw and rendered nothing, a figure that vanished after six frames.
 *
 *   node scripts/verify-script.mjs out/w33-d01-a.mp4 plans/2026-w33.json w33-d01-a
 */

/**
 * How loud a video with no voice is allowed to be.
 *
 * The brief is "low volume, music and effects only", and the master pass in
 * scripts/master-audio.mjs already targets -23 LUFS to deliver it. This is the
 * check that the master actually happened: the floor catches a track that is
 * silent behind a valid AAC stream, and the *ceiling* catches the failure that
 * has no other alarm — an unmastered mix going out at full level under a
 * viewer's thumb at two in the morning.
 *
 * Measured as mean RMS in dBFS rather than LUFS, because that is what the
 * existing loudness probe returns and it does not need a filter build that
 * Remotion's ffmpeg does not ship. Real mastered renders in this project
 * measure around -26 dB RMS; the band is wide enough that a quiet score and a
 * dense one both sit inside it.
 */
export const QUIET_FLOOR_DB = -45;
export const QUIET_CEILING_DB = -14;

/** Props the renderer adds that the plan does not carry. */
const INJECTED = new Set(["videoId"]);

/**
 * Whether the props a render used are the props the script specifies.
 *
 * Canonical JSON, so key order cannot make two identical scripts compare
 * unequal. `videoId` is excluded because the renderer injects it — it is
 * derived from the item id rather than authored — and it is checked separately
 * against that id, which is the property that actually matters.
 */
export function propsProblems(used, item) {
  const problems = [];

  if (!used || typeof used !== "object") {
    return ["the props file the render used is missing or unreadable"];
  }

  if (used.videoId !== item.id) {
    problems.push(
      `the render was given videoId "${used.videoId}" but the script is "${item.id}" — ` +
        "this video's palette, typeface, motion and musical key are all seeded from that id, " +
        "so the file is not the video this script describes",
    );
  }

  const strip = (props) =>
    Object.fromEntries(Object.entries(props ?? {}).filter(([key]) => !INJECTED.has(key)));

  const usedJson = canonicalJson(strip(used));
  const scriptJson = canonicalJson(strip(item.props));

  if (usedJson !== scriptJson) {
    // Name the fields rather than printing two blobs. At 3am the useful line is
    // which prop moved, not a diff of the whole script.
    const usedProps = strip(used);
    const scriptProps = strip(item.props);
    const keys = new Set([...Object.keys(usedProps), ...Object.keys(scriptProps)]);
    const changed = [...keys].filter(
      (key) => canonicalJson(usedProps[key]) !== canonicalJson(scriptProps[key]),
    );
    problems.push(
      `the render used different props from the script it claims to be — ` +
        `${changed.join(", ")} differ${changed.length === 1 ? "s" : ""}`,
    );
  }

  return problems;
}

/** Everything wrong with this finished video, relative to its script. */
export async function verifyAgainstScript(
  file,
  item,
  { weekId, propsFile, loudness, fps = 30, limits = {} } = {},
) {
  const problems = [];

  /* 1 — the script itself still has to be a script we would accept. */
  if (exhibitRequired(item, weekId)) {
    for (const problem of exhibitProblems(item.props?.exhibit, item.template)) {
      problems.push(`script: ${problem}`);
    }
  }
  for (const problem of voiceProblems(item.props)) {
    problems.push(`script: ${problem}`);
  }

  /* 2 — the render has to have been of that script. */
  const path = propsFile ?? `out/${item.id}.props.json`;
  let used = null;
  try {
    used = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    problems.push(
      `the props file at ${path} could not be read (${error.message}) — ` +
        "without it there is no evidence this file was rendered from this script",
    );
  }
  if (used) {
    for (const problem of propsProblems(used, item)) problems.push(`render: ${problem}`);
  }

  /* 3 — the middle of the frame has to be occupied, alive and held. */
  let band = null;
  try {
    band = await inspectBand(file, { fps });
    for (const problem of bandProblems(band, limits)) problems.push(`band: ${problem}`);
  } catch (error) {
    problems.push(`band: could not be inspected — ${error.message}`);
  }

  /* 4 — and it has to be quiet, with sound on it. */
  if (loudness && typeof loudness.meanDb === "number") {
    if (loudness.meanDb < QUIET_FLOOR_DB) {
      problems.push(
        `audio: mean level is ${loudness.meanDb} dB, below the ${QUIET_FLOOR_DB} dB floor — ` +
          "there is a track but effectively nothing on it",
      );
    } else if (loudness.meanDb > QUIET_CEILING_DB) {
      problems.push(
        `audio: mean level is ${loudness.meanDb} dB, above the ${QUIET_CEILING_DB} dB ceiling — ` +
          "this series is scored quiet and the master pass has not been applied",
      );
    }
  }

  return { problems, band, exhibit: item.props?.exhibit?.kind ?? null };
}

/** Throws on the first sound reason this file is not the video its script asked for. */
export async function assertMatchesScript(file, item, options = {}) {
  const result = await verifyAgainstScript(file, item, options);
  if (result.problems.length) {
    throw new Error(
      `${file} does not match the script for ${item.id}:\n  - ${result.problems.join("\n  - ")}`,
    );
  }
  return result;
}

async function main() {
  const [file, planPath, id] = process.argv.slice(2);
  if (!file || !planPath || !id) {
    console.error("usage: node scripts/verify-script.mjs <file.mp4> <plans/week.json> <item-id>");
    process.exit(1);
  }

  const plan = JSON.parse(await readFile(planPath, "utf8"));
  const item = plan.items.find((entry) => entry.id === id);
  if (!item) throw new Error(`${planPath} has no item "${id}"`);

  const { probeLoudness } = await import("./verify-video.mjs");
  const loudness = await probeLoudness(file).catch(() => null);

  const result = await assertMatchesScript(file, item, {
    weekId: plan.week?.id,
    loudness,
    fps: 30,
  });

  console.log(
    `ok  ${file} is ${item.id} — ${item.template}, figure "${result.exhibit}"\n` +
      `    band ink ${(result.band.settledInk * 100).toFixed(1)}%, ` +
      `${result.band.motionFrames} moving frames, ` +
      `held for ${(result.band.presenceFraction * 100).toFixed(0)}% of the body\n` +
      `    audio ${loudness?.meanDb ?? "not measured"} dB mean ` +
      `(quiet band ${QUIET_FLOOR_DB}..${QUIET_CEILING_DB} dB)`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
