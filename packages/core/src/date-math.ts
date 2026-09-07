/**
 * Date arithmetic and calendar helper utilities.
 * Zero external dependencies. Operates safely in UTC.
 */

const DAY_MS = 86400000;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const MONTH_NAMES_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const DAY_NAMES_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * Checks if a string conforms to YYYY-MM-DD and represents a real calendar date.
 */
export function isValidISODate(dateStr: string): boolean {
  if (typeof dateStr !== "string") {
    return false;
  }
  const clean = dateStr.split("T")[0].trim();
  if (!ISO_DATE_REGEX.test(clean)) {
    return false;
  }
  const [yearStr, monthStr, dayStr] = clean.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1000 || year > 9999) {
    return false;
  }

  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Parses YYYY-MM-DD into a UTC Date instance.
 * Gracefully strips any trailing ISO time component (e.g. T00:00:00Z).
 */
export function parseISODate(dateStr: string): Date {
  const cleanStr = typeof dateStr === "string" ? dateStr.split("T")[0].trim() : "";
  if (!isValidISODate(cleanStr)) {
    // Fallback best effort or return current UTC
    const parts = (cleanStr || "").split("-");
    const y = parseInt(parts[0], 10) || 2026;
    const m = (parseInt(parts[1], 10) || 1) - 1;
    const d = parseInt(parts[2], 10) || 1;
    return new Date(Date.UTC(y, m, d));
  }
  const [y, m, d] = cleanStr.split("-").map((p) => parseInt(p, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Formats a Date object to YYYY-MM-DD using UTC values.
 */
export function formatISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Adds an integer number of days to an ISO date string and returns the resulting ISO date.
 * Safely guards against non-finite/NaN day inputs.
 */
export function addDays(dateStr: string, days: number): string {
  const safeDays = Number.isFinite(days) ? Math.round(days) : 0;
  const d = parseISODate(dateStr);
  d.setUTCDate(d.getUTCDate() + safeDays);
  return formatISODate(d);
}

/**
 * Returns (b - a) in whole days.
 * E.g. diffDays("2026-09-01", "2026-09-05") === 4
 */
export function diffDays(startDateStr: string, endDateStr: string): number {
  const a = parseISODate(startDateStr);
  const b = parseISODate(endDateStr);
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/**
 * Computes the inclusive calendar duration of a task in days.
 * Milestones return 0; valid ranges return (end - start) + 1.
 * Inverted dates return 0.
 */
export function taskDurationDays(startDateStr: string, endDateStr: string, isMilestone = false): number {
  if (isMilestone) return 0;
  const diff = diffDays(startDateStr, endDateStr);
  return diff >= 0 ? diff + 1 : 0;
}

/**
 * Returns the earlier of two dates.
 */
export function minISODate(a: string, b: string): string {
  return diffDays(a, b) >= 0 ? a : b;
}

/**
 * Returns the later of two dates.
 */
export function maxISODate(a: string, b: string): string {
  return diffDays(a, b) >= 0 ? b : a;
}

/**
 * Returns today's date in YYYY-MM-DD for the given Date instance.
 */
export function getTodayISODate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns the fractional progress through today [0, 1) for the given Date instance.
 * At 00:00 (start of day), returns 0.0 (leftmost edge of today's column).
 * At 12:00 (noon), returns 0.5 (center of today's column).
 * Approaching 23:59:59, approaches 1.0 (rightmost edge of today's column).
 */
export function getTodayProgressFraction(now: Date = new Date()): number {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const ms = now.getMilliseconds();
  const totalSeconds = hours * 3600 + minutes * 60 + seconds + ms / 1000;
  return Math.min(Math.max(totalSeconds / 86400, 0), 0.9999);
}

/**
 * Returns the month name alone (e.g. 'September' or 'Sep')
 */
export function getMonthNameOnly(dateStr: string, full = true): string {
  const d = parseISODate(dateStr);
  const m = d.getUTCMonth();
  return full ? MONTH_NAMES_FULL[m] : MONTH_NAMES_SHORT[m];
}

/**
 * Returns the short month name (e.g. 'Sep 2026')
 */
export function formatMonthYear(dateStr: string, full = false): string {
  const d = parseISODate(dateStr);
  const m = d.getUTCMonth();
  const y = d.getUTCFullYear();
  const name = full ? MONTH_NAMES_FULL[m] : MONTH_NAMES_SHORT[m];
  return `${name} ${y}`;
}

/**
 * Returns short day name ("Mo", "Tu", etc.)
 */
export function getDayOfWeekShort(dateStr: string): string {
  const d = parseISODate(dateStr);
  return DAY_NAMES_SHORT[d.getUTCDay()];
}

/**
 * Checks if the given date falls on a weekend (Saturday or Sunday).
 */
export function isWeekend(dateStr: string): boolean {
  const day = parseISODate(dateStr).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Formats a date nicely for humans (e.g. 'Sep 12, 2026').
 */
export function formatHumanDate(dateStr: string): string {
  if (!isValidISODate(dateStr)) return dateStr;
  const d = parseISODate(dateStr);
  const m = MONTH_NAMES_SHORT[d.getUTCMonth()];
  const day = d.getUTCDate();
  const y = d.getUTCFullYear();
  return `${m} ${day}, ${y}`;
}

/**
 * Checks if a task's date range [start, end] overlaps with a specific date.
 * Returns true if: start <= date <= end
 */
export function isTaskOnDate(taskStart: string, taskEnd: string, date: string): boolean {
  if (!isValidISODate(taskStart) || !isValidISODate(taskEnd) || !isValidISODate(date)) {
    return false;
  }
  return diffDays(taskStart, date) >= 0 && diffDays(date, taskEnd) >= 0;
}


/**
 * Checks if a task's date range overlaps with today's date.
 */
export function isTaskToday(taskStart: string, taskEnd: string): boolean {
  return isTaskOnDate(taskStart, taskEnd, getTodayISODate());
}
