/**
 * Spreadsheet CSV / TSV Interoperability
 *
 * Bidirectional RFC 4180 CSV import and export with dependency expressions,
 * categories, owners, progress, priority, milestones, status, cost and notes. Import
 * auto-detects `,` / `;` / tab delimiters, normalizes common spreadsheet date formats and
 * also reads the column names of the core `exportToCsv` CSV; export neutralizes
 * spreadsheet formulas (CSV injection) and prefixes a UTF-8 BOM for Excel.
 */

import type { JanttData, Task, DependencyRelation, DependsOnValue } from "@jantt/core";
import { getTaskDependencyRelations, getEffectiveGap, resolveRelationLag, isValidISODate, addDays } from "@jantt/core";

export interface SpreadsheetExportOptions {
  /** Prefix a UTF-8 byte-order mark so Excel opens non-ASCII text correctly (default `true`). */
  bom?: boolean;
}

export interface SpreadsheetImportOptions {
  /** Field delimiter. Auto-detected from the header row when omitted. */
  delimiter?: "," | ";" | "\t";
  /**
   * Order of ambiguous numeric dates such as `03/04/2026`. When omitted it is inferred
   * from the file (any first part > 12 means day-first), defaulting to month-first.
   */
  dateFormat?: "mdy" | "dmy";
  /** Receives a message for every recoverable problem (unparsed dates, generated ids, ...). */
  onWarning?: (message: string) => void;
}

// Includes the core `exportToCsv` headers ("Task ID", "Label / Name", "Progress (%)", ...), so its
// CSVs (also written by @jantt/mcp) re-import with labels, progress and milestones. `category` is
// listed before `wbs`, so a WBS column never overrides an explicit Category column.
const HEADER_ALIASES = {
  id: ["id", "task id", "code"],
  label: ["label", "task", "name", "task name", "label / name"],
  start: ["start", "start date", "target start"],
  end: ["end", "end date", "finish", "target finish"],
  progress: ["progress", "progress (%)", "% complete", "complete", "percent complete"],
  category: ["category", "wbs", "group", "type"],
  owner: ["owner", "assignee", "assigned to", "person"],
  dependsOn: ["dependson", "depends on", "predecessors", "dependencies"],
  priority: ["priority"],
  milestone: ["milestone"],
  status: ["status"],
  estimatedCost: ["estimatedcost", "estimated cost", "estimated budget ($)", "budget", "cost"],
  notes: ["notes", "description"]
} as const;

// Leading characters that make Excel / Sheets evaluate a cell as a formula, including the
// full-width forms (same set as the core CSV exporter). A field that already starts with quote
// marks before such a character gets one more, so import can strip exactly one and stay lossless.
const FORMULA_PREFIX = /^'*[=+\-@\t\r＝＋－＠]/;
const NEUTRALIZED_PREFIX = /^'+[=+\-@\t\r＝＋－＠]/;
const TRUE_CELL = /^(?:true|yes|y|1|x)$/i;

export function exportSpreadsheetCsv(plan: JanttData, options: SpreadsheetExportOptions = {}): string {
  const tasks = (plan.tasks || []).filter((t) => t && !t._deleted);
  // New columns go after Priority, so readers that map the first nine columns keep working.
  const headers = ["ID", "Label", "Start", "End", "Progress", "Category", "Owner", "DependsOn", "Priority", "Milestone", "Status", "EstimatedCost", "Notes"];
  const rows: string[] = [headers.join(",")];
  // Known ids keep an id such as "render-3d" from being written as "render" with a 3-day lead.
  const knownIds = new Set(tasks.map((t) => t.id));

  for (const t of tasks) {
    const progress = typeof t.progress === "number" && Number.isFinite(t.progress) ? Math.min(1, Math.max(0, t.progress)) : 0;
    // One decimal keeps sub-percent progress (0.5%) from collapsing to 0% or 1%.
    const progressPct = `${Number((progress * 100).toFixed(1))}%`;
    const deps = getTaskDependencyRelations(t, knownIds).map((dep) => ({
      id: dep.id, type: dep.type, lagDays: resolveRelationLag(dep, getEffectiveGap(t, plan.meta?.defaultGapDays))
    }));
    const depsStr = deps.some((dep) => /[,;]/.test(dep.id) || dep.id.startsWith("json:["))
      ? `json:${JSON.stringify(deps)}`
      : deps.map((dep) => formatDependency({ ...dep, explicitLag: true })).join("; ");
    const priorityVal = typeof t.priority === "string" ? t.priority : "";
    const ownerVal = typeof t.owner === "string" ? t.owner : (typeof t.assignee === "string" ? t.assignee : "");
    const notesVal = typeof t.notes === "string" && t.notes ? t.notes : (typeof t.description === "string" ? t.description : "");
    // A finite number cannot form a formula, so it is written as-is and stays numeric (negative values too).
    const costVal = typeof t.estimatedCost === "number" && Number.isFinite(t.estimatedCost) ? String(t.estimatedCost) : "";

    const row = [
      escapeCsvField(t.id),
      escapeCsvField(t.label || t.name || t.id),
      escapeCsvField(t.start || ""),
      escapeCsvField(t.end || ""),
      escapeCsvField(progressPct),
      escapeCsvField(t.category || "default"),
      escapeCsvField(ownerVal),
      escapeCsvField(depsStr),
      escapeCsvField(priorityVal),
      t.milestone === true ? "TRUE" : "",
      escapeCsvField(typeof t.status === "string" ? t.status : ""),
      costVal,
      escapeCsvField(notesVal)
    ];

    rows.push(row.join(","));
  }

  return (options.bom === false ? "" : "\uFEFF") + rows.join("\r\n");
}

export function importSpreadsheetCsv(content: string | ArrayBuffer | Uint8Array, options: SpreadsheetImportOptions = {}): JanttData {
  const text = (typeof content === "string" ? content : decodeTextBytes(content)).replace(/^\uFEFF/, "");
  const warn = options.onWarning || (() => {});
  const records = parseCsv(text, options.delimiter || detectDelimiter(text));

  const headerRowIndex = records.findIndex((row) => !isBlankRow(row));
  if (headerRowIndex < 0) {
    throw new Error("The spreadsheet is empty: expected a header row followed by task rows.");
  }

  const headerMap = new Map<string, number>();
  records[headerRowIndex].forEach((h, i) => {
    const key = h.trim().toLowerCase();
    if (!headerMap.has(key)) headerMap.set(key, i);
  });

  const columnOf = (aliases: readonly string[]): number => {
    for (const alias of aliases) {
      const idx = headerMap.get(alias);
      if (idx !== undefined) return idx;
    }
    return -1;
  };
  const col = {
    id: columnOf(HEADER_ALIASES.id),
    label: columnOf(HEADER_ALIASES.label),
    start: columnOf(HEADER_ALIASES.start),
    end: columnOf(HEADER_ALIASES.end),
    progress: columnOf(HEADER_ALIASES.progress),
    category: columnOf(HEADER_ALIASES.category),
    owner: columnOf(HEADER_ALIASES.owner),
    dependsOn: columnOf(HEADER_ALIASES.dependsOn),
    priority: columnOf(HEADER_ALIASES.priority),
    milestone: columnOf(HEADER_ALIASES.milestone),
    status: columnOf(HEADER_ALIASES.status),
    estimatedCost: columnOf(HEADER_ALIASES.estimatedCost),
    notes: columnOf(HEADER_ALIASES.notes)
  };

  if (col.start < 0 || (col.id < 0 && col.label < 0)) {
    const found = records[headerRowIndex].map((h) => h.trim()).filter(Boolean).join(", ") || "none";
    throw new Error(
      `Unrecognized spreadsheet layout: expected a header row with ID or Label/Name and Start columns (found: ${found}). ` +
        "Comma, semicolon and tab delimiters are supported."
    );
  }

  const cell = (row: string[], idx: number): string => {
    if (idx < 0 || row[idx] === undefined) return "";
    const value = row[idx].trim();
    return NEUTRALIZED_PREFIX.test(value) ? value.slice(1) : value;
  };

  const dataRows = records.slice(headerRowIndex + 1).filter((row) => !isBlankRow(row));
  const dayFirst = options.dateFormat
    ? options.dateFormat === "dmy"
    : inferDayFirst(dataRows.flatMap((row) => [cell(row, col.start), cell(row, col.end)]));

  // Generated ids must never collide with ids written in the sheet.
  const usedIds = new Set(dataRows.map((row) => cell(row, col.id)).filter(Boolean));
  let nextGeneratedId = 1;
  let generatedCount = 0;

  const toIsoDate = (raw: string, rowNumber: number, column: string): string => {
    if (!raw) return "";
    const iso = normalizeSpreadsheetDate(raw, dayFirst);
    if (iso) return iso;
    warn(`Row ${rowNumber}: could not read ${column} date "${raw}".`);
    return raw;
  };

  const tasks: Task[] = dataRows.map((row, i) => {
    const rowNumber = headerRowIndex + i + 2;
    let id = cell(row, col.id);
    if (!id) {
      while (usedIds.has(`t${nextGeneratedId}`)) nextGeneratedId++;
      id = `t${nextGeneratedId++}`;
      usedIds.add(id);
      generatedCount++;
    }

    const label = cell(row, col.label) || id;
    const start = toIsoDate(cell(row, col.start), rowNumber, "start");
    const end = toIsoDate(cell(row, col.end), rowNumber, "end") || start;
    const progress = parseProgress(cell(row, col.progress));
    const category = cell(row, col.category) || "default";
    const owner = cell(row, col.owner) || undefined;
    const dependsOnRaw = cell(row, col.dependsOn);
    const priority = cell(row, col.priority) || undefined;
    const milestone = TRUE_CELL.test(cell(row, col.milestone));
    const status = cell(row, col.status) || undefined;
    const notes = cell(row, col.notes) || undefined;
    const costRaw = cell(row, col.estimatedCost);
    const estimatedCost = costRaw ? Number(costRaw) : NaN;
    if (costRaw && !Number.isFinite(estimatedCost)) {
      warn(`Row ${rowNumber}: could not read cost "${costRaw}"; it was left out.`);
    }

    let dependsOn: DependsOnValue | undefined;
    if (dependsOnRaw.startsWith("json:[")) {
      try {
        const parsed: unknown = JSON.parse(dependsOnRaw.slice(5));
        if (Array.isArray(parsed) && parsed.every((item) => item && typeof item === "object" && typeof item.id === "string")) dependsOn = parsed;
        else warn(`Row ${rowNumber}: malformed structured dependencies were ignored.`);
      } catch { warn(`Row ${rowNumber}: malformed structured dependencies were ignored.`); }
    } else if (dependsOnRaw) {
      const parts = dependsOnRaw.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length === 1) {
        dependsOn = parts[0];
      } else if (parts.length > 1) {
        dependsOn = parts;
      }
    }

    return {
      id,
      label,
      category,
      start,
      end,
      ...(progress !== undefined ? { progress } : {}),
      ...(owner ? { owner } : {}),
      ...(dependsOn ? { dependsOn } : {}),
      ...(priority ? { priority } : {}),
      ...(milestone ? { milestone: true } : {}),
      ...(status ? { status } : {}),
      ...(Number.isFinite(estimatedCost) ? { estimatedCost } : {}),
      ...(notes ? { notes } : {})
    };
  });

  if (tasks.length === 0) {
    throw new Error("The spreadsheet has a header row but no task rows.");
  }
  if (generatedCount > 0) {
    warn(`${generatedCount} row(s) had no ID; generated unique ids were assigned.`);
  }

  return { tasks };
}

/**
 * Decodes raw file bytes into text. Honors UTF-8 / UTF-16 byte-order marks, accepts valid
 * UTF-8, and falls back to Windows-1252 (the ANSI code page Excel and Primavera P6 use by default).
 */
export function decodeTextBytes(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("windows-1252").decode(bytes);
    } catch {
      // Runtimes without legacy encodings: Latin-1 matches Windows-1252 outside 0x80-0x9F.
      let text = "";
      for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
      return text;
    }
  }
}

/** Same shorthand as the core exporter; an explicit zero lag (`a:FS+0d`) is kept because it overrides the gap. */
function formatDependency(rel: DependencyRelation & { explicitLag?: boolean }): string {
  if (rel.type === "FS" && !rel.explicitLag && !rel.lagDays) return rel.id;
  const lag = rel.lagDays || rel.explicitLag ? `${rel.lagDays < 0 ? "" : "+"}${rel.lagDays}d` : "";
  return `${rel.id}:${rel.type}${lag}`;
}

function parseProgress(raw: string): number | undefined {
  if (!raw) return undefined;
  const num = parseFloat(raw.replace("%", "").replace(",", ".").trim());
  if (!Number.isFinite(num)) return undefined;
  // "1%" is one percent; a bare value above 1 is a percentage, otherwise a fraction.
  const fraction = raw.includes("%") || num > 1 ? num / 100 : num;
  return Math.min(1, Math.max(0, fraction));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const NUMERIC_DATE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?:[\sT].*)?$/;

/**
 * Normalizes a spreadsheet date cell to YYYY-MM-DD. Accepts ISO dates and timestamps,
 * YYYY/MM/DD, M/D/YYYY or D/M/YYYY (also with `.` or `-`), month names (`1-Nov-26`,
 * `Nov 1, 2026`) and Excel serial day numbers. Returns null when the value is not a real date.
 */
function normalizeSpreadsheetDate(raw: string, dayFirst: boolean): string | null {
  const s = raw.trim();

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[\sT].*)?$/);
  if (m) return isoDate(+m[1], +m[2], +m[3]);

  m = s.match(NUMERIC_DATE);
  if (m) {
    const year = fullYear(m[3]);
    return dayFirst ? isoDate(year, +m[2], +m[1]) : isoDate(year, +m[1], +m[2]);
  }

  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})\.?[-\s,]+(\d{4}|\d{2})$/);
  if (m) return isoDate(fullYear(m[3]), monthNumber(m[2]), +m[1]);

  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4}|\d{2})$/);
  if (m) return isoDate(fullYear(m[3]), monthNumber(m[1]), +m[2]);

  // Excel serial dates (1900 date system), limited to a plausible 1954-2119 window.
  if (/^\d{5}(?:\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial >= 20000 && serial <= 80000) return addDays("1899-12-30", serial);
  }

  return null;
}

/** Day-first when any numeric date cell has a first part above 12, unless one has a second part above 12. */
function inferDayFirst(values: string[]): boolean {
  let dayFirst = false;
  let dotted = false;
  for (const value of values) {
    const m = value.match(NUMERIC_DATE);
    if (!m) continue;
    if (+m[2] > 12) return false;
    if (+m[1] > 12) dayFirst = true;
    if (value.includes(".")) dotted = true;
  }
  // D.M.YYYY is the dominant dotted convention.
  return dayFirst || dotted;
}

function isoDate(year: number, month: number, day: number): string | null {
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isValidISODate(iso) ? iso : null;
}

function fullYear(value: string): number {
  const year = parseInt(value, 10);
  return value.length === 2 ? 2000 + year : year;
}

function monthNumber(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
}

function isBlankRow(row: string[]): boolean {
  return row.every((value) => !value.trim());
}

function escapeCsvField(value: unknown): string {
  let field = String(value ?? "");
  if (FORMULA_PREFIX.test(field)) {
    field = `'${field}`;
  }
  if (field.includes(",") || field.includes(";") || field.includes('"') || field.includes("\n") || field.includes("\r") || field.includes("\t")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/** Picks the most frequent of `,` `;` and tab on the first line (outside quotes); ties favor `,`. */
function detectDelimiter(text: string): "," | ";" | "\t" {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (char === "\n" || char === "\r") {
        if (counts[","] + counts[";"] + counts["\t"] > 0) break;
      } else if (char === "," || char === ";" || char === "\t") {
        counts[char]++;
      }
    }
  }
  if (counts[";"] > counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] > counts[","] && counts["\t"] > counts[";"]) return "\t";
  return ",";
}

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let fieldStarted = false;
  let line = 1;
  let quoteLine = 1;

  const endField = () => {
    currentRow.push(currentField);
    currentField = "";
    fieldStarted = false;
  };
  const endRow = () => {
    endField();
    rows.push(currentRow);
    currentRow = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\n") line++;
        currentField += char;
      }
    } else if (char === '"' && !fieldStarted) {
      // A quote only opens a quoted field at the very start of the field (RFC 4180).
      inQuotes = true;
      fieldStarted = true;
      quoteLine = line;
    } else if (char === delimiter) {
      endField();
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      line++;
      endRow();
    } else {
      currentField += char;
      fieldStarted = true;
    }
  }

  if (inQuotes) {
    throw new Error(`Malformed CSV: unterminated quoted field starting on line ${quoteLine}.`);
  }
  if (fieldStarted || currentField || currentRow.length > 0) {
    endRow();
  }

  return rows;
}
