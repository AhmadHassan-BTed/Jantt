import { describe, it, expect } from "vitest";
import {
  parseDependencyRelation,
  getTaskDependencyRelations,
  DependencyRelation
} from "../src/dependencies";
import { resolveSchedule } from "../src/resolver";
import { Task } from "../src/types";

describe("Enterprise 4-Type Dependency & Lead/Lag Engine", () => {
  describe("parseDependencyRelation", () => {
    it("parses classic string id as default FS with 0 lag", () => {
      const rel = parseDependencyRelation("task-1");
      expect(rel).toEqual({ id: "task-1", type: "FS", lagDays: 0 });
    });

    it("parses explicit relationship types without lag", () => {
      expect(parseDependencyRelation("task-A:SS")).toEqual({ id: "task-A", type: "SS", lagDays: 0 });
      expect(parseDependencyRelation("task-B:FF")).toEqual({ id: "task-B", type: "FF", lagDays: 0 });
      expect(parseDependencyRelation("task-C:SF")).toEqual({ id: "task-C", type: "SF", lagDays: 0 });
      expect(parseDependencyRelation("task-D:FS")).toEqual({ id: "task-D", type: "FS", lagDays: 0 });
    });

    it("parses positive lag offsets (lag time)", () => {
      expect(parseDependencyRelation("task-1:FS+3d")).toEqual({ id: "task-1", type: "FS", lagDays: 3 });
      expect(parseDependencyRelation("task-1:SS+5")).toEqual({ id: "task-1", type: "SS", lagDays: 5 });
      expect(parseDependencyRelation("task-1+2d")).toEqual({ id: "task-1", type: "FS", lagDays: 2 });
    });

    it("parses negative lag offsets (lead time)", () => {
      expect(parseDependencyRelation("task-1:FF-2d")).toEqual({ id: "task-1", type: "FF", lagDays: -2 });
      expect(parseDependencyRelation("task-1-3d")).toEqual({ id: "task-1", type: "FS", lagDays: -3 });
      expect(parseDependencyRelation("task-1:FS-3")).toEqual({ id: "task-1", type: "FS", lagDays: -3 });
    });

    it("parses structured dependency objects", () => {
      expect(parseDependencyRelation({ id: "task-1", type: "SS", lag: 4 })).toEqual({
        id: "task-1",
        type: "SS",
        lagDays: 4
      });
      expect(parseDependencyRelation({ id: "task-2", type: "FF", lagDays: -1 })).toEqual({
        id: "task-2",
        type: "FF",
        lagDays: -1
      });
    });

    it("returns null for invalid inputs", () => {
      expect(parseDependencyRelation("")).toBeNull();
      expect(parseDependencyRelation(null)).toBeNull();
      expect(parseDependencyRelation({})).toBeNull();
    });
  });

  describe("getTaskDependencyRelations", () => {
    it("extracts multiple dependencies from a comma-separated string", () => {
      const task = { dependsOn: "t1:FS+2d, t2:SS, t3:FF-1d" };
      const relations = getTaskDependencyRelations(task);
      expect(relations).toHaveLength(3);
      expect(relations[0]).toEqual({ id: "t1", type: "FS", lagDays: 2 });
      expect(relations[1]).toEqual({ id: "t2", type: "SS", lagDays: 0 });
      expect(relations[2]).toEqual({ id: "t3", type: "FF", lagDays: -1 });
    });

    it("extracts dependencies from mixed arrays (strings & objects)", () => {
      const task = {
        dependsOn: [
          "t1",
          { id: "t2", type: "SS" as const, lag: 3 },
          "t3:SF+1"
        ]
      };
      const relations = getTaskDependencyRelations(task);
      expect(relations).toHaveLength(3);
      expect(relations[1]).toEqual({ id: "t2", type: "SS", lagDays: 3 });
      expect(relations[2]).toEqual({ id: "t3", type: "SF", lagDays: 1 });
    });
  });

  describe("resolveSchedule with 4-Type Dependencies", () => {
    it("paces Finish-to-Start (FS) with positive lag", () => {
      const tasks: Task[] = [
        { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-05" }, // 4 days duration
        { id: "B", category: "dev", start: "2026-09-01", end: "2026-09-04", dependsOn: "A:FS+3d" } // 3 days lag after A finishes (Sept 5 + 3 = Sept 8)
      ];

      const resolved = resolveSchedule(tasks);
      const b = resolved.find((t) => t.id === "B")!;
      expect(b.start).toBe("2026-09-08");
      expect(b.end).toBe("2026-09-11"); // preserves 3-day duration
    });

    it("paces Start-to-Start (SS) with lag", () => {
      const tasks: Task[] = [
        { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-20" }, // Long task
        { id: "B", category: "dev", start: "2026-09-01", end: "2026-09-05", dependsOn: "A:SS+2d" } // Starts 2 days after A starts (Sept 1 + 2 = Sept 3)
      ];

      const resolved = resolveSchedule(tasks);
      const b = resolved.find((t) => t.id === "B")!;
      expect(b.start).toBe("2026-09-03");
      expect(b.end).toBe("2026-09-07"); // preserves 4-day duration
    });

    it("paces Finish-to-Finish (FF) with lag", () => {
      const tasks: Task[] = [
        { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-10" },
        // B has duration of 5 days. Must finish on or after A's finish + 1d (Sept 11).
        // Therefore B must start at least on Sept 11 - 5d = Sept 6.
        { id: "B", category: "dev", start: "2026-09-01", end: "2026-09-06", dependsOn: "A:FF+1d" }
      ];

      const resolved = resolveSchedule(tasks);
      const b = resolved.find((t) => t.id === "B")!;
      expect(b.start).toBe("2026-09-06");
      expect(b.end).toBe("2026-09-11");
    });

    it("paces Start-to-Finish (SF) with lag", () => {
      const tasks: Task[] = [
        { id: "A", category: "dev", start: "2026-09-10", end: "2026-09-20" },
        // B has duration of 4 days. Must finish on or after A's start + 2d (Sept 12).
        // Therefore B must start at least on Sept 12 - 4d = Sept 8.
        { id: "B", category: "dev", start: "2026-09-01", end: "2026-09-05", dependsOn: "A:SF+2d" }
      ];

      const resolved = resolveSchedule(tasks);
      const b = resolved.find((t) => t.id === "B")!;
      expect(b.start).toBe("2026-09-08");
      expect(b.end).toBe("2026-09-12");
    });

    it("correctly resolves multi-dependency convergence with mixed types", () => {
      const tasks: Task[] = [
        { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-05" }, // FS target: Sept 5 + 0 = Sept 5
        { id: "B", category: "dev", start: "2026-09-01", end: "2026-09-15" }, // SS+6 target: Sept 1 + 6 = Sept 7
        // C has duration 3 days. Depends on both A (FS) and B (SS+6d).
        // Must honor the latest constraint: max(Sept 5, Sept 7) = Sept 7.
        { id: "C", category: "dev", start: "2026-09-01", end: "2026-09-04", dependsOn: ["A:FS", "B:SS+6d"] }
      ];

      const resolved = resolveSchedule(tasks, 0);
      const c = resolved.find((t) => t.id === "C")!;
      expect(c.start).toBe("2026-09-07");
      expect(c.end).toBe("2026-09-10");
    });
  });
});
