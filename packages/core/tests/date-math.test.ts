import { describe, it, expect } from "vitest";
import {
  isValidISODate,
  parseISODate,
  formatISODate,
  addDays,
  diffDays,
  isWeekend,
  formatHumanDate
} from "../src/date-math";

describe("Date Math Utilities", () => {
  it("validates correct ISO date strings", () => {
    expect(isValidISODate("2026-09-01")).toBe(true);
    expect(isValidISODate("2024-02-29")).toBe(true); // Leap year
    expect(isValidISODate("2023-02-29")).toBe(false); // Non-leap year
    expect(isValidISODate("2026-13-01")).toBe(false); // Invalid month
    expect(isValidISODate("2026-09-32")).toBe(false); // Invalid day
    expect(isValidISODate("invalid")).toBe(false);
  });

  it("calculates diffDays accurately", () => {
    expect(diffDays("2026-09-01", "2026-09-05")).toBe(4);
    expect(diffDays("2026-09-01", "2026-09-01")).toBe(0);
    expect(diffDays("2026-09-05", "2026-09-01")).toBe(-4);
    expect(diffDays("2026-08-31", "2026-09-01")).toBe(1);
  });

  it("adds and subtracts days correctly across month boundaries", () => {
    expect(addDays("2026-08-30", 3)).toBe("2026-09-02");
    expect(addDays("2026-09-02", -3)).toBe("2026-08-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("identifies weekends", () => {
    // 2026-08-29 is Saturday, 2026-08-30 is Sunday, 2026-08-31 is Monday
    expect(isWeekend("2026-08-29")).toBe(true);
    expect(isWeekend("2026-08-30")).toBe(true);
    expect(isWeekend("2026-08-31")).toBe(false);
  });

  it("formats human-readable date strings", () => {
    expect(formatHumanDate("2026-09-05")).toBe("Sep 5, 2026");
  });
});
