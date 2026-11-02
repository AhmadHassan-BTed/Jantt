/**
 * Jantt Multi-Calendar & Statutory Holiday Matrix Engine
 *
 * Implements enterprise working-time arithmetic, custom shifts,
 * statutory holiday registries, and hierarchical calendar resolution.
 * Strictly zero external dependencies.
 */

import { parseISODate, formatISODate, isValidISODate, addDays, diffDays } from "./date-math";
import type { Task, Person } from "./types";

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sun, 1 = Mon, ..., 6 = Sat

export type CalendarPreset = "standard" | "continuous" | "compressed_4x10";

export type RegionCode = "US" | "UK" | "GB" | "EU" | "CA" | "AU";

export interface HolidayDefinition {
  date: string; // YYYY-MM-DD
  name?: string;
}

export interface WorkingCalendar {
  id?: string;
  name?: string;
  /** Working days of week (0=Sun, 1=Mon... 6=Sat). Defaults to [1, 2, 3, 4, 5]. */
  workingDays?: DayOfWeek[];
  /** Statutory or custom holidays (ISO date string or HolidayDefinition). */
  holidays?: (string | HolidayDefinition)[];
  /** ISO-3166 Region code for automatic statutory holiday calculation. */
  region?: RegionCode | string;
  /** Custom day-specific overrides (force-working or force-holiday). */
  exceptions?: { date: string; isWorkingDay: boolean; name?: string }[];
}

export const CALENDAR_PRESETS: Record<CalendarPreset, WorkingCalendar> = {
  standard: {
    id: "standard",
    name: "Standard (Mon-Fri)",
    workingDays: [1, 2, 3, 4, 5],
    holidays: []
  },
  continuous: {
    id: "continuous",
    name: "Continuous 24/7",
    workingDays: [0, 1, 2, 3, 4, 5, 6],
    holidays: []
  },
  compressed_4x10: {
    id: "compressed_4x10",
    name: "Compressed 4x10 (Mon-Thu)",
    workingDays: [1, 2, 3, 4],
    holidays: []
  }
};

/**
 * Calculates Western Easter Sunday for a given year using Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
 */
export function getEasterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Finds the Nth occurrence of a specific weekday in a given month.
 * e.g. 4th Thursday of November, 1st Monday of September.
 * Occurrence can be negative to count backwards (e.g. -1 for last Monday of May).
 */
export function getNthWeekdayOfMonth(
  year: number,
  month: number, // 1-12
  dayOfWeek: DayOfWeek,
  nth: number
): string {
  if (nth > 0) {
    let date = new Date(Date.UTC(year, month - 1, 1));
    let count = 0;
    while (date.getUTCMonth() === month - 1) {
      if (date.getUTCDay() === dayOfWeek) {
        count++;
        if (count === nth) {
          return formatISODate(date);
        }
      }
      date.setUTCDate(date.getUTCDate() + 1);
    }
  } else {
    // Count backward from end of month
    let date = new Date(Date.UTC(year, month, 0)); // last day of month
    let count = 0;
    while (date.getUTCMonth() === month - 1) {
      if (date.getUTCDay() === dayOfWeek) {
        count--;
        if (count === nth) {
          return formatISODate(date);
        }
      }
      date.setUTCDate(date.getUTCDate() - 1);
    }
  }
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/**
 * Standard observation adjustment:
 * If a fixed holiday falls on Saturday, observe on Friday.
 * If on Sunday, observe on Monday.
 */
function observedDate(isoDate: string): string {
  const d = parseISODate(isoDate);
  const day = d.getUTCDay();
  if (day === 6) {
    // Saturday -> Friday
    return addDays(isoDate, -1);
  }
  if (day === 0) {
    // Sunday -> Monday
    return addDays(isoDate, 1);
  }
  return isoDate;
}

/**
 * Generates statutory holidays for supported region codes and years.
 */
export function getStatutoryHolidays(region: string, year: number): HolidayDefinition[] {
  const normRegion = region.trim().toUpperCase();
  const holidays: HolidayDefinition[] = [];

  if (normRegion === "US") {
    holidays.push({ date: observedDate(`${year}-01-01`), name: "New Year's Day" });
    holidays.push({ date: getNthWeekdayOfMonth(year, 1, 1, 3), name: "Martin Luther King Jr. Day" });
    holidays.push({ date: getNthWeekdayOfMonth(year, 2, 1, 3), name: "Presidents' Day" });
    holidays.push({ date: getNthWeekdayOfMonth(year, 5, 1, -1), name: "Memorial Day" });
    holidays.push({ date: observedDate(`${year}-06-19`), name: "Juneteenth" });
    holidays.push({ date: observedDate(`${year}-07-04`), name: "Independence Day" });
    holidays.push({ date: getNthWeekdayOfMonth(year, 9, 1, 1), name: "Labor Day" });
    holidays.push({ date: getNthWeekdayOfMonth(year, 10, 1, 2), name: "Columbus Day" });
    holidays.push({ date: observedDate(`${year}-11-11`), name: "Veterans Day" });
    holidays.push({ date: getNthWeekdayOfMonth(year, 11, 4, 4), name: "Thanksgiving Day" });
    holidays.push({ date: observedDate(`${year}-12-25`), name: "Christmas Day" });
  } else if (normRegion === "UK" || normRegion === "GB") {
    holidays.push({ date: observedDate(`${year}-01-01`), name: "New Year's Day" });
    const easter = getEasterSunday(year);
    holidays.push({ date: addDays(easter, -2), name: "Good Friday" });
    holidays.push({ date: addDays(easter, 1), name: "Easter Monday" });
    holidays.push({ date: getNthWeekdayOfMonth(year, 5, 1, 1), name: "Early May Bank Holiday" });
    holidays.push({ date: getNthWeekdayOfMonth(year, 5, 1, -1), name: "Spring Bank Holiday" });
    holidays.push({ date: getNthWeekdayOfMonth(year, 8, 1, -1), name: "Summer Bank Holiday" });
    // Christmas and Boxing Day
    const dec25 = parseISODate(`${year}-12-25`);
    const dec25Day = dec25.getUTCDay();
    if (dec25Day === 5) {
      // Friday
      holidays.push({ date: `${year}-12-25`, name: "Christmas Day" });
      holidays.push({ date: `${year}-12-28`, name: "Boxing Day (Observed)" });
    } else if (dec25Day === 6) {
      // Saturday
      holidays.push({ date: `${year}-12-28`, name: "Christmas Day (Observed)" });
      holidays.push({ date: `${year}-12-29`, name: "Boxing Day (Observed)" });
    } else if (dec25Day === 0) {
      // Sunday
      holidays.push({ date: `${year}-12-27`, name: "Christmas Day (Observed)" });
      holidays.push({ date: `${year}-12-28`, name: "Boxing Day (Observed)" });
    } else {
      holidays.push({ date: `${year}-12-25`, name: "Christmas Day" });
      holidays.push({ date: `${year}-12-26`, name: "Boxing Day" });
    }
  } else if (normRegion === "EU") {
    holidays.push({ date: `${year}-01-01`, name: "New Year's Day" });
    const easter = getEasterSunday(year);
    holidays.push({ date: addDays(easter, 1), name: "Easter Monday" });
    holidays.push({ date: `${year}-05-01`, name: "Labour Day" });
    holidays.push({ date: addDays(easter, 39), name: "Ascension Day" });
    holidays.push({ date: addDays(easter, 50), name: "Whit Monday" });
    holidays.push({ date: `${year}-12-25`, name: "Christmas Day" });
    holidays.push({ date: `${year}-12-26`, name: "Second Day of Christmas" });
  }

  return holidays;
}

/**
 * Creates and normalizes a WorkingCalendar instance.
 */
export function createCalendar(
  config?: Partial<WorkingCalendar> | CalendarPreset
): WorkingCalendar {
  if (typeof config === "string" && CALENDAR_PRESETS[config]) {
    return { ...CALENDAR_PRESETS[config] };
  }
  const base = CALENDAR_PRESETS.standard;
  if (!config || typeof config !== "object") {
    return { ...base };
  }
  return {
    id: config.id || "custom",
    name: config.name || "Custom Calendar",
    workingDays: config.workingDays ? [...config.workingDays] : [...(base.workingDays || [1, 2, 3, 4, 5])],
    holidays: config.holidays ? [...config.holidays] : [],
    region: config.region,
    exceptions: config.exceptions ? [...config.exceptions] : []
  };
}

/**
 * Internal helper to check if a specific date string is a holiday or exception in the calendar.
 */
function getDayStatus(
  dateStr: string,
  calendar: WorkingCalendar
): { isException: boolean; isWorking?: boolean; isHoliday: boolean } {
  // Check exceptions first
  if (calendar.exceptions && calendar.exceptions.length > 0) {
    const matchEx = calendar.exceptions.find((ex) => ex.date === dateStr);
    if (matchEx) {
      return { isException: true, isWorking: matchEx.isWorkingDay, isHoliday: !matchEx.isWorkingDay };
    }
  }

  // Check explicit holidays list
  if (calendar.holidays && calendar.holidays.length > 0) {
    const isExplicitHoliday = calendar.holidays.some((h) => {
      const d = typeof h === "string" ? h : h.date;
      return d === dateStr;
    });
    if (isExplicitHoliday) {
      return { isException: false, isHoliday: true };
    }
  }

  // Check regional statutory holidays
  if (calendar.region) {
    const year = parseInt(dateStr.slice(0, 4), 10);
    const statutory = getStatutoryHolidays(calendar.region, year);
    if (statutory.some((h) => h.date === dateStr)) {
      return { isException: false, isHoliday: true };
    }
  }

  return { isException: false, isHoliday: false };
}

/**
 * Checks whether a given ISO date or Date object is a working day under the specified calendar.
 */
export function isWorkingDay(
  date: string | Date,
  calendar?: WorkingCalendar | CalendarPreset
): boolean {
  const cal = createCalendar(calendar);
  const dateStr = typeof date === "string" ? date.split("T")[0].trim() : formatISODate(date);
  if (!isValidISODate(dateStr)) return false;

  const status = getDayStatus(dateStr, cal);
  if (status.isException && status.isWorking !== undefined) {
    return status.isWorking;
  }
  if (status.isHoliday) {
    return false;
  }

  const d = parseISODate(dateStr);
  const dayOfWeek = d.getUTCDay() as DayOfWeek;
  const workingDays = cal.workingDays || [1, 2, 3, 4, 5];
  return workingDays.includes(dayOfWeek);
}

/**
 * Returns the next working day starting from the given date (exclusive of given date if it is not working).
 * If date is already a working day, returns date.
 */
export function getNextWorkingDay(
  date: string | Date,
  calendar?: WorkingCalendar | CalendarPreset
): string {
  const cal = createCalendar(calendar);
  let curr = typeof date === "string" ? date.split("T")[0].trim() : formatISODate(date);
  let guard = 0;
  while (!isWorkingDay(curr, cal) && guard < 366) {
    curr = addDays(curr, 1);
    guard++;
  }
  return curr;
}

/**
 * Returns the previous working day starting from the given date.
 * If date is already a working day, returns date.
 */
export function getPreviousWorkingDay(
  date: string | Date,
  calendar?: WorkingCalendar | CalendarPreset
): string {
  const cal = createCalendar(calendar);
  let curr = typeof date === "string" ? date.split("T")[0].trim() : formatISODate(date);
  let guard = 0;
  while (!isWorkingDay(curr, cal) && guard < 366) {
    curr = addDays(curr, -1);
    guard++;
  }
  return curr;
}

/**
 * Adds an integer number of working days to an ISO date under the specified calendar.
 *
 * Behavior:
 * - If `days === 0`: Returns `date` if it is a working day, otherwise snaps to next working day.
 * - If `days > 0`: Steps forward, advancing by 1 day until `days` working days have elapsed.
 * - If `days < 0`: Steps backward, decreasing by 1 day until `|days|` working days have elapsed.
 */
export function addWorkingDays(
  date: string | Date,
  days: number,
  calendar?: WorkingCalendar | CalendarPreset
): string {
  const cal = createCalendar(calendar);
  let curr = typeof date === "string" ? date.split("T")[0].trim() : formatISODate(date);
  const targetDays = Number.isFinite(days) ? Math.round(days) : 0;

  if (targetDays === 0) {
    return isWorkingDay(curr, cal) ? curr : getNextWorkingDay(curr, cal);
  }

  const step = targetDays > 0 ? 1 : -1;
  let remaining = Math.abs(targetDays);
  let guard = 0;
  const MAX_STEPS = 5000;

  while (remaining > 0 && guard < MAX_STEPS) {
    curr = addDays(curr, step);
    if (isWorkingDay(curr, cal)) {
      remaining--;
    }
    guard++;
  }

  return curr;
}

/**
 * Calculates the difference in working days between two dates under the specified calendar.
 * Returns (endDate - startDate) in working days.
 *
 * Example:
 * If Monday is day 0 and Tuesday is day 1, diffWorkingDays(Mon, Tue) = 1.
 * If Friday to Monday, diffWorkingDays(Fri, Mon) = 1 (skipping Sat & Sun).
 */
export function diffWorkingDays(
  startDate: string | Date,
  endDate: string | Date,
  calendar?: WorkingCalendar | CalendarPreset
): number {
  const cal = createCalendar(calendar);
  const startStr = typeof startDate === "string" ? startDate.split("T")[0].trim() : formatISODate(startDate);
  const endStr = typeof endDate === "string" ? endDate.split("T")[0].trim() : formatISODate(endDate);

  if (startStr === endStr) return 0;

  const inverted = diffDays(startStr, endStr) < 0;
  let a = inverted ? endStr : startStr;
  const b = inverted ? startStr : endStr;

  let workingCount = 0;
  let curr = addDays(a, 1);
  let guard = 0;
  const MAX_DAYS = 10000;

  while (diffDays(curr, b) >= 0 && guard < MAX_DAYS) {
    if (isWorkingDay(curr, cal)) {
      workingCount++;
    }
    curr = addDays(curr, 1);
    guard++;
  }

  return inverted ? -workingCount : workingCount;
}

/**
 * Returns an array of all working date strings within an inclusive range [startDate, endDate].
 */
export function getWorkingDaysInRange(
  startDate: string | Date,
  endDate: string | Date,
  calendar?: WorkingCalendar | CalendarPreset
): string[] {
  const cal = createCalendar(calendar);
  let curr = typeof startDate === "string" ? startDate.split("T")[0].trim() : formatISODate(startDate);
  const end = typeof endDate === "string" ? endDate.split("T")[0].trim() : formatISODate(endDate);

  const result: string[] = [];
  let guard = 0;
  const MAX_DAYS = 5000;

  while (diffDays(curr, end) >= 0 && guard < MAX_DAYS) {
    if (isWorkingDay(curr, cal)) {
      result.push(curr);
    }
    curr = addDays(curr, 1);
    guard++;
  }

  return result;
}

/**
 * Hierarchically resolves the effective working calendar for a task.
 *
 * Priority order:
 * 1. Task inline `calendar` or `task.calendarId`
 * 2. Assignee / Person `calendar` or `person.calendarId`
 * 3. Default calendar provided in context
 * 4. Standard (Mon-Fri) calendar
 */
export function resolveTaskCalendar(
  task: Task,
  context?: {
    people?: Person[];
    calendars?: Record<string, WorkingCalendar>;
    defaultCalendar?: WorkingCalendar | CalendarPreset;
  }
): WorkingCalendar {
  // 1. Task calendar
  if (task.calendar) {
    if (typeof task.calendar === "object") {
      return createCalendar(task.calendar as WorkingCalendar);
    }
    if (typeof task.calendar === "string") {
      if (context?.calendars?.[task.calendar]) {
        return context.calendars[task.calendar];
      }
      if (CALENDAR_PRESETS[task.calendar as CalendarPreset]) {
        return CALENDAR_PRESETS[task.calendar as CalendarPreset];
      }
    }
  }
  if (task.calendarId && context?.calendars?.[task.calendarId]) {
    return context.calendars[task.calendarId];
  }

  // 2. Assignee / Person calendar
  if (task.assignee && context?.people) {
    const person = context.people.find(
      (p) => p.id === task.assignee || p.name === task.assignee
    );
    if (person) {
      if (person.calendar) {
        if (typeof person.calendar === "object") {
          return createCalendar(person.calendar as WorkingCalendar);
        }
        if (typeof person.calendar === "string") {
          if (context?.calendars?.[person.calendar]) {
            return context.calendars[person.calendar];
          }
          if (CALENDAR_PRESETS[person.calendar as CalendarPreset]) {
            return CALENDAR_PRESETS[person.calendar as CalendarPreset];
          }
        }
      }
      if (person.calendarId && context?.calendars?.[person.calendarId]) {
        return context.calendars[person.calendarId];
      }
    }
  }

  // 3. Default calendar
  if (context?.defaultCalendar) {
    return createCalendar(context.defaultCalendar);
  }

  // 4. Fallback Standard
  return CALENDAR_PRESETS.standard;
}
