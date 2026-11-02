import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from "y-protocols/awareness";
import { bindJanttToYDoc, bindJanttAwareness, createJanttUndoManager } from "../src/index";
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

  it("manages multi-user presence and awareness correctly", () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();
    const awareness1 = new Awareness(doc1);
    const awareness2 = new Awareness(doc2);

    let client2PeersCount = 0;

    const binding1 = bindJanttAwareness(awareness1, {
      user: { id: "u1", name: "Alice", color: "#3b82f6" }
    });

    const binding2 = bindJanttAwareness(awareness2, {
      user: { id: "u2", name: "Bob", color: "#10b981" },
      onPeersChange: (peers) => {
        client2PeersCount = peers.size;
      }
    });

    // Alice selects task t1 and moves cursor
    binding1.selectTask("t1");
    binding1.setCursor({ date: "2026-11-03", taskIndex: 0 });
    binding1.setDragging(true, "t1");

    expect(binding1.getLocalPresence()?.selectedTaskId).toBe("t1");
    expect(binding1.getLocalPresence()?.isDragging).toBe(true);
    expect(binding1.getLocalPresence()?.draggingTaskId).toBe("t1");
    expect(binding1.getLocalPresence()?.cursor?.date).toBe("2026-11-03");

    // Sync awareness from peer 1 to peer 2
    const update = encodeAwarenessUpdate(awareness1, [awareness1.clientID]);
    applyAwarenessUpdate(awareness2, update, null);

    expect(client2PeersCount).toBeGreaterThanOrEqual(1);
    const peersOn2 = binding2.getPeers();
    const aliceState = peersOn2.get(awareness1.clientID);
    expect(aliceState?.user.name).toBe("Alice");
    expect(aliceState?.selectedTaskId).toBe("t1");
    expect(aliceState?.isDragging).toBe(true);

    binding1.destroy();
    binding2.destroy();
  });

  it("supports infinite undo/redo time-travel history", () => {
    const doc = new Y.Doc();
    const binding = bindJanttToYDoc(doc, { initialPlan });
    const undoManager = createJanttUndoManager(doc);

    expect(undoManager.canUndo()).toBe(false);

    // Perform an edit
    binding.updateTask("t1", { label: "Updated Spec" });
    expect(binding.getPlan().tasks[0].label).toBe("Updated Spec");
    expect(undoManager.canUndo()).toBe(true);

    // Undo edit
    undoManager.undo();
    expect(binding.getPlan().tasks[0].label).toBe("Spec");
    expect(undoManager.canRedo()).toBe(true);

    // Redo edit
    undoManager.redo();
    expect(binding.getPlan().tasks[0].label).toBe("Updated Spec");

    undoManager.destroy();
    binding.destroy();
  });
});
