import type { JanttData, Task } from "@jantt/core";

import { deleteTasks, getPeerId } from "../../utils";

export interface ExtractionResult {
  data: JanttData | null;
  rawJson: string | null;
  textContent: string;
  source: "fenced-block" | "raw-object" | "none";
}

/** Known conversational or LLM hallucination keys that must NEVER enter the JSON */
const POLLUTION_ROOT_KEYS = new Set([
  "explanation",
  "explanations",
  "thought",
  "thoughts",
  "reasoning",
  "summary",
  "changes",
  "changes_made",
  "changelog",
  "notes_on_changes",
  "description_of_changes",
  "message",
  "response",
  "reply",
  "commentary",
  "status_report",
  "analysis"
]);

/** Allowed canonical task property keys */
const VALID_TASK_KEYS = new Set([
  "id",
  "label",
  "name",
  "category",
  "start",
  "end",
  "dependsOn",
  "gapDays",
  "minGapDays",
  "locked",
  "progress",
  "milestone",
  "baseline",
  "status",
  "urgent",
  "priority",
  "assignee",
  "teamId",
  "calendar",
  "calendarId",
  "wbs",
  "phase",
  "color",
  "pert",
  "estimatedCost",
  "actualCost",
  "notes",
  "description",
  "fields",
  "_deleted"
]);

function cleanJsonString(str: string): string {
  // Match quoted JSON strings first so punctuation and comment markers in notes stay literal.
  return str.replace(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|,(?=\s*[}\]])/g, token =>
    token.startsWith('"') ? token : ""
  ).trim();
}

/**
 * Strips conversational pollution and ensures tasks adhere to Jantt schema.
 */
export function sanitizeTask(task: any): (Partial<Task> & { id: string }) | null {
  if (!task || typeof task !== "object") return null;

  const id = String(task.id || "").trim();
  if (!id) return null;

  const cleanTask: Record<string, any> = { id };

  for (const [key, value] of Object.entries(task)) {
    if (POLLUTION_ROOT_KEYS.has(key.toLowerCase())) continue;
    if (key !== "id" && VALID_TASK_KEYS.has(key)) {
      cleanTask[key] = value;
    }
  }

  return cleanTask as Partial<Task> & { id: string };
}

/**
 * Purifies and reconciles raw extracted JSON against the active master plan.
 *
 * Guarantees:
 * 1. Zero conversational pollution in the JSON.
 * 2. Partial updates (e.g. AI emitting just tasks or meta) preserve categories, people, and other tasks.
 * 3. 100% compliant JanttData shape.
 */
export function sanitizeAndReconcilePlan(
  candidate: any,
  currentPlan: JanttData | null
): JanttData | null {
  if (!candidate || typeof candidate !== "object") return null;

  // If candidate is an array of tasks directly: e.g. [ { id: "t1", ... } ]
  let incomingTasks: any[] | null = null;
  let incomingRoot: Record<string, any> = {};

  if (Array.isArray(candidate)) {
    incomingTasks = candidate;
  } else {
    incomingRoot = candidate;
    if (Array.isArray(candidate.tasks)) {
      incomingTasks = candidate.tasks;
    }
  }

  // Determine fallback category
  const activeCategories = currentPlan?.categories || incomingRoot.categories || {};
  const fallbackCategory = Object.keys(activeCategories)[0] || "general";

  // Existing tasks are patches by ID, including when a provider echoes the whole plan.
  // Large-plan prompts intentionally omit fields such as budgets and baselines.
  const masterTasks = currentPlan?.tasks || [];
  const masterIds = new Set(masterTasks.map(task => task.id));
  const patches = new Map<string, Partial<Task> & { id: string }>();
  for (const rawTask of incomingTasks || []) {
    const patch = sanitizeTask(rawTask);
    if (patch) patches.set(patch.id, patch);
  }

  const removed: string[] = [];
  const tasks = masterTasks.map(task => {
    const patch = patches.get(task.id);
    if (!patch || task._deleted) return task;
    if (patch._deleted === true) {
      removed.push(task.id);
      return task;
    }
    return { ...task, ...patch };
  });
  for (const patch of patches.values()) {
    if (masterIds.has(patch.id) || patch._deleted || currentPlan?.meta?.tombstones?.[patch.id]) continue;
    tasks.push({ category: fallbackCategory, ...patch } as Task);
  }

  const plan: JanttData = { ...currentPlan, tasks };
  if (incomingRoot.$schema) plan.$schema = incomingRoot.$schema;
  if (incomingRoot.categories) plan.categories = { ...currentPlan?.categories, ...incomingRoot.categories };
  if (incomingRoot.meta) {
    const bookkeeping = new Set(["revision", "updatedAt", "contentHash", "sync", "tombstones"]);
    const editableMeta = Object.fromEntries(Object.entries(incomingRoot.meta).filter(
      ([key]) => !bookkeeping.has(key) && !POLLUTION_ROOT_KEYS.has(key.toLowerCase())
    ));
    plan.meta = { ...currentPlan?.meta, ...editableMeta };
  }
  for (const key of ["people", "teams", "notes", "documents", "calendars"] as const) {
    if (incomingRoot[key] !== undefined) plan[key] = incomingRoot[key];
  }
  return removed.length ? deleteTasks(plan, removed, new Date().toISOString() + "#" + getPeerId()) : plan;
}

/**
 * Extracts a Jantt JSON plan from an AI response containing mixed explanation and code.
 * Reconciles with current plan context to ensure 100% purity and completeness.
 */
export function extractJsonFromResponse(
  response: string,
  currentPlan?: JanttData | null
): ExtractionResult {
  if (!response || typeof response !== "string") {
    return { data: null, rawJson: null, textContent: "", source: "none" };
  }

  // 1. Look for ```json ... ``` or ``` ... ``` fenced code blocks
  const fencedRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  let match: RegExpExecArray | null;
  const jsonCandidates: Array<{ raw: string; data: any; start: number; end: number }> = [];

  while ((match = fencedRegex.exec(response)) !== null) {
    const candidateStr = cleanJsonString(match[1]);
    try {
      const parsed = JSON.parse(candidateStr);
      if (
        parsed &&
        typeof parsed === "object" &&
        (Array.isArray(parsed.tasks) || parsed.categories || parsed.meta || Array.isArray(parsed))
      ) {
        jsonCandidates.push({
          raw: candidateStr,
          data: parsed,
          start: match.index,
          end: match.index + match[0].length
        });
      }
    } catch {
      // Continue searching
    }
  }

  if (jsonCandidates.length > 0) {
    // Pick largest candidate
    jsonCandidates.sort((a, b) => b.raw.length - a.raw.length);
    const best = jsonCandidates[0];

    const textContent = (response.slice(0, best.start) + "\n" + response.slice(best.end)).trim();
    const sanitized = sanitizeAndReconcilePlan(best.data, currentPlan || null);

    return {
      data: sanitized,
      rawJson: best.raw,
      textContent,
      source: "fenced-block"
    };
  }

  // 2. Fallback: Find raw top-level balanced `{ ... }`
  const firstBrace = response.indexOf("{");
  const lastBrace = response.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const rawCandidate = cleanJsonString(response.slice(firstBrace, lastBrace + 1));
    try {
      const parsed = JSON.parse(rawCandidate);
      if (
        parsed &&
        typeof parsed === "object" &&
        (Array.isArray(parsed.tasks) || parsed.categories || parsed.meta)
      ) {
        const textContent = (response.slice(0, firstBrace) + "\n" + response.slice(lastBrace + 1)).trim();
        const sanitized = sanitizeAndReconcilePlan(parsed, currentPlan || null);

        return {
          data: sanitized,
          rawJson: rawCandidate,
          textContent,
          source: "raw-object"
        };
      }
    } catch {
      // Ignore
    }
  }

  // 3. No valid plan JSON found (pure conversational answer)
  return {
    data: null,
    rawJson: null,
    textContent: response.trim(),
    source: "none"
  };
}
