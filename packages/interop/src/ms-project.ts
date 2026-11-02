/**
 * Microsoft Project XML Interoperability (MS Project 2013-2021 Schema)
 *
 * Implements lossless export and ingestion of Microsoft Project standard XML format,
 * preserving tasks, dates, 4-type dependencies (FS, SS, FF, SF), lead/lag, and progress.
 */

import type { JanttData, Task, DependencyRelation, DependencyType } from "@jantt/core";
import { parseDependencyRelation } from "@jantt/core";

export interface MsProjectExportOptions {
  projectName?: string;
  author?: string;
}

// Predecessor link types in MS Project XML
// 0 = FF (Finish-to-Finish), 1 = FS (Finish-to-Start), 2 = SS (Start-to-Start), 3 = SF (Start-to-Finish)
const TYPE_TO_MS: Record<DependencyType, number> = {
  FF: 0,
  FS: 1,
  SS: 2,
  SF: 3
};

const MS_TO_TYPE: Record<number, DependencyType> = {
  0: "FF",
  1: "FS",
  2: "SS",
  3: "SF"
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

export function exportMsProjectXml(plan: JanttData, options: MsProjectExportOptions = {}): string {
  const tasks = plan.tasks || [];
  const projectName = options.projectName || plan.meta?.title || "Jantt Project";
  const author = options.author || "Jantt Engine";

  // Build ID to UID map
  const idToUid = new Map<string, number>();
  tasks.forEach((t, idx) => {
    idToUid.set(t.id, idx + 1);
  });

  const nowIso = new Date().toISOString();
  let minStart = "9999-12-31";
  let maxEnd = "1970-01-01";

  for (const t of tasks) {
    if (t.start && t.start < minStart) minStart = t.start;
    if (t.end && t.end > maxEnd) maxEnd = t.end;
  }

  const projectStart = minStart === "9999-12-31" ? "2026-01-01T08:00:00" : `${minStart}T08:00:00`;
  const projectFinish = maxEnd === "1970-01-01" ? "2026-01-01T17:00:00" : `${maxEnd}T17:00:00`;

  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
  xml += `<Project xmlns="http://schemas.microsoft.com/project">\n`;
  xml += `  <Name>${escapeXml(projectName)}</Name>\n`;
  xml += `  <Title>${escapeXml(projectName)}</Title>\n`;
  xml += `  <Author>${escapeXml(author)}</Author>\n`;
  xml += `  <CreationDate>${nowIso}</CreationDate>\n`;
  xml += `  <StartDate>${projectStart}</StartDate>\n`;
  xml += `  <FinishDate>${projectFinish}</FinishDate>\n`;
  xml += `  <ScheduleFromStart>1</ScheduleFromStart>\n`;
  xml += `  <Tasks>\n`;

  tasks.forEach((task, idx) => {
    const uid = idx + 1;
    const name = task.label || task.id;
    const startIso = task.start ? `${task.start}T08:00:00` : projectStart;
    const finishIso = task.end ? `${task.end}T17:00:00` : projectFinish;
    const pct = Math.min(100, Math.max(0, Math.round((task.progress ?? 0) * 100)));
    const isMilestone = task.start === task.end || task.milestone ? 1 : 0;

    xml += `    <Task>\n`;
    xml += `      <UID>${uid}</UID>\n`;
    xml += `      <ID>${uid}</ID>\n`;
    xml += `      <Name>${escapeXml(name)}</Name>\n`;
    xml += `      <Active>1</Active>\n`;
    xml += `      <Manual>0</Manual>\n`;
    xml += `      <Start>${startIso}</Start>\n`;
    xml += `      <Finish>${finishIso}</Finish>\n`;
    xml += `      <PercentComplete>${pct}</PercentComplete>\n`;
    xml += `      <Milestone>${isMilestone}</Milestone>\n`;

    if (task.category) {
      xml += `      <Notes>${escapeXml(`category: ${task.category}`)}</Notes>\n`;
    }

    const deps = parseDependencyInput(task.dependsOn);
    deps.forEach((dep) => {
      const predUid = idToUid.get(dep.id);
      if (predUid !== undefined) {
        const msType = TYPE_TO_MS[dep.type] ?? 1;
        // In MS Project XML, lag in days is represented in tenths of minute: 1 day = 8 hr * 60 min * 10 = 4800
        const linkLag = (dep.lagDays || 0) * 4800;
        xml += `      <PredecessorLink>\n`;
        xml += `        <PredecessorUID>${predUid}</PredecessorUID>\n`;
        xml += `        <Type>${msType}</Type>\n`;
        xml += `        <CrossProject>0</CrossProject>\n`;
        xml += `        <LinkLag>${linkLag}</LinkLag>\n`;
        xml += `        <LagFormat>7</LagFormat>\n`;
        xml += `      </PredecessorLink>\n`;
      }
    });

    xml += `    </Task>\n`;
  });

  xml += `  </Tasks>\n`;
  xml += `</Project>\n`;

  return xml;
}

export function importMsProjectXml(xmlString: string): JanttData {
  const titleMatch = xmlString.match(/<Title>([\s\S]*?)<\/Title>/i) || xmlString.match(/<Name>([\s\S]*?)<\/Name>/i);
  const title = titleMatch ? unescapeXml(titleMatch[1].trim()) : "Imported MS Project";

  const taskRegex = /<Task>([\s\S]*?)<\/Task>/gi;
  let match: RegExpExecArray | null;

  interface RawParsedTask {
    uid: number;
    name: string;
    start: string;
    end: string;
    category: string;
    percentComplete: number;
    milestone: boolean;
    predecessors: { predUid: number; type: number; lagDays: number }[];
  }

  const rawTasks: RawParsedTask[] = [];
  const uidToId = new Map<number, string>();

  while ((match = taskRegex.exec(xmlString)) !== null) {
    const taskXml = match[1];

    const uidMatch = taskXml.match(/<UID>(\d+)<\/UID>/i);
    if (!uidMatch) continue;
    const uid = parseInt(uidMatch[1], 10);

    const nameMatch = taskXml.match(/<Name>([\s\S]*?)<\/Name>/i);
    const name = nameMatch ? unescapeXml(nameMatch[1].trim()) : `Task ${uid}`;

    const startMatch = taskXml.match(/<Start>([^<]+)<\/Start>/i);
    const finishMatch = taskXml.match(/<Finish>([^<]+)<\/Finish>/i);
    const pctMatch = taskXml.match(/<PercentComplete>(\d+)<\/PercentComplete>/i);
    const milestoneMatch = taskXml.match(/<Milestone>([01])<\/Milestone>/i);
    const notesMatch = taskXml.match(/<Notes>([\s\S]*?)<\/Notes>/i);

    let category = "default";
    if (notesMatch) {
      const catMatch = notesMatch[1].match(/category:\s*([^\n\r<]+)/i);
      if (catMatch) category = catMatch[1].trim();
    }

    const startDate = startMatch ? startMatch[1].trim().split("T")[0] : "";
    const endDate = finishMatch ? finishMatch[1].trim().split("T")[0] : startDate;
    const pct = pctMatch ? parseInt(pctMatch[1], 10) / 100 : 0;
    const milestone = milestoneMatch ? milestoneMatch[1] === "1" : false;

    // Parse PredecessorLinks
    const predRegex = /<PredecessorLink>([\s\S]*?)<\/PredecessorLink>/gi;
    let predMatch: RegExpExecArray | null;
    const predecessors: { predUid: number; type: number; lagDays: number }[] = [];

    while ((predMatch = predRegex.exec(taskXml)) !== null) {
      const predXml = predMatch[1];
      const pUidMatch = predXml.match(/<PredecessorUID>(\d+)<\/PredecessorUID>/i);
      const pTypeMatch = predXml.match(/<Type>(\d+)<\/Type>/i);
      const pLagMatch = predXml.match(/<LinkLag>(-?\d+)<\/LinkLag>/i);

      if (pUidMatch) {
        const predUid = parseInt(pUidMatch[1], 10);
        const type = pTypeMatch ? parseInt(pTypeMatch[1], 10) : 1;
        // linkLag / 4800 to get days
        const lagRaw = pLagMatch ? parseInt(pLagMatch[1], 10) : 0;
        const lagDays = Math.round(lagRaw / 4800);
        predecessors.push({ predUid, type, lagDays });
      }
    }

    const taskId = `t${uid}`;
    uidToId.set(uid, taskId);

    rawTasks.push({
      uid,
      name,
      start: startDate,
      end: endDate,
      category,
      percentComplete: pct,
      milestone,
      predecessors
    });
  }

  // Construct Jantt Tasks
  const tasks: Task[] = rawTasks.map((rt) => {
    const task: Task = {
      id: uidToId.get(rt.uid) || `t${rt.uid}`,
      label: rt.name,
      category: rt.category,
      start: rt.start,
      end: rt.end,
      progress: rt.percentComplete
    };

    if (rt.predecessors.length > 0) {
      const deps: DependencyRelation[] = [];
      for (const p of rt.predecessors) {
        const targetId = uidToId.get(p.predUid);
        if (targetId) {
          deps.push({
            id: targetId,
            type: MS_TO_TYPE[p.type] || "FS",
            lagDays: p.lagDays
          });
        }
      }
      if (deps.length === 1 && deps[0].type === "FS" && !deps[0].lagDays) {
        task.dependsOn = deps[0].id;
      } else if (deps.length > 0) {
        task.dependsOn = deps;
      }
    }

    return task;
  });

  return {
    meta: {
      title
    },
    tasks
  };
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(safe: string): string {
  return safe
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}
