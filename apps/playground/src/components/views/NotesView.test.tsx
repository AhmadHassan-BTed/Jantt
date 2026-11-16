// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { JanttData } from "@jantt/core";
import { storageService } from "../../services/storage";
import { NotesView } from "./NotesView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STORAGE_KEY = "jantt_active_note_id_default";

const basePlan = (overrides: Partial<JanttData> = {}): JanttData => ({
  meta: { title: "Plan" },
  tasks: [{ id: "T1", label: "Design", category: "x", start: "2026-01-01", end: "2026-01-05", status: "not-started" }],
  notes: [{ id: "n1", title: "Kickoff", content: "Line one\nLine two", color: "#3B82F6", task_ids: [] }],
  ...overrides
});

let container: HTMLDivElement;
let root: Root;

const render = (ui: React.ReactElement) => {
  act(() => {
    root.render(ui);
  });
};

const editorEl = () => container.querySelector<HTMLDivElement>(".note-contenteditable-surface");

const typeInEditor = (text: string) => {
  const el = editorEl()!;
  act(() => {
    el.textContent = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  storageService.setItem(STORAGE_KEY, "n1");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  storageService.removeItem(STORAGE_KEY);
  vi.useRealTimers();
});

describe("NotesView", () => {
  it("shows the restored note body on mount instead of blanking it", () => {
    render(<NotesView parsedData={basePlan()} handleChartCommit={vi.fn()} />);
    expect(editorEl()?.textContent).toBe("Line oneLine two");
    expect(editorEl()?.children).toHaveLength(2);
  });

  it("keeps the note body when the view is re-opened", () => {
    const plan = basePlan();
    render(<NotesView parsedData={plan} handleChartCommit={vi.fn()} />);
    act(() => root.unmount());
    root = createRoot(container);
    render(<NotesView parsedData={plan} handleChartCommit={vi.fn()} />);
    expect(editorEl()?.textContent).toBe("Line oneLine two");
  });

  it("commits only the edited field onto the latest plan, never a stale snapshot", () => {
    const commit = vi.fn();
    render(<NotesView parsedData={basePlan()} handleChartCommit={commit} />);
    typeInEditor("Edited body");

    // A collaborator's task change lands while the save is still debounced.
    const remotePlan = basePlan({
      tasks: [{ id: "T1", label: "Design", category: "x", start: "2026-01-01", end: "2026-01-05", status: "completed" }],
      notes: [{ id: "n1", title: "Renamed by peer", content: "Line one\nLine two", color: "#3B82F6", task_ids: [] }]
    });
    render(<NotesView parsedData={remotePlan} handleChartCommit={commit} />);
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(commit).toHaveBeenCalledTimes(1);
    const committed = commit.mock.calls[0][0] as JanttData;
    expect(committed.tasks[0].status).toBe("completed");
    expect(committed.notes?.[0].content).toBe("Edited body");
    expect(committed.notes?.[0].title).toBe("Renamed by peer");
  });

  it("flushes a pending edit when the view unmounts", () => {
    const commit = vi.fn();
    render(<NotesView parsedData={basePlan()} handleChartCommit={commit} />);
    typeInEditor("Unsaved");
    act(() => root.unmount());
    root = createRoot(container);
    expect(commit).toHaveBeenCalledTimes(1);
    expect((commit.mock.calls[0][0] as JanttData).notes?.[0].content).toBe("Unsaved");
  });

  it("adopts remote edits to the open note when there are no local changes", () => {
    render(<NotesView parsedData={basePlan()} handleChartCommit={vi.fn()} />);
    render(
      <NotesView
        parsedData={basePlan({ notes: [{ id: "n1", title: "Kickoff", content: "From a peer", task_ids: [] }] })}
        handleChartCommit={vi.fn()}
      />
    );
    expect(editorEl()?.textContent).toBe("From a peer");
  });

  it("hides soft-deleted notes", () => {
    render(
      <NotesView
        parsedData={basePlan({ notes: [{ id: "n1", title: "Gone", content: "x", _deleted: true }] })}
        handleChartCommit={vi.fn()}
      />
    );
    expect(container.querySelector(".note-list-item")).toBeNull();
    expect(editorEl()).toBeNull();
  });

  it("is read-only for room viewers", () => {
    const commit = vi.fn();
    render(<NotesView parsedData={basePlan()} handleChartCommit={commit} isViewer />);
    expect(editorEl()?.getAttribute("contenteditable")).toBe("false");
    expect(container.querySelector(".note-item-del-btn")).toBeNull();
    expect(container.querySelector(".notes-new-btn")).toBeNull();
    expect(commit).not.toHaveBeenCalled();
  });

  it("deletes a note with a tombstone after confirmation", () => {
    const commit = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<NotesView parsedData={basePlan()} handleChartCommit={commit} />);
    act(() => {
      container.querySelector<HTMLButtonElement>(".note-item-del-btn")!.click();
    });
    expect(confirmSpy).toHaveBeenCalled();
    const committed = commit.mock.calls[0][0] as JanttData;
    expect(committed.notes).toEqual([]);
    expect(committed.meta?.tombstones?.n1?.entityType).toBe("note");
    confirmSpy.mockRestore();
  });
});
