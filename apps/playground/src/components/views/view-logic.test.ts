import { describe, it, expect } from "vitest";
import type { Task } from "@jantt/core";
import { applyTaskStatus, getKanbanColumn, getStatusValue } from "./KanbanView";
import { removeDependencyOn } from "./TasksView";
import { formatFloatLabel } from "./BudgetKpiView";
import { computePlannedValueSeries } from "./EvmSCurveChart";
import { formatMoney, getPlanCurrency } from "./EvmKpiCards";

const task = (overrides: Partial<Task>): Task => ({
  id: "T",
  category: "x",
  start: "2026-01-01",
  end: "2026-01-11",
  ...overrides
});

describe("Kanban / Tasks status helpers", () => {
  it("places every status in a column, including blocked, done and unknown values", () => {
    expect(getKanbanColumn(task({ status: "blocked" }))).toBe("blocked");
    expect(getKanbanColumn(task({ status: "done" }))).toBe("completed");
    expect(getKanbanColumn(task({ status: "in-progress", progress: 1 }))).toBe("completed");
    expect(getKanbanColumn(task({ status: "on-hold" }))).toBe("not-started");
    expect(getKanbanColumn(task({}))).toBe("not-started");
  });

  it("normalises select values but keeps unknown statuses visible", () => {
    expect(getStatusValue(task({ status: "done" }))).toBe("completed");
    expect(getStatusValue(task({ status: "on-hold" }))).toBe("on-hold");
    expect(getStatusValue(task({ status: "" }))).toBe("not-started");
  });

  it("re-opening a completed task really re-opens it", () => {
    const done = task({ id: "A", status: "completed", progress: 1 });
    for (const status of ["in-progress", "submitted", "blocked"]) {
      const [moved] = applyTaskStatus([done], "A", status);
      expect(moved.status).toBe(status);
      expect(moved.progress).toBeLessThan(1);
      expect(getKanbanColumn(moved)).toBe(status);
    }
    const [completed] = applyTaskStatus([task({ id: "A", progress: 0.2 })], "A", "completed");
    expect(completed.progress).toBe(1);
  });

  it("leaves other tasks untouched (same references)", () => {
    const other = task({ id: "B" });
    const [, sameOther] = applyTaskStatus([task({ id: "A" }), other], "A", "completed");
    expect(sameOther).toBe(other);
  });
});

describe("removeDependencyOn", () => {
  it("removes only links to the deleted task and preserves types and lags", () => {
    expect(removeDependencyOn(["X:SS+2d", { id: "Y", type: "FF", lag: 1 }, "Z"], "Z")).toEqual([
      "X:SS+2d",
      { id: "Y", type: "FF", lag: 1 }
    ]);
    expect(removeDependencyOn("X:SS+2d, Z", "Z")).toBe("X:SS+2d");
    expect(removeDependencyOn({ id: "Z", type: "SS" }, "Z")).toBeNull();
  });

  it("returns the same value when nothing references the deleted task", () => {
    const deps = ["X:SS+2d"];
    expect(removeDependencyOn(deps, "Z")).toBe(deps);
    expect(removeDependencyOn(undefined, "Z")).toBeUndefined();
    expect(removeDependencyOn(null, "Z")).toBeNull();
  });
});

describe("formatFloatLabel", () => {
  it("is driven by the float value, not the critical flag", () => {
    expect(formatFloatLabel(-5)).toBe("5d past target");
    expect(formatFloatLabel(0)).toBe("0d (Bottleneck)");
    expect(formatFloatLabel(4)).toBe("4d buffer");
  });
});

describe("computePlannedValueSeries", () => {
  it("ends exactly on the last finish with PV equal to the total budget", () => {
    const series = computePlannedValueSeries([
      task({ id: "A", start: "2026-01-01", end: "2026-01-11", estimatedCost: 1000 }),
      task({ id: "B", start: "2026-01-05", end: "2026-02-17", estimatedCost: 500 })
    ])!;
    const last = series.points[series.points.length - 1];
    expect(last.date).toBe("2026-02-17");
    expect(last.dayIndex).toBe(series.totalDays);
    expect(last.pv).toBe(1500);
    expect(series.bac).toBe(1500);
    expect(series.points[0].pv).toBe(0);
    for (let i = 1; i < series.points.length; i++) {
      expect(series.points[i].pv).toBeGreaterThanOrEqual(series.points[i - 1].pv);
      expect(series.points[i].dayIndex).toBeGreaterThan(series.points[i - 1].dayIndex);
    }
  });

  it("never invents a budget and tolerates malformed costs", () => {
    const series = computePlannedValueSeries([
      task({ id: "A" }),
      task({ id: "B", estimatedCost: "5,000" as unknown as number }),
      task({ id: "C", estimatedCost: Number.NaN })
    ])!;
    expect(series.bac).toBe(0);
    expect(series.points.every((p) => p.pv === 0)).toBe(true);
  });

  it("ignores deleted tasks and tasks without valid dates", () => {
    expect(computePlannedValueSeries([task({ _deleted: true }), task({ start: "nope" })])).toBeNull();
  });
});

describe("money formatting", () => {
  it("renders negatives and non-finite values sensibly", () => {
    // The sign leads (locale-dependent grouping), never "$-1,234".
    expect(formatMoney(-1234, "USD")).toMatch(/^[-−]/);
    expect(formatMoney(Number.NaN)).toBe("—");
    expect(formatMoney(50, "USD", true)).toContain("+");
  });

  it("reads a valid ISO currency from the plan and falls back to USD", () => {
    expect(getPlanCurrency({ meta: { title: "x", currency: "eur" } })).toBe("EUR");
    expect(getPlanCurrency({ meta: { title: "x", currency: "euros" } })).toBe("USD");
    expect(getPlanCurrency(null)).toBe("USD");
    expect(formatMoney(10, "EUR")).toMatch(/€/);
  });
});
