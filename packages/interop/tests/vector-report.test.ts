import { describe, it, expect } from "vitest";
import {
  exportExecutiveReportHtml,
  exportExecutiveReportSvg,
  ExecutiveReportOptions
} from "../src/report.js";
import { Task, calculateCriticalPath } from "@jantt/core";

describe("Executive Vector PDF Booklet & Report Engine", () => {
  const sampleTasks: Task[] = [
    {
      id: "T1",
      name: "Architecture & Blueprint",
      category: "eng",
      start: "2026-03-01",
      end: "2026-03-10",
      progress: 1.0,
      estimatedCost: 15000,
      actualCost: 14200,
      status: "done"
    },
    {
      id: "T2",
      name: "Core Engine Development",
      category: "eng",
      start: "2026-03-11",
      end: "2026-03-25",
      progress: 0.6,
      estimatedCost: 40000,
      actualCost: 26000,
      dependsOn: ["T1"]
    },
    {
      id: "T3",
      name: "Security Audit & Pen Test",
      category: "eng",
      start: "2026-03-26",
      end: "2026-03-31",
      progress: 0.0,
      estimatedCost: 12000,
      actualCost: 0,
      dependsOn: ["T2"]
    },
    {
      id: "M1",
      name: "Phase 1 Gate Review",
      category: "eng",
      start: "2026-03-31",
      end: "2026-03-31",
      milestone: true,
      dependsOn: ["T3"]
    }
  ];

  it("exports comprehensive executive report HTML with cover dashboard, EVM, and SVG pages", () => {
    const html = exportExecutiveReportHtml(sampleTasks, {
      title: "Apollo Cloud Infrastructure",
      projectCode: "APL-2026",
      statusDate: "2026-03-20"
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Apollo Cloud Infrastructure");
    expect(html).toContain("APL-2026");
    expect(html).toContain("ANSI/EIA-748 Earned Value Management");
    expect(html).toContain("Schedule Health (selected DCMA checks)");
    expect(html).not.toContain("DCMA-14");
    expect(html).toContain("Milestone Gate Checklist");
    expect(html).toContain("Phase 1 Gate Review");
    expect(html).toContain("<svg class=\"timeline-svg\"");
    // T1 -> T2 -> T3 -> M1 is the only chain, so its links may all be drawn as critical.
    expect(html).toMatch(/<path d="M [^"]+" fill="none"[^>]*marker-end="url\(#arrow(?:-crit)?\)"/);
  });

  it("lists every health check with its result, limit and deduction", () => {
    const html = exportExecutiveReportHtml(
      [
        { id: "a", name: "A", category: "dev", start: "2026-03-02", end: "2026-03-06" },
        { id: "b", name: "B", category: "dev", start: "2026-03-09", end: "2026-03-13", dependsOn: "a:SS-1d" },
        { id: "c", name: "Orphan", category: "dev", start: "2026-03-03", end: "2026-03-04" }
      ],
      { statusDate: "2026-03-01" }
    );
    expect(html).toContain("#1 Missing logic");
    expect(html).toContain("#2 Leads (negative lag)");
    expect(html).toContain("<span class=\"kpi-of\"> / ");
    expect(html).toContain("<span class=\"badge badge-danger\">Fail</span>");
    expect(html).toMatch(/&minus;[\d.]+ pts/);
    expect(html).toMatch(/Score: \d+\/100/);
  });

  it("shows n/a instead of placeholder cost figures when the plan has no budgets", () => {
    const html = exportExecutiveReportHtml(
      [{ id: "a", name: "A", category: "dev", start: "2026-03-02", end: "2026-03-06", progress: 0 }],
      { statusDate: "2026-03-10" }
    );
    expect(html).toContain("Schedule only &bull; no cost data");
    expect(html).toContain("No cost data");
    expect(html).not.toMatch(/Cost Performance \(CPI\)<\/div>\s*<div class="kpi-value"[^>]*>1\.00/);
    expect(html).not.toContain("$0");
    // The overdue, unstarted task is behind schedule even without costs.
    expect(html).toContain("Behind Schedule (duration-weighted)");
  });

  it("labels CPI by budget coverage and formats overspend as negative money", () => {
    const html = exportExecutiveReportHtml(
      [
        { id: "a", name: "A", category: "dev", start: "2026-03-02", end: "2026-03-06", progress: 1, estimatedCost: 1000, actualCost: 1500 },
        { id: "b", name: "B", category: "dev", start: "2026-03-09", end: "2026-03-13", estimatedCost: 3000 }
      ],
      { statusDate: "2026-03-10" }
    );
    expect(html).toContain("Based on 25% of budget");
    expect(html).toContain("-$500");
    expect(html).not.toContain("$-");
    expect(html).toContain("PV vs. current dates (no baseline)");
  });

  it("draws a single-day task without the milestone flag as a bar", () => {
    const tasks: Task[] = [
      { id: "d", name: "One day", category: "dev", start: "2026-03-02", end: "2026-03-02" },
      { id: "g", name: "Gate", category: "dev", start: "2026-03-03", end: "2026-03-03", milestone: true }
    ];
    const svg = exportExecutiveReportSvg(tasks, { statusDate: "2026-03-02" });
    expect(svg.match(/<polygon /g)).toHaveLength(1);
    expect(svg).toMatch(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="16" rx="3"/);

    const html = exportExecutiveReportHtml(tasks, { statusDate: "2026-03-02" });
    expect(html).toContain("1 Strategic Gateways");
    expect(html).not.toMatch(/<td style="font-weight: 600;">One day<\/td>/);
  });

  it("computes the critical path with the plan's gap and target date", () => {
    const tasks: Task[] = [
      { id: "a", name: "A", category: "dev", start: "2026-11-02", end: "2026-11-06" },
      { id: "b", name: "B", category: "dev", start: "2026-11-09", end: "2026-11-13", dependsOn: "a" },
      { id: "side", name: "Side", category: "dev", start: "2026-11-02", end: "2026-11-10" }
    ];
    const plan = { targetDate: "2026-11-05", defaultGapDays: 2 };
    const expected = calculateCriticalPath(tasks, plan).criticalTaskIds.size;
    expect(expected).toBeGreaterThan(calculateCriticalPath(tasks).criticalTaskIds.size);

    const criticalBars = (svg: string) => (svg.match(/fill="#ef4444" fill-opacity="0.3"/g) || []).length;
    expect(criticalBars(exportExecutiveReportSvg(tasks, { statusDate: "2026-11-01", ...plan }))).toBe(expected);
    expect(criticalBars(exportExecutiveReportSvg(tasks, { statusDate: "2026-11-01" }))).toBe(calculateCriticalPath(tasks).criticalTaskIds.size);
  });

  it("draws links to ids that look like lag shorthand", () => {
    const svg = exportExecutiveReportSvg(
      [
        { id: "render-3d", name: "Render", category: "dev", start: "2026-03-02", end: "2026-03-04" },
        { id: "qa", name: "QA", category: "dev", start: "2026-03-09", end: "2026-03-10", dependsOn: "render-3d" }
      ],
      { statusDate: "2026-03-02" }
    );
    expect(svg).toMatch(/<path d="M [^"]+" fill="none"/);
  });

  it("renders dark theme report correctly", () => {
    const html = exportExecutiveReportHtml(sampleTasks, {
      theme: "dark",
      statusDate: "2026-03-20"
    });

    expect(html).toContain("#0f172a");
    expect(html).toContain("#1e293b");
  });

  it("exports standalone vector SVG Gantt chart ready for vector graphics tools", () => {
    const svg = exportExecutiveReportSvg(sampleTasks, {
      statusDate: "2026-03-20"
    });

    expect(svg).toContain("<svg");
    expect(svg).toContain("xmlns=\"http://www.w3.org/2000/svg\"");
    expect(svg).toContain("viewBox=\"0 0");
    expect(svg).toContain("Architecture &amp; Blueprint");
    expect(svg).toContain("polygon points="); // Milestone diamond
  });

  it("gracefully handles empty tasks without crashing", () => {
    const html = exportExecutiveReportHtml([]);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Total Activities:</strong> 0");

    const svg = exportExecutiveReportSvg([]);
    expect(svg).toContain("<svg");
  });

  it("paginates tasks into multiple pages when exceeding tasksPerPage", () => {
    const manyTasks: Task[] = Array.from({ length: 35 }, (_, idx) => ({
      id: `T-${idx + 1}`,
      name: `Activity ${idx + 1}`,
      category: "eng",
      start: "2026-03-01",
      end: "2026-03-10",
      progress: 0.5
    }));

    const html = exportExecutiveReportHtml(manyTasks, {
      tasksPerPage: 10
    });

    // 35 tasks / 10 = 4 timeline parts
    expect(html).toContain("Schedule Network Timeline (Part 1 of 4)");
    expect(html).toContain("Schedule Network Timeline (Part 2 of 4)");
    expect(html).toContain("Schedule Network Timeline (Part 3 of 4)");
    expect(html).toContain("Schedule Network Timeline (Part 4 of 4)");
  });

  it("never lets task.color break out of an SVG attribute", () => {
    // X and Y finish before "Long", so they are off the critical path and keep their own colors.
    const hostile: Task[] = [
      { id: "Long", name: "Long", category: "dev", start: "2026-03-02", end: "2026-03-20" },
      { id: "X", name: "Hostile", category: "dev", start: "2026-03-02", end: "2026-03-05", color: "red\" onmouseover=\"alert(document.domain)" },
      { id: "Y", name: "Fine", category: "dev", start: "2026-03-02", end: "2026-03-05", color: "#10b981" }
    ];
    for (const out of [exportExecutiveReportHtml(hostile, { statusDate: "2026-03-01" }), exportExecutiveReportSvg(hostile, { statusDate: "2026-03-01" })]) {
      expect(out).not.toContain("onmouseover");
      expect(out).toContain("fill=\"#10b981\"");
      expect(out).toContain("fill=\"#3b82f6\"");
    }
  });

  it("draws bars with inclusive end dates like the on-screen Gantt", () => {
    const svg = exportExecutiveReportSvg(
      [{ id: "A", name: "Two days", category: "dev", start: "2026-03-01", end: "2026-03-02" }],
      { statusDate: "2026-03-01" }
    );
    // chart: 2026-02-27 .. 2026-03-08 = 9 days over 780px
    const pxPerDay = 780 / 9;
    expect(svg).toContain(`width="${2 * pxPerDay}"`);
  });

  it("lists overdue milestones first and says how many are not shown", () => {
    const milestones: Task[] = Array.from({ length: 12 }, (_, i) => ({
      id: `M${i}`,
      name: `Gate ${i}`,
      category: "dev",
      start: `2026-04-${String(i + 10).padStart(2, "0")}`,
      end: `2026-04-${String(i + 10).padStart(2, "0")}`,
      milestone: true
    }));
    milestones.push({ id: "LATE", name: "Overdue gate", category: "dev", start: "2026-03-01", end: "2026-03-01", milestone: true });
    const html = exportExecutiveReportHtml(milestones, { statusDate: "2026-03-15" });

    expect(html).toContain("13 Strategic Gateways (top 10 shown)");
    expect(html).toContain("+3 more milestones not shown");
    expect(html.indexOf("Overdue gate")).toBeLessThan(html.indexOf("Gate 0"));
  });

  it("draws an off-page stub for links whose predecessor is on another page", () => {
    const tasks: Task[] = Array.from({ length: 8 }, (_, i) => ({
      id: `T-${i + 1}`,
      name: `Activity ${i + 1}`,
      category: "dev",
      start: `2026-03-${String(i + 1).padStart(2, "0")}`,
      end: `2026-03-${String(i + 2).padStart(2, "0")}`
    }));
    tasks[6] = { ...tasks[6], dependsOn: ["T-1"] };
    const html = exportExecutiveReportHtml(tasks, { tasksPerPage: 5, statusDate: "2026-03-01" });
    expect(html).toContain("&#8593; T-1");
    expect(html).toContain("<marker id=\"arrow-crit\"");
  });

  it("titles the standalone SVG and survives malformed dates", () => {
    const svg = exportExecutiveReportSvg(
      [
        { id: "ok", name: "Valid", category: "dev", start: "2026-03-02", end: "2026-03-06" },
        { id: "bad", name: "Broken", category: "dev", start: "2026-03-02", end: "TBD" }
      ],
      { title: "Q2 <Roadmap>", statusDate: "2026-03-02" }
    );
    expect(svg).toContain("<title>Q2 &lt;Roadmap&gt;</title>");
    expect(svg).toContain("transform=\"translate(0 30)\"");
    // 2026-02-28 .. 2026-03-12 = 12 days: the bad end date did not collapse the chart
    expect(svg).toContain(`width="${5 * (780 / 12)}"`);
  });

  it("strips XML-illegal characters and never splits emoji when truncating", () => {
    const svg = exportExecutiveReportSvg(
      [{ id: "E", name: `${"x".repeat(25)}🚀 tail\u0001`, category: "dev", start: "2026-03-02", end: "2026-03-03" }],
      { statusDate: "2026-03-02" }
    );
    expect(svg).toContain(`${"x".repeat(25)}🚀<`);
    expect(svg).not.toMatch(/[\u0000-\u0008]/);
  });
});
