/**
 * Oracle Primavera P6 XER Interoperability
 *
 * Export writes a minimal P6 import set: CALENDAR (5-day, 8h), PROJECT, PROJWBS (one WBS
 * node per Jantt category under the project node), TASK and TASKPRED with 4-type
 * dependencies and lead/lag. Import reads actual / early / planned dates, status codes,
 * milestones, WBS nodes (as categories) and calendar-aware lag, and handles files that
 * contain several projects. Resources, costs and activity codes are not mapped
 * (see the package README field matrix).
 */

import type { JanttData, Task, DependencyType } from "@jantt/core";
import { getTaskDependencyRelations, getEffectiveGap, resolveRelationLag } from "@jantt/core";
import { countWorkdays, dependencyObject, isoDay } from "./ms-project.js";
import { decodeTextBytes } from "./spreadsheet.js";

export interface PrimaveraExportOptions {
  projectCode?: string;
  projectName?: string;
}

export interface PrimaveraImportOptions {
  /** Import only this project (matched against proj_id or proj_short_name). Default: every project. */
  projectId?: string;
  /** Receives a message for every recoverable problem (renamed ids, dropped links, ...). */
  onWarning?: (message: string) => void;
}

const TYPE_TO_P6: Record<DependencyType, string> = {
  FS: "PR_FS",
  SS: "PR_SS",
  FF: "PR_FF",
  SF: "PR_SF"
};

const P6_TO_TYPE = new Map<string, DependencyType>([
  ["PR_FS", "FS"],
  ["PR_SS", "SS"],
  ["PR_FF", "FF"],
  ["PR_SF", "SF"]
]);

const HOURS_PER_DAY = 8;
const PROJECT_ID = "1001";
const CALENDAR_ID = "1";
const ROOT_WBS_ID = 3000;

export function exportPrimaveraXer(plan: JanttData, options: PrimaveraExportOptions = {}): string {
  const tasks = (plan.tasks || []).filter((t) => t && !t._deleted);
  const projCode = xerField(options.projectCode || "PRJ-01", 40);
  const projName = xerField(options.projectName || plan.meta?.title || "Jantt Enterprise Project", 100);
  const today = new Date().toISOString().slice(0, 10);

  const lines: string[] = [];

  // 1. Header: version, export date, export type, user, user name, database, module, currency
  lines.push(`ERMHDR\t8.4\t${today}\tProject\tadmin\tJantt\tjantt\tProject Management\tUSD`);

  // 2. CALENDAR: one standard 5-day / 8-hour calendar referenced by the project and every task
  lines.push(`%T\tCALENDAR`);
  lines.push(`%F\tclndr_id\tdefault_flag\tclndr_name\tproj_id\tbase_clndr_id\tclndr_type\tday_hr_cnt\tweek_hr_cnt\tmonth_hr_cnt\tyear_hr_cnt`);
  lines.push(`%R\t${CALENDAR_ID}\tY\tStandard 5 Day Workweek\t\t\tCA_Base\t${HOURS_PER_DAY}\t${HOURS_PER_DAY * 5}\t${HOURS_PER_DAY * 21}\t${HOURS_PER_DAY * 250}`);

  // 3. PROJECT
  const datedStarts = tasks.map((t) => isoDay(t.start)).filter(Boolean).sort();
  const planStart = datedStarts[0] || today;
  lines.push(`%T\tPROJECT`);
  lines.push(`%F\tproj_id\tproj_short_name\tproj_name\tclndr_id\tplan_start_date`);
  lines.push(`%R\t${PROJECT_ID}\t${projCode}\t${projName}\t${CALENDAR_ID}\t${planStart} 08:00`);

  // 4. PROJWBS: project node + one node per category
  const wbsIdByCategory = new Map<string, number>();
  lines.push(`%T\tPROJWBS`);
  lines.push(`%F\twbs_id\tproj_id\tseq_num\tproj_node_flag\tstatus_code\twbs_short_name\twbs_name\tparent_wbs_id`);
  lines.push(`%R\t${ROOT_WBS_ID}\t${PROJECT_ID}\t0\tY\tWS_Open\t${xerField(projCode, 20)}\t${projName}\t`);
  for (const t of tasks) {
    const category = t.category || "default";
    if (wbsIdByCategory.has(category)) continue;
    const wbsId = ROOT_WBS_ID + wbsIdByCategory.size + 1;
    wbsIdByCategory.set(category, wbsId);
    const label = plan.categories?.[category]?.label || category;
    lines.push(`%R\t${wbsId}\t${PROJECT_ID}\t${wbsIdByCategory.size}\tN\tWS_Open\t${xerField(category, 20)}\t${xerField(label, 100)}\t${ROOT_WBS_ID}`);
  }

  // 5. TASK
  lines.push(`%T\tTASK`);
  lines.push(
    `%F\ttask_id\tproj_id\twbs_id\tclndr_id\ttask_code\ttask_name\ttask_type\tduration_type\tstatus_code\tphys_complete_pct` +
      `\ttarget_start_date\ttarget_end_date\ttarget_drtn_hr_cnt\tremain_drtn_hr_cnt\tact_start_date\tact_end_date`
  );

  const taskCodeToP6Id = new Map<string, number>();

  tasks.forEach((t, idx) => {
    const p6TaskId = 2000 + idx + 1;
    taskCodeToP6Id.set(t.id, p6TaskId);

    const progress = Math.min(1, Math.max(0, Number(t.progress) || 0));
    let statusCode = "TK_NotStart";
    if (progress >= 1) statusCode = "TK_Complete";
    else if (progress > 0) statusCode = "TK_Active";

    const start = isoDay(t.start) || today;
    const end = isoDay(t.end) || start;
    // Only flagged tasks are milestones; a single-day task is a one-day activity.
    const isMilestone = t.milestone === true;
    const durationHours = isMilestone ? 0 : Math.max(1, countWorkdays(start, end)) * HOURS_PER_DAY;
    const remainHours = statusCode === "TK_Complete" ? 0 : durationHours * (1 - progress);
    const startDate = `${start} 08:00`;
    const endDate = isMilestone ? startDate : `${end} 17:00`;

    lines.push(
      [
        "%R",
        p6TaskId,
        PROJECT_ID,
        wbsIdByCategory.get(t.category || "default"),
        CALENDAR_ID,
        xerField(t.id, 40),
        xerField(t.label || t.name || t.id, 120),
        isMilestone ? "TT_Mile" : "TT_Task",
        "DT_FixedDUR2",
        statusCode,
        Math.round(progress * 100),
        startDate,
        endDate,
        durationHours.toFixed(1),
        remainHours.toFixed(1),
        statusCode === "TK_NotStart" ? "" : startDate,
        statusCode === "TK_Complete" ? endDate : ""
      ].join("\t")
    );
  });

  // 6. TASKPRED
  lines.push(`%T\tTASKPRED`);
  lines.push(`%F\ttask_pred_id\ttask_id\tpred_task_id\tproj_id\tpred_proj_id\tpred_type\tlag_hr_cnt`);

  let predIdCounter = 1;
  tasks.forEach((t) => {
    const currentTaskId = taskCodeToP6Id.get(t.id);
    if (!currentTaskId) return;

    // Known ids keep an id such as "render-3d" from being read as "render" with a 3-day lead.
    for (const dep of getTaskDependencyRelations(t, taskCodeToP6Id)) {
      const predTaskId = taskCodeToP6Id.get(dep.id);
      if (!predTaskId || predTaskId === currentTaskId) continue;
      const predType = TYPE_TO_P6[dep.type] || "PR_FS";
      const lagHours = resolveRelationLag(dep, getEffectiveGap(t, plan.meta?.defaultGapDays)) * HOURS_PER_DAY;
      lines.push(`%R\t${predIdCounter++}\t${currentTaskId}\t${predTaskId}\t${PROJECT_ID}\t${PROJECT_ID}\t${predType}\t${lagHours.toFixed(1)}`);
    }
  });

  lines.push(`%E`);
  lines.push(``);

  return lines.join("\n");
}

export function importPrimaveraXer(content: string | ArrayBuffer | Uint8Array, options: PrimaveraImportOptions = {}): JanttData {
  const warn = options.onWarning || (() => {});
  const text = (typeof content === "string" ? content : decodeTextBytes(content)).replace(/^\uFEFF/, "");
  const tables = parseXerTables(text);

  const firstLine = text.slice(0, 200).trimStart();
  if (!firstLine.startsWith("ERMHDR") && tables.size === 0) {
    throw new Error("Not a Primavera P6 XER file: the ERMHDR header and %T tables are missing.");
  }
  const tasksRaw = tables.get("TASK") || [];
  if (tasksRaw.length === 0) {
    throw new Error("The XER file contains no TASK table rows (no activities to import).");
  }

  // Project selection
  const projects = tables.get("PROJECT") || [];
  let selected = projects;
  if (options.projectId) {
    selected = projects.filter((p) => p.proj_id === options.projectId || p.proj_short_name === options.projectId);
    if (selected.length === 0) {
      const available = projects.map((p) => p.proj_short_name || p.proj_id).join(", ") || "none";
      throw new Error(`Project "${options.projectId}" was not found in the XER file (available: ${available}).`);
    }
  } else if (projects.length > 1) {
    warn(`The XER file contains ${projects.length} projects; all of them were merged into one plan. Pass projectId to import a single project.`);
  }
  const selectedIds = new Set(selected.map((p) => p.proj_id));
  const inSelection = (projId: string | undefined) => !options.projectId || selectedIds.has(projId || "");

  // WBS nodes become categories; the project node maps to "default".
  const wbsById = new Map<string, Record<string, string>>();
  for (const wbs of tables.get("PROJWBS") || []) wbsById.set(wbs.wbs_id, wbs);

  const projectTitle = (project: Record<string, string> | undefined): string | undefined => {
    if (!project) return undefined;
    const rootWbs = (tables.get("PROJWBS") || []).find((w) => w.proj_id === project.proj_id && w.proj_node_flag === "Y");
    return project.proj_name || rootWbs?.wbs_name || project.proj_short_name || undefined;
  };
  const projTitle = projectTitle(selected[0]) || "Imported Primavera Project";
  const shortNameByProj = new Map(projects.map((p) => [p.proj_id, p.proj_short_name || p.proj_id]));

  const hoursPerDayByCalendar = new Map<string, number>();
  for (const cal of tables.get("CALENDAR") || []) {
    const hours = parseFloat(cal.day_hr_cnt);
    if (hours > 0) hoursPerDayByCalendar.set(cal.clndr_id, hours);
  }

  const p6IdToTask = new Map<string, Task>();
  const hoursPerDayByTask = new Map<string, number>();
  const usedIds = new Set<string>();
  let renamed = 0;
  let undated = 0;

  for (const row of tasksRaw) {
    if (!inSelection(row.proj_id)) continue;

    const isMilestone = row.task_type === "TT_Mile" || row.task_type === "TT_FinMile";
    // Prefer actual dates, then the current (early) schedule, then the planned target dates.
    let start = firstDay(row.act_start_date, row.early_start_date, row.target_start_date);
    let end = firstDay(row.act_end_date, row.early_end_date, row.target_end_date);
    if (isMilestone) {
      start = start || end;
      end = start;
    }
    if (!start) {
      undated++;
      continue;
    }
    if (!end || end < start) end = start;

    const baseId = row.task_code || `task_${row.task_id}`;
    let id = baseId;
    if (usedIds.has(id)) {
      // task_code is only unique within a project: qualify by the project short name, then number.
      id = `${baseId}-${shortNameByProj.get(row.proj_id) || row.proj_id}`;
      for (let n = 2; usedIds.has(id); n++) id = `${baseId}-${n}`;
      renamed++;
    }
    usedIds.add(id);

    const status = row.status_code;
    const pct = parseFloat(row.phys_complete_pct);
    const progress = status === "TK_Complete" ? 1 : (Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) / 100 : 0);
    const wbs = wbsById.get(row.wbs_id);

    const task: Task = {
      id,
      label: row.task_name || id,
      category: (wbs && wbs.proj_node_flag !== "Y" && (wbs.wbs_short_name || wbs.wbs_name)) || "default",
      start,
      end,
      progress,
      ...(isMilestone ? { milestone: true } : {}),
      ...(status === "TK_Complete" ? { status: "completed" } : status === "TK_Active" ? { status: "in-progress" } : {})
    };

    p6IdToTask.set(row.task_id, task);
    hoursPerDayByTask.set(row.task_id, hoursPerDayByCalendar.get(row.clndr_id) || HOURS_PER_DAY);
  }

  // Map dependencies (task_id is unique across the whole file, so links resolve across projects).
  let droppedLinks = 0;
  for (const pred of tables.get("TASKPRED") || []) {
    const successor = p6IdToTask.get(pred.task_id);
    const predecessor = p6IdToTask.get(pred.pred_task_id);
    if (!successor || !predecessor || successor === predecessor) {
      if (inSelection(pred.proj_id)) droppedLinks++;
      continue;
    }

    // P6 measures relationship lag on the predecessor's calendar by default.
    const lagHours = parseFloat(pred.lag_hr_cnt) || 0;
    const depObj = dependencyObject(
      predecessor.id,
      P6_TO_TYPE.get(pred.pred_type) || "FS",
      Math.round(lagHours / (hoursPerDayByTask.get(pred.pred_task_id) || HOURS_PER_DAY)) || 0
    );

    if (Array.isArray(successor.dependsOn)) {
      successor.dependsOn.push(depObj);
    } else {
      successor.dependsOn = [depObj];
    }
  }

  const tasks: Task[] = Array.from(p6IdToTask.values());
  if (tasks.length === 0) {
    throw new Error("The XER file contains no dated activities for the selected project.");
  }
  if (renamed) warn(`${renamed} activity code(s) were duplicated across projects and were given unique ids.`);
  if (undated) warn(`${undated} activit(y/ies) without dates were skipped.`);
  if (droppedLinks) warn(`${droppedLinks} relationship(s) pointing to missing or skipped activities were dropped.`);

  return {
    meta: {
      title: projTitle
    },
    tasks
  };
}

/** Parses %T / %F / %R records into rows keyed by field name (prototype-free records). */
function parseXerTables(text: string): Map<string, Record<string, string>[]> {
  const tables = new Map<string, Record<string, string>[]>();
  let currentRows: Record<string, string>[] | null = null;
  let currentFields: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const tokens = line.split("\t");
    const tag = tokens[0];

    if (tag === "%T") {
      const name = (tokens[1] || "").trim();
      currentRows = tables.get(name) || [];
      tables.set(name, currentRows);
      currentFields = [];
    } else if (tag === "%F") {
      currentFields = tokens.slice(1).map((f) => f.trim());
    } else if (tag === "%R" && currentRows) {
      const record: Record<string, string> = Object.create(null);
      currentFields.forEach((field, i) => {
        record[field] = tokens[i + 1] ?? "";
      });
      currentRows.push(record);
    }
  }

  return tables;
}

/** First valid YYYY-MM-DD among XER date values ("2026-11-01 08:00"). */
function firstDay(...values: (string | undefined)[]): string {
  for (const value of values) {
    const day = isoDay((value || "").split(" ")[0]);
    if (day) return day;
  }
  return "";
}

/** Makes a value safe for one tab-separated XER field and enforces the P6 column length. */
function xerField(value: unknown, maxLength: number): string {
  const clean = String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
  const chars = Array.from(clean);
  return chars.length > maxLength ? chars.slice(0, maxLength).join("") : clean;
}
