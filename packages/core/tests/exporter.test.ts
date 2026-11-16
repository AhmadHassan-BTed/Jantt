// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { exportToCsv, downloadJson, downloadCsv, exportSvgString, csvCell } from "../src/exporter";
import { Jantt } from "../src/index";
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
    expect(csv).toContain("Task ID,WBS,Label / Name,Category,Assignee,Priority,Start Date,End Date,Duration (Days),Estimated Budget ($),Progress (%),Milestone,Depends On,Status,Notes");
    // Durations are inclusive: 09-01..09-05 is drawn (and reported) as 5 days
    expect(csv).toContain("T1,,Architecture Setup,dev,,,2026-09-01,2026-09-05,5,,75%,FALSE,,in-progress,Clean modular architecture");
    expect(csv).toContain("M1,,Launch Alpha,dev,,,2026-09-06,2026-09-06,0,,,TRUE,T1,,");
  });

  it("first line is always the header", () => {
    const csv = exportToCsv(mockData);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Task ID,WBS,Label / Name,Category,Assignee,Priority,Start Date,End Date,Duration (Days),Estimated Budget ($),Progress (%),Milestone,Depends On,Status,Notes");
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
    expect(csv).toContain("fallback-id,,fallback-id");
  });

  // ─── Milestone detection ──────────────────────────────────────────────

  it("describes milestones the way the chart draws them (flagged or same-day)", () => {
    const data: JanttData = {
      tasks: [
        { id: "same-day", category: "ms", start: "2026-09-15", end: "2026-09-15" },
        { id: "ms", category: "ms", start: "2026-09-15", end: "2026-09-20", milestone: true },
        { id: "two-days", category: "ms", start: "2026-09-15", end: "2026-09-16" }
      ]
    };
    const lines = exportToCsv(data).split("\r\n");
    expect(lines[1].split(",").slice(8, 12)).toEqual(["0", "", "", "TRUE"]);
    expect(lines[2].split(",").slice(8, 12)).toEqual(["0", "", "", "TRUE"]);
    expect(lines[3].split(",").slice(8, 12)).toEqual(["2", "", "", "FALSE"]);
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
    // The progress column (index 10) should be empty for these tasks
    for (let i = 1; i <= 2; i++) {
      const cols = lines[i].split(",");
      expect(cols[10]).toBe(""); // Empty progress
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

  // ─── Security: CSV Formula Injection (CWE-1236) ──────────────────────

  it("neutralizes potential formula injection characters (=, +, -, @, \\t, \\r)", () => {
    const maliciousData: JanttData = {
      tasks: [
        { id: "M1", label: "=cmd|' /C calc'!A0", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "M2", label: "+1+1", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "M3", label: "-10", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "M4", label: "@SUM(A1:B1)", category: "dev", start: "2026-09-01", end: "2026-09-05" }
      ]
    };
    const csv = exportToCsv(maliciousData);
    expect(csv).toContain("M1,,'=cmd|' /C calc'!A0,dev");
    expect(csv).toContain("M2,,'+1+1,dev");
    expect(csv).toContain("M3,,'-10,dev");
    expect(csv).toContain("M4,,'@SUM(A1:B1),dev");
  });

  it("neutralizes tab, carriage-return and full-width formula prefixes", () => {
    const csv = exportToCsv({
      tasks: [
        { id: "T", label: "\t=1+1", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "R", label: "\r=1+1", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "W", label: "＝HYPERLINK()", category: "dev", start: "2026-09-01", end: "2026-09-05" }
      ]
    });
    expect(csv).toContain("T,,\"'\t=1+1\",dev");
    expect(csv).toContain("R,,\"'\r=1+1\",dev");
    expect(csv).toContain("W,,'＝HYPERLINK(),dev");
  });

  it("writes numeric costs as numbers and escapes anything else in the cost column", () => {
    const csv = exportToCsv({
      tasks: [
        { id: "N", category: "dev", start: "2026-09-01", end: "2026-09-05", estimatedCost: -1250.5 },
        { id: "S", category: "dev", start: "2026-09-01", end: "2026-09-05", estimatedCost: '=HYPERLINK("http://x","Open")' as any }
      ]
    });
    const lines = csv.split("\r\n");
    expect(lines[1]).toContain(",5,-1250.5,");
    expect(lines[2]).toContain(",5,\"'=HYPERLINK(\"\"http://x\"\",\"\"Open\"\")\",");
  });

  it("exports typed dependencies in parseable shorthand", () => {
    const csv = exportToCsv({
      tasks: [
        {
          id: "B",
          category: "dev",
          start: "2026-09-01",
          end: "2026-09-05",
          dependsOn: ["A", { id: "C", type: "SS", lagDays: 2 }, "D:FF-1d"]
        }
      ]
    });
    // Quoted, so the list survives spreadsheets that split on semicolons
    expect(csv).toContain(',"A; C:SS+2d; D:FF-1d",');
  });

  it("exports links to ids that look like lag shorthand by their real id", () => {
    const csv = exportToCsv({
      tasks: [
        { id: "model-3d", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "B", category: "dev", start: "2026-09-08", end: "2026-09-09", dependsOn: "model-3d" }
      ]
    });
    expect(csv.split("\r\n")[2]).toContain(",FALSE,model-3d,");
  });
});

describe("csvCell", () => {
  it("writes values, empties and text with RFC-4180 quoting", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(-1250.5)).toBe("-1250.5");
    expect(csvCell(true)).toBe("true");
    expect(csvCell(Number.NaN)).toBe("NaN");
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", now')).toBe('"say ""hi"", now"');
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell("a\tb")).toBe('"a\tb"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });

  it("neutralizes formula triggers, including text that already starts with a quote mark", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("＋1")).toBe("'＋1");
    // One more quote than the input, so an importer that strips one restores the text exactly
    expect(csvCell("'=1+1")).toBe("''=1+1");
    expect(csvCell("it's =fine")).toBe("it's =fine");
  });
});

describe("Download helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function captureDownload() {
    const blobs: Blob[] = [];
    const names: string[] = [];
    if (typeof URL.createObjectURL !== "function") (URL as any).createObjectURL = () => "";
    if (typeof URL.revokeObjectURL !== "function") (URL as any).revokeObjectURL = () => undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob: any) => {
      blobs.push(blob);
      return "blob:jantt-test";
    });
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    return { blobs, names, revoke };
  }

  const readBlob = (blob: Blob) =>
    new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });

  it("strips soft-deleted tasks and notes from JSON downloads", async () => {
    const { blobs } = captureDownload();
    downloadJson({
      tasks: [
        { id: "live", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "gone", category: "dev", start: "2026-09-01", end: "2026-09-05", _deleted: true }
      ],
      notes: [
        { id: "n1", title: "Keep", content: "" },
        { id: "n2", title: "Drop", content: "", _deleted: true }
      ]
    });
    const exported = JSON.parse(await readBlob(blobs[0]));
    expect(exported.tasks.map((t: any) => t.id)).toEqual(["live"]);
    expect(exported.notes.map((n: any) => n.id)).toEqual(["n1"]);
  });

  it("sanitizes file names, enforces the extension and revokes the URL later", () => {
    vi.useFakeTimers();
    const { names, revoke } = captureDownload();
    downloadCsv({ tasks: [] }, "../../etc/pass\nwd");
    downloadJson({ tasks: [] }, "plan.JSON");
    downloadJson({ tasks: [] }, "   ");

    expect(names).toEqual(["etc-pass-wd.csv", "plan.JSON", "jantt-schedule.json"]);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledTimes(3);
  });
});

describe("exportSvgString", () => {
  it("returns null when no chart is rendered", () => {
    expect(exportSvgString(document.createElement("div"))).toBeNull();
  });

  it("serializes bars, milestones and links into a standalone SVG document", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="jantt-canvas">
        <svg class="jantt-svg-overlay" width="400" height="120" viewBox="0 0 400 120">
          <path class="jantt-dep-path" d="M 10 10 L 100 10"></path>
        </svg>
        <div class="jantt-task-bar" data-task-id="t1" aria-label="Design" style="left: 10px; top: 20px; width: 120px; height: 24px; background: rgb(59, 130, 246);">
          <div class="jantt-task-progress" style="width: 50%;"></div>
          <div class="jantt-bar-content"><span>Design &lt;v2&gt;</span></div>
        </div>
        <div class="jantt-milestone" data-task-id="m1" style="left: 200px; top: 60px; width: 20px; height: 20px;"></div>
      </div>`;
    document.body.appendChild(container);

    const svg = exportSvgString(container)!;
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const root = doc.documentElement;
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(root.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(root.getAttribute("viewBox")).toBe("0 0 400 120");
    expect(doc.querySelectorAll("rect").length).toBeGreaterThanOrEqual(2);
    expect(doc.querySelector("polygon")).not.toBeNull();
    expect(doc.querySelector("path")?.getAttribute("d")).toBe("M 10 10 L 100 10");
    expect(doc.querySelector("text")?.textContent).toBe("Design <v2>");
    container.remove();
  });
});

describe("Jantt public API object", () => {
  it("exposes the exporters and reports the package version", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8"));
    expect(Jantt.version).toBe(pkg.version);
    expect(Jantt.exportToCsv).toBe(exportToCsv);
    expect(Jantt.exportSvgString).toBe(exportSvgString);
  });
});
