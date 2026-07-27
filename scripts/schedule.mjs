/**
 * Turns a cadence into per-item publish times, so plan.json holds three
 * clock times instead of ninety hand-written ISO timestamps.
 *
 *   "schedule": {
 *     "startDate": "2026-08-01",
 *     "timezone": "+05:45",
 *     "times": ["07:30", "12:30", "19:00"]
 *   }
 *
 * Items are laid out in order: the first three fill day one's three slots,
 * the next three fill day two, and so on. An item with its own publishAt
 * keeps it and is skipped by the layout.
 */

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OFFSET = /^[+-][01]\d:[0-5]\d$/;

export function scheduleErrors(schedule) {
  const errors = [];
  if (!schedule) return errors;

  if (!DATE.test(schedule.startDate ?? "")) {
    errors.push(`schedule.startDate must be YYYY-MM-DD — got "${schedule.startDate}"`);
  }
  if (schedule.timezone && !OFFSET.test(schedule.timezone)) {
    errors.push(`schedule.timezone must look like "+05:45" — got "${schedule.timezone}"`);
  }
  if (!Array.isArray(schedule.times) || schedule.times.length === 0) {
    errors.push("schedule.times must list at least one HH:MM time");
  } else {
    for (const t of schedule.times) {
      if (!TIME.test(t)) errors.push(`schedule.times: "${t}" is not HH:MM`);
    }
    if (new Set(schedule.times).size !== schedule.times.length) {
      errors.push("schedule.times has duplicates — two videos would publish at the same instant");
    }
  }
  return errors;
}

/** Returns a new items array with publishAt filled in on every item. */
export function expandSchedule(plan) {
  const s = plan.schedule;
  if (!s) return plan.items;

  const tz = s.timezone ?? "+00:00";
  const perDay = s.times.length;
  let slot = 0;

  return plan.items.map((item) => {
    if (item.publishAt) return item;

    const dayOffset = Math.floor(slot / perDay);
    const time = s.times[slot % perDay];
    slot += 1;

    // Build the local wall-clock instant, then let Date resolve the offset.
    const [y, m, d] = s.startDate.split("-").map(Number);
    const day = new Date(Date.UTC(y, m - 1, d + dayOffset));
    const dateStr = day.toISOString().slice(0, 10);

    return { ...item, publishAt: new Date(`${dateStr}T${time}:00.000${tz}`).toISOString() };
  });
}
