/**
 * When each video is told to go live.
 *
 * The factory used to hand Postiz `date: new Date()` — post this now — and the
 * six-hour spacing came from how often the publish workflow was allowed to
 * fire. That coupled the posting schedule to GitHub's scheduler, which on a
 * free public repo drops runs and fires others ninety minutes late.
 *
 * Now the publisher assigns each video a slot on a fixed grid and hands Postiz
 * a future date. Postiz owns the clock from there, so a dropped GitHub run
 * delays the *handover* and changes nothing about when the video appears. The
 * grid starts on the embargo date and steps every six hours:
 *
 *   slot 0   2026-08-25 09:00 +0545
 *   slot 1   2026-08-25 15:00
 *   slot 2   2026-08-25 21:00
 *   slot 3   2026-08-26 03:00
 *   slot 4   2026-08-26 09:00        ... four a day, indefinitely
 *
 * Asia/Kathmandu is UTC+05:45 year round with no daylight saving, so a fixed
 * offset is exact here and no timezone database is needed.
 */

/**
 * Nothing may go live before this instant. 2026-08-25 09:00 in Kathmandu.
 *
 * This is the embargo the whole module exists to enforce, so it is also
 * checked independently in `assertWithinEmbargo` — a slot arithmetic bug must
 * not be able to produce an early post.
 */
export const FIRST_SLOT_ISO = process.env.POSTIZ_FIRST_SLOT ?? "2026-08-25T09:00:00+05:45";

/** Four a day. */
export const SLOT_GAP_HOURS = Number(process.env.POSTIZ_SLOT_GAP_HOURS ?? 6);

/**
 * How far ahead of "now" a slot must sit before Postiz is asked to hold it.
 * A date that has already passed by the time Postiz processes it is treated as
 * "publish immediately" by most schedulers, which would breach the embargo on
 * the very first post after a slow handover.
 */
export const MIN_LEAD_MS = 10 * 60 * 1000;

const HOUR_MS = 3_600_000;

function parseInstant(value, label) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new TypeError(`${label} is not an ISO 8601 instant: ${JSON.stringify(value)}`);
  }
  return ms;
}

/** The absolute time of slot `index`, counting from the embargo. */
export function slotAt(index, { firstSlot = FIRST_SLOT_ISO, gapHours = SLOT_GAP_HOURS } = {}) {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`slot index must be a non-negative integer — got ${index}`);
  }
  return new Date(parseInstant(firstSlot, "firstSlot") + index * gapHours * HOUR_MS);
}

/**
 * Every slot this queue has already promised to Postiz.
 *
 * Read from committed state rather than recomputed from a counter, so a run
 * that failed after Postiz accepted a post cannot hand the same slot out twice
 * on the retry.
 */
export function assignedSlots(state) {
  return (state?.scheduled ?? [])
    .map((entry) => Date.parse(entry?.at))
    .filter(Number.isFinite);
}

/**
 * The next free slot.
 *
 * Normally one gap after the latest slot already handed out. Two corrections
 * apply, in this order:
 *
 *   - never earlier than the embargo, so the first video lands on slot 0
 *     however long before 25 August it happened to be rendered;
 *   - never in the past (plus a lead time). If the factory has been idle and
 *     the grid has moved on, the next post snaps forward to the next slot that
 *     is still in the future rather than dumping a backlog of overdue posts
 *     into Postiz all at once.
 */
export function nextSlot(
  state,
  { now = Date.now(), firstSlot = FIRST_SLOT_ISO, gapHours = SLOT_GAP_HOURS, leadMs = MIN_LEAD_MS } = {},
) {
  const first = parseInstant(firstSlot, "firstSlot");
  const gap = gapHours * HOUR_MS;
  if (!(gap > 0)) throw new RangeError(`slot gap must be positive — got ${gapHours} hours`);

  const assigned = assignedSlots(state);
  const proposed = assigned.length ? Math.max(...assigned) + gap : first;
  const earliest = Math.max(first, now + leadMs);

  if (proposed >= earliest) return new Date(proposed);

  // Snap forward onto the grid so slots stay aligned to the original times of
  // day instead of drifting to whenever the factory happened to wake up.
  const steps = Math.ceil((earliest - first) / gap);
  return new Date(first + steps * gap);
}

/**
 * The last line of defence on "nothing before 25 August".
 *
 * Called with whatever is actually about to be sent to Postiz, after all the
 * arithmetic. If a future change to the grid, an env override or a hand-edited
 * state file would put a post before the embargo, this refuses to send it.
 */
export function assertWithinEmbargo(when, { firstSlot = FIRST_SLOT_ISO, postType } = {}) {
  const at = when instanceof Date ? when.getTime() : parseInstant(when, "scheduled date");
  const first = parseInstant(firstSlot, "firstSlot");

  if (!Number.isFinite(at)) {
    throw new TypeError("refusing to publish without a valid scheduled date");
  }
  if (at < first) {
    throw new Error(
      `refusing to publish: ${new Date(at).toISOString()} is before the ` +
        `${new Date(first).toISOString()} embargo`,
    );
  }

  // "now" makes Postiz ignore the date entirely and publish on receipt, which
  // would breach the embargo no matter what this module computed.
  if (postType === "now") {
    throw new Error(
      `refusing to publish: postType "now" ignores the scheduled date and would post ` +
        `immediately, before the ${new Date(first).toISOString()} embargo. Use "schedule".`,
    );
  }

  return new Date(at);
}

/** Human-readable in the plan's timezone, for logs and the job summary. */
export function describeSlot(when, timeZone = "Asia/Kathmandu") {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(when instanceof Date ? when : new Date(when));
}
