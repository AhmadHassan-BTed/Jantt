import { describe, it, expect } from "vitest";
import {
  parseDependencyRelation,
  getTaskDependencyRelations,
  inspectDependencyItem,
  filterDependsOn,
  appendDependency,
  buildDependencyGraph,
  resolveRelationLag,
  MAX_DEPENDENCY_LAG_DAYS,
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
      expect(parseDependencyRelation("task-1:FS+3d")).toEqual({ id: "task-1", type: "FS", lagDays: 3, explicitLag: true });
      expect(parseDependencyRelation("task-1:SS+5")).toEqual({ id: "task-1", type: "SS", lagDays: 5, explicitLag: true });
      expect(parseDependencyRelation("task-1+2d")).toEqual({ id: "task-1", type: "FS", lagDays: 2, explicitLag: true });
    });

    it("parses negative lag offsets (lead time)", () => {
      expect(parseDependencyRelation("task-1:FF-2d")).toEqual({ id: "task-1", type: "FF", lagDays: -2, explicitLag: true });
      expect(parseDependencyRelation("task-1-3d")).toEqual({ id: "task-1", type: "FS", lagDays: -3, explicitLag: true });
      expect(parseDependencyRelation("task-1:FS-3")).toEqual({ id: "task-1", type: "FS", lagDays: -3, explicitLag: true });
    });

    it("parses structured dependency objects", () => {
      expect(parseDependencyRelation({ id: "task-1", type: "SS", lag: 4 })).toEqual({
        id: "task-1",
        type: "SS",
        lagDays: 4,
        explicitLag: true
      });
      expect(parseDependencyRelation({ id: "task-2", type: "FF", lagDays: -1 })).toEqual({
        id: "task-2",
        type: "FF",
        lagDays: -1,
        explicitLag: true
      });
      expect(parseDependencyRelation({ id: "task-3", type: "fs" })).toEqual({ id: "task-3", type: "FS", lagDays: 0 });
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
      expect(relations[0]).toEqual({ id: "t1", type: "FS", lagDays: 2, explicitLag: true });
      expect(relations[1]).toEqual({ id: "t2", type: "SS", lagDays: 0 });
      expect(relations[2]).toEqual({ id: "t3", type: "FF", lagDays: -1, explicitLag: true });
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
      expect(relations[1]).toEqual({ id: "t2", type: "SS", lagDays: 3, explicitLag: true });
      expect(relations[2]).toEqual({ id: "t3", type: "SF", lagDays: 1, explicitLag: true });
    });

    it("treats tokens that exactly match a known task id as plain ids", () => {
      const known = new Set(["model-3d", "build-10days", "model"]);
      expect(getTaskDependencyRelations({ dependsOn: ["model-3d", "build-10days"] }, known)).toEqual([
        { id: "model-3d", type: "FS", lagDays: 0 },
        { id: "build-10days", type: "FS", lagDays: 0 }
      ]);
      // Without the id set the shorthand reading is kept for backward compatibility
      expect(parseDependencyRelation("model-3d")).toEqual({ id: "model", type: "FS", lagDays: -3, explicitLag: true });
    });

    it("accepts typed syntax for ids with spaces/unicode and a 'day' suffix everywhere", () => {
      expect(parseDependencyRelation("Phase 1:SS")).toEqual({ id: "Phase 1", type: "SS", lagDays: 0 });
      expect(parseDependencyRelation("\u00c9tape@2 : ff+2day")).toEqual({ id: "\u00c9tape@2", type: "FF", lagDays: 2, explicitLag: true });
      expect(parseDependencyRelation("t1+2day")).toEqual({ id: "t1", type: "FS", lagDays: 2, explicitLag: true });
    });
  });

  describe("inspectDependencyItem (malformed input)", () => {
    it("clamps out-of-range lags and ignores non-finite ones", () => {
      const huge = inspectDependencyItem({ id: "A", lag: 1e9 });
      expect(huge.relation?.lagDays).toBe(MAX_DEPENDENCY_LAG_DAYS);
      expect(huge.issue).toContain("exceeds");
      const shorthand = inspectDependencyItem("A:FS+99999999d");
      expect(shorthand.relation?.lagDays).toBe(MAX_DEPENDENCY_LAG_DAYS);
      expect(shorthand.issue).toBeDefined();
      const nan = inspectDependencyItem({ id: "A", lag: Number.NaN });
      expect(nan.relation).toEqual({ id: "A", type: "FS", lagDays: 0 });
      expect(nan.issue).toBeDefined();
      expect(parseDependencyRelation({ id: "A", lag: 1.6 })?.lagDays).toBe(2);
    });

    it("reports unknown types, bad shapes and missing ids", () => {
      expect(inspectDependencyItem({ id: "A", type: "XX" }).issue).toContain("Unknown dependency type");
      expect(inspectDependencyItem("A:XX").issue).toContain("recognised type");
      expect(inspectDependencyItem(5).relation).toBeNull();
      expect(inspectDependencyItem(5).issue).toBeDefined();
      expect(inspectDependencyItem({ type: "SS" }).issue).toContain("id");
      expect(inspectDependencyItem("A:XX", new Set(["A:XX"])).issue).toBeUndefined();
    });
  });

  describe("resolveRelationLag", () => {
    const rel = (r: Partial<DependencyRelation>): DependencyRelation => ({ id: "A", type: "FS", lagDays: 0, ...r });
    it("uses the gap only for FS links without an explicit lag", () => {
      expect(resolveRelationLag(rel({}), 2)).toBe(2);
      expect(resolveRelationLag(rel({ type: "SS" }), 2)).toBe(0);
      expect(resolveRelationLag(rel({ type: "FF" }), 2)).toBe(0);
      expect(resolveRelationLag(rel({ explicitLag: true }), 2)).toBe(0);
      expect(resolveRelationLag(rel({ lagDays: 3 }), 2)).toBe(3); // hand-built relation without the flag
    });
  });

  describe("filterDependsOn & appendDependency", () => {
    it("removes links while preserving typed items verbatim", () => {
      const raw = ["A:SS+1d", "ghost", { id: "B", type: "FF" as const, lag: 3 }];
      expect(filterDependsOn(raw, (r) => r.id !== "ghost")).toEqual(["A:SS+1d", { id: "B", type: "FF", lag: 3 }]);
      expect(filterDependsOn("A:SS+1d, ghost", (r) => r.id !== "ghost")).toBe("A:SS+1d");
      expect(filterDependsOn("A:SS, B:FF-1d, ghost", (r) => r.id !== "ghost")).toBe("A:SS, B:FF-1d");
      expect(filterDependsOn(["ghost"], (r) => r.id !== "ghost")).toBeNull();
    });

    it("returns the original value when nothing is removed", () => {
      const raw = ["A:SS+1d", "B"];
      expect(filterDependsOn(raw, () => true)).toBe(raw);
      expect(filterDependsOn(null, () => false)).toBeNull();
      expect(filterDependsOn(undefined, () => false)).toBeUndefined();
    });

    it("appends a link without rewriting existing ones", () => {
      expect(appendDependency(null, "C")).toBe("C");
      expect(appendDependency("A:SS+2d", "C")).toEqual(["A:SS+2d", "C"]);
      expect(appendDependency([{ id: "A", type: "FF" as const }], "C:SS")).toEqual([{ id: "A", type: "FF" }, "C:SS"]);
      expect(appendDependency({ id: "A", type: "FF", lag: -1 }, "C")).toEqual([{ id: "A", type: "FF", lag: -1 }, "C"]);
    });

    it("deleting a predecessor keeps every other link's type, lag and shape (ARCH-03)", () => {
      const lagged = { id: "b", type: "FF" as const, lag: -1 };
      const plan: Task[] = [
        { id: "a", category: "c", start: "2026-01-01", end: "2026-01-05" },
        { id: "b", category: "c", start: "2026-01-01", end: "2026-01-05" },
        { id: "doomed", category: "c", start: "2026-01-01", end: "2026-01-05" },
        { id: "s1", category: "c", start: "2026-01-10", end: "2026-01-12", dependsOn: ["a:SS+2d", lagged, "doomed"] },
        { id: "s2", category: "c", start: "2026-01-10", end: "2026-01-12", dependsOn: "a:SS+2d, doomed:FF, b-1d" },
        { id: "s3", category: "c", start: "2026-01-10", end: "2026-01-12", dependsOn: lagged }
      ];
      const knownIds = new Set(plan.map((t) => t.id));
      const next = plan
        .filter((t) => t.id !== "doomed")
        .map((t) => {
          const deps = filterDependsOn(t.dependsOn, (rel) => rel.id !== "doomed", knownIds);
          return deps === t.dependsOn ? t : { ...t, dependsOn: deps ?? null };
        });
      expect(next.find((t) => t.id === "s1")!.dependsOn).toEqual(["a:SS+2d", lagged]);
      expect(next.find((t) => t.id === "s2")!.dependsOn).toBe("a:SS+2d, b-1d");
      // Untouched tasks (and their dependsOn objects) keep their identity
      expect(next.find((t) => t.id === "s3")).toBe(plan[5]);
      expect(getTaskDependencyRelations(next.find((t) => t.id === "s1"), knownIds)).toEqual([
        { id: "a", type: "SS", lagDays: 2, explicitLag: true },
        { id: "b", type: "FF", lagDays: -1, explicitLag: true }
      ]);
    });
  });

  describe("buildDependencyGraph", () => {
    const t = (id: string, dependsOn?: Task["dependsOn"]): Task => ({ id, category: "c", start: "2026-01-01", end: "2026-01-02", dependsOn });

    it("orders tasks topologically regardless of input order", () => {
      const graph = buildDependencyGraph([t("C", "B"), t("B", "A"), t("A")]);
      expect(graph.order).toEqual(["A", "B", "C"]);
      expect(graph.cycles).toEqual([]);
    });

    it("isolates cycles as strongly connected components without affecting downstream tasks", () => {
      const graph = buildDependencyGraph([t("A", "B"), t("B", "A"), t("C", "B"), t("D", ["C", "E"]), t("E")]);
      expect(graph.cycles).toEqual([["A", "B"]]);
      expect(graph.isCyclicEdge("B", "A")).toBe(true);
      expect(graph.isCyclicEdge("B", "C")).toBe(false);
      expect(graph.order.indexOf("C")).toBeGreaterThan(graph.order.indexOf("B"));
      expect(graph.order.indexOf("D")).toBeGreaterThan(graph.order.indexOf("C"));
    });

    it("reports duplicates and self references separately from cycles", () => {
      const graph = buildDependencyGraph([t("A"), t("A", "B"), t("B", "A"), t("S", "S")]);
      expect(graph.duplicateIds).toEqual(["A"]);
      expect(graph.selfReferences).toEqual(["S"]);
      expect(graph.cycles).toEqual([]);
      expect(graph.nodes.get("A")?.dependsOn).toBeUndefined(); // first occurrence wins
    });

    it("handles very long chains without recursion limits", () => {
      const tasks = Array.from({ length: 20000 }, (_, i) => t(`t${i}`, i > 0 ? `t${i - 1}` : undefined)).reverse();
      const graph = buildDependencyGraph(tasks);
      expect(graph.order[0]).toBe("t0");
      expect(graph.order[graph.order.length - 1]).toBe("t19999");
    });

    it("ignores prototype-like ids that are not tasks", () => {
      const graph = buildDependencyGraph([t("A", ["constructor", "__proto__", "toString"])]);
      expect(graph.predecessors.get("A")).toEqual([]);
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

    it("does not add the default gap to SS/FF links without a lag", () => {
      const tasks: Task[] = [
        { id: "A", category: "dev", start: "2026-03-02", end: "2026-03-10" },
        { id: "SS", category: "dev", start: "2026-03-01", end: "2026-03-03", dependsOn: "A:SS" },
        { id: "FF", category: "dev", start: "2026-03-01", end: "2026-03-04", dependsOn: "A:FF" }
      ];
      const resolved = resolveSchedule(tasks, 2);
      expect(resolved.find((t) => t.id === "SS")!.start).toBe("2026-03-02");
      expect(resolved.find((t) => t.id === "FF")!.end).toBe("2026-03-10");
    });

    it("honors an explicit zero lag instead of the default gap", () => {
      const tasks: Task[] = [
        { id: "A", category: "dev", start: "2026-03-02", end: "2026-03-10" },
        { id: "B", category: "dev", start: "2026-03-01", end: "2026-03-03", dependsOn: "A:FS+0" },
        { id: "C", category: "dev", start: "2026-03-01", end: "2026-03-03", dependsOn: { id: "A", type: "FS", lag: 0 } },
        { id: "D", category: "dev", start: "2026-03-01", end: "2026-03-03", dependsOn: "A" }
      ];
      const resolved = resolveSchedule(tasks, 2);
      expect(resolved.find((t) => t.id === "B")!.start).toBe("2026-03-10");
      expect(resolved.find((t) => t.id === "C")!.start).toBe("2026-03-10");
      expect(resolved.find((t) => t.id === "D")!.start).toBe("2026-03-12");
    });

    it("schedules ids that look like lag shorthand when the task exists", () => {
      const tasks: Task[] = [
        { id: "render-3d", category: "dev", start: "2026-03-02", end: "2026-03-10" },
        { id: "B", category: "dev", start: "2026-03-01", end: "2026-03-03", dependsOn: "render-3d" }
      ];
      const b = resolveSchedule(tasks, 0).find((t) => t.id === "B")!;
      expect(b.start).toBe("2026-03-10");
    });
  });
});
