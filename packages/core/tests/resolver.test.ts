import { describe, it, expect } from "vitest";
import { resolveSchedule } from "../src/resolver";
import { Task } from "../src/types";

describe("Schedule Resolver", () => {
  it("enforces explicit dependency spacing with gapDays", () => {
    const tasks: Task[] = [
      { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      { id: "B", category: "dev", start: "2026-09-02", end: "2026-09-08", dependsOn: "A", gapDays: 2 }
    ];

    const resolved = resolveSchedule(tasks, 2);
    const taskB = resolved.find((t) => t.id === "B")!;
    // A ends 2026-09-05, gap is 2 days -> B must start at 2026-09-07
    // Duration of B was 6 days (09-02 to 09-08), so end should be 2026-09-13
    expect(taskB.start).toBe("2026-09-07");
    expect(taskB.end).toBe("2026-09-13");
  });

  it("cascades multi-level dependency chains (A -> B -> C)", () => {
    const tasks: Task[] = [
      { id: "A", category: "dev", start: "2026-09-01", end: "2026-09-10" },
      { id: "B", category: "dev", start: "2026-09-02", end: "2026-09-05", dependsOn: "A", gapDays: 1 },
      { id: "C", category: "dev", start: "2026-09-03", end: "2026-09-07", dependsOn: "B", gapDays: 1 }
    ];

    const resolved = resolveSchedule(tasks, 1);
    const taskB = resolved.find((t) => t.id === "B")!;
    const taskC = resolved.find((t) => t.id === "C")!;

    // A ends 09-10 -> B starts 09-11, duration 3d -> B ends 09-14
    expect(taskB.start).toBe("2026-09-11");
    expect(taskB.end).toBe("2026-09-14");

    // B ends 09-14 -> C starts 09-15, duration 4d -> C ends 09-19
    expect(taskC.start).toBe("2026-09-15");
    expect(taskC.end).toBe("2026-09-19");
  });

  it("auto-spaces sibling tasks sharing a category (implicit pacing)", () => {
    const tasks: Task[] = [
      { id: "app-1", category: "ready", start: "2026-09-01", end: "2026-09-03" },
      { id: "app-2", category: "ready", start: "2026-09-01", end: "2026-09-04" },
      { id: "app-3", category: "ready", start: "2026-09-02", end: "2026-09-05" }
    ];

    const resolved = resolveSchedule(tasks, 2);
    const app1 = resolved.find((t) => t.id === "app-1")!;
    const app2 = resolved.find((t) => t.id === "app-2")!;
    const app3 = resolved.find((t) => t.id === "app-3")!;

    // app-1: 09-01 to 09-03
    expect(app1.start).toBe("2026-09-01");
    expect(app1.end).toBe("2026-09-03");

    // app-2: starts 09-03 + 2 = 09-05, duration 3d -> ends 09-08
    expect(app2.start).toBe("2026-09-05");
    expect(app2.end).toBe("2026-09-08");

    // app-3: starts 09-08 + 2 = 09-10, duration 3d -> ends 09-13
    expect(app3.start).toBe("2026-09-10");
    expect(app3.end).toBe("2026-09-13");
  });

  it("preserves locked tasks without moving them", () => {
    const tasks: Task[] = [
      { id: "prereq", category: "prep", start: "2026-09-01", end: "2026-09-10" },
      { id: "locked-app", category: "prep", start: "2026-09-02", end: "2026-09-06", dependsOn: "prereq", locked: true }
    ];

    const resolved = resolveSchedule(tasks, 2);
    const lockedTask = resolved.find((t) => t.id === "locked-app")!;
    expect(lockedTask.start).toBe("2026-09-02");
    expect(lockedTask.end).toBe("2026-09-06");
  });
});
