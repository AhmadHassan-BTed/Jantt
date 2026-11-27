import type { ModelDefinition, ProviderAccount, ProviderId } from "./types";
import { tGlobal } from "../../i18n";
import { PROVIDER_CATALOG, getModelsForProvider } from "./provider-registry";
import { getCustomModels } from "./storage";

const DISCOVERY_CACHE_PREFIX = "jantt_copilot_discovered_models_";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const FETCH_TIMEOUT_MS = 12_000;

export interface DiscoveredModelsCacheEntry {
  models: ModelDefinition[];
  fetchedAt: number;
}

export interface ModelDiscoveryResult {
  latencyMs?: number;
  models: ModelDefinition[];
  source: "live" | "cache" | "fallback";
  fetchedAt: number | null;
  error?: string;
}

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== "undefined") {
    return localStorage;
  }
  return null;
}

function cacheKeyForAccount(accountId: string): string {
  return `${DISCOVERY_CACHE_PREFIX}${accountId}`;
}

export function getCachedDiscoveredModels(accountId: string): DiscoveredModelsCacheEntry | null {
  if (!accountId) return null;
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(cacheKeyForAccount(accountId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DiscoveredModelsCacheEntry>;
    if (Array.isArray(parsed.models) && parsed.models.length > 0 && typeof parsed.fetchedAt === "number") {
      return { models: parsed.models, fetchedAt: parsed.fetchedAt };
    }
  } catch {
    // ignore corrupt cache
  }
  return null;
}

export function setCachedDiscoveredModels(accountId: string, models: ModelDefinition[], fetchedAt = Date.now()): void {
  if (!accountId || models.length === 0) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    const payload: DiscoveredModelsCacheEntry = { models, fetchedAt };
    storage.setItem(cacheKeyForAccount(accountId), JSON.stringify(payload));
  } catch {
    // ignore quota errors
  }
}

export function clearCachedDiscoveredModels(accountId?: string): void {
  const storage = getStorage();
  if (!storage) return;
  if (accountId) {
    storage.removeItem(cacheKeyForAccount(accountId));
    return;
  }
  const toRemove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(DISCOVERY_CACHE_PREFIX)) {
      toRemove.push(key);
    }
  }
  toRemove.forEach((k) => storage.removeItem(k));
}

export function isCacheFresh(entry: DiscoveredModelsCacheEntry | null, now = Date.now()): boolean {
  return Boolean(entry && now - entry.fetchedAt < CACHE_TTL_MS);
}

/** Merges user-added custom model IDs onto a discovered or fallback model list without duplicates. */
export function mergeCustomModels(providerId: ProviderId, baseModels: ModelDefinition[]): ModelDefinition[] {
  const customIds = getCustomModels(providerId);
  if (customIds.length === 0) return baseModels;
  const seen = new Set(baseModels.map((m) => m.id));
  const extras: ModelDefinition[] = [];
  for (const id of customIds) {
    if (!seen.has(id)) {
      seen.add(id);
      extras.push({
        id,
        label: `${id} (Custom)`,
        contextWindow: 128000,
        outputLimit: 8192,
        supportsStreaming: true
      });
    }
  }
  return extras.length > 0 ? [...baseModels, ...extras] : baseModels;
}

/** Resolves the best available models synchronously for an account (live/cache -> catalog fallback + custom). */
export function getEffectiveModelsForAccount(
  account: ProviderAccount,
  liveMap?: Record<string, ModelDiscoveryResult>
): ModelDefinition[] {
  const fromLive = liveMap?.[account.id];
  if (fromLive && fromLive.models.length > 0) {
    return mergeCustomModels(account.providerId, fromLive.models);
  }
  const cached = getCachedDiscoveredModels(account.id);
  if (cached && cached.models.length > 0) {
    return mergeCustomModels(account.providerId, cached.models);
  }
  return getModelsForProvider(account.providerId);
}

/* -------------------------------------------------------------------------- */
/* Provider-specific payload parsers (exported for unit tests)                */
/* -------------------------------------------------------------------------- */

const OPENAI_EXCLUDED_RE =
  /(?:whisper|tts|dall-e|embedding|moderation|babbage|davinci|audio|realtime|transcribe|image|sora|omni-moderation|search-api|instruct)/i;
const OPENAI_INCLUDED_RE = /^(?:gpt-|o1|o3|o4|chatgpt-)/i;

const GROQ_EXCLUDED_RE = /(?:whisper|tts|playai|orpheus|prompt-guard|safeguard|guard)/i;
const MISTRAL_EXCLUDED_RE = /(?:embed|moderation|ocr)/i;
const GEMINI_EXCLUDED_RE = /(?:embedding|aqa|imagen|veo|bisociate|tts|native-audio|robotics)/i;

function dedupeModels(models: ModelDefinition[]): ModelDefinition[] {
  const seen = new Set<string>();
  const out: ModelDefinition[] = [];
  for (const m of models) {
    const id = m.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ ...m, id, label: (m.label || id).trim() });
  }
  return out;
}

function geminiRank(id: string): number {
  const lower = id.toLowerCase();
  if (lower.startsWith("gemini-2.5-flash") && !lower.includes("lite")) return 10;
  if (lower.startsWith("gemini-2.5-pro")) return 20;
  if (lower.startsWith("gemini-2.5")) return 30;
  if (lower.startsWith("gemini-2.0-flash")) return 40;
  if (lower.startsWith("gemini-2.0")) return 50;
  if (lower.startsWith("gemini-3")) return 5;
  if (lower.startsWith("gemini-1.5")) return 70;
  if (lower.startsWith("gemini-")) return 80;
  return 100;
}

export function parseGeminiModelsPayload(payload: unknown): ModelDefinition[] {
  const rawList = (payload as { models?: unknown[] })?.models;
  if (!Array.isArray(rawList)) return [];

  const parsed: ModelDefinition[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const methods = Array.isArray(rec.supportedGenerationMethods) ? rec.supportedGenerationMethods : [];
    if (methods.length > 0 && !methods.includes("generateContent")) continue;

    const rawName = typeof rec.name === "string" ? rec.name : "";
    const id = rawName.replace(/^models\//, "").trim();
    if (!id || GEMINI_EXCLUDED_RE.test(id)) continue;

    const displayName = typeof rec.displayName === "string" && rec.displayName.trim() ? rec.displayName.trim() : id;
    const contextWindow = typeof rec.inputTokenLimit === "number" && rec.inputTokenLimit > 0 ? rec.inputTokenLimit : 1048576;
    const outputLimit = typeof rec.outputTokenLimit === "number" && rec.outputTokenLimit > 0 ? rec.outputTokenLimit : 8192;

    parsed.push({
      id,
      label: displayName,
      contextWindow,
      outputLimit,
      supportsStreaming: true
    });
  }

  return dedupeModels(parsed).sort((a, b) => {
    const diff = geminiRank(a.id) - geminiRank(b.id);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });
}

export function parseOpenAiStyleModelsPayload(providerId: ProviderId, payload: unknown): ModelDefinition[] {
  const obj = payload as { data?: unknown[]; models?: unknown[] };
  const rawList = Array.isArray(obj?.data) ? obj.data : Array.isArray(obj?.models) ? obj.models : [];
  if (rawList.length === 0) return [];

  const catalogById = new Map((PROVIDER_CATALOG[providerId]?.models || []).map((m) => [m.id, m]));
  const items: Array<{ def: ModelDefinition; created: number }> = [];

  for (const entry of rawList) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const id =
      typeof rec.id === "string"
        ? rec.id.trim()
        : typeof rec.name === "string"
        ? rec.name.trim()
        : typeof rec.model === "string"
        ? rec.model.trim()
        : "";
    if (!id) continue;

    if (providerId === "openai") {
      if (!OPENAI_INCLUDED_RE.test(id) || OPENAI_EXCLUDED_RE.test(id)) continue;
    } else if (providerId === "groq") {
      if (rec.active === false || GROQ_EXCLUDED_RE.test(id)) continue;
    } else if (providerId === "mistral") {
      const caps = rec.capabilities as Record<string, unknown> | undefined;
      if (caps && caps.completion_chat === false) continue;
      if (MISTRAL_EXCLUDED_RE.test(id)) continue;
    } else if (providerId === "xai") {
      if (/image/i.test(id)) continue;
    }

    const preset = catalogById.get(id);
    const label =
      (typeof rec.display_name === "string" && rec.display_name.trim()) ||
      (typeof rec.name === "string" && rec.name.trim() && rec.name.trim() !== id ? rec.name.trim() : "") ||
      preset?.label ||
      id;

    const topProvider = rec.top_provider as Record<string, unknown> | undefined;
    const contextWindow =
      (typeof rec.context_length === "number" && rec.context_length > 0 && rec.context_length) ||
      (typeof rec.context_window === "number" && rec.context_window > 0 && rec.context_window) ||
      (typeof rec.max_context_length === "number" && rec.max_context_length > 0 && rec.max_context_length) ||
      preset?.contextWindow ||
      128000;

    const outputLimit =
      (typeof topProvider?.max_completion_tokens === "number" && topProvider.max_completion_tokens > 0 && topProvider.max_completion_tokens) ||
      preset?.outputLimit ||
      8192;

    const created =
      typeof rec.created === "number"
        ? rec.created
        : typeof rec.created_at === "string"
        ? Date.parse(rec.created_at) || 0
        : 0;

    items.push({
      created,
      def: {
        id,
        label,
        contextWindow,
        outputLimit,
        supportsStreaming: true,
        recommended: preset?.recommended
      }
    });
  }

  // Sort: OpenRouter keeps API popularity/order; others sort newest-first when timestamps exist
  if (providerId === "openai" || providerId === "anthropic" || providerId === "groq" || providerId === "xai") {
    items.sort((a, b) => b.created - a.created || a.def.id.localeCompare(b.def.id));
  }

  return dedupeModels(items.map((i) => i.def));
}

export function parseOllamaTagsPayload(payload: unknown): ModelDefinition[] {
  const rawList = (payload as { models?: unknown[] })?.models;
  if (!Array.isArray(rawList)) return [];

  const parsed: ModelDefinition[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = (typeof rec.name === "string" ? rec.name : typeof rec.model === "string" ? rec.model : "").trim();
    if (!id) continue;
    const details = rec.details as Record<string, unknown> | undefined;
    const paramSize = typeof details?.parameter_size === "string" ? details.parameter_size.trim() : "";
    parsed.push({
      id,
      label: paramSize ? `${id} (${paramSize})` : id,
      contextWindow: 131072,
      outputLimit: 8192,
      supportsStreaming: true
    });
  }
  return dedupeModels(parsed);
}

/* -------------------------------------------------------------------------- */
/* Endpoint resolution & live fetch                                           */
/* -------------------------------------------------------------------------- */

function normalizeModelsEndpoint(rawBaseUrl: string): string {
  const clean = rawBaseUrl.trim().replace(/\/+$/, "");
  if (clean.endsWith("/models")) return clean;
  if (clean.endsWith("/chat/completions")) {
    return `${clean.slice(0, -"/chat/completions".length)}/models`;
  }
  if (clean.endsWith("/v1")) return `${clean}/models`;
  return `${clean}/v1/models`;
}

function resolveDefaultModelsUrl(providerId: ProviderId, customBaseUrl?: string, proxyUrl?: string): string {
  if (providerId === "anthropic") {
    const base = (proxyUrl || customBaseUrl || "https://api.anthropic.com").trim().replace(/\/+$/, "");
    if (base.endsWith("/v1/messages")) return `${base.slice(0, -"/v1/messages".length)}/v1/models`;
    if (base.endsWith("/v1")) return `${base}/models`;
    return `${base}/v1/models`;
  }
  if (providerId === "deepseek") {
    const base = (customBaseUrl || "https://api.deepseek.com").trim().replace(/\/+$/, "");
    return base.endsWith("/models") ? base : `${base}/models`;
  }
  const catalogBase = PROVIDER_CATALOG[providerId]?.defaultBaseUrl || "";
  const chosen = (customBaseUrl || catalogBase).trim();
  if (!chosen) return "";
  return normalizeModelsEndpoint(chosen);
}

async function fetchJsonWithTimeout(
  url: string,
  headers: Record<string, string>,
  externalSignal?: AbortSignal
): Promise<{ ok: boolean; status: number; statusText: string; data: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { ok: response.ok, status: response.status, statusText: response.statusText, data };
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

export async function fetchLiveModelsForAccount(
  account: ProviderAccount,
  options: { force?: boolean; signal?: AbortSignal } = {}
): Promise<ModelDiscoveryResult> {
  const cached = getCachedDiscoveredModels(account.id);
  if (!options.force && isCacheFresh(cached) && cached) {
    return {
      models: mergeCustomModels(account.providerId, cached.models),
      source: "cache",
      fetchedAt: cached.fetchedAt
    };
  }

  const fallbackResult = (error?: string): ModelDiscoveryResult => {
    if (cached && cached.models.length > 0) {
      return {
        models: mergeCustomModels(account.providerId, cached.models),
        source: "cache",
        fetchedAt: cached.fetchedAt,
        error
      };
    }
    return {
      models: getModelsForProvider(account.providerId),
      source: "fallback",
      fetchedAt: null,
      error
    };
  };

  const cleanKey = (account.apiKey || "").trim();
  const providerId = account.providerId;

  try {
    if (providerId === "gemini") {
      if (!cleanKey) return fallbackResult("API key required to fetch Gemini models.");
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}&pageSize=100`;
      const res = await fetchJsonWithTimeout(url, {}, options.signal);
      if (!res.ok) {
        const msg = (res.data as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`;
        return fallbackResult(`Could not load Gemini models (${msg}).`);
      }
      const models = parseGeminiModelsPayload(res.data);
      if (models.length === 0) return fallbackResult(tGlobal("services.ai.discovery.geminiEmpty"));
      const now = Date.now();
      setCachedDiscoveredModels(account.id, models, now);
      return { models: mergeCustomModels(providerId, models), source: "live", fetchedAt: now };
    }

    if (providerId === "ollama") {
      const baseRaw = (account.customBaseUrl || "http://localhost:11434/v1").trim().replace(/\/+$/, "");
      const origin = baseRaw.replace(/\/v1(?:\/.*)?$/, "");
      const headers: Record<string, string> = cleanKey ? { Authorization: `Bearer ${cleanKey}` } : {};

      // Try native Ollama /api/tags first, then OpenAI-compatible /v1/models
      try {
        const tagsRes = await fetchJsonWithTimeout(`${origin}/api/tags`, headers, options.signal);
        if (tagsRes.ok) {
          const models = parseOllamaTagsPayload(tagsRes.data);
          if (models.length > 0) {
            const now = Date.now();
            setCachedDiscoveredModels(account.id, models, now);
            return { models: mergeCustomModels(providerId, models), source: "live", fetchedAt: now };
          }
        }
      } catch {
        // fall through to /v1/models
      }

      const compatUrl = normalizeModelsEndpoint(baseRaw);
      const compatRes = await fetchJsonWithTimeout(compatUrl, headers, options.signal);
      if (!compatRes.ok) {
        return fallbackResult(`Ollama not reachable at ${origin} (HTTP ${compatRes.status}).`);
      }
      const models = parseOpenAiStyleModelsPayload("ollama", compatRes.data);
      if (models.length === 0) return fallbackResult(tGlobal("services.ai.discovery.ollamaEmpty"));
      const now = Date.now();
      setCachedDiscoveredModels(account.id, models, now);
      return { models: mergeCustomModels(providerId, models), source: "live", fetchedAt: now };
    }

    if (providerId === "anthropic") {
      if (!cleanKey) return fallbackResult("API key required to fetch Anthropic models.");
      const url = resolveDefaultModelsUrl("anthropic", account.customBaseUrl, account.proxyUrl);
      const res = await fetchJsonWithTimeout(
        url,
        {
          "x-api-key": cleanKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        options.signal
      );
      if (!res.ok) {
        const msg = (res.data as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`;
        return fallbackResult(`Anthropic models unavailable (${msg}).`);
      }
      const models = parseOpenAiStyleModelsPayload("anthropic", res.data);
      if (models.length === 0) return fallbackResult(tGlobal("services.ai.discovery.anthropicEmpty"));
      const now = Date.now();
      setCachedDiscoveredModels(account.id, models, now);
      return { models: mergeCustomModels(providerId, models), source: "live", fetchedAt: now };
    }

    // OpenAI, Groq, DeepSeek, OpenRouter, Mistral, xAI, and custom OpenAI-compatible gateways
    const url = resolveDefaultModelsUrl(providerId, account.customBaseUrl, account.proxyUrl);
    if (!url) return fallbackResult(tGlobal("services.ai.discovery.baseUrlRequired"));

    const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
    if (!cleanKey && providerId !== "openrouter" && !isLocal) {
      return fallbackResult("API key required to discover models.");
    }

    const headers: Record<string, string> = {};
    if (cleanKey) headers.Authorization = `Bearer ${cleanKey}`;
    if (providerId === "openrouter") {
      headers["HTTP-Referer"] = typeof window !== "undefined" ? window.location.origin : "https://jantt.dev";
      headers["X-Title"] = "Jantt AI Copilot";
    }

    const res = await fetchJsonWithTimeout(url, headers, options.signal);
    if (!res.ok) {
      const msg = (res.data as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`;
      return fallbackResult(`Failed to fetch models (${msg}).`);
    }

    const models = parseOpenAiStyleModelsPayload(providerId, res.data);
    if (models.length === 0) return fallbackResult("Endpoint returned no compatible chat models.");
    const now = Date.now();
    setCachedDiscoveredModels(account.id, models, now);
    return { models: mergeCustomModels(providerId, models), source: "live", fetchedAt: now };
  } catch (err: unknown) {
    if (options.signal?.aborted) {
      return fallbackResult();
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
      return fallbackResult(
        providerId === "anthropic"
          ? "Browser CORS blocked direct fetch; using built-in list (set CORS proxy to fetch live)."
          : "Network or CORS error while fetching live models; using built-in list."
      );
    }
    return fallbackResult(msg || tGlobal("services.ai.discovery.loadFailed"));
  }
}
