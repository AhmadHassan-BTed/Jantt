export function buildOpenApiSpec(serverOrigin: string): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Jantt Cloud Agent API",
      version: "1.1.0",
      description:
        "Account-scoped REST API and Remote MCP endpoint for inspecting, creating, and editing Firebase-synced Jantt Cloud plans in real time."
    },
    servers: [{ url: serverOrigin }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "jnt_live_...",
          description: "Per-account API key generated from the Jantt Playground Agent API dialog."
        }
      }
    },
    security: [{ ApiKeyAuth: [] }],
    paths: {
      "/v1/plans": {
        get: {
          operationId: "listPlans",
          summary: "List all cloud plans accessible to this account (owned and shared)",
          responses: { "200": { description: "Array of cloud plan summaries" } }
        },
        post: {
          operationId: "createPlan",
          summary: "Create a new Jantt cloud plan/room",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    plan: { type: "object", description: "Optional initial JanttData JSON object" }
                  }
                }
              }
            }
          },
          responses: { "201": { description: "Created cloud room payload" } }
        }
      },
      "/v1/plans/{roomId}": {
        parameters: [{ name: "roomId", in: "path", required: true, schema: { type: "string" } }],
        get: {
          operationId: "getPlan",
          summary: "Fetch full cloud plan JSON, metadata, and caller role",
          responses: { "200": { description: "Full room metadata and decoded JanttData plan" } }
        },
        put: {
          operationId: "replacePlan",
          summary: "Replace the entire plan JSON in a cloud room (owner/editor)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["plan"],
                  properties: {
                    plan: { type: "object" },
                    title: { type: "string" },
                    expectedRevision: { type: "integer" }
                  }
                }
              }
            }
          },
          responses: { "200": { description: "Saved plan and incremented revision" } }
        },
        patch: {
          operationId: "patchPlan",
          summary: "Partially update room title, meta, categories, people, teams, or notes (owner/editor)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    meta: { type: "object" },
                    categories: { type: "object" },
                    people: { type: "array", items: { type: "object" } },
                    teams: { type: "array", items: { type: "object" } },
                    notes: { type: "array", items: { type: "object" } }
                  }
                }
              }
            }
          },
          responses: { "200": { description: "Updated plan and incremented revision" } }
        },
        delete: {
          operationId: "deletePlan",
          summary: "Delete a cloud plan/room (owner only)",
          responses: { "200": { description: "Deletion confirmation" } }
        }
      },
      "/v1/plans/{roomId}/tasks": {
        parameters: [{ name: "roomId", in: "path", required: true, schema: { type: "string" } }],
        get: {
          operationId: "listTasks",
          summary: "List live (non-deleted) tasks in a cloud plan",
          parameters: [
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "assignee", in: "query", schema: { type: "string" } },
            { name: "status", in: "query", schema: { type: "string" } }
          ],
          responses: { "200": { description: "Filtered tasks array" } }
        },
        post: {
          operationId: "addTask",
          summary: "Add a task to a cloud plan with validation and dependency cascade (owner/editor)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["id", "category", "start", "end"],
                  properties: {
                    id: { type: "string" },
                    label: { type: "string" },
                    name: { type: "string" },
                    category: { type: "string" },
                    start: { type: "string", format: "date" },
                    end: { type: "string", format: "date" },
                    dependsOn: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
                    assignee: { type: "string" },
                    progress: { type: "number" },
                    status: { type: "string" },
                    priority: { type: "string" },
                    milestone: { type: "boolean" }
                  }
                }
              }
            }
          },
          responses: { "201": { description: "Added task, movedTaskIds, and new revision" } }
        }
      },
      "/v1/plans/{roomId}/tasks/{taskId}": {
        parameters: [
          { name: "roomId", in: "path", required: true, schema: { type: "string" } },
          { name: "taskId", in: "path", required: true, schema: { type: "string" } }
        ],
        patch: {
          operationId: "updateTask",
          summary: "Update fields or reschedule a task with dependency cascade (owner/editor)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    name: { type: "string" },
                    category: { type: "string" },
                    start: { type: "string", format: "date" },
                    end: { type: "string", format: "date" },
                    dependsOn: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }, { type: "null" }] },
                    assignee: { type: "string" },
                    progress: { type: "number" },
                    status: { type: "string" },
                    priority: { type: "string" },
                    milestone: { type: "boolean" },
                    locked: { type: "boolean" },
                    estimatedCost: { type: "number" },
                    actualCost: { type: "number" }
                  }
                }
              }
            }
          },
          responses: { "200": { description: "Updated task, movedTaskIds, and new revision" } }
        },
        delete: {
          operationId: "deleteTask",
          summary: "Delete a task from a cloud plan (sync-safe tombstone) (owner/editor)",
          responses: { "200": { description: "Deleted task confirmation and new revision" } }
        }
      },
      "/v1/plans/{roomId}/inspect": {
        parameters: [{ name: "roomId", in: "path", required: true, schema: { type: "string" } }],
        get: {
          operationId: "inspectPlan",
          summary: "Summarize plan health, critical path, date span, and workload per assignee",
          responses: { "200": { description: "Plan inspection summary" } }
        }
      },
      "/v1/plans/{roomId}/audit": {
        parameters: [{ name: "roomId", in: "path", required: true, schema: { type: "string" } }],
        get: {
          operationId: "auditPlan",
          summary: "Run selected DCMA schedule integrity checks on a cloud plan",
          responses: { "200": { description: "Integrity score, grade, checks, and issues" } }
        }
      },
      "/v1/plans/{roomId}/export.csv": {
        parameters: [{ name: "roomId", in: "path", required: true, schema: { type: "string" } }],
        get: {
          operationId: "exportPlanCsv",
          summary: "Export a cloud plan as an RFC-4180 CSV spreadsheet",
          responses: { "200": { description: "text/csv spreadsheet" } }
        }
      },
      "/v1/mcp": {
        post: {
          operationId: "mcpRpc",
          summary: "Streamable HTTP Model Context Protocol (JSON-RPC 2.0) endpoint for cloud plans",
          responses: { "200": { description: "JSON-RPC 2.0 response" } }
        }
      }
    }
  };
}

