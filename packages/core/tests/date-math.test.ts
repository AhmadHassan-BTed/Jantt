import { describe, it, expect } from "vitest";
import {
  isValidISODate,
  parseISODate,
  formatISODate,
  addDays,
  diffDays,
  isWeekend,
  formatHumanDate,
  minISODate,
  maxISODate,
  getMonthNameOnly,
  formatMonthYear,
  getDayOfWeekShort,
  getTodayISODate,
  getTodayProgressFraction,
  isTaskOnDate,
  isTaskToday
} from "../src/date-math";


describe("Date Math Utilities", () => {
  // ─── isValidISODate ───────────────────────────────────────────────────

  describe("isValidISODate", () => {
    it("accepts standard YYYY-MM-DD strings", () => {
      expect(isValidISODate("2026-09-01")).toBe(true);
      expect(isValidISODate("2026-01-01")).toBe(true);
      expect(isValidISODate("2026-12-31")).toBe(true);
    });

    it("validates leap year Feb 29 correctly", () => {
      expect(isValidISODate("2024-02-29")).toBe(true);  // Leap year
      expect(isValidISODate("2000-02-29")).toBe(true);  // Century leap year
      expect(isValidISODate("2023-02-29")).toBe(false);  // Non-leap year
      expect(isValidISODate("1900-02-29")).toBe(false);  // Century non-leap
    });

    it("rejects invalid months", () => {
      expect(isValidISODate("2026-00-01")).toBe(false);
      expect(isValidISODate("2026-13-01")).toBe(false);
    });

    it("rejects invalid days", () => {
      expect(isValidISODate("2026-09-00")).toBe(false);
      expect(isValidISODate("2026-09-32")).toBe(false);
      expect(isValidISODate("2026-04-31")).toBe(false);  // April has 30 days
      expect(isValidISODate("2026-06-31")).toBe(false);  // June has 30 days
    });

    it("rejects non-date strings", () => {
      expect(isValidISODate("invalid")).toBe(false);
      expect(isValidISODate("")).toBe(false);
      expect(isValidISODate("09-01-2026")).toBe(false);  // US format
      expect(isValidISODate("2026/09/01")).toBe(false);  // Slash format
      expect(isValidISODate("2026-9-1")).toBe(false);    // Missing zero-padding
    });

    it("rejects non-string input", () => {
      expect(isValidISODate(null as any)).toBe(false);
      expect(isValidISODate(undefined as any)).toBe(false);
      expect(isValidISODate(20260901 as any)).toBe(false);
    });
  });

  // ─── parseISODate & formatISODate ─────────────────────────────────────

  describe("parseISODate + formatISODate round-trip", () => {
    it("round-trips a standard date", () => {
      const date = parseISODate("2026-09-15");
      expect(formatISODate(date)).toBe("2026-09-15");
    });

    it("round-trips year boundary dates", () => {
      expect(formatISODate(parseISODate("2026-12-31"))).toBe("2026-12-31");
      expect(formatISODate(parseISODate("2027-01-01"))).toBe("2027-01-01");
    });

    it("round-trips first day of year", () => {
      expect(formatISODate(parseISODate("2026-01-01"))).toBe("2026-01-01");
    });

    it("round-trips leap year Feb 29", () => {
      expect(formatISODate(parseISODate("2024-02-29"))).toBe("2024-02-29");
    });

    it("parseISODate returns a Date object in UTC", () => {
      const date = parseISODate("2026-09-01");
      expect(date).toBeInstanceOf(Date);
      expect(date.getUTCFullYear()).toBe(2026);
      expect(date.getUTCMonth()).toBe(8);  // September = 8
      expect(date.getUTCDate()).toBe(1);
    });
  });

  // ─── diffDays ─────────────────────────────────────────────────────────

  describe("diffDays", () => {
    it("calculates positive differences", () => {
      expect(diffDays("2026-09-01", "2026-09-05")).toBe(4);
      expect(diffDays("2026-09-01", "2026-09-02")).toBe(1);
    });

    it("returns zero for same date", () => {
      expect(diffDays("2026-09-01", "2026-09-01")).toBe(0);
    });

    it("returns negative for reversed dates", () => {
      expect(diffDays("2026-09-05", "2026-09-01")).toBe(-4);
    });

    it("crosses month boundaries correctly", () => {
      expect(diffDays("2026-08-31", "2026-09-01")).toBe(1);
      expect(diffDays("2026-01-31", "2026-03-01")).toBe(29);  // Non-leap 2026
    });

    it("crosses year boundaries correctly", () => {
      expect(diffDays("2026-12-31", "2027-01-01")).toBe(1);
      expect(diffDays("2026-01-01", "2027-01-01")).toBe(365);
    });

    it("handles leap year day count", () => {
      expect(diffDays("2024-01-01", "2025-01-01")).toBe(366);  // 2024 is leap
    });

    it("handles large spans (multi-year)", () => {
      const days = diffDays("2020-01-01", "2030-01-01");
      expect(days).toBeGreaterThan(3000);
      expect(days).toBeLessThan(4000);
    });
  });

  // ─── addDays ──────────────────────────────────────────────────────────

  describe("addDays", () => {
    it("adds days within a month", () => {
      expect(addDays("2026-09-01", 5)).toBe("2026-09-06");
    });

    it("adds days crossing month boundary", () => {
      expect(addDays("2026-08-30", 3)).toBe("2026-09-02");
    });

    it("subtracts days", () => {
      expect(addDays("2026-09-02", -3)).toBe("2026-08-30");
    });

    it("crosses year boundary forward", () => {
      expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    });

    it("crosses year boundary backward", () => {
      expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    });

    it("adds zero days (identity)", () => {
      expect(addDays("2026-09-15", 0)).toBe("2026-09-15");
    });

    it("handles large additions", () => {
      expect(addDays("2026-01-01", 365)).toBe("2027-01-01");
    });

    it("handles leap year Feb 28 -> Feb 29", () => {
      expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    });

    it("handles non-leap year Feb 28 -> Mar 1", () => {
      expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    });
  });

  // ─── isWeekend ────────────────────────────────────────────────────────

  describe("isWeekend", () => {
    it("identifies Saturday and Sunday as weekend", () => {
      // 2026-08-29 is Saturday, 2026-08-30 is Sunday
      expect(isWeekend("2026-08-29")).toBe(true);
      expect(isWeekend("2026-08-30")).toBe(true);
    });

    it("identifies weekdays as non-weekend", () => {
      // Mon-Fri 2026-08-31 through 2026-09-04
      expect(isWeekend("2026-08-31")).toBe(false);
      expect(isWeekend("2026-09-01")).toBe(false);
      expect(isWeekend("2026-09-02")).toBe(false);
      expect(isWeekend("2026-09-03")).toBe(false);
      expect(isWeekend("2026-09-04")).toBe(false);
    });
  });

  // ─── formatHumanDate ──────────────────────────────────────────────────

  describe("formatHumanDate", () => {
    it("formats standard dates", () => {
      expect(formatHumanDate("2026-09-05")).toBe("Sep 5, 2026");
      expect(formatHumanDate("2026-01-01")).toBe("Jan 1, 2026");
      expect(formatHumanDate("2026-12-31")).toBe("Dec 31, 2026");
    });

    it("returns input string unchanged for invalid dates", () => {
      expect(formatHumanDate("invalid")).toBe("invalid");
    });
  });

  // ─── minISODate / maxISODate ──────────────────────────────────────────

  describe("minISODate / maxISODate", () => {
    it("returns the earlier date", () => {
      expect(minISODate("2026-09-01", "2026-09-05")).toBe("2026-09-01");
      expect(minISODate("2026-09-05", "2026-09-01")).toBe("2026-09-01");
    });

    it("returns same date when equal", () => {
      expect(minISODate("2026-09-01", "2026-09-01")).toBe("2026-09-01");
    });

    it("returns the later date", () => {
      expect(maxISODate("2026-09-01", "2026-09-05")).toBe("2026-09-05");
      expect(maxISODate("2026-09-05", "2026-09-01")).toBe("2026-09-05");
    });
  });

  // ─── getMonthNameOnly ─────────────────────────────────────────────────

  describe("getMonthNameOnly", () => {
    it("returns full month name by default", () => {
      expect(getMonthNameOnly("2026-09-15")).toBe("September");
      expect(getMonthNameOnly("2026-01-01")).toBe("January");
    });

    it("returns short month name when full=false", () => {
      expect(getMonthNameOnly("2026-09-15", false)).toBe("Sep");
      expect(getMonthNameOnly("2026-12-25", false)).toBe("Dec");
    });
  });

  // ─── formatMonthYear ──────────────────────────────────────────────────

  describe("formatMonthYear", () => {
    it("returns short month + year by default", () => {
      expect(formatMonthYear("2026-09-15")).toBe("Sep 2026");
    });

    it("returns full month + year when full=true", () => {
      expect(formatMonthYear("2026-09-15", true)).toBe("September 2026");
    });
  });

  // ─── getDayOfWeekShort ────────────────────────────────────────────────

  describe("getDayOfWeekShort", () => {
    it("returns correct day abbreviations", () => {
      // 2026-08-31 is Monday
      expect(getDayOfWeekShort("2026-08-31")).toBe("Mo");
      // 2026-09-01 is Tuesday
      expect(getDayOfWeekShort("2026-09-01")).toBe("Tu");
      // 2026-08-29 is Saturday
      expect(getDayOfWeekShort("2026-08-29")).toBe("Sa");
      // 2026-08-30 is Sunday
      expect(getDayOfWeekShort("2026-08-30")).toBe("Su");
    });
  });

  // ─── getTodayISODate ──────────────────────────────────────────────────

  describe("getTodayISODate", () => {
    it("returns a valid ISO date string", () => {
      const today = getTodayISODate();
      expect(isValidISODate(today)).toBe(true);
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // ─── isTaskOnDate & isTaskToday ───────────────────────────────────────

  describe("isTaskOnDate", () => {
    it("returns true when target date is within task start and end", () => {
      expect(isTaskOnDate("2026-09-01", "2026-09-05", "2026-09-03")).toBe(true);
    });

    it("returns true when target date equals task start or end", () => {
      expect(isTaskOnDate("2026-09-01", "2026-09-05", "2026-09-01")).toBe(true);
      expect(isTaskOnDate("2026-09-01", "2026-09-05", "2026-09-05")).toBe(true);
    });

    it("returns false when target date is outside task span", () => {
      expect(isTaskOnDate("2026-09-01", "2026-09-05", "2026-08-31")).toBe(false);
      expect(isTaskOnDate("2026-09-01", "2026-09-05", "2026-09-06")).toBe(false);
    });

    it("handles single-day milestones", () => {
      expect(isTaskOnDate("2026-09-01", "2026-09-01", "2026-09-01")).toBe(true);
      expect(isTaskOnDate("2026-09-01", "2026-09-01", "2026-09-02")).toBe(false);
    });

    it("returns false for invalid date strings", () => {
      expect(isTaskOnDate("invalid", "2026-09-05", "2026-09-03")).toBe(false);
      expect(isTaskOnDate("2026-09-01", "invalid", "2026-09-03")).toBe(false);
      expect(isTaskOnDate("2026-09-01", "2026-09-05", "invalid")).toBe(false);
    });
  });

  // ─── getTodayProgressFraction ────────────────────────────────────────

  describe("getTodayProgressFraction", () => {
    it("returns 0.0 at midnight start of day (00:00:00.000)", () => {
      const midnight = new Date(2026, 8, 3, 0, 0, 0, 0);
      expect(getTodayProgressFraction(midnight)).toBe(0);
    });

    it("returns 0.25 at 06:00:00 (quarter day)", () => {
      const morning = new Date(2026, 8, 3, 6, 0, 0, 0);
      expect(getTodayProgressFraction(morning)).toBeCloseTo(0.25, 4);
    });

    it("returns 0.5 at noon (12:00:00)", () => {
      const noon = new Date(2026, 8, 3, 12, 0, 0, 0);
      expect(getTodayProgressFraction(noon)).toBeCloseTo(0.5, 4);
    });

    it("returns 0.75 at 18:00:00 (three quarters of day)", () => {
      const evening = new Date(2026, 8, 3, 18, 0, 0, 0);
      expect(getTodayProgressFraction(evening)).toBeCloseTo(0.75, 4);
    });

    it("approaches 1.0 as the end of day approaches (23:59:59)", () => {
      const endOfDay = new Date(2026, 8, 3, 23, 59, 59, 999);
      const frac = getTodayProgressFraction(endOfDay);
      expect(frac).toBeGreaterThan(0.999);
      expect(frac).toBeLessThan(1.0);
    });
  });
});

