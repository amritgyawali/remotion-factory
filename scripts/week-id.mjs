/**
 * The one place that turns "which week is this video from" into the string
 * that names it in storage.
 *
 * This module exists because that conversion was got wrong, silently, in three
 * places at once. `archivedQueueSnapshot` hangs the plan's week *object* —
 * `{ id: "2026-w31", order: 202631 }` — on every queue entry, and the render
 * batch destructured `week` from the entry and passed it straight through as
 * `weekId`. Every archive destination then interpolated it into a path:
 *
 *   GitHub Release tag  ->  "videos-[object Object]"   422, whole batch lost
 *   R2 key              ->  "[object Object]/d01-c.mp4"
 *   Cloudinary publicId ->  "meritbyte/[object Object]/d01-c"
 *
 * GitHub rejecting the tag is what made it visible; it failed after four
 * renders had already finished, so a morning's compute was spent and thrown
 * away. R2 and Cloudinary would have taken that path without complaint, which
 * is the worse outcome — a year of archives filed under one nonsense prefix.
 *
 * The obvious fix is `.id` at the call site. That is the same one-line mistake
 * left available to the next caller, so instead every storage identifier is
 * normalised here, where the wrong shape is a loud error naming the caller
 * rather than a plausible-looking path.
 */

/**
 * Tag-safe and path-safe: what GitHub accepts as a ref name, R2 as a key
 * prefix, and Cloudinary as a public id segment. Deliberately narrower than
 * any one of them — the intersection is what a week id may use.
 */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** A description precise enough to debug from, without dumping a whole plan. */
function describe(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `the empty string`;
  if (typeof value === "object") {
    const keys = Object.keys(value);
    return `an object with keys [${keys.join(", ")}]`;
  }
  return `a ${typeof value} (${String(value)})`;
}

/**
 * Normalise a week reference to its id string, or throw.
 *
 * Accepts the id itself or the `{ id, order }` week object, because both are
 * in circulation: `queue.nextWeek` is the object, `state.rendered[].week` is
 * the string. Anything else — most importantly an object that stringifies to
 * "[object Object]" — is a programming error and is reported as one.
 *
 * @param {unknown} value  a week id, or a week object carrying one
 * @param {string} context where this was called from, quoted in the error
 * @returns {string} the validated week id
 */
export function weekIdOf(value, context = "weekId") {
  const id = typeof value === "string" ? value : value?.id;

  if (typeof id !== "string" || id.length === 0) {
    throw new TypeError(
      `${context} must be a week id string or a { id } week object — got ${describe(value)}. ` +
        "Queue entries carry the week object on .week and its id on .weekId; " +
        "storage paths take .weekId.",
    );
  }

  if (!SAFE_ID.test(id)) {
    throw new TypeError(
      `${context} "${id}" is not usable as a release tag or storage key — it must start ` +
        "with a letter or digit and contain only letters, digits, dot, dash or underscore.",
    );
  }

  return id;
}

/** Non-throwing form, for display paths that must not take down a render. */
export function weekIdOrNull(value) {
  try {
    return weekIdOf(value);
  } catch {
    return null;
  }
}
