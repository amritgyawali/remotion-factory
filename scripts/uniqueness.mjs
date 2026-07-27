import { hammingDistance } from "./inspect-frames.mjs";

/**
 * Duplicate detection across everything ever published.
 *
 * The plan validator already refuses repeated ids, sources, captions, hooks and
 * visible copy, but all of that inspects the *plan*. It cannot catch a template
 * that ignores half its props and renders the same picture from different data,
 * or a score that falls back to the same default for every video. Those only
 * show up in the finished file.
 *
 * So each archived video carries a visual and an audio fingerprint, and a new
 * render is compared against every one of them before it may be published.
 */

/**
 * 8 frames x 64 bits. Two unrelated videos differ in hundreds of these; only a
 * genuine repeat lands near zero, so the threshold is deliberately tight — the
 * cost of a false positive is a blocked publish, which is worse than letting a
 * merely similar video through.
 */
export const VISUAL_BITS = 512;
export const MAX_VISUAL_DISTANCE = 16;

/** Per-bucket loudness difference on a 0-15 scale, averaged over 32 buckets. */
export const MAX_AUDIO_DISTANCE = 1;

export function visualDistance(a, b) {
  return hammingDistance(a, b);
}

/** Mean absolute difference between two hex loudness envelopes. */
export function audioDistance(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || !a.length) {
    return Infinity;
  }
  let total = 0;
  for (let i = 0; i < a.length; i++) {
    total += Math.abs(parseInt(a[i], 16) - parseInt(b[i], 16));
  }
  return total / a.length;
}

/**
 * Compare one candidate against the archive. Returns the conflicts found;
 * an empty array means the video is new.
 *
 * A video is only reported when BOTH its picture and its sound match an
 * existing one. Two DevJoke videos legitimately share a bed and a layout, and
 * two videos in the same series legitimately share a visual language — it is
 * the combination being identical that means nothing new was made.
 */
export function findDuplicates(candidate, videos, limits = {}) {
  const {
    maxVisual = MAX_VISUAL_DISTANCE,
    maxAudio = MAX_AUDIO_DISTANCE,
  } = limits;

  const conflicts = [];

  for (const other of videos) {
    if (!other || other.id === candidate.id) continue;

    const visual = visualDistance(candidate.visualSignature, other.visualSignature);
    const audio = audioDistance(candidate.audioSignature, other.audioSignature);

    if (visual <= maxVisual && audio <= maxAudio) {
      conflicts.push({
        id: other.id,
        week: other.week ?? null,
        visualDistance: visual,
        audioDistance: Number(audio.toFixed(3)),
      });
    }
  }

  return conflicts;
}

/** Human-readable reason a candidate may not be published. */
export function duplicateProblems(candidate, videos, limits = {}) {
  if (!candidate.visualSignature || !candidate.audioSignature) {
    return [
      "no visual or audio fingerprint was produced, so uniqueness could not be checked",
    ];
  }

  return findDuplicates(candidate, videos, limits).map(
    (conflict) =>
      `looks and sounds like "${conflict.id}"` +
      `${conflict.week ? ` (${conflict.week})` : ""}: ` +
      `${conflict.visualDistance}/${VISUAL_BITS} bits of picture differ, ` +
      `${conflict.audioDistance} mean loudness difference — nothing new was made`,
  );
}

/**
 * How distinct the archive is overall. Useful as a health signal: a series
 * whose minimum distance keeps falling is drifting towards sameness even if no
 * single pair trips the duplicate threshold.
 */
export function archiveSpread(videos) {
  const withSignatures = videos.filter((video) => video.visualSignature && video.audioSignature);
  if (withSignatures.length < 2) return null;

  let closestVisual = Infinity;
  let closestPair = null;

  for (let i = 0; i < withSignatures.length; i++) {
    for (let j = i + 1; j < withSignatures.length; j++) {
      const distance = visualDistance(
        withSignatures[i].visualSignature,
        withSignatures[j].visualSignature,
      );
      if (distance < closestVisual) {
        closestVisual = distance;
        closestPair = [withSignatures[i].id, withSignatures[j].id];
      }
    }
  }

  return { compared: withSignatures.length, closestVisual, closestPair };
}
