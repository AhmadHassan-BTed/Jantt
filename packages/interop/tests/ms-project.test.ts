import { describe, it, expect } from "vitest";
import { exportMsProjectXml, importMsProjectXml } from "../src/ms-project.js";
import type { JanttData } from "@jantt/core";

describe("Microsoft Project XML Interoperability", () => {
  const samplePlan: JanttData = {
    meta: { title: "Falcon Heavy Launch" },
    tasks: [
      { id: "t1", label: "Structural Test", start: "2026-11-01", end: "2026-11-04", progress: 1.0 },
      { id: "t2", label: "Avionics Integration", start: "2026-11-05", end: "2026-11-10", progress: 0.5, dependsOn: "t1" },
      {
        id: "t3",
        label: "Cryogenic Static Fire",
        start: "2026-11-12",
        end: "2026-11-15",
        progress: 0.1,
        dependsOn: [{ id: "t2", type: "FS", lagDays: 2 }]
      }
    ]
  };

  it("exports compliant MS Project XML with tasks and dependencies", () => {
    const xml = exportMsProjectXml(samplePlan, { projectName: "Falcon Heavy Launch", author: "SpaceX" });

    expect(xml).toContain("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>");
    expect(xml).toContain("<Title>Falcon Heavy Launch</Title>");
    expect(xml).toContain("<Author>SpaceX</Author>");
    expect(xml).toContain("<Name>Structural Test</Name>");
    expect(xml).toContain("<PercentComplete>100</PercentComplete>");
    expect(xml).toContain("<Name>Avionics Integration</Name>");
    expect(xml).toContain("<PercentComplete>50</PercentComplete>");
    expect(xml).toContain("<PredecessorUID>1</PredecessorUID>");
    // 2 days lag = 9600 tenths of a minute
    expect(xml).toContain("<LinkLag>9600</LinkLag>");
  });

  it("round-trips MS Project XML back into JanttData losslessly", () => {
    const xml = exportMsProjectXml(samplePlan);
    const parsed = importMsProjectXml(xml);

    expect(parsed.meta?.title).toBe("Falcon Heavy Launch");
    expect(parsed.tasks).toHaveLength(3);
    expect(parsed.tasks[0].label).toBe("Structural Test");
    expect(parsed.tasks[0].progress).toBe(1.0);
    expect(parsed.tasks[0].start).toBe("2026-11-01");
    expect(parsed.tasks[0].end).toBe("2026-11-04");

    expect(parsed.tasks[1].label).toBe("Avionics Integration");
    expect(parsed.tasks[1].progress).toBe(0.5);
    expect(parsed.tasks[1].dependsOn).toBe("t1");

    expect(parsed.tasks[2].label).toBe("Cryogenic Static Fire");
    expect(parsed.tasks[2].dependsOn).toEqual([{ id: "t2", type: "FS", lagDays: 2 }]);
  });
});
