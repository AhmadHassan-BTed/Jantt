import * as readline from "node:readline";
import {
  JanttData,
  Task,
  validate,
  resolveSchedule,
  calculateCriticalPath,
  auditScheduleIntegrity,
  exportToCsv,
  reconcilePlans
} from "@jantt/core";

export const MCP_TOOLS = [
  {
    name: "jantt_inspect_plan",
    description: "Inspects a Jantt timeline plan. Returns executive summary, project duration, critical path tasks, bottlenecks, and team workload.",
    inputSchema: {
      type: "object",
      properties: {
        planJson: {
          type: "string",
          description: "Raw Jantt plan JSON string"
        }
      },
      required: ["planJson"]
    }
  },
  {
    name: "jantt_add_task",
    description: "Adds a new task to a Jantt plan, automatically recalculates dependencies, and returns the updated plan JSON.",
    inputSchema: {
      type: "object",
      properties: {
        planJson: {
          type: "string",
          description: "Existing Jantt plan JSON string"
        },
        task: {
          type: "object",
          description: "Task object to insert",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            category: { type: "string" },
            start: { type: "string", description: "YYYY-MM-DD" },
            end: { type: "string", description: "YYYY-MM-DD" },
            dependsOn: { description: "Prerequisite task id, shorthand (e.g. 't1:SS+2d'), or array" },
            assignee: { type: "string" },
            progress: { type: "number" },
            milestone: { type: "boolean" }
          },
          required: ["id", "category", "start", "end"]
        }
      },
      required: ["planJson", "task"]
    }
  },
  {
    name: "jantt_reschedule_task",
    description: "Reschedules an existing task (shifts start/end dates) and re-evaluates downstream dependency cascades.",
    inputSchema: {
      type: "object",
      properties: {
        planJson: { type: "string", description: "Existing Jantt plan JSON string" },
        taskId: { type: "string", description: "ID of task to reschedule" },
        newStart: { type: "string", description: "New start date (YYYY-MM-DD)" },
        newEnd: { type: "string", description: "New end date (YYYY-MM-DD)" }
      },
      required: ["planJson", "taskId", "newStart", "newEnd"]
    }
  },
  {
    name: "jantt_audit_schedule",
    description: "Audits a project timeline using DCMA-14 guidelines. Detects circular loops, missing dependencies, negative floats, and orphan tasks.",
    inputSchema: {
      type: "object",
      properties: {
        planJson: { type: "string", description: "Jantt plan JSON string to audit" }
      },
      required: ["planJson"]
    }
  },
  {
    name: "jantt_diff_plans",
    description: "Compares two versions of a Jantt plan (base vs current) and outputs a human-readable variance and slippage report.",
    inputSchema: {
      type: "object",
      properties: {
        basePlanJson: { type: "string", description: "Original baseline plan JSON" },
        updatedPlanJson: { type: "string", description: "Updated plan JSON" }
      },
      required: ["basePlanJson", "updatedPlanJson"]
    }
  },
  {
    name: "jantt_export_csv",
    description: "Converts a Jantt timeline plan into RFC-4180 CSV spreadsheet format.",
    inputSchema: {
      type: "object",
      properties: {
        planJson: { type: "string", description: "Jantt plan JSON string" }
      },
      required: ["planJson"]
    }
  }
];

export function executeTool(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case "jantt_inspect_plan": {
      const plan: JanttData = typeof args.planJson === "string" ? JSON.parse(args.planJson) : (args.planJson as JanttData);
      const validation = validate(plan);
      const tasks = plan.tasks || [];
      const critical = calculateCriticalPath(tasks);

      return {
        valid: validation.valid,
        validationErrors: validation.errors.map((e) => e.message),
        summary: {
          title: plan.meta?.title || "Untitled Project",
          totalTasks: tasks.length,
          criticalPathLength: critical.criticalTaskIds.size,
          criticalTaskIds: Array.from(critical.criticalTaskIds),
          projectEarlyFinish: critical.projectEarlyFinish,
          categories: Object.keys(plan.categories || {})
        }
      };
    }

    case "jantt_add_task": {
      const plan: JanttData = typeof args.planJson === "string" ? JSON.parse(args.planJson) : (args.planJson as JanttData);
      const newTask = args.task as Task;
      const tasks = [...(plan.tasks || []).filter((t) => t.id !== newTask.id), newTask];
      const resolved = resolveSchedule(tasks, plan.meta?.defaultGapDays ?? 2);
      const updatedPlan: JanttData = { ...plan, tasks: resolved };

      return {
        success: true,
        addedTaskId: newTask.id,
        plan: updatedPlan
      };
    }

    case "jantt_reschedule_task": {
      const plan: JanttData = typeof args.planJson === "string" ? JSON.parse(args.planJson) : (args.planJson as JanttData);
      const taskId = String(args.taskId);
      const newStart = String(args.newStart);
      const newEnd = String(args.newEnd);

      const tasks = (plan.tasks || []).map((t) => {
        if (t.id === taskId) {
          return { ...t, start: newStart, end: newEnd };
        }
        return t;
      });

      const resolved = resolveSchedule(tasks, plan.meta?.defaultGapDays ?? 2);
      const updatedPlan: JanttData = { ...plan, tasks: resolved };

      return {
        success: true,
        rescheduledTaskId: taskId,
        plan: updatedPlan
      };
    }

    case "jantt_audit_schedule": {
      const plan: JanttData = typeof args.planJson === "string" ? JSON.parse(args.planJson) : (args.planJson as JanttData);
      const validation = validate(plan);
      const tasks = plan.tasks || [];
      const critical = calculateCriticalPath(tasks);
      const health = auditScheduleIntegrity(tasks, critical);

      return {
        valid: validation.valid,
        validationErrors: validation.errors,
        integrityScore: health.healthScore,
        grade: health.grade,
        issues: health.issues,
        metrics: {
          missingLogic: health.missingLogicCount,
          negativeFloat: health.negativeFloatCount,
          highFloat: health.highFloatCount,
          totalTasks: health.totalTasksChecked
        }
      };
    }

    case "jantt_diff_plans": {
      const basePlan: JanttData = typeof args.basePlanJson === "string" ? JSON.parse(args.basePlanJson) : (args.basePlanJson as JanttData);
      const updatedPlan: JanttData = typeof args.updatedPlanJson === "string" ? JSON.parse(args.updatedPlanJson) : (args.updatedPlanJson as JanttData);

      const baseIds = new Set((basePlan.tasks || []).map((t) => t.id));
      const updatedIds = new Set((updatedPlan.tasks || []).map((t) => t.id));

      const added = (updatedPlan.tasks || []).filter((t) => !baseIds.has(t.id));
      const deleted = (basePlan.tasks || []).filter((t) => !updatedIds.has(t.id));
      const modified = (updatedPlan.tasks || []).filter((t) => {
        if (!baseIds.has(t.id)) return false;
        const b = (basePlan.tasks || []).find((bt) => bt.id === t.id);
        return b && (b.start !== t.start || b.end !== t.end || b.progress !== t.progress || b.label !== t.label);
      });

      return {
        summary: {
          tasksAdded: added.length,
          tasksDeleted: deleted.length,
          tasksModified: modified.length
        },
        addedTaskIds: added.map((t) => t.id),
        deletedTaskIds: deleted.map((t) => t.id),
        modifiedTaskIds: modified.map((t) => t.id)
      };
    }

    case "jantt_export_csv": {
      const plan: JanttData = typeof args.planJson === "string" ? JSON.parse(args.planJson) : (args.planJson as JanttData);
      const csv = exportToCsv(plan);
      return { csv };
    }

    default:
      throw new Error(`Unknown Jantt MCP tool: ${name}`);
  }
}

/**
 * Standard MCP JSON-RPC Stdio Server loop.
 */
export function startMcpServer(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  const sendResponse = (id: unknown, result: unknown, error?: unknown) => {
    const payload: Record<string, unknown> = { jsonrpc: "2.0", id };
    if (error) {
      payload.error = { code: -32603, message: String(error) };
    } else {
      payload.result = result;
    }
    process.stdout.write(JSON.stringify(payload) + "\n");
  };

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const msg = JSON.parse(trimmed);
      const { id, method, params } = msg;

      if (method === "initialize") {
        sendResponse(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "jantt-mcp", version: "1.1.0" }
        });
      } else if (method === "tools/list") {
        sendResponse(id, { tools: MCP_TOOLS });
      } else if (method === "tools/call") {
        const { name, arguments: toolArgs } = params || {};
        try {
          const output = executeTool(name, toolArgs || {});
          sendResponse(id, {
            content: [
              {
                type: "text",
                text: typeof output === "string" ? output : JSON.stringify(output, null, 2)
              }
            ]
          });
        } catch (toolErr) {
          sendResponse(id, null, toolErr instanceof Error ? toolErr.message : String(toolErr));
        }
      } else if (method === "notifications/initialized") {
        // No response required for notification
      } else {
        sendResponse(id, null, `Method not found: ${method}`);
      }
    } catch (parseErr) {
      process.stderr.write(`Failed to parse MCP JSON-RPC message: ${parseErr}\n`);
    }
  });
}
