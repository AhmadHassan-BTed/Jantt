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
  normalizeWorkingDays,
  isSupportedRegion,
  CALENDAR_PRESETS
} from "../src/calendar";
import { calculateCriticalPath } from "../src/cpm";
import { resolveSchedule } from "../src/resolver";
import { CascadeResolveStage } from "../src/pipeline/stages/cascade-resolve-stage";
import type { Task, Person, WorkingCalendar } from "../src/types";

describe("CPM working calendars", () => {
  it("moves a weekend deadline to each task's last working day", () => {
    const task = { id: "a", start: "2026-11-02", end: "2026-11-02" };
    const targetDate = "2026-11-08";
    expect(calculateCriticalPath([task], { targetDate }).metrics.get("a")?.lateStart).toBe(targetDate);
    const result = calculateCriticalPath([task], { targetDate, calendar: "standard" });
    expect(result.metrics.get("a")).toMatchObject({ lateStart: "2026-11-06", totalFloat: 4 });
  });

  it("inverts working-day leads across calendars in the backward pass without overshooting weekends", () => {
    // B has a 3-working-day duration (Wed 11-04 -> Mon 11-09); with target Tue 11-10, B.lateStart = Thu 11-05.
    // Because A -> B has FS-1d on B's Mon-Fri calendar, A can finish at most Fri 11-06 (not Sat/Sun 11-07..08).
    const tasks: Task[] = [
      { id: "a", start: "2026-11-04", end: "2026-11-04", calendar: "continuous" },
      { id: "b", start: "2026-11-04", end: "2026-11-09", calendar: "standard", dependsOn: "a:FS-1d" }
    ];
    const result = calculateCriticalPath(tasks, { targetDate: "2026-11-10" });
    expect(result.metrics.get("b")?.earlyStart).toBe("2026-11-04");
    expect(result.metrics.get("b")?.lateStart).toBe("2026-11-05");
    expect(result.metrics.get("a")?.lateFinish).toBe("2026-11-06");
    expect(result.metrics.get("a")?.lateStart).toBe("2026-11-06");

    // Verify forward/backward consistency: scheduling A at its lateFinish keeps B within targetDate,
    // while scheduling A one day later (Saturday) pushes B to Friday and breaches targetDate.
    const atLate = calculateCriticalPath(
      [{ ...tasks[0], start: "2026-11-06", end: "2026-11-06" }, tasks[1]],
      { targetDate: "2026-11-10" }
    );
    expect(atLate.metrics.get("b")?.earlyStart).toBe("2026-11-05");
    expect(atLate.metrics.get("b")?.earlyFinish).toBe("2026-11-10");
    expect(atLate.metrics.get("b")?.totalFloat).toBe(0);

    const pastLate = calculateCriticalPath(
      [{ ...tasks[0], start: "2026-11-07", end: "2026-11-07" }, tasks[1]],
      { targetDate: "2026-11-10" }
    );
    expect(pastLate.metrics.get("b")?.earlyStart).toBe("2026-11-06");
    expect(pastLate.metrics.get("b")?.earlyFinish).toBe("2026-11-11");
    expect(pastLate.metrics.get("b")?.totalFloat).toBe(-1);
  });

  it("skips named holidays when applying dependency lag and duration", () => {
    const tasks: Task[] = [
      { id: "a", start: "2026-11-06", end: "2026-11-06" },
      { id: "b", start: "2026-11-05", end: "2026-11-06", dependsOn: "a:FS+1d", calendarId: "site" }
    ];
    const result = calculateCriticalPath(tasks, { calendars: { site: { holidays: ["2026-11-09"] } } });
    expect(result.metrics.get("b")).toMatchObject({ earlyStart: "2026-11-10", earlyFinish: "2026-11-11" });
    expect(result.metrics.get("a")?.lateStart).toBe("2026-11-09");
  });

  it("keeps mixed-calendar critical paths intact under positive deadline slack", () => {
    const chain: Task[] = [
      { id: "a", start: "2026-11-02", end: "2026-11-02", calendar: "standard" },
      { id: "b", start: "2026-11-03", end: "2026-11-03", calendar: "continuous", dependsOn: "a:FS+1d" }
    ];
    const chainResult = calculateCriticalPath(chain, { targetDate: "2026-11-09" });
    expect(chainResult.criticalTaskIds).toEqual(new Set(["a", "b"]));
    expect(chainResult.criticalDepKeys).toEqual(new Set(["a->b"]));
    expect(chainResult.criticalPaths).toEqual([["a", "b"]]);
    expect(chainResult.metrics.get("a")?.totalFloat).toBe(4);
    expect(chainResult.metrics.get("b")?.totalFloat).toBe(6);

    // Parallel branches: continuous bottleneck finishing Wed 11-04 must stay critical over a shorter
    // 4x10 branch finishing Mon 11-02 even though the 4x10 branch has a smaller working-day float (3 < 4).
    const parallel: Task[] = [
      { id: "long", start: "2026-11-02", end: "2026-11-04", calendar: "continuous" },
      { id: "short", start: "2026-11-02", end: "2026-11-02", calendar: "compressed_4x10" }
    ];
    const parallelResult = calculateCriticalPath(parallel, { targetDate: "2026-11-08" });
    expect(parallelResult.criticalTaskIds).toEqual(new Set(["long"]));
    expect(parallelResult.projectTotalFloat).toBe(4);
    expect(parallelResult.metrics.get("short")).toMatchObject({ isCritical: false, totalFloat: 3 });
  });

  it("preserves exact dates of unmoved weekend-started tasks like the cascade", () => {
    const tasks: Task[] = [{ id: "wknd", start: "2026-11-07", end: "2026-11-09" }];
    const result = calculateCriticalPath(tasks, { calendar: "standard" });
    expect(result.metrics.get("wknd")).toMatchObject({
      earlyStart: "2026-11-07",
      earlyFinish: "2026-11-09",
      totalFloat: 0,
      isCritical: true
    });
  });

  it("matches CascadeResolveStage calendar activation (useWorkingDays: false opts out globally)", () => {
    const people: Person[] = [{ id: "p1", name: "Alex", calendar: "standard" }];
    const tasks: Task[] = [
      { id: "a", start: "2026-11-02", end: "2026-11-02", assignee: "p1" },
      { id: "b", start: "2026-11-02", end: "2026-11-02", dependsOn: "a:FS+1d" }
    ];
    const optedOut = calculateCriticalPath(tasks, {
      calendar: "standard",
      useWorkingDays: false,
      people,
      targetDate: "2026-11-08"
    });
    // Calendar days (not Mon-Fri): B finishes 11-03, lateFinish is Sun 11-08 (5 calendar days float).
    expect(optedOut.metrics.get("b")).toMatchObject({ lateFinish: "2026-11-08", totalFloat: 5 });

    // Resolved working-day chain across a weekend stays critical with zero working-day float.
    const chain: Task[] = [
      { id: "t1", start: "2026-11-04", end: "2026-11-06" },
      { id: "t2", start: "2026-11-05", end: "2026-11-06", dependsOn: "t1" }
    ];
    const resolved = resolveSchedule(chain, { defaultGapDays: 2, calendar: "standard" });
    const cpm = calculateCriticalPath(resolved, { defaultGapDays: 2, calendar: "standard" });
    expect(cpm.criticalTaskIds).toEqual(new Set(["t1", "t2"]));
    expect(cpm.criticalDepKeys).toEqual(new Set(["t1->t2"]));
    expect(cpm.projectTotalFloat).toBe(0);
  });
});

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

  describe("Weekend substitute days (GitHub #61)", () => {
    const datesOf = (region: string, year: number) => getStatutoryHolidays(region, year).map((h) => h.date);

    // England & Wales bank holidays as published on gov.uk/bank-holidays
    const ukBankHolidays: Record<number, string[]> = {
      2021: ["2021-01-01", "2021-04-02", "2021-04-05", "2021-05-03", "2021-05-31", "2021-08-30", "2021-12-27", "2021-12-28"],
      2022: [
        "2022-01-03", "2022-04-15", "2022-04-18", "2022-05-02", "2022-06-02", "2022-06-03",
        "2022-08-29", "2022-09-19", "2022-12-26", "2022-12-27"
      ],
      2027: ["2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28"],
      2028: ["2028-01-03", "2028-04-14", "2028-04-17", "2028-05-01", "2028-05-29", "2028-08-28", "2028-12-25", "2028-12-26"],
      2033: ["2033-01-03", "2033-04-15", "2033-04-18", "2033-05-02", "2033-05-30", "2033-08-29", "2033-12-26", "2033-12-27"]
    };
    for (const [year, expected] of Object.entries(ukBankHolidays)) {
      it(`matches the UK ${year} bank holiday list`, () => {
        expect(datesOf("UK", Number(year))).toEqual(expected);
        expect(datesOf("GB", Number(year))).toEqual(expected);
      });
    }

    // US federal holidays as published by OPM (observed dates)
    const usFederalHolidays: Record<number, string[]> = {
      2021: [
        "2021-01-01", "2021-01-18", "2021-02-15", "2021-05-31", "2021-06-18", "2021-07-05",
        "2021-09-06", "2021-10-11", "2021-11-11", "2021-11-25", "2021-12-24", "2021-12-31"
      ],
      2022: [
        "2022-01-17", "2022-02-21", "2022-05-30", "2022-06-20", "2022-07-04", "2022-09-05",
        "2022-10-10", "2022-11-11", "2022-11-24", "2022-12-26"
      ]
    };
    for (const [year, expected] of Object.entries(usFederalHolidays)) {
      it(`matches the US ${year} federal holiday list`, () => {
        expect(datesOf("US", Number(year))).toEqual(expected);
      });
    }

    it("treats substitute and cross-year observed days as non-working", () => {
      expect(isWorkingDay("2021-12-27", { region: "UK" })).toBe(false);
      expect(isWorkingDay("2021-12-31", { region: "UK" })).toBe(true);
      expect(isWorkingDay("2022-01-03", { region: "UK" })).toBe(false);
      expect(isWorkingDay("2022-12-26", { region: "UK" })).toBe(false);
      // New Year's Day 2028 is a Saturday: observed on Friday 2027-12-31 by the US
      expect(isWorkingDay("2027-12-31", { region: "US" })).toBe(false);
      expect(addWorkingDays("2027-12-30", 1, { region: "US" })).toBe("2028-01-03");
    });

    it("generates Canadian and Australian holidays instead of an empty list", () => {
      const ca = datesOf("CA", 2026);
      expect(ca).toContain("2026-05-18"); // Victoria Day
      expect(ca).toContain("2026-07-01"); // Canada Day
      expect(ca).toContain("2026-12-28"); // Boxing Day observed (26th is a Saturday)
      const au = datesOf("AU", 2026);
      expect(au).toContain("2026-01-26"); // Australia Day
      expect(au).toContain("2026-04-25"); // Anzac Day (not substituted)
      expect(au).toContain("2026-12-28");
      expect(isSupportedRegion("ca")).toBe(true);
      expect(isSupportedRegion("XX")).toBe(false);
      expect(getStatutoryHolidays("XX", 2026)).toEqual([]);
    });

    it("returns defensive copies of memoized holiday lists", () => {
      getStatutoryHolidays("UK", 2026)[0].date = "1999-01-01";
      expect(getStatutoryHolidays("UK", 2026)[0].date).toBe("2026-01-01");
    });
  });

  describe("Calendar sanitization and guards", () => {
    it("normalizes day names and falls back to Mon-Fri for empty or invalid workingDays", () => {
      expect(normalizeWorkingDays(["Mon", "tuesday", 3, 3, 9, "xx"])).toEqual([1, 2, 3]);
      expect(normalizeWorkingDays([])).toBeNull();
      expect(createCalendar({ workingDays: [] as any }).workingDays).toEqual([1, 2, 3, 4, 5]);
      expect(createCalendar({ workingDays: ["Sat", "Sun"] as any }).workingDays).toEqual([0, 6]);
    });

    it("never drifts years into the future for empty or misspelled calendars", () => {
      expect(addWorkingDays("2026-01-05", 3, { workingDays: [] as any })).toBe("2026-01-08");
      expect(addWorkingDays("2026-01-05", 3, { workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"] as any })).toBe("2026-01-08");
    });

    it("falls back to calendar days when a calendar has no working day at all", () => {
      const allOff = {
        workingDays: [1, 2, 3, 4, 5] as any,
        exceptions: Array.from({ length: 800 }, (_, i) => ({
          date: new Date(Date.UTC(2026, 0, 6 + i)).toISOString().slice(0, 10),
          isWorkingDay: false
        }))
      };
      expect(addWorkingDays("2026-01-05", 2, allOff)).toBe("2026-01-07");
    });

    it("re-indexes a calendar whose holiday list is replaced", () => {
      const cal: WorkingCalendar = { workingDays: [1, 2, 3, 4, 5], holidays: [] };
      expect(isWorkingDay("2026-11-09", cal)).toBe(true);
      cal.holidays = ["2026-11-09"];
      expect(isWorkingDay("2026-11-09", cal)).toBe(false);
    });

    it("keeps working-day arithmetic fast with regional holidays", () => {
      const cal = { region: "US", workingDays: [1, 2, 3, 4, 5] as any };
      const startedAt = Date.now();
      let total = 0;
      for (let i = 0; i < 200; i++) total += diffWorkingDays("2026-01-01", "2026-12-31", cal);
      expect(total).toBe(200 * 250);
      expect(Date.now() - startedAt).toBeLessThan(1500);
    });
  });
});
