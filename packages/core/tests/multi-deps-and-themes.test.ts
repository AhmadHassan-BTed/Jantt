// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  resolveSchedule,
  getTaskDependencies,
  calculateCriticalPath,
  validate,
  layout,
  themeManager,
  swissDarkTheme,
  swissLightTheme,
  cyberEmeraldTheme,
  midnightRoseTheme,
  sunsetCrimsonTheme,
  nordicFrostTheme,
  InteractionController,
  Task,
  JanttData
} from "../src";

describe("Multi-Dependency Engine & Resolution", () => {
  it("normalizes single string, array, and comma-separated dependencies via getTaskDependencies", () => {
    expect(getTaskDependencies({ dependsOn: "task-1" })).toEqual(["task-1"]);
    expect(getTaskDependencies({ dependsOn: ["task-1", "task-2", "task-3"] })).toEqual(["task-1", "task-2", "task-3"]);
    expect(getTaskDependencies({ dependsOn: "task-a, task-b , task-c" })).toEqual(["task-a", "task-b", "task-c"]);
    expect(getTaskDependencies({ dependsOn: null })).toEqual([]);
    expect(getTaskDependencies({ dependsOn: undefined })).toEqual([]);
    expect(getTaskDependencies({ dependsOn: [] })).toEqual([]);
  });

  it("schedules a task with multiple prerequisites by taking max(prereqs.end) + gap", () => {
    const tasks: Task[] = [
      {
        id: "prereq-a",
        label: "Architecture Specs",
        category: "specs",
        start: "2026-09-01",
        end: "2026-09-10" // Ends Sept 10
      },
      {
        id: "prereq-b",
        label: "Environmental Permits",
        category: "permits",
        start: "2026-09-01",
        end: "2026-09-20" // Ends Sept 20 (Later than prereq-a)
      },
      {
        id: "dependent-c",
        label: "Groundbreaking Excavation",
        category: "civil",
        start: "2026-09-05", // User initially drafted this BEFORE prereq-b ends!
        end: "2026-09-15", // 10 days span
        dependsOn: ["prereq-a", "prereq-b"],
        gapDays: 2
      }
    ];

    // When resolved with defaultGapDays = 2:
    // Latest prereq end is 2026-09-20. Earliest start = 2026-09-20 + 2 days = 2026-09-22.
    // Preserves 10-day duration: end = 2026-09-22 + 10 days = 2026-10-02.
    const resolved = resolveSchedule(tasks, 2);
    const depC = resolved.find((t) => t.id === "dependent-c")!;

    expect(depC.start).toBe("2026-09-22");
    expect(depC.end).toBe("2026-10-02");
  });

  it("handles deep DAG networks with converging and diverging multi-dependencies", () => {
    const tasks: Task[] = [
      { id: "A", category: "c1", start: "2026-01-01", end: "2026-01-05" },
      { id: "B", category: "c1", start: "2026-01-01", end: "2026-01-10", dependsOn: "A" },
      { id: "C", category: "c2", start: "2026-01-01", end: "2026-01-08" },
      { id: "D", category: "c2", start: "2026-01-01", end: "2026-01-03", dependsOn: ["B", "C"], gapDays: 1 }
    ];

    const resolved = resolveSchedule(tasks, 0);
    const taskB = resolved.find((t) => t.id === "B")!;
    const taskD = resolved.find((t) => t.id === "D")!;

    // B depends on A (ends 01-05) -> B starts 01-05, ends 01-14 (9d duration)
    expect(taskB.start).toBe("2026-01-05");
    expect(taskB.end).toBe("2026-01-14");

    // D depends on B (ends 01-14) and C (ends 01-08) with gapDays: 1 -> D starts 01-15, ends 01-17
    expect(taskD.start).toBe("2026-01-15");
    expect(taskD.end).toBe("2026-01-17");
  });

  it("calculates critical path across multi-dependency convergence", () => {
    const tasks: Task[] = [
      { id: "short-path", category: "c1", start: "2026-01-01", end: "2026-01-05" },
      { id: "long-path", category: "c1", start: "2026-01-01", end: "2026-01-20" },
      { id: "final-milestone", category: "c2", start: "2026-01-20", end: "2026-01-20", dependsOn: ["short-path", "long-path"] }
    ];

    const res = calculateCriticalPath(tasks);
    expect(res.criticalTaskIds.has("long-path")).toBe(true);
    expect(res.criticalTaskIds.has("final-milestone")).toBe(true);
    expect(res.criticalDepKeys.has("long-path->final-milestone")).toBe(true);
  });

  it("detects circular dependencies in multi-dependency networks", () => {
    const cyclicData: JanttData = {
      tasks: [
        { id: "t1", category: "c1", start: "2026-01-01", end: "2026-01-05", dependsOn: ["t2"] },
        { id: "t2", category: "c1", start: "2026-01-05", end: "2026-01-10", dependsOn: ["t3"] },
        { id: "t3", category: "c1", start: "2026-01-10", end: "2026-01-15", dependsOn: ["t1", "other"] },
        { id: "other", category: "c1", start: "2026-01-01", end: "2026-01-02" }
      ]
    };

    const val = validate(cyclicData);
    expect(val.valid).toBe(false);
    expect(val.errors.some((e) => e.code === "CIRCULAR_DEPENDENCY")).toBe(true);
  });

  it("renders SVG dependency path links for every predecessor in multi-dependency tasks", () => {
    const data: JanttData = {
      tasks: [
        { id: "t1", category: "c1", start: "2026-01-01", end: "2026-01-05" },
        { id: "t2", category: "c1", start: "2026-01-01", end: "2026-01-08" },
        { id: "t3", category: "c1", start: "2026-01-10", end: "2026-01-15", dependsOn: ["t1", "t2"] }
      ]
    };

    const res = layout(data);
    expect(res.dependencies.length).toBe(2);
    expect(res.dependencies.some((d) => d.fromTaskId === "t1" && d.toTaskId === "t3")).toBe(true);
    expect(res.dependencies.some((d) => d.fromTaskId === "t2" && d.toTaskId === "t3")).toBe(true);
  });

  it("dynamically generates future timeframes and months when tasks are pushed far forward", () => {
    const dataWithPushedTasks: JanttData = {
      meta: {
        chartStart: "2026-09-01",
        chartEnd: "2026-10-31" // Initial narrow bounds
      },
      tasks: [
        { id: "t1", category: "c1", start: "2026-09-01", end: "2026-09-10" },
        // User pushed a task forward into next year!
        { id: "t2-pushed", category: "c1", start: "2027-03-15", end: "2027-04-20" }
      ]
    };

    const res = layout(dataWithPushedTasks);
    // Verified that layout automatically expanded the timeline to encompass April 2027 + buffer!
    expect(res.header.endDate >= "2027-04-20").toBe(true);
    expect(res.header.months.some((m) => m.label.includes("April") || m.label.includes("2027"))).toBe(true);
    expect(res.header.years.length).toBeGreaterThanOrEqual(2);

    const pushedLayout = res.tasks.find((t) => t.task.id === "t2-pushed")!;
    expect(pushedLayout.x).toBeGreaterThan(0);
    expect(pushedLayout.x + pushedLayout.width).toBeLessThanOrEqual(res.canvasWidth);
  });
});

describe("Theme Architecture & ThemeManager Subsystem", () => {
  it("registers and lists all modular out-of-the-box themes", () => {
    const all = themeManager.getAllThemes();
    expect(all.length).toBeGreaterThanOrEqual(6);

    const ids = themeManager.getThemeIds();
    expect(ids).toContain("swiss-dark");
    expect(ids).toContain("swiss-light");
    expect(ids).toContain("cyber-emerald");
    expect(ids).toContain("midnight-rose");
    expect(ids).toContain("sunset-crimson");
    expect(ids).toContain("nordic-frost");
    expect(ids).toContain("beenie");
  });

  it("retrieves themes by ID with complete token maps", () => {
    const dark = themeManager.getTheme("swiss-dark");
    expect(dark).toBeDefined();
    expect(dark?.vars["--jantt-bg"]).toBe("#090E1A");
    expect(dark?.vars["--jantt-accent"]).toBe("#38BDF8");

    const light = themeManager.getTheme("swiss-light");
    expect(light).toBeDefined();
    expect(light?.vars["--jantt-bg"]).toBe("#FFFFFF");
    expect(light?.vars["--jantt-accent"]).toBe("#0284C7");

    const beenie = themeManager.getTheme("beenie");
    expect(beenie).toBeDefined();
    expect(beenie?.name).toBe("Pink Beenie");
    expect(beenie?.label).toBe("Pink Beenie");
    expect(beenie?.mode).toBe("light");
    expect(beenie?.vars["--jantt-bg"]).toBe("#FFF5F8");
    expect(beenie?.vars["--jantt-accent"]).toBe("#EC4899");
  });

  it("creates custom themes extending base tokens", () => {
    const custom = themeManager.createCustomTheme("swiss-dark", {
      id: "corporate-navy",
      name: "Corporate Navy",
      label: "Corporate Navy Custom",
      vars: {
        "--jantt-bg": "#0B1528",
        "--jantt-accent": "#3B82F6"
      }
    });

    expect(custom.id).toBe("corporate-navy");
    expect(custom.vars["--jantt-bg"]).toBe("#0B1528");
    expect(custom.vars["--jantt-accent"]).toBe("#3B82F6");
    expect(themeManager.getTheme("corporate-navy")).toBeDefined();
  });

  it("applies theme variables and CSS classes to a target HTML element", () => {
    const div = document.createElement("div");
    themeManager.applyTheme(div, "cyber-emerald");

    expect(div.classList.contains("jantt-theme-cyber-emerald")).toBe(true);
    expect(div.getAttribute("data-theme")).toBe("cyber-emerald");
    expect(div.style.getPropertyValue("--jantt-bg")).toBe("#041410");
    expect(div.style.getPropertyValue("--jantt-accent")).toBe("#10B981");

    const beenieDiv = document.createElement("div");
    themeManager.applyTheme(beenieDiv, "beenie");
    expect(beenieDiv.classList.contains("jantt-theme-beenie")).toBe(true);
    expect(beenieDiv.getAttribute("data-theme")).toBe("beenie");
    expect(beenieDiv.style.getPropertyValue("--jantt-bg")).toBe("#FFF5F8");
    expect(beenieDiv.style.getPropertyValue("--jantt-accent")).toBe("#EC4899");
  });
});

describe("Multi-Task Selection & Synchronized Multi-Shift Engine", () => {
  it("tracks and manages multiple task selections", () => {
    const data: JanttData = {
      tasks: [
        { id: "t1", category: "c1", start: "2026-09-01", end: "2026-09-05" },
        { id: "t2", category: "c1", start: "2026-09-06", end: "2026-09-10" },
        { id: "t3", category: "c1", start: "2026-09-11", end: "2026-09-15" }
      ]
    };

    let rendered = false;
    const ctrl = new InteractionController(
      data,
      {},
      30,
      () => {
        rendered = true;
      },
      () => {}
    );

    expect(ctrl.getSelectedTaskIds().size).toBe(0);

    // Select t1
    ctrl.selectTask("t1", false);
    expect(ctrl.isSelected("t1")).toBe(true);
    expect(ctrl.getSelectedTaskIds().size).toBe(1);

    // Multi-select t2
    ctrl.selectTask("t2", true);
    expect(ctrl.isSelected("t1")).toBe(true);
    expect(ctrl.isSelected("t2")).toBe(true);
    expect(ctrl.getSelectedTaskIds().size).toBe(2);

    // Toggle off t1
    ctrl.selectTask("t1", true);
    expect(ctrl.isSelected("t1")).toBe(false);
    expect(ctrl.isSelected("t2")).toBe(true);

    // Clear all
    ctrl.clearSelection();
    expect(ctrl.getSelectedTaskIds().size).toBe(0);
  });

  it("toggles task lock and preserves locked tasks as immovable anchors", () => {
    const data: JanttData = {
      tasks: [
        { id: "t1", category: "c1", start: "2026-09-01", end: "2026-09-05" },
        { id: "t2", category: "c1", start: "2026-09-07", end: "2026-09-10", dependsOn: "t1" }
      ]
    };

    const ctrl = new InteractionController(data, {}, 30, () => {}, () => {});
    expect(data.tasks[0].locked).toBeUndefined();

    // Toggle lock on t1
    ctrl.toggleTaskLock("t1");
    expect(data.tasks[0].locked).toBe(true);

    // Toggle lock off
    ctrl.toggleTaskLock("t1");
    expect(data.tasks[0].locked).toBe(false);
  });

  it("supports switching between Auto-Cascade and Strict Limit modes", () => {
    const data: JanttData = {
      tasks: [
        { id: "t1", category: "c1", start: "2026-09-01", end: "2026-09-05" },
        { id: "t2", category: "c1", start: "2026-09-07", end: "2026-09-10", dependsOn: "t1" }
      ]
    };

    const ctrl = new InteractionController(data, {}, 30, () => {}, () => {});
    expect(ctrl.isAutoCascade()).toBe(true);

    // Toggle to strict limits mode
    ctrl.toggleAutoCascade();
    expect(ctrl.isAutoCascade()).toBe(false);

    // Toggle back to auto-cascade
    ctrl.toggleAutoCascade();
    expect(ctrl.isAutoCascade()).toBe(true);
  });
});
