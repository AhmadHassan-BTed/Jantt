import { describe, it, expect, vi } from "vitest";
import { validate } from "../src/validator";
import { resolveSchedule, calculateCriticalPath } from "../src/resolver";
import { layout } from "../src/layout";
import { exportToCsv } from "../src/exporter";
import { createTaskSidebar } from "../src/sidebar";
import { createTooltipController } from "../src/renderers/tooltip";
import { renderTimelineGrid } from "../src/renderers/timeline-grid";
import { JanttData, Task } from "../src/types";
import basicJson from "../../../examples/basic.json";
import academicJson from "../../../examples/academic-roadmap.json";
import constructionJson from "../../../examples/construction-enterprise.json";
import brokenMissingIdJson from "../../../examples/broken-missing-id.json";
import brokenBadDateJson from "../../../examples/broken-bad-date.json";
import brokenDanglingDepJson from "../../../examples/broken-dangling-dependency.json";

/**
 * Integration tests that exercise the full Jantt pipeline:
 * validate -> resolve -> layout -> export
 *
 * These tests ensure that the modules compose correctly and that
 * valid data flows through the entire system without errors.
 */
describe("Full Pipeline Integration", () => {
  const validFixtures: Array<{ name: string; data: any }> = [
    { name: "basic.json", data: basicJson },
    { name: "academic-roadmap.json", data: academicJson },
    { name: "construction-enterprise.json", data: constructionJson }
  ];

  const brokenFixtures: Array<{ name: string; data: any; expectedCode: string }> = [
    { name: "broken-missing-id.json", data: brokenMissingIdJson, expectedCode: "MISSING_TASK_ID" },
    { name: "broken-bad-date.json", data: brokenBadDateJson, expectedCode: "INVALID_DATE_RANGE" },
    { name: "broken-dangling-dependency.json", data: brokenDanglingDepJson, expectedCode: "DANGLING_DEPENDENCY" }
  ];

  for (const { name, data } of validFixtures) {
    describe(`${name} — full pipeline`, () => {
      it("validates successfully", () => {
        const result = validate(data);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("resolves schedule without crashing", () => {
        const gap = data.meta?.defaultGapDays ?? 2;
        const resolved = resolveSchedule(data.tasks as Task[], gap);
        expect(resolved.length).toBe(data.tasks.length);
        for (const t of resolved) {
          expect(t.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(t.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      });

      it("calculates critical path", () => {
        const { criticalTaskIds } = calculateCriticalPath(data.tasks as Task[]);
        expect(criticalTaskIds.size).toBeGreaterThan(0);
      });

      it("generates layout with correct task count", () => {
        const result = layout(data as JanttData, { dayWidth: 30, rowHeight: 46 });
        expect(result.tasks.length).toBe(data.tasks.length);
        expect(result.canvasWidth).toBeGreaterThan(0);
        expect(result.canvasHeight).toBeGreaterThan(0);
      });

      it("exports to valid CSV with correct row count", () => {
        const csv = exportToCsv(data as JanttData);
        const lines = csv.split("\r\n").filter((l: string) => l.trim() !== "");
        expect(lines.length).toBe(data.tasks.length + 1); // header + tasks
      });

      it("full chain: validate -> resolve -> layout -> export", () => {
        const validationResult = validate(data);
        expect(validationResult.valid).toBe(true);

        const gap = data.meta?.defaultGapDays ?? 2;
        const resolved = resolveSchedule(data.tasks as Task[], gap);

        const resolvedData: JanttData = { ...data, tasks: resolved };
        const layoutResult = layout(resolvedData, { dayWidth: 30, rowHeight: 46 });
        expect(layoutResult.tasks.length).toBe(data.tasks.length);

        const csv = exportToCsv(resolvedData);
        expect(csv.length).toBeGreaterThan(0);
        expect(csv.split("\r\n").length).toBeGreaterThanOrEqual(data.tasks.length + 1);
      });
    });
  }

  for (const { name, data, expectedCode } of brokenFixtures) {
    it(`${name} — fails validation with ${expectedCode}`, () => {
      const result = validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === expectedCode)).toBe(true);
    });
  }
});

describe("Data Consistency Contracts", () => {
  it("resolver output is always valid per the validator", () => {
    const data: JanttData = {
      categories: {
        dev: { label: "Development", color: "#3B82F6" },
        qa: { label: "QA", color: "#10B981" }
      },
      tasks: [
        { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "b", category: "dev", start: "2026-09-01", end: "2026-09-03", dependsOn: "a", gapDays: 2 },
        { id: "c", category: "qa", start: "2026-09-01", end: "2026-09-04", dependsOn: "b", gapDays: 1 },
        { id: "d", category: "qa", start: "2026-09-01", end: "2026-09-06" }
      ]
    };

    const resolved = resolveSchedule(data.tasks, 2);
    const resolvedData = { ...data, tasks: resolved };
    const result = validate(resolvedData);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("resolver never produces end < start for any task", () => {
    const tasks: Task[] = [];
    for (let i = 0; i < 20; i++) {
      tasks.push({
        id: `task-${i}`,
        category: i % 3 === 0 ? "alpha" : i % 3 === 1 ? "beta" : "gamma",
        start: "2026-09-01",
        end: "2026-09-03",
        dependsOn: i > 0 ? `task-${i - 1}` : undefined,
        gapDays: i % 4
      });
    }

    const resolved = resolveSchedule(tasks, 2);
    for (const t of resolved) {
      const startMs = new Date(t.start).getTime();
      const endMs = new Date(t.end).getTime();
      expect(endMs).toBeGreaterThanOrEqual(startMs);
    }
  });

  it("layout canvas dimensions are non-negative for any valid data", () => {
    const data: JanttData = {
      tasks: [
        { id: "solo", category: "dev", start: "2026-09-01", end: "2026-09-01" }
      ]
    };
    const result = layout(data, { dayWidth: 30, rowHeight: 40 });
    expect(result.canvasWidth).toBeGreaterThanOrEqual(0);
    expect(result.canvasHeight).toBeGreaterThanOrEqual(0);
  });

  it("CSV export column count is consistent across all rows", () => {
    const csv = exportToCsv(constructionJson as JanttData);
    const lines = csv.split("\r\n").filter((l: string) => l.trim() !== "");
    const headerColCount = lines[0].split(",").length;
    // Note: we can't naively split on comma due to escaping,
    // but for our fixtures there are no commas in field values
    for (let i = 1; i < lines.length; i++) {
      const rowColCount = lines[i].split(",").length;
      expect(rowColCount).toBe(headerColCount);
    }
  });

  it("critical path IDs are always valid task IDs from the input", () => {
    const tasks = constructionJson.tasks as Task[];
    const taskIdSet = new Set(tasks.map(t => t.id));
    const { criticalTaskIds, criticalDepKeys } = calculateCriticalPath(tasks);

    for (const id of criticalTaskIds) {
      expect(taskIdSet.has(id)).toBe(true);
    }

    for (const key of criticalDepKeys) {
      const [from, to] = key.split("->");
      expect(taskIdSet.has(from)).toBe(true);
      expect(taskIdSet.has(to)).toBe(true);
    }
  });
});

describe("Stress & Boundary Tests", () => {
  it("handles 100 tasks in a long dependency chain", () => {
    const tasks: Task[] = [];
    for (let i = 0; i < 100; i++) {
      tasks.push({
        id: `chain-${i}`,
        category: "dev",
        start: "2026-09-01",
        end: "2026-09-02",
        dependsOn: i > 0 ? `chain-${i - 1}` : undefined,
        gapDays: 1
      });
    }

    // Should not crash or loop forever
    const resolved = resolveSchedule(tasks, 1);
    expect(resolved).toHaveLength(100);

    // Last task should be significantly shifted from Sept 1
    const last = resolved[resolved.length - 1];
    expect(new Date(last.start).getTime()).toBeGreaterThan(new Date("2026-09-01").getTime());
  });

  it("handles 50 tasks with no dependencies (purely implicit)", () => {
    const tasks: Task[] = [];
    for (let i = 0; i < 50; i++) {
      tasks.push({
        id: `parallel-${i}`,
        category: "dev",
        start: "2026-09-01",
        end: "2026-09-03"
      });
    }
    const resolved = resolveSchedule(tasks, 1);
    expect(resolved).toHaveLength(50);
  });

  it("layout handles many tasks without crashing", () => {
    const tasks: Task[] = [];
    for (let i = 0; i < 50; i++) {
      tasks.push({
        id: `lt-${i}`,
        category: "dev",
        start: `2026-09-${String(Math.min(28, (i % 28) + 1)).padStart(2, "0")}`,
        end: `2026-09-${String(Math.min(28, (i % 28) + 2)).padStart(2, "0")}`,
      });
    }
    const data: JanttData = { tasks };
    const result = layout(data, { dayWidth: 20, rowHeight: 30 });
    expect(result.tasks).toHaveLength(50);
  });

  it("CSV export is deterministic (same input produces same output)", () => {
    const csv1 = exportToCsv(basicJson as JanttData);
    const csv2 = exportToCsv(basicJson as JanttData);
    expect(csv1).toBe(csv2);
  });

  it("creates and mounts rich task details sidebar with interactive fields", () => {
    const task: Task = {
      id: "task-100",
      label: "Architectural Design Phase",
      category: "planning",
      start: "2026-09-01",
      end: "2026-09-15",
      progress: 0.65,
      notes: "Reviewed with stakeholders"
    };

    const categories = {
      planning: { label: "Planning & Architecture", color: "#38BDF8" }
    };

    const onSave = vi.fn();
    const onClose = vi.fn();

    const sidebar = createTaskSidebar({
      task,
      allTasks: [task],
      categories,
      onSave,
      onClose
    });

    expect(sidebar.element).toBeDefined();
    const titleEl = sidebar.element.querySelector(".jantt-sidebar-title");
    expect(titleEl?.textContent).toBe("Architectural Design Phase");

    const labelInput = sidebar.element.querySelector<HTMLInputElement>("#jantt-sidebar-label");
    expect(labelInput?.value).toBe("Architectural Design Phase");

    const saveBtn = sidebar.element.querySelector<HTMLButtonElement>("#jantt-sidebar-save");
    saveBtn?.click();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      id: "task-100",
      label: "Architectural Design Phase"
    }));

    sidebar.close();
  });

  it("creates and renders styled hover card controller", () => {
    const tooltip = createTooltipController();
    const task: Task = {
      id: "task-test",
      label: "Test Task",
      category: "dev",
      start: "2026-09-01",
      end: "2026-09-10",
      progress: 0.5
    };

    tooltip.show(task, { label: "Development", color: "#3B82F6" }, {
      clientX: 100,
      clientY: 100
    } as MouseEvent);

    const card = document.querySelector(".jantt-hover-card");
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("Test Task");
    expect(card?.textContent).toContain("Development");
    expect(card?.textContent).toContain("50%");

    tooltip.hide();
    expect(document.querySelector(".jantt-hover-card")).toBeNull();
  });

  it("renders low-opacity horizontal row boundaries and vertical day column boundaries across the entire timeline", () => {
    const layoutRes = layout(basicJson as JanttData, { dayWidth: 30, rowHeight: 40 });
    const { gridLayer } = renderTimelineGrid({
      header: layoutRes.header,
      taskLayouts: layoutRes.tasks,
      rowHeight: 40,
      showToday: true
    });

    const dayCols = gridLayer.querySelectorAll(".jantt-grid-day-col");
    expect(dayCols.length).toBe(layoutRes.header.days.length);

    const rowLines = gridLayer.querySelectorAll(".jantt-grid-row");
    expect(rowLines.length).toBe(layoutRes.tasks.length);
  });
});
