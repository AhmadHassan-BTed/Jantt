// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { JanttData } from "@jantt/core";
import { useDynamicSync } from "./useDynamicSync";
import { getTabInstanceId } from "../room-storage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHANNEL = "jantt_cross_tab_sync";
const hasBroadcastChannel = typeof BroadcastChannel !== "undefined";

function plan(label: string): JanttData {
  return { meta: { title: "Plan" }, tasks: [{ id: "t1", label, start: "2026-01-05", end: "2026-01-09" }] } as JanttData;
}

let root: Root | null = null;
const setParsedData = vi.fn();

function Harness({ data }: { data: JanttData }) {
  useDynamicSync({
    activeProjectId: "p1",
    parsedData: data,
    setParsedData,
    setJsonText: () => {},
    setPeople: () => {},
    setTeams: () => {},
    setValidationResult: () => {}
  });
  return null;
}

async function mount(data: JanttData) {
  root = createRoot(document.createElement("div"));
  await act(async () => root!.render(<Harness data={data} />));
}

async function postFromAnotherTab(message: Record<string, unknown>) {
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage({ type: "PLAN_MUTATED", projectId: "p1", timestamp: new Date().toISOString(), ...message });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  channel.close();
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  setParsedData.mockReset();
});

describe.skipIf(!hasBroadcastChannel)("useDynamicSync (cross-tab)", () => {
  it("applies a plan saved in another tab", async () => {
    await mount(plan("Here"));
    await postFromAnotherTab({ senderId: "tab-other", data: plan("There") });
    expect(setParsedData).toHaveBeenCalledTimes(1);
    expect(setParsedData.mock.calls[0][0].tasks[0].label).toBe("There");
  });

  it("ignores echoes of the open plan and its own messages", async () => {
    await mount(plan("Same"));
    await postFromAnotherTab({ senderId: "tab-other", data: plan("Same") });
    await postFromAnotherTab({ senderId: getTabInstanceId(), data: plan("Mine") });
    await postFromAnotherTab({ senderId: "tab-other", projectId: "p2", data: plan("Other plan") });
    expect(setParsedData).not.toHaveBeenCalled();
  });
});
