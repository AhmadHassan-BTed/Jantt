import { describe, it, expect, beforeEach, beforeAll, vi, afterEach } from "vitest";
import type { JanttData } from "@jantt/core";
import { extractJsonFromResponse } from "./json-extractor";
import { computePlanDiff } from "./plan-differ";
import { buildSystemPrompt } from "./system-prompt";
import { getProviderAdapter, getModelsForProvider, getAllProviders } from "./provider-registry";
import {
  parseGeminiModelsPayload,
  parseOpenAiStyleModelsPayload,
  parseOllamaTagsPayload,
  fetchLiveModelsForAccount,
  clearCachedDiscoveredModels
} from "./model-discovery";
import {
  getActiveProvider,
  setActiveProvider,
  getApiKey,
  setApiKey,
  getModelForProvider,
  setModelForProvider,
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
  it("preserves omitted task data and literal punctuation when a model echoes a condensed plan", () => {
    const task = { id: "a", category: "work", start: "2026-01-01", end: "2026-01-10", estimatedCost: 350 };
    const source = { tasks: [task, { ...task, id: "b" }], meta: { revision: 7 },
      customReport: { owner: "Alex" } };
    const updated = extractJsonFromResponse(JSON.stringify({
      meta: { revision: 1, tombstones: { b: {} } },
      tasks: [{ id: "a", notes: "See /* draft */ and literal ,} // annotations" }, { ...task, id: "c" }]
    }), source).data!;
    expect(updated.tasks.map(t => t.id)).toEqual(["a", "b", "c"]);
    expect(updated.tasks[0]).toMatchObject({ ...task, notes: "See /* draft */ and literal ,} // annotations" });
    expect(updated.customReport).toEqual(source.customReport);
    expect(updated.meta).toEqual(source.meta);
  });

  it("removes only explicitly deleted tasks and records canonical tombstones and dependency cleanup", () => {
    const task = { id: "a", category: "work", start: "2026-01-01", end: "2026-01-10" };
    const source = { tasks: [task, { ...task, id: "b", dependsOn: "a" }, { ...task, id: "c", _deleted: true }] };
    const updated = extractJsonFromResponse(JSON.stringify({ tasks: [{ id: "a", _deleted: true }] }), source).data!;
    expect(updated.tasks.map(t => t.id)).toEqual(["b", "c"]);
    expect(updated.tasks[0].dependsOn).toBeNull();
    expect(updated.meta?.tombstones?.a.entityType).toBe("task");
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
    expect(ids).toContain("opendesign-go");
    expect(ids).toContain("openai-compatible");
  });

  it("returns default models for providers", () => {
    const geminiModels = getModelsForProvider("gemini");
    expect(geminiModels.length).toBeGreaterThan(0);
    expect(geminiModels[0].id).toBe("gemini-2.5-flash");

    const openaiModels = getModelsForProvider("openai");
    expect(openaiModels.some((m) => m.id === "gpt-4o")).toBe(true);

    const opendesignGoModels = getModelsForProvider("opendesign-go");
    expect(opendesignGoModels.some((m) => m.id === "deepseek-v4.1-flash")).toBe(true);
  });

  it("returns valid adapters for every provider", () => {
    for (const p of ["gemini", "openai", "anthropic", "opendesign-go", "openai-compatible"] as const) {
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
});

describe("AI Copilot - dynamic model-discovery", () => {
  beforeEach(() => {
    clearAllCopilotStorage();
    clearCachedDiscoveredModels();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("filters and ranks Gemini generateContent models while stripping models/ prefix", () => {
    const models = parseGeminiModelsPayload({
      models: [
        { name: "models/text-embedding-004", displayName: "Embedding", supportedGenerationMethods: ["embedContent"] },
        { name: "models/gemini-1.5-pro", displayName: "Gemini 1.5 Pro", inputTokenLimit: 2097152, outputTokenLimit: 8192, supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", inputTokenLimit: 1048576, outputTokenLimit: 65536, supportedGenerationMethods: ["generateContent"] },
        { name: "models/imagen-3.0-generate-002", displayName: "Imagen 3", supportedGenerationMethods: ["generateContent"] }
      ]
    });
    expect(models.map((m) => m.id)).toEqual(["gemini-2.5-flash", "gemini-1.5-pro"]);
    expect(models[0].outputLimit).toBe(65536);
  });

  it("filters non-chat OpenAI models and sorts newest first", () => {
    const models = parseOpenAiStyleModelsPayload("openai", {
      data: [
        { id: "whisper-1", created: 1700000000 },
        { id: "text-embedding-3-large", created: 1710000000 },
        { id: "gpt-4o", created: 1715000000 },
        { id: "gpt-5", created: 1755000000 },
        { id: "o4-mini", created: 1745000000 }
      ]
    });
    expect(models.map((m) => m.id)).toEqual(["gpt-5", "o4-mini", "gpt-4o"]);
  });

  it("parses Ollama /api/tags payloads with parameter sizes", () => {
    const models = parseOllamaTagsPayload({
      models: [
        { name: "qwen3:14b", details: { parameter_size: "14B" } },
        { name: "llama3.3:latest" }
      ]
    });
    expect(models.map((m) => m.id)).toEqual(["qwen3:14b", "llama3.3:latest"]);
    expect(models[0].label).toBe("qwen3:14b (14B)");
  });

  it("fetches live models, caches them, and falls back gracefully on API error", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        data: [
          { id: "deepseek-chat" },
          { id: "deepseek-reasoner" },
          { id: "deepseek-v4-preview" }
        ]
      })
    } as Response);

    const account = {
      id: "acc_test_ds",
      providerId: "deepseek" as const,
      label: "DeepSeek Test",
      apiKey: "sk-test",
      createdAt: Date.now()
    };

    const live = await fetchLiveModelsForAccount(account, { force: true });
    expect(live.source).toBe("live");
    expect(live.models.some((m) => m.id === "deepseek-v4-preview")).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Subsequent non-forced call reads from fresh cache without hitting network
    const cached = await fetchLiveModelsForAccount(account, { force: false });
    expect(cached.source).toBe("cache");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Forced fetch failure on uncached account gracefully returns fallback preset models
    clearCachedDiscoveredModels(account.id);
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ error: { message: "Invalid key" } })
    } as Response);
    const fallback = await fetchLiveModelsForAccount(account, { force: true });
    expect(fallback.source).toBe("fallback");
    expect(fallback.error).toContain("Invalid key");
    expect(fallback.models.length).toBeGreaterThan(0);
  });

  it("discovers live OpenDesign Go models from the default OpenAI-compatible endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        data: [
          { id: "deepseek-v4.1-flash" },
          { id: "glm-5.3-flash" }
        ]
      })
    } as Response);

    const account = {
      id: "acc_test_od_go",
      providerId: "opendesign-go" as const,
      label: "OpenDesign Go Test",
      apiKey: "sk-od-test",
      createdAt: Date.now()
    };

    const live = await fetchLiveModelsForAccount(account, { force: true });
    expect(live.source).toBe("live");
    expect(live.models.map((m) => m.id)).toEqual(["deepseek-v4.1-flash", "glm-5.3-flash"]);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://amr-link.open-design.ai/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer sk-od-test" }
      })
    );
  });
});
