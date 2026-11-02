import { describe, it, expect } from "vitest";
import {
  createCalendar,
  isWorkingDay,
  addWorkingDays,
  diffWorkingDays,
  getNextWorkingDay,
  getPreviousWorkingDay,
  getWorkingDaysInRange,
  getStatutoryHolidays,
  resolveTaskCalendar,
  CALENDAR_PRESETS
} from "../src/calendar";
import { CascadeResolveStage } from "../src/pipeline/stages/cascade-resolve-stage";
import type { Task, Person, WorkingCalendar } from "../src/types";

describe("Multi-Calendar & Statutory Holiday Matrix", () => {
  describe("Presets and Working Day checks", () => {
    it("identifies weekends as non-working days in standard calendar", () => {
      const cal = createCalendar("standard");
      // 2026-11-06 is Friday, 2026-11-07 is Saturday, 2026-11-08 is Sunday, 2026-11-09 is Monday
      expect(isWorkingDay("2026-11-06", cal)).toBe(true);
      expect(isWorkingDay("2026-11-07", cal)).toBe(false);
      expect(isWorkingDay("2026-11-08", cal)).toBe(false);
      expect(isWorkingDay("2026-11-09", cal)).toBe(true);
    });

    it("continuous 24/7 calendar considers all 7 days as working", () => {
      const cal = createCalendar("continuous");
      expect(isWorkingDay("2026-11-07", cal)).toBe(true); // Saturday
      expect(isWorkingDay("2026-11-08", cal)).toBe(true); // Sunday
    });

    it("compressed 4x10 calendar treats Friday through Sunday as non-working", () => {
      const cal = createCalendar("compressed_4x10");
      expect(isWorkingDay("2026-11-05", cal)).toBe(true); // Thursday
      expect(isWorkingDay("2026-11-06", cal)).toBe(false); // Friday
      expect(isWorkingDay("2026-11-07", cal)).toBe(false); // Saturday
      expect(isWorkingDay("2026-11-08", cal)).toBe(false); // Sunday
    });

    it("honors custom exceptions (e.g. working weekend shift or extra holiday)", () => {
      const cal = createCalendar({
        workingDays: [1, 2, 3, 4, 5],
        exceptions: [
          { date: "2026-11-07", isWorkingDay: true, name: "Overtime Saturday" },
          { date: "2026-11-09", isWorkingDay: false, name: "Floating Monday Off" }
        ]
      });

      expect(isWorkingDay("2026-11-07", cal)).toBe(true); // Saturday override
      expect(isWorkingDay("2026-11-09", cal)).toBe(false); // Monday override
    });
  });

  describe("Statutory Regional Holiday Matrix", () => {
    it("generates US statutory holidays with accurate dates and observances", () => {
      const holidays2026 = getStatutoryHolidays("US", 2026);
      const dates = holidays2026.map((h) => h.date);

      // New Year's Day (Jan 1)
      expect(dates).toContain("2026-01-01");
      // MLK Day (3rd Mon of Jan)
      expect(dates).toContain("2026-01-19");
      // Memorial Day (Last Mon of May)
      expect(dates).toContain("2026-05-25");
      // Juneteenth (June 19)
      expect(dates).toContain("2026-06-19");
      // Independence Day (July 4 2026 is Saturday -> observed Friday July 3)
      expect(dates).toContain("2026-07-03");
      // Labor Day (1st Mon of Sep)
      expect(dates).toContain("2026-09-07");
      // Thanksgiving (4th Thu of Nov)
      expect(dates).toContain("2026-11-26");
      // Christmas (Dec 25)
      expect(dates).toContain("2026-12-25");
    });

    it("generates UK bank holidays including Good Friday, Easter Monday, and Summer Bank Holiday", () => {
      const holidays2026 = getStatutoryHolidays("UK", 2026);
      const dates = holidays2026.map((h) => h.date);

      // In 2026, Easter Sunday is April 5
      // Good Friday: April 3, Easter Monday: April 6
      expect(dates).toContain("2026-04-03");
      expect(dates).toContain("2026-04-06");
      // Early May Bank Holiday (First Mon of May)
      expect(dates).toContain("2026-05-04");
      // Spring Bank Holiday (Last Mon of May)
      expect(dates).toContain("2026-05-25");
      // Summer Bank Holiday (Last Mon of August)
      expect(dates).toContain("2026-08-31");
      // Christmas & Boxing Day
      expect(dates).toContain("2026-12-25");
      expect(dates).toContain("2026-12-28"); // Observed because Dec 26 is Saturday
    });
  });

  describe("addWorkingDays & diffWorkingDays", () => {
    it("snaps non-working days forward when adding 0 working days", () => {
      const cal = createCalendar("standard");
      // Saturday 2026-11-07 snaps to Monday 2026-11-09
      expect(addWorkingDays("2026-11-07", 0, cal)).toBe("2026-11-09");
      // Monday 2026-11-09 stays Monday
      expect(addWorkingDays("2026-11-09", 0, cal)).toBe("2026-11-09");
    });

    it("steps forward skipping weekends accurately", () => {
      const cal = createCalendar("standard");
      // Friday + 1 working day = Monday
      expect(addWorkingDays("2026-11-06", 1, cal)).toBe("2026-11-09");
      // Friday + 3 working days = Wednesday
      expect(addWorkingDays("2026-11-06", 3, cal)).toBe("2026-11-11");
    });

    it("steps forward skipping regional holidays and weekends", () => {
      const cal = createCalendar({
        region: "US",
        workingDays: [1, 2, 3, 4, 5]
      });
      // 2026-11-25 is Wednesday.
      // 2026-11-26 is Thanksgiving (Holiday)
      // 2026-11-27 is Friday (Working day)
      // 2026-11-28 is Sat, 2026-11-29 is Sun
      // 2026-11-30 is Monday
      // Wednesday + 1 working day -> Friday (skipping Thanksgiving)
      expect(addWorkingDays("2026-11-25", 1, cal)).toBe("2026-11-27");
      // Wednesday + 2 working days -> Monday (skipping Thanksgiving and weekend)
      expect(addWorkingDays("2026-11-25", 2, cal)).toBe("2026-11-30");
    });

    it("steps backward subtracting working days", () => {
      const cal = createCalendar("standard");
      // Monday - 1 working day = Friday
      expect(addWorkingDays("2026-11-09", -1, cal)).toBe("2026-11-06");
      // Monday - 3 working days = Wednesday
      expect(addWorkingDays("2026-11-09", -3, cal)).toBe("2026-11-04");
    });

    it("calculates diffWorkingDays correctly across weekends and holidays", () => {
      const cal = createCalendar({
        region: "US",
        workingDays: [1, 2, 3, 4, 5]
      });

      // Mon to Fri in normal week: 4 working days
      expect(diffWorkingDays("2026-11-02", "2026-11-06", cal)).toBe(4);
      // Fri to Mon: 1 working day
      expect(diffWorkingDays("2026-11-06", "2026-11-09", cal)).toBe(1);
      // Mon to Mon (1 full week): 5 working days
      expect(diffWorkingDays("2026-11-02", "2026-11-09", cal)).toBe(5);

      // Over Thanksgiving week: 2026-11-23 (Mon) to 2026-11-30 (Mon):
      // Tue(1), Wed(2), Thu(Holiday-0), Fri(3), Mon(4) -> 4 working days instead of 5!
      expect(diffWorkingDays("2026-11-23", "2026-11-30", cal)).toBe(4);

      // Inverted direction
      expect(diffWorkingDays("2026-11-09", "2026-11-06", cal)).toBe(-1);
    });

    it("extracts list of all working days in range", () => {
      const cal = createCalendar("standard");
      const days = getWorkingDaysInRange("2026-11-05", "2026-11-10", cal);
      // Thu, Fri, Mon, Tue
      expect(days).toEqual(["2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10"]);
    });

    it("getNextWorkingDay and getPreviousWorkingDay return boundary dates safely", () => {
      const cal = createCalendar("standard");
      expect(getNextWorkingDay("2026-11-07", cal)).toBe("2026-11-09");
      expect(getPreviousWorkingDay("2026-11-07", cal)).toBe("2026-11-06");
      expect(getNextWorkingDay("2026-11-06", cal)).toBe("2026-11-06");
    });
  });

  describe("Hierarchical Calendar Resolution", () => {
    const defaultCal: WorkingCalendar = { id: "global", workingDays: [1, 2, 3, 4, 5] };
    const personCal: WorkingCalendar = { id: "night-shift", workingDays: [1, 2, 3, 4] };
    const taskCal: WorkingCalendar = { id: "continuous", workingDays: [0, 1, 2, 3, 4, 5, 6] };

    const people: Person[] = [
      { id: "p1", name: "Alice", calendar: personCal },
      { id: "p2", name: "Bob" }
    ];

    it("prefers explicit task calendar over assignee and global calendar", () => {
      const task: Task = {
        id: "t1",
        category: "dev",
        start: "2026-11-01",
        end: "2026-11-05",
        assignee: "p1",
        calendar: taskCal
      };
      const resolved = resolveTaskCalendar(task, { people, defaultCalendar: defaultCal });
      expect(resolved.workingDays).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it("falls back to assignee calendar if task has no calendar", () => {
      const task: Task = {
        id: "t2",
        category: "dev",
        start: "2026-11-01",
        end: "2026-11-05",
        assignee: "p1"
      };
      const resolved = resolveTaskCalendar(task, { people, defaultCalendar: defaultCal });
      expect(resolved.workingDays).toEqual([1, 2, 3, 4]);
    });

    it("falls back to global default calendar if assignee has no calendar", () => {
      const task: Task = {
        id: "t3",
        category: "dev",
        start: "2026-11-01",
        end: "2026-11-05",
        assignee: "p2"
      };
      const resolved = resolveTaskCalendar(task, { people, defaultCalendar: defaultCal });
      expect(resolved.id).toBe("global");
    });
  });

  describe("CascadeResolveStage Calendar Integration", () => {
    it("skips weekends when useWorkingDays is enabled in pipeline context", () => {
      const stage = new CascadeResolveStage();
      const tasks: Task[] = [
        {
          id: "t1",
          category: "dev",
          start: "2026-11-04", // Wednesday
          end: "2026-11-06" // Friday (2 working days duration)
        },
        {
          id: "t2",
          category: "qa",
          start: "2026-11-05",
          end: "2026-11-06",
          dependsOn: "t1" // Lag 1 working day -> Starts Monday 2026-11-09!
        }
      ];

      const resolved = stage.process(tasks, {
        defaultGapDays: 1,
        useWorkingDays: true,
        calendar: CALENDAR_PRESETS.standard
      });

      const t2 = resolved.find((t) => t.id === "t2")!;
      // t1 ends Friday Nov 6. +1 working day gap -> starts Monday Nov 9!
      expect(t2.start).toBe("2026-11-09");
      expect(t2.end).toBe("2026-11-10");
    });

    it("preserves standard calendar day behavior when no working calendar is requested", () => {
      const stage = new CascadeResolveStage();
      const tasks: Task[] = [
        {
          id: "t1",
          category: "dev",
          start: "2026-11-04",
          end: "2026-11-06"
        },
        {
          id: "t2",
          category: "qa",
          start: "2026-11-05",
          end: "2026-11-06",
          dependsOn: "t1"
        }
      ];

      // Standard calendar day arithmetic: Nov 6 + 1 day = Nov 7 (Saturday)
      const resolved = stage.process(tasks, { defaultGapDays: 1 });
      const t2 = resolved.find((t) => t.id === "t2")!;
      expect(t2.start).toBe("2026-11-07");
    });
  });
});
