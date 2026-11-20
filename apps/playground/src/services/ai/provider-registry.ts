import type { ProviderAdapter, ProviderDefinition, ProviderId, ModelDefinition } from "./types";
import { GeminiProviderAdapter } from "./providers/gemini";
import { OpenAiCompatibleAdapter } from "./providers/openai-compatible";
import { AnthropicProviderAdapter } from "./providers/anthropic";

export const PROVIDER_CATALOG: Record<ProviderId, ProviderDefinition> = {
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    description: "Fast, generous free tier & 1M+ token context via Google AI Studio",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    supportsCustomBaseUrl: false,
    models: [
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        contextWindow: 1048576,
        outputLimit: 8192,
        supportsStreaming: true,
        recommended: true
      },
      {
        id: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        contextWindow: 1048576,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "gemini-2.0-flash",
        label: "Gemini 2.0 Flash",
        contextWindow: 1048576,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "gemini-2.0-flash-lite",
        label: "Gemini 2.0 Flash Lite",
        contextWindow: 1048576,
        outputLimit: 8192,
        supportsStreaming: true
      }
    ]
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    description: "Industry-standard GPT-4o and reasoning models via OpenAI Platform",
    defaultBaseUrl: "https://api.openai.com",
    supportsCustomBaseUrl: false,
    models: [
      {
        id: "gpt-4o",
        label: "GPT-4o",
        contextWindow: 128000,
        outputLimit: 16384,
        supportsStreaming: true,
        recommended: true
      },
      {
        id: "gpt-4o-mini",
        label: "GPT-4o Mini",
        contextWindow: 128000,
        outputLimit: 16384,
        supportsStreaming: true
      },
      {
        id: "gpt-4.1",
        label: "GPT-4.1",
        contextWindow: 128000,
        outputLimit: 16384,
        supportsStreaming: true
      },
      {
        id: "o4-mini",
        label: "o4-mini",
        contextWindow: 128000,
        outputLimit: 16384,
        supportsStreaming: true
      }
    ]
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude",
    description: "State-of-the-art reasoning (requires CORS proxy or OpenRouter)",
    defaultBaseUrl: "https://api.anthropic.com",
    supportsCustomBaseUrl: true,
    corsNote: "Anthropic requires a CORS proxy for browser requests, or use OpenRouter",
    models: [
      {
        id: "claude-3-5-sonnet-20241022",
        label: "Claude 3.5 Sonnet",
        contextWindow: 200000,
        outputLimit: 8192,
        supportsStreaming: true,
        recommended: true
      },
      {
        id: "claude-3-5-haiku-20241022",
        label: "Claude 3.5 Haiku",
        contextWindow: 200000,
        outputLimit: 8192,
        supportsStreaming: true
      }
    ]
  },
  "openai-compatible": {
    id: "openai-compatible",
    label: "Custom / Local / OpenRouter",
    description: "Groq, DeepSeek, Ollama, Together, OpenRouter or any custom OpenAI-format URL",
    defaultBaseUrl: "https://api.groq.com/openai",
    supportsCustomBaseUrl: true,
    models: [
      {
        id: "llama-3.3-70b-versatile",
        label: "Groq: Llama 3.3 70B",
        contextWindow: 131072,
        outputLimit: 8192,
        supportsStreaming: true,
        recommended: true
      },
      {
        id: "deepseek-chat",
        label: "DeepSeek: V3 Chat",
        contextWindow: 64000,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "deepseek-reasoner",
        label: "DeepSeek: R1 Reasoner",
        contextWindow: 64000,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "meta-llama/llama-3.3-70b-instruct",
        label: "OpenRouter / Together: Llama 3.3 70B",
        contextWindow: 131072,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "custom",
        label: "Custom Model (enter ID)",
        contextWindow: 128000,
        outputLimit: 8192,
        supportsStreaming: true
      }
    ]
  }
};

const adapters: Record<ProviderId, ProviderAdapter> = {
  gemini: new GeminiProviderAdapter(),
  openai: new OpenAiCompatibleAdapter("openai"),
  anthropic: new AnthropicProviderAdapter(),
  "openai-compatible": new OpenAiCompatibleAdapter("openai-compatible")
};

export function getProviderAdapter(providerId: ProviderId): ProviderAdapter {
  return adapters[providerId] || adapters.gemini;
}

export function getAllProviders(): ProviderDefinition[] {
  return Object.values(PROVIDER_CATALOG);
}

export function getModelsForProvider(providerId: ProviderId): ModelDefinition[] {
  return PROVIDER_CATALOG[providerId]?.models || PROVIDER_CATALOG.gemini.models;
}
