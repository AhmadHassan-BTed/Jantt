import React, { useState, useEffect, useRef } from "react";
import {
  KeyRound,
  ShieldCheck,
  ExternalLink,
  Save,
  Check,
  ChevronDown,
  Plus,
  Trash2,
  Edit2
} from "lucide-react";
import type {
  CopilotConfig,
  ProviderDefinition,
  ProviderId,
  ProviderAccount
} from "../../services/ai/types";
import { useI18n } from "../../i18n/I18nProvider";

interface CopilotSetupProps {
  config: CopilotConfig;
  providers: ProviderDefinition[];
  accounts?: ProviderAccount[];
  onAddAccount?: (data: Omit<ProviderAccount, "id" | "createdAt">) => ProviderAccount;
  onUpdateAccount?: (id: string, partial: Partial<ProviderAccount>) => void;
  onDeleteAccount?: (id: string) => void;
  onSelectAccount?: (accountId: string) => void;
  onSaveConfig: (updated: Partial<CopilotConfig>) => void;
  onClose?: () => void;
}

export const CopilotSetup: React.FC<CopilotSetupProps> = ({
  config,
  providers,
  accounts = [],
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onSaveConfig,
  onClose
}) => {
  const { t } = useI18n();
  // Editing state: whether creating a new account or editing existing
  const [editingAccountId, setEditingAccountId] = useState<string | null>(
    config.activeAccountId || (accounts.length > 0 ? accounts[0].id : null)
  );
  const [isCreatingNew, setIsCreatingNew] = useState(accounts.length === 0);

  // Form fields
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(config.providerId || "gemini");
  const [accountLabel, setAccountLabel] = useState("");
  const [apiKey, setApiKey] = useState(config.apiKey || "");
  const [customBaseUrl, setCustomBaseUrl] = useState(config.customBaseUrl || "");
  const [proxyUrl, setProxyUrl] = useState(config.proxyUrl || "");
  const [temperature, setTemperature] = useState(config.temperature);

  // Dropdown open state
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Sync when selecting an account to edit
  useEffect(() => {
    if (!isCreatingNew && editingAccountId) {
      const matched = accounts.find((a) => a.id === editingAccountId);
      if (matched) {
        setSelectedProvider(matched.providerId);
        setAccountLabel(matched.label);
        setApiKey(matched.apiKey);
        setCustomBaseUrl(matched.customBaseUrl || "");
        setProxyUrl(matched.proxyUrl || "");
        setErrorMessage("");
      }
    }
  }, [editingAccountId, isCreatingNew, accounts]);

  // Click outside listener for dropdown
  useEffect(() => {
    if (!isProviderDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsProviderDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isProviderDropdownOpen]);

  const activeProviderDef = providers.find((p) => p.id === selectedProvider) || providers[0];

  const handleProviderChange = (pId: ProviderId) => {
    setSelectedProvider(pId);
    const def = providers.find((p) => p.id === pId);
    if (isCreatingNew || !accountLabel.trim()) {
      setAccountLabel(t("copilot.accountNameSuffix", { provider: def ? def.label : pId }));
    }
  };

  const handleStartAddAccount = () => {
    setIsCreatingNew(true);
    setEditingAccountId(null);
    setSelectedProvider("gemini");
    const geminiDef = providers.find((p) => p.id === "gemini");
    setAccountLabel(t("copilot.accountNameSuffix", { provider: geminiDef ? geminiDef.label : "Gemini" }));
    setApiKey("");
    setCustomBaseUrl("");
    setProxyUrl("");
  };

  const handleSelectAccountToEdit = (acc: ProviderAccount) => {
    setIsCreatingNew(false);
    setEditingAccountId(acc.id);
  };

  const handleDeleteAccount = (accId: string) => {
    onDeleteAccount?.(accId);
    if (editingAccountId === accId) {
      const remaining = accounts.filter((a) => a.id !== accId);
      if (remaining.length > 0) {
        handleSelectAccountToEdit(remaining[0]);
      } else {
        handleStartAddAccount();
      }
    }
  };

  const handleSave = () => {
    const cleanKey = apiKey.trim();
    const cleanUrl = customBaseUrl.trim();
    const cleanProxy = proxyUrl.trim();
    const label = accountLabel.trim() || activeProviderDef.label;

    if (selectedProvider !== "ollama" && !cleanKey) {
      setErrorMessage(t("copilot.apiKeyRequired", { provider: activeProviderDef.label }));
      return;
    }
    setErrorMessage("");

    let targetAccountId = editingAccountId;

    if (isCreatingNew && onAddAccount) {
      const created = onAddAccount({
        providerId: selectedProvider,
        label,
        apiKey: cleanKey,
        customBaseUrl: selectedProvider === "ollama" ? (cleanUrl || "http://localhost:11434/v1") : cleanUrl,
        proxyUrl: cleanProxy,
        isExplicit: true,
        selectedModelId: activeProviderDef.models[0]?.id || ""
      });
      targetAccountId = created.id;
      setIsCreatingNew(false);
      setEditingAccountId(created.id);
    } else if (editingAccountId && onUpdateAccount) {
      onUpdateAccount(editingAccountId, {
        providerId: selectedProvider,
        label,
        apiKey: cleanKey,
        customBaseUrl: selectedProvider === "ollama" ? (cleanUrl || "http://localhost:11434/v1") : cleanUrl,
        proxyUrl: cleanProxy,
        isExplicit: true
      });
    }

    onSaveConfig({
      activeAccountId: targetAccountId || undefined,
      providerId: selectedProvider,
      apiKey: cleanKey,
      customBaseUrl: cleanUrl,
      proxyUrl: cleanProxy,
      temperature
    });

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose?.();
    }, 1200);
  };

  return (
    <div className="copilot-setup-container">
      <div className="copilot-setup-header">
        <div className="copilot-setup-icon">
          <KeyRound size={20} />
        </div>
        <div>
          <h3>{t("copilot.providerAccounts")}</h3>
          <p>{t("copilot.providerAccountsBody")}</p>
        </div>
      </div>

      {/* Configured Accounts List */}
      <div className="copilot-accounts-section">
        <div className="copilot-accounts-header">
          <span className="copilot-section-title">
            {t("copilot.configuredAccounts", { count: accounts.length })}
          </span>
          <button
            type="button"
            className="copilot-add-account-btn"
            onClick={handleStartAddAccount}
            title={t("copilot.addAccountTitle")}
          >
            <Plus size={12} />
            <span>{t("copilot.addAccount")}</span>
          </button>
        </div>

        {accounts.length > 0 && (
          <div className="copilot-accounts-list">
            {accounts.map((acc) => {
              const isSelected = !isCreatingNew && acc.id === editingAccountId;
              const isActive = acc.id === config.activeAccountId;
              const pDef = providers.find((p) => p.id === acc.providerId);
              const hasKey = acc.providerId === "ollama" || Boolean(acc.apiKey.trim());

              return (
                <div
                  key={acc.id}
                  className={`copilot-account-card ${isSelected ? "is-selected" : ""} ${isActive ? "is-active-account" : ""}`}
                  onClick={() => handleSelectAccountToEdit(acc)}
                >
                  <div className="copilot-acc-info">
                    <div className="copilot-acc-name-row">
                      <span className="copilot-acc-name">{acc.label}</span>
                      {isActive && <span className="copilot-acc-badge-active">{t("copilot.active")}</span>}
                    </div>
                    <span className="copilot-acc-meta">
                      {pDef?.label || acc.providerId}
                      {" • "}
                      {hasKey ? t("copilot.keyConfigured") : t("copilot.keyMissing")}
                    </span>
                  </div>
                  <div className="copilot-acc-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="copilot-acc-edit-btn"
                      onClick={() => handleSelectAccountToEdit(acc)}
                      title={t("copilot.editAccount")}
                    >
                      <Edit2 size={12} />
                    </button>
                    {accounts.length > 1 && (
                      <button
                        type="button"
                        className="copilot-acc-delete-btn"
                        onClick={() => handleDeleteAccount(acc.id)}
                        title={t("copilot.deleteAccount")}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="copilot-setup-form">
        <div className="copilot-form-section-divider">
          <span>{isCreatingNew ? t("copilot.addNewAccount") : t("copilot.editing", { label: accountLabel || activeProviderDef.label })}</span>
        </div>

        {/* Account Label */}
        <div className="copilot-form-group">
          <label className="copilot-form-label" htmlFor="copilot-account-label">
            {t("copilot.accountLabel")}
          </label>
          <input
            id="copilot-account-label"
            type="text"
            className="copilot-text-input"
            value={accountLabel}
            onChange={(e) => setAccountLabel(e.target.value)}
            placeholder={t("copilot.accountLabelPlaceholder")}
            spellCheck={false}
          />
        </div>

        {/* Provider Dropdown */}
        <div className="copilot-form-group" ref={dropdownRef}>
          <label className="copilot-form-label">{t("copilot.provider")}</label>
          <div className="copilot-dropdown-container">
            <button
              type="button"
              className={`copilot-dropdown-trigger ${isProviderDropdownOpen ? "is-open" : ""}`}
              onClick={() => setIsProviderDropdownOpen((prev) => !prev)}
            >
              <div className="copilot-dropdown-trigger-content">
                <span className="copilot-dropdown-trigger-title">{activeProviderDef.label}</span>
                <span className="copilot-dropdown-trigger-desc">{t(`copilot.providerDesc.${activeProviderDef.id}`)}</span>
              </div>
              <ChevronDown size={14} className={`copilot-dropdown-chevron ${isProviderDropdownOpen ? "is-open" : ""}`} />
            </button>

            {isProviderDropdownOpen && (
              <div className="copilot-dropdown-menu" role="listbox">
                {providers.map((p) => {
                  const isSelected = selectedProvider === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`copilot-dropdown-item ${isSelected ? "is-active" : ""}`}
                      onClick={() => {
                        handleProviderChange(p.id);
                        setIsProviderDropdownOpen(false);
                      }}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <div className="copilot-dropdown-item-header">
                        <span className="copilot-dropdown-item-label">{p.label}</span>
                        {isSelected && <Check size={13} className="copilot-check-icon" />}
                      </div>
                      <span className="copilot-dropdown-item-desc">{t(`copilot.providerDesc.${p.id}`)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* API Key */}
        <div className="copilot-form-group">
          <label className="copilot-form-label" htmlFor="copilot-api-key">
            {t("copilot.apiKeyLabel", { provider: activeProviderDef.label })}
          </label>
          <input
            id="copilot-api-key"
            type="password"
            className="copilot-text-input"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              selectedProvider === "gemini"
                ? "AIzaSy..."
                : selectedProvider === "openai"
                ? "sk-proj-..."
                : selectedProvider === "anthropic"
                ? "sk-ant-..."
                : selectedProvider === "groq"
                ? "gsk_..."
                : selectedProvider === "deepseek"
                ? "sk-..."
                : selectedProvider === "openrouter"
                ? "sk-or-..."
                : selectedProvider === "mistral"
                ? t("copilot.apiKeyPlaceholderMistral")
                : selectedProvider === "xai"
                ? "xai-..."
                : selectedProvider === "ollama"
                ? t("copilot.apiKeyPlaceholderOllama")
                : t("copilot.apiKeyPlaceholderGeneric")
            }
            autoComplete="off"
            spellCheck={false}
          />
          <span className="copilot-form-hint">
            {selectedProvider === "gemini" && (
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">
                {t("copilot.getKeyGemini")} <ExternalLink size={10} />
              </a>
            )}
            {selectedProvider === "openai" && (
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
                {t("copilot.getKeyOpenai")} <ExternalLink size={10} />
              </a>
            )}
            {selectedProvider === "anthropic" && (
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                {t("copilot.getKeyAnthropic")} <ExternalLink size={10} />
              </a>
            )}
            {selectedProvider === "groq" && (
              <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
                {t("copilot.getKeyGroq")} <ExternalLink size={10} />
              </a>
            )}
            {selectedProvider === "deepseek" && (
              <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">
                {t("copilot.getKeyDeepseek")} <ExternalLink size={10} />
              </a>
            )}
            {selectedProvider === "openrouter" && (
              <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
                {t("copilot.getKeyOpenrouter")} <ExternalLink size={10} />
              </a>
            )}
            {selectedProvider === "mistral" && (
              <a href="https://console.mistral.ai/api-keys/" target="_blank" rel="noreferrer">
                {t("copilot.getKeyMistral")} <ExternalLink size={10} />
              </a>
            )}
            {selectedProvider === "xai" && (
              <a href="https://console.x.ai/" target="_blank" rel="noreferrer">
                {t("copilot.getKeyXai")} <ExternalLink size={10} />
              </a>
            )}
            {selectedProvider === "ollama" && (
              <span>{t("copilot.ollamaHint")}</span>
            )}
            {selectedProvider === "openai-compatible" && (
              <span>{t("copilot.compatibleHint")}</span>
            )}
          </span>
          {errorMessage && (
            <div className="copilot-error-banner">
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Custom Base URL */}
        {(selectedProvider === "openai-compatible" || selectedProvider === "ollama" || activeProviderDef.supportsCustomBaseUrl) && (
          <div className="copilot-form-group">
            <label className="copilot-form-label" htmlFor="copilot-base-url">
              {selectedProvider === "ollama" ? t("copilot.ollamaUrl") : t("copilot.baseUrl")}
            </label>
            <input
              id="copilot-base-url"
              type="text"
              className="copilot-text-input"
              value={customBaseUrl}
              onChange={(e) => setCustomBaseUrl(e.target.value)}
              placeholder={
                selectedProvider === "ollama"
                  ? "http://localhost:11434/v1"
                  : activeProviderDef.defaultBaseUrl || "https://api.example.com/v1"
              }
              spellCheck={false}
            />
          </div>
        )}

        {/* Anthropic CORS Proxy */}
        {selectedProvider === "anthropic" && (
          <div className="copilot-form-group">
            <label className="copilot-form-label" htmlFor="copilot-proxy-url">
              {t("copilot.proxyUrl")}
            </label>
            <input
              id="copilot-proxy-url"
              type="text"
              className="copilot-text-input"
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              placeholder="https://your-cors-proxy.example.com"
              spellCheck={false}
            />
            <span className="copilot-form-hint">
              {t("copilot.proxyHint")}
            </span>
          </div>
        )}

        {/* Creativity / Temperature */}
        <div className="copilot-form-group">
          <label className="copilot-form-label" htmlFor="copilot-temperature">
            {t("copilot.temperature", { value: temperature })}
          </label>
          <input
            id="copilot-temperature"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="copilot-slider"
          />
          <span className="copilot-form-hint">
            {t("copilot.temperatureHint")}
          </span>
        </div>

        {/* Footer */}
        <div className="copilot-setup-footer">
          <div className="copilot-secure-note">
            <ShieldCheck size={14} />
            <span>{t("copilot.secureNote")}</span>
          </div>
          <button type="button" className="copilot-save-btn" onClick={handleSave}>
            {savedSuccess ? (
              <>
                <Check size={14} />
                <span>{t("copilot.saved")}</span>
              </>
            ) : (
              <>
                <Save size={14} />
                <span>{t("copilot.saveAccount")}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
