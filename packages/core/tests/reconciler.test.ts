import { describe, it, expect } from "vitest";
import { calculatePlanHash, reconcilePlans } from "../src/reconciler";
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
        { id: "task-4", label: "QA Testing", start: "2026-09-23", end: "2026-09-28", progress: 0 }
      ]
    };

    // Local added Task 5
    const localPlan: JanttData = {
      ...basePlan,
      tasks: [
        ...basePlan.tasks,
        { id: "task-5", label: "Security Audit", start: "2026-09-25", end: "2026-09-30", progress: 0 }
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
});
