import { describe, it, expect } from "vitest";
import { MCP_TOOLS, executeTool } from "../src/index";
import basicJson from "../../../examples/basic.json";

describe("@jantt/mcp Model Context Protocol Server", () => {
  it("exposes all 6 standard timeline MCP tools", () => {
    expect(MCP_TOOLS).toHaveLength(6);
    const names = MCP_TOOLS.map((t) => t.name);
    expect(names).toContain("jantt_inspect_plan");
    expect(names).toContain("jantt_add_task");
    expect(names).toContain("jantt_reschedule_task");
    expect(names).toContain("jantt_audit_schedule");
    expect(names).toContain("jantt_diff_plans");
    expect(names).toContain("jantt_export_csv");
  });

  describe("jantt_inspect_plan", () => {
    it("inspects plan JSON and returns critical path and metrics", () => {
      const res = executeTool("jantt_inspect_plan", { planJson: JSON.stringify(basicJson) }) as any;
      expect(res.valid).toBe(true);
      expect(res.summary.totalTasks).toBe(basicJson.tasks.length);
      expect(res.summary.criticalPathLength).toBeGreaterThan(0);
    });
  });

  describe("jantt_add_task", () => {
    it("adds a task and dynamically recalculates downstream schedule", () => {
      const newTask = {
        id: "new-deploy",
        label: "Production Deployment",
        category: "dev",
        start: "2026-09-01",
        end: "2026-09-05",
        dependsOn: "backend-core:FS+2d"
      };

      const res = executeTool("jantt_add_task", {
        planJson: JSON.stringify(basicJson),
        task: newTask
      }) as any;

      expect(res.success).toBe(true);
      expect(res.addedTaskId).toBe("new-deploy");
      const found = res.plan.tasks.find((t: any) => t.id === "new-deploy");
      expect(found).toBeDefined();
      expect(found.start).toBeDefined();
    });
  });

  describe("jantt_audit_schedule", () => {
    it("runs DCMA-14 schedule health checks", () => {
      const res = executeTool("jantt_audit_schedule", { planJson: JSON.stringify(basicJson) }) as any;
      expect(res.valid).toBe(true);
      expect(res.integrityScore).toBeGreaterThanOrEqual(0);
      expect(res.integrityScore).toBeLessThanOrEqual(100);
      expect(res.metrics.totalTasks).toBe(basicJson.tasks.length);
    });
  });

  describe("jantt_export_csv", () => {
    it("exports plan to valid CSV string", () => {
      const res = executeTool("jantt_export_csv", { planJson: JSON.stringify(basicJson) }) as any;
      expect(res.csv).toBeDefined();
      expect(res.csv).toContain("Task ID,WBS,Label / Name,Category");
    });
  });

  describe("jantt_diff_plans", () => {
    it("compares two versions and returns summary metrics", () => {
      const updated = {
        ...basicJson,
        tasks: [
          ...basicJson.tasks,
          { id: "extra-1", label: "Extra Task", category: "dev", start: "2026-09-01", end: "2026-09-03" }
        ]
      };

      const res = executeTool("jantt_diff_plans", {
        basePlanJson: JSON.stringify(basicJson),
        updatedPlanJson: JSON.stringify(updated)
      }) as any;

      expect(res.summary.tasksAdded).toBe(1);
      expect(res.addedTaskIds).toContain("extra-1");
    });
  });
});
