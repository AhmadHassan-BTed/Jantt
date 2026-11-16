// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { JanttData, Task } from "@jantt/core";
import { validate } from "@jantt/core";
import { diffPlans, applyHistoryEntry } from "D:/Repos/Jantt/apps/playground/src/hooks/useUndoRedo";
import { mergeCommittedTasks, stampLocalChanges } from "D:/Repos/Jantt/apps/playground/src/hooks/useEditorState";
import { useSnapshotVault } from "D:/Repos/Jantt/apps/playground/src/hooks/useSnapshotVault";
import { useProjectState } from "D:/Repos/Jantt/apps/playground/src/hooks/useProjectState";
import {
  deleteTasks,
  importSharedPlan,
  encodeDataToBase64Url,
  cloneTemplateData
} from "D:/Repos/Jantt/apps/playground/src/utils";
import { storageService } from "D:/Repos/Jantt/apps/playground/src/services/storage";
import { STORAGE_KEYS } from "D:/Repos/Jantt/apps/playground/src/constants";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const task = (id: string, extra: Partial<Task> = {}): Task =>
  ({ id, label: id, start: "2026-01-05", end: "2026-01-09", ...extra }) as Task;
const plan = (tasks: Task[], extra: Partial<JanttData> = {}): JanttData =>
  ({ meta: { title: "P" }, tasks, ...extra }) as JanttData;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  storageService.clear();
});

function renderHook<T>(hook: () => T): { current: T } {
  const result = { current: undefined as unknown as T };
  const Probe = () => {
    result.current = hook();
    return null;
  };
  const el = document.createElement("div");
  root = createRoot(el);
  act(() => root!.render(createElement(Probe)));
  return result;
}

describe("undo entries", () => {
  it("undo of an edit keeps a collaborator's later change to another field", () => {
    const before = plan([task("a"), task("b")]);
    const after = plan([task("a", { label: "edited" }), task("b")]);
    const entry = diffPlans(before, after)!;
    const remote = plan([task("a", { label: "edited", start: "2026-02-01" }), task("b")]);
    const { data, applied, skipped } = applyHistoryEntry(remote, entry, "undo", "2026-01-01T00:00:00.000Z#p");
    expect(applied).toBe(1);
    expect(skipped).toBe(0);
    expect(data.tasks[0].label).toBe("a");
    expect(data.tasks[0].start).toBe("2026-02-01");
  });

  it("undo of a soft delete revives the task and drops its tombstone", () => {
    const before = plan([task("a"), task("b")]);
    const after = plan([task("a", { _deleted: true, deletedAt: "2026-01-01T00:00:00.000Z" } as Partial<Task>), task("b")], {
      meta: { title: "P", tombstones: { a: { deletedAt: "2026-01-01T00:00:00.000Z", entityType: "task" } } }
    } as Partial<JanttData>);
    const entry = diffPlans(before, after)!;
    const { data } = applyHistoryEntry(after, entry, "undo", "x");
    expect(data.tasks[0]._deleted).toBeUndefined();
    expect(data.meta?.tombstones?.a).toBeUndefined();
  });

  it("undo of add removes with a tombstone; redo re-adds", () => {
    const before = plan([task("a")]);
    const after = plan([task("a"), task("n")]);
    const entry = diffPlans(before, after)!;
    const undone = applyHistoryEntry(after, entry, "undo", "2026-03-01T00:00:00.000Z#p").data;
    expect(undone.tasks.map((t) => t.id)).toEqual(["a"]);
    expect(undone.meta?.tombstones?.n?.deletedAt).toBe("2026-03-01T00:00:00.000Z#p");
    const redone = applyHistoryEntry(undone, entry, "redo", "y").data;
    expect(redone.tasks.map((t) => t.id)).toEqual(["a", "n"]);
    expect(redone.meta?.tombstones?.n).toBeUndefined();
  });
});

describe("commit merge and stamping", () => {
  it("honors explicit multi-task deletes and keeps silently omitted tasks", () => {
    const master = [task("a"), task("b"), task("c"), task("d")];
    // explicit deletion of a, b via new tombstones
    const del = mergeCommittedTasks(master, [task("c"), task("d")], {}, { a: { deletedAt: "t" }, b: { deletedAt: "t" } });
    expect(del.map((t) => t.id)).toEqual(["c", "d"]);
    // filtered subset: a, b silently omitted -> kept, new task appended
    const sub = mergeCommittedTasks(master, [task("c", { label: "x" }), task("e")], {}, {});
    expect(sub.map((t) => t.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(sub[2].label).toBe("x");
  });

  it("stamps only changed fields and keeps untouched tasks identical", () => {
    const a = task("a", { progress: 0.2, status: "in-progress" } as Partial<Task>);
    const b = task("b");
    const prev = plan([a, b]);
    const next = plan([{ ...a, progress: 1 } as Task, b]);
    const out = stampLocalChanges(prev, next, { peerId: "p", nowIso: "2026-05-01T00:00:00.000Z", syncStatusProgress: true });
    expect(out.tasks[1]).toBe(b);
    expect(out.tasks[0].status).toBe("completed");
    expect(Object.keys(out.tasks[0].fieldTimestamps || {}).sort()).toEqual(["progress", "status"]);
  });
});

describe("plan helpers", () => {
  it("deleteTasks prunes deps and note links without mutating input", () => {
    const data = plan([task("a"), task("b", { dependsOn: ["a", "c"] } as Partial<Task>), task("c")], {
      notes: [{ id: "n1", task_ids: ["a", "c"] }] as any
    });
    const frozen = JSON.stringify(data);
    const out = deleteTasks(data, ["a"], "ts");
    expect(JSON.stringify(data)).toBe(frozen);
    expect(out.tasks.map((t) => t.id)).toEqual(["b", "c"]);
    expect(out.tasks[0].dependsOn).toBe("c");
    expect((out.notes as any)[0].task_ids).toEqual(["c"]);
    expect(out.tasks[1]).toBe(data.tasks[2]);
  });

  it("re-opening a share link activates the earlier import instead of duplicating it", () => {
    const payload = encodeDataToBase64Url(cloneTemplateData());
    const first = importSharedPlan([], payload)!;
    expect(first.isNew).toBe(true);
    const second = importSharedPlan(first.projects, payload)!;
    expect(second.isNew).toBe(false);
    expect(second.project.id).toBe(first.project.id);
  });
});

describe("snapshot vault thinning", () => {
  it("keeps the state right before a new edit burst after an idle gap", () => {
    vi.useFakeTimers();
    const t0 = new Date("2026-06-01T10:00:00.000Z").getTime();
    vi.setSystemTime(t0);
    const vault = renderHook(() => useSnapshotVault("p1"));
    const snap = (label: string, atMs: number) => {
      vi.setSystemTime(t0 + atMs);
      vault.current.captureSnapshot("p1", plan([task("a", { label })]), "Auto-Save");
    };
    snap("v0", 0);
    snap("v1", 5_000);
    snap("v2", 10_000);
    // idle for an hour, then a new edit
    snap("v3", 3_600_000);
    const stored = storageService.getItem<any[]>("jantt_snapshots_p1")!;
    const labels = stored.map((s) => s.data.tasks[0].label);
    expect(labels[0]).toBe("v3");
    expect(labels).toContain("v2"); // the state before the new burst survives
    expect(labels).toContain("v0");
  });

  it("checkpoints at most every spacing window during continuous editing", () => {
    vi.useFakeTimers();
    const t0 = new Date("2026-06-01T10:00:00.000Z").getTime();
    vi.setSystemTime(t0);
    const vault = renderHook(() => useSnapshotVault("p2"));
    for (let i = 0; i <= 60; i++) {
      vi.setSystemTime(t0 + i * 5_000);
      vault.current.captureSnapshot("p2", plan([task("a", { label: `v${i}` })]), "Auto-Save");
    }
    const stored = storageService.getItem<any[]>("jantt_snapshots_p2")!;
    // 5 minutes of edits every 5s -> a handful of entries, not 61
    expect(stored.length).toBeLessThanOrEqual(5);
    expect(stored[0].data.tasks[0].label).toBe("v60");
  });
});

describe("project switching", () => {
  const baseOpts = () => ({
    setJsonText: vi.fn(),
    setParsedData: vi.fn(),
    setValidationResult: vi.fn(),
    setPeople: vi.fn(),
    setTeams: vi.fn(),
    setCurrentScale: vi.fn(),
    setShowCriticalPath: vi.fn(),
    setShowBaselines: vi.fn(),
    showToast: vi.fn()
  });

  it("re-selecting the open plan loads the edits the flush just saved", () => {
    const stale = cloneTemplateData();
    stale.meta = { ...stale.meta, title: "stale" };
    const fresh = cloneTemplateData();
    fresh.meta = { ...fresh.meta, title: "fresh" };
    expect(validate(fresh).valid).toBe(true);
    const opts = baseOpts();
    const projects = [{ id: "p1", name: "P1", updatedAt: "2026-01-01T00:00:00.000Z", data: stale, source: "local" as const }];
    storageService.setItem(STORAGE_KEYS.CUSTOM_PROJECTS, projects);
    const hook = renderHook(() =>
      useProjectState({
        ...opts,
        initialProjects: projects,
        initialActiveId: "p1",
        parsedData: fresh,
        flushPendingSave: () => hook.current.saveProjectData("p1", fresh)
      })
    );
    act(() => hook.current.handleSelectProject("p1"));
    const loaded = opts.setParsedData.mock.calls.at(-1)?.[0] as JanttData;
    expect(loaded.meta?.title).toBe("fresh");
  });

  it("reset of the default plan restores its saved copy, not the template", () => {
    const saved = cloneTemplateData();
    saved.meta = { ...saved.meta, title: "my default edits" };
    storageService.setItem(STORAGE_KEYS.DEFAULT_PLAN, saved);
    const opts = baseOpts();
    const hook = renderHook(() =>
      useProjectState({ ...opts, initialProjects: [], initialActiveId: "default", parsedData: saved })
    );
    act(() => hook.current.handleResetActiveProject());
    const loaded = opts.setParsedData.mock.calls.at(-1)?.[0] as JanttData;
    expect(loaded.meta?.title).toBe("my default edits");
  });
});
