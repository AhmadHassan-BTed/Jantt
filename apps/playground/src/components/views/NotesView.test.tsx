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

  it("filters notes by task from notesIntent and creates linked timestamped notes for that task", () => {
    const commit = vi.fn();
    const consumeIntent = vi.fn();
    const plan = basePlan({
      tasks: [
        { id: "T1", label: "Design", category: "x", start: "2026-01-01", end: "2026-01-05" },
        { id: "T2", label: "Build", category: "x", start: "2026-01-06", end: "2026-01-10" }
      ],
      notes: [
        { id: "n1", title: "General Kickoff", content: "Project wide", task_ids: [], createdAt: "2026-11-27T10:00", updatedAt: "2026-11-27T10:00" },
        { id: "n2", title: "Design Spec", content: "Fonts & colors", task_ids: ["T1"], createdAt: "2026-11-27T14:30", updatedAt: "2026-11-27T14:30" }
      ]
    });

    render(
      <NotesView
        parsedData={plan}
        handleChartCommit={commit}
        timeFormat="24h"
        notesIntent={{ taskId: "T1", noteId: "n2", mode: "manage", nonce: 1 }}
        onConsumeNotesIntent={consumeIntent}
      />
    );

    expect(consumeIntent).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".notes-task-banner-label")?.textContent).toBe("Design");
    const listTitles = Array.from(container.querySelectorAll(".note-item-title")).map((el) => el.textContent);
    expect(listTitles).toEqual(["Design Spec"]);
    expect(container.querySelector(".note-timestamps-bar")?.textContent).toContain("14:30");

    // Clicking Stamp Time inserts a formatted inline timestamp and saves it
    const stampBtn = container.querySelector<HTMLButtonElement>(".note-stamp-btn")!;
    act(() => {
      stampBtn.click();
      vi.advanceTimersByTime(400);
    });
    expect(editorEl()?.textContent).toMatch(/\[\w+ \d+, \d{4}, \d{2}:\d{2}\]/);
    expect(commit).toHaveBeenCalledTimes(1);
    const afterStamp = commit.mock.calls[0][0] as JanttData;
    expect(afterStamp.notes?.find((n) => n.id === "n2")?.content).toMatch(/\[\w+ \d+, \d{4}, \d{2}:\d{2}\]/);

    // Creating a new note while scoped to task T1 links task_ids: ["T1"] and sets timestamp
    act(() => {
      container.querySelector<HTMLButtonElement>(".notes-new-btn")!.click();
    });
    const lastPlan = commit.mock.calls[commit.mock.calls.length - 1][0] as JanttData;
    const created = lastPlan.notes?.[0];
    expect(created?.task_ids).toEqual(["T1"]);
    expect(created?.timestamp).toBeTruthy();

    // Clearing the task filter restores all notes
    act(() => {
      container.querySelector<HTMLButtonElement>(".notes-task-clear-btn")!.click();
    });
    expect(container.querySelectorAll(".note-list-item")).toHaveLength(2);
  });
});
