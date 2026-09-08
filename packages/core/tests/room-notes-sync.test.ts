import { describe, it, expect } from "vitest";
import type { JanttData, NoteItem } from "../src/types";
import { encodePlanForRtdb, decodePlanFromRtdb } from "../src/firebase-sync";
import { sanitizePlanForJson } from "../src/share-coder";
import { reconcilePlans } from "../src/reconciliation/plan-reconciler";

describe("Room Notes Synchronization & CRDT Merge", () => {
  const basePlan: JanttData = {
    "$schema": "https://jantt.dev/schema/v1.json",
    meta: {
      title: "Shared Engineering Room",
      scale: "week"
    },
    tasks: [
      {
        id: "task-infra-1",
        label: "Database Migration",
        category: "infra",
        start: "2026-09-01",
        end: "2026-09-10",
        progress: 1.0,
        status: "completed"
      }
    ],
    notes: [
      {
        id: "note-1",
        title: "Sprint Kickoff Notes",
        content: "Discussed migration timeline and task dependencies.",
        color: "#3B82F6",
        pinned: true,
        task_ids: ["task-infra-1"],
        createdAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-01T10:00:00.000Z"
      }
    ]
  };

  it("faithfully encodes and decodes notes through RTDB character encoding", () => {
    const planWithSpecialChars: JanttData = {
      ...basePlan,
      notes: [
        {
          id: "note-spec-1",
          title: "API Endpoint: /api/v1/plans.json",
          content: "Requires [auth] token & #hashtag support $100 budget.",
          color: "#10B981",
          pinned: false,
          task_ids: ["task-infra-1"],
          createdAt: "2026-09-01T10:00:00.000Z",
          updatedAt: "2026-09-01T10:00:00.000Z"
        }
      ]
    };

    const encoded = encodePlanForRtdb(planWithSpecialChars);
    const decoded = decodePlanFromRtdb(encoded);

    expect(decoded.notes).toHaveLength(1);
    expect(decoded.notes![0].id).toBe("note-spec-1");
    expect(decoded.notes![0].title).toBe("API Endpoint: /api/v1/plans.json");
    expect(decoded.notes![0].content).toBe("Requires [auth] token & #hashtag support $100 budget.");
    expect(decoded.notes![0].task_ids).toEqual(["task-infra-1"]);
  });

  it("sanitizes notes payload while preserving public canonical mentions and stripping internal UIDs", () => {
    const planWithDirtyData: any = {
      ...basePlan,
      uid: "internal-firebase-uid-123",
      ownerUid: "owner-uid-456",
      secretKey: "super-secret-key",
      notes: [
        {
          id: "note-clean-1",
          title: "Architecture Review",
          content: "Reviewed by @alex and @sarah",
          color: "#8B5CF6",
          pinned: true,
          task_ids: ["task-infra-1"],
          uid: "should-be-stripped",
          ownerUid: "should-be-stripped",
          updatedBy: "alex", // should normalize to @alex
          createdAt: "2026-09-01T10:00:00.000Z",
          updatedAt: "2026-09-01T11:00:00.000Z"
        }
      ]
    };

    const sanitized = sanitizePlanForJson(planWithDirtyData);

    // Root internal keys stripped
    expect((sanitized as any).uid).toBeUndefined();
    expect((sanitized as any).ownerUid).toBeUndefined();
    expect((sanitized as any).secretKey).toBeUndefined();

    // Note properties preserved
    expect(sanitized.notes).toHaveLength(1);
    const note = sanitized.notes![0] as any;
    expect(note.id).toBe("note-clean-1");
    expect(note.title).toBe("Architecture Review");
    expect(note.color).toBe("#8B5CF6");
    expect(note.pinned).toBe(true);
    expect(note.task_ids).toEqual(["task-infra-1"]);
    expect(note.uid).toBeUndefined();
    expect(note.ownerUid).toBeUndefined();
    expect(note.updatedBy).toBe("@alex");
  });

  it("cleanly merges concurrent note edits from two collaborators in 3-way reconciliation", () => {
    // Base plan has note-1
    const base: JanttData = JSON.parse(JSON.stringify(basePlan));

    // Collaborator A edits note-1's title
    const local: JanttData = {
      ...base,
      notes: [
        {
          ...base.notes![0],
          title: "Sprint Kickoff Notes (Updated by Alex)",
          updatedAt: "2026-09-01T10:30:00.000Z",
          updatedBy: "@alex"
        }
      ]
    };

    // Collaborator B concurrently adds a new note-2
    const remote: JanttData = {
      ...base,
      notes: [
        base.notes![0],
        {
          id: "note-2",
          title: "Incident Retrospective",
          content: "Root cause analysis on staging outage.",
          color: "#EF4444",
          pinned: false,
          task_ids: [],
          createdAt: "2026-09-01T10:35:00.000Z",
          updatedAt: "2026-09-01T10:35:00.000Z",
          updatedBy: "@sarah"
        }
      ]
    };

    const reconcileResult = reconcilePlans(base, local, remote, { clientId: "@alex" });
    const merged = reconcileResult.mergedData;

    // Both note-1's edit and note-2's addition must be preserved
    expect(merged.notes).toHaveLength(2);

    const mergedNote1 = merged.notes?.find((n) => n.id === "note-1");
    const mergedNote2 = merged.notes?.find((n) => n.id === "note-2");

    expect(mergedNote1).toBeDefined();
    expect(mergedNote1?.title).toBe("Sprint Kickoff Notes (Updated by Alex)");

    expect(mergedNote2).toBeDefined();
    expect(mergedNote2?.title).toBe("Incident Retrospective");
    expect(mergedNote2?.color).toBe("#EF4444");
  });

  it("handles last-write-wins (LWW) conflict when both collaborators edit the same note", () => {
    const base: JanttData = JSON.parse(JSON.stringify(basePlan));

    // Collaborator A edited at 10:15
    const local: JanttData = {
      ...base,
      notes: [
        {
          ...base.notes![0],
          title: "Local Title Edit",
          content: "Local body content",
          updatedAt: "2026-09-01T10:15:00.000Z",
          updatedBy: "@alex"
        }
      ]
    };

    // Collaborator B edited at 10:20 (later timestamp)
    const remote: JanttData = {
      ...base,
      notes: [
        {
          ...base.notes![0],
          title: "Remote Title Edit (Later)",
          content: "Remote body content",
          updatedAt: "2026-09-01T10:20:00.000Z",
          updatedBy: "@sarah"
        }
      ]
    };

    const reconcileResult = reconcilePlans(base, local, remote, { clientId: "@alex" });
    const merged = reconcileResult.mergedData;

    expect(merged.notes).toHaveLength(1);
    const resolved = merged.notes![0];
    expect(resolved.title).toBe("Remote Title Edit (Later)");
    expect(resolved.content).toBe("Remote body content");
  });

  it("propagates note deletion across collaborators and prevents resurrection", () => {
    const base: JanttData = JSON.parse(JSON.stringify(basePlan));

    // Collaborator A deleted note-1 (removed from active list or marked with tombstone)
    const local: JanttData = {
      ...base,
      notes: [
        {
          ...base.notes![0],
          _deleted: true,
          deletedAt: "2026-09-01T11:00:00.000Z",
          updatedBy: "@alex"
        }
      ]
    };

    // Collaborator B had not made any changes to note-1
    const remote: JanttData = JSON.parse(JSON.stringify(basePlan));

    const reconcileResult = reconcilePlans(base, local, remote, { clientId: "@alex" });
    const merged = reconcileResult.mergedData;

    // Note must not be resurrected
    const activeNotes = (merged.notes || []).filter((n) => !n._deleted);
    expect(activeNotes).toHaveLength(0);
  });
});
