const SCHOOL_TIMEZONE = "Asia/Kolkata";

/**
 * Returns today's date as YYYY-MM-DD in the school's local timezone,
 * not the server's (which is UTC in most deployments). Use this for any
 * "what day is it right now" logic -- attendance edit windows, default
 * date pickers, "today" comparisons -- instead of
 * `new Date().toISOString().slice(0, 10)`, which is wrong for roughly
 * 5.5 hours of every IST day.
 */
export function getSchoolLocalToday(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHOOL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date()); // en-CA locale formats as YYYY-MM-DD
}

/**
 * Returns a UTC-midnight `Date` anchored to today's date in the school's
 * local timezone. Use this where the caller needs a `Date` object (e.g. for
 * Prisma range queries built with `addDays`-style helpers) rather than the
 * plain `YYYY-MM-DD` string from `getSchoolLocalToday()`.
 */
export function getSchoolLocalTodayStart(): Date {
  return new Date(getSchoolLocalToday() + "T00:00:00.000Z");
}
