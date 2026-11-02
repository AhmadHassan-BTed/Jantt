# @jantt/mcp

> **Official Model Context Protocol (MCP) Server for Jantt Timelines and Project Schedules**

Connect your AI coding assistants (**Claude Desktop**, **Cursor**, **Gemini**, **Copilot**) directly to Jantt's zero-dependency scheduling engine. Inspect plans, add tasks, calculate critical paths, audit DCMA-14 schedule integrity, and export CSV spreadsheets via standard MCP stdio JSON-RPC.

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
| `jantt_inspect_plan` | `planJson` | Analyzes a Jantt plan: computes duration, critical path sequence, bottlenecks, and team workloads. |
| `jantt_add_task` | `planJson`, `task` | Inserts a new task, calculates dependencies, and returns the resolved plan. |
| `jantt_reschedule_task` | `planJson`, `taskId`, `newStart`, `newEnd` | Shifts task dates and recalculates downstream dependency cascades. |
| `jantt_audit_schedule` | `planJson` | Runs standard DCMA-14 health checks: circular loop detection, missing logic, and float analysis. |
| `jantt_diff_plans` | `basePlanJson`, `updatedPlanJson` | Computes semantic change summary (tasks added, deleted, or modified). |
| `jantt_export_csv` | `planJson` | Generates RFC-4180 spreadsheet CSV representation of the schedule. |

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

You can also import tool handlers and the server starter directly in your TypeScript/JavaScript codebase:

```typescript
import { executeTool, MCP_TOOLS, startMcpServer } from "@jantt/mcp";

// Execute a tool directly
const auditResult = executeTool("jantt_audit_schedule", {
  planJson: JSON.stringify(myPlan)
});

console.log("Schedule Health Score:", auditResult.integrityScore);
```

---

## 📄 License

MIT © [Jantt Team](https://github.com/AhmadHassan-BTed/Jantt)

