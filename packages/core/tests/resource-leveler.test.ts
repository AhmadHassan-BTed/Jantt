import { describe, it, expect } from "vitest";
import {
  detectOverAllocations,
  levelResources,
  getTaskAllocationUnits
} from "../src/resource-leveler";
import { CALENDAR_PRESETS } from "../src/calendar";
import type { Task } from "../src/types";

describe("Autonomous Resource Leveling Heuristic Engine", () => {
  describe("getTaskAllocationUnits", () => {
    it("defaults to 1.0 when allocation is unspecified", () => {
      const task: Task = { id: "t1", category: "dev", start: "2026-11-01", end: "2026-11-05" };
      expect(getTaskAllocationUnits(task)).toBe(1.0);
    });

    it("reads allocation from direct property or custom fields", () => {
      const task1: Task = { id: "t1", category: "dev", start: "2026-11-01", end: "2026-11-05", allocation: 0.5 };
      expect(getTaskAllocationUnits(task1)).toBe(0.5);

      const task2: Task = {
        id: "t2",
        category: "dev",
        start: "2026-11-01",
        end: "2026-11-05",
        fields: { allocation: 0.8 }
      };
      expect(getTaskAllocationUnits(task2)).toBe(0.8);
    });
  });

  describe("detectOverAllocations", () => {
    it("returns empty when no resources overlap", () => {
      const tasks: Task[] = [
        { id: "t1", category: "dev", assignee: "alice", start: "2026-11-01", end: "2026-11-04" },
        { id: "t2", category: "dev", assignee: "alice", start: "2026-11-05", end: "2026-11-08" },
        { id: "t3", category: "qa", assignee: "bob", start: "2026-11-02", end: "2026-11-06" }
      ];
      const result = detectOverAllocations(tasks);
      expect(result).toHaveLength(0);
    });

    it("detects over-allocation when tasks overlap for the same resource", () => {
      const tasks: Task[] = [
        { id: "t1", category: "dev", assignee: "alice", start: "2026-11-02", end: "2026-11-06" },
        { id: "t2", category: "dev", assignee: "alice", start: "2026-11-04", end: "2026-11-08" }
      ];
      const result = detectOverAllocations(tasks);
      expect(result.length).toBeGreaterThan(0);
      // End dates are exclusive (t1 frees alice on 11-06), so the overlap days are 11-04 and 11-05
      const dates = result.map((r) => r.date);
      expect(dates).toEqual(["2026-11-04", "2026-11-05"]);
      expect(result[0].resourceId).toBe("alice");
      expect(result[0].tasks).toEqual(["t1", "t2"]);
      expect(result[0].totalUnits).toBe(2.0);
    });

    it("respects custom resource capacities", () => {
      const tasks: Task[] = [
        // Charlie has a single 0.8 unit task, but his capacity is 0.5 (part-time)
        { id: "t1", category: "design", assignee: "charlie", start: "2026-11-01", end: "2026-11-03", allocation: 0.8 }
      ];
      // Only single task, so no multi-task conflict unless 2 tasks overlap
      const tasksMulti: Task[] = [
        { id: "t1", category: "design", assignee: "charlie", start: "2026-11-01", end: "2026-11-03", allocation: 0.3 },
        { id: "t2", category: "design", assignee: "charlie", start: "2026-11-02", end: "2026-11-04", allocation: 0.3 }
      ];
      // Total 0.6 > capacity 0.5
      const result = detectOverAllocations(tasksMulti, {
        resourceCapacities: { charlie: 0.5 }
      });
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].resourceId).toBe("charlie");
      expect(result[0].totalUnits).toBe(0.6);

      // A single task above the part-time capacity is reported too, flagged as unfixable by shifting
      const single = detectOverAllocations(tasks, { resourceCapacities: { Charlie: 0.5 } });
      expect(single).toHaveLength(2);
      expect(single[0].reason).toBe("single-task-exceeds-capacity");
    });
  });

  describe("levelResources Heuristic", () => {
    it("levels concurrent tasks by shifting the lower priority task", () => {
      const tasks: Task[] = [
        {
          id: "t1",
          label: "Critical Backend Architecture",
          category: "dev",
          assignee: "alice",
          priority: "urgent",
          start: "2026-11-02",
          end: "2026-11-05" // 3 days
        },
        {
          id: "t2",
          label: "Minor UI Cleanup",
          category: "dev",
          assignee: "alice",
          priority: "low",
          start: "2026-11-03",
          end: "2026-11-06"
        }
      ];

      const result = levelResources(tasks, { defaultGapDays: 1 });

      expect(result.adjustments).toHaveLength(1);
      const adj = result.adjustments[0];
      expect(adj.taskId).toBe("t2");
      expect(adj.delayDays).toBeGreaterThan(0);

      // t1 should remain unchanged
      const t1Leveled = result.tasks.find((t) => t.id === "t1")!;
      expect(t1Leveled.start).toBe("2026-11-02");
      expect(t1Leveled.end).toBe("2026-11-05");

      // t2 should start after t1 ends + 1 gap day: 2026-11-05 + 1 = 2026-11-06
      const t2Leveled = result.tasks.find((t) => t.id === "t2")!;
      expect(t2Leveled.start).toBe("2026-11-06");

      // No over-allocations should remain
      expect(result.remainingOverallocations).toHaveLength(0);
    });

    it("honors locked tasks and shifts non-locked task even if locked task has lower priority", () => {
      const tasks: Task[] = [
        {
          id: "t1",
          label: "Fixed Contractor Slot",
          category: "dev",
          assignee: "alice",
          locked: true,
          priority: "low",
          start: "2026-11-02",
          end: "2026-11-05"
        },
        {
          id: "t2",
          label: "Urgent Task",
          category: "dev",
          assignee: "alice",
          priority: "urgent",
          start: "2026-11-03",
          end: "2026-11-06"
        }
      ];

      const result = levelResources(tasks, { defaultGapDays: 1 });

      const t1 = result.tasks.find((t) => t.id === "t1")!;
      expect(t1.start).toBe("2026-11-02"); // Locked task never moves

      const t2 = result.tasks.find((t) => t.id === "t2")!;
      expect(t2.start).toBe("2026-11-06"); // Shifted to after t1
    });

    it("cascades downstream dependencies of leveled tasks", () => {
      const tasks: Task[] = [
        {
          id: "t1",
          category: "dev",
          assignee: "alice",
          priority: "high",
          start: "2026-11-01",
          end: "2026-11-05"
        },
        {
          id: "t2",
          category: "dev",
          assignee: "alice",
          priority: "low",
          start: "2026-11-02",
          end: "2026-11-04"
        },
        {
          id: "t3",
          category: "qa",
          assignee: "bob",
          dependsOn: "t2",
          start: "2026-11-05",
          end: "2026-11-07"
        }
      ];

      const result = levelResources(tasks, { defaultGapDays: 1 });

      const t2 = result.tasks.find((t) => t.id === "t2")!;
      // t1 ends Nov 5. t2 shifted to Nov 6 - Nov 8 (duration 2 days)
      expect(t2.start).toBe("2026-11-06");
      expect(t2.end).toBe("2026-11-08");

      // t3 depends on t2. It must be cascaded to start after t2 ends (Nov 8 + 1 = Nov 9)
      const t3 = result.tasks.find((t) => t.id === "t3")!;
      expect(t3.start).toBe("2026-11-09");
      expect(t3.end).toBe("2026-11-11");
    });

    it("supports working days and calendars when leveling", () => {
      const tasks: Task[] = [
        {
          id: "t1",
          category: "dev",
          assignee: "alice",
          start: "2026-11-04", // Wednesday
          end: "2026-11-06" // Friday
        },
        {
          id: "t2",
          category: "dev",
          assignee: "alice",
          start: "2026-11-05",
          end: "2026-11-06"
        }
      ];

      const result = levelResources(tasks, {
        defaultGapDays: 1,
        useWorkingDays: true,
        calendar: CALENDAR_PRESETS.standard
      });

      const t2 = result.tasks.find((t) => t.id === "t2")!;
      // t1 ends Friday Nov 6. +1 working day gap -> starts Monday Nov 9!
      expect(t2.start).toBe("2026-11-09");

      // An explicit useWorkingDays: false wins over the calendar, exactly as in the cascade
      const calendarDays = levelResources(tasks, { defaultGapDays: 1, useWorkingDays: false, calendar: CALENDAR_PRESETS.standard });
      expect(calendarDays.tasks.find((t) => t.id === "t2")!.start).toBe("2026-11-07");
    });

    const t = (id: string, start: string, end: string, extra: Partial<Task> = {}): Task => ({
      id,
      category: "dev",
      assignee: "alice",
      start,
      end,
      ...extra
    });

    it("defers the lowest-priority task, only as far as capacity requires", () => {
      const result = levelResources(
        [
          t("U", "2026-01-05", "2026-01-15", { priority: "urgent" }),
          t("H", "2026-01-05", "2026-01-08", { priority: "high" }),
          t("L", "2026-01-05", "2026-01-08", { priority: "low" })
        ],
        { defaultCapacity: 2, defaultGapDays: 0 }
      );
      expect(result.adjustments.map((a) => a.taskId)).toEqual(["L"]);
      const low = result.tasks.find((x) => x.id === "L")!;
      expect(low.start).toBe("2026-01-08"); // as soon as H frees capacity, not after U ends
      expect(result.remainingOverallocations).toHaveLength(0);
    });

    it("never moves completed or started work", () => {
      const result = levelResources(
        [
          t("Done", "2026-01-06", "2026-01-09", { progress: 1, priority: "low" }),
          t("Started", "2026-01-06", "2026-01-12", { progress: 0.4, priority: "low" }),
          t("Next", "2026-01-06", "2026-01-09", { priority: "high" })
        ],
        { defaultGapDays: 0 }
      );
      const byId = new Map(result.tasks.map((x) => [x.id, x]));
      expect(byId.get("Done")!.start).toBe("2026-01-06");
      expect(byId.get("Started")!.start).toBe("2026-01-06");
      expect(byId.get("Next")!.start).toBe("2026-01-12");
    });

    it("preserves deleted tasks (tombstones) in its output", () => {
      const tombstone = t("Z", "2026-01-01", "2026-01-02", { _deleted: true });
      const leveled = levelResources([t("A", "2026-01-05", "2026-01-08"), t("B", "2026-01-06", "2026-01-09"), tombstone]);
      expect(leveled.tasks.map((x) => x.id)).toEqual(["A", "B", "Z"]);
      expect(leveled.tasks[2]._deleted).toBe(true);
      const untouched = levelResources([t("A", "2026-01-05", "2026-01-08"), tombstone]);
      expect(untouched.tasks.map((x) => x.id)).toEqual(["A", "Z"]);
    });

    it("gives milestones no load and does not flag same-day FS handoffs", () => {
      expect(detectOverAllocations([t("M", "2026-01-06", "2026-01-06", { milestone: true }), t("T", "2026-01-05", "2026-01-10")])).toHaveLength(0);
      expect(detectOverAllocations([t("A", "2026-01-05", "2026-01-08"), t("B", "2026-01-08", "2026-01-12", { dependsOn: "A" })])).toHaveLength(0);
    });

    it("leaves unrelated tasks alone when the plan's gap is passed, and reports cascade moves", () => {
      const plan: Task[] = [
        t("A", "2026-01-05", "2026-01-08", { priority: "high" }),
        t("B", "2026-01-06", "2026-01-09", { priority: "low" }),
        t("C", "2026-01-09", "2026-01-12", { assignee: "bob", dependsOn: "B" }),
        t("X", "2026-01-05", "2026-01-07", { assignee: "carol" }),
        t("Y", "2026-01-07", "2026-01-09", { assignee: "carol", dependsOn: "X" })
      ];
      const result = levelResources(plan, { defaultGapDays: 0 });
      const byId = new Map(result.tasks.map((x) => [x.id, x]));
      expect(byId.get("B")!.start).toBe("2026-01-08");
      expect(byId.get("C")!.start).toBe("2026-01-11"); // cascaded after B
      expect(byId.get("Y")!.start).toBe("2026-01-07"); // unrelated chain untouched
      expect(result.adjustments.map((a) => a.taskId)).toEqual(["B", "C"]);
      expect(result.adjustments[1].reason).toMatch(/cascade/i);
    });

    it("skips unresolvable conflicts and keeps leveling the rest", () => {
      const result = levelResources(
        [
          t("L1", "2026-01-05", "2026-01-09", { locked: true }),
          t("L2", "2026-01-06", "2026-01-10", { locked: true }),
          t("B1", "2026-01-05", "2026-01-09", { assignee: "bob", priority: "high" }),
          t("B2", "2026-01-06", "2026-01-10", { assignee: "bob", priority: "low" })
        ],
        { defaultGapDays: 0 }
      );
      expect(result.adjustments.map((a) => a.taskId)).toEqual(["B2"]);
      expect(result.remainingOverallocations.every((o) => o.resourceId === "alice")).toBe(true);
      expect(result.remainingOverallocations.length).toBeGreaterThan(0);
    });

    it("treats the same person by id, username and name as one resource", () => {
      const people = [{ id: "person-alex", name: "Alex Morgan", username: "@alex" }];
      const tasks = [
        t("A", "2026-01-05", "2026-01-08", { assignee: "person-alex" }),
        t("B", "2026-01-06", "2026-01-09", { assignee: "alex morgan" }),
        t("C", "2026-01-07", "2026-01-10", { assignee: "alex" })
      ];
      const conflicts = detectOverAllocations(tasks, { people, resourceCapacities: { "Alex Morgan": 2 } });
      expect(conflicts.map((c) => c.date)).toEqual(["2026-01-07"]);
      expect(conflicts[0].resourceId).toBe("person-alex");
      expect(conflicts[0].tasks).toEqual(["A", "B", "C"]);
    });

    it("stays fast and bounded with far-future dates", () => {
      const started = Date.now();
      const result = detectOverAllocations([t("A", "2026-01-01", "9999-12-31"), t("B", "2026-01-01", "9999-12-31")]);
      expect(Date.now() - started).toBeLessThan(2000);
      expect(result.length).toBeLessThanOrEqual(3660);
      expect(result[0].date).toBe("2026-01-01");
    });
  });
});
