import type { JanttData } from "@jantt/core";

export type ProviderId =
  | "gemini"
  | "openai"
  | "anthropic"
  | "groq"
  | "deepseek"
  | "openrouter"
  | "mistral"
  | "xai"
  | "ollama"
  | "openai-compatible";

export interface ModelDefinition {
  id: string;
  label: string;
  contextWindow: number;
  outputLimit: number;
  supportsStreaming: boolean;
  recommended?: boolean;
}

export interface ProviderDefinition {
  id: ProviderId;
  label: string;
  description: string;
  defaultBaseUrl: string;
  supportsCustomBaseUrl: boolean;
  corsNote?: string;
  models: ModelDefinition[];
}

export interface PlanDiff {
  tasksAdded: string[];
  tasksRemoved: string[];
  tasksModified: Array<{
    id: string;
    label: string;
    changedFields: string[];
  }>;
  metaChanged: string[];
  categoriesChanged: boolean;
  peopleChanged: boolean;
  notesChanged: boolean;
  summary: string;
}

export interface PendingPlanChange {
  plan: JanttData;
  diff: PlanDiff;
  messageId: string;
}

export interface CopilotMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  diff?: PlanDiff | null;
  applied?: boolean;
  extractedPlan?: JanttData | null;
  previousPlan?: JanttData | null;
  validationErrors?: string[];
  isStreaming?: boolean;
  error?: string;
}

export interface ProviderError {
  code: "AUTH" | "RATE_LIMIT" | "NETWORK" | "CORS" | "CONTEXT_TOO_LONG" | "UNKNOWN";
  message: string;
  retryAfterMs?: number;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: ProviderError) => void;
}

export interface StreamChatOptions {
  baseUrl?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface ProviderAdapter {
  readonly providerId: ProviderId;
  streamChat(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    model: string,
    apiKey: string,
    callbacks: StreamCallbacks,
    options?: StreamChatOptions
  ): AbortController;
}

export interface CopilotConfig {
  providerId: ProviderId;
  apiKey: string;
  modelId: string;
  customBaseUrl?: string;
  proxyUrl?: string;
  temperature: number;
  autoApply: boolean;
}
