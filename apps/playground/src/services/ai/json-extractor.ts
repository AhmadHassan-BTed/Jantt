import type { JanttData, Task, JanttMeta } from "@jantt/core";

export interface ExtractionResult {
  data: JanttData | null;
  rawJson: string | null;
  textContent: string;
  source: "fenced-block" | "raw-object" | "none";
}

/** Allowed root keys in strict Jantt specification */
const VALID_ROOT_KEYS = new Set([
  "$schema",
  "meta",
  "categories",
  "calendars",
  "documents",
  "notes",
  "teams",
  "people",
  "tasks"
]);

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
  "fieldTimestamps",
  "updatedAt",
  "updatedBy",
  "_deleted",
  "deletedAt"
]);

function cleanJsonString(str: string): string {
  return str
    .replace(/,\s*([}\]])/g, "$1") // trailing commas
    .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, "$1") // comments
    .trim();
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
    if (VALID_TASK_KEYS.has(key)) {
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

  // Reconcile tasks
  let finalTasks: Task[] = [];
  const masterTasks = (currentPlan?.tasks || []).filter((t) => !t._deleted);

  if (incomingTasks && incomingTasks.length > 0) {
    const sanitizedIncoming = incomingTasks
      .map((t) => sanitizeTask(t))
      .filter((t): t is Partial<Task> & { id: string } => t !== null);

    const masterTaskMap = new Map<string, Task>(masterTasks.map((t) => [t.id, t]));
    const incomingTaskMap = new Map<string, Partial<Task>>(sanitizedIncoming.map((t) => [t.id, t]));

    // Is it a full replacement?
    // Only if incoming has at least masterTasks.length, or master is empty,
    // or incoming has nearly all tasks and includes required fields like start and category
    const isFullReplacement =
      masterTasks.length === 0 ||
      sanitizedIncoming.length >= masterTasks.length ||
      (masterTasks.length > 2 &&
        sanitizedIncoming.length >= masterTasks.length - 1 &&
        sanitizedIncoming.every((t) => t.category && t.start && t.end));

    if (isFullReplacement) {
      finalTasks = sanitizedIncoming.map((t) => ({
        category: fallbackCategory,
        ...t
      })) as Task[];
    } else {
      // Partial patch: merge incoming properties into existing master tasks
      finalTasks = masterTasks.map((masterT) => {
        const patch = incomingTaskMap.get(masterT.id);
        if (!patch) return masterT;
        return {
          ...masterT,
          ...patch
        };
      });
      // Append any genuinely new tasks
      for (const t of sanitizedIncoming) {
        if (!masterTaskMap.has(t.id)) {
          finalTasks.push({
            category: fallbackCategory,
            start: new Date().toISOString().slice(0, 10),
            end: new Date().toISOString().slice(0, 10),
            ...t
          } as Task);
        }
      }
    }
  } else {
    finalTasks = masterTasks;
  }

  // Purify root object
  const cleanPlan: Record<string, any> = {
    $schema: incomingRoot.$schema || currentPlan?.$schema || "https://jantt.dev/schema/v1.json",
    meta: {
      ...(currentPlan?.meta || {}),
      ...(incomingRoot.meta || {})
    },
    categories: {
      ...(currentPlan?.categories || {}),
      ...(incomingRoot.categories || {})
    },
    tasks: finalTasks
  };

  // Clean meta from conversational pollution
  if (cleanPlan.meta) {
    const cleanMeta: Record<string, any> = {};
    for (const [k, v] of Object.entries(cleanPlan.meta)) {
      if (!POLLUTION_ROOT_KEYS.has(k.toLowerCase())) {
        cleanMeta[k] = v;
      }
    }
    cleanPlan.meta = cleanMeta as JanttMeta;
  }

  // Preserve other valid schema sections
  if (incomingRoot.people || currentPlan?.people) {
    cleanPlan.people = incomingRoot.people || currentPlan?.people;
  }
  if (incomingRoot.teams || currentPlan?.teams) {
    cleanPlan.teams = incomingRoot.teams || currentPlan?.teams;
  }
  if (incomingRoot.notes || currentPlan?.notes) {
    cleanPlan.notes = incomingRoot.notes || currentPlan?.notes;
  }
  if (incomingRoot.documents || currentPlan?.documents) {
    cleanPlan.documents = incomingRoot.documents || currentPlan?.documents;
  }
  if (incomingRoot.calendars || currentPlan?.calendars) {
    cleanPlan.calendars = incomingRoot.calendars || currentPlan?.calendars;
  }

  // Final check: root must only contain strictly valid Jantt schema keys
  for (const k of Object.keys(cleanPlan)) {
    if (!VALID_ROOT_KEYS.has(k) || POLLUTION_ROOT_KEYS.has(k.toLowerCase())) {
      delete cleanPlan[k];
    }
  }

  return cleanPlan as JanttData;
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
