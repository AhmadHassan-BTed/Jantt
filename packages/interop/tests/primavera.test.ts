import { describe, it, expect } from "vitest";
import { exportPrimaveraXer, importPrimaveraXer } from "../src/primavera.js";
import type { JanttData } from "@jantt/core";

describe("Oracle Primavera P6 XER Interoperability", () => {
  const enterprisePlan: JanttData = {
    meta: { title: "Turbine Overhaul 2026" },
    tasks: [
      { id: "M1", label: "Shutdown & Disassembly", start: "2026-11-01", end: "2026-11-08", progress: 1.0 },
      { id: "M2", label: "Rotor Inspection", start: "2026-11-09", end: "2026-11-15", progress: 0.6, dependsOn: "M1" },
      {
        id: "M3",
        label: "Rebalancing & Alignment",
        start: "2026-11-16",
        end: "2026-11-20",
        progress: 0,
        dependsOn: [{ id: "M2", type: "SS", lagDays: 1 }]
      }
    ]
  };

  it("exports valid Primavera P6 .xer format", () => {
    const xer = exportPrimaveraXer(enterprisePlan, { projectCode: "TB-2026", projectName: "Turbine Overhaul 2026" });

    expect(xer).toContain("ERMHDR\t8.4\t");
    expect(xer).toContain("%T\tPROJECT");
    expect(xer).toContain("%T\tTASK");
    expect(xer).toContain("%T\tTASKPRED");
    expect(xer).toContain("Turbine Overhaul 2026");
    expect(xer).toContain("Shutdown & Disassembly");
    expect(xer).toContain("TK_Complete");
    expect(xer).toContain("TK_Active");
    expect(xer).toContain("TK_NotStart");
    expect(xer).toContain("PR_SS");
    expect(xer).toContain("%E");
  });

  it("imports Primavera P6 .xer format back into JanttData", () => {
    const xer = exportPrimaveraXer(enterprisePlan);
    const parsed = importPrimaveraXer(xer);

    expect(parsed.meta?.title).toBe("Turbine Overhaul 2026");
    expect(parsed.tasks).toHaveLength(3);

    const m1 = parsed.tasks.find((t) => t.id === "M1");
    expect(m1?.label).toBe("Shutdown & Disassembly");
    expect(m1?.progress).toBe(1.0);

    const m2 = parsed.tasks.find((t) => t.id === "M2");
    expect(m2?.dependsOn).toBe("M1");

    const m3 = parsed.tasks.find((t) => t.id === "M3");
    expect(m3?.dependsOn).toEqual([{ id: "M2", type: "SS", lagDays: 1 }]);
  });
});
