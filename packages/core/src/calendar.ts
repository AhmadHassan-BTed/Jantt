/**
 * Jantt Multi-Calendar & Statutory Holiday Matrix Engine
 *
 * Implements enterprise working-time arithmetic, custom shifts,
 * statutory holiday registries, and hierarchical calendar resolution.
 * Strictly zero external dependencies.
 *
 * Performance: a calendar is compiled once into an index (working weekdays, holiday and exception
 * day sets) that is cached per calendar object, statutory holidays are memoized per region and
 * year, and the day loops run on integer day numbers instead of re-parsing date strings.
 */

import { formatISODate, addDays, toEpochDay, fromEpochDay } from "./date-math";
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

const DEFAULT_WORKING_DAYS: DayOfWeek[] = [1, 2, 3, 4, 5];
const SUPPORTED_REGIONS: ReadonlySet<string> = new Set(["US", "UK", "GB", "EU", "CA", "AU"]);
const DAY_NAME_INDEX: Record<string, DayOfWeek> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** True when statutory holidays are generated for this region code (case-insensitive). */
export function isSupportedRegion(region: unknown): boolean {
  return typeof region === "string" && SUPPORTED_REGIONS.has(region.trim().toUpperCase());
}

/**
 * Normalizes a raw `workingDays` value: keeps integers 0-6 and day names ("Mon", "monday"),
 * de-duplicated and sorted. Returns null when the input yields no valid day.
 */
export function normalizeWorkingDays(raw: unknown): DayOfWeek[] | null {
  if (!Array.isArray(raw)) return null;
  const days = new Set<DayOfWeek>();
  for (const value of raw) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6) {
      days.add(value as DayOfWeek);
    } else if (typeof value === "string") {
      const day = DAY_NAME_INDEX[value.trim().slice(0, 3).toLowerCase()];
      if (day !== undefined) days.add(day);
    }
  }
  return days.size > 0 ? Array.from(days).sort((a, b) => a - b) : null;
}

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

/** Day of week (0 = Sunday) of an epoch day; 1970-01-01 was a Thursday. */
function weekdayOf(epochDay: number): number {
  return (((epochDay + 4) % 7) + 7) % 7;
}

function isWeekendDay(epochDay: number): boolean {
  const dow = weekdayOf(epochDay);
  return dow === 0 || dow === 6;
}

/**
 * How a fixed-date holiday that falls on a weekend is observed:
 * - "nearest": Saturday -> preceding Friday, Sunday -> following Monday (US federal).
 * - "next": the next weekday that is not already a holiday (UK, CA, AU substitute days).
 * - "none": not moved.
 */
type SubstituteRule = "nearest" | "next" | "none";

interface HolidaySeed {
  date: string;
  name: string;
  /** Fixed-date holidays can move when they fall on a weekend; floating ones never do. */
  movable?: boolean;
}

/** Applies a region's weekend-substitution rule to one holiday year's seeds. */
function observeHolidays(seeds: HolidaySeed[], rule: SubstituteRule, observedSuffix: string): HolidayDefinition[] {
  const result: HolidayDefinition[] = [];
  if (rule === "next") {
    // Holidays already on weekdays keep their date; weekend ones take the next free weekday in order.
    const taken = new Set<number>();
    const deferred: HolidaySeed[] = [];
    for (const seed of seeds) {
      const day = toEpochDay(seed.date);
      if (seed.movable && isWeekendDay(day)) {
        deferred.push(seed);
      } else {
        taken.add(day);
        result.push({ date: seed.date, name: seed.name });
      }
    }
    for (const seed of deferred) {
      let day = toEpochDay(seed.date) + 1;
      while (isWeekendDay(day) || taken.has(day)) day++;
      taken.add(day);
      result.push({ date: fromEpochDay(day), name: `${seed.name} ${observedSuffix}` });
    }
  } else {
    for (const seed of seeds) {
      const day = toEpochDay(seed.date);
      const dow = weekdayOf(day);
      if (rule === "nearest" && seed.movable && (dow === 6 || dow === 0)) {
        result.push({ date: fromEpochDay(day + (dow === 6 ? -1 : 1)), name: `${seed.name} ${observedSuffix}` });
      } else {
        result.push({ date: seed.date, name: seed.name });
      }
    }
  }
  return result;
}

/** UK (England & Wales) one-off changes to the regular bank holiday pattern. */
const UK_ONE_OFF_CHANGES: Record<number, { moved?: Record<string, string>; added?: HolidaySeed[] }> = {
  2020: { moved: { "Early May Bank Holiday": "2020-05-08" } },
  2022: {
    moved: { "Spring Bank Holiday": "2022-06-02" },
    added: [
      { date: "2022-06-03", name: "Platinum Jubilee Bank Holiday" },
      { date: "2022-09-19", name: "State Funeral of Queen Elizabeth II" }
    ]
  },
  2023: { added: [{ date: "2023-05-08", name: "Coronation of King Charles III" }] }
};

/** Victoria Day: the Monday preceding May 25. */
function victoriaDay(year: number): string {
  const may24 = toEpochDay(`${year}-05-24`);
  return fromEpochDay(may24 - ((weekdayOf(may24) + 6) % 7));
}

/**
 * Holidays belonging to one holiday-year (New Year's Day of `year`, Christmas of `year`, ...),
 * with weekend substitution applied. Substitutes may land in an adjacent calendar year
 * (the US observes a Saturday New Year's Day on Friday 31 December of the previous year).
 */
function holidaysForHolidayYear(region: string, year: number): HolidayDefinition[] {
  if (region === "US") {
    const seeds: HolidaySeed[] = [
      { date: `${year}-01-01`, name: "New Year's Day", movable: true },
      { date: getNthWeekdayOfMonth(year, 1, 1, 3), name: "Martin Luther King Jr. Day" },
      { date: getNthWeekdayOfMonth(year, 2, 1, 3), name: "Presidents' Day" },
      { date: getNthWeekdayOfMonth(year, 5, 1, -1), name: "Memorial Day" }
    ];
    if (year >= 2021) seeds.push({ date: `${year}-06-19`, name: "Juneteenth", movable: true });
    seeds.push(
      { date: `${year}-07-04`, name: "Independence Day", movable: true },
      { date: getNthWeekdayOfMonth(year, 9, 1, 1), name: "Labor Day" },
      { date: getNthWeekdayOfMonth(year, 10, 1, 2), name: "Columbus Day" },
      { date: `${year}-11-11`, name: "Veterans Day", movable: true },
      { date: getNthWeekdayOfMonth(year, 11, 4, 4), name: "Thanksgiving Day" },
      { date: `${year}-12-25`, name: "Christmas Day", movable: true }
    );
    return observeHolidays(seeds, "nearest", "(Observed)");
  }

  if (region === "UK" || region === "GB") {
    const easter = getEasterSunday(year);
    const changes = UK_ONE_OFF_CHANGES[year];
    const seeds: HolidaySeed[] = [
      { date: `${year}-01-01`, name: "New Year's Day", movable: true },
      { date: addDays(easter, -2), name: "Good Friday" },
      { date: addDays(easter, 1), name: "Easter Monday" },
      { date: getNthWeekdayOfMonth(year, 5, 1, 1), name: "Early May Bank Holiday" },
      { date: getNthWeekdayOfMonth(year, 5, 1, -1), name: "Spring Bank Holiday" },
      { date: getNthWeekdayOfMonth(year, 8, 1, -1), name: "Summer Bank Holiday" },
      { date: `${year}-12-25`, name: "Christmas Day", movable: true },
      { date: `${year}-12-26`, name: "Boxing Day", movable: true },
      ...(changes?.added || [])
    ].map((seed) => (changes?.moved?.[seed.name] ? { ...seed, date: changes.moved[seed.name] } : seed));
    return observeHolidays(seeds, "next", "(substitute day)");
  }

  if (region === "CA") {
    const easter = getEasterSunday(year);
    const seeds: HolidaySeed[] = [
      { date: `${year}-01-01`, name: "New Year's Day", movable: true },
      { date: addDays(easter, -2), name: "Good Friday" },
      { date: victoriaDay(year), name: "Victoria Day" },
      { date: `${year}-07-01`, name: "Canada Day", movable: true },
      { date: getNthWeekdayOfMonth(year, 9, 1, 1), name: "Labour Day" }
    ];
    if (year >= 2021) {
      seeds.push({ date: `${year}-09-30`, name: "National Day for Truth and Reconciliation", movable: true });
    }
    seeds.push(
      { date: getNthWeekdayOfMonth(year, 10, 1, 2), name: "Thanksgiving Day" },
      { date: `${year}-11-11`, name: "Remembrance Day", movable: true },
      { date: `${year}-12-25`, name: "Christmas Day", movable: true },
      { date: `${year}-12-26`, name: "Boxing Day", movable: true }
    );
    return observeHolidays(seeds, "next", "(Observed)");
  }

  if (region === "AU") {
    const easter = getEasterSunday(year);
    return observeHolidays(
      [
        { date: `${year}-01-01`, name: "New Year's Day", movable: true },
        { date: `${year}-01-26`, name: "Australia Day", movable: true },
        { date: addDays(easter, -2), name: "Good Friday" },
        { date: addDays(easter, 1), name: "Easter Monday" },
        { date: `${year}-04-25`, name: "Anzac Day" },
        { date: getNthWeekdayOfMonth(year, 6, 1, 2), name: "King's Birthday" },
        { date: `${year}-12-25`, name: "Christmas Day", movable: true },
        { date: `${year}-12-26`, name: "Boxing Day", movable: true }
      ],
      "next",
      "(Additional Day)"
    );
  }

  if (region === "EU") {
    const easter = getEasterSunday(year);
    return [
      { date: `${year}-01-01`, name: "New Year's Day" },
      { date: addDays(easter, 1), name: "Easter Monday" },
      { date: `${year}-05-01`, name: "Labour Day" },
      { date: addDays(easter, 39), name: "Ascension Day" },
      { date: addDays(easter, 50), name: "Whit Monday" },
      { date: `${year}-12-25`, name: "Christmas Day" },
      { date: `${year}-12-26`, name: "Second Day of Christmas" }
    ];
  }

  return [];
}

const MAX_MEMO_ENTRIES = 512;
const statutoryMemo = new Map<string, HolidayDefinition[]>();
const statutoryDaysMemo = new Map<string, Set<number>>();

function memoize<V>(memo: Map<string, V>, key: string, compute: () => V): V {
  let value = memo.get(key);
  if (value === undefined) {
    if (memo.size >= MAX_MEMO_ENTRIES) memo.clear();
    value = compute();
    memo.set(key, value);
  }
  return value;
}

function statutoryHolidaysFor(region: string, year: number): HolidayDefinition[] {
  return memoize(statutoryMemo, `${region}|${year}`, () => {
    const prefix = `${year}-`;
    return [year - 1, year, year + 1]
      .flatMap((holidayYear) => holidaysForHolidayYear(region, holidayYear))
      .filter((h) => h.date.startsWith(prefix))
      .sort((a, b) => a.date.localeCompare(b.date));
  });
}

/**
 * Generates the statutory holidays observed during calendar `year` for supported region codes
 * (US federal, UK/GB England & Wales bank holidays, EU common, CA federal statutory, AU national),
 * including weekend substitute days. Unknown regions return an empty list.
 */
export function getStatutoryHolidays(region: string, year: number): HolidayDefinition[] {
  if (typeof region !== "string" || !Number.isInteger(year)) return [];
  return statutoryHolidaysFor(region.trim().toUpperCase(), year).map((h) => ({ ...h }));
}

function statutoryDays(region: string, year: number): Set<number> {
  return memoize(statutoryDaysMemo, `${region}|${year}`, () =>
    new Set(statutoryHolidaysFor(region, year).map((h) => toEpochDay(h.date)))
  );
}

/**
 * Creates and normalizes a WorkingCalendar instance.
 * Invalid or empty `workingDays` fall back to Monday-Friday; day names ("Mon") are accepted.
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
    workingDays: normalizeWorkingDays(config.workingDays) || [...DEFAULT_WORKING_DAYS],
    holidays: Array.isArray(config.holidays) ? [...config.holidays] : [],
    region: config.region,
    exceptions: Array.isArray(config.exceptions) ? [...config.exceptions] : []
  };
}

/** Compiled, lookup-friendly form of a calendar. */
interface CalendarIndex {
  workingWeekdays: boolean[];
  holidays: Set<number>;
  exceptions: Map<number, boolean>;
  region?: string;
  /** Statutory holidays of the most recently queried year (avoids a memo lookup per day). */
  statutory?: { from: number; to: number; days: Set<number> };
}

interface CachedIndex {
  source: [unknown, unknown, unknown, unknown, number, number];
  index: CalendarIndex;
}

const indexCache = new WeakMap<object, CachedIndex>();

function compileCalendar(cal: Partial<WorkingCalendar>): CalendarIndex {
  const workingWeekdays = new Array<boolean>(7).fill(false);
  for (const day of normalizeWorkingDays(cal.workingDays) || DEFAULT_WORKING_DAYS) workingWeekdays[day] = true;

  const holidays = new Set<number>();
  for (const h of Array.isArray(cal.holidays) ? cal.holidays : []) {
    const day = toEpochDay(typeof h === "string" ? h : (h as HolidayDefinition)?.date);
    if (!Number.isNaN(day)) holidays.add(day);
  }

  // First matching exception wins (same precedence as a linear lookup)
  const exceptions = new Map<number, boolean>();
  for (const ex of Array.isArray(cal.exceptions) ? cal.exceptions : []) {
    const day = toEpochDay(ex?.date);
    if (!Number.isNaN(day) && !exceptions.has(day)) exceptions.set(day, Boolean(ex.isWorkingDay));
  }

  const region = typeof cal.region === "string" && cal.region.trim() ? cal.region.trim().toUpperCase() : undefined;
  return { workingWeekdays, holidays, exceptions, region };
}

/**
 * Returns the compiled index for a calendar, preset name or nothing (standard Mon-Fri).
 * Indexes are cached per calendar object and rebuilt if its arrays or region are replaced.
 */
function getCalendarIndex(calendar?: WorkingCalendar | CalendarPreset | string): CalendarIndex {
  const cal: Partial<WorkingCalendar> =
    typeof calendar === "object" && calendar !== null
      ? calendar
      : CALENDAR_PRESETS[calendar as CalendarPreset] || CALENDAR_PRESETS.standard;
  const source: CachedIndex["source"] = [
    cal.workingDays,
    cal.holidays,
    cal.exceptions,
    cal.region,
    Array.isArray(cal.holidays) ? cal.holidays.length : -1,
    Array.isArray(cal.exceptions) ? cal.exceptions.length : -1
  ];
  const cached = indexCache.get(cal);
  if (cached && cached.source.every((value, i) => value === source[i])) {
    return cached.index;
  }
  const index = compileCalendar(cal);
  indexCache.set(cal, { source, index });
  return index;
}

function isWorkingEpochDay(day: number, index: CalendarIndex): boolean {
  const exception = index.exceptions.get(day);
  if (exception !== undefined) return exception;
  if (index.holidays.has(day)) return false;
  if (index.region) {
    let year = index.statutory;
    if (!year || day < year.from || day > year.to) {
      const y = new Date(day * 86400000).getUTCFullYear();
      year = { from: Date.UTC(y, 0, 1) / 86400000, to: Date.UTC(y, 11, 31) / 86400000, days: statutoryDays(index.region, y) };
      index.statutory = year;
    }
    if (year.days.has(day)) return false;
  }
  return index.workingWeekdays[weekdayOf(day)];
}

function toDayInput(date: string | Date): number {
  return typeof date === "string" ? toEpochDay(date) : toEpochDay(formatISODate(date));
}

function cleanDateInput(date: string | Date): string {
  return typeof date === "string" ? date.split("T")[0].trim() : formatISODate(date);
}

/**
 * Checks whether a given ISO date or Date object is a working day under the specified calendar.
 */
export function isWorkingDay(
  date: string | Date,
  calendar?: WorkingCalendar | CalendarPreset
): boolean {
  const day = toDayInput(date);
  if (Number.isNaN(day)) return false;
  return isWorkingEpochDay(day, getCalendarIndex(calendar));
}

/** Steps from `day` in `step` direction (inclusive) to the first working day, within one year. */
function snapToWorkingDay(day: number, step: 1 | -1, index: CalendarIndex): number {
  let curr = day;
  for (let guard = 0; guard < 366 && !isWorkingEpochDay(curr, index); guard++) curr += step;
  return curr;
}

/**
 * Returns the next working day starting from the given date (exclusive of given date if it is not working).
 * If date is already a working day, returns date.
 */
export function getNextWorkingDay(
  date: string | Date,
  calendar?: WorkingCalendar | CalendarPreset
): string {
  const day = toDayInput(date);
  if (Number.isNaN(day)) return cleanDateInput(date);
  return fromEpochDay(snapToWorkingDay(day, 1, getCalendarIndex(calendar)));
}

/**
 * Returns the previous working day starting from the given date.
 * If date is already a working day, returns date.
 */
export function getPreviousWorkingDay(
  date: string | Date,
  calendar?: WorkingCalendar | CalendarPreset
): string {
  const day = toDayInput(date);
  if (Number.isNaN(day)) return cleanDateInput(date);
  return fromEpochDay(snapToWorkingDay(day, -1, getCalendarIndex(calendar)));
}

/**
 * Adds an integer number of working days to an ISO date under the specified calendar.
 *
 * Behavior:
 * - If `days === 0`: Returns `date` if it is a working day, otherwise snaps to next working day.
 * - If `days > 0`: Steps forward, advancing by 1 day until `days` working days have elapsed.
 * - If `days < 0`: Steps backward, decreasing by 1 day until `|days|` working days have elapsed.
 * - If the calendar yields no working day at all (e.g. every day is an exception), plain calendar
 *   days are used instead of drifting years into the future.
 */
export function addWorkingDays(
  date: string | Date,
  days: number,
  calendar?: WorkingCalendar | CalendarPreset
): string {
  const start = toDayInput(date);
  if (Number.isNaN(start)) return cleanDateInput(date);
  const index = getCalendarIndex(calendar);
  const targetDays = Number.isFinite(days) ? Math.round(days) : 0;

  if (targetDays === 0) {
    return fromEpochDay(snapToWorkingDay(start, 1, index));
  }

  const step = targetDays > 0 ? 1 : -1;
  let remaining = Math.abs(targetDays);
  const maxSteps = remaining * 7 + 366;
  let curr = start;
  for (let guard = 0; remaining > 0; guard++) {
    if (guard >= maxSteps) return fromEpochDay(start + targetDays);
    curr += step;
    if (isWorkingEpochDay(curr, index)) remaining--;
  }
  return fromEpochDay(curr);
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
  const a = toDayInput(startDate);
  const b = toDayInput(endDate);
  if (Number.isNaN(a) || Number.isNaN(b) || a === b) return 0;

  const index = getCalendarIndex(calendar);
  const [from, to] = a < b ? [a, b] : [b, a];
  let workingCount = 0;
  for (let curr = from + 1; curr <= to; curr++) {
    if (isWorkingEpochDay(curr, index)) workingCount++;
  }
  return workingCount === 0 ? 0 : a < b ? workingCount : -workingCount;
}

/**
 * Returns an array of all working date strings within an inclusive range [startDate, endDate].
 */
export function getWorkingDaysInRange(
  startDate: string | Date,
  endDate: string | Date,
  calendar?: WorkingCalendar | CalendarPreset
): string[] {
  const from = toDayInput(startDate);
  const to = toDayInput(endDate);
  const result: string[] = [];
  if (Number.isNaN(from) || Number.isNaN(to)) return result;

  const index = getCalendarIndex(calendar);
  const MAX_DAYS = 5000;
  for (let curr = from; curr <= to && curr - from < MAX_DAYS; curr++) {
    if (isWorkingEpochDay(curr, index)) result.push(fromEpochDay(curr));
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

  // 3. Default calendar (an object is shared as-is so its compiled index is reused across tasks)
  if (context?.defaultCalendar) {
    return typeof context.defaultCalendar === "object"
      ? context.defaultCalendar
      : createCalendar(context.defaultCalendar);
  }

  // 4. Fallback Standard
  return CALENDAR_PRESETS.standard;
}
