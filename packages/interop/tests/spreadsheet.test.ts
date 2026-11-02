import { describe, it, expect } from "vitest";
import { exportSpreadsheetCsv, importSpreadsheetCsv } from "../src/spreadsheet.js";
import type { JanttData } from "@jantt/core";

describe("Spreadsheet CSV Interoperability", () => {
  const plan: JanttData = {
    tasks: [
      { id: "A1", label: "Market Research, Phase 1", start: "2026-11-01", end: "2026-11-04", progress: 1, owner: "Sarah", category: "marketing" },
      { id: "A2", label: "UI Concept \"V2\"", start: "2026-11-05", end: "2026-11-10", progress: 0.45, owner: "Leo", category: "design", dependsOn: "A1:FS+1d", priority: "urgent" }
    ]
  };

  it("exports CSV with quotes, formulas and metadata", () => {
    const csv = exportSpreadsheetCsv(plan);

    expect(csv).toContain("ID,Label,Start,End,Progress,Category,Owner,DependsOn,Priority");
    expect(csv).toContain("\"Market Research, Phase 1\"");
    expect(csv).toContain("\"UI Concept \"\"V2\"\"\"");
    expect(csv).toContain("100%");
    expect(csv).toContain("45%");
    expect(csv).toContain("urgent");
  });

  it("imports CSV back into Jantt tasks cleanly", () => {
    const csv = exportSpreadsheetCsv(plan);
    const parsed = importSpreadsheetCsv(csv);

    expect(parsed.tasks).toHaveLength(2);
    expect(parsed.tasks[0].id).toBe("A1");
    expect(parsed.tasks[0].label).toBe("Market Research, Phase 1");
    expect(parsed.tasks[0].owner).toBe("Sarah");
    expect(parsed.tasks[0].progress).toBe(1);

    expect(parsed.tasks[1].id).toBe("A2");
    expect(parsed.tasks[1].label).toBe("UI Concept \"V2\"");
    expect(parsed.tasks[1].priority).toBe("urgent");
    expect(parsed.tasks[1].progress).toBe(0.45);
    expect(parsed.tasks[1].dependsOn).toBe("A1:FS+1d");
  });
});
