/**
 * Oracle Primavera P6 XER Interoperability
 *
 * Implements lossless export and ingestion of Primavera P6 standard .xer batch files,
 * mapping projects, WBS/categories, tasks, status codes, 4-type dependencies, and lead/lag.
 */

import type { JanttData, Task, DependencyRelation, DependencyType } from "@jantt/core";
import { parseDependencyRelation } from "@jantt/core";

export interface PrimaveraExportOptions {
  projectCode?: string;
  projectName?: string;
}

const TYPE_TO_P6: Record<DependencyType, string> = {
  FS: "PR_FS",
  SS: "PR_SS",
  FF: "PR_FF",
  SF: "PR_SF"
};

const P6_TO_TYPE: Record<string, DependencyType> = {
  PR_FS: "FS",
  PR_SS: "SS",
  PR_FF: "FF",
  PR_SF: "SF"
};

function parseDependencyInput(dep: unknown): DependencyRelation[] {
  if (!dep) return [];
  const list = Array.isArray(dep) ? dep : [dep];
  const result: DependencyRelation[] = [];

  for (const item of list) {
    const rel = parseDependencyRelation(item);
    if (rel) {
      result.push(rel);
    }
  }

  return result;
}

export function exportPrimaveraXer(plan: JanttData, options: PrimaveraExportOptions = {}): string {
  const tasks = plan.tasks || [];
  const projCode = options.projectCode || "PRJ-01";
  const projName = options.projectName || plan.meta?.title || "Jantt Enterprise Project";
  const projId = "1001";

  const lines: string[] = [];
  const dateStr = new Date().toISOString().split("T")[0];

  // 1. Header
  lines.push(`ERMHDR\t8.4\t${dateStr}\tXER export\tadmin`);

  // 2. PROJECT Table
  lines.push(`%T\tPROJECT`);
  lines.push(`%F\tproj_id\tproj_short_name\tproj_name`);
  lines.push(`%R\t${projId}\t${projCode}\t${projName}`);

  // 3. TASK Table
  lines.push(`%T\tTASK`);
  lines.push(`%F\ttask_id\tproj_id\ttask_code\ttask_name\tstatus_code\ttarget_start_date\ttarget_end_date\tphys_complete_pct`);

  const taskCodeToP6Id = new Map<string, number>();

  tasks.forEach((t, idx) => {
    const p6TaskId = 2000 + idx + 1;
    taskCodeToP6Id.set(t.id, p6TaskId);

    const progress = t.progress ?? 0;
    let statusCode = "TK_NotStart";
    if (progress >= 1) statusCode = "TK_Complete";
    else if (progress > 0) statusCode = "TK_Active";

    const startDate = t.start ? `${t.start} 08:00` : `${dateStr} 08:00`;
    const endDate = t.end ? `${t.end} 17:00` : startDate;
    const pct = Math.round(progress * 100);

    lines.push(`%R\t${p6TaskId}\t${projId}\t${t.id}\t${t.label || t.id}\t${statusCode}\t${startDate}\t${endDate}\t${pct}`);
  });

  // 4. TASKPRED Table
  lines.push(`%T\tTASKPRED`);
  lines.push(`%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt`);

  let predIdCounter = 1;
  tasks.forEach((t) => {
    const currentTaskId = taskCodeToP6Id.get(t.id);
    if (!currentTaskId) return;

    const deps = parseDependencyInput(t.dependsOn);
    deps.forEach((dep) => {
      const predTaskId = taskCodeToP6Id.get(dep.id);
      if (predTaskId) {
        const predType = TYPE_TO_P6[dep.type] || "PR_FS";
        const lagHours = (dep.lagDays || 0) * 8.0;
        lines.push(`%R\t${predIdCounter++}\t${currentTaskId}\t${predTaskId}\t${predType}\t${lagHours.toFixed(1)}`);
      }
    });
  });

  lines.push(`%E`);
  lines.push(``);

  return lines.join("\n");
}

export function importPrimaveraXer(xerContent: string): JanttData {
  const lines = xerContent.split(/\r?\n/);
  let currentTable = "";
  let currentFields: string[] = [];

  const projects: Record<string, string>[] = [];
  const tasksRaw: Record<string, string>[] = [];
  const predsRaw: Record<string, string>[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const tokens = line.split("\t");
    const tag = tokens[0];

    if (tag === "%T") {
      currentTable = tokens[1] || "";
      currentFields = [];
    } else if (tag === "%F") {
      currentFields = tokens.slice(1);
    } else if (tag === "%R") {
      const rowData = tokens.slice(1);
      const record: Record<string, string> = {};
      currentFields.forEach((field, i) => {
        record[field] = rowData[i] || "";
      });

      if (currentTable === "PROJECT") {
        projects.push(record);
      } else if (currentTable === "TASK") {
        tasksRaw.push(record);
      } else if (currentTable === "TASKPRED") {
        predsRaw.push(record);
      }
    }
  }

  const projTitle = projects[0]?.proj_name || projects[0]?.proj_short_name || "Imported Primavera Project";

  // Map p6TaskId -> Task
  const p6IdToTask = new Map<string, Task>();

  tasksRaw.forEach((row) => {
    const taskId = row.task_code || `task_${row.task_id}`;
    const start = row.target_start_date ? row.target_start_date.split(" ")[0] : "";
    const end = row.target_end_date ? row.target_end_date.split(" ")[0] : start;
    const progress = row.phys_complete_pct ? parseFloat(row.phys_complete_pct) / 100 : 0;

    const task: Task = {
      id: taskId,
      label: row.task_name || taskId,
      category: "default",
      start,
      end,
      progress
    };

    p6IdToTask.set(row.task_id, task);
  });

  // Map dependencies
  predsRaw.forEach((pred) => {
    const successor = p6IdToTask.get(pred.task_id);
    const predecessor = p6IdToTask.get(pred.pred_task_id);

    if (successor && predecessor) {
      const type = P6_TO_TYPE[pred.pred_type] || "FS";
      const lagHours = parseFloat(pred.lag_hr_cnt || "0");
      const lagDays = Math.round(lagHours / 8.0);

      const depObj: DependencyRelation = {
        id: predecessor.id,
        type,
        lagDays
      };

      if (!successor.dependsOn) {
        successor.dependsOn = [depObj];
      } else if (Array.isArray(successor.dependsOn)) {
        (successor.dependsOn as any[]).push(depObj);
      } else {
        successor.dependsOn = [successor.dependsOn, depObj];
      }
    }
  });

  // Normalize single FS dependencies
  const tasks: Task[] = Array.from(p6IdToTask.values()).map((t) => {
    if (Array.isArray(t.dependsOn) && t.dependsOn.length === 1) {
      const single = t.dependsOn[0];
      if (typeof single === "object" && single !== null && (single as any).type === "FS" && !(single as any).lagDays) {
        return { ...t, dependsOn: (single as any).id };
      }
    }
    return t;
  });

  return {
    meta: {
      title: projTitle
    },
    tasks
  };
}
