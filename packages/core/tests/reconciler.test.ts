import { describe, it, expect } from "vitest";
import { calculatePlanHash, reconcilePlans, purgeTombstones, maintainPlanData } from "../src/reconciler";
import { JanttData } from "../src/types";

describe("Deterministic Plan Hash & 3-Way Reconciler Engine", () => {
  const basePlan: JanttData = {
    meta: {
      title: "Shared Product Roadmap",
      start: "2026-09-01",
      end: "2026-09-30",
      revision: 1
    },
    tasks: [
      {
        id: "task-1",
        label: "Architecture Spike",
        start: "2026-09-01",
        end: "2026-09-07",
        progress: 100,
        status: "completed",
        category: "engineering"
      },
      {
        id: "task-2",
        label: "UI Design & Prototyping",
        start: "2026-09-08",
        end: "2026-09-15",
        progress: 40,
        status: "in-progress",
        category: "design"
      },
      {
        id: "task-3",
        label: "API Integration",
        start: "2026-09-16",
        end: "2026-09-22",
        progress: 0,
        status: "not-started",
        category: "engineering"
      }
    ],
    notes: [
      {
        id: "note-1",
        title: "Sprint Goals",
        content: "Complete UI prototype and API contract.",
        updatedAt: "2026-09-01T10:00:00.000Z"
      }
    ],
    people: [
      { id: "p1", name: "Alice", role: "Designer" },
      { id: "p2", name: "Bob", role: "Engineer" }
    ]
  };

  it("calculates deterministic hash regardless of array ordering or key ordering", () => {
    const hash1 = calculatePlanHash(basePlan);

    // Reversed tasks array and reordered keys
    const planReordered: JanttData = {
      notes: [...basePlan.notes!],
      people: [...basePlan.people!],
      tasks: [basePlan.tasks[2], basePlan.tasks[0], basePlan.tasks[1]],
      meta: {
        revision: 1,
        end: "2026-09-30",
        title: "Shared Product Roadmap",
        start: "2026-09-01"
      }
    };

    const hash2 = calculatePlanHash(planReordered);
    expect(hash1).toBe(hash2);

    // Any modification changes the hash
    const modifiedPlan: JanttData = {
      ...basePlan,
      tasks: [
        { ...basePlan.tasks[0], progress: 50 },
        basePlan.tasks[1],
        basePlan.tasks[2]
      ]
    };
    const hash3 = calculatePlanHash(modifiedPlan);
    expect(hash3).not.toBe(hash1);
  });

  it("adopts remote plan cleanly when local made zero modifications (Trivial Sync)", () => {
    const remotePlan: JanttData = {
      ...basePlan,
      meta: { ...basePlan.meta, revision: 2 },
      tasks: [
        basePlan.tasks[0],
        { ...basePlan.tasks[1], progress: 80 }, // Collaborator moved progress to 80%
        basePlan.tasks[2]
      ]
    };

    const result = reconcilePlans(basePlan, basePlan, remotePlan);
    expect(result.hasConflicts).toBe(false);
    expect(result.remoteChanged).toBe(true);
    expect(result.localChanged).toBe(false);
    expect(result.mergedData.tasks.find((t) => t.id === "task-2")?.progress).toBe(80);
  });

  it("merges simultaneous disjoint task edits with zero data loss", () => {
    // Collaborator edited task-2 (extended end date by 3 days)
    const remotePlan: JanttData = {
      ...basePlan,
      meta: { ...basePlan.meta, revision: 2 },
      tasks: [
        basePlan.tasks[0],
        { ...basePlan.tasks[1], end: "2026-09-18" },
        basePlan.tasks[2]
      ]
    };

    // You edited task-3 (marked in-progress 50% and assigned Bob)
    const localPlan: JanttData = {
      ...basePlan,
      meta: { ...basePlan.meta, revision: 2 },
      tasks: [
        basePlan.tasks[0],
        basePlan.tasks[1],
        { ...basePlan.tasks[2], progress: 50, status: "in-progress", assignee: "Bob" }
      ]
    };

    const result = reconcilePlans(basePlan, localPlan, remotePlan);

    expect(result.hasConflicts).toBe(false);
    expect(result.summary.tasksUpdated).toBeGreaterThanOrEqual(1);

    const mergedTask2 = result.mergedData.tasks.find((t) => t.id === "task-2");
    const mergedTask3 = result.mergedData.tasks.find((t) => t.id === "task-3");

    // Collaborator's edit on Task 2 was preserved
    expect(mergedTask2?.end).toBe("2026-09-18");
    // Your edit on Task 3 was preserved
    expect(mergedTask3?.progress).toBe(50);
    expect(mergedTask3?.status).toBe("in-progress");
    expect(mergedTask3?.assignee).toBe("Bob");
  });

  it("merges field-level edits on the same task when fields do not overlap", () => {
    // Collaborator changed task-2's progress to 75%
    const remotePlan: JanttData = {
      ...basePlan,
      tasks: [
        basePlan.tasks[0],
        { ...basePlan.tasks[1], progress: 75 },
        basePlan.tasks[2]
      ]
    };

    // You added notes to task-2
    const localPlan: JanttData = {
      ...basePlan,
      tasks: [
        basePlan.tasks[0],
        { ...basePlan.tasks[1], notes: "Figma mockups approved by client." },
        basePlan.tasks[2]
      ]
    };

    const result = reconcilePlans(basePlan, localPlan, remotePlan);

    const mergedTask2 = result.mergedData.tasks.find((t) => t.id === "task-2");
    expect(mergedTask2?.progress).toBe(75); // from collaborator
    expect(mergedTask2?.notes).toBe("Figma mockups approved by client."); // from local
    expect(result.summary.fieldsMerged).toBeGreaterThanOrEqual(2);
  });

  it("protects locally modified task if remote deleted it (Zero Data Loss Resurrect)", () => {
    // Remote deleted task-2
    const remotePlan: JanttData = {
      ...basePlan,
      tasks: [basePlan.tasks[0], basePlan.tasks[2]]
    };

    // Local made an edit to task-2 before sync
    const localPlan: JanttData = {
      ...basePlan,
      tasks: [
        basePlan.tasks[0],
        { ...basePlan.tasks[1], progress: 95 },
        basePlan.tasks[2]
      ]
    };

    const result = reconcilePlans(basePlan, localPlan, remotePlan);

    // Task 2 must NOT be deleted because local had uncommitted edits
    const resurrected = result.mergedData.tasks.find((t) => t.id === "task-2");
    expect(resurrected).toBeDefined();
    expect(resurrected?.progress).toBe(95);
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts[0].type).toBe("task_deletion");
  });

  it("handles new task additions from both sides seamlessly", () => {
    // Remote added Task 4
    const remotePlan: JanttData = {
      ...basePlan,
      tasks: [
        ...basePlan.tasks,
        { id: "task-4", label: "QA Testing", category: "engineering", start: "2026-09-23", end: "2026-09-28", progress: 0 }
      ]
    };

    // Local added Task 5
    const localPlan: JanttData = {
      ...basePlan,
      tasks: [
        ...basePlan.tasks,
        { id: "task-5", label: "Security Audit", category: "engineering", start: "2026-09-25", end: "2026-09-30", progress: 0 }
      ]
    };

    const result = reconcilePlans(basePlan, localPlan, remotePlan);

    expect(result.mergedData.tasks.length).toBe(5);
    expect(result.mergedData.tasks.find((t) => t.id === "task-4")).toBeDefined();
    expect(result.mergedData.tasks.find((t) => t.id === "task-5")).toBeDefined();
    expect(result.summary.tasksAdded).toBe(2);
  });

  it("reconciles project notes by updatedAt and merges new notes", () => {
    const remotePlan: JanttData = {
      ...basePlan,
      notes: [
        {
          id: "note-1",
          title: "Sprint Goals",
          content: "Updated content from collaborator.",
          updatedAt: "2026-09-02T12:00:00.000Z"
        },
        {
          id: "note-2",
          title: "Client Feedback",
          content: "Great job on milestone 1.",
          updatedAt: "2026-09-02T13:00:00.000Z"
        }
      ]
    };

    const localPlan: JanttData = {
      ...basePlan,
      notes: [
        basePlan.notes![0],
        {
          id: "note-3",
          title: "Dev Setup",
          content: "Run npm install --frozen-lockfile",
          updatedAt: "2026-09-02T11:00:00.000Z"
        }
      ]
    };

    const result = reconcilePlans(basePlan, localPlan, remotePlan);
    expect(result.mergedData.notes?.length).toBe(3);
    const note1 = result.mergedData.notes?.find((n) => n.id === "note-1");
    expect(note1?.content).toBe("Updated content from collaborator.");
    expect(result.mergedData.notes?.find((n) => n.id === "note-2")).toBeDefined();
    expect(result.mergedData.notes?.find((n) => n.id === "note-3")).toBeDefined();
  });

  it("proves mathematical commutativity: Merge(A, B) === Merge(B, A)", () => {
    const planA: JanttData = {
      ...basePlan,
      tasks: [
        {
          ...basePlan.tasks[0],
          progress: 60,
          fieldTimestamps: { progress: "2026-09-05T12:00:00.000Z#user-A" }
        },
        basePlan.tasks[1],
        basePlan.tasks[2]
      ]
    };

    const planB: JanttData = {
      ...basePlan,
      tasks: [
        {
          ...basePlan.tasks[0],
          progress: 80,
          fieldTimestamps: { progress: "2026-09-05T12:05:00.000Z#user-B" }
        },
        basePlan.tasks[1],
        basePlan.tasks[2]
      ]
    };

    const mergeAB = reconcilePlans(null, planA, planB, { clientId: "arbiter" });
    const mergeBA = reconcilePlans(null, planB, planA, { clientId: "arbiter" });

    // In both orders, user-B's progress=80 must win because timestamp 12:05 > 12:00
    const taskAB = mergeAB.mergedData.tasks.find((t) => t.id === "task-1");
    const taskBA = mergeBA.mergedData.tasks.find((t) => t.id === "task-1");

    expect(taskAB?.progress).toBe(80);
    expect(taskBA?.progress).toBe(80);
    expect(calculatePlanHash(mergeAB.mergedData)).toBe(calculatePlanHash(mergeBA.mergedData));
  });

  it("proves mathematical associativity: Merge(Merge(A, B), C) === Merge(A, Merge(B, C))", () => {
    const planA: JanttData = {
      ...basePlan,
      tasks: [
        {
          ...basePlan.tasks[0],
          end: "2026-09-08",
          fieldTimestamps: { end: "2026-09-05T10:00:00.000Z#user-A" }
        },
        basePlan.tasks[1],
        basePlan.tasks[2]
      ]
    };

    const planB: JanttData = {
      ...basePlan,
      tasks: [
        {
          ...basePlan.tasks[0],
          end: "2026-09-12",
          fieldTimestamps: { end: "2026-09-05T11:00:00.000Z#user-B" }
        },
        basePlan.tasks[1],
        basePlan.tasks[2]
      ]
    };

    const planC: JanttData = {
      ...basePlan,
      tasks: [
        {
          ...basePlan.tasks[0],
          end: "2026-09-15",
          fieldTimestamps: { end: "2026-09-05T12:00:00.000Z#user-C" }
        },
        basePlan.tasks[1],
        basePlan.tasks[2]
      ]
    };

    // (A + B) + C
    const ab = reconcilePlans(null, planA, planB, { clientId: "arbiter" }).mergedData;
    const ab_c = reconcilePlans(null, ab, planC, { clientId: "arbiter" }).mergedData;

    // A + (B + C)
    const bc = reconcilePlans(null, planB, planC, { clientId: "arbiter" }).mergedData;
    const a_bc = reconcilePlans(null, planA, bc, { clientId: "arbiter" }).mergedData;

    // C's edit (end: 2026-09-15) must win in both associative combinations
    expect(ab_c.tasks.find((t) => t.id === "task-1")?.end).toBe("2026-09-15");
    expect(a_bc.tasks.find((t) => t.id === "task-1")?.end).toBe("2026-09-15");
    expect(calculatePlanHash(ab_c)).toBe(calculatePlanHash(a_bc));
  });

  it("handles 10-party concurrent divergence with zero data loss", () => {
    // 10 users diverge concurrently from basePlan
    const userPlans: JanttData[] = [];

    // User 0: adds task-100
    userPlans.push({
      ...basePlan,
      tasks: [...basePlan.tasks, { id: "task-100", label: "User 0 Task", category: "dev", start: "2026-09-10", end: "2026-09-15" }]
    });

    // User 1: updates task-1 label
    userPlans.push({
      ...basePlan,
      tasks: [
        { ...basePlan.tasks[0], label: "Architecture Spike v2", fieldTimestamps: { label: "2026-09-05T10:01:00.000Z#u1" } },
        basePlan.tasks[1],
        basePlan.tasks[2]
      ]
    });

    // User 2: updates task-2 progress to 90%
    userPlans.push({
      ...basePlan,
      tasks: [
        basePlan.tasks[0],
        { ...basePlan.tasks[1], progress: 90, fieldTimestamps: { progress: "2026-09-05T10:02:00.000Z#u2" } },
        basePlan.tasks[2]
      ]
    });

    // User 3: assigns task-3 to "Alice"
    userPlans.push({
      ...basePlan,
      tasks: [
        basePlan.tasks[0],
        basePlan.tasks[1],
        { ...basePlan.tasks[2], assignee: "Alice", fieldTimestamps: { assignee: "2026-09-05T10:03:00.000Z#u3" } }
      ]
    });

    // User 4: adds note-2
    userPlans.push({
      ...basePlan,
      notes: [...basePlan.notes!, { id: "note-2", title: "Note from User 4", content: "Architecture verified." }]
    });

    // User 5: adds person "Charlie"
    userPlans.push({
      ...basePlan,
      people: [...basePlan.people!, { id: "p3", name: "Charlie", role: "DevOps" }]
    });

    // User 6: updates task-1 color
    userPlans.push({
      ...basePlan,
      tasks: [
        { ...basePlan.tasks[0], color: "#10B981", fieldTimestamps: { color: "2026-09-05T10:06:00.000Z#u6" } },
        basePlan.tasks[1],
        basePlan.tasks[2]
      ]
    });

    // User 7: sets task-2 status to completed
    userPlans.push({
      ...basePlan,
      tasks: [
        basePlan.tasks[0],
        { ...basePlan.tasks[1], status: "completed", fieldTimestamps: { status: "2026-09-05T10:07:00.000Z#u7" } },
        basePlan.tasks[2]
      ]
    });

    // User 8: adds task-101
    userPlans.push({
      ...basePlan,
      tasks: [...basePlan.tasks, { id: "task-101", label: "User 8 Task", category: "qa", start: "2026-09-20", end: "2026-09-25" }]
    });

    // User 9: sets task-3 notes
    userPlans.push({
      ...basePlan,
      tasks: [
        basePlan.tasks[0],
        basePlan.tasks[1],
        { ...basePlan.tasks[2], notes: "Integration spec delivered", fieldTimestamps: { notes: "2026-09-05T10:09:00.000Z#u9" } }
      ]
    });

    // Merge all 10 plans sequentially
    let merged = basePlan;
    for (const plan of userPlans) {
      merged = reconcilePlans(basePlan, merged, plan, { clientId: "coordinator" }).mergedData;
    }

    // Verify ZERO data loss across all 10 collaborators:
    expect(merged.tasks.find((t) => t.id === "task-100")).toBeDefined(); // from User 0
    expect(merged.tasks.find((t) => t.id === "task-1")?.label).toBe("Architecture Spike v2"); // from User 1
    expect(merged.tasks.find((t) => t.id === "task-2")?.progress).toBe(90); // from User 2
    expect(merged.tasks.find((t) => t.id === "task-3")?.assignee).toBe("Alice"); // from User 3
    expect(merged.notes?.find((n) => n.id === "note-2")).toBeDefined(); // from User 4
    expect(merged.people?.find((p) => p.id === "p3")).toBeDefined(); // from User 5
    expect(merged.tasks.find((t) => t.id === "task-1")?.color).toBe("#10B981"); // from User 6
    expect(merged.tasks.find((t) => t.id === "task-2")?.status).toBe("completed"); // from User 7
    expect(merged.tasks.find((t) => t.id === "task-101")).toBeDefined(); // from User 8
    expect(merged.tasks.find((t) => t.id === "task-3")?.notes).toBe("Integration spec delivered"); // from User 9
  });

  it("guarantees 40-party convergence invariance regardless of merge arrival order", () => {
    // Generate 40 collaborator plans, each applying non-conflicting or LWW-ordered modifications
    const collaboratorPlans: JanttData[] = [];

    for (let i = 0; i < 40; i++) {
      const timestamp = `2026-09-05T15:${String(i).padStart(2, "0")}:00.000Z#user-${i}`;
      const plan: JanttData = {
        ...basePlan,
        tasks: [
          // All 40 users touch progress on task-1, with later users having higher timestamps
          {
            ...basePlan.tasks[0],
            progress: i,
            fieldTimestamps: { progress: timestamp }
          },
          // Each user adds a unique task
          ...basePlan.tasks.slice(1),
          {
            id: `task-collab-${i}`,
            label: `Task by User ${i}`,
            category: "dev",
            start: "2026-09-10",
            end: "2026-09-20",
            progress: 0,
            status: "not-started"
          }
        ]
      };
      collaboratorPlans.push(plan);
    }

    // Permutation 1: Natural order 0..39
    let mergedPerm1 = basePlan;
    for (let i = 0; i < 40; i++) {
      mergedPerm1 = reconcilePlans(basePlan, mergedPerm1, collaboratorPlans[i], { clientId: "serverless" }).mergedData;
    }

    // Permutation 2: Reverse order 39..0
    let mergedPerm2 = basePlan;
    for (let i = 39; i >= 0; i--) {
      mergedPerm2 = reconcilePlans(basePlan, mergedPerm2, collaboratorPlans[i], { clientId: "serverless" }).mergedData;
    }

    // Permutation 3: Interleaved odd then even
    let mergedPerm3 = basePlan;
    for (let i = 1; i < 40; i += 2) {
      mergedPerm3 = reconcilePlans(basePlan, mergedPerm3, collaboratorPlans[i], { clientId: "serverless" }).mergedData;
    }
    for (let i = 0; i < 40; i += 2) {
      mergedPerm3 = reconcilePlans(basePlan, mergedPerm3, collaboratorPlans[i], { clientId: "serverless" }).mergedData;
    }

    // Mathematical Convergence Guarantee:
    // User 39 had the highest timestamp (15:39 > 15:38... > 15:00), so progress must be 39 in all 3 permutations!
    expect(mergedPerm1.tasks.find((t) => t.id === "task-1")?.progress).toBe(39);
    expect(mergedPerm2.tasks.find((t) => t.id === "task-1")?.progress).toBe(39);
    expect(mergedPerm3.tasks.find((t) => t.id === "task-1")?.progress).toBe(39);

    // All 40 added tasks must be present in all 3 permutations
    expect(mergedPerm1.tasks.length).toBe(3 + 40);
    expect(mergedPerm2.tasks.length).toBe(3 + 40);
    expect(mergedPerm3.tasks.length).toBe(3 + 40);

    // Hash equality proves bit-level deterministic convergence!
    const hash1 = calculatePlanHash(mergedPerm1);
    const hash2 = calculatePlanHash(mergedPerm2);
    const hash3 = calculatePlanHash(mergedPerm3);

    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });

  it("handles tombstone lifecycle: resurrection on post-deletion edit and clean tombstone purging", () => {
    // User A deletes task-2 at 12:00
    const userAPlan: JanttData = {
      ...basePlan,
      tasks: [
        basePlan.tasks[0],
        { ...basePlan.tasks[1], _deleted: true, deletedAt: "2026-09-05T12:00:00.000Z#user-A" },
        basePlan.tasks[2]
      ]
    };

    // User B edits task-2 at 12:15 (AFTER User A deleted it)
    const userBPlan: JanttData = {
      ...basePlan,
      tasks: [
        basePlan.tasks[0],
        {
          ...basePlan.tasks[1],
          progress: 99,
          fieldTimestamps: { progress: "2026-09-05T12:15:00.000Z#user-B" }
        },
        basePlan.tasks[2]
      ]
    };

    const res = reconcilePlans(basePlan, userAPlan, userBPlan);
    const resurrectedTask2 = res.mergedData.tasks.find((t) => t.id === "task-2");

    // Task 2 must be resurrected with _deleted: false because User B's edits happened after deletion
    expect(resurrectedTask2?._deleted).toBeFalsy();
    expect(resurrectedTask2?.progress).toBe(99);

    // Test Tombstone Purging of expired items
    const planWithOldTombstone: JanttData = {
      ...basePlan,
      tasks: [
        basePlan.tasks[0],
        { ...basePlan.tasks[1], _deleted: true, deletedAt: "2020-01-01T00:00:00.000Z#old" }
      ]
    };

    const purged = purgeTombstones(planWithOldTombstone, 30);
    expect(purged.tasks.find((t) => t.id === "task-2")).toBeUndefined();
    expect(purged.tasks.length).toBe(1);
  });

  it("cleanly prunes dangling dependencies when predecessor tasks are deleted", () => {
    const planWithDeps: JanttData = {
      ...basePlan,
      tasks: [
        { id: "t1", label: "Task 1", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "t2", label: "Task 2", category: "dev", start: "2026-09-06", end: "2026-09-10", dependsOn: "t1" },
        { id: "t3", label: "Task 3", category: "dev", start: "2026-09-11", end: "2026-09-15", dependsOn: ["t1", "t2"] }
      ]
    };

    // User A deletes task t1
    const userAPlan: JanttData = {
      ...planWithDeps,
      tasks: [
        { id: "t1", label: "Task 1", category: "dev", start: "2026-09-01", end: "2026-09-05", _deleted: true, deletedAt: "2026-09-05T12:00:00.000Z#user-A" },
        planWithDeps.tasks[1],
        planWithDeps.tasks[2]
      ]
    };

    const res = reconcilePlans(planWithDeps, userAPlan, planWithDeps, { clientId: "arbiter" });
    expect(res.mergedData.tasks.find((t) => t.id === "t1")).toBeUndefined();
    expect(res.mergedData.meta?.tombstones?.["t1"]).toBeDefined();

    // t2 had dependsOn: "t1" -> should now be null
    const t2 = res.mergedData.tasks.find((t) => t.id === "t2");
    expect(t2?.dependsOn).toBeNull();

    // t3 had dependsOn: ["t1", "t2"] -> should now be "t2"
    const t3 = res.mergedData.tasks.find((t) => t.id === "t3");
    expect(t3?.dependsOn).toBe("t2");
  });

  it("performs autonomous JSON maintenance: prunes expired tombstones, caps bloat, strips empty timestamps", () => {
    const bloatedPlan: JanttData = {
      meta: {
        title: "Bloated Plan",
        tombstones: {
          "ancient-1": { deletedAt: "2020-01-01T00:00:00.000Z#peer1", entityType: "task" },
          "fresh-1": { deletedAt: "2026-09-05T12:00:00.000Z#peer2", entityType: "task" }
        }
      },
      tasks: [
        {
          id: "active-1",
          label: "Active Task",
          category: "dev",
          start: "2026-09-01",
          end: "2026-09-05",
          dependsOn: "ancient-1", // Dangling dependency on pruned tombstone
          fieldTimestamps: {} // Empty timestamp dictionary (bloat)
        }
      ]
    };

    const maintained = maintainPlanData(bloatedPlan, { maxAgeDays: 30, maxTombstones: 50 });

    // Ancient tombstone pruned
    expect(maintained.meta?.tombstones?.["ancient-1"]).toBeUndefined();
    // Fresh tombstone retained
    expect(maintained.meta?.tombstones?.["fresh-1"]).toBeDefined();
    // Dangling dependency pruned
    expect(maintained.tasks[0].dependsOn).toBeNull();
    // Empty fieldTimestamps stripped
    expect(maintained.tasks[0].fieldTimestamps).toBeUndefined();
    // Canonical hash computed
    expect(maintained.meta?.contentHash).toBeDefined();
    expect(maintained.meta?.contentHash?.length).toBe(16);
  });
});
