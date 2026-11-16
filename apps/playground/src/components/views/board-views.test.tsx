// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { JanttData, Task } from "@jantt/core";
import { KanbanView } from "./KanbanView";
import { TasksView } from "./TasksView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const plan = (): JanttData => ({
  meta: { title: "Plan" },
  tasks: [
    { id: "A", label: "Alpha", category: "x", start: "2026-01-01", end: "2026-01-05", status: "not-started" },
    { id: "B", label: "Beta", category: "x", start: "2026-01-06", end: "2026-01-09", status: "blocked", dependsOn: ["A:SS+2d", "C"] },
    { id: "C", label: "Gamma", category: "x", start: "2026-01-06", end: "2026-01-09", status: "done" }
  ]
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const kanban = (props: Partial<React.ComponentProps<typeof KanbanView>> = {}) => (
  <KanbanView
    parsedData={plan()}
    kanbanSortRules={[{ field: "start", direction: "asc" }]}
    setKanbanSortRules={vi.fn()}
    kanbanMultiSort={(tasks: Task[]) => tasks}
    dateFilterMode="all"
    dateFilterBehavior="dim"
    isTaskMatchingDateFilter={() => true}
    effectivePeople={[]}
    teams={[]}
    openTaskDetailSidebar={vi.fn()}
    handleChartCommit={vi.fn()}
    {...props}
  />
);

const columnTitles = (colId: string) =>
  Array.from(container.querySelectorAll(`#kanban-col-${colId} .kanban-card-title`)).map((el) => el.textContent);

describe("KanbanView", () => {
  it("shows blocked and done tasks in their own columns", () => {
    act(() => root.render(kanban()));
    expect(columnTitles("not-started")).toEqual(["Alpha"]);
    expect(columnTitles("blocked")).toEqual(["Beta"]);
    expect(columnTitles("completed")).toEqual(["Gamma"]);
  });

  it("moves a card by drag and drop", () => {
    const commit = vi.fn();
    act(() => root.render(kanban({ handleChartCommit: commit })));
    const card = container.querySelector<HTMLElement>("#kanban-col-not-started .kanban-card")!;
    const target = container.querySelector<HTMLElement>("#kanban-col-in-progress")!;
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: "", dropEffect: "" };
    const fire = (el: HTMLElement, type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      el.dispatchEvent(event);
    };
    act(() => fire(card, "dragstart"));
    act(() => fire(target, "dragover"));
    act(() => fire(target, "drop"));
    expect(commit).toHaveBeenCalledTimes(1);
    const moved = (commit.mock.calls[0][0] as JanttData).tasks.find((t) => t.id === "A")!;
    expect(moved.status).toBe("in-progress");
  });

  it("is read-only for viewers", () => {
    const commit = vi.fn();
    act(() => root.render(kanban({ handleChartCommit: commit, isViewer: true })));
    const card = container.querySelector<HTMLElement>(".kanban-card")!;
    expect(card.getAttribute("draggable")).toBe("false");
    container.querySelectorAll("select.kanban-status-select").forEach((s) => expect((s as HTMLSelectElement).disabled).toBe(true));
    expect(commit).not.toHaveBeenCalled();
  });
});

const tasksView = (props: Partial<React.ComponentProps<typeof TasksView>> = {}) => (
  <TasksView
    parsedData={plan()}
    dateFilterMode="all"
    dateFilterBehavior="dim"
    isTaskMatchingDateFilter={() => true}
    tasksSearchQuery=""
    setTasksSearchQuery={vi.fn()}
    tasksViewMode="todo"
    setTasksViewMode={vi.fn()}
    selectedPersonFilter="all"
    setSelectedPersonFilter={vi.fn()}
    teams={[]}
    effectivePeople={[]}
    handleAddNewTask={vi.fn()}
    setDateFilterMode={vi.fn()}
    openTaskDetailSidebar={vi.fn()}
    handleChartCommit={vi.fn()}
    {...props}
  />
);

describe("TasksView", () => {
  it("offers the blocked status instead of showing blocked tasks as To Do", () => {
    act(() => root.render(tasksView()));
    const selects = Array.from(container.querySelectorAll<HTMLSelectElement>("select.kanban-status-select"));
    expect(selects.map((s) => s.value)).toEqual(["not-started", "blocked", "completed"]);
  });

  it("soft-deletes after confirmation and only prunes links to the deleted task", () => {
    const commit = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const data = plan();
    act(() => root.render(tasksView({ parsedData: data, handleChartCommit: commit })));
    const deleteGamma = container.querySelector<HTMLButtonElement>('button[aria-label="Delete task Gamma"]')!;
    act(() => deleteGamma.click());
    const committed = commit.mock.calls[0][0] as JanttData;
    const byId = new Map(committed.tasks.map((t) => [t.id, t]));
    expect(byId.get("C")?._deleted).toBe(true);
    expect(byId.get("B")?.dependsOn).toBe("A:SS+2d");
    // Untouched tasks keep their identity: no re-scheduling, no sync timestamp churn.
    expect(byId.get("A")).toBe(data.tasks[0]);
    expect(committed.meta?.tombstones?.C?.entityType).toBe("task");
    confirmSpy.mockRestore();
  });

  it("does nothing when the delete is not confirmed", () => {
    const commit = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    act(() => root.render(tasksView({ handleChartCommit: commit })));
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Delete task Alpha"]')!.click());
    expect(commit).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("hides mutating controls for viewers", () => {
    act(() => root.render(tasksView({ isViewer: true })));
    expect(container.querySelector('button[aria-label^="Delete task"]')).toBeNull();
    container.querySelectorAll("select.kanban-status-select").forEach((s) => expect((s as HTMLSelectElement).disabled).toBe(true));
    container.querySelectorAll<HTMLButtonElement>(".tasks-checkbox-btn").forEach((b) => expect(b.disabled).toBe(true));
  });
});
