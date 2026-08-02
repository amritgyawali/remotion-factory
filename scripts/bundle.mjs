import { bundle } from "@remotion/bundler";
import { selectComposition } from "@remotion/renderer";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Bundle the project once and write down what the composition actually is.
 *
 * Two jobs, and the second is the reason this is a script rather than a line in
 * a workflow. Fan-out rendering splits a video into frame ranges across several
 * runners, and every one of those runners has to agree on the total frame count
 * before any of them starts — otherwise the stitch step finds a gap and nobody
 * can say which chunk was wrong. So the frame count is measured here, once,
 * from the real composition, and written to composition.json for the matrix to
 * read. Every later step asserts against that file instead of recomputing.
 *
 *   node scripts/bundle.mjs --id Day01A [--out out/bundle]
 */

const DEFAULT_OUT = path.join("out", "bundle");

function argValue(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

/**
 * Input props for `selectComposition`.
 *
 * `calculateMetadata` can change a composition's duration based on its props,
 * so measuring the frame count without the props the render will actually use
 * would measure a different video. Passed as JSON on the command line to keep
 * the workflow honest about what it is asking for.
 */
function inputProps() {
  const raw = argValue("--props", process.env.INPUT_PROPS ?? "");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`--props is not valid JSON: ${error.message}`);
  }
}

export async function bundleProject({ id, outDir = DEFAULT_OUT, props = {} } = {}) {
  if (!id) throw new Error("bundleProject({ id }) is required — pass --id <compositionId>");

  // Remotion's bundler requires an absolute path for outDir.
  const absOut = path.resolve(outDir);
  await mkdir(path.dirname(absOut), { recursive: true });
  await rm(absOut, { recursive: true, force: true });

  const started = Date.now();
  const serveUrl = await bundle({
    entryPoint: path.resolve("src/index.ts"),
    outDir: absOut,
    // The bundle is thrown away with the runner, so the public folder can be
    // linked rather than copied. On Windows this silently falls back to a copy.
    symlinkPublicDir: true,
  });
  const bundleSeconds = (Date.now() - started) / 1000;

  const composition = await selectComposition({
    serveUrl,
    id,
    inputProps: props,
    chromiumOptions: { gl: "swangle" },
  });

  const manifest = {
    id: composition.id,
    durationInFrames: composition.durationInFrames,
    fps: composition.fps,
    width: composition.width,
    height: composition.height,
    serveUrl,
    props,
  };

  const manifestPath = path.join("out", "composition.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    `bundled ${id} in ${bundleSeconds.toFixed(1)}s — ` +
      `${composition.width}x${composition.height} @ ${composition.fps}fps, ` +
      `${composition.durationInFrames} frames ` +
      `(${(composition.durationInFrames / composition.fps).toFixed(2)}s)`,
  );
  console.log(`wrote ${manifestPath}`);

  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bundleProject({
    id: argValue("--id", process.env.COMPOSITION_ID),
    outDir: argValue("--out", DEFAULT_OUT),
    props: inputProps(),
  }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
