import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import type { JanttData } from "@jantt/core";
import { extractJsonFromResponse } from "./json-extractor";
import { computePlanDiff } from "./plan-differ";
import { buildSystemPrompt } from "./system-prompt";
import { getProviderAdapter, getModelsForProvider, getAllProviders } from "./provider-registry";
import {
  getActiveProvider,
  setActiveProvider,
  getApiKey,
  setApiKey,
  getModelForProvider,
  setModelForProvider,
  getAutoApply,
  setAutoApply,
  clearAllCopilotStorage
} from "./storage";

// In Node environment without browser window, provide minimal mock storage
const store: Record<string, string> = {};
const mockStorage: Storage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
  clear: () => {
    for (const k in store) delete store[k];
  },
  get length() {
    return Object.keys(store).length;
  },
  key: (i: number) => Object.keys(store)[i] ?? null
};

beforeAll(() => {
  if (typeof globalThis.localStorage === "undefined") {
    (globalThis as any).localStorage = mockStorage;
  }
});

describe("AI Copilot - json-extractor", () => {
  it("extracts valid plan from fenced code block with explanation", () => {
    const aiResponse = `Here is the revised project schedule based on your requirements:

\`\`\`json
{
  "meta": { "title": "Updated Plan" },
  "tasks": [
    { "id": "task-1", "label": "Setup CI", "start": "2026-11-20", "end": "2026-11-22" }
  ]
}
\`\`\`

I added the CI task starting on November 20.`;

    const result = extractJsonFromResponse(aiResponse);
    expect(result.source).toBe("fenced-block");
    expect(result.data).not.toBeNull();
    expect(result.data?.meta?.title).toBe("Updated Plan");
    expect(result.data?.tasks?.length).toBe(1);
    expect(result.textContent).toContain("Here is the revised project schedule");
    expect(result.textContent).toContain("I added the CI task");
  });

  it("handles trailing commas in AI responses gracefully", () => {
    const aiResponse = `\`\`\`json
{
  "tasks": [
    { "id": "t1", "label": "Task 1", }
  ],
}
\`\`\``;

    const result = extractJsonFromResponse(aiResponse);
    expect(result.data).not.toBeNull();
    expect(result.data?.tasks?.[0].id).toBe("t1");
  });

  it("picks the largest candidate when multiple JSON blocks are emitted", () => {
    const aiResponse = `Small snippet:
\`\`\`json
{ "note": "snippet" }
\`\`\`

Full schedule:
\`\`\`json
{
  "meta": { "title": "Master Schedule" },
  "tasks": [
    { "id": "t1", "label": "Architecture", "start": "2026-11-20", "end": "2026-11-25" },
    { "id": "t2", "label": "Execution", "start": "2026-11-26", "end": "2026-12-05" }
  ]
}
\`\`\``;

    const result = extractJsonFromResponse(aiResponse);
    expect(result.data?.meta?.title).toBe("Master Schedule");
    expect(result.data?.tasks?.length).toBe(2);
  });

  it("returns null when no JSON is present", () => {
    const textOnly = "I have reviewed your schedule. The critical path runs through tasks 1, 3, and 5.";
    const result = extractJsonFromResponse(textOnly);
    expect(result.source).toBe("none");
    expect(result.data).toBeNull();
    expect(result.textContent).toBe(textOnly);
  });

  it("strictly purges conversational pollution keys from root, meta, and tasks", () => {
    const pollutedAiResponse = `Here is your updated schedule:

\`\`\`json
{
  "$schema": "https://jantt.dev/schema/v1.json",
  "explanation": "I shifted the schedule by 3 days",
  "thought": "The user requested a 3 day shift",
  "changes_made": ["task-1 shifted"],
  "meta": {
    "title": "Clean Project",
    "summary": "This should not be in meta"
  },
  "tasks": [
    {
      "id": "t1",
      "label": "Audit",
      "category": "eng",
      "start": "2026-11-20",
      "end": "2026-11-23",
      "reasoning": "Moved forward",
      "ai_note": "Pollution"
    }
  ]
}
\`\`\``;

    const result = extractJsonFromResponse(pollutedAiResponse);
    expect(result.data).not.toBeNull();
    const data = result.data as any;

    // Root must NOT have pollution keys
    expect(data.explanation).toBeUndefined();
    expect(data.thought).toBeUndefined();
    expect(data.changes_made).toBeUndefined();

    // Meta must NOT have pollution keys
    expect(data.meta.title).toBe("Clean Project");
    expect(data.meta.summary).toBeUndefined();

    // Task must NOT have pollution keys
    expect(data.tasks[0].id).toBe("t1");
    expect(data.tasks[0].reasoning).toBeUndefined();
    expect(data.tasks[0].ai_note).toBeUndefined();
  });

  it("reconciles partial updates without losing existing categories or other tasks", () => {
    const currentPlan: JanttData = {
      meta: { title: "Master Plan" },
      categories: {
        eng: { label: "Engineering", color: "#3B82F6" },
        des: { label: "Design", color: "#A855F7" }
      },
      people: [{ id: "p1", name: "Sarah" }],
      tasks: [
        { id: "t1", label: "Task 1", category: "eng", start: "2026-11-20", end: "2026-11-22", status: "not-started" },
        { id: "t2", label: "Task 2", category: "des", start: "2026-11-23", end: "2026-11-25", status: "not-started" }
      ]
    };

    // AI only emits update for t2
    const partialAiResponse = `Marked Task 2 as completed.
\`\`\`json
{
  "tasks": [
    { "id": "t2", "status": "completed", "progress": 1.0 }
  ]
}
\`\`\``;

    const result = extractJsonFromResponse(partialAiResponse, currentPlan);
    expect(result.data).not.toBeNull();
    expect(result.data?.categories).toHaveProperty("eng");
    expect(result.data?.categories).toHaveProperty("des");
    expect(result.data?.people?.[0].name).toBe("Sarah");
    expect(result.data?.tasks?.length).toBe(2);

    const t1 = result.data?.tasks.find((t) => t.id === "t1");
    const t2 = result.data?.tasks.find((t) => t.id === "t2");
    expect(t1?.status).toBe("not-started");
    expect(t2?.status).toBe("completed");
    expect(t2?.progress).toBe(1.0);
    expect(t2?.category).toBe("des"); // preserved from master!
  });
});

describe("AI Copilot - plan-differ", () => {
  const basePlan: JanttData = {
    meta: { title: "Base Project" },
    categories: { eng: { label: "Engineering", color: "#3B82F6" } },
    tasks: [
      { id: "t1", label: "Task 1", category: "eng", start: "2026-11-20", end: "2026-11-22", status: "not-started" },
      { id: "t2", label: "Task 2", category: "eng", start: "2026-11-23", end: "2026-11-25", status: "not-started" }
    ]
  };

  it("detects added, modified, and removed tasks correctly", () => {
    const newPlan: JanttData = {
      meta: { title: "Renamed Project" },
      categories: { eng: { label: "Engineering", color: "#3B82F6" } },
      tasks: [
        { id: "t1", label: "Task 1", category: "eng", start: "2026-11-20", end: "2026-11-22", status: "completed", progress: 1.0 },
        { id: "t3", label: "Task 3 (New)", category: "eng", start: "2026-11-26", end: "2026-11-28", status: "not-started" }
      ]
    };

    const diff = computePlanDiff(basePlan, newPlan);
    expect(diff.tasksAdded).toEqual(["Task 3 (New)"]);
    expect(diff.tasksRemoved).toEqual(["Task 2"]);
    expect(diff.tasksModified.length).toBe(1);
    expect(diff.tasksModified[0].id).toBe("t1");
    expect(diff.tasksModified[0].changedFields).toContain("status");
    expect(diff.tasksModified[0].changedFields).toContain("progress");
    expect(diff.metaChanged).toContain("title");
    expect(diff.summary).toContain("Added 1 task");
    expect(diff.summary).toContain("Modified 1 task");
    expect(diff.summary).toContain("Removed 1 task");
  });
});

describe("AI Copilot - system-prompt", () => {
  it("builds a system prompt containing the schema rules and current plan", () => {
    const plan: JanttData = {
      meta: { title: "Test Plan" },
      tasks: [{ id: "t1", label: "Alpha Task", category: "eng", start: "2026-11-20", end: "2026-11-25" }]
    };

    const prompt = buildSystemPrompt(plan);
    expect(prompt).toContain("Jantt AI Copilot");
    expect(prompt).toContain("JANTT JSON SCHEMA BENCHMARK");
    expect(prompt).toContain("Alpha Task");
  });

  it("handles null plan gracefully", () => {
    const prompt = buildSystemPrompt(null);
    expect(prompt).toContain("No active plan loaded.");
  });
});

describe("AI Copilot - provider-registry", () => {
  it("provides all supported provider definitions", () => {
    const providers = getAllProviders();
    const ids = providers.map((p) => p.id);
    expect(ids).toContain("gemini");
    expect(ids).toContain("openai");
    expect(ids).toContain("anthropic");
    expect(ids).toContain("openai-compatible");
  });

  it("returns default models for providers", () => {
    const geminiModels = getModelsForProvider("gemini");
    expect(geminiModels.length).toBeGreaterThan(0);
    expect(geminiModels[0].id).toBe("gemini-2.5-flash");

    const openaiModels = getModelsForProvider("openai");
    expect(openaiModels.some((m) => m.id === "gpt-4o")).toBe(true);
  });

  it("returns valid adapters for every provider", () => {
    for (const p of ["gemini", "openai", "anthropic", "openai-compatible"] as const) {
      const adapter = getProviderAdapter(p);
      expect(adapter).toBeDefined();
      expect(typeof adapter.streamChat).toBe("function");
    }
  });
});

describe("AI Copilot - storage", () => {
  beforeEach(() => {
    clearAllCopilotStorage();
  });

  it("persists active provider", () => {
    expect(getActiveProvider()).toBe("gemini");
    setActiveProvider("openai");
    expect(getActiveProvider()).toBe("openai");
  });

  it("stores and retrieves API keys per provider", () => {
    setApiKey("gemini", "AIzaSyTestKey123");
    setApiKey("openai", "sk-proj-test-key-456");

    expect(getApiKey("gemini")).toBe("AIzaSyTestKey123");
    expect(getApiKey("openai")).toBe("sk-proj-test-key-456");
    expect(getApiKey("anthropic")).toBe("");
  });

  it("persists model selection per provider", () => {
    setModelForProvider("gemini", "gemini-2.5-pro");
    expect(getModelForProvider("gemini", "gemini-2.5-flash")).toBe("gemini-2.5-pro");
  });

  it("persists auto-apply preference (defaults to true for seamless live editing)", () => {
    expect(getAutoApply()).toBe(true);
    setAutoApply(false);
    expect(getAutoApply()).toBe(false);
    setAutoApply(true);
    expect(getAutoApply()).toBe(true);
  });
});
