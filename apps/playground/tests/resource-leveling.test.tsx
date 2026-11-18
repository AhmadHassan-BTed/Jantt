// @vitest-environment jsdom
import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { levelResources, type JanttData } from "@jantt/core";
import { ResourceLevelingPanel } from "../src/components/views/ResourceLevelingPanel";

describe("resource leveling preview", () => {
  let container: HTMLDivElement;
  let root: Root;
  const data: JanttData = { tasks: [
    { id: "a", start: "2026-11-02", end: "2026-11-03", assignee: "alice" },
    { id: "b", start: "2026-11-02", end: "2026-11-03", assignee: "alice" }
  ] };
  const click = (label: string) => {
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent === label);
    expect(button).toBeDefined();
    act(() => button!.click());
  };

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("previews changes before applying them", () => {
    const commit = vi.fn();
    act(() => root.render(<ResourceLevelingPanel data={data} onCommit={commit} readOnly={false} />));
    expect(container.textContent).toContain("1 resource-day overload");
    click("Preview leveling");
    expect(commit).not.toHaveBeenCalled();
    expect(container.textContent).toContain("0 resource-day overloads remain");
    expect(container.textContent).toContain("No overloads remain");
    expect(container.textContent).toContain("Resource: alice.");
    expect(container.textContent).toMatch(/(?:Within|Outside) float at the time of adjustment/);
    click("Apply preview");
    expect(commit).toHaveBeenCalledOnce();
    expect(commit.mock.calls[0][0].tasks.find((task: any) => task.id === "b").start).toBe("2026-11-05");
  });
  it("shows an invalid calendar error without crashing the panel", () => {
    const invalid: JanttData = { tasks: [{ id: "a", assignee: "alice", start: "2026-11-02", end: "2026-11-03", calendarId: "missing" }] };
    act(() => root.render(<ResourceLevelingPanel data={invalid} onCommit={vi.fn()} readOnly={false} />));
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/calendarId.*missing/i);
    expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Preview leveling")?.disabled).toBe(true);
  });

  it("uses configured resource capacity in the preview", () => {
    const configured: JanttData = { ...data, meta: { defaultResourceCapacity: 1.5, resourceCapacities: { alice: 2 } } };
    act(() => root.render(<ResourceLevelingPanel data={configured} onCommit={vi.fn()} readOnly={false} />));
    expect(container.textContent).toContain("0 resource-day overloads");
    expect(container.textContent).toContain("Default resource capacity: 150%");
    click("Preview leveling");
    expect(container.textContent).toContain("0 resource adjustment");
  });

  it("shows fractional capacities as clean percentages", () => {
    const configured: JanttData = { ...data, meta: { defaultResourceCapacity: 0.07, resourceCapacities: { alice: 0.29 } } };
    act(() => root.render(<ResourceLevelingPanel data={configured} onCommit={vi.fn()} readOnly={false} />));
    expect(container.textContent).toContain("Default resource capacity: 7%");
    const input = container.querySelector<HTMLInputElement>('[aria-label="alice capacity (%)"]');
    expect(input?.value).toBe("29");
  });

  it("saves resource capacity settings in project metadata", () => {
    const commit = vi.fn();
    act(() => root.render(<ResourceLevelingPanel data={data} onCommit={commit} readOnly={false} />));
    const input = container.querySelector<HTMLInputElement>('input[aria-label="alice capacity (%)"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => { setter.call(input, "50"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    click("Save capacities");
    expect(commit.mock.calls[0][0].meta.resourceCapacities).toEqual({ alice: 0.5 });
  });

  it("does not commit a preview for a read-only viewer", () => {
    const commit = vi.fn();
    const fork = vi.fn();
    act(() => root.render(<ResourceLevelingPanel data={data} onCommit={commit} readOnly onPromptFork={fork} />));
    click("Preview leveling");
    click("Apply preview");
    expect(commit).not.toHaveBeenCalled();
    expect(fork).toHaveBeenCalledOnce();
  });

  it("shows downstream changes in the preview", () => {
    const withSuccessor: JanttData = { tasks: [{ ...data.tasks[0], priority: "high" }, data.tasks[1], { id: "c", start: "2026-11-05", end: "2026-11-06", dependsOn: "b" }] };
    act(() => root.render(<ResourceLevelingPanel data={withSuccessor} onCommit={vi.fn()} readOnly={false} />));
    click("Preview leveling");
    expect(container.textContent).toContain("c: 2026-11-05–2026-11-06 → 2026-11-08–2026-11-09");
    expect(container.textContent).toContain("Dependency cascade after deferring");
  });

  it("shows completion dates and target impact", () => {
    const targeted: JanttData = { ...data, meta: { targetDate: "2026-11-04" } };
    act(() => root.render(<ResourceLevelingPanel data={targeted} onCommit={vi.fn()} readOnly={false} />));
    click("Preview leveling");
    expect(container.textContent).toContain("Project finish: 2026-11-03 → 2026-11-06");
    expect(container.textContent).toContain("Preview exceeds the target date");
  });

  it("does not report success or apply an invalid baseline", () => {
    const invalid: JanttData = { tasks: [
      { id: "a", start: "2026-11-02", end: "2026-11-04" },
      { id: "b", start: "2026-11-02", end: "2026-11-03", dependsOn: "a", locked: true },
      { id: "x", start: "2026-11-02", end: "2026-11-03" },
      { id: "y", start: "2026-11-02", end: "2026-11-03", dependsOn: "x" }
    ], meta: { targetDate: "2026-12-01" } };
    const commit = vi.fn();
    act(() => root.render(<ResourceLevelingPanel data={invalid} onCommit={commit} readOnly={false} />));
    click("Preview leveling");
    expect(container.textContent).toContain("Locked task");
    expect(container.textContent).not.toContain("Preview meets the target date");
    expect(container.textContent).not.toContain("Project finish extends");
    expect(container.textContent).not.toContain("Review remaining conflicts before applying");
    expect(container.textContent).not.toContain("Apply preview");
    expect(commit).not.toHaveBeenCalled();
  });

  it("shows a clear failure when a cycle produces no date changes", () => {
    const invalid: JanttData = { tasks: [
      { id: "a", start: "2026-11-02", end: "2026-11-02", dependsOn: "b" },
      { id: "b", start: "2026-11-02", end: "2026-11-02", dependsOn: "a" }
    ] };
    act(() => root.render(<ResourceLevelingPanel data={invalid} onCommit={vi.fn()} readOnly={false} />));
    click("Preview leveling");
    expect(container.textContent).toContain("Circular dependencies prevent a safe preview.");
    expect(container.textContent).not.toContain("dates below");
    expect(container.textContent).not.toContain("Review remaining conflicts before applying");
    expect(container.textContent).not.toContain("Apply preview");
  });

  it("identifies a task whose own allocation exceeds capacity", () => {
    const oversized: JanttData = { tasks: [{ id: "a", start: "2026-11-02", end: "2026-11-02", assignee: "alice", allocation: 1.5 }] };
    act(() => root.render(<ResourceLevelingPanel data={oversized} onCommit={vi.fn()} readOnly={false} />));
    click("Preview leveling");
    expect(container.textContent).toContain("A task exceeds capacity on its own");
  });

  it("invalidates a completed preview when the project changes", () => {
    const commit = vi.fn();
    act(() => root.render(<ResourceLevelingPanel data={data} onCommit={commit} readOnly={false} />));
    click("Preview leveling");
    act(() => root.render(<ResourceLevelingPanel data={{ ...data, meta: { targetDate: "2026-12-01" } }} onCommit={commit} readOnly={false} />));
    expect(container.textContent).not.toContain("Apply preview");
    expect(commit).not.toHaveBeenCalled();
  });

  it("hides a stale preview before passive effects run", () => {
    let sawApply = true;
    function Observe() {
      React.useLayoutEffect(() => {
        sawApply = [...container.querySelectorAll("button")].some((button) => button.textContent === "Apply preview");
      });
      return null;
    }
    const render = (value: JanttData) => root.render(<><ResourceLevelingPanel data={value} onCommit={vi.fn()} readOnly={false} /><Observe /></>);
    act(() => render(data));
    click("Preview leveling");
    act(() => render({ ...data }));
    expect(sawApply).toBe(false);
  });

  it("shows locked conflicts alongside changes that can be applied", () => {
    const partial: JanttData = { tasks: [
      { id: "a", start: "2026-11-02", end: "2026-11-03", assignee: "alice", locked: true },
      { id: "b", start: "2026-11-02", end: "2026-11-03", assignee: "alice", locked: true },
      { id: "c", start: "2026-11-02", end: "2026-11-03", assignee: "bob", locked: true },
      { id: "d", start: "2026-11-02", end: "2026-11-03", assignee: "bob" }
    ] };
    const commit = vi.fn();
    act(() => root.render(<ResourceLevelingPanel data={partial} onCommit={commit} readOnly={false} />));
    click("Preview leveling");
    expect(container.textContent).toContain("1 resource-day overload remain");
    expect(container.textContent).toContain("Overloads remain");
    expect(container.textContent).toContain("alice, 2026-11-02: 200% allocated / 100% available (a, b)");
    expect(container.textContent).toContain("Locked tasks: a, b");
    expect(container.textContent).toContain("d: 2026-11-02–2026-11-03 → 2026-11-05–2026-11-06");
    click("Apply preview");
    const applied = commit.mock.calls[0][0].tasks;
    expect(applied.find((task: any) => task.id === "a").start).toBe("2026-11-02");
    expect(applied.find((task: any) => task.id === "b").start).toBe("2026-11-02");
    expect(applied.find((task: any) => task.id === "d").start).toBe("2026-11-05");
  });

  it("uses a worker and discards a result when the project changes", () => {
    class FakeWorker {
      static last: FakeWorker;
      onmessage: ((event: any) => void) | null = null;
      onerror: (() => void) | null = null;
      terminate = vi.fn();
      postMessage = vi.fn();
      constructor() { FakeWorker.last = this; }
    }
    vi.stubGlobal("Worker", FakeWorker);
    act(() => root.render(<ResourceLevelingPanel data={data} onCommit={vi.fn()} readOnly={false} />));
    click("Preview leveling");
    expect(container.textContent).toContain("Calculating…");
    expect(FakeWorker.last.postMessage).toHaveBeenCalledOnce();
    const oldWorker = FakeWorker.last;
    act(() => root.render(<ResourceLevelingPanel data={{ ...data }} onCommit={vi.fn()} readOnly={false} />));
    expect(oldWorker.terminate).toHaveBeenCalledOnce();
    act(() => oldWorker.onmessage?.({ data: { result: levelResources(data.tasks) } }));
    expect(container.textContent).not.toContain("Apply preview");
  });
});
