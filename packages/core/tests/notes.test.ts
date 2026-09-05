import { describe, it, expect } from "vitest";
import { validate } from "../src/validator";
import type { JanttData, NoteItem } from "../src/types";

describe("Notes Schema & Integration", () => {
  const sampleNotes: NoteItem[] = [
    {
      id: "note-1",
      title: "Architecture RFC",
      content: "Detailed markdown spec for system design",
      createdAt: "2026-08-25T10:00:00.000Z",
      updatedAt: "2026-08-30T14:20:00.000Z",
      color: "#3B82F6",
      pinned: true,
      category: "Architecture",
      tags: ["ADR", "Spec"]
    },
    {
      id: "note-2",
      title: "Sprint Retrospective",
      content: "Action items and feedback from sprint 4",
      createdAt: "2026-08-28T09:30:00.000Z",
      updatedAt: "2026-08-31T11:45:00.000Z",
      color: "#10B981",
      pinned: false
    }
  ];

  const validDataWithNotes: JanttData = {
    meta: { title: "Test Project" },
    tasks: [
      { id: "t1", category: "core", start: "2026-09-01", end: "2026-09-05" }
    ],
    notes: sampleNotes
  };

  it("validates successfully with notes array included", () => {
    const res = validate(validDataWithNotes);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("preserves notes array through JSON serialization and deserialization", () => {
    const jsonStr = JSON.stringify(validDataWithNotes, null, 2);
    const parsed = JSON.parse(jsonStr) as JanttData;

    expect(parsed.notes).toBeDefined();
    expect(parsed.notes).toHaveLength(2);
    expect(parsed.notes?.[0].title).toBe("Architecture RFC");
    expect(parsed.notes?.[0].pinned).toBe(true);
    expect(parsed.notes?.[1].color).toBe("#10B981");
  });

  it("allows adding, modifying and deleting notes while preserving valid schema", () => {
    const updatedData: JanttData = {
      ...validDataWithNotes,
      notes: [
        ...sampleNotes,
        {
          id: "note-3",
          title: "New Note",
          content: "Testing additions",
          createdAt: new Date().toISOString()
        }
      ]
    };

    const res = validate(updatedData);
    expect(res.valid).toBe(true);
    expect(updatedData.notes).toHaveLength(3);

    // Delete note-1
    const filteredData: JanttData = {
      ...updatedData,
      notes: updatedData.notes?.filter((n) => n.id !== "note-1")
    };
    expect(filteredData.notes).toHaveLength(2);
    expect(validate(filteredData).valid).toBe(true);
  });

  it("rejects non-array notes property", () => {
    const invalidData = {
      tasks: [{ id: "t1", category: "core", start: "2026-09-01", end: "2026-09-05" }],
      notes: "not-an-array"
    };
    const res = validate(invalidData);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.path === "notes")).toBe(true);
  });

  it("detects duplicate note IDs", () => {
    const duplicateData = {
      tasks: [{ id: "t1", category: "core", start: "2026-09-01", end: "2026-09-05" }],
      notes: [
        { id: "note-dup", title: "Note 1", content: "A" },
        { id: "note-dup", title: "Note 2", content: "B" }
      ]
    };
    const res = validate(duplicateData);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.message.includes("Duplicate note id"))).toBe(true);
  });
});
