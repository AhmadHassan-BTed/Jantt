import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  Settings,
  Sparkles,
  Plus,
  CornerDownLeft,
  KeyRound,
  RefreshCw,
  Search,
  X
} from "lucide-react";
import type { ModelDefinition, ProviderDefinition, ProviderId, ProviderAccount } from "../../services/ai/types";
import { getEffectiveModelsForAccount, type ModelDiscoveryResult } from "../../services/ai/model-discovery";
import { addCustomModel } from "../../services/ai/storage";
import { useI18n } from "../../i18n/I18nProvider";

interface CopilotModelSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  providers: ProviderDefinition[];
  configuredAccounts: ProviderAccount[];
  discoveredModelsByAccount?: Record<string, ModelDiscoveryResult>;
  loadingModelsByAccount?: Record<string, boolean>;
  onRefreshModelsForAccount?: (accountId: string, force?: boolean) => Promise<ModelDiscoveryResult | null>;
  onRefreshAllModels?: (force?: boolean) => Promise<void>;
  activeAccountId?: string;
  activeProviderId: string;
  activeModelId: string;
  onSelectAccountAndModel: (accountId: string, modelId: string) => void;
  onOpenSettings: () => void;
}

function formatContextWindow(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return "";
  if (tokens >= 1_000_000) return `${Math.round((tokens / 1_000_000) * 10) / 10}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

export const CopilotModelSelector: React.FC<CopilotModelSelectorProps> = ({
  isOpen,
  onClose,
  providers,
  configuredAccounts,
  discoveredModelsByAccount,
  loadingModelsByAccount,
  onRefreshModelsForAccount,
  onRefreshAllModels,
  activeAccountId,
  activeModelId,
  onSelectAccountAndModel,
  onOpenSettings
}) => {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const [customModelText, setCustomModelText] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [, setCustomVersion] = useState(0);

  // Auto-discover live models for any uncached/stale account when the selector opens.
  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery("");
    if (configuredAccounts.length > 0) {
      void onRefreshAllModels?.(false);
    }
  }, [isOpen, configuredAccounts.length, onRefreshAllModels]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const activeAccount = configuredAccounts.find((a) => a.id === activeAccountId) || configuredAccounts[0];
  const isAnyLoading = configuredAccounts.some((acc) => Boolean(loadingModelsByAccount?.[acc.id]));
  const query = searchQuery.trim().toLowerCase();

  const handleAddCustomModel = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = customModelText.trim();
    if (!trimmed || !activeAccount) return;
    addCustomModel(activeAccount.providerId as ProviderId, trimmed);
    setCustomVersion((v) => v + 1);
    onSelectAccountAndModel(activeAccount.id, trimmed);
    setCustomModelText("");
    setShowCustomInput(false);
    onClose();
  };

  if (!isOpen) return null;

  let totalMatchedModels = 0;

  return (
    <div ref={panelRef} className="copilot-model-selector-panel" role="menu">
      {configuredAccounts.length === 0 ? (
        <div className="copilot-empty-models-notice">
          <div className="copilot-empty-models-icon">
            <KeyRound size={20} />
          </div>
          <div className="copilot-empty-models-text">
            <strong>{t("copilot.noProviders")}</strong>
            <p>{t("copilot.noProvidersBody")}</p>
          </div>
          <button
            type="button"
            className="copilot-empty-add-btn"
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
          >
            <Plus size={12} />
            <span>{t("copilot.configureProvider")}</span>
          </button>
        </div>
      ) : (
        <>
          <div className="copilot-model-toolbar">
            <div className="copilot-model-search-box">
              <Search size={12} className="copilot-model-search-icon" />
              <input
                type="text"
                className="copilot-model-search-input"
                placeholder={t("copilot.filterModelsPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label={t("copilot.filterModels")}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="copilot-model-search-clear"
                  onClick={() => setSearchQuery("")}
                  title={t("copilot.clearFilter")}
                  aria-label={t("copilot.clearFilter")}
                >
                  <X size={11} />
                </button>
              )}
            </div>
            <button
              type="button"
              className="copilot-model-refresh-btn"
              onClick={() => void onRefreshAllModels?.(true)}
              disabled={isAnyLoading}
              title={t("copilot.refreshAllTitle")}
              aria-label={t("copilot.refreshLive")}
            >
              <RefreshCw size={12} className={isAnyLoading ? "spin-sync-icon" : ""} />
            </button>
          </div>

          <div className="copilot-model-list">
            {configuredAccounts.map((acc) => {
              const pDef = providers.find((p) => p.id === acc.providerId);
              const discovery = discoveredModelsByAccount?.[acc.id];
              const isLoading = Boolean(loadingModelsByAccount?.[acc.id]);
              const allModels = getEffectiveModelsForAccount(acc, discoveredModelsByAccount);
              const filteredModels = query
                ? allModels.filter(
                    (m) =>
                      m.label.toLowerCase().includes(query) ||
                      m.id.toLowerCase().includes(query) ||
                      acc.label.toLowerCase().includes(query) ||
                      (pDef?.label || acc.providerId).toLowerCase().includes(query)
                  )
                : allModels;

              totalMatchedModels += filteredModels.length;
              const isCurrentAccount = acc.id === (activeAccountId || configuredAccounts[0]?.id);
              const statusText = isLoading
                ? t("copilot.syncing")
                : discovery?.source === "live"
                ? discovery.latencyMs === undefined
                  ? t("copilot.statusLive", { count: allModels.length })
                  : t("copilot.statusLiveLatency", { count: allModels.length, ms: discovery.latencyMs })
                : discovery?.source === "cache"
                ? t("copilot.statusSynced", { count: allModels.length })
                : t("copilot.statusFallback", { count: allModels.length });

              if (query && filteredModels.length === 0) return null;

              return (
                <div key={acc.id} className="copilot-model-group">
                  <div className="copilot-group-header">
                    <Sparkles size={11} />
                    <span className="copilot-group-acc-label">{acc.label}</span>
                    <span
                      className={`copilot-group-status-pill ${
                        discovery?.source === "live" || discovery?.source === "cache" ? "is-live" : ""
                      }`}
                      title={discovery?.error || t("copilot.loadedFrom", { provider: pDef?.label || acc.providerId })}
                    >
                      {statusText}
                    </span>
                    <button
                      type="button"
                      className="copilot-group-refresh-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onRefreshModelsForAccount?.(acc.id, true);
                      }}
                      disabled={isLoading}
                      title={t("copilot.refreshFromTitle", { provider: pDef?.label || acc.providerId })}
                      aria-label={t("copilot.refreshFor", { label: acc.label })}
                    >
                      <RefreshCw size={10} className={isLoading ? "spin-sync-icon" : ""} />
                    </button>
                  </div>

                  {discovery?.error && !isLoading && (
                    <div className="copilot-group-error-hint" title={discovery.error}>
                      {discovery.error}
                    </div>
                  )}

                  {filteredModels.map((m: ModelDefinition) => {
                    const isSelected = isCurrentAccount && m.id === activeModelId;
                    const ctxLabel = formatContextWindow(m.contextWindow);
                    const showIdSub = m.label.toLowerCase() !== m.id.toLowerCase();
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={`copilot-model-option ${isSelected ? "is-selected" : ""}`}
                        onClick={() => {
                          onSelectAccountAndModel(acc.id, m.id);
                          onClose();
                        }}
                        title={m.id}
                      >
                        <div className="copilot-model-option-main">
                          <span className="copilot-model-name">{m.label}</span>
                          {showIdSub && <span className="copilot-model-id-sub">{m.id}</span>}
                        </div>
                        <div className="copilot-model-option-right">
                          {ctxLabel && <span className="copilot-model-ctx-tag">{ctxLabel}</span>}
                          {isSelected && <Check size={13} className="copilot-check-icon" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {query && totalMatchedModels === 0 && (
              <div className="copilot-model-no-matches">
                {t("copilot.noMatches", { query: searchQuery })}
              </div>
            )}
          </div>

          {activeAccount && (
            <div className="copilot-custom-model-box">
              {showCustomInput ? (
                <form className="copilot-custom-model-form" onSubmit={handleAddCustomModel}>
                  <input
                    type="text"
                    className="copilot-custom-model-field"
                    placeholder={t("copilot.customModelPlaceholder", { label: activeAccount.label })}
                    value={customModelText}
                    onChange={(e) => setCustomModelText(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" className="copilot-custom-model-submit" title={t("copilot.addModelTitle")}>
                    <CornerDownLeft size={12} />
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className="copilot-custom-model-toggle-btn"
                  onClick={() => setShowCustomInput(true)}
                >
                  <Plus size={12} />
                  <span>{t("copilot.addCustomModel")}</span>
                </button>
              )}
            </div>
          )}
        </>
      )}

      <div className="copilot-model-footer">
        <button
          type="button"
          className="copilot-footer-settings-btn"
          onClick={() => {
            onClose();
            onOpenSettings();
          }}
        >
          <Settings size={13} />
          <span>{t("copilot.providerSettings")}</span>
        </button>
      </div>
    </div>
  );
};
