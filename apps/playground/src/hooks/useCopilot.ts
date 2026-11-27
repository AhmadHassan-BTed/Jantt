import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { validate, type JanttData } from "@jantt/core";
import type {
  CopilotMessage,
  CopilotConfig,
  PendingPlanChange,
  ModelDefinition,
  ProviderDefinition,
  ProviderAccount
} from "../services/ai/types";
import {
  getActiveProvider,
  setActiveProvider,
  getApiKey,
  setApiKey,
  getModelForProvider,
  setModelForProvider,
  getCustomBaseUrl,
  setCustomBaseUrl,
  getProxyUrl,
  setProxyUrl,
  getTemperature,
  setTemperature,
  getProviderAccounts,
  addProviderAccount,
  updateProviderAccount,
  deleteProviderAccount,
  getActiveAccountId,
  setActiveAccountId,
  isAccountConfigured
} from "../services/ai/storage";
import {
  getProviderAdapter,
  getModelsForProvider,
  getAllProviders,
  PROVIDER_CATALOG
} from "../services/ai/provider-registry";
import {
  fetchLiveModelsForAccount,
  getCachedDiscoveredModels,
  getEffectiveModelsForAccount,
  mergeCustomModels,
  type ModelDiscoveryResult
} from "../services/ai/model-discovery";
import { buildSystemPrompt } from "../services/ai/system-prompt";
import { extractJsonFromResponse } from "../services/ai/json-extractor";
import { diffPlans, applyHistoryEntry } from "./useUndoRedo";
import { getPeerId } from "../utils";
import { computePlanDiff } from "../services/ai/plan-differ";
import { useI18n } from "../i18n/I18nProvider";
import { tGlobal } from "../i18n";

export interface UseCopilotOptions {
  parsedData: JanttData | null;
  commitPlan: (data: JanttData) => JanttData | null;
  showToast: (message: string, isError?: boolean) => void;
  isReadOnly: boolean;
  projectId: string;
  activeView: string;
  inspectedTaskId: string | null;
}

export interface UseCopilotReturn {
  isReadOnly: boolean;
  isProposalStale: boolean;
  messages: CopilotMessage[];
  isStreaming: boolean;
  config: CopilotConfig;
  isConfigured: boolean;
  pendingDiff: PendingPlanChange | null;
  sendMessage: (text: string) => void;
  stopGeneration: () => void;
  acceptChange: () => void;
  rejectChange: () => void;
  revertChange: (messageId: string) => void;
  clearHistory: () => void;
  updateConfig: (partial: Partial<CopilotConfig>) => void;
  availableProviders: ProviderDefinition[];
  availableModels: ModelDefinition[];
  currentModelLabel: string;
  accounts: ProviderAccount[];
  configuredAccounts: ProviderAccount[];
  discoveredModelsByAccount: Record<string, ModelDiscoveryResult>;
  loadingModelsByAccount: Record<string, boolean>;
  refreshModelsForAccount: (accountId: string, force?: boolean) => Promise<ModelDiscoveryResult | null>;
  refreshAllAccountModels: (force?: boolean) => Promise<void>;
  addAccount: (data: Omit<ProviderAccount, "id" | "createdAt">) => ProviderAccount;
  updateAccount: (id: string, partial: Partial<ProviderAccount>) => void;
  deleteAccount: (id: string) => void;
  selectAccountAndModel: (accountId: string, modelId: string) => void;
}

export function useCopilot({
  parsedData,
  commitPlan,
  showToast,
  isReadOnly, projectId, activeView, inspectedTaskId
}: UseCopilotOptions): UseCopilotReturn {
  const { t } = useI18n();
  // Accounts State
  const [accounts, setAccounts] = useState<ProviderAccount[]>(() => getProviderAccounts());
  const configuredAccounts = useMemo(() => accounts.filter(isAccountConfigured), [accounts]);

  // Dynamic Model Discovery State (hydrated from local cache per account)
  const [discoveredModelsByAccount, setDiscoveredModelsByAccount] = useState<Record<string, ModelDiscoveryResult>>(() => {
    const initial: Record<string, ModelDiscoveryResult> = {};
    for (const acc of getProviderAccounts()) {
      const cached = getCachedDiscoveredModels(acc.id);
      if (cached) {
        initial[acc.id] = {
          models: mergeCustomModels(acc.providerId, cached.models),
          source: "cache",
          fetchedAt: cached.fetchedAt
        };
      }
    }
    return initial;
  });
  const [loadingModelsByAccount, setLoadingModelsByAccount] = useState<Record<string, boolean>>({});
  const inFlightDiscoveryRef = useRef<Map<string, Promise<ModelDiscoveryResult | null>>>(new Map());

  // 1. Configuration State
  const [config, setConfigState] = useState<CopilotConfig>(() => {
    const allAccounts = getProviderAccounts();
    const activeAccId = getActiveAccountId();
    const matched = allAccounts.find((a) => a.id === activeAccId) || allAccounts[0];

    if (matched) {
      const defaultModel = matched.selectedModelId || PROVIDER_CATALOG[matched.providerId]?.models[0]?.id || "gemini-2.5-flash";
      return {
        activeAccountId: matched.id,
        providerId: matched.providerId,
        apiKey: matched.apiKey,
        modelId: defaultModel,
        customBaseUrl: matched.customBaseUrl,
        proxyUrl: matched.proxyUrl,
        temperature: getTemperature()
      };
    }

    const providerId = getActiveProvider();
    const defaultModel = PROVIDER_CATALOG[providerId]?.models[0]?.id || "gemini-2.5-flash";
    return {
      providerId,
      apiKey: getApiKey(providerId),
      modelId: getModelForProvider(providerId, defaultModel),
      customBaseUrl: getCustomBaseUrl(providerId),
      proxyUrl: getProxyUrl(providerId),
      temperature: getTemperature()
    };
  });

  const configRef = useRef(config);
  configRef.current = config;

  const parsedDataRef = useRef(parsedData);
  parsedDataRef.current = parsedData;

  const commitPlanRef = useRef(commitPlan);
  commitPlanRef.current = commitPlan;

  const isReadOnlyRef = useRef(isReadOnly);
  isReadOnlyRef.current = isReadOnly;

  const refreshModelsForAccount = useCallback(async (accountId: string, force = false): Promise<ModelDiscoveryResult | null> => {
    const acc = getProviderAccounts().find((a) => a.id === accountId);
    if (!acc || !isAccountConfigured(acc)) return null;

    if (!force && inFlightDiscoveryRef.current.has(accountId)) {
      return inFlightDiscoveryRef.current.get(accountId)!;
    }

    const promise = (async () => {
      setLoadingModelsByAccount((prev) => ({ ...prev, [accountId]: true }));
      try {
        const started = performance.now();
        const response = await fetchLiveModelsForAccount(acc, { force });
        const result = response.source === "live" ? { ...response, latencyMs: Math.round(performance.now() - started) } : response;
        setDiscoveredModelsByAccount((prev) => ({ ...prev, [accountId]: result }));

        // If this account has no selected model yet (or placeholder "custom") and live models loaded, pick the first live model.
        if (result.source === "live" && result.models.length > 0) {
          const latestAcc = getProviderAccounts().find((a) => a.id === accountId);
          const currentSelected = latestAcc?.selectedModelId || "";
          if (!currentSelected || currentSelected === "custom") {
            const preferred = result.models[0].id;
            updateProviderAccount(accountId, { selectedModelId: preferred });
            setAccounts(getProviderAccounts());
            if (configRef.current.activeAccountId === accountId) {
              setConfigState((prev) => ({ ...prev, modelId: preferred }));
            }
          }
        }
        return result;
      } finally {
        inFlightDiscoveryRef.current.delete(accountId);
        setLoadingModelsByAccount((prev) => ({ ...prev, [accountId]: false }));
      }
    })();

    inFlightDiscoveryRef.current.set(accountId, promise);
    return promise;
  }, []);

  const refreshAllAccountModels = useCallback(
    async (force = false) => {
      const targets = getProviderAccounts().filter(isAccountConfigured);
      await Promise.allSettled(targets.map((acc) => refreshModelsForAccount(acc.id, force)));
    },
    [refreshModelsForAccount]
  );

  // Account Management Actions
  const addAccount = useCallback(
    (data: Omit<ProviderAccount, "id" | "createdAt">) => {
      const created = addProviderAccount(data);
      const updated = getProviderAccounts();
      setAccounts(updated);
      setActiveAccountId(created.id);
      const defaultModel = created.selectedModelId || PROVIDER_CATALOG[created.providerId]?.models[0]?.id || "";
      setConfigState((prev) => ({
        ...prev,
        activeAccountId: created.id,
        providerId: created.providerId,
        apiKey: created.apiKey,
        modelId: defaultModel,
        customBaseUrl: created.customBaseUrl,
        proxyUrl: created.proxyUrl
      }));
      void refreshModelsForAccount(created.id, true);
      return created;
    },
    [refreshModelsForAccount]
  );

  const updateAccount = useCallback(
    (id: string, partial: Partial<ProviderAccount>) => {
      updateProviderAccount(id, partial);
      const updated = getProviderAccounts();
      setAccounts(updated);
      const activeId = getActiveAccountId();
      if (activeId === id) {
        setConfigState((prev) => ({
          ...prev,
          providerId: partial.providerId !== undefined ? partial.providerId : prev.providerId,
          apiKey: partial.apiKey !== undefined ? partial.apiKey : prev.apiKey,
          modelId: partial.selectedModelId !== undefined ? partial.selectedModelId : prev.modelId,
          customBaseUrl: partial.customBaseUrl !== undefined ? partial.customBaseUrl : prev.customBaseUrl,
          proxyUrl: partial.proxyUrl !== undefined ? partial.proxyUrl : prev.proxyUrl
        }));
      }
      if (
        partial.apiKey !== undefined ||
        partial.providerId !== undefined ||
        partial.customBaseUrl !== undefined ||
        partial.proxyUrl !== undefined
      ) {
        void refreshModelsForAccount(id, true);
      }
    },
    [refreshModelsForAccount]
  );

  const deleteAccount = useCallback((id: string) => {
    deleteProviderAccount(id);
    const updated = getProviderAccounts();
    setAccounts(updated);
    setDiscoveredModelsByAccount((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const nextActiveId = getActiveAccountId();
    const nextAcc = updated.find((a) => a.id === nextActiveId) || updated[0];
    if (nextAcc) {
      const defaultModel = nextAcc.selectedModelId || PROVIDER_CATALOG[nextAcc.providerId]?.models[0]?.id || "";
      setConfigState((prev) => ({
        ...prev,
        activeAccountId: nextAcc.id,
        providerId: nextAcc.providerId,
        apiKey: nextAcc.apiKey,
        modelId: defaultModel,
        customBaseUrl: nextAcc.customBaseUrl,
        proxyUrl: nextAcc.proxyUrl
      }));
    } else {
      setConfigState((prev) => ({
        ...prev,
        activeAccountId: undefined,
        apiKey: ""
      }));
    }
  }, []);

  const selectAccountAndModel = useCallback((accountId: string, modelId: string) => {
    const acc = getProviderAccounts().find((a) => a.id === accountId);
    if (!acc) return;
    setActiveAccountId(accountId);
    updateProviderAccount(accountId, { selectedModelId: modelId });
    setAccounts(getProviderAccounts());
    setConfigState((prev) => ({
      ...prev,
      activeAccountId: accountId,
      providerId: acc.providerId,
      apiKey: acc.apiKey,
      modelId,
      customBaseUrl: acc.customBaseUrl,
      proxyUrl: acc.proxyUrl
    }));
  }, []);

  // 2. Chat & Execution State
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingDiff, setPendingDiff] = useState<PendingPlanChange | null>(null);

  const contextRef = useRef({ projectId, activeView, inspectedTaskId });
  contextRef.current = { projectId, activeView, inspectedTaskId };
  const proposalSource = useRef<JanttData | null>(null);
  const requestGeneration = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);

  // Sync provider switch helper
  const updateConfig = useCallback((partial: Partial<CopilotConfig>) => {
    setConfigState((prev) => {
      const nextProvider = partial.providerId || prev.providerId;
      const isProviderSwitch = partial.providerId !== undefined && partial.providerId !== prev.providerId;

      let nextModel = partial.modelId !== undefined ? partial.modelId : prev.modelId;
      let nextKey = partial.apiKey !== undefined ? partial.apiKey : prev.apiKey;
      let nextBaseUrl = partial.customBaseUrl !== undefined ? partial.customBaseUrl : prev.customBaseUrl;
      let nextProxy = partial.proxyUrl !== undefined ? partial.proxyUrl : prev.proxyUrl;

      if (isProviderSwitch) {
        setActiveProvider(nextProvider);
        const defaultModel = PROVIDER_CATALOG[nextProvider]?.models[0]?.id || "";
        nextModel = getModelForProvider(nextProvider, defaultModel);
        nextKey = getApiKey(nextProvider);
        nextBaseUrl = getCustomBaseUrl(nextProvider);
        nextProxy = getProxyUrl(nextProvider);
      } else {
        if (partial.apiKey !== undefined) setApiKey(nextProvider, partial.apiKey);
        if (partial.modelId !== undefined) setModelForProvider(nextProvider, partial.modelId);
        if (partial.customBaseUrl !== undefined) setCustomBaseUrl(nextProvider, partial.customBaseUrl);
        if (partial.proxyUrl !== undefined) setProxyUrl(nextProvider, partial.proxyUrl);
        if (partial.temperature !== undefined) setTemperature(partial.temperature);
      }

      return {
        ...prev,
        providerId: nextProvider,
        apiKey: nextKey,
        modelId: nextModel,
        customBaseUrl: nextBaseUrl,
        proxyUrl: nextProxy,
        temperature: partial.temperature !== undefined ? partial.temperature : prev.temperature
      };
    });
  }, []);

  const isConfigured = useMemo(() => {
    return configuredAccounts.length > 0;
  }, [configuredAccounts]);

  const availableProviders = useMemo(() => getAllProviders(), []);
  const availableModels = useMemo(() => {
    const activeAcc = accounts.find((a) => a.id === config.activeAccountId);
    if (activeAcc) {
      return getEffectiveModelsForAccount(activeAcc, discoveredModelsByAccount);
    }
    return getModelsForProvider(config.providerId);
  }, [accounts, config.activeAccountId, config.providerId, discoveredModelsByAccount]);

  const currentModelLabel = useMemo(() => {
    const activeAcc = accounts.find((a) => a.id === config.activeAccountId);
    const found = availableModels.find((m) => m.id === config.modelId);
    const modelName = found ? found.label : config.modelId || t("app.copilotSelectModel");
    if (activeAcc && accounts.length > 1) {
      return `${activeAcc.label} • ${modelName}`;
    }
    return modelName;
  }, [accounts, config.activeAccountId, availableModels, config.modelId, t]);

  // Stop Generation
  const stopGeneration = useCallback(() => {
    requestGeneration.current++;
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
      activeAbortRef.current = null;
    }
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((msg) => (msg.isStreaming ? { ...msg, isStreaming: false, content: msg.content + tGlobal("app.copilotStopped") } : msg))
    );
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
      }
    };
  }, []);

  // Send Message
  const sendMessage = useCallback(
    (text: string) => {
      const cleanPrompt = text.trim();
      if (!cleanPrompt) return;

      if (isStreaming) {
        return;
      }

      const generation = ++requestGeneration.current;
      const activeConfig = configRef.current;
      const isLocal =
        activeConfig.providerId === "ollama" || activeConfig.providerId === "openai-compatible" &&
        (activeConfig.customBaseUrl?.includes("localhost") || activeConfig.customBaseUrl?.includes("127.0.0.1"));

      if (!activeConfig.apiKey.trim() && !isLocal) {
        const providerLabel = PROVIDER_CATALOG[activeConfig.providerId]?.label || tGlobal("app.copilotAiProvider");
        showToast(tGlobal("app.copilotApiKeyRequired", { provider: providerLabel }), true);
        return;
      }

      const userMessageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const assistantMessageId = `msg-reply-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const userMessage: CopilotMessage = {
        id: userMessageId,
        role: "user",
        content: cleanPrompt,
        timestamp: Date.now()
      };

      const assistantMessage: CopilotMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        isStreaming: true
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);

      // Build chat conversation array
      const sourcePlan = parsedDataRef.current;
      const context = contextRef.current;
      const systemPrompt = buildSystemPrompt(sourcePlan) + "\nWorkspace view and selected task: " +
        JSON.stringify({ view: context.activeView, selectedTaskId: context.inspectedTaskId });
      const conversationPayload: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt }
      ];

      // Add recent chat context (up to last 6 messages)
      const recentHistory = messages.slice(-6);
      for (const m of recentHistory) {
        if (m.role === "user" || m.role === "assistant") {
          conversationPayload.push({
            role: m.role,
            content: m.content
          });
        }
      }
      conversationPayload.push({ role: "user", content: cleanPrompt });

      const adapter = getProviderAdapter(activeConfig.providerId);
      let accumulatedResponse = "";

      const effectiveBaseUrl =
        activeConfig.providerId === "anthropic" && activeConfig.proxyUrl
          ? activeConfig.proxyUrl
          : activeConfig.customBaseUrl;

      const abortCtrl = adapter.streamChat(
        conversationPayload,
        activeConfig.modelId,
        activeConfig.apiKey,
        {
          onToken: (chunk) => {
            if (generation !== requestGeneration.current) return;
            accumulatedResponse += chunk;
            setMessages((prev) =>
              prev.map((msg) => (msg.id === assistantMessageId ? { ...msg, content: accumulatedResponse } : msg))
            );
          },
          onDone: (fullText) => {
            if (generation !== requestGeneration.current || context.projectId !== contextRef.current.projectId) return;
            setIsStreaming(false);
            activeAbortRef.current = null;

            const finalContent = fullText || accumulatedResponse;
            const extraction = extractJsonFromResponse(finalContent, sourcePlan);

            if (extraction.data) {
              const validation = validate(extraction.data);
              if (validation.valid) {
                const diff = computePlanDiff(sourcePlan, extraction.data);
                const beforePlan = sourcePlan;
                proposalSource.current = sourcePlan;
                const pending: PendingPlanChange = {
                  plan: extraction.data,
                  diff,
                  messageId: assistantMessageId
                };
                setPendingDiff(pending);

                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          content: extraction.textContent || tGlobal("app.copilotReviewChanges"),
                          extractedPlan: extraction.data,
                          previousPlan: beforePlan,
                          diff,
                          isStreaming: false
                        }
                      : msg
                  )
                );
              } else {
                const errors = validation.errors.map((e) => `${e.path}: ${e.message}`);
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          content: extraction.textContent || tGlobal("app.copilotSchemaErrors"),
                          validationErrors: errors,
                          isStreaming: false
                        }
                      : msg
                  )
                );
              }
            } else {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? {
                        ...msg,
                        content: finalContent,
                        isStreaming: false
                      }
                    : msg
                )
              );
            }
          },
          onError: (err) => {
            if (generation !== requestGeneration.current) return;
            setIsStreaming(false);
            activeAbortRef.current = null;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? {
                      ...msg,
                      error: err.message,
                      isStreaming: false
                    }
                  : msg
              )
            );
          }
        },
        {
          baseUrl: effectiveBaseUrl,
          temperature: activeConfig.temperature
        }
      );

      activeAbortRef.current = abortCtrl;
    },
    [isStreaming, messages, showToast]
  );

  // Accept AI Plan Change
  const acceptChange = useCallback(() => {
    if (!pendingDiff) return;

    if (isReadOnlyRef.current) {
      showToast(tGlobal("app.copilotCannotApplyReadOnly"), true);
      return;
    }

    try {
      if (parsedDataRef.current !== proposalSource.current) {
        showToast(tGlobal("app.copilotPlanChanged"), true);
        return;
      }
      const committed = commitPlanRef.current(pendingDiff.plan);
      if (!committed) return;
      setMessages((prev) =>
        prev.map((msg) => (msg.id === pendingDiff.messageId ? { ...msg, extractedPlan: committed, applied: true } : msg))
      );
      showToast(tGlobal("app.copilotApplied", { summary: pendingDiff.diff.summary }));
      setPendingDiff(null);
    } catch (err: unknown) {
      showToast(tGlobal("app.copilotCommitFailed", { error: err instanceof Error ? err.message : String(err) }), true);
    }
  }, [pendingDiff, showToast]);

  // Reject AI Plan Change
  const rejectChange = useCallback(() => {
    if (!pendingDiff) return;
    setMessages((prev) =>
      prev.map((msg) => (msg.id === pendingDiff.messageId ? { ...msg, applied: false } : msg))
    );
    setPendingDiff(null);
    showToast(tGlobal("app.copilotDismissed"));
  }, [pendingDiff, showToast]);

  // Revert an applied change
  const revertChange = useCallback(
    (messageId: string) => {
      const targetMsg = messages.find((m) => m.id === messageId);
      if (!targetMsg?.applied || !targetMsg.previousPlan || !targetMsg.extractedPlan || !parsedDataRef.current) {
        showToast(tGlobal("app.copilotNoSnapshot"), true);
        return;
      }
      if (isReadOnlyRef.current) {
        showToast(tGlobal("app.copilotCannotRevertReadOnly"), true);
        return;
      }
      try {
        const entry = diffPlans(targetMsg.previousPlan, targetMsg.extractedPlan);
        if (!entry) return;
        const reverted = applyHistoryEntry(parsedDataRef.current, entry, "undo", `${new Date().toISOString()}#${getPeerId()}`);
        if (!reverted.applied) {
          showToast(tGlobal("app.copilotFieldsChanged"), true);
          return;
        }
        if (!commitPlanRef.current(reverted.data)) return;
        setMessages((prev) =>
          prev.map((msg) => (msg.id === messageId ? { ...msg, applied: false } : msg))
        );
        showToast(reverted.skipped ? tGlobal("app.copilotRevertedKept") : tGlobal("app.copilotReverted"));
      } catch (err: unknown) {
        showToast(tGlobal("app.copilotRevertFailed", { error: err instanceof Error ? err.message : String(err) }), true);
      }
    },
    [messages, showToast]
  );

  // Clear History
  const clearHistory = useCallback(() => {
    stopGeneration();
    setMessages([]);
    setPendingDiff(null);
  }, [stopGeneration]);

  useEffect(() => {
    clearHistory();
    return () => { requestGeneration.current++; activeAbortRef.current?.abort(); };
  }, [projectId, clearHistory]);

  return {
    messages,
    isStreaming,
    config,
    isConfigured,
    pendingDiff,
    isReadOnly,
    isProposalStale: Boolean(pendingDiff && parsedData !== proposalSource.current),
    sendMessage,
    stopGeneration,
    acceptChange,
    rejectChange,
    revertChange,
    clearHistory,
    updateConfig,
    availableProviders,
    availableModels,
    currentModelLabel,
    accounts,
    configuredAccounts,
    discoveredModelsByAccount,
    loadingModelsByAccount,
    refreshModelsForAccount,
    refreshAllAccountModels,
    addAccount,
    updateAccount,
    deleteAccount,
    selectAccountAndModel
  };
}
