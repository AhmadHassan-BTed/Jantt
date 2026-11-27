/**
 * Date arithmetic and calendar helper utilities.
 * Zero external dependencies. Operates safely in UTC.
 */

import type { TimeFormat } from "./types";

const DAY_MS = 86400000;
export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 1440;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
/** Optional, well-formed ISO time suffix (`T08:30`, `T08:30:00.000Z`, `T08:30:00+02:00`). */
const ISO_TIME_SUFFIX_REGEX = /^T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,9}))?)?(Z|([+-])([01]\d|2[0-3]):?([0-5]\d))?$/;
/** Date prefix accepted by toEpochDay (same rules as isValidISODate). */
const EPOCH_DAY_INPUT_REGEX = /^\s*(\d{4})-(\d{2})-(\d{2})\s*(?:T|$)/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

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
 * Checks if a string conforms to YYYY-MM-DD (optionally followed by a valid ISO time suffix)
 * and represents a real calendar date.
 */
export function isValidISODate(dateStr: string): boolean {
  if (typeof dateStr !== "string") {
    return false;
  }
  const trimmed = dateStr.trim();
  const tIdx = trimmed.indexOf("T");
  const clean = tIdx === -1 ? trimmed : trimmed.slice(0, tIdx);
  if (!ISO_DATE_REGEX.test(clean)) {
    return false;
  }
  if (tIdx !== -1 && !ISO_TIME_SUFFIX_REGEX.test(trimmed.slice(tIdx))) {
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
 * Returns true when `dateStr` is a valid ISO date that includes an explicit time component (`T...`).
 */
export function hasTimeComponent(dateStr: unknown): boolean {
  if (typeof dateStr !== "string") return false;
  const trimmed = dateStr.trim();
  return trimmed.length > 10 && trimmed[10] === "T" && isValidISODate(trimmed);
}

/**
 * Converts a date/time string into whole UTC minutes since 1970-01-01T00:00.
 * Plain `YYYY-MM-DD` maps to 00:00 UTC of that day; naive `YYYY-MM-DDTHH:mm` preserves UTC wall-clock
 * minutes; explicit `Z` or `+-HH:mm` offsets are normalized to UTC. Returns NaN for invalid values.
 */
export function toEpochMinutes(dateStr: string | null | undefined): number {
  if (typeof dateStr !== "string") return NaN;
  const trimmed = dateStr.trim();
  const day = toEpochDay(trimmed);
  if (Number.isNaN(day)) return NaN;
  const tIdx = trimmed.indexOf("T");
  if (tIdx === -1) return day * MINUTES_PER_DAY;
  const match = ISO_TIME_SUFFIX_REGEX.exec(trimmed.slice(tIdx));
  if (!match) return NaN;
  let totalMinutes = day * MINUTES_PER_DAY + +match[1] * MINUTES_PER_HOUR + +match[2];
  if (match[6]) {
    const offsetMinutes = +match[7] * MINUTES_PER_HOUR + +match[8];
    totalMinutes += match[6] === "+" ? -offsetMinutes : offsetMinutes;
  }
  return totalMinutes;
}

/**
 * Converts a non-milestone task's `end` boundary into exclusive end epoch minutes.
 * Plain dates (`YYYY-MM-DD`) are treated as inclusive through 24:00 of that day (`(day + 1) * 1440`),
 * while explicit timestamps (`YYYY-MM-DDTHH:mm`) map to their exact minute.
 */
export function toTaskEndEpochMinutes(dateStr: string | null | undefined): number {
  const min = toEpochMinutes(dateStr);
  if (Number.isNaN(min)) return NaN;
  return hasTimeComponent(dateStr) ? min : min + MINUTES_PER_DAY;
}

/**
 * Inverse of {@link toEpochMinutes}: formats minutes since 1970-01-01T00:00 (UTC)
 * as `YYYY-MM-DDTHH:mm` (or `YYYY-MM-DD` when `includeTime` is false).
 */
export function fromEpochMinutes(epochMinutes: number, includeTime = true): string {
  if (!Number.isFinite(epochMinutes)) return includeTime ? "2026-01-01T00:00" : "2026-01-01";
  const rounded = Math.round(epochMinutes);
  const day = Math.floor(rounded / MINUTES_PER_DAY);
  const datePart = fromEpochDay(day);
  if (!includeTime) return datePart;
  const minsOfDay = ((rounded % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hh = String(Math.floor(minsOfDay / MINUTES_PER_HOUR)).padStart(2, "0");
  const mm = String(minsOfDay % MINUTES_PER_HOUR).padStart(2, "0");
  return `${datePart}T${hh}:${mm}`;
}

/**
 * Extracts the UTC `YYYY-MM-DD` calendar date portion of an ISO date or timestamp string.
 */
export function getDatePart(dateStr: string): string {
  if (hasTimeComponent(dateStr)) {
    const mins = toEpochMinutes(dateStr);
    if (Number.isFinite(mins)) return fromEpochDay(Math.floor(mins / MINUTES_PER_DAY));
  }
  return formatISODate(parseISODate(dateStr));
}

/**
 * Extracts the UTC `HH:mm` time portion of a timestamp string, or `""` for plain `YYYY-MM-DD` dates.
 */
export function getTimePart(dateStr: string): string {
  if (!hasTimeComponent(dateStr)) return "";
  const mins = toEpochMinutes(dateStr);
  if (!Number.isFinite(mins)) return "";
  const minsOfDay = ((Math.round(mins) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hh = String(Math.floor(minsOfDay / MINUTES_PER_HOUR)).padStart(2, "0");
  const mm = String(minsOfDay % MINUTES_PER_HOUR).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Strict variant of {@link isValidISODate} for validating stored plan data: the raw string must be
 * exactly `YYYY-MM-DD` (a real calendar date), optionally followed by a well-formed ISO time
 * (`2026-01-01T09:00:00Z`). Surrounding whitespace and trailing garbage are rejected.
 */
export function isStrictISODate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const datePart = value.slice(0, 10);
  if (!ISO_DATE_REGEX.test(datePart) || !isValidISODate(datePart)) return false;
  return value.length === 10 || ISO_TIME_SUFFIX_REGEX.test(value.slice(10));
}

/**
 * Converts an ISO date to whole days since 1970-01-01 (UTC) for fast integer scheduling math.
 * Returns NaN for anything that is not a real calendar date, so callers can skip bad data
 * instead of silently scheduling against a fallback date.
 */
export function toEpochDay(dateStr: string | null | undefined): number {
  if (typeof dateStr !== "string") return NaN;
  // Same acceptance rules as isValidISODate (optional surrounding whitespace / time suffix), one pass
  const m = EPOCH_DAY_INPUT_REGEX.exec(dateStr);
  if (!m) return NaN;
  const year = +m[1];
  const month = +m[2];
  const day = +m[3];
  if (year < 1000 || month < 1 || month > 12 || day < 1) return NaN;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (day > (month === 2 && leap ? 29 : DAYS_IN_MONTH[month - 1])) return NaN;
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/**
 * Inverse of {@link toEpochDay}: formats whole days since 1970-01-01 (UTC) as YYYY-MM-DD.
 */
export function fromEpochDay(epochDay: number): string {
  return formatISODate(new Date(epochDay * DAY_MS));
}

/**
 * Parses YYYY-MM-DD into a UTC Date instance.
 * Gracefully strips any trailing ISO time component (e.g. T00:00:00Z).
 *
 * Lenient by design (rendering must never crash on a bad cell): input that is not a real
 * calendar date is parsed best-effort, with missing parts defaulting to 2026-01-01 and
 * out-of-range parts rolling over (e.g. "2026-02-30" -> 2026-03-02). Scheduling code that must
 * not act on such values should check {@link isValidISODate} or use {@link toEpochDay}.
 */
export function parseISODate(dateStr: string): Date {
  const cleanStr = typeof dateStr === "string" ? dateStr.split("T")[0].trim() : "";
  if (!isValidISODate(cleanStr)) {
    // Best-effort fallback (see doc comment): never throws, never returns an invalid Date
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
 * Adds an integer number of days to an ISO date or timestamp string, preserving any explicit `HH:mm` time.
 * Safely guards against non-finite/NaN day inputs.
 */
export function addDays(dateStr: string, days: number): string {
  const safeDays = Number.isFinite(days) ? Math.round(days) : 0;
  if (hasTimeComponent(dateStr)) {
    const mins = toEpochMinutes(dateStr);
    if (Number.isFinite(mins)) return fromEpochMinutes(mins + safeDays * MINUTES_PER_DAY, true);
  }
  const d = parseISODate(dateStr);
  d.setUTCDate(d.getUTCDate() + safeDays);
  return formatISODate(d);
}

/**
 * Adds an integer number of minutes to an ISO date or timestamp string.
 * Preserves plain `YYYY-MM-DD` format only when adding whole days to a plain calendar date.
 */
export function addMinutes(dateStr: string, minutes: number): string {
  const safeMinutes = Number.isFinite(minutes) ? Math.round(minutes) : 0;
  const baseMin = toEpochMinutes(dateStr);
  if (!Number.isFinite(baseMin)) {
    const d = parseISODate(dateStr);
    const fallbackMin = Math.round(d.getTime() / 60000) + safeMinutes;
    return fromEpochMinutes(fallbackMin, safeMinutes % MINUTES_PER_DAY !== 0);
  }
  const nextMin = baseMin + safeMinutes;
  const keepPlain = !hasTimeComponent(dateStr) && safeMinutes % MINUTES_PER_DAY === 0;
  return keepPlain ? fromEpochDay(Math.floor(nextMin / MINUTES_PER_DAY)) : fromEpochMinutes(nextMin, true);
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
 * Returns (b - a) in whole minutes using {@link toEpochMinutes}.
 */
export function diffMinutes(startDateStr: string, endDateStr: string): number {
  const a = toEpochMinutes(startDateStr);
  const b = toEpochMinutes(endDateStr);
  if (Number.isFinite(a) && Number.isFinite(b)) {
    return Math.round(b - a);
  }
  return diffDays(startDateStr, endDateStr) * MINUTES_PER_DAY;
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
 * Computes the effective duration of a task in minutes.
 * Plain-date endpoints treat `end` inclusively through 24:00 of the end day (`1d` = 1440m),
 * while timed endpoints compute exact `end - start` minutes. Milestones return 0.
 */
export function taskDurationMinutes(startDateStr: string, endDateStr: string, isMilestone = false): number {
  if (isMilestone) return 0;
  const startMin = toEpochMinutes(startDateStr);
  const endMin = toTaskEndEpochMinutes(endDateStr);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return 0;
  return Math.max(0, Math.round(endMin - startMin));
}

/**
 * Formats a minute duration cleanly (e.g. `45m`, `2h 30m`, `5d`, `1d 4h`).
 */
export function formatDurationLabel(minutes: number, style: "compact" | "long" = "compact"): string {
  const safe = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  if (safe === 0) return style === "compact" ? "0m" : "0 min";
  const days = Math.floor(safe / MINUTES_PER_DAY);
  const rem = safe % MINUTES_PER_DAY;
  if (style === "long" && rem === 0) {
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  const hours = Math.floor(rem / MINUTES_PER_HOUR);
  const mins = rem % MINUTES_PER_HOUR;
  if (style === "long" && days === 0 && hours === 0) {
    return `${mins} min`;
  }
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  return parts.join(" ");
}

/**
 * Returns the earlier of two dates/timestamps.
 */
export function minISODate(a: string, b: string): string {
  const ma = toEpochMinutes(a);
  const mb = toEpochMinutes(b);
  if (Number.isFinite(ma) && Number.isFinite(mb)) return ma <= mb ? a : b;
  return diffDays(a, b) >= 0 ? a : b;
}

/**
 * Returns the later of two dates/timestamps.
 */
export function maxISODate(a: string, b: string): string {
  const ma = toEpochMinutes(a);
  const mb = toEpochMinutes(b);
  if (Number.isFinite(ma) && Number.isFinite(mb)) return ma <= mb ? b : a;
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
 * Formats an hour/minute time-of-day in either 12-hour AM/PM (default) or 24-hour clock format.
 */
export function formatTimeOfDay(
  hours24: number,
  minutes: number,
  timeFormat: TimeFormat = "12h",
  compact = false
): string {
  const h = ((Math.floor(hours24) % 24) + 24) % 24;
  const m = ((Math.floor(minutes) % 60) + 60) % 60;
  if (timeFormat === "24h") {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  if (compact && m === 0) return `${h12} ${period}`;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

interface ParsedWallClockTimestamp {
  year: number;
  monthIndex: number;
  day: number;
  hours: number;
  minutes: number;
  hasTime: boolean;
}

const HAS_TZ_SUFFIX_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function parseWallClockTimestamp(isoStr?: string): ParsedWallClockTimestamp | null {
  if (typeof isoStr !== "string") return null;
  const trimmed = isoStr.trim();
  if (!trimmed) return null;

  if (HAS_TZ_SUFFIX_RE.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return {
      year: parsed.getFullYear(),
      monthIndex: parsed.getMonth(),
      day: parsed.getDate(),
      hours: parsed.getHours(),
      minutes: parsed.getMinutes(),
      hasTime: true
    };
  }

  if (!isValidISODate(trimmed)) return null;
  const mins = toEpochMinutes(trimmed);
  if (!Number.isFinite(mins)) return null;
  const d = new Date(Math.floor(mins / MINUTES_PER_DAY) * DAY_MS);
  const minsOfDay = ((Math.round(mins) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return {
    year: d.getUTCFullYear(),
    monthIndex: d.getUTCMonth(),
    day: d.getUTCDate(),
    hours: Math.floor(minsOfDay / MINUTES_PER_HOUR),
    minutes: minsOfDay % MINUTES_PER_HOUR,
    hasTime: hasTimeComponent(trimmed)
  };
}

/**
 * Formats an ISO note timestamp into readable local wall-clock form respecting `12h` or `24h`.
 */
export function formatTimestampWithFormat(
  isoStr?: string,
  timeFormat: TimeFormat = "12h",
  includeYear = true
): string {
  const parts = parseWallClockTimestamp(isoStr);
  if (!parts) return "";
  const m = MONTH_NAMES_SHORT[parts.monthIndex] || "Jan";
  const dateLabel = includeYear ? `${m} ${parts.day}, ${parts.year}` : `${m} ${parts.day}`;
  if (!parts.hasTime) return dateLabel;
  return `${dateLabel}, ${formatTimeOfDay(parts.hours, parts.minutes, timeFormat, false)}`;
}

/**
 * Extracts local `YYYY-MM-DD` and `HH:mm` values from a note timestamp for date/time inputs.
 */
export function splitTimestampToLocalInputs(isoStr?: string): { date: string; time: string } {
  const parts = parseWallClockTimestamp(isoStr);
  if (!parts) return { date: "", time: "" };
  const date = `${String(parts.year).padStart(4, "0")}-${String(parts.monthIndex + 1).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  const time = parts.hasTime
    ? `${String(parts.hours).padStart(2, "0")}:${String(parts.minutes).padStart(2, "0")}`
    : "";
  return { date, time };
}

/**
 * Combines `<input type="date">` and `<input type="time">` local values back into an ISO 8601 timestamp.
 */
export function combineLocalInputsToISO(dateVal: string, timeVal?: string): string {
  const cleanDate = typeof dateVal === "string" ? dateVal.trim() : "";
  if (!cleanDate) return "";
  const cleanTime = typeof timeVal === "string" ? timeVal.trim() : "";
  if (!cleanTime) return cleanDate;
  const dm = cleanDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = cleanTime.match(/^(\d{2}):(\d{2})/);
  if (!dm || !tm) return "";
  const local = new Date(
    Number(dm[1]),
    Number(dm[2]) - 1,
    Number(dm[3]),
    Number(tm[1]),
    Number(tm[2]),
    0,
    0
  );
  return Number.isNaN(local.getTime()) ? "" : local.toISOString();
}

/**
 * Formats a date/time nicely for humans (e.g. 'Sep 12, 2026' or 'Sep 12, 2026, 2:30 PM').
 */
export function formatHumanDate(
  dateStr: string,
  includeTime = true,
  timeFormat: TimeFormat = "12h"
): string {
  if (!isValidISODate(dateStr)) return dateStr;
  const mins = toEpochMinutes(dateStr);
  const d = Number.isFinite(mins) ? new Date(Math.floor(mins / MINUTES_PER_DAY) * DAY_MS) : parseISODate(dateStr);
  const m = MONTH_NAMES_SHORT[d.getUTCMonth()];
  const day = d.getUTCDate();
  const y = d.getUTCFullYear();
  if (includeTime && hasTimeComponent(dateStr) && Number.isFinite(mins)) {
    const minsOfDay = ((Math.round(mins) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const formattedTime = formatTimeOfDay(Math.floor(minsOfDay / MINUTES_PER_HOUR), minsOfDay % MINUTES_PER_HOUR, timeFormat, false);
    return `${m} ${day}, ${y}, ${formattedTime}`;
  }
  return `${m} ${day}, ${y}`;
}

/**
 * Checks if a task's date range [start, end] overlaps with a specific date.
 * Plain-date `end` is inclusive through 24:00 of that date; timed `end` is exclusive at exact minute.
 */
export function isTaskOnDate(taskStart: string, taskEnd: string, date: string): boolean {
  if (!isValidISODate(taskStart) || !isValidISODate(taskEnd) || !isValidISODate(date)) {
    return false;
  }
  const dayStartMin = toEpochDay(date) * MINUTES_PER_DAY;
  const dayEndMin = dayStartMin + MINUTES_PER_DAY;
  const sMin = toEpochMinutes(taskStart);
  const eMin = toTaskEndEpochMinutes(taskEnd);
  if (!Number.isFinite(sMin) || !Number.isFinite(eMin)) return false;
  if (sMin === eMin) return sMin >= dayStartMin && sMin < dayEndMin;
  return sMin < dayEndMin && eMin > dayStartMin;
}


/**
 * Checks if a task's date range overlaps with today's date.
 */
export function isTaskToday(taskStart: string, taskEnd: string): boolean {
  return isTaskOnDate(taskStart, taskEnd, getTodayISODate());
}
