import { describe, it, expect } from "vitest";
import {
  freezeProjectBaseline,
  activateBaselineSnapshot,
  computeBaselineVariance
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
      estimatedCost: 5500 // Took actualCost as new freeze baseline
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
    expect(t1Var.costVariance).toBe(700); // 6200 - 5500
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
});
