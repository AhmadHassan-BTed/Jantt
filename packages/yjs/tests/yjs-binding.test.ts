import { describe, it, expect, vi, afterEach } from "vitest";
import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from "y-protocols/awareness";
import { bindJanttToYDoc, bindJanttAwareness, createJanttUndoManager } from "../src/index";
import type { JanttData } from "@jantt/core";

/** Two-way sync of every pending update between two docs. */
function sync(a: Y.Doc, b: Y.Doc): void {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe("Jantt Yjs Multiplayer CRDT Binding", () => {
  const initialPlan: JanttData = {
    meta: { title: "Alpha Sprint" },
    tasks: [
      { id: "t1", label: "Spec", category: "dev", start: "2026-11-01", end: "2026-11-05" },
      { id: "t2", label: "Build", category: "dev", start: "2026-11-06", end: "2026-11-12", dependsOn: "t1" }
    ]
  };

  const fullPlan: JanttData = {
    $schema: "https://jantt.dev/schema/v1.json",
    meta: { title: "Full", scale: "week", showCriticalPath: true },
    categories: { dev: { label: "Dev", color: "#38BDF8" } },
    calendars: { std: { workingDays: [1, 2, 3, 4, 5] } as any },
    notes: [{ id: "n1", title: "Kickoff", body: "Agenda" } as any],
    documents: [{ id: "d1", label: "Charter", status: "have" }],
    people: [{ id: "p1", name: "Ada" } as any],
    teams: [{ id: "tm1", name: "Core" } as any],
    customKey: { nested: [1, 2, 3] },
    tasks: [
      {
        id: "t1",
        label: "Spec",
        category: "dev",
        start: "2026-11-01",
        end: "2026-11-05",
        baseline: { start: "2026-11-01", end: "2026-11-04" },
        fields: { risk: "low" }
      },
      { id: "t2", label: "Build", category: "dev", start: "2026-11-06", end: "2026-11-12", dependsOn: ["t1"] as any }
    ]
  };

  it("populates initial plan into Y.Doc and serializes back", () => {
    const doc = new Y.Doc();
    const binding = bindJanttToYDoc(doc, { initialPlan });

    const plan = binding.getPlan();
    expect(plan.meta?.title).toBe("Alpha Sprint");
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[0].label).toBe("Spec");
    expect(plan.people).toEqual([]);
    expect(plan.teams).toEqual([]);

    binding.destroy();
  });

  it("round-trips every top-level plan key through a peer", () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();
    const binding1 = bindJanttToYDoc(doc1, { initialPlan: fullPlan });
    const binding2 = bindJanttToYDoc(doc2);

    sync(doc1, doc2);

    expect(binding2.getPlan()).toEqual(fullPlan);
    binding1.destroy();
    binding2.destroy();
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

  it("updateTask on an unknown id creates a task that keeps its id", () => {
    const doc = new Y.Doc();
    const binding = bindJanttToYDoc(doc, { initialPlan });

    binding.updateTask("t9", { progress: 0.5, id: "spoofed" } as any);

    const t9 = binding.getPlan().tasks.find((t) => t.id === "t9");
    expect(t9).toMatchObject({ id: "t9", progress: 0.5 });
    expect(binding.getPlan().tasks.map((t) => t.id)).toEqual(["t1", "t2", "t9"]);
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

  it("soft-deletes a task with deleteTask", () => {
    const doc = new Y.Doc();
    const binding = bindJanttToYDoc(doc, { initialPlan });

    binding.deleteTask("t1");

    const plan = binding.getPlan();
    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0].id).toBe("t2");

    binding.destroy();
  });

  describe("updatePlan", () => {
    it("propagates removed meta keys, categories and task fields", () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      const binding1 = bindJanttToYDoc(doc1, { initialPlan: fullPlan });
      const binding2 = bindJanttToYDoc(doc2);
      sync(doc1, doc2);

      const next = clone(binding1.getPlan());
      delete next.meta!.showCriticalPath;
      delete next.categories!.dev;
      delete next.tasks[0].baseline;
      delete next.tasks[0].fields;
      binding1.updatePlan(next);
      sync(doc1, doc2);

      const plan2 = binding2.getPlan();
      expect(plan2.meta).not.toHaveProperty("showCriticalPath");
      expect(plan2.categories).toEqual({});
      expect(plan2.tasks[0]).not.toHaveProperty("baseline");
      expect(plan2.tasks[0]).not.toHaveProperty("fields");
      binding1.destroy();
      binding2.destroy();
    });

    it("syncs people, teams, calendars and custom keys", () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      const binding1 = bindJanttToYDoc(doc1, { initialPlan: fullPlan });
      let notified: JanttData | null = null;
      const binding2 = bindJanttToYDoc(doc2, { onPlanChange: (p) => (notified = p) });
      sync(doc1, doc2);

      const next = clone(binding1.getPlan());
      next.people = [...next.people!, { id: "p2", name: "Grace" } as any];
      next.teams = [];
      next.calendars = { std: { workingDays: [1, 2, 3, 4] } as any };
      delete next.customKey;
      binding1.updatePlan(next);
      sync(doc1, doc2);

      expect(notified!.people!.map((p) => p.id)).toEqual(["p1", "p2"]);
      expect(notified!.teams).toEqual([]);
      expect((notified!.calendars as any).std.workingDays).toEqual([1, 2, 3, 4]);
      expect(notified).not.toHaveProperty("customKey");
      binding1.destroy();
      binding2.destroy();
    });

    it("writes nothing when an equal (cloned) plan is committed", () => {
      const doc = new Y.Doc();
      const binding = bindJanttToYDoc(doc, { initialPlan: fullPlan });
      const updates: Uint8Array[] = [];
      doc.on("update", (u: Uint8Array) => updates.push(u));

      binding.updatePlan(clone(binding.getPlan()));

      expect(updates).toHaveLength(0);
      binding.destroy();
    });

    it("detects in-place mutations of a previously committed plan", () => {
      const doc = new Y.Doc();
      const binding = bindJanttToYDoc(doc);
      const plan = clone(initialPlan);
      binding.updatePlan(plan);

      plan.tasks[0].progress = 1;
      binding.updatePlan(plan);

      expect(binding.getPlan().tasks[0].progress).toBe(1);
      binding.destroy();
    });

    it("a stale snapshot neither deletes remote tasks nor reverts remote edits", () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      const binding1 = bindJanttToYDoc(doc1, { initialPlan });
      const binding2 = bindJanttToYDoc(doc2);
      sync(doc1, doc2);

      const staleOn1 = clone(binding1.getPlan());

      // Peer 2 adds a task and edits t2 while peer 1 still holds its old snapshot.
      const next2 = clone(binding2.getPlan());
      next2.tasks.push({ id: "t3", label: "QA", category: "qa", start: "2026-11-13", end: "2026-11-14" });
      next2.tasks[1].label = "Build v2";
      binding2.updatePlan(next2);

      // Peer 1 commits an unrelated edit derived from its stale snapshot.
      staleOn1.tasks[0].progress = 0.5;
      binding1.updatePlan(staleOn1);
      sync(doc1, doc2);

      for (const plan of [binding1.getPlan(), binding2.getPlan()]) {
        expect(plan.tasks.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
        expect(plan.tasks[0].progress).toBe(0.5);
        expect(plan.tasks[1].label).toBe("Build v2");
      }
      binding1.destroy();
      binding2.destroy();
    });

    it("concurrent edits to different fields of one task both survive", () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      const binding1 = bindJanttToYDoc(doc1, { initialPlan });
      const binding2 = bindJanttToYDoc(doc2);
      sync(doc1, doc2);

      const p1 = clone(binding1.getPlan());
      const p2 = clone(binding2.getPlan());
      p1.tasks[0].label = "Spec v2";
      p2.tasks[0].end = "2026-11-07";
      binding1.updatePlan(p1);
      binding2.updatePlan(p2);
      sync(doc1, doc2);

      expect(binding1.getPlan().tasks[0]).toMatchObject({ label: "Spec v2", end: "2026-11-07" });
      expect(binding2.getPlan().tasks[0]).toMatchObject({ label: "Spec v2", end: "2026-11-07" });
      binding1.destroy();
      binding2.destroy();
    });

    it("re-adding a deleted task id restores it", () => {
      const doc = new Y.Doc();
      const binding = bindJanttToYDoc(doc, { initialPlan });
      const original = clone(binding.getPlan());

      binding.updatePlan({ ...original, tasks: original.tasks.slice(1) });
      expect(binding.getPlan().tasks.map((t) => t.id)).toEqual(["t2"]);

      // e.g. the app's own undo restores the previous plan
      binding.updatePlan(original);
      const restored = binding.getPlan();
      expect(restored.tasks.map((t) => t.id)).toEqual(["t1", "t2"]);
      expect(restored.tasks[0]).not.toHaveProperty("_deleted");
      expect(restored.tasks[0]).not.toHaveProperty("deletedAt");
      binding.destroy();
    });

    it("keeps a peer's deletion when the app had not changed the task", () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      const binding1 = bindJanttToYDoc(doc1, { initialPlan });
      const binding2 = bindJanttToYDoc(doc2);
      sync(doc1, doc2);

      const stale = clone(binding1.getPlan());
      binding2.deleteTask("t1");
      sync(doc1, doc2);
      stale.tasks[1].label = "Build!";
      binding1.updatePlan(stale);
      sync(doc1, doc2);

      expect(binding2.getPlan().tasks.map((t) => t.id)).toEqual(["t2"]);
      binding1.destroy();
      binding2.destroy();
    });

    it("a stale snapshot does not resurrect a task whose tombstone a peer pruned", () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      const binding1 = bindJanttToYDoc(doc1, { initialPlan });
      const binding2 = bindJanttToYDoc(doc2);
      sync(doc1, doc2);

      const stale = clone(binding1.getPlan());
      binding2.deleteTask("t1");
      binding2.pruneTombstones(-1);
      sync(doc1, doc2);
      stale.tasks[1].label = "Build!";
      binding1.updatePlan(stale);
      sync(doc1, doc2);

      for (const plan of [binding1.getPlan(), binding2.getPlan()]) {
        expect(plan.tasks.map((t) => t.id)).toEqual(["t2"]);
        expect(plan.tasks[0].label).toBe("Build!");
      }

      // Re-adding the id afterwards (unknown to the new base) still works.
      const readd = clone(binding1.getPlan());
      readd.tasks.unshift(clone(initialPlan.tasks[0]));
      binding1.updatePlan(readd);
      expect(binding1.getPlan().tasks.map((t) => t.id)).toEqual(["t1", "t2"]);
      binding1.destroy();
      binding2.destroy();
    });

    it("restoreTask clears a tombstone and pruneTombstones removes old ones", () => {
      const doc = new Y.Doc();
      const binding = bindJanttToYDoc(doc, { initialPlan });

      binding.deleteTask("t1");
      expect(binding.restoreTask("t1")).toBe(true);
      expect(binding.restoreTask("t1")).toBe(false);
      expect(binding.getPlan().tasks).toHaveLength(2);

      binding.deleteTask("t2");
      expect(binding.pruneTombstones(60_000)).toBe(0);
      expect(binding.pruneTombstones(-1)).toBe(1);
      expect(doc.getMap("jantt_tasks").has("t2")).toBe(false);
      binding.destroy();
    });
  });

  describe("task order", () => {
    it("is identical on peers regardless of integration order and follows reorders", () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      const doc3 = new Y.Doc();
      const binding1 = bindJanttToYDoc(doc1, { initialPlan });
      const binding2 = bindJanttToYDoc(doc2);
      const binding3 = bindJanttToYDoc(doc3);

      const plan = clone(binding1.getPlan());
      plan.tasks.unshift({ id: "t0", label: "Discovery", category: "dev", start: "2026-10-28", end: "2026-10-31" });
      binding1.updatePlan(plan);

      // doc3 receives the latest update before the original seed.
      Y.applyUpdate(doc3, Y.encodeStateAsUpdate(doc1));
      sync(doc1, doc2);
      expect(binding2.getPlan().tasks.map((t) => t.id)).toEqual(["t0", "t1", "t2"]);
      expect(binding3.getPlan().tasks.map((t) => t.id)).toEqual(["t0", "t1", "t2"]);

      const reordered = clone(binding2.getPlan());
      reordered.tasks.reverse();
      binding2.updatePlan(reordered);
      sync(doc1, doc2);
      expect(binding1.getPlan().tasks.map((t) => t.id)).toEqual(["t2", "t1", "t0"]);
      binding1.destroy();
      binding2.destroy();
      binding3.destroy();
    });

    it("concurrently added tasks end up in the same order on every peer", () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      const binding1 = bindJanttToYDoc(doc1, { initialPlan });
      const binding2 = bindJanttToYDoc(doc2);
      sync(doc1, doc2);

      const p1 = clone(binding1.getPlan());
      const p2 = clone(binding2.getPlan());
      p1.tasks.push({ id: "a", label: "A", category: "dev", start: "2026-11-13", end: "2026-11-14" });
      p2.tasks.push({ id: "b", label: "B", category: "dev", start: "2026-11-13", end: "2026-11-14" });
      binding1.updatePlan(p1);
      binding2.updatePlan(p2);
      sync(doc1, doc2);

      const order1 = binding1.getPlan().tasks.map((t) => t.id);
      expect(order1).toEqual(binding2.getPlan().tasks.map((t) => t.id));
      expect(order1.slice(0, 2)).toEqual(["t1", "t2"]);
      expect([...order1].sort()).toEqual(["a", "b", "t1", "t2"]);
      binding1.destroy();
      binding2.destroy();
    });
  });

  describe("seeding", () => {
    it("concurrent seeds converge without duplicating people or teams", () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      const binding1 = bindJanttToYDoc(doc1, { initialPlan: fullPlan });
      const binding2 = bindJanttToYDoc(doc2, { initialPlan: fullPlan });
      sync(doc1, doc2);

      expect(binding1.getPlan()).toEqual(fullPlan);
      expect(binding2.getPlan()).toEqual(fullPlan);
      binding1.destroy();
      binding2.destroy();
    });

    it("seedIfEmpty only seeds an empty doc", () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      const binding1 = bindJanttToYDoc(doc1, { initialPlan });
      const binding2 = bindJanttToYDoc(doc2);

      sync(doc1, doc2); // provider "synced"
      expect(binding2.seedIfEmpty(fullPlan)).toBe(false);
      expect(binding2.getPlan().meta?.title).toBe("Alpha Sprint");

      const doc3 = new Y.Doc();
      const binding3 = bindJanttToYDoc(doc3);
      expect(binding3.seedIfEmpty(fullPlan)).toBe(true);
      expect(binding3.getPlan()).toEqual(fullPlan);
      binding1.destroy();
      binding2.destroy();
      binding3.destroy();
    });

    it("reads people and teams written by older binding versions", () => {
      const doc = new Y.Doc();
      doc.getArray("jantt_people").insert(0, [{ id: "p1", name: "Ada" }, { id: "p1", name: "Ada" }]);
      doc.getArray("jantt_teams").insert(0, [{ id: "tm1", name: "Core" }]);
      const binding = bindJanttToYDoc(doc, { initialPlan });

      const plan = binding.getPlan();
      expect(plan.tasks).toHaveLength(0); // not empty, so not seeded
      expect(plan.people).toEqual([{ id: "p1", name: "Ada" }]);
      expect(plan.teams).toEqual([{ id: "tm1", name: "Core" }]);

      binding.updatePlan({ ...plan, people: [{ id: "p2", name: "Grace" } as any] });
      expect(binding.getPlan().people).toEqual([{ id: "p2", name: "Grace" }]);
      binding.destroy();
    });
  });

  describe("remote data hardening", () => {
    it("ignores prototype keys, non-map task entries and unsafe category colors", () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      bindJanttToYDoc(doc1, { initialPlan });
      const binding2 = bindJanttToYDoc(doc2, { onPlanChange: () => undefined });

      doc1.transact(() => {
        const t1 = doc1.getMap<Y.Map<unknown>>("jantt_tasks").get("t1")!;
        t1.set("__proto__", { _deleted: true, label: "<img src=x onerror=alert(1)>" });
        (doc1.getMap("jantt_tasks") as Y.Map<unknown>).set("bogus", "not a map");
        doc1.getMap("jantt_categories").set("evil", { label: "Evil", color: "red\" onmouseover=\"alert(1)" });
        doc1.getMap("jantt_categories").set("broken", "not an object");
      });
      expect(() => sync(doc1, doc2)).not.toThrow();

      const plan = binding2.getPlan();
      expect(plan.tasks.map((t) => t.id)).toEqual(["t1", "t2"]);
      expect(Object.getPrototypeOf(plan.tasks[0])).toBe(Object.prototype);
      expect(plan.tasks[0]._deleted).toBeUndefined();
      expect(plan.categories).toEqual({ evil: { label: "Evil" } });
      binding2.destroy();
    });
  });

  describe("change notifications", () => {
    it("fires once per remote transaction and ignores unrelated shared types", () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      bindJanttToYDoc(doc1, { initialPlan });
      const onPlanChange = vi.fn();
      const binding2 = bindJanttToYDoc(doc2, { onPlanChange });

      sync(doc1, doc2);
      expect(onPlanChange).toHaveBeenCalledTimes(1);

      doc1.getText("chat").insert(0, "hello");
      sync(doc1, doc2);
      expect(onPlanChange).toHaveBeenCalledTimes(1);

      binding2.updateTask("t1", { progress: 1 }); // local writes never echo back
      expect(onPlanChange).toHaveBeenCalledTimes(1);

      binding2.destroy();
      doc1.getMap("jantt_meta").set("title", "Changed");
      sync(doc1, doc2);
      expect(onPlanChange).toHaveBeenCalledTimes(1);
    });
  });

  describe("awareness", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("manages multi-user presence and excludes the local client from peers", () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      const awareness1 = new Awareness(doc1);
      const awareness2 = new Awareness(doc2);

      let client2PeersCount = 0;

      const binding1 = bindJanttAwareness(awareness1, {
        user: { id: "u1", name: "Alice", color: "#3b82f6" }
      });

      const onPeersChange = vi.fn((peers: Map<number, unknown>) => {
        client2PeersCount = peers.size;
      });
      const binding2 = bindJanttAwareness(awareness2, {
        user: { id: "u2", name: "Bob", color: "#10b981" },
        onPeersChange
      });

      // Alice selects task t1 and moves cursor
      binding1.selectTask("t1");
      binding1.setCursor({ date: "2026-11-03", taskIndex: 0 });
      binding1.setDragging(true, "t1");

      expect(binding1.getLocalPresence()?.selectedTaskId).toBe("t1");
      expect(binding1.getLocalPresence()?.isDragging).toBe(true);
      expect(binding1.getLocalPresence()?.draggingTaskId).toBe("t1");
      expect(binding1.getLocalPresence()?.cursor?.date).toBe("2026-11-03");

      // Bob's own updates are not peer changes
      binding2.selectTask("t2");
      expect(onPeersChange).not.toHaveBeenCalled();
      expect(binding2.getPeers().size).toBe(0);

      // Sync awareness from peer 1 to peer 2
      const update = encodeAwarenessUpdate(awareness1, [awareness1.clientID]);
      applyAwarenessUpdate(awareness2, update, null);

      expect(client2PeersCount).toBe(1);
      const peersOn2 = binding2.getPeers();
      expect(peersOn2.has(awareness2.clientID)).toBe(false);
      const aliceState = peersOn2.get(awareness1.clientID);
      expect(aliceState?.user.name).toBe("Alice");
      expect(aliceState?.selectedTaskId).toBe("t1");
      expect(aliceState?.isDragging).toBe(true);

      binding1.destroy();
      binding2.destroy();
    });

    it("skips no-op updates and throttles cursor broadcasts", () => {
      vi.useFakeTimers();
      const awareness = new Awareness(new Y.Doc());
      const binding = bindJanttAwareness(awareness, {
        user: { id: "u1", name: "Alice", color: "#3b82f6" },
        cursorThrottleMs: 50
      });
      const changes = vi.fn();
      awareness.on("change", changes);

      binding.selectTask(null); // already null
      expect(changes).not.toHaveBeenCalled();

      binding.setCursor({ taskIndex: 1 }); // leading edge: sent at once
      binding.setCursor({ taskIndex: 2 });
      binding.setCursor({ taskIndex: 3 });
      expect(changes).toHaveBeenCalledTimes(1);
      expect(binding.getLocalPresence()?.cursor).toEqual({ taskIndex: 1 });

      vi.advanceTimersByTime(50); // trailing edge: latest position only
      expect(changes).toHaveBeenCalledTimes(2);
      expect(binding.getLocalPresence()?.cursor).toEqual({ taskIndex: 3 });

      binding.setCursor({ taskIndex: 4 });
      binding.setDragging(true, "t1"); // flushes the pending cursor with it
      expect(binding.getLocalPresence()).toMatchObject({ cursor: { taskIndex: 4 }, isDragging: true });

      binding.destroy();
      expect(awareness.getLocalState()?.jantt).toBeNull();
    });
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

    // Plan-level keys outside tasks are tracked too
    undoManager.undoManager.stopCapturing();
    const plan = binding.getPlan();
    binding.updatePlan({ ...plan, people: [{ id: "p1", name: "Ada" } as any] });
    undoManager.undo();
    expect(binding.getPlan().people).toEqual([]);

    undoManager.destroy();
    binding.destroy();
  });
});
