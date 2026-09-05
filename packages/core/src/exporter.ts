import { JanttData } from "./types";
import { diffDays } from "./date-math";

/**
 * Serializes JanttData into RFC-4180 compliant CSV format.
 */
export function exportToCsv(data: JanttData): string {
  const headers = [
    "Task ID",
    "WBS",
    "Label / Name",
    "Category",
    "Assignee",
    "Priority",
    "Start Date",
    "End Date",
    "Duration (Days)",
    "Estimated Budget ($)",
    "Progress (%)",
    "Milestone",
    "Depends On",
    "Status",
    "Notes"
  ];

  const rows = (data.tasks || [])
    .filter((t) => !t._deleted)
    .map((t) => {
    const duration = Math.max(diffDays(t.start, t.end), 0);
    const progressPct = t.progress !== undefined && t.progress !== null ? `${Math.round(t.progress * 100)}%` : "";
    const isMilestone = Boolean(t.milestone || duration === 0);

    return [
      escapeCsv(t.id),
      escapeCsv(t.wbs || ""),
      escapeCsv(t.label || t.name || t.id),
      escapeCsv(t.category || ""),
      escapeCsv(t.assignee || ""),
      escapeCsv(t.priority || ""),
      escapeCsv(t.start || ""),
      escapeCsv(t.end || ""),
      String(duration),
      t.estimatedCost !== undefined && t.estimatedCost !== null ? String(t.estimatedCost) : "",
      escapeCsv(progressPct),
      isMilestone ? "TRUE" : "FALSE",
      escapeCsv(Array.isArray(t.dependsOn) ? t.dependsOn.join("; ") : (t.dependsOn || "")),
      escapeCsv(t.status || ""),
      escapeCsv(t.notes || "")
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\r\n");
}

/**
 * Downloads data as a CSV file in browser environment.
 */
export function downloadCsv(data: JanttData, filename = "jantt-schedule.csv"): void {
  const csvContent = exportToCsv(data);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

/**
 * Downloads raw JSON state as a formatted .json file.
 */
export function downloadJson(data: JanttData, filename = "jantt-schedule.json"): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
  triggerDownload(blob, filename);
}

/**
 * Extracts and serializes the SVG dependency overlay from a rendered Jantt container.
 */
export function exportSvgString(container: HTMLElement): string | null {
  const svg = container.querySelector<SVGSVGElement>("svg.jantt-svg-overlay");
  if (!svg) return null;
  const serializer = new XMLSerializer();
  return serializer.serializeToString(svg);
}

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n") || val.includes("\r")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function triggerDownload(blob: Blob, filename: string): void {
  if (typeof window === "undefined" || !window.document) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
