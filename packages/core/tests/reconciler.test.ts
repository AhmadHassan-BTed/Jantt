import { describe, it, expect } from "vitest";
import {
  calculatePlanHash,
  reconcilePlans,
  mergePlansCommutative,
  purgeTombstones,
  maintainPlanData,
  compareCompositeTimestamps,
  areTasksIdentical,
  stampTaskFieldTimestamps
} from "../src/reconciliation";
import { getTaskDependencyRelations } from "../src/dependencies";
import { cleanPlanForSharing, sanitizePlanForJson } from "../src/share-coder";
import { JanttData, Task } from "../src/types";

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
        { id: "t1", label: "Task 1", category: "dev", start: "2026-09-01", end: "2026-09-05", _deleted: true, deletedAt: `${new Date().toISOString()}#user-A` },
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

    // t3 had dependsOn: ["t1", "t2"] -> only the link to t2 remains
    const t3 = res.mergedData.tasks.find((t) => t.id === "t3");
    expect(getTaskDependencyRelations(t3).map((rel) => rel.id)).toEqual(["t2"]);
  });

  it("performs autonomous JSON maintenance: prunes expired tombstones, caps bloat, strips empty timestamps", () => {
    const bloatedPlan: JanttData = {
      meta: {
        title: "Bloated Plan",
        tombstones: {
          "ancient-1": { deletedAt: "2020-01-01T00:00:00.000Z#peer1", entityType: "task" },
          "fresh-1": { deletedAt: `${new Date().toISOString()}#peer2`, entityType: "task" }
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

// ─── Regression coverage for the merge, hash and tombstone rules ──────────────

const T0 = "2026-09-01T09:00:00.000Z";
const T1 = "2026-09-02T09:00:00.000Z";
const T2 = "2026-09-03T09:00:00.000Z";

function task(id: string, extra: Partial<Task> = {}): Task {
  return { id, label: `Task ${id}`, category: "dev", start: "2026-09-01", end: "2026-09-05", ...extra };
}

function plan(tasks: Task[], extra: Partial<JanttData> = {}): JanttData {
  return { meta: { title: "Plan" }, categories: { dev: { label: "Dev", color: "#38BDF8" } }, tasks, ...extra };
}

const byId = (data: JanttData, id: string) => data.tasks.find((t) => t.id === id);

describe("calculatePlanHash covers every persisted field", () => {
  const base = plan([task("t1", { dependsOn: null }), task("t2", { dependsOn: "t1" })], {
    notes: [{ id: "n1", title: "Note", content: "Body" }],
    people: [{ id: "p1", name: "Ana", username: "@ana" }]
  });
  const baseHash = calculatePlanHash(base);
  const edit = (mutate: (copy: JanttData) => void) => {
    const copy: JanttData = JSON.parse(JSON.stringify(base));
    mutate(copy);
    return calculatePlanHash(copy);
  };

  it.each([
    ["task priority", (p: JanttData) => (p.tasks[0].priority = "high")],
    ["task milestone", (p: JanttData) => (p.tasks[0].milestone = true)],
    ["task baseline", (p: JanttData) => (p.tasks[0].baseline = { start: "2026-09-01", end: "2026-09-02" })],
    ["task teamId", (p: JanttData) => (p.tasks[0].teamId = "team-a")],
    ["task custom fields", (p: JanttData) => (p.tasks[0].fields = { risk: "high" })],
    ["dependency type", (p: JanttData) => (p.tasks[1].dependsOn = [{ id: "t1", type: "SS" }])],
    ["dependency lag", (p: JanttData) => (p.tasks[1].dependsOn = "t1:FS+2d")],
    ["meta.showCriticalPath", (p: JanttData) => (p.meta!.showCriticalPath = true)],
    ["note pinned", (p: JanttData) => (p.notes![0].pinned = true)],
    ["note tags", (p: JanttData) => (p.notes![0].tags = ["ops"])],
    ["person role", (p: JanttData) => (p.people![0].role = "Lead")],
    ["documents", (p: JanttData) => (p.documents = [{ id: "d1", label: "Spec" }])]
  ])("changes when only the %s changes", (_name, mutate) => {
    expect(edit(mutate)).not.toBe(baseHash);
  });

  it("ignores CRDT bookkeeping, key order and values the Realtime Database drops", () => {
    expect(
      edit((p) => {
        p.meta!.revision = 9;
        p.meta!.updatedAt = T2;
        p.meta!.sync = { revision: 9, contentHash: "x", updatedAt: T2 };
        p.meta!.tombstones = { gone: { deletedAt: T1, entityType: "task" } };
        p.tasks[0].fieldTimestamps = { label: `${T1}#peer` };
        p.tasks[0].updatedAt = T1;
        p.tasks[0].updatedBy = "peer";
        p.tasks[1].dependsOn = ["t1"];
        p.tasks.push(task("old", { _deleted: true, deletedAt: T0 }));
        p.teams = [];
        (p.tasks[0] as any).assignees = [];
        p.categories = { dev: { color: "#38BDF8", label: "Dev" } };
      })
    ).toBe(baseHash);
  });

  it("matches the shared-link and sanitized copies of the same plan", () => {
    const withDefaults = plan([task("t1", { progress: 0, status: "not-started", milestone: false, notes: "" })], {
      people: [{ id: "p1", name: "Ana", username: "ana" }]
    });
    const hash = calculatePlanHash(withDefaults);
    expect(calculatePlanHash(cleanPlanForSharing(withDefaults))).toBe(hash);
    expect(calculatePlanHash(sanitizePlanForJson(withDefaults))).toBe(hash);
  });
});

describe("field-level 3-way merge", () => {
  it("keeps a remote edit of a field the local side never touched, even with a newer local updatedAt", () => {
    const base = plan([task("t1", { progress: 0.1 })]);
    const remote = plan([
      task("t1", { progress: 0.1, assignee: "ana", updatedAt: T1, fieldTimestamps: { assignee: `${T1}#r` } })
    ]);
    const local = plan([task("t1", { progress: 0.5, updatedAt: T2, fieldTimestamps: { progress: `${T2}#l` } })]);

    const merged = reconcilePlans(base, local, remote).mergedData;
    expect(byId(merged, "t1")?.assignee).toBe("ana");
    expect(byId(merged, "t1")?.progress).toBe(0.5);
  });

  it("merges every task key, not just the PM field list", () => {
    const base = plan([task("t1")]);
    const remote = plan([
      task("t1", {
        priority: "high",
        teamId: "t-a",
        description: "Spec",
        fields: { risk: 3 },
        baseline: { start: "2026-09-01", end: "2026-09-04" }
      })
    ]);
    const local = plan([task("t1", { label: "Renamed" })]);

    const ab = reconcilePlans(base, local, remote).mergedData;
    const ba = reconcilePlans(base, remote, local).mergedData;
    expect(byId(ab, "t1")).toMatchObject({
      label: "Renamed",
      priority: "high",
      teamId: "t-a",
      description: "Spec",
      fields: { risk: 3 }
    });
    expect(calculatePlanHash(ab)).toBe(calculatePlanHash(ba));
  });

  it("records a conflict when both sides change the same field and keeps the newer stamp", () => {
    const base = plan([task("t1", { priority: "low" })]);
    const local = plan([task("t1", { priority: "medium", fieldTimestamps: { priority: `${T1}#l` } })]);
    const remote = plan([task("t1", { priority: "high", fieldTimestamps: { priority: `${T2}#r` } })]);

    const result = reconcilePlans(base, local, remote);
    expect(byId(result.mergedData, "t1")?.priority).toBe("high");
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts[0]).toMatchObject({
      type: "task_field",
      field: "priority",
      localValue: "medium",
      resolution: "remote"
    });
  });

  it("lets an unassignment stick and keeps concurrent additions from both sides", () => {
    const base = plan([task("t1", { assignees: ["ana", "bob"] })]);
    const unassigned = reconcilePlans(base, plan([task("t1", { assignees: ["ana"] })]), base).mergedData;
    expect(byId(unassigned, "t1")?.assignees).toEqual(["ana"]);

    const local = plan([task("t1", { assignees: ["ana", "bob", "cy"] })]);
    const remote = plan([task("t1", { assignees: ["bob", "dee"] })]);
    expect(byId(reconcilePlans(base, local, remote).mergedData, "t1")?.assignees).toEqual(["bob", "cy", "dee"]);
  });

  it("converges on ties and on edits without timestamps, whichever side is local", () => {
    const base = plan([task("t1", { label: "Base" })]);
    const a = plan([task("t1", { label: "Alpha", fieldTimestamps: { label: `${T1}#same` } })]);
    const b = plan([task("t1", { label: "Beta", fieldTimestamps: { label: `${T1}#same` } })]);
    const ab = reconcilePlans(base, a, b).mergedData;
    const ba = reconcilePlans(base, b, a).mergedData;
    expect(byId(ab, "t1")?.label).toBe(byId(ba, "t1")?.label);
    expect(calculatePlanHash(ab)).toBe(calculatePlanHash(ba));

    const c = plan([task("t1", { label: "Gamma" })]);
    const d = plan([task("t1", { label: "Delta" })]);
    expect(calculatePlanHash(mergePlansCommutative(c, d).mergedData)).toBe(
      calculatePlanHash(mergePlansCommutative(d, c).mergedData)
    );
  });

  it("is commutative and keeps every edit only one side made, across random concurrent edits", () => {
    let seed = 42;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const fields = ["label", "priority", "progress", "status", "notes", "color", "wbs", "phase"] as const;
    const base = plan(Array.from({ length: 8 }, (_, i) => task(`t${i}`, { wbs: `${i}` })));

    for (let round = 0; round < 40; round++) {
      const a: JanttData = JSON.parse(JSON.stringify(base));
      const b: JanttData = JSON.parse(JSON.stringify(base));
      for (let i = 0; i < 6; i++) {
        const target = Math.floor(random() * base.tasks.length);
        const field = fields[Math.floor(random() * fields.length)];
        const side = random() < 0.5 ? a : b;
        const value = field === "progress" ? Math.round(random() * 100) / 100 : `v${round}-${i}`;
        (side.tasks[target] as any)[field] = value;
        const ts = `2026-09-${String(10 + i).padStart(2, "0")}T00:00:00.000Z#${side === a ? "a" : "b"}`;
        side.tasks[target].fieldTimestamps = { ...(side.tasks[target].fieldTimestamps || {}), [field]: ts };
      }

      const ab = reconcilePlans(base, a, b).mergedData;
      const ba = reconcilePlans(base, b, a).mergedData;
      expect(calculatePlanHash(ab)).toBe(calculatePlanHash(ba));

      for (let t = 0; t < base.tasks.length; t++) {
        for (const field of fields) {
          const aTouched = Boolean(a.tasks[t].fieldTimestamps?.[field]);
          const bTouched = Boolean(b.tasks[t].fieldTimestamps?.[field]);
          if (aTouched === bTouched) continue;
          const expected = (aTouched ? a : b).tasks[t][field];
          expect((byId(ab, base.tasks[t].id) as any)[field]).toEqual(expected);
        }
      }
    }
  });
});

describe("collections and meta merge 3-way", () => {
  const base = plan([task("t1")], {
    meta: { title: "Roadmap", scale: "day" },
    people: [
      { id: "p1", name: "Ana" },
      { id: "p2", name: "Bob" }
    ],
    teams: [{ id: "team-a", name: "Alpha" }],
    categories: { dev: { label: "Dev", color: "#38BDF8" }, ops: { label: "Ops", color: "#10B981" } },
    documents: [{ id: "d1", label: "Spec" }]
  });

  it("keeps a local title rename and a remote scale change", () => {
    const local = { ...base, meta: { ...base.meta, title: "Roadmap v2" } };
    const remote = { ...base, meta: { ...base.meta, scale: "week" as const, showCriticalPath: true } };
    const merged = reconcilePlans(base, local, remote).mergedData;
    expect(merged.meta).toMatchObject({ title: "Roadmap v2", scale: "week", showCriticalPath: true });
  });

  it("keeps renames and lets deletions of people, teams, categories and documents stick", () => {
    const local: JanttData = {
      ...base,
      people: [{ id: "p1", name: "Ana Maria" }],
      teams: [],
      categories: { dev: base.categories!.dev },
      documents: [
        { id: "d1", label: "Spec" },
        { id: "d2", label: "Notes" }
      ]
    };
    const merged = reconcilePlans(base, local, base).mergedData;
    expect(merged.people).toEqual([{ id: "p1", name: "Ana Maria" }]);
    expect(merged.teams).toEqual([]);
    expect(Object.keys(merged.categories!)).toEqual(["dev"]);
    expect(merged.documents?.map((d) => d.id)).toEqual(["d1", "d2"]);
  });

  it("keeps a person edited on one side and removed on the other, with a conflict", () => {
    const local: JanttData = { ...base, people: [{ id: "p1", name: "Ana" }] };
    const remote: JanttData = {
      ...base,
      people: [
        { id: "p1", name: "Ana" },
        { id: "p2", name: "Bob", role: "QA" }
      ]
    };
    const result = reconcilePlans(base, local, remote);
    expect(result.mergedData.people?.find((p) => p.id === "p2")?.role).toBe("QA");
    expect(result.conflicts.some((c) => c.entityId === "people/p2")).toBe(true);
  });

  it("merges notes field by field", () => {
    const withNote = (note: Record<string, unknown>) =>
      ({ ...base, notes: [{ id: "n1", title: "Kickoff", content: "Agenda", ...note }] }) as JanttData;
    const noteBase = withNote({});
    const local = withNote({ pinned: true, tags: ["ops"], title: "Kickoff (final)" });
    const remote = withNote({ content: "Agenda + budget", color: "#EF4444" });
    const note = reconcilePlans(noteBase, local, remote).mergedData.notes?.[0];
    expect(note).toMatchObject({
      title: "Kickoff (final)",
      content: "Agenda + budget",
      pinned: true,
      tags: ["ops"],
      color: "#EF4444"
    });
  });
});

describe("tombstones and deletions", () => {
  it("does not resurrect a deleted task from a stale peer in a 2-way merge", () => {
    // Recent times: tombstones older than 30 days are purged by design.
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
    const deleted = plan([task("t2")], {
      meta: { title: "Plan", tombstones: { t1: { deletedAt: `${minutesAgo(30)}#a`, entityType: "task" } } }
    });
    const stale = plan([task("t1", { updatedAt: minutesAgo(60) }), task("t2")]);
    const ab = mergePlansCommutative(deleted, stale).mergedData;
    const ba = mergePlansCommutative(stale, deleted).mergedData;
    expect(byId(ab, "t1")).toBeUndefined();
    expect(byId(ba, "t1")).toBeUndefined();
    expect(ab.meta?.tombstones?.t1).toBeDefined();

    const editedLater = plan([
      task("t1", { label: "Revived", fieldTimestamps: { label: `${minutesAgo(5)}#b` } }),
      task("t2")
    ]);
    const revived = mergePlansCommutative(deleted, editedLater).mergedData;
    expect(byId(revived, "t1")?.label).toBe("Revived");
    expect(revived.meta?.tombstones?.t1).toBeUndefined();
  });

  it("lets a delete beat an untouched copy but keeps a concurrent edit of priority", () => {
    const base = plan([task("t1"), task("t2")]);
    const remote = plan([task("t2")]);
    expect(byId(reconcilePlans(base, base, remote).mergedData, "t1")).toBeUndefined();

    const local = plan([task("t1", { priority: "urgent" }), task("t2")]);
    const result = reconcilePlans(base, local, remote);
    expect(byId(result.mergedData, "t1")?.priority).toBe("urgent");
    expect(result.conflicts[0].type).toBe("task_deletion");
  });

  it("keeps a task that a merge kept over a deletion when the deleter merges again", () => {
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
    const base = plan([task("t1"), task("t2")]);
    // Deleted at -10 min; a collaborator edited t1 concurrently at -20 min (before the deletion).
    const deleter = plan([task("t2")], {
      meta: { title: "Plan", tombstones: { t1: { deletedAt: `${minutesAgo(10)}#a`, entityType: "task" } } }
    });
    const editor = plan([task("t1", { priority: "high", updatedAt: minutesAgo(20) }), task("t2")]);
    const server = reconcilePlans(base, editor, deleter).mergedData;
    expect(byId(server, "t1")?.priority).toBe("high");

    // The deleter made another edit meanwhile and merges the server copy against its last save.
    const deleterLater = { ...deleter, tasks: [task("t2", { label: "Renamed" })] };
    for (const merged of [
      reconcilePlans(deleter, deleterLater, server).mergedData,
      reconcilePlans(deleter, server, deleterLater).mergedData
    ]) {
      expect(byId(merged, "t1")?.priority).toBe("high");
      expect(byId(merged, "t2")?.label).toBe("Renamed");
      expect(merged.meta?.tombstones?.t1).toBeUndefined();
    }

    // Deleting it again after that still wins.
    const deletedAgain = plan([task("t2")], {
      meta: { title: "Plan", tombstones: { t1: { deletedAt: `${minutesAgo(1)}#a`, entityType: "task" } } }
    });
    expect(byId(reconcilePlans(deleter, deletedAgain, server).mergedData, "t1")).toBeUndefined();

    // A task undone on one side (live again, stale tombstone left behind) is not dropped while both sides have it.
    const undone = plan([task("t1"), task("t2")], {
      meta: { title: "Plan", tombstones: { t1: { deletedAt: `${minutesAgo(5)}#a`, entityType: "task" } } }
    });
    expect(byId(reconcilePlans(base, undone, base).mergedData, "t1")).toBeDefined();
  });

  it("dates an undated soft delete by its plan's last save, so later edits elsewhere survive", () => {
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
    const deleter = plan([task("t1", { _deleted: true })], { meta: { title: "Plan", updatedAt: minutesAgo(60) } });
    const editedLater = plan([task("t1", { label: "Edited", updatedAt: minutesAgo(1) })]);
    const staleEdit = plan([task("t1", { label: "Edited", updatedAt: minutesAgo(90) })]);
    expect(byId(mergePlansCommutative(deleter, editedLater).mergedData, "t1")?.label).toBe("Edited");
    expect(byId(mergePlansCommutative(deleter, staleEdit).mergedData, "t1")).toBeUndefined();

    // Against a base holding the same undated soft delete, a copy brought back on one side stays.
    const savedLater = { ...deleter, meta: { title: "Plan", updatedAt: minutesAgo(30) } };
    expect(byId(reconcilePlans(deleter, savedLater, staleEdit).mergedData, "t1")?.label).toBe("Edited");
    expect(byId(reconcilePlans(deleter, staleEdit, savedLater).mergedData, "t1")?.label).toBe("Edited");
  });

  it("reuses the recorded deletion time and keeps more than 50 tombstones", () => {
    const ids = Array.from({ length: 120 }, (_, i) => `t${i}`);
    const base = plan(ids.map((id) => task(id)));
    const tombstones = Object.fromEntries(ids.map((id) => [id, { deletedAt: `${T1}#a`, entityType: "task" }]));
    const local = plan([], { meta: { title: "Plan", tombstones } });
    const merged = reconcilePlans(base, local, base, { tombstoneMaxAgeDays: 100000 }).mergedData;
    expect(merged.tasks).toHaveLength(0);
    expect(Object.keys(merged.meta?.tombstones || {})).toHaveLength(120);
    expect(merged.meta?.tombstones?.t0.deletedAt).toBe(`${T1}#a`);
  });

  it("prunes links to deleted tasks in every syntax and keeps object links", () => {
    const base = plan([
      task("gone"),
      task("keep"),
      task("a", {
        dependsOn: [
          { id: "keep", type: "SS", lag: 1 },
          { id: "gone", type: "FF" }
        ]
      }),
      task("b", { dependsOn: "gone:FS+2d; keep" }),
      task("c", { dependsOn: [{ id: "keep", type: "SF" }] })
    ]);
    // A collaborator deleted "gone" (the app records a tombstone) while this side added a task.
    const remote = plan(
      base.tasks.filter((t) => t.id !== "gone"),
      { meta: { title: "Plan", tombstones: { gone: { deletedAt: new Date().toISOString(), entityType: "task" } } } }
    );
    const local = { ...base, tasks: [...base.tasks, task("new")] };
    const merged = reconcilePlans(base, local, remote).mergedData;
    expect(byId(merged, "gone")).toBeUndefined();
    expect(byId(merged, "new")).toBeDefined();
    expect(getTaskDependencyRelations(byId(merged, "a"))).toEqual([
      expect.objectContaining({ id: "keep", type: "SS", lagDays: 1 })
    ]);
    expect(getTaskDependencyRelations(byId(merged, "b")).map((r) => r.id)).toEqual(["keep"]);
    expect(byId(merged, "c")?.dependsOn).toEqual([{ id: "keep", type: "SF" }]);
  });

  it("survives malformed tombstones and timestamps from untrusted plans", () => {
    const poisoned: any = plan([task("t1", { fieldTimestamps: { label: true as any }, updatedAt: 42 as any })], {
      meta: { title: "Plan", tombstones: { t9: { deletedAt: 123 }, t8: null, t7: "x" } as any }
    });
    poisoned.notes = [{ id: "n1", title: "N", content: "C", _deleted: true, deletedAt: { at: 1 } }];
    const other = plan([task("t1", { label: "Edited" })]);
    expect(() => reconcilePlans(poisoned, poisoned, other)).not.toThrow();
    expect(() => reconcilePlans(null, other, poisoned)).not.toThrow();
    expect(() => purgeTombstones(poisoned)).not.toThrow();
    expect(() => maintainPlanData(poisoned)).not.toThrow();
  });

  it("maintainPlanData keeps links between ids containing '-' and records note tombstones", () => {
    const data = plan(
      [task("task-1"), task("task-2", { dependsOn: "task-1" }), task("task-3", { dependsOn: ["task-3", "missing"] })],
      { notes: [{ id: "n1", title: "Old", content: "x", _deleted: true, deletedAt: new Date().toISOString() }] }
    );
    const maintained = maintainPlanData(data);
    expect(byId(maintained, "task-2")?.dependsOn).toBe("task-1");
    expect(byId(maintained, "task-3")?.dependsOn).toBeNull();
    expect(maintained.notes).toEqual([]);
    expect(maintained.meta?.tombstones?.n1?.entityType).toBe("note");
  });

  it("purgeTombstones and maintainPlanData agree on unparseable dates (kept as fresh)", () => {
    const data = plan([task("t1")], {
      meta: {
        title: "Plan",
        tombstones: { x: { deletedAt: "not-a-date" }, y: { deletedAt: "2020-01-01T00:00:00.000Z" } }
      }
    });
    expect(Object.keys(purgeTombstones(data).meta?.tombstones || {})).toEqual(["x"]);
    expect(Object.keys(maintainPlanData(data).meta?.tombstones || {})).toEqual(["x"]);
  });
});

describe("timestamp ordering", () => {
  it("compares instants, not strings, and ignores locale", () => {
    expect(compareCompositeTimestamps("2026-09-01T12:00:00.900Z", "2026-09-01T12:00:00Z")).toBeGreaterThan(0);
    expect(compareCompositeTimestamps("2026-09-01T14:00:00+02:00", "2026-09-01T12:30:00Z")).toBeLessThan(0);
    expect(compareCompositeTimestamps(`${T1}#b`, `${T1}#a`)).toBeGreaterThan(0);
    expect(compareCompositeTimestamps(`${T1}#a`, `${T1}#a`)).toBe(0);
  });

  it("treats missing, malformed and far-future stamps as older than any valid one", () => {
    expect(compareCompositeTimestamps(T0, undefined)).toBeGreaterThan(0);
    expect(compareCompositeTimestamps(T0, 123 as any)).toBeGreaterThan(0);
    expect(compareCompositeTimestamps(T0, "garbage")).toBeGreaterThan(0);
    expect(compareCompositeTimestamps(T0, "9999-12-31T00:00:00.000Z#attacker")).toBeGreaterThan(0);
  });
});

describe("task helpers", () => {
  it("areTasksIdentical compares every content key and normalizes dependsOn", () => {
    expect(areTasksIdentical(task("t1", { teamId: "a" }), task("t1", { teamId: "b" }))).toBe(false);
    expect(areTasksIdentical(task("t1", { priority: "high" }), task("t1"))).toBe(false);
    expect(
      areTasksIdentical(task("t1", { dependsOn: [{ id: "t0", type: "SS" }] }), task("t1", { dependsOn: "t0" }))
    ).toBe(false);
    expect(areTasksIdentical(task("t1", { dependsOn: ["t0"] }), task("t1", { dependsOn: "t0", updatedAt: T2 }))).toBe(true);
  });

  it("never equates an id that looks like lag shorthand with a typed link", () => {
    // "render-3d" may be the id of a task; "render:FS-3d" is a link to "render" with a 3-day lead.
    const byShorthand = task("t1", { dependsOn: "render-3d" });
    const byTypedLink = task("t1", { dependsOn: "render:FS-3d" });
    expect(areTasksIdentical(byShorthand, byTypedLink)).toBe(false);
    expect(calculatePlanHash(plan([byShorthand]))).not.toBe(calculatePlanHash(plan([byTypedLink])));
    // Spelling-only differences of unambiguous links still compare equal
    expect(areTasksIdentical(task("t1", { dependsOn: "render:FS-3d" }), task("t1", { dependsOn: [{ id: "render", type: "FS", lag: -3 }] }))).toBe(true);

    // A local relink from task "render-3d" to "render" with a lead is not mistaken for "no change"
    const base = plan([task("render"), task("render-3d"), byShorthand]);
    const local = plan([task("render"), task("render-3d"), byTypedLink]);
    const remote: JanttData = JSON.parse(JSON.stringify(base));
    expect(byId(reconcilePlans(base, local, remote).mergedData, "t1")?.dependsOn).toBe("render:FS-3d");
  });

  it("stampTaskFieldTimestamps never moves a stamp backwards when next carries stale stamps", () => {
    const prev = task("t1", { fieldTimestamps: { label: `${T2}#a`, start: `${T0}#a` } });
    const staleCopy = { ...prev, fieldTimestamps: { label: `${T0}#b`, start: `${T1}#b` } };
    const restamped = stampTaskFieldTimestamps(prev, staleCopy, `${T2}#peer`);
    expect(restamped.fieldTimestamps).toEqual({ label: `${T2}#a`, start: `${T1}#b` });
    expect(restamped.updatedAt).toBe(staleCopy.updatedAt); // no field changed

    const edited = stampTaskFieldTimestamps(prev, { ...staleCopy, progress: 0.5 }, `${T2}#peer`);
    expect(edited.fieldTimestamps).toEqual({ label: `${T2}#a`, start: `${T1}#b`, progress: `${T2}#peer` });
  });

  it("stampTaskFieldTimestamps stamps every changed key, including milestone and costs", () => {
    const prev = task("t1", { fieldTimestamps: { label: `${T0}#p` } });
    const next = { ...prev, milestone: true, actualCost: 10 };
    const stamped = stampTaskFieldTimestamps(prev, next, `${T2}#peer`);
    expect(stamped.fieldTimestamps).toEqual({ label: `${T0}#p`, milestone: `${T2}#peer`, actualCost: `${T2}#peer` });
    expect(stamped.updatedAt).toBe(T2);
    expect(stamped.updatedBy).toBe("peer");
    const unchanged = { ...prev };
    expect(stampTaskFieldTimestamps(prev, unchanged, `${T2}#peer`)).toBe(unchanged);
  });
});
