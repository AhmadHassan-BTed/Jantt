import { describe, it, expect } from "vitest";
import { exportPrimaveraXer, importPrimaveraXer } from "../src/primavera.js";
import type { JanttData } from "@jantt/core";

describe("Oracle Primavera P6 XER Interoperability", () => {
  const enterprisePlan: JanttData = {
    meta: { title: "Turbine Overhaul 2026" },
    tasks: [
      { id: "M1", label: "Shutdown & Disassembly", category: "mech", start: "2026-11-01", end: "2026-11-08", progress: 1.0 },
      { id: "M2", label: "Rotor Inspection", category: "mech", start: "2026-11-09", end: "2026-11-15", progress: 0.6, dependsOn: "M1" },
      {
        id: "M3",
        label: "Rebalancing & Alignment",
        category: "mech",
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
    expect(m2?.dependsOn).toEqual([{ id: "M1", type: "FS", lagDays: 2 }]);

    const m3 = parsed.tasks.find((t) => t.id === "M3");
    expect(m3?.dependsOn).toEqual([{ id: "M2", type: "SS", lagDays: 1 }]);
  });

  it("writes the CALENDAR, PROJWBS and typed TASK fields P6 needs", () => {
    const xer = exportPrimaveraXer({
      categories: { eng: { label: "Engineering", color: "#000" } },
      tasks: [
        { id: "A", label: "Work", category: "eng", start: "2026-11-02", end: "2026-11-06" },
        { id: "G", label: "Gate", category: "eng", start: "2026-11-09", end: "2026-11-09", milestone: true, dependsOn: "A" }
      ]
    });
    const lines = xer.split("\n");
    const tables = lines.filter((l) => l.startsWith("%T\t")).map((l) => l.split("\t")[1]);
    expect(tables).toEqual(["CALENDAR", "PROJECT", "PROJWBS", "TASK", "TASKPRED"]);
    expect(lines[0].split("\t")).toHaveLength(9);

    const taskFields = lines[lines.indexOf("%T\tTASK") + 1].split("\t").slice(1);
    const taskRows = lines.filter((l, i) => i > lines.indexOf("%T\tTASK") && i < lines.indexOf("%T\tTASKPRED") && l.startsWith("%R"));
    const rowOf = (line: string) => Object.fromEntries(taskFields.map((f, i) => [f, line.split("\t")[i + 1]]));
    const work = rowOf(taskRows[0]);
    const gate = rowOf(taskRows[1]);
    expect(work).toMatchObject({ clndr_id: "1", task_type: "TT_Task", target_drtn_hr_cnt: "40.0" });
    expect(gate).toMatchObject({ task_type: "TT_Mile", target_drtn_hr_cnt: "0.0" });
    expect(work.wbs_id).toBe(gate.wbs_id);
    expect(xer).toContain("\tEngineering\t3000");

    const predFields = lines[lines.indexOf("%T\tTASKPRED") + 1];
    expect(predFields).toContain("\tproj_id\tpred_proj_id\t");

    // Category survives the round trip through the WBS node
    expect(importPrimaveraXer(xer).tasks.map((t) => t.category)).toEqual(["eng", "eng"]);
  });

  it("sanitizes tabs and newlines so labels cannot break or inject records", () => {
    const xer = exportPrimaveraXer({
      tasks: [
        { id: "X1", label: "Evil\tcolumn\n%T\tTASKPRED\n%R\t9\t9", category: "dev", start: "2026-11-02", end: "2026-11-03" },
        { id: "N1", name: "Name alias only", category: "dev", start: "2026-11-02", end: "2026-11-03" }
      ]
    });
    expect(xer.split("\n").filter((l) => l === "%T\tTASKPRED")).toHaveLength(1);
    const parsed = importPrimaveraXer(xer);
    expect(parsed.tasks).toHaveLength(2);
    expect(parsed.tasks[0].label).toBe("Evil column %T TASKPRED %R 9 9");
    expect(parsed.tasks[1].label).toBe("Name alias only");
  });

  it("exports unflagged single-day tasks as activities and resolves ids that look like lag shorthand", () => {
    const xer = exportPrimaveraXer({
      tasks: [
        { id: "render-3d", label: "Render", category: "dev", start: "2026-11-02", end: "2026-11-02" },
        { id: "qa", label: "QA", category: "dev", start: "2026-11-03", end: "2026-11-04", dependsOn: "render-3d" }
      ]
    });
    const lines = xer.split("\n");
    const taskFields = lines[lines.indexOf("%T\tTASK") + 1].split("\t").slice(1);
    const render = lines.find((l) => l.startsWith("%R\t2001\t"))!.split("\t").slice(1);
    const row = Object.fromEntries(taskFields.map((f, i) => [f, render[i]]));
    expect(row).toMatchObject({ task_type: "TT_Task", target_drtn_hr_cnt: "8.0", target_end_date: "2026-11-02 17:00" });

    const pred = lines.slice(lines.indexOf("%T\tTASKPRED") + 2).find((l) => l.startsWith("%R"))!;
    expect(pred.split("\t").slice(2, 4)).toEqual(["2002", "2001"]);
    expect(pred.endsWith("\tPR_FS\t16.0")).toBe(true);

    const parsed = importPrimaveraXer(xer);
    expect(parsed.tasks[0].milestone).toBeUndefined();
    expect(parsed.tasks[1].dependsOn).toEqual([{ id: "render-3d", type: "FS", lagDays: 2 }]);
  });

  it("skips tombstones on export", () => {
    const xer = exportPrimaveraXer({
      tasks: [
        { id: "gone", label: "Deleted", category: "dev", start: "2026-11-02", end: "2026-11-03", _deleted: true },
        { id: "ok", label: "Kept", category: "dev", start: "2026-11-02", end: "2026-11-03" }
      ]
    });
    expect(xer).not.toContain("Deleted");
    expect(importPrimaveraXer(xer).tasks.map((t) => t.id)).toEqual(["ok"]);
  });

  const realWorldXer = [
    "ERMHDR\t19.12\t2026-11-01\tProject\tadmin\tAdmin\tdbxDatabaseNoName\tProject Management\tUSD",
    "%T\tCALENDAR",
    "%F\tclndr_id\tclndr_name\tday_hr_cnt",
    "%R\t7\tTen hour days\t10",
    "%T\tPROJECT",
    "%F\tproj_id\tproj_short_name",
    "%R\t100\tALPHA",
    "%R\t200\tBETA",
    "%T\tPROJWBS",
    "%F\twbs_id\tproj_id\tproj_node_flag\twbs_short_name\twbs_name",
    "%R\t1\t100\tY\tALPHA\tAlpha Refinery Upgrade",
    "%R\t2\t100\tN\tMECH\tMechanical",
    "%R\t3\t200\tY\tBETA\tBeta Pipeline",
    "%T\tTASK",
    "%F\ttask_id\tproj_id\twbs_id\tclndr_id\ttask_code\ttask_name\ttask_type\tstatus_code\tphys_complete_pct\tact_start_date\tact_end_date\tearly_start_date\tearly_end_date\ttarget_start_date\ttarget_end_date",
    "%R\t11\t100\t2\t7\tA1000\tExcavation\tTT_Task\tTK_Complete\t0\t2026-11-03 08:00\t2026-11-10 17:00\t\t\t2026-11-02 08:00\t2026-11-06 17:00",
    "%R\t12\t100\t2\t7\tA1010\tPiping\tTT_Task\tTK_Active\t25\t2026-11-11 08:00\t\t2026-11-11 08:00\t2026-11-20 17:00\t2026-11-09 08:00\t2026-11-13 17:00",
    "%R\t13\t100\t1\t7\tA1020\tMechanical Completion\tTT_FinMile\tTK_NotStart\t0\t\t\t\t2026-11-27 17:00\t\t2026-11-20 17:00",
    "%R\t21\t200\t3\t\tA1000\tSurvey\tTT_Task\tTK_NotStart\t0\t\t\t2026-12-01 08:00\t2026-12-04 17:00\t2026-12-01 08:00\t2026-12-04 17:00",
    "%T\tTASKPRED",
    "%F\ttask_pred_id\ttask_id\tpred_task_id\tproj_id\tpred_proj_id\tpred_type\tlag_hr_cnt",
    "%R\t1\t12\t11\t100\t100\tPR_SS\t20",
    "%R\t2\t13\t12\t100\t100\tconstructor\t0",
    "%R\t3\t21\t13\t200\t100\tPR_FS\t0",
    "%E"
  ].join("\r\n");

  it("imports actual/early dates, status, milestones, WBS categories and calendar-aware lag", () => {
    const warnings: string[] = [];
    const parsed = importPrimaveraXer(realWorldXer, { onWarning: (m) => warnings.push(m) });
    const byName = Object.fromEntries(parsed.tasks.map((t) => [t.label, t]));

    expect(parsed.meta?.title).toBe("Alpha Refinery Upgrade");
    // Completed: actual dates and 100% even though physical % is 0
    expect(byName["Excavation"]).toMatchObject({ start: "2026-11-03", end: "2026-11-10", progress: 1, status: "completed", category: "MECH" });
    // In progress: actual start, early (forecast) finish
    expect(byName["Piping"]).toMatchObject({ start: "2026-11-11", end: "2026-11-20", progress: 0.25, status: "in-progress" });
    // 20h lag on a 10h/day calendar = 2 days
    expect(byName["Piping"].dependsOn).toEqual([{ id: "A1000", type: "SS", lagDays: 2 }]);
    // Finish milestone: single date, project-node WBS -> default category; unknown pred_type -> FS
    expect(byName["Mechanical Completion"]).toMatchObject({ start: "2026-11-27", end: "2026-11-27", milestone: true, category: "default", dependsOn: [{ id: "A1010", type: "FS", lagDays: 0 }] });
    // Duplicate task_code from the second project is renamed, links still resolve by task_id
    expect(byName["Survey"].id).toBe("A1000-BETA");
    expect(byName["Survey"].dependsOn).toEqual([{ id: "A1020", type: "FS", lagDays: 0 }]);
    expect(warnings.join("\n")).toMatch(/2 projects/);
    expect(warnings.join("\n")).toMatch(/duplicated/);
  });

  it("imports a single project when projectId is given", () => {
    const beta = importPrimaveraXer(realWorldXer, { projectId: "BETA" });
    expect(beta.meta?.title).toBe("Beta Pipeline");
    expect(beta.tasks.map((t) => t.id)).toEqual(["A1000"]);
    expect(beta.tasks[0].dependsOn).toBeUndefined();

    expect(() => importPrimaveraXer(realWorldXer, { projectId: "GAMMA" })).toThrow(/available: ALPHA, BETA/);
  });

  it("rejects files that are not XER exports", () => {
    expect(() => importPrimaveraXer("just some text")).toThrow(/Not a Primavera P6 XER/);
    expect(() => importPrimaveraXer("ERMHDR\t8.4\n%T\tPROJECT\n%F\tproj_id\n%R\t1\n%E")).toThrow(/no TASK table/);
  });

  it("decodes Windows-1252 byte input", () => {
    const xer = exportPrimaveraXer({ tasks: [{ id: "C1", label: "Café Überprüfung", category: "dev", start: "2026-11-02", end: "2026-11-03" }] });
    const ansi = Uint8Array.from(xer, (ch) => ch.charCodeAt(0));
    expect(importPrimaveraXer(ansi).tasks[0].label).toBe("Café Überprüfung");
  });
});
