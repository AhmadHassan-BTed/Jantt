import { describe, it, expect } from "vitest";
import { exportToCsv } from "../src/exporter";
import { JanttData } from "../src/types";

const mockData: JanttData = {
  meta: { title: "Export Test Schedule" },
  categories: {
    dev: { label: "Development", color: "#3B82F6" }
  },
  tasks: [
    {
      id: "T1",
      label: "Architecture Setup",
      category: "dev",
      start: "2026-09-01",
      end: "2026-09-05",
      progress: 0.75,
      status: "in-progress",
      notes: "Clean modular architecture"
    },
    {
      id: "M1",
      label: "Launch Alpha",
      category: "dev",
      start: "2026-09-06",
      end: "2026-09-06",
      milestone: true,
      dependsOn: "T1"
    }
  ]
};

describe("Exporter Engine", () => {
  // ─── CSV header and rows ──────────────────────────────────────────────

  it("exports valid RFC-4180 CSV with headers and task rows", () => {
    const csv = exportToCsv(mockData);
    expect(csv).toContain("Task ID,Label / Name,Category,Start Date,End Date,Duration (Days),Progress (%),Milestone,Depends On,Status,Notes");
    expect(csv).toContain("T1,Architecture Setup,dev,2026-09-01,2026-09-05,4,75%,FALSE,,in-progress,Clean modular architecture");
    expect(csv).toContain("M1,Launch Alpha,dev,2026-09-06,2026-09-06,0,,TRUE,T1,,");
  });

  it("first line is always the header", () => {
    const csv = exportToCsv(mockData);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Task ID,Label / Name,Category,Start Date,End Date,Duration (Days),Progress (%),Milestone,Depends On,Status,Notes");
  });

  it("row count matches task count (header + N rows)", () => {
    const csv = exportToCsv(mockData);
    const lines = csv.split("\r\n").filter(l => l.trim() !== "");
    expect(lines.length).toBe(mockData.tasks.length + 1); // header + tasks
  });

  // ─── RFC-4180 escaping ────────────────────────────────────────────────

  it("escapes fields containing commas and quotes properly in CSV", () => {
    const dataWithSpecialChars: JanttData = {
      tasks: [
        {
          id: "T2",
          label: 'Design "NextGen", V2',
          category: "design",
          start: "2026-09-10",
          end: "2026-09-15"
        }
      ]
    };

    const csv = exportToCsv(dataWithSpecialChars);
    expect(csv).toContain('"Design ""NextGen"", V2"');
  });

  it("escapes fields containing newlines", () => {
    const dataWithNewlines: JanttData = {
      tasks: [
        {
          id: "T3",
          label: "Multi\nLine Task",
          category: "dev",
          start: "2026-09-10",
          end: "2026-09-15"
        }
      ]
    };
    const csv = exportToCsv(dataWithNewlines);
    expect(csv).toContain('"Multi\nLine Task"');
  });

  // ─── Edge cases ───────────────────────────────────────────────────────

  it("handles empty tasks array gracefully", () => {
    const emptyData: JanttData = { tasks: [] };
    const csv = exportToCsv(emptyData);
    const lines = csv.split("\r\n").filter(l => l.trim() !== "");
    expect(lines.length).toBe(1); // Header only
  });

  it("handles tasks with missing optional fields", () => {
    const minimalData: JanttData = {
      tasks: [
        { id: "min", category: "gen", start: "2026-09-01", end: "2026-09-05" }
      ]
    };
    const csv = exportToCsv(minimalData);
    expect(csv).toContain("min");
    // Should not crash on missing label, notes, status, progress, dependsOn
  });

  it("uses name field as fallback when label is not set", () => {
    const nameData: JanttData = {
      tasks: [
        { id: "named", name: "Named Task", category: "dev", start: "2026-09-01", end: "2026-09-05" }
      ]
    };
    const csv = exportToCsv(nameData);
    expect(csv).toContain("Named Task");
  });

  it("falls back to task id when both label and name are missing", () => {
    const noNameData: JanttData = {
      tasks: [
        { id: "fallback-id", category: "dev", start: "2026-09-01", end: "2026-09-05" }
      ]
    };
    const csv = exportToCsv(noNameData);
    expect(csv).toContain("fallback-id,fallback-id");
  });

  // ─── Milestone detection ──────────────────────────────────────────────

  it("marks zero-duration tasks as milestones in CSV even without explicit milestone flag", () => {
    const zeroDurData: JanttData = {
      tasks: [
        { id: "zero-dur", category: "ms", start: "2026-09-15", end: "2026-09-15" }
      ]
    };
    const csv = exportToCsv(zeroDurData);
    expect(csv).toContain("TRUE"); // Detected as milestone
  });

  // ─── Progress formatting ──────────────────────────────────────────────

  it("formats progress as integer percentage", () => {
    const progData: JanttData = {
      tasks: [
        { id: "p1", category: "dev", start: "2026-09-01", end: "2026-09-05", progress: 0 },
        { id: "p2", category: "dev", start: "2026-09-06", end: "2026-09-10", progress: 0.5 },
        { id: "p3", category: "dev", start: "2026-09-11", end: "2026-09-15", progress: 1.0 }
      ]
    };
    const csv = exportToCsv(progData);
    expect(csv).toContain("0%");
    expect(csv).toContain("50%");
    expect(csv).toContain("100%");
  });

  it("leaves progress column empty when progress is null or undefined", () => {
    const noProg: JanttData = {
      tasks: [
        { id: "np", category: "dev", start: "2026-09-01", end: "2026-09-05", progress: null },
        { id: "np2", category: "dev", start: "2026-09-06", end: "2026-09-10" }
      ]
    };
    const csv = exportToCsv(noProg);
    const lines = csv.split("\r\n");
    // The progress column (index 6) should be empty for these tasks
    for (let i = 1; i <= 2; i++) {
      const cols = lines[i].split(",");
      expect(cols[6]).toBe(""); // Empty progress
    }
  });

  // ─── CRLF line endings ────────────────────────────────────────────────

  it("uses CRLF line endings per RFC-4180", () => {
    const csv = exportToCsv(mockData);
    expect(csv).toContain("\r\n");
    // Ensure no bare LF without CR
    const withoutCRLF = csv.replace(/\r\n/g, "");
    expect(withoutCRLF).not.toContain("\n");
  });
});
