/**
 * Microsoft Project XML (MSPDI) Interoperability (MS Project 2013-2021 schema)
 *
 * Export writes auto-scheduled tasks with working-day durations and a Start No Earlier Than
 * constraint, so MS Project keeps the Jantt dates, plus 4-type dependencies (FS, SS, FF, SF)
 * with lead/lag, progress, milestones and notes. The Jantt task id and category travel in the
 * Text1 / Text2 custom fields ("Jantt ID", "Jantt Category") so they survive a round trip.
 *
 * Import skips the project summary row, blank and inactive rows, turns summary tasks into the
 * category of their subtasks, and honors LagFormat / MinutesPerDay. Resources, costs, baselines
 * and calendars are not mapped (see the package README field matrix).
 */

import type { JanttData, Task, DependencyObject, DependencyType } from "@jantt/core";
import { getTaskDependencyRelations, isValidISODate } from "@jantt/core";
import { decodeTextBytes } from "./spreadsheet.js";

export interface MsProjectExportOptions {
  projectName?: string;
  author?: string;
}

export interface MsProjectImportOptions {
  /** Receives a message for every recoverable problem (skipped rows, dropped links, ...). */
  onWarning?: (message: string) => void;
}

// PredecessorLink/Type per the MSPDI schema: 0 = FF, 1 = FS, 2 = SF, 3 = SS.
const TYPE_TO_MS: Record<DependencyType, number> = { FF: 0, FS: 1, SF: 2, SS: 3 };
const MS_TO_TYPE: readonly DependencyType[] = ["FF", "FS", "SF", "SS"];

// Task custom text fields carrying Jantt data (MSPDI FieldIDs of Text1 / Text2).
const JANTT_ID_FIELD = { id: "188743731", name: "Text1", alias: "Jantt ID" };
const JANTT_CATEGORY_FIELD = { id: "188743734", name: "Text2", alias: "Jantt Category" };

const MINUTES_PER_DAY = 480;
// LinkLag is always stored in tenths of a minute; LagFormat only says how it is displayed.
const ELAPSED_LAG_FORMATS = new Set([4, 6, 8, 10, 12, 36, 38, 40, 42, 44]);
const PERCENT_LAG_FORMATS = new Set([19, 20, 51, 52]);
const ELAPSED_DAY_TENTHS = 24 * 60 * 10;

export function exportMsProjectXml(plan: JanttData, options: MsProjectExportOptions = {}): string {
  const tasks = (plan.tasks || []).filter((t) => t && !t._deleted);
  const projectName = options.projectName || plan.meta?.title || "Jantt Project";
  const author = options.author || "Jantt Engine";

  const idToUid = new Map<string, number>();
  tasks.forEach((t, idx) => {
    idToUid.set(t.id, idx + 1);
  });

  let minStart = "";
  let maxEnd = "";
  for (const t of tasks) {
    const start = isoDay(t.start);
    const end = isoDay(t.end);
    if (start && (!minStart || start < minStart)) minStart = start;
    if (end && (!maxEnd || end > maxEnd)) maxEnd = end;
  }
  const nowIso = new Date().toISOString().slice(0, 19);
  minStart = minStart || maxEnd || nowIso.slice(0, 10);
  maxEnd = maxEnd && maxEnd >= minStart ? maxEnd : minStart;

  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
  xml += `<Project xmlns="http://schemas.microsoft.com/project">\n`;
  xml += `  <Name>${escapeXml(projectName)}</Name>\n`;
  xml += `  <Title>${escapeXml(projectName)}</Title>\n`;
  xml += `  <Author>${escapeXml(author)}</Author>\n`;
  xml += `  <CreationDate>${nowIso}</CreationDate>\n`;
  xml += `  <ScheduleFromStart>1</ScheduleFromStart>\n`;
  xml += `  <StartDate>${minStart}T08:00:00</StartDate>\n`;
  xml += `  <FinishDate>${maxEnd}T17:00:00</FinishDate>\n`;
  xml += `  <DefaultStartTime>08:00:00</DefaultStartTime>\n`;
  xml += `  <DefaultFinishTime>17:00:00</DefaultFinishTime>\n`;
  xml += `  <MinutesPerDay>${MINUTES_PER_DAY}</MinutesPerDay>\n`;
  xml += `  <MinutesPerWeek>${MINUTES_PER_DAY * 5}</MinutesPerWeek>\n`;
  xml += `  <DaysPerMonth>20</DaysPerMonth>\n`;
  xml += `  <ExtendedAttributes>\n`;
  for (const field of [JANTT_ID_FIELD, JANTT_CATEGORY_FIELD]) {
    xml += `    <ExtendedAttribute>\n`;
    xml += `      <FieldID>${field.id}</FieldID>\n`;
    xml += `      <FieldName>${field.name}</FieldName>\n`;
    xml += `      <Alias>${field.alias}</Alias>\n`;
    xml += `    </ExtendedAttribute>\n`;
  }
  xml += `  </ExtendedAttributes>\n`;
  xml += `  <Tasks>\n`;

  tasks.forEach((task, idx) => {
    const uid = idx + 1;
    const name = task.label || task.name || task.id;
    const start = isoDay(task.start) || minStart;
    const end = isoDay(task.end) || start;
    // Only flagged tasks are milestones; a single-day task is a one-day (8h) task.
    const isMilestone = task.milestone === true;
    const workdays = isMilestone ? 0 : Math.max(1, countWorkdays(start, end));
    const startIso = `${start}T08:00:00`;
    const finishIso = isMilestone ? startIso : `${end}T17:00:00`;
    const pct = Math.min(100, Math.max(0, Math.round((Number(task.progress) || 0) * 100)));
    const notes = typeof task.notes === "string" && task.notes ? task.notes : (typeof task.description === "string" ? task.description : "");

    xml += `    <Task>\n`;
    xml += `      <UID>${uid}</UID>\n`;
    xml += `      <ID>${uid}</ID>\n`;
    xml += `      <Name>${escapeXml(name)}</Name>\n`;
    // MS Project validates element order against the MSPDI schema sequence.
    xml += `      <Active>1</Active>\n`;
    xml += `      <Manual>0</Manual>\n`;
    xml += `      <OutlineLevel>1</OutlineLevel>\n`;
    xml += `      <Start>${startIso}</Start>\n`;
    xml += `      <Finish>${finishIso}</Finish>\n`;
    xml += `      <Duration>PT${workdays * 8}H0M0S</Duration>\n`;
    xml += `      <DurationFormat>7</DurationFormat>\n`;
    xml += `      <Milestone>${isMilestone ? 1 : 0}</Milestone>\n`;
    xml += `      <PercentComplete>${pct}</PercentComplete>\n`;
    // Start No Earlier Than keeps the planned date while still letting logic push it later.
    xml += `      <ConstraintType>4</ConstraintType>\n`;
    xml += `      <ConstraintDate>${startIso}</ConstraintDate>\n`;
    if (notes) {
      xml += `      <Notes>${escapeXml(notes)}</Notes>\n`;
    }

    // Known ids keep an id such as "render-3d" from being read as "render" with a 3-day lead.
    for (const dep of getTaskDependencyRelations(task, idToUid)) {
      const predUid = idToUid.get(dep.id);
      if (predUid === undefined || predUid === uid) continue;
      xml += `      <PredecessorLink>\n`;
      xml += `        <PredecessorUID>${predUid}</PredecessorUID>\n`;
      xml += `        <Type>${TYPE_TO_MS[dep.type] ?? 1}</Type>\n`;
      xml += `        <CrossProject>0</CrossProject>\n`;
      xml += `        <LinkLag>${Math.round((dep.lagDays || 0) * MINUTES_PER_DAY * 10)}</LinkLag>\n`;
      xml += `        <LagFormat>7</LagFormat>\n`;
      xml += `      </PredecessorLink>\n`;
    }

    xml += extendedAttributeXml(JANTT_ID_FIELD.id, task.id);
    if (task.category) {
      xml += extendedAttributeXml(JANTT_CATEGORY_FIELD.id, task.category);
    }
    xml += `    </Task>\n`;
  });

  xml += `  </Tasks>\n`;
  xml += `</Project>\n`;

  return xml;
}

export function importMsProjectXml(content: string | ArrayBuffer | Uint8Array, options: MsProjectImportOptions = {}): JanttData {
  const warn = options.onWarning || (() => {});
  let xml = stripComments(typeof content === "string" ? content : decodeTextBytes(content));
  if (/<[A-Za-z_][\w.-]*:Project[\s>]/.test(xml)) {
    // Prefixed namespace (<msp:Project>): drop element prefixes so lookups match.
    xml = xml.replace(/<(\/?)[A-Za-z_][\w.-]*:(?=[A-Za-z_])/g, "<$1");
  }
  if (!/<Project[\s>]/.test(xml)) {
    throw new Error("Not a Microsoft Project XML (MSPDI) file: the <Project> root element is missing.");
  }

  const tasksStart = xml.indexOf("<Tasks>");
  if (tasksStart < 0) {
    throw new Error("The MS Project file contains no <Tasks> section.");
  }
  const prefix = xml.slice(0, tasksStart);
  const header = prefix.slice(0, firstIndexOf(prefix, ["<ExtendedAttributes>", "<Calendars>"]));
  const title = textOf(header, "Title") || textOf(header, "Name") || "Imported MS Project";
  const minutesPerDay = Number(textOf(header, "MinutesPerDay")) || MINUTES_PER_DAY;

  // Find which custom fields carry Jantt data (by alias, so remapped fields still work).
  const fieldByAlias = new Map<string, string>();
  for (const def of childElements(prefix, "ExtendedAttribute")) {
    const alias = textOf(def, "Alias");
    const fieldId = textOf(def, "FieldID");
    if (alias && fieldId) fieldByAlias.set(alias, fieldId);
  }
  const idFieldId = fieldByAlias.get(JANTT_ID_FIELD.alias);
  const categoryFieldId = fieldByAlias.get(JANTT_CATEGORY_FIELD.alias);

  const tasksEnd = xml.indexOf("</Tasks>", tasksStart);
  const tasksXml = xml.slice(tasksStart, tasksEnd < 0 ? xml.length : tasksEnd);

  interface RawLink {
    predUid: number;
    type: DependencyType;
    lagDays: number;
  }
  const rawTasks: { task: Task; links: RawLink[] }[] = [];
  const uidToId = new Map<number, string>();
  const usedIds = new Set<string>();
  const outline: (string | undefined)[] = []; // summary task names by outline level
  const skipped = { summary: 0, blank: 0, inactive: 0, undated: 0, duplicateIds: 0, percentLags: 0, crossProject: 0 };

  for (const block of childElements(tasksXml, "Task")) {
    const own = stripElements(block, ["PredecessorLink", "ExtendedAttribute", "Baseline", "TimephasedData"]);
    const uidText = textOf(own, "UID");
    if (!uidText || !/^\d+$/.test(uidText)) continue;
    const uid = parseInt(uidText, 10);
    const level = parseInt(textOf(own, "OutlineLevel") || "1", 10) || 1;

    // UID 0 / outline level 0 is the project summary row MS Project always writes.
    if (uid === 0 || textOf(own, "OutlineLevel") === "0") continue;
    if (textOf(own, "IsNull") === "1") {
      skipped.blank++;
      continue;
    }

    outline.length = Math.min(outline.length, level - 1);
    const name = textOf(own, "Name") || `Task ${uid}`;
    if (textOf(own, "Summary") === "1") {
      outline[level - 1] = name;
      skipped.summary++;
      continue;
    }
    if (textOf(own, "Active") === "0") {
      skipped.inactive++;
      continue;
    }

    const start = isoDay(textOf(own, "Start"));
    const finish = isoDay(textOf(own, "Finish"));
    if (!start) {
      skipped.undated++;
      continue;
    }

    const custom = new Map<string, string>();
    for (const attr of childElements(block, "ExtendedAttribute")) {
      const fieldId = textOf(attr, "FieldID");
      if (fieldId) custom.set(fieldId, textOf(attr, "Value") || "");
    }

    let category = (categoryFieldId && custom.get(categoryFieldId)) || "";
    let notes = textOf(own, "Notes") || "";
    // Files written by older Jantt versions stored only "category: X" in Notes.
    const legacyCategory = notes.match(/^category:\s*([^\n\r]+)$/i);
    if (legacyCategory) {
      category = category || legacyCategory[1].trim();
      notes = "";
    }
    category = category || nearestDefined(outline) || "default";

    const janttId = (idFieldId && custom.get(idFieldId)) || "";
    const id = uniqueId(janttId || `t${uid}`, usedIds);
    if (janttId && id !== janttId) skipped.duplicateIds++;
    usedIds.add(id);
    uidToId.set(uid, id);

    const pct = parseFloat(textOf(own, "PercentComplete") || "0");
    const task: Task = {
      id,
      label: name,
      category,
      start,
      end: finish && finish >= start ? finish : start,
      progress: Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) / 100 : 0,
      ...(textOf(own, "Milestone") === "1" ? { milestone: true } : {}),
      ...(notes ? { notes } : {})
    };

    const links: RawLink[] = [];
    for (const link of childElements(block, "PredecessorLink")) {
      const predUidText = textOf(link, "PredecessorUID");
      if (!predUidText || !/^\d+$/.test(predUidText)) continue;
      if (textOf(link, "CrossProject") === "1") {
        skipped.crossProject++;
        continue;
      }
      const type = MS_TO_TYPE[parseInt(textOf(link, "Type") || "1", 10)] ?? "FS";
      const lagRaw = parseFloat(textOf(link, "LinkLag") || "0") || 0;
      const lagFormat = parseInt(textOf(link, "LagFormat") || "7", 10);
      let lagDays = 0;
      if (PERCENT_LAG_FORMATS.has(lagFormat)) {
        if (lagRaw) skipped.percentLags++;
      } else {
        const tenthsPerDay = ELAPSED_LAG_FORMATS.has(lagFormat) ? ELAPSED_DAY_TENTHS : minutesPerDay * 10;
        lagDays = Math.round(lagRaw / tenthsPerDay) || 0;
      }
      links.push({ predUid: parseInt(predUidText, 10), type, lagDays });
    }

    rawTasks.push({ task, links });
  }

  let droppedLinks = 0;
  const tasks: Task[] = rawTasks.map(({ task, links }) => {
    const deps: DependencyObject[] = [];
    for (const link of links) {
      const predId = uidToId.get(link.predUid);
      if (predId && predId !== task.id) {
        deps.push(dependencyObject(predId, link.type, link.lagDays));
      } else {
        droppedLinks++;
      }
    }
    if (deps.length === 1 && deps[0].type === "FS" && !deps[0].lagDays) {
      task.dependsOn = deps[0].id;
    } else if (deps.length > 0) {
      task.dependsOn = deps;
    }
    return task;
  });

  if (tasks.length === 0) {
    throw new Error("The MS Project file contains no importable tasks.");
  }

  if (skipped.summary) warn(`${skipped.summary} summary task(s) were not imported as bars; their names became the category of their subtasks.`);
  if (skipped.blank) warn(`${skipped.blank} blank row(s) were skipped.`);
  if (skipped.inactive) warn(`${skipped.inactive} inactive task(s) were skipped.`);
  if (skipped.undated) warn(`${skipped.undated} task(s) without a start date were skipped.`);
  if (skipped.duplicateIds) warn(`${skipped.duplicateIds} task(s) repeated a Jantt ID and were given a unique id.`);
  if (skipped.crossProject) warn(`${skipped.crossProject} cross-project link(s) were dropped.`);
  if (skipped.percentLags) warn(`${skipped.percentLags} percentage lag(s) are not supported and were imported as 0 days.`);
  if (droppedLinks) warn(`${droppedLinks} link(s) pointing to summary, skipped or missing tasks were dropped.`);

  return {
    meta: {
      title
    },
    tasks
  };
}

/** Counts Monday-Friday days in the inclusive range [start, end]; 0 for invalid or inverted ranges. */
export function countWorkdays(start: string, end: string): number {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0;
  const days = Math.round((to - from) / 86400000) + 1;
  const startDow = new Date(from).getUTCDay();
  let count = Math.floor(days / 7) * 5;
  for (let i = 0; i < days % 7; i++) {
    const dow = (startDow + i) % 7;
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

/** Returns the YYYY-MM-DD part of a valid ISO date or timestamp, otherwise "". */
export function isoDay(value: unknown): string {
  return typeof value === "string" && isValidISODate(value) ? value.split("T")[0].trim() : "";
}

/** Removes characters XML 1.0 forbids (C0 controls, U+FFFE/U+FFFF, lone surrogates). */
export function sanitizeXmlText(value: string): string {
  return value.replace(
    /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF\uD800-\uDFFF]/g,
    (match) => (match.length === 2 ? match : "")
  );
}

/**
 * Imported link. A zero lag is left out so every zero-lag FS link uses the plan's gap, exactly
 * like the plain-id form a single FS link collapses to (an explicit 0 would override the gap).
 */
export function dependencyObject(id: string, type: DependencyType, lagDays: number): DependencyObject {
  return lagDays ? { id, type, lagDays } : { id, type };
}

function extendedAttributeXml(fieldId: string, value: string): string {
  return `      <ExtendedAttribute>\n        <FieldID>${fieldId}</FieldID>\n        <Value>${escapeXml(value)}</Value>\n      </ExtendedAttribute>\n`;
}

function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function nearestDefined(values: (string | undefined)[]): string | undefined {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i]) return values[i];
  }
  return undefined;
}

function firstIndexOf(text: string, needles: string[]): number {
  let first = text.length;
  for (const needle of needles) {
    const idx = text.indexOf(needle);
    if (idx >= 0 && idx < first) first = idx;
  }
  return first;
}

// The helpers below scan with indexOf so malformed or hostile input stays linear-time
// (a lazy regex over the whole file is O(n^2) on unclosed tags).

/** Inner XML of each non-nested `<tag>...</tag>` element; an unclosed tag ends the scan. */
function childElements(xml: string, tag: string): string[] {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const result: string[] = [];
  let pos = 0;
  for (;;) {
    const start = xml.indexOf(open, pos);
    if (start < 0) break;
    const end = xml.indexOf(close, start + open.length);
    if (end < 0) break;
    result.push(xml.slice(start + open.length, end));
    pos = end + close.length;
  }
  return result;
}

/** Removes every `<tag>...</tag>` element of the given tags (and any unclosed remainder). */
function stripElements(xml: string, tags: string[]): string {
  let out = xml;
  for (const tag of tags) {
    const open = `<${tag}>`;
    const close = `</${tag}>`;
    if (!out.includes(open)) continue;
    let result = "";
    let pos = 0;
    for (;;) {
      const start = out.indexOf(open, pos);
      if (start < 0) {
        result += out.slice(pos);
        break;
      }
      result += out.slice(pos, start);
      const end = out.indexOf(close, start + open.length);
      if (end < 0) break;
      pos = end + close.length;
    }
    out = result;
  }
  return out;
}

function stripComments(xml: string): string {
  let out = "";
  let pos = 0;
  for (;;) {
    const start = xml.indexOf("<!--", pos);
    if (start < 0) return out + xml.slice(pos);
    out += xml.slice(pos, start);
    const end = xml.indexOf("-->", start + 4);
    if (end < 0) return out; // An unterminated comment swallows the rest of the document.
    pos = end + 3;
  }
}

/** Trimmed, unescaped text of the first `<tag>` element (CDATA taken literally). */
function textOf(xml: string, tag: string): string | undefined {
  const open = `<${tag}>`;
  const start = xml.indexOf(open);
  if (start < 0) return undefined;
  const end = xml.indexOf(`</${tag}>`, start + open.length);
  if (end < 0) return undefined;
  const raw = xml.slice(start + open.length, end).trim();
  if (raw.startsWith("<![CDATA[") && raw.endsWith("]]>")) {
    return raw.slice(9, -3).trim();
  }
  return unescapeXml(raw).trim();
}

function escapeXml(unsafe: string): string {
  return sanitizeXmlText(String(unsafe ?? ""))
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const NAMED_ENTITIES: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" };

/** Single-pass decode, so "&amp;lt;" stays "&lt;" and numeric references are honored. */
function unescapeXml(safe: string): string {
  return safe.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|quot|apos|amp);/g, (match, entity: string) => {
    if (entity[0] !== "#") return NAMED_ENTITIES[entity];
    const code = entity[1] === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}
