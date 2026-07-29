/**
 * Rendering happens on GitHub, not on anybody's laptop.
 *
 * This is an operational rule, not a preference, and it is enforced here rather
 * than written in the README because a README does not stop a tired operator at
 * midnight.
 *
 * The reasons it matters:
 *
 * - **Determinism.** remotion.config.ts pins the software GL path and sets
 *   concurrency from the core count precisely so that every render is
 *   reproducible. A laptop has a different core count, a different GPU, a
 *   different font stack and a different ffmpeg, so a locally produced master
 *   is not the file CI would have made. The duplicate detector compares
 *   fingerprints across the whole archive; a file rendered somewhere else is a
 *   fingerprint nothing else can be compared against.
 *
 * - **The archive is written, not just the file.** A non-dry render uploads to
 *   a GitHub Release, writes state.json and appends to archive/manifest.json. A
 *   local run doing that races the scheduled workflow for the same state, and
 *   the loser's work is silently discarded on the next rebase.
 *
 * - **Cost and heat.** A 17s clip is ~3.5 minutes on eight cores with x264 at
 *   preset "slow". A hundred and twenty of them is not a thing to discover your
 *   laptop is doing.
 *
 * The escape hatch is deliberately awkward to reach and deliberately loud:
 * ALLOW_LOCAL_RENDER=1 exists for debugging one composition, and it prints what
 * it is allowing so the output is never mistaken for a CI master.
 */

/** GitHub Actions sets both; `CI` alone is set by most other runners too. */
export function isContinuousIntegration(env = process.env) {
  return env.GITHUB_ACTIONS === "true" || env.CI === "true" || env.CI === "1";
}

export function localRenderAllowed(env = process.env) {
  return env.ALLOW_LOCAL_RENDER === "1";
}

/**
 * Throw unless this process is entitled to render.
 *
 * Returns a note for the caller to log rather than logging itself, so a script
 * that renders many videos prints the warning once rather than per video.
 */
export function assertRenderAllowed({ env = process.env, what = "a render" } = {}) {
  if (isContinuousIntegration(env)) return null;

  if (localRenderAllowed(env)) {
    return (
      `ALLOW_LOCAL_RENDER=1 — running ${what} on this machine. ` +
      "The output is a debug artefact: it is not reproducible, it must not be " +
      "published, and it must not be treated as a master."
    );
  }

  throw new Error(
    `Refusing to run ${what} outside CI.\n\n` +
      "This project renders on GitHub Actions. A local master is built against a\n" +
      "different core count, GPU path, font stack and ffmpeg, so it is not the file\n" +
      "CI would produce — and a non-dry run also writes state.json and the archive\n" +
      "manifest, which races the scheduled workflow.\n\n" +
      "  To render:  gh workflow run render-campaign.yml -f shards=10\n" +
      "  To preview: npm run studio\n\n" +
      "If you genuinely need one video locally to debug it, set ALLOW_LOCAL_RENDER=1\n" +
      "and pass --dry-run so nothing is archived.",
  );
}
