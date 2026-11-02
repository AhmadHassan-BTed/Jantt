/**
 * Spreadsheet CSV/TSV Interoperability
 *
 * Implements bidirectional RFC 4180 compliant CSV import and export with
 * dependency expressions, categories, owners, progress, and priority.
 */

import type { JanttData, Task } from "@jantt/core";

export function exportSpreadsheetCsv(plan: JanttData): string {
  const tasks = plan.tasks || [];
  const headers = ["ID", "Label", "Start", "End", "Progress", "Category", "Owner", "DependsOn", "Priority"];
  const rows: string[] = [headers.join(",")];

  for (const t of tasks) {
    const progressPct = t.progress !== undefined && t.progress !== null ? `${Math.round(t.progress * 100)}%` : "0%";
    let depsStr = "";
    if (typeof t.dependsOn === "string") {
      depsStr = t.dependsOn;
    } else if (Array.isArray(t.dependsOn)) {
      depsStr = t.dependsOn
        .map((d) => {
          if (typeof d === "string") return d;
          let s = `${d.id}:${d.type || "FS"}`;
          if (d.lagDays) s += d.lagDays > 0 ? `+${d.lagDays}d` : `${d.lagDays}d`;
          return s;
        })
        .join("; ");
    }

    const priorityVal = typeof t.priority === "string" ? t.priority : "";
    const ownerVal = typeof t.owner === "string" ? t.owner : (typeof t.assignee === "string" ? t.assignee : "");

    const row = [
      escapeCsvField(t.id),
      escapeCsvField(t.label || t.id),
      escapeCsvField(t.start || ""),
      escapeCsvField(t.end || ""),
      escapeCsvField(progressPct),
      escapeCsvField(t.category || "default"),
      escapeCsvField(ownerVal),
      escapeCsvField(depsStr),
      escapeCsvField(priorityVal)
    ];

    rows.push(row.join(","));
  }

  return rows.join("\r\n");
}

export function importSpreadsheetCsv(csvContent: string): JanttData {
  const records = parseCsv(csvContent);
  if (records.length === 0) {
    return { tasks: [] };
  }

  const rawHeaders = records[0];
  const headerMap: Record<string, number> = {};
  rawHeaders.forEach((h, i) => {
    headerMap[h.trim().toLowerCase()] = i;
  });

  const getCol = (row: string[], ...aliases: string[]): string => {
    for (const alias of aliases) {
      const idx = headerMap[alias.toLowerCase()];
      if (idx !== undefined && row[idx] !== undefined) {
        return row[idx].trim();
      }
    }
    return "";
  };

  const tasks: Task[] = [];

  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    if (row.length === 0 || (row.length === 1 && !row[0].trim())) continue;

    const id = getCol(row, "id", "task id", "code") || `t${i}`;
    const label = getCol(row, "label", "task", "name", "task name") || id;
    const start = getCol(row, "start", "start date", "target start") || "";
    const end = getCol(row, "end", "end date", "finish", "target finish") || start;
    const progressRaw = getCol(row, "progress", "% complete", "complete", "percent complete");
    const category = getCol(row, "category", "wbs", "group", "type") || "default";
    const owner = getCol(row, "owner", "assignee", "assigned to", "person") || undefined;
    const dependsOnRaw = getCol(row, "dependson", "depends on", "predecessors", "dependencies") || undefined;
    const priority = getCol(row, "priority") || undefined;

    let progress: number | undefined;
    if (progressRaw) {
      const clean = progressRaw.replace("%", "").trim();
      const num = parseFloat(clean);
      if (!isNaN(num)) {
        progress = num > 1 ? num / 100 : num;
      }
    }

    let dependsOn: any = undefined;
    if (dependsOnRaw) {
      const parts = dependsOnRaw.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length === 1) {
        dependsOn = parts[0];
      } else if (parts.length > 1) {
        dependsOn = parts;
      }
    }

    const task: Task = {
      id,
      label,
      category,
      start,
      end,
      ...(progress !== undefined ? { progress } : {}),
      ...(owner ? { owner } : {}),
      ...(dependsOn ? { dependsOn } : {}),
      ...(priority ? { priority: priority as any } : {})
    };

    tasks.push(task);
  }

  return {
    tasks
  };
}

function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n") || field.includes("\r")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentField);
        currentField = "";
      } else if (char === "\r") {
        if (nextChar === "\n") i++;
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
      } else if (char === "\n") {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}
