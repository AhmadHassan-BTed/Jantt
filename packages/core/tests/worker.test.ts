import { describe, it, expect } from "vitest";
import { createScheduleWorkerClient } from "../src/worker";
import type { JanttData } from "../src/types";

describe("ScheduleWorkerClient", () => {
  const samplePlan: JanttData = {
    meta: { title: "Async Scheduling Plan" },
    tasks: [
      { id: "t1", label: "Spec", category: "dev", start: "2026-11-01", end: "2026-11-04" },
      { id: "t2", label: "Build", category: "dev", start: "2026-11-02", end: "2026-11-08", dependsOn: "t1" }
    ]
  };

  it("resolves schedule dependencies asynchronously", async () => {
    const client = createScheduleWorkerClient();
    const resolved: any = await client.resolveSchedule(samplePlan, { defaultGapDays: 1 });

    expect(resolved.tasks).toHaveLength(2);
    // t1 ends 2026-11-04, gapDays=1 -> t2 starts 2026-11-05
    expect(resolved.tasks[1].start).toBe("2026-11-05");
    client.terminate();
  });

  it("executes Monte Carlo schedule simulation asynchronously", async () => {
    const client = createScheduleWorkerClient();
    const result = await client.runMonteCarlo(samplePlan, { iterations: 100 });

    expect(result.iterations).toBe(100);
    expect(result.percentiles.P50.durationDays).toBeGreaterThan(0);
    expect(result.taskCriticality.length).toBeGreaterThan(0);
    client.terminate();
  });

  it("executes resource leveling asynchronously", async () => {
    const client = createScheduleWorkerClient();
    const overAllocatedPlan: JanttData = {
      tasks: [
        { id: "a", label: "Task A", category: "dev", start: "2026-11-01", end: "2026-11-05", assignee: "Alice", priority: "urgent" },
        { id: "b", label: "Task B", category: "dev", start: "2026-11-02", end: "2026-11-04", assignee: "Alice", priority: "low" }
      ]
    };

    const result = await client.levelResources(overAllocatedPlan);
    expect(result.tasks).toHaveLength(2);
    expect(result.adjustments.length).toBeGreaterThanOrEqual(1);
    client.terminate();
  });

  it("handles termination cleanly", () => {
    const client = createScheduleWorkerClient();
    expect(typeof client.isWorkerActive()).toBe("boolean");
    expect(() => client.terminate()).not.toThrow();
  });
});
