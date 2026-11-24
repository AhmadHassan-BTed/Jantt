import type { JanttData } from "@jantt/core";

/**
 * Hyper-condensed, token-dense Jantt AST contract.
 * Uses TypeScript interface definitions for maximum model precision with minimal token overhead.
 */
export const JANTT_JSON_SCHEMA_RULES = `
# JANTT JSON SCHEMA BENCHMARK & SPECIFICATION (COMPACT CONTRACT)

type DateISO = string; // "YYYY-MM-DD"
type HexColor = string; // "#38BDF8"
type Dependency = string | { id: string; type?: "FS"|"SS"|"FF"|"SF"; lag?: number };

interface JanttData {
  $schema?: "https://jantt.dev/schema/v1.json";
  meta?: {
    title?: string;
    description?: string;
    person?: string;
    organization?: string;
    start?: DateISO;
    end?: DateISO;
    defaultGapDays?: number; // default 2
    scale?: "day" | "week" | "month" | "quarter" | "year";
    linkRouting?: "orthogonal" | "curved" | "direct";
    showCriticalPath?: boolean;
    showBaselines?: boolean;
    currency?: string;
    budget?: number;
    version?: string;
  };
  categories: Record<string, { label: string; color: HexColor; soft?: HexColor; icon?: string }>;
  people?: Array<{ id: string; name: string; role?: string; email?: string; teamId?: string; color?: HexColor }>;
  teams?: Array<{ id: string; name: string; color?: HexColor; description?: string }>;
  notes?: Array<{ id: string; title: string; content: string; color?: HexColor; pinned?: boolean; category?: string; tags?: string[]; task_ids?: string[] }>;
  documents?: Array<{ id: string; label: string; status?: "have"|"pending"|"missing"; owner?: string; url?: string; note?: string }>;
  tasks: Array<{
    id: string; // unique identifier (e.g. "t1", "t2", "task-qa-1")
    label: string;
    category: string; // MUST match a key in categories
    start: DateISO; // YYYY-MM-DD
    end: DateISO; // YYYY-MM-DD (must be >= start)
    wbs?: string;
    assignee?: string;
    phase?: string;
    priority?: "low" | "medium" | "high" | "urgent";
    estimatedCost?: number;
    actualCost?: number;
    dependsOn?: Dependency | Dependency[] | null;
    gapDays?: number;
    locked?: boolean;
    progress?: number; // float 0.0 to 1.0
    milestone?: boolean; // if true, start must equal end
    status?: "not-started" | "in-progress" | "submitted" | "completed" | "blocked";
    urgent?: boolean;
    baseline?: { start: DateISO; end: DateISO };
    notes?: string;
    fields?: Record<string, unknown>;
  }>;
}
`;

/**
 * Strips null, undefined, and empty values from plan objects to preserve maximum prompt context tokens.
 */
function stripEmptyValues(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(stripEmptyValues);
  }
  if (obj !== null && typeof obj === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v === null || v === undefined || v === "") continue;
      cleaned[k] = stripEmptyValues(v);
    }
    return cleaned;
  }
  return obj;
}

export function summarizePlanContext(plan: JanttData | null): string {
  if (!plan) return "No active plan loaded.";

  const taskCount = plan.tasks?.length || 0;
  const stripped = stripEmptyValues(plan) as JanttData;

  // For compact plans (<=60 tasks), provide full stripped AST
  if (taskCount <= 60) {
    return JSON.stringify(stripped, null, 2);
  }

  // For massive plans (>60 tasks), condense non-critical task metadata
  const condensed: JanttData = {
    ...stripped,
    tasks: (stripped.tasks || []).map((t) => ({
      id: t.id,
      label: t.label,
      category: t.category,
      start: t.start,
      end: t.end,
      assignee: t.assignee,
      dependsOn: t.dependsOn,
      status: t.status,
      progress: t.progress,
      milestone: t.milestone
    }))
  };

  return JSON.stringify(condensed, null, 2);
}

export function buildSystemPrompt(currentPlan: JanttData | null): string {
  const planContext = summarizePlanContext(currentPlan);

  return `You are Jantt AI Copilot, an elite schedule engineer executing precise Gantt modifications in the Jantt engine.

### SCHEMA CONTRACT
${JANTT_JSON_SCHEMA_RULES}

### CURRENT PLAN AST
\`\`\`json
${planContext}
\`\`\`

### NEGATIVE CONSTRAINTS (STRICTLY FORBIDDEN)
- [FORBIDDEN] NEVER emit conversational prose, diff explanations, or thoughts INSIDE the \`\`\`json block.
- [FORBIDDEN] NEVER introduce non-schema keys anywhere (e.g. "explanation", "summary", "changes_made", "thought", "diff", "status_code").
- [FORBIDDEN] NEVER hijack task "notes" or "label" to log what you changed. Task notes are reserved for actual project deliverables.
- [FORBIDDEN] NEVER delete untouched tasks, categories, or people unless explicitly ordered to remove them.
- [FORBIDDEN] NEVER produce invalid temporal order (end date < start date is illegal).
- [FORBIDDEN] NEVER create cyclic dependencies (A -> B -> A). The dependency graph must remain a strict DAG.
- [FORBIDDEN] NEVER emit JSON code blocks for purely analytical or informational queries (e.g. "what tasks are on critical path?").

### EXECUTION PROTOCOL
1. IF MODIFYING SCHEDULE:
   - Provide exactly 1-2 punchy sentences summarizing changes outside the JSON block.
   - Follow immediately with the updated valid JSON inside a single \`\`\`json ... \`\`\` block.
   - Send changed task fields with their existing IDs. Assign new tasks unique IDs like "t-new-1".
   - To remove a task explicitly requested for deletion, send its ID with "_deleted": true.
   - Ensure every task "category" exists in the "categories" dictionary.
2. IF ANSWERING INQUIRY:
   - Answer directly with concise, structured analytical bullet points. Do NOT output a JSON block.
`;
}
