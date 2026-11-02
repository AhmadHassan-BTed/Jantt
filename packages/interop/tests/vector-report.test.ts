import { describe, it, expect } from "vitest";
import {
  exportExecutiveReportHtml,
  exportExecutiveReportSvg,
  ExecutiveReportOptions
} from "../src/report";
import { Task } from "@jantt/core";

describe("Executive Vector PDF Booklet & Report Engine", () => {
  const sampleTasks: Task[] = [
    {
      id: "T1",
      name: "Architecture & Blueprint",
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
    expect(html).toContain("DCMA-14 Schedule Logic");
    expect(html).toContain("Milestone Gate Checklist");
    expect(html).toContain("Phase 1 Gate Review");
    expect(html).toContain("<svg class=\"timeline-svg\"");
    expect(html).toContain("marker-end=\"url(#arrow)\"");
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
});
