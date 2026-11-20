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
  getAutoApply,
  setAutoApply,
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
import { buildSystemPrompt } from "../services/ai/system-prompt";
import { extractJsonFromResponse } from "../services/ai/json-extractor";
import { computePlanDiff } from "../services/ai/plan-differ";

export interface UseCopilotOptions {
  parsedData: JanttData | null;
  commitPlan: (data: JanttData) => void;
  showToast: (message: string, isError?: boolean) => void;
  isReadOnly: boolean;
}

export interface UseCopilotReturn {
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
  addAccount: (data: Omit<ProviderAccount, "id" | "createdAt">) => ProviderAccount;
  updateAccount: (id: string, partial: Partial<ProviderAccount>) => void;
  deleteAccount: (id: string) => void;
  selectAccountAndModel: (accountId: string, modelId: string) => void;
}

export function useCopilot({
  parsedData,
  commitPlan,
  showToast,
  isReadOnly
}: UseCopilotOptions): UseCopilotReturn {
  // Accounts State
  const [accounts, setAccounts] = useState<ProviderAccount[]>(() => getProviderAccounts());
  const configuredAccounts = useMemo(() => accounts.filter(isAccountConfigured), [accounts]);

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
        temperature: getTemperature(),
        autoApply: getAutoApply()
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
      temperature: getTemperature(),
      autoApply: getAutoApply()
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

  // Account Management Actions
  const addAccount = useCallback((data: Omit<ProviderAccount, "id" | "createdAt">) => {
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
    return created;
  }, []);

  const updateAccount = useCallback((id: string, partial: Partial<ProviderAccount>) => {
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
  }, []);

  const deleteAccount = useCallback((id: string) => {
    deleteProviderAccount(id);
    const updated = getProviderAccounts();
    setAccounts(updated);
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
        if (partial.autoApply !== undefined) setAutoApply(partial.autoApply);
      }

      return {
        ...prev,
        providerId: nextProvider,
        apiKey: nextKey,
        modelId: nextModel,
        customBaseUrl: nextBaseUrl,
        proxyUrl: nextProxy,
        temperature: partial.temperature !== undefined ? partial.temperature : prev.temperature,
        autoApply: partial.autoApply !== undefined ? partial.autoApply : prev.autoApply
      };
    });
  }, []);

  const isConfigured = useMemo(() => {
    if (configuredAccounts.length > 0) {
      return true;
    }
    if (config.providerId === "ollama") {
      return true;
    }
    if (config.providerId === "openai-compatible") {
      const isLocal = config.customBaseUrl?.includes("localhost") || config.customBaseUrl?.includes("127.0.0.1");
      return Boolean(isLocal || config.apiKey);
    }
    return Boolean(config.apiKey.trim());
  }, [configuredAccounts, config.providerId, config.apiKey, config.customBaseUrl]);

  const availableProviders = useMemo(() => getAllProviders(), []);
  const availableModels = useMemo(() => getModelsForProvider(config.providerId), [config.providerId]);

  const currentModelLabel = useMemo(() => {
    const activeAcc = accounts.find((a) => a.id === config.activeAccountId);
    const found = availableModels.find((m) => m.id === config.modelId);
    const modelName = found ? found.label : config.modelId || "Select Model";
    if (activeAcc && accounts.length > 1) {
      return `${activeAcc.label} • ${modelName}`;
    }
    return modelName;
  }, [accounts, config.activeAccountId, availableModels, config.modelId]);

  // Stop Generation
  const stopGeneration = useCallback(() => {
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
      activeAbortRef.current = null;
    }
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((msg) => (msg.isStreaming ? { ...msg, isStreaming: false, content: msg.content + " [Stopped]" } : msg))
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

      if (isReadOnlyRef.current) {
        showToast("Read-only mode: changes cannot be committed to this plan.", true);
        return;
      }

      if (isStreaming) {
        return;
      }

      const activeConfig = configRef.current;
      const isLocal =
        activeConfig.providerId === "openai-compatible" &&
        (activeConfig.customBaseUrl?.includes("localhost") || activeConfig.customBaseUrl?.includes("127.0.0.1"));

      if (!activeConfig.apiKey.trim() && !isLocal) {
        showToast(`Please enter an API key for ${PROVIDER_CATALOG[activeConfig.providerId]?.label || "the AI provider"}.`, true);
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
      const systemPrompt = buildSystemPrompt(parsedDataRef.current);
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
            accumulatedResponse += chunk;
            setMessages((prev) =>
              prev.map((msg) => (msg.id === assistantMessageId ? { ...msg, content: accumulatedResponse } : msg))
            );
          },
          onDone: (fullText) => {
            setIsStreaming(false);
            activeAbortRef.current = null;

            const finalContent = fullText || accumulatedResponse;
            const extraction = extractJsonFromResponse(finalContent, parsedDataRef.current);

            if (extraction.data) {
              const validation = validate(extraction.data);
              if (validation.valid) {
                const diff = computePlanDiff(parsedDataRef.current, extraction.data);
                const beforePlan = parsedDataRef.current ? JSON.parse(JSON.stringify(parsedDataRef.current)) : null;

                if (activeConfig.autoApply && !isReadOnlyRef.current) {
                  try {
                    commitPlanRef.current(extraction.data);
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? {
                              ...msg,
                              content: extraction.textContent || "Live changes applied to your project plan.",
                              extractedPlan: extraction.data,
                              previousPlan: beforePlan,
                              diff,
                              applied: true,
                              isStreaming: false
                            }
                          : msg
                      )
                    );
                    showToast(`Live plan update committed: ${diff.summary}`);
                  } catch (err: unknown) {
                    showToast(`Failed to auto-commit plan: ${err instanceof Error ? err.message : String(err)}`, true);
                  }
                } else {
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
                            content: extraction.textContent || "I have prepared the updated project plan according to your specifications.",
                            extractedPlan: extraction.data,
                            previousPlan: beforePlan,
                            diff,
                            isStreaming: false
                          }
                        : msg
                    )
                  );
                }
              } else {
                const errors = validation.errors.map((e) => `${e.path}: ${e.message}`);
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          content: extraction.textContent || "The plan was generated with structural schema validation errors.",
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
      showToast("Cannot apply plan in read-only mode.", true);
      return;
    }

    try {
      commitPlanRef.current(pendingDiff.plan);
      setMessages((prev) =>
        prev.map((msg) => (msg.id === pendingDiff.messageId ? { ...msg, applied: true } : msg))
      );
      showToast(`Applied plan changes: ${pendingDiff.diff.summary}`);
      setPendingDiff(null);
    } catch (err: unknown) {
      showToast(`Failed to commit plan: ${err instanceof Error ? err.message : String(err)}`, true);
    }
  }, [pendingDiff, showToast]);

  // Reject AI Plan Change
  const rejectChange = useCallback(() => {
    if (!pendingDiff) return;
    setMessages((prev) =>
      prev.map((msg) => (msg.id === pendingDiff.messageId ? { ...msg, applied: false } : msg))
    );
    setPendingDiff(null);
    showToast("Changes dismissed.");
  }, [pendingDiff, showToast]);

  // Revert an applied change
  const revertChange = useCallback(
    (messageId: string) => {
      const targetMsg = messages.find((m) => m.id === messageId);
      if (!targetMsg?.previousPlan) {
        showToast("No restore snapshot available for this change.", true);
        return;
      }
      if (isReadOnlyRef.current) {
        showToast("Cannot revert plan in read-only mode.", true);
        return;
      }
      try {
        commitPlanRef.current(targetMsg.previousPlan);
        setMessages((prev) =>
          prev.map((msg) => (msg.id === messageId ? { ...msg, applied: false } : msg))
        );
        showToast("Plan change reverted successfully.");
      } catch (err: unknown) {
        showToast(`Failed to revert plan: ${err instanceof Error ? err.message : String(err)}`, true);
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

  return {
    messages,
    isStreaming,
    config,
    isConfigured,
    pendingDiff,
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
    addAccount,
    updateAccount,
    deleteAccount,
    selectAccountAndModel
  };
}
