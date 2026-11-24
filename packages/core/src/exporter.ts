import { JanttData } from "./types";
import { diffDays, taskDurationDays } from "./date-math";
import { getTaskDependencyRelations, DependencyRelation } from "./dependencies";

const SVG_NS = "http://www.w3.org/2000/svg";
/** Presentation properties inlined into exported SVG elements (resolved from the live theme). */
const SVG_STYLE_PROPS = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity"] as const;

/**
 * Serializes JanttData into RFC-4180 compliant CSV format.
 * Durations are inclusive calendar days (a task from the 1st to the 5th lasts 5 days);
 * milestones (flagged, or starting and ending on the same day, as the chart draws them) have a
 * duration of 0.
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

  const tasks = (data.tasks || []).filter((t) => t && !t._deleted);
  // The plan's ids, so links to ids such as "model-3d" are not exported as "model" with a lead.
  const knownIds = new Set((data.tasks || []).map((t) => t?.id));
  const rows = tasks.map((t) => {
    // Same rule as the layout, so the CSV describes what the chart shows.
    const isMilestone = Boolean(t.milestone) || diffDays(t.start, t.end) === 0;
    const progressPct =
      typeof t.progress === "number" && Number.isFinite(t.progress) ? `${Math.round(t.progress * 100)}%` : "";

    return [
      t.id,
      t.wbs,
      t.label || t.name || t.id,
      t.category,
      t.assignee,
      t.priority,
      t.start,
      t.end,
      taskDurationDays(t.start, t.end, isMilestone),
      t.estimatedCost,
      progressPct,
      isMilestone ? "TRUE" : "FALSE",
      getTaskDependencyRelations(t, knownIds).map(formatRelation).join("; "),
      t.status,
      t.notes
    ]
      .map(csvCell)
      .join(",");
  });

  return [headers.join(","), ...rows].join("\r\n");
}

/**
 * Downloads data as a CSV file in browser environment.
 */
export function downloadCsv(data: JanttData, filename = "jantt-schedule.csv"): void {
  const csvContent = exportToCsv(data);
  // Prepend a UTF-8 BOM so Microsoft Excel opens UTF-8 characters properly
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, safeFilename(filename, ".csv", "jantt-schedule"));
}

/**
 * Downloads the plan as a formatted .json file. Soft-deleted tasks and notes (sync tombstones)
 * are left out so they cannot reappear in importers that do not understand them.
 */
export function downloadJson(data: JanttData, filename = "jantt-schedule.json"): void {
  const exported: JanttData = {
    ...data,
    tasks: (data.tasks || []).filter((t) => t && !t._deleted),
    ...(Array.isArray(data.notes) ? { notes: data.notes.filter((n) => n && !n._deleted) } : {})
  };
  const jsonStr = JSON.stringify(exported, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
  triggerDownload(blob, safeFilename(filename, ".json", "jantt-schedule"));
}

/**
 * Serializes the rendered timeline canvas of a mounted chart (task bars, milestones, bar labels
 * and dependency links) as a self-contained SVG document. Colors are resolved from the active
 * theme and inlined, so the file renders the same outside the page. The date header and the
 * label table are not included. Returns null when the container holds no rendered chart.
 */
export function exportSvgString(container: HTMLElement): string | null {
  const overlay = container.querySelector<SVGSVGElement>("svg.jantt-svg-overlay");
  if (!overlay) return null;
  const canvas = overlay.parentElement;
  const width = Math.max(1, Math.round(parseFloat(overlay.getAttribute("width") || "") || canvas?.offsetWidth || 1));
  const height = Math.max(1, Math.round(parseFloat(overlay.getAttribute("height") || "") || canvas?.offsetHeight || 1));

  // Created in the SVG namespace, so the serializer emits xmlns itself.
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const background = canvas ? readStyle(canvas.closest<HTMLElement>(".jantt-container") ?? canvas, "background-color") : "";
  if (background && !isTransparent(background)) {
    const bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", background);
    svg.appendChild(bg);
  }

  // Dependency links, with theme-driven styles copied from the live elements.
  const links = overlay.cloneNode(true) as SVGSVGElement;
  const liveNodes = overlay.querySelectorAll<SVGElement>("*");
  const clonedNodes = links.querySelectorAll<SVGElement>("*");
  liveNodes.forEach((live, i) => inlineSvgStyles(live, clonedNodes[i]));
  links.removeAttribute("style");
  links.removeAttribute("class");
  svg.appendChild(links);

  if (canvas) {
    canvas.querySelectorAll<HTMLElement>(".jantt-task-bar[data-task-id], .jantt-milestone[data-task-id]").forEach((el) => {
      const isMilestone = el.classList.contains("jantt-milestone");
      const x = parseFloat(el.style.left) || 0;
      const y = parseFloat(el.style.top) || 0;
      const w = parseFloat(el.style.width) || 0;
      const h = parseFloat(el.style.height) || 0;
      const fill = readStyle(el, "background-color") || "#64748B";
      const name = el.getAttribute("aria-label") || el.querySelector(".jantt-bar-title")?.textContent || el.dataset.taskId;
      const label = [name, el.getAttribute("aria-description")].filter(Boolean).join(", ");
      const group = document.createElementNS(SVG_NS, "g");
      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = label;
      group.appendChild(title);

      if (isMilestone) {
        // Milestones are drawn centered on (x, y) and rotated 45 degrees.
        const r = (w / 2) * Math.SQRT2;
        const diamond = document.createElementNS(SVG_NS, "polygon");
        diamond.setAttribute("points", `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`);
        diamond.setAttribute("fill", fill);
        group.appendChild(diamond);
      } else {
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("x", String(x));
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", String(w));
        rect.setAttribute("height", String(h));
        rect.setAttribute("rx", "4");
        rect.setAttribute("fill", fill);
        group.appendChild(rect);

        const progressEl = el.querySelector<HTMLElement>(".jantt-task-progress");
        const ratio = Math.max(0, Math.min(1, (parseFloat(progressEl?.style.width || "") || 0) / 100));
        if (progressEl && ratio > 0) {
          const prog = document.createElementNS(SVG_NS, "rect");
          prog.setAttribute("x", String(x));
          prog.setAttribute("y", String(y));
          prog.setAttribute("width", String(w * ratio));
          prog.setAttribute("height", String(h));
          prog.setAttribute("rx", "4");
          prog.setAttribute("fill", readStyle(progressEl, "background-color") || "rgba(0,0,0,0.25)");
          group.appendChild(prog);
        }

        const text = el.querySelector(".jantt-bar-content span")?.textContent?.trim();
        if (text) {
          const t = document.createElementNS(SVG_NS, "text");
          t.setAttribute("x", String(x + 8));
          t.setAttribute("y", String(y + h / 2));
          t.setAttribute("dominant-baseline", "middle");
          t.setAttribute("font-family", "system-ui, sans-serif");
          t.setAttribute("font-size", "11");
          t.setAttribute("fill", readStyle(el, "color") || "#FFFFFF");
          t.textContent = text;
          group.appendChild(t);
        }
      }
      svg.appendChild(group);
    });
  }

  return new XMLSerializer().serializeToString(svg);
}

/** `id` for a plain finish-to-start link, otherwise the parseable shorthand (`id:SS+2d`). */
function formatRelation(rel: DependencyRelation): string {
  if (rel.type === "FS" && !rel.explicitLag && rel.lagDays === 0) return rel.id;
  const lag = rel.lagDays !== 0 || rel.explicitLag ? `${rel.lagDays < 0 ? "" : "+"}${rel.lagDays}d` : "";
  return `${rel.id}:${rel.type}${lag}`;
}

function readStyle(el: Element, prop: string): string {
  if (typeof getComputedStyle !== "function") return "";
  return getComputedStyle(el).getPropertyValue(prop).trim();
}

function isTransparent(color: string): boolean {
  return color === "transparent" || /^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/.test(color);
}

function inlineSvgStyles(live: SVGElement, clone: SVGElement | undefined) {
  if (!clone) return;
  const style: string[] = [];
  for (const prop of SVG_STYLE_PROPS) {
    const value = readStyle(live, prop);
    if (value && !value.includes("var(")) style.push(`${prop}:${value}`);
  }
  if (style.length > 0) clone.setAttribute("style", style.join(";"));
  clone.removeAttribute("class");
}

// Leading characters that make Excel, Sheets or LibreOffice evaluate a cell, including their
// full-width forms. Quote marks already in front of one get one more, so an importer that strips
// exactly one leading quote restores the original text.
const CSV_FORMULA_PREFIX = /^'*[=+\-@\t\r＝＋－＠]/;
// Quoted whenever present, so a cell survives any of the common delimiters (comma, semicolon, tab).
const CSV_QUOTE_TRIGGER = /[",;\t\n\r]/;

/**
 * Writes one CSV cell: neutralizes spreadsheet formula injection (CWE-1236) and applies
 * RFC-4180 quoting. Finite numbers and booleans are written as values (negative numbers stay
 * numbers), null and undefined give an empty cell, and anything else is written as text.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if ((typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean") return String(value);
  let text = String(value);
  if (CSV_FORMULA_PREFIX.test(text)) text = `'${text}`;
  return CSV_QUOTE_TRIGGER.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Strips path separators and control characters and enforces the expected extension. */
function safeFilename(name: string, extension: string, fallback: string): string {
  const base = String(name ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, "-")
    .replace(/^[.\s-]+|[.\s]+$/g, "")
    .slice(0, 180);
  const stem = base || fallback;
  return stem.toLowerCase().endsWith(extension) ? stem : `${stem}${extension}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  if (typeof window === "undefined" || !window.document) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously can abort the download in Firefox/Safari; give the browser time.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
