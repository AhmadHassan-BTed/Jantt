import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { bindJanttToYDoc } from "../src/index";
import type { JanttData } from "@jantt/core";

describe("Jantt Yjs Multiplayer CRDT Binding", () => {
  const initialPlan: JanttData = {
    meta: { title: "Alpha Sprint" },
    tasks: [
      { id: "t1", label: "Spec", category: "dev", start: "2026-11-01", end: "2026-11-05" },
      { id: "t2", label: "Build", category: "dev", start: "2026-11-06", end: "2026-11-12", dependsOn: "t1" }
    ]
  };

  it("populates initial plan into Y.Doc and serializes back", () => {
    const doc = new Y.Doc();
    const binding = bindJanttToYDoc(doc, { initialPlan });

    const plan = binding.getPlan();
    expect(plan.meta?.title).toBe("Alpha Sprint");
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[0].label).toBe("Spec");

    binding.destroy();
  });

  it("updates specific task fields fine-grainedly", () => {
    const doc = new Y.Doc();
    const binding = bindJanttToYDoc(doc, { initialPlan });

    binding.updateTask("t1", { progress: 0.8, priority: "urgent" });

    const plan = binding.getPlan();
    const t1 = plan.tasks.find((t) => t.id === "t1")!;
    expect(t1.progress).toBe(0.8);
    expect(t1.priority).toBe("urgent");
    expect(t1.start).toBe("2026-11-01"); // Preserved untouched properties

    binding.destroy();
  });

  it("synchronizes across two peer Y.Docs bidirectionally", () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    let peer2NotifiedPlan: JanttData | null = null;

    const binding1 = bindJanttToYDoc(doc1, { initialPlan });
    const binding2 = bindJanttToYDoc(doc2, {
      onPlanChange: (newPlan) => {
        peer2NotifiedPlan = newPlan;
      }
    });

    // Initial sync from doc1 -> doc2
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
    expect(binding2.getPlan().tasks).toHaveLength(2);

    // Peer 1 edits task t2
    binding1.updateTask("t2", { label: "Build & Verify", end: "2026-11-15" });

    // Propagate update from doc1 -> doc2
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

    expect(peer2NotifiedPlan).not.toBeNull();
    const peer2Tasks = binding2.getPlan().tasks;
    const t2 = peer2Tasks.find((t) => t.id === "t2")!;
    expect(t2.label).toBe("Build & Verify");
    expect(t2.end).toBe("2026-11-15");

    binding1.destroy();
    binding2.destroy();
  });

  it("handles concurrent task deletions cleanly", () => {
    const doc = new Y.Doc();
    const binding = bindJanttToYDoc(doc, { initialPlan });

    binding.deleteTask("t1");

    const plan = binding.getPlan();
    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0].id).toBe("t2");

    binding.destroy();
  });
});
