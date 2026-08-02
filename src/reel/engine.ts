/**
 * Orchestrates the reel pipeline: brief → render → verify → schedule.
 *
 * This is a documentation-only module. The actual pipeline runs in the GitHub
 * Actions workflow, which calls bundle.mjs, render-audio.mjs, render-chunk.mjs,
 * verify-render.mjs and schedule-one.mjs in sequence.
 *
 * For local development, the components in this folder can be previewed in the
 * Remotion Studio with any ReelProps passed as inputProps.
 */

export {};
