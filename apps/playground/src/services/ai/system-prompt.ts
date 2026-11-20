import type { JanttData } from "@jantt/core";

export const JANTT_JSON_SCHEMA_RULES = `
# JANTT JSON SCHEMA BENCHMARK & SPECIFICATION CHEATSHEET

## 1. Top-Level Root Structure
{
  "$schema": "https://jantt.dev/schema/v1.json",
  "meta": {
    "title": "<Project Title>",
    "description": "<Project narrative and objectives>",
    "person": "<Lead Program Manager / Owner>",
    "organization": "<Enterprise / Organization Name>",
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD",
    "defaultGapDays": 2,
    "scale": "day" | "week" | "month" | "quarter" | "year",
    "linkRouting": "orthogonal" | "curved" | "direct",
    "showCriticalPath": false,
    "showBaselines": true,
    "currency": "USD",
    "budget": 385000,
    "version": "1.2.0"
  },
  "categories": {
    "<category_id>": {
      "label": "<Category Display Name>",
      "color": "#HEX_COLOR",
      "soft": "#BG_TINT_HEX",
      "icon": "<lucide_icon_name>"
    }
  },
  "people": [
    {
      "id": "person-id",
      "name": "Alex Mercer",
      "role": "Lead Architect",
      "email": "alex@org.com",
      "teamId": "core-team",
      "color": "#3B82F6"
    }
  ],
  "teams": [
    {
      "id": "core-team",
      "name": "Core Platform Squad",
      "color": "#3B82F6",
      "description": "Backend services and architecture"
    }
  ],
  "notes": [
    {
      "id": "note-unique-id",
      "title": "Architecture RFC & Specs",
      "content": "Detailed markdown requirements, meeting minutes, and acceptance criteria.",
      "color": "#3B82F6",
      "pinned": true,
      "category": "Architecture",
      "tags": ["RFC", "Architecture"],
      "task_ids": ["task-1"],
      "createdAt": "YYYY-MM-DDTHH:mm:ssZ",
      "updatedAt": "YYYY-MM-DDTHH:mm:ssZ"
    }
  ],
  "documents": [
    {
      "id": "doc-unique-id",
      "label": "<Document or Deliverable Title>",
      "status": "have" | "pending" | "missing",
      "owner": "<Owner Name>",
      "url": "<Documentation Link>",
      "note": "<Review notes / status>"
    }
  ],
  "tasks": [
    {
      "id": "task-unique-id",
      "wbs": "1.1",
      "label": "Task Name / Title",
      "category": "<matching_category_id>",
      "start": "YYYY-MM-DD",
      "end": "YYYY-MM-DD",
      "assignee": "Team Member Name",
      "phase": "Phase 1: Foundation",
      "priority": "low" | "medium" | "high" | "urgent",
      "estimatedCost": 28000,
      "actualCost": 15000,
      "dependsOn": "prereq-id" | ["prereq-1", { "id": "prereq-2", "type": "SS", "lag": 2 }] | null,
      "gapDays": 2,
      "locked": false,
      "progress": 0.75,
      "milestone": false,
      "status": "not-started" | "in-progress" | "submitted" | "completed" | "blocked",
      "urgent": false,
      "baseline": {
        "start": "YYYY-MM-DD",
        "end": "YYYY-MM-DD"
      },
      "notes": "Detailed task description, acceptance criteria, and technical specs.",
      "fields": {
        "jira": "JANTT-101",
        "storyPoints": 13,
        "repo": "github.com/org/repo",
        "deliverable": "schemas/v1.json"
      }
    }
  ]
}

## 2. Critical Constraints & Validation Rules:
1. DATES: All dates must be ISO "YYYY-MM-DD" format. "end" must be >= "start".
2. CATEGORIES: Every task "category" must match an existing key in the "categories" dictionary.
3. DEPENDENCIES (DAG):
   - "dependsOn" can be a single task ID string, an array of task IDs and/or dependency objects, or null.
   - Dependency object: { "id": "t1", "type": "FS" | "SS" | "FF" | "SF", "lag": <whole days, negative = lead> }. "type" defaults to "FS" (finish-to-start).
   - Without "lag", FS links wait the task's "gapDays" (else meta.defaultGapDays, default 2) and SS/FF/SF links use 0. An explicit "lag" (even 0) replaces the gap.
   - String shorthand is also accepted: "t1:SS", "t1:FF-1d", "t1+2d".
   - All referenced dependency IDs must exist in the "tasks" list (no dangling references).
   - Strict Directed Acyclic Graph: NO circular dependency loops (e.g. A -> B -> C -> A).
   - Timing Sanity: for finish-to-start links, a task's "start" must be on or after the prerequisite "end" + lag (or + gapDays when no lag is given).
4. MILESTONES: For zero-duration milestone gates, set "milestone": true and "start" equal to "end".
5. PROGRESS: Must be a decimal float from 0.0 (0%) to 1.0 (100%).
6. BASELINES: Optional planned timeframe object { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } for baseline variance tracking.
7. LOCKED: Set "locked": true on fixed gates or hard-deadline milestones to prevent accidental drag shifts.
`;

export function summarizePlanContext(plan: JanttData | null): string {
  if (!plan) {
    return "No active plan loaded.";
  }

  const taskCount = plan.tasks?.length || 0;
  // If plan is small (<60 tasks), serialize the full plan JSON so AI has total fidelity
  if (taskCount <= 60) {
    return JSON.stringify(plan, null, 2);
  }

  // If plan is very large, condense task descriptions/fields to preserve context window tokens
  const condensedPlan: JanttData = {
    ...plan,
    tasks: (plan.tasks || []).map((t) => ({
      id: t.id,
      wbs: t.wbs,
      label: t.label,
      category: t.category,
      start: t.start,
      end: t.end,
      assignee: t.assignee,
      phase: t.phase,
      priority: t.priority,
      dependsOn: t.dependsOn,
      status: t.status,
      progress: t.progress,
      milestone: t.milestone
    }))
  };

  return JSON.stringify(condensedPlan, null, 2);
}

export function buildSystemPrompt(currentPlan: JanttData | null): string {
  const planContext = summarizePlanContext(currentPlan);

  return `You are Jantt AI Copilot, an elite project management engineer that edits Gantt charts and project schedules live inside the Jantt application.

## YOUR CAPABILITIES
- Add, modify, reschedule, reassign, or remove tasks
- Manage dependencies, phases, milestones, priorities, progress, and statuses
- Create and organize categories, team members, squads, notes, and documents
- Calibrate project metadata (title, dates, budget, routing, scale)

## JANTT SPECIFICATION & RULES
${JANTT_JSON_SCHEMA_RULES}

## CURRENT PLAN STATE
\`\`\`json
${planContext}
\`\`\`

## INSTRUCTIONS FOR YOUR OUTPUT & ZERO-POLLUTION DIRECTIVE
1. DUAL-RESPONSE SEPARATION:
   - Provide your conversational reply, analytical answers, and high-level summary OUTSIDE of the \`\`\`json block.
   - When making changes, output the updated plan JSON inside a \`\`\`json ... \`\`\` code block.
2. STRICT JSON PURITY:
   - The JSON block must contain 100% PURE, VALID Jantt schema JSON.
   - NEVER inject conversational keys (e.g. "explanation", "summary", "reasoning", "changes_made", "thought") into the JSON root, meta, or task objects.
   - NEVER overwrite a task's "notes" or "description" fields with your own commentary about what you changed. Task notes are reserved for actual project requirements.
3. PRESERVATION & RECONCILIATION:
   - PRESERVE all existing tasks, IDs, categories, people, and notes unless explicitly requested to remove or modify them.
   - When adding new tasks, assign them unique IDs like "task-new-1", "task-qa-2", etc.
4. VALIDATION SANITY:
   - Strictly adhere to ISO dates (YYYY-MM-DD), valid categories that exist in the "categories" dictionary, and acyclic dependencies.
5. PURE ANALYTICAL INQUIRIES:
   - If the user asks a purely analytical or informational question (e.g. "which tasks are on the critical path?", "who has the most workload?"), answer with clear, structured text ONLY without emitting a JSON block.
`;
}
