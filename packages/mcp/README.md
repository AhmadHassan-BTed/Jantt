# @jantt/mcp

> **Official Model Context Protocol (MCP) Server for Jantt Timelines and Project Schedules**

Connect your AI coding assistants (**Claude Desktop**, **Cursor**, **Gemini**, **Copilot**) directly to Jantt's scheduling engine. Inspect plans, add and reschedule tasks, calculate critical paths, audit schedule health (selected DCMA checks), compare plan versions, and export CSV spreadsheets via standard MCP stdio JSON-RPC.

---

## ⚡ Quick Setup

### 1. Claude Desktop Configuration

Add `@jantt/mcp` to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "jantt": {
      "command": "npx",
      "args": ["-y", "@jantt/mcp"]
    }
  }
}
```

### 2. Cursor IDE Integration

In Cursor Settings (`Features -> MCP Servers`), add a new command server:

- **Name:** `jantt`
- **Type:** `command`
- **Command:** `npx -y @jantt/mcp`

---

## 🛠️ Available MCP Tools

| Tool Name | Parameters | Description |
| :--- | :--- | :--- |
| `jantt_inspect_plan` | `planJson`, `targetDate?` | Summarizes a plan: validation errors, live task count, date span and duration, critical path (honoring `meta.defaultGapDays`), categories, and workload per assignee. |
| `jantt_add_task` | `planJson`, `task` | Inserts a new task, resolves dependency cascades, and returns the updated plan. Fails if the id already exists or the task is invalid (bad dates, unknown category, dangling dependency, cycle). |
| `jantt_reschedule_task` | `planJson`, `taskId`, `newStart`, `newEnd` | Moves a task and resolves cascades (successors are pushed later, never pulled earlier). Returns the requested vs. applied dates, `adjustedByDependencies`, and the ids of other tasks that moved. |
| `jantt_audit_schedule` | `planJson`, `targetDate?` | Schedule health (selected DCMA checks): missing logic, leads, lags, non-FS links, hard constraints, high float, negative float against `targetDate` (or `meta.targetDate`), high duration, out-of-sequence progress, and broken links. `checks` lists each one with `failed`/`eligible`, `threshold`, `passed`, and the `penalty` deducted from `integrityScore`. Float and duration are in working days when the plan uses a working calendar (`workingDays: true`). Also returns schema validation errors, including circular dependencies. |
| `jantt_diff_plans` | `basePlanJson`, `updatedPlanJson` | Added, deleted, and modified tasks (soft-deleted tasks count as deleted), every field change as `{ id, field, from, to }`, per-task slip days, and the project finish slip. |
| `jantt_export_csv` | `planJson` | Generates an RFC-4180 spreadsheet CSV of the schedule. |

`validationErrors` is always a list of `{ code, path, message, suggestion?, taskId? }` objects.

### Protocol behavior

- Speaks MCP protocol revisions `2025-06-18`, `2025-03-26`, and `2024-11-05` over newline-delimited JSON-RPC 2.0 on stdio, and answers `ping`.
- A tool that cannot run on its input (malformed `planJson`, unknown task id, invalid dates) returns a normal result with `isError: true` and a message that explains the fix, so the model can correct itself.
- Protocol problems use the standard JSON-RPC codes: `-32700` parse error, `-32600` invalid request, `-32601` unknown method, `-32602` unknown tool. Notifications never receive a response.
- Tools never write files: `jantt_add_task` and `jantt_reschedule_task` return the updated plan for the caller to save.

---

## 💻 CLI Usage

You can launch the server directly over stdio:

```bash
# Using npx
npx @jantt/mcp

# Or install globally
npm install -g @jantt/mcp
jantt-mcp
```

## 📦 Programmatic Usage

You can also import tool handlers and the server starter directly in your TypeScript/JavaScript codebase. `executeTool` returns `unknown` (each tool has its own result shape) and throws an `Error` with a readable message when the input is invalid:

```typescript
import { executeTool, MCP_TOOLS, startMcpServer } from "@jantt/mcp";
import type { JanttData } from "@jantt/core";

const myPlan: JanttData = { tasks: [] };

// Execute a tool directly
const auditResult = executeTool("jantt_audit_schedule", {
  planJson: JSON.stringify(myPlan),
  targetDate: "2026-12-31"
}) as { integrityScore: number; grade: string };

console.log("Schedule Health Score:", auditResult.integrityScore);

// Serve MCP on stdio (pass other Readable/Writable streams to embed it elsewhere)
startMcpServer();
```

---

## 📄 License

MIT © [Jantt Team](https://github.com/AhmadHassan-BTed/Jantt)

