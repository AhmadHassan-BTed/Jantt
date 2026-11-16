import { describe, it, expect } from "vitest";
import {
  freezeProjectBaseline,
  activateBaselineSnapshot,
  computeBaselineVariance,
  getBaselineSnapshots
} from "../src/baselines";
import type { JanttData } from "../src/types";

describe("Project Baseline Snapshot & Variance Analysis Engine", () => {
  const initialPlan: JanttData = {
    tasks: [
      {
        id: "t1",
        label: "Architecture",
        category: "dev",
        start: "2026-11-01",
        end: "2026-11-05",
        estimatedCost: 5000,
        actualCost: 5500
      },
      {
        id: "t2",
        label: "Implementation",
        category: "dev",
        start: "2026-11-06",
        end: "2026-11-15",
        estimatedCost: 10000,
        actualCost: 9000
      }
    ]
  };

  it("freezes project baseline into meta.baselines and synchronizes task baselines", () => {
    const { updatedData, snapshot } = freezeProjectBaseline(initialPlan, "Initial Contract Baseline");

    expect(snapshot.id).toBeDefined();
    expect(snapshot.name).toBe("Initial Contract Baseline");
    expect(snapshot.tasks).toHaveLength(2);
    expect(snapshot.tasks[0]).toEqual({
      taskId: "t1",
      start: "2026-11-01",
      end: "2026-11-05",
      estimatedCost: 5000 // The budget at freeze time, not the spend so far
    });

    expect(updatedData.meta?.showBaselines).toBe(true);
    expect(updatedData.meta?.baselines).toHaveLength(1);
    expect(updatedData.tasks[0].baseline).toEqual({
      start: "2026-11-01",
      end: "2026-11-05"
    });
  });

  it("computes variance accurately when tasks slip or advance", () => {
    const { updatedData } = freezeProjectBaseline(initialPlan, "Contract Baseline");

    // Modify current task dates (t1 is delayed by 2 days, t2 is delayed by 4 days)
    const slippedPlan: JanttData = {
      ...updatedData,
      tasks: [
        {
          ...updatedData.tasks[0],
          start: "2026-11-03", // +2 days delayed start
          end: "2026-11-07", // +2 days delayed finish
          actualCost: 6200
        },
        {
          ...updatedData.tasks[1],
          start: "2026-11-08", // +2 days
          end: "2026-11-19", // +4 days delayed finish
          actualCost: 12500
        }
      ]
    };

    const variance = computeBaselineVariance(slippedPlan)!;
    expect(variance).not.toBeNull();
    expect(variance.baselineName).toBe("Contract Baseline");
    expect(variance.projectEndSlippageDays).toBe(4); // Nov 15 baseline -> Nov 19 current
    expect(variance.totalDelayedTasks).toBe(2);
    expect(variance.totalAheadTasks).toBe(0);

    const t1Var = variance.taskVariances.find((v) => v.taskId === "t1")!;
    expect(t1Var.startSlippageDays).toBe(2);
    expect(t1Var.endSlippageDays).toBe(2);
    expect(t1Var.durationVarianceDays).toBe(0); // 4 days duration unchanged
    expect(t1Var.costVariance).toBe(1200); // 6200 actual - 5000 baseline budget
    expect(t1Var.status).toBe("delayed");

    const t2Var = variance.taskVariances.find((v) => v.taskId === "t2")!;
    expect(t2Var.endSlippageDays).toBe(4);
    expect(t2Var.durationVarianceDays).toBe(2); // took 11 days vs baseline 9 days
    expect(t2Var.status).toBe("delayed");

    expect(variance.worstSlippedTasks[0].taskId).toBe("t2");
  });

  it("activates multiple baseline snapshots", () => {
    // Freeze first baseline
    const { updatedData: planWithBase1, snapshot: base1 } = freezeProjectBaseline(initialPlan, "Baseline 1");

    // Change dates and freeze second baseline
    const modifiedPlan: JanttData = {
      ...planWithBase1,
      tasks: [
        { ...planWithBase1.tasks[0], start: "2026-11-03", end: "2026-11-07" },
        { ...planWithBase1.tasks[1], start: "2026-11-08", end: "2026-11-18" }
      ]
    };
    const { updatedData: planWithBase2, snapshot: base2 } = freezeProjectBaseline(modifiedPlan, "Baseline 2");

    expect(planWithBase2.meta?.baselines).toHaveLength(2);

    // Reactivate Baseline 1
    const reactivatedPlan = activateBaselineSnapshot(planWithBase2, base1.id);
    expect(reactivatedPlan.meta?.activeBaselineId).toBe(base1.id);
    expect(reactivatedPlan.tasks[0].baseline?.start).toBe("2026-11-01");
    expect(reactivatedPlan.tasks[0].baseline?.end).toBe("2026-11-05");

    // Reactivate Baseline 2
    const reactivatedPlan2 = activateBaselineSnapshot(planWithBase2, base2.id);
    expect(reactivatedPlan2.meta?.activeBaselineId).toBe(base2.id);
    expect(reactivatedPlan2.tasks[0].baseline?.start).toBe("2026-11-03");
    expect(reactivatedPlan2.tasks[0].baseline?.end).toBe("2026-11-07");
  });

  describe("malformed and remote baseline data", () => {
    const snapshot = {
      id: "b1",
      name: "Remote",
      createdAt: "2026-10-01T00:00:00.000Z",
      tasks: { 0: { taskId: "t1", start: "2026-11-01", end: "2026-11-05", estimatedCost: 5000 }, 1: null }
    };

    it("reads RTDB object-form snapshots and drops unusable entries", () => {
      const snapshots = getBaselineSnapshots({
        baselines: { a: snapshot, b: { name: "no id" }, c: { id: "b2", tasks: "nope" } } as never
      });
      expect(snapshots.map((s) => s.id)).toEqual(["b1", "b2"]);
      expect(snapshots[0].tasks).toEqual([{ taskId: "t1", start: "2026-11-01", end: "2026-11-05", estimatedCost: 5000 }]);
      expect(snapshots[1].tasks).toEqual([]);
    });

    it("never throws on malformed meta.baselines", () => {
      const plan = { ...initialPlan, meta: { baselines: { a: snapshot } as never, activeBaselineId: "b1" } };
      expect(() => activateBaselineSnapshot(plan, "b1")).not.toThrow();
      expect(computeBaselineVariance(plan)?.baselineId).toBe("b1");
      const frozen = freezeProjectBaseline(plan, "Next").updatedData;
      expect(frozen.meta?.baselines?.map((b) => b.id)).toEqual(["b1", frozen.meta?.activeBaselineId]);
      expect(computeBaselineVariance({ ...initialPlan, meta: { baselines: 42 as never } })).toBeNull();
    });

    it("tolerates holes in the task list when freezing and activating", () => {
      const plan: JanttData = { ...initialPlan, tasks: [...initialPlan.tasks, null as never] };
      const { updatedData, snapshot } = freezeProjectBaseline(plan, "Holes");
      expect(snapshot.tasks.map((e) => e.taskId)).toEqual(["t1", "t2"]);
      expect(() => activateBaselineSnapshot(updatedData, snapshot.id)).not.toThrow();
    });

    it("does not mix dates from another snapshot into an activated or selected baseline", () => {
      const { updatedData: withB1, snapshot: b1 } = freezeProjectBaseline(initialPlan, "B1");
      const grown: JanttData = {
        ...withB1,
        tasks: [...withB1.tasks, { id: "n", category: "dev", start: "2026-11-20", end: "2026-11-25" }]
      };
      const { updatedData: withB2 } = freezeProjectBaseline(grown, "B2");

      const reactivated = activateBaselineSnapshot(withB2, b1.id);
      expect(reactivated.tasks.find((t) => t.id === "n")!.baseline).toBeUndefined();

      const variance = computeBaselineVariance(withB2, b1.id)!;
      expect(variance.baselineName).toBe("B1");
      expect(variance.taskVariances.map((v) => v.taskId)).toEqual(["t1", "t2"]);
      expect(variance.unbaselinedTaskIds).toEqual(["n"]);
      expect(computeBaselineVariance(withB2, "missing")).toBeNull();
    });
  });
});
