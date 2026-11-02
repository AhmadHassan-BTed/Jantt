// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { janttAction, mountJantt } from "../src/index";
import type { JanttData } from "@jantt/core";

describe("Jantt Svelte Action Adapter", () => {
  const samplePlan: JanttData = {
    tasks: [
      { id: "t1", label: "Spec", category: "dev", start: "2026-11-01", end: "2026-11-04" },
      { id: "t2", label: "Build", category: "dev", start: "2026-11-05", end: "2026-11-10", dependsOn: "t1" }
    ]
  };

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
  });

  it("mountJantt mounts directly and returns JanttInstance", () => {
    const inst = mountJantt(node, samplePlan);
    expect(inst).toBeDefined();
    expect(inst.getData().tasks).toHaveLength(2);
    inst.destroy();
  });
});
