// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { janttAction, mountJantt } from "../src/index";
import type { JanttData } from "@jantt/core";

describe("Jantt Svelte Action Adapter", () => {
  const samplePlan: JanttData = {
    tasks: [
      { id: "t1", label: "Spec", category: "dev", start: "2026-11-01", end: "2026-11-04" },
      { id: "t2", label: "Build", category: "dev", start: "2026-11-05", end: "2026-11-10", dependsOn: "t1" }
    ]
  };

  /** Data the engine cannot read: any access to `tasks` throws. */
  const brokenPlan = Object.defineProperty({}, "tasks", {
    enumerable: true,
    get() {
      throw new Error("bad plan");
    }
  }) as JanttData;

  let node: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    node = document.createElement("div");
    document.body.appendChild(node);
  });

  it("mounts Jantt chart into DOM node and calls onReady", () => {
    let readyInstance: any = null;
    const actionResult = janttAction(node, {
      data: samplePlan,
      onReady: (inst) => {
        readyInstance = inst;
      }
    });

    expect(readyInstance).not.toBeNull();
    expect(readyInstance.getData().tasks).toHaveLength(2);
    expect(node.querySelector(".jantt-container")).not.toBeNull();

    actionResult.destroy();
  });

  it("reactively updates chart when action update is invoked", () => {
    let readyInstance: any = null;
    const actionResult = janttAction(node, {
      data: samplePlan,
      onReady: (inst) => {
        readyInstance = inst;
      }
    });

    const updatedPlan: JanttData = {
      tasks: [
        ...samplePlan.tasks,
        { id: "t3", label: "Deploy", category: "ops", start: "2026-11-11", end: "2026-11-13" }
      ]
    };

    actionResult.update({ data: updatedPlan });
    expect(readyInstance.getData().tasks).toHaveLength(3);

    actionResult.destroy();
  });

  it("cleans up chart controller when destroy is called", () => {
    let readyInstance: any = null;
    const actionResult = janttAction(node, {
      data: samplePlan,
      onReady: (inst) => {
        readyInstance = inst;
      }
    });

    expect(readyInstance).not.toBeNull();
    actionResult.destroy();
    expect(node.innerHTML).toBe("");

    // Updates after destroy are ignored and never remount the chart.
    const onReady = vi.fn();
    actionResult.update({ data: samplePlan, onReady });
    expect(node.innerHTML).toBe("");
    expect(onReady).not.toHaveBeenCalled();
  });

  it("routes mount and update errors to options.onError and retries a failed mount", () => {
    const onError = vi.fn();
    const onReady = vi.fn();
    let actionResult: ReturnType<typeof janttAction> | undefined;

    expect(() => {
      actionResult = janttAction(node, { data: brokenPlan, options: { onError }, onReady });
    }).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onReady).not.toHaveBeenCalled();

    actionResult!.update({ data: samplePlan, options: { onError }, onReady });
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady.mock.calls[0][0].getData().tasks).toHaveLength(2);

    expect(() => actionResult!.update({ data: brokenPlan, options: { onError }, onReady })).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(2);

    actionResult!.destroy();
  });

  it("mountJantt mounts directly and returns JanttInstance", () => {
    const inst = mountJantt(node, samplePlan);
    expect(inst).toBeDefined();
    expect(inst.getData().tasks).toHaveLength(2);
    inst.destroy();
  });
});
