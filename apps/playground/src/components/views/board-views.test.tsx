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

  it("finds tasks in other phone columns and opens the matching column", () => {
    act(() => root.render(kanban({ isMobile: true })));
    act(() => root.render(kanban({ isMobile: true, searchQuery: "Beta" })));
    expect(container.querySelectorAll(".kanban-card")).toHaveLength(1);
    expect(container.querySelector("#kanban-col-blocked .kanban-mobile-title")?.textContent).toBe("Beta");
  });

  it("starts quick capture in the chosen column", () => {
    const onQuickTask = vi.fn();
    act(() => root.render(kanban({ onQuickTask })));
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Quick task in Blocked"]')!.click());
    expect(onQuickTask).toHaveBeenCalledWith("blocked");
  });

  it("previews the same sorted drop position that gets committed", () => {
    const data = plan();
    const commit = vi.fn();
    const sort = (items: Task[]) => [...items].sort((a, b) => b.end.localeCompare(a.end));
    act(() => root.render(kanban({ parsedData: data, kanbanMultiSort: sort, handleChartCommit: commit })));
    const target = container.querySelector<HTMLElement>("#kanban-col-blocked")!;
    const card = container.querySelector<HTMLElement>("#kanban-col-not-started .kanban-card")!;
    const drag = (node: HTMLElement, type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: { setData: vi.fn() } });
      act(() => { node.dispatchEvent(event); });
    };
    drag(card, "dragstart");
    drag(target, "dragover");
    const pending = Array.from(target.querySelectorAll(".kanban-card, .board-drop-slot"))
      .findIndex(el => el.classList.contains("board-drop-slot"));
    expect(pending).toBe(1);
    drag(target, "drop");
    act(() => root.render(kanban({ parsedData: commit.mock.calls[0][0], kanbanMultiSort: sort })));
    expect(columnTitles("blocked")[pending]).toBe("Alpha");
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

  it("changes several selected tasks in one guarded commit", () => {
    const commit = vi.fn();
    const data = plan();
    act(() => root.render(tasksView({ parsedData: data, handleChartCommit: commit })));
    const button = (text: string) => Array.from(container.querySelectorAll("button")).find(el => el.textContent === text)!;
    act(() => button("Select tasks").click());
    act(() => container.querySelector<HTMLInputElement>('input[aria-label="Select Alpha"]')!.click());
    act(() => container.querySelector<HTMLInputElement>('input[aria-label="Select Beta"]')!.click());
    const change = (select: HTMLSelectElement, value: string) => act(() => {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    change(container.querySelector<HTMLSelectElement>('[aria-label="Bulk action"]')!, "status");
    change(container.querySelector<HTMLSelectElement>('[role="dialog"] select')!, "completed");
    act(() => button("Apply changes").click());
    expect(commit).toHaveBeenCalledTimes(1);
    const result: JanttData = commit.mock.calls[0][0];
    expect(result.tasks.slice(0, 2).map(task => [task.status, task.progress])).toEqual([["completed", 1], ["completed", 1]]);
    expect(result.tasks[2]).toBe(data.tasks[2]);
  });

  it("selects all filtered phone tasks including rows beyond the first page", () => {
    const data = plan();
    data.tasks = Array.from({ length: 100 }, (_, index) => ({ ...data.tasks[0], id: String(index) }));
    const commit = vi.fn();
    act(() => root.render(tasksView({ parsedData: data, handleChartCommit: commit, isMobile: true })));
    expect(container.querySelectorAll(".phone-task-line")).toHaveLength(48);
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Select tasks"]')!.click());
    act(() => Array.from(container.querySelectorAll("button")).find(el => el.textContent === "Select all")!.click());
    expect(container.querySelector(".checklist-selection-bar span")?.textContent).toBe("100 selected");
    act(() => container.querySelector<HTMLButtonElement>(".load-task-page")!.click());
    expect(container.querySelectorAll(".phone-task-line")).toHaveLength(96);
  });

  it("hides mutating controls for viewers", () => {
    act(() => root.render(tasksView({ isViewer: true })));
    expect(container.querySelector('button[aria-label^="Delete task"]')).toBeNull();
    container.querySelectorAll("select.kanban-status-select").forEach((s) => expect((s as HTMLSelectElement).disabled).toBe(true));
    container.querySelectorAll<HTMLButtonElement>(".tasks-checkbox-btn").forEach((b) => expect(b.disabled).toBe(true));
  });
});
