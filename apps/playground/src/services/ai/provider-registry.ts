import type { ProviderAdapter, ProviderDefinition, ProviderId, ModelDefinition } from "./types";
import { GeminiProviderAdapter } from "./providers/gemini";
import { OpenAiCompatibleAdapter } from "./providers/openai-compatible";
import { AnthropicProviderAdapter } from "./providers/anthropic";
import { getCustomModels } from "./storage";

export const PROVIDER_CATALOG: Record<ProviderId, ProviderDefinition> = {
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    description: "Fast, generous free tier and 1M+ token context via Google AI Studio",
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
      },
      {
        id: "gemini-1.5-pro",
        label: "Gemini 1.5 Pro",
        contextWindow: 2097152,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "gemini-1.5-flash",
        label: "Gemini 1.5 Flash",
        contextWindow: 1048576,
        outputLimit: 8192,
        supportsStreaming: true
      }
    ]
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    description: "Industry-standard GPT-4o, GPT-4.1, and reasoning models via OpenAI Platform",
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
      },
      {
        id: "o3-mini",
        label: "o3-mini",
        contextWindow: 200000,
        outputLimit: 100000,
        supportsStreaming: true
      },
      {
        id: "o1",
        label: "o1",
        contextWindow: 200000,
        outputLimit: 100000,
        supportsStreaming: true
      }
    ]
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude",
    description: "State-of-the-art reasoning (requires CORS proxy or OpenRouter for browsers)",
    defaultBaseUrl: "https://api.anthropic.com",
    supportsCustomBaseUrl: true,
    corsNote: "Anthropic restricts direct browser CORS requests. Use a CORS proxy or OpenRouter.",
    models: [
      {
        id: "claude-3-7-sonnet-20250219",
        label: "Claude 3.7 Sonnet",
        contextWindow: 200000,
        outputLimit: 8192,
        supportsStreaming: true,
        recommended: true
      },
      {
        id: "claude-3-5-sonnet-20241022",
        label: "Claude 3.5 Sonnet",
        contextWindow: 200000,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "claude-3-5-haiku-20241022",
        label: "Claude 3.5 Haiku",
        contextWindow: 200000,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "claude-3-opus-20240229",
        label: "Claude 3 Opus",
        contextWindow: 200000,
        outputLimit: 4096,
        supportsStreaming: true
      }
    ]
  },
  groq: {
    id: "groq",
    label: "Groq",
    description: "Ultra-fast LPU inference with generous free rate limits",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    supportsCustomBaseUrl: false,
    models: [
      {
        id: "llama-3.3-70b-versatile",
        label: "Llama 3.3 70B Versatile",
        contextWindow: 131072,
        outputLimit: 8192,
        supportsStreaming: true,
        recommended: true
      },
      {
        id: "deepseek-r1-distill-llama-70b",
        label: "DeepSeek R1 Distill 70B",
        contextWindow: 131072,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "llama-3.1-8b-instant",
        label: "Llama 3.1 8B Instant",
        contextWindow: 131072,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "mixtral-8x7b-32768",
        label: "Mixtral 8x7B",
        contextWindow: 32768,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "gemma2-9b-it",
        label: "Gemma 2 9B",
        contextWindow: 8192,
        outputLimit: 4096,
        supportsStreaming: true
      }
    ]
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    description: "Frontier reasoning and code capability at industry-lowest pricing",
    defaultBaseUrl: "https://api.deepseek.com",
    supportsCustomBaseUrl: false,
    models: [
      {
        id: "deepseek-chat",
        label: "DeepSeek V3 (Chat)",
        contextWindow: 64000,
        outputLimit: 8192,
        supportsStreaming: true,
        recommended: true
      },
      {
        id: "deepseek-reasoner",
        label: "DeepSeek R1 (Reasoner)",
        contextWindow: 64000,
        outputLimit: 8192,
        supportsStreaming: true
      }
    ]
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    description: "Unified aggregator for 200+ models with native browser CORS support",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    supportsCustomBaseUrl: false,
    models: [
      {
        id: "anthropic/claude-3.7-sonnet",
        label: "Claude 3.7 Sonnet (OpenRouter)",
        contextWindow: 200000,
        outputLimit: 8192,
        supportsStreaming: true,
        recommended: true
      },
      {
        id: "google/gemini-2.5-flash",
        label: "Gemini 2.5 Flash (OpenRouter)",
        contextWindow: 1000000,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "deepseek/deepseek-r1",
        label: "DeepSeek R1 (OpenRouter)",
        contextWindow: 128000,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "meta-llama/llama-3.3-70b-instruct",
        label: "Llama 3.3 70B Instruct",
        contextWindow: 131072,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "qwen/qwen-2.5-coder-32b-instruct",
        label: "Qwen 2.5 Coder 32B Instruct",
        contextWindow: 32768,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "mistralai/mistral-large-2411",
        label: "Mistral Large 2411",
        contextWindow: 128000,
        outputLimit: 8192,
        supportsStreaming: true
      }
    ]
  },
  mistral: {
    id: "mistral",
    label: "Mistral AI",
    description: "Open and commercial European frontier models for code and reasoning",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    supportsCustomBaseUrl: false,
    models: [
      {
        id: "mistral-large-latest",
        label: "Mistral Large Latest",
        contextWindow: 128000,
        outputLimit: 8192,
        supportsStreaming: true,
        recommended: true
      },
      {
        id: "codestral-latest",
        label: "Codestral Latest",
        contextWindow: 256000,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "mistral-small-latest",
        label: "Mistral Small Latest",
        contextWindow: 128000,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "pixtral-12b-2409",
        label: "Pixtral 12B",
        contextWindow: 128000,
        outputLimit: 8192,
        supportsStreaming: true
      }
    ]
  },
  xai: {
    id: "xai",
    label: "xAI (Grok)",
    description: "Frontier reasoning and real-time knowledge models by xAI",
    defaultBaseUrl: "https://api.x.ai/v1",
    supportsCustomBaseUrl: false,
    models: [
      {
        id: "grok-2-latest",
        label: "Grok 2 Latest",
        contextWindow: 131072,
        outputLimit: 8192,
        supportsStreaming: true,
        recommended: true
      },
      {
        id: "grok-2-vision-latest",
        label: "Grok 2 Vision Latest",
        contextWindow: 32768,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "grok-beta",
        label: "Grok Beta",
        contextWindow: 131072,
        outputLimit: 8192,
        supportsStreaming: true
      }
    ]
  },
  ollama: {
    id: "ollama",
    label: "Local Ollama",
    description: "Run private, offline models directly on your machine without API keys",
    defaultBaseUrl: "http://localhost:11434/v1",
    supportsCustomBaseUrl: true,
    models: [
      {
        id: "llama3.3",
        label: "Llama 3.3",
        contextWindow: 131072,
        outputLimit: 8192,
        supportsStreaming: true,
        recommended: true
      },
      {
        id: "qwen2.5-coder",
        label: "Qwen 2.5 Coder",
        contextWindow: 32768,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "deepseek-r1",
        label: "DeepSeek R1",
        contextWindow: 64000,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "mistral",
        label: "Mistral",
        contextWindow: 32768,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "phi4",
        label: "Phi-4",
        contextWindow: 16384,
        outputLimit: 4096,
        supportsStreaming: true
      }
    ]
  },
  "openai-compatible": {
    id: "openai-compatible",
    label: "Custom / Self-Hosted",
    description: "Any OpenAI-compatible gateway: vLLM, LM Studio, Together, or self-hosted endpoint",
    defaultBaseUrl: "http://localhost:8000/v1",
    supportsCustomBaseUrl: true,
    models: [
      {
        id: "custom",
        label: "Custom Model",
        contextWindow: 128000,
        outputLimit: 8192,
        supportsStreaming: true,
        recommended: true
      },
      {
        id: "llama-3.3-70b-versatile",
        label: "Llama 3.3 70B",
        contextWindow: 131072,
        outputLimit: 8192,
        supportsStreaming: true
      },
      {
        id: "qwen2.5-coder-32b",
        label: "Qwen 2.5 Coder 32B",
        contextWindow: 32768,
        outputLimit: 8192,
        supportsStreaming: true
      }
    ]
  }
};

const adapters: Record<ProviderId, ProviderAdapter> = {
  gemini: new GeminiProviderAdapter(),
  openai: new OpenAiCompatibleAdapter("openai", "https://api.openai.com/v1"),
  anthropic: new AnthropicProviderAdapter(),
  groq: new OpenAiCompatibleAdapter("groq", "https://api.groq.com/openai/v1"),
  deepseek: new OpenAiCompatibleAdapter("deepseek", "https://api.deepseek.com"),
  openrouter: new OpenAiCompatibleAdapter("openrouter", "https://openrouter.ai/api/v1"),
  mistral: new OpenAiCompatibleAdapter("mistral", "https://api.mistral.ai/v1"),
  xai: new OpenAiCompatibleAdapter("xai", "https://api.x.ai/v1"),
  ollama: new OpenAiCompatibleAdapter("ollama", "http://localhost:11434/v1"),
  "openai-compatible": new OpenAiCompatibleAdapter("openai-compatible")
};

export function getProviderAdapter(providerId: ProviderId): ProviderAdapter {
  return adapters[providerId] || adapters.gemini;
}

export function getAllProviders(): ProviderDefinition[] {
  return Object.values(PROVIDER_CATALOG);
}

export function getModelsForProvider(providerId: ProviderId): ModelDefinition[] {
  const baseModels = PROVIDER_CATALOG[providerId]?.models || PROVIDER_CATALOG.gemini.models;
  const customModelIds = getCustomModels(providerId);

  if (customModelIds.length === 0) {
    return baseModels;
  }

  const customDefs: ModelDefinition[] = customModelIds
    .filter((id) => !baseModels.some((m) => m.id === id))
    .map((id) => ({
      id,
      label: `${id} (Custom)`,
      contextWindow: 128000,
      outputLimit: 8192,
      supportsStreaming: true
    }));

  return [...baseModels, ...customDefs];
}
