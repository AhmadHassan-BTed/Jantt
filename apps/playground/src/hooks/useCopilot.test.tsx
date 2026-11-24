// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { JanttData } from "@jantt/core";
import type { StreamCallbacks } from "../services/ai/types";
import { useCopilot } from "./useCopilot";

const stream = vi.hoisted(() => vi.fn());
vi.mock("../services/ai/provider-registry", async importOriginal => ({
  ...await importOriginal<typeof import("../services/ai/provider-registry")>(),
  getProviderAdapter: () => ({ streamChat: stream })
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const plan: JanttData = {
  categories: { work: { label: "Work", color: "#06b6d4" } },
  tasks: [{ id: "a", label: "Design", start: "2026-11-01", end: "2026-11-04", category: "work" }]
};
const commitPlan = vi.fn();
const showToast = vi.fn();
let state: ReturnType<typeof useCopilot>;
let result: StreamCallbacks;
let root: Root;

function Harness({ data, projectId = "one", readOnly = false }: { data: JanttData; projectId?: string; readOnly?: boolean }) {
  state = useCopilot({ parsedData: data, commitPlan, showToast, projectId,
    activeView: "kanban", inspectedTaskId: "a", isReadOnly: readOnly });
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  commitPlan.mockImplementation((data: JanttData) => data);
  localStorage.clear();
  localStorage.setItem("jantt_copilot_auto_apply", "true");
  localStorage.setItem("jantt_copilot_accounts", JSON.stringify([{
    id: "local", providerId: "ollama", label: "Local", apiKey: "", isExplicit: true, selectedModelId: "local-model"
  }]));
  stream.mockImplementation((_conversation, _model, _key, callbacks) => {
    result = callbacks;
    return new AbortController();
  });
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness data={plan} />));
});

afterEach(() => act(() => root.unmount()));

function propose() {
  act(() => state.sendMessage("Shift the finish date"));
  expect(stream.mock.calls[0][0][0].content).toContain('"view":"kanban","selectedTaskId":"a"');
  act(() => result.onDone(JSON.stringify({ tasks: [{ ...plan.tasks[0], end: "2026-11-07" }] })));
}

it("reviews legacy auto-apply requests and commits once on acceptance", () => {
  propose();
  expect(commitPlan).not.toHaveBeenCalled();
  expect(state.pendingDiff?.diff.tasksModified[0].dateChanges).toEqual(["Finish 2026-11-04 → 2026-11-07 (+3d)"]);
  act(() => state.acceptChange());
  expect(commitPlan).toHaveBeenCalledTimes(1);
  expect(state.pendingDiff).toBeNull();
  expect(state.messages[state.messages.length - 1]?.previousPlan).toEqual(plan);
});

it("keeps collaborator edits made during review and ignores responses from another project", () => {
  propose();
  act(() => root.render(<Harness data={{ ...plan, tasks: [{ ...plan.tasks[0], label: "Updated" }] }} />));
  expect(state.isProposalStale).toBe(true);
  act(() => state.acceptChange());
  expect(commitPlan).not.toHaveBeenCalled();
  act(() => state.rejectChange());
  expect(state.pendingDiff).toBeNull();
  act(() => state.sendMessage("Another proposal"));
  act(() => root.render(<Harness data={plan} projectId="two" />));
  act(() => result.onDone(JSON.stringify(plan)));
  expect(state.messages).toEqual([]);
  expect(state.pendingDiff).toBeNull();
});

it("enforces current room access for a pending proposal and an applied proposal", () => {
  propose();
  act(() => root.render(<Harness data={plan} readOnly />));
  act(() => state.acceptChange());
  expect(commitPlan).not.toHaveBeenCalled();
  expect(state.pendingDiff).not.toBeNull();
  expect(state.isReadOnly).toBe(true);
  act(() => root.render(<Harness data={plan} />));
  commitPlan.mockReturnValueOnce(null);
  act(() => state.acceptChange());
  expect(state.messages[state.messages.length - 1]?.applied).toBeUndefined();
  expect(state.pendingDiff).not.toBeNull();
  act(() => state.acceptChange());
  const accepted = state.messages[state.messages.length - 1]!;
  act(() => root.render(<Harness data={accepted.extractedPlan!} readOnly />));
  act(() => state.revertChange(accepted.id));
  expect(commitPlan).toHaveBeenCalledTimes(2);
  expect(state.messages[state.messages.length - 1]?.applied).toBe(true);
});

it("reverts the canonical commit while preserving subsequent edits and new task references", () => {
  const source: JanttData = { ...plan, tasks: [{ ...plan.tasks[0], progress: 0.4, status: "in-progress" }] };
  act(() => root.render(<Harness data={source} />));
  act(() => state.sendMessage("Complete design and create three tasks"));
  act(() => result.onDone(JSON.stringify({ tasks: [
    { id: "a", status: "completed" },
    ...["b", "c", "d"].map(id => ({ ...plan.tasks[0], id }))
  ] })));
  commitPlan.mockImplementationOnce((next: JanttData) => ({
    ...next, tasks: next.tasks.map(task => task.id === "a" ? { ...task, progress: 1 } : task)
  }));
  act(() => state.acceptChange());
  const accepted = state.messages[state.messages.length - 1]!;
  const later = accepted.extractedPlan!;
  act(() => root.render(<Harness data={{ ...later, tasks: [
    ...later.tasks.map(task => task.id === "b" ? { ...task, notes: "Teammate estimate" } : task),
    { ...plan.tasks[0], id: "other", dependsOn: "c" }
  ] }} />));
  act(() => state.revertChange(accepted.id));
  const undone: JanttData = commitPlan.mock.lastCall![0];
  expect(undone.tasks.map(task => task.id)).toEqual(["a", "b", "c", "other"]);
  expect(undone.tasks[0]).toMatchObject({ status: "in-progress", progress: 0.4 });
  expect(undone.tasks[1].notes).toBe("Teammate estimate");
  expect(undone.tasks[3].dependsOn).toBe("c");
});
