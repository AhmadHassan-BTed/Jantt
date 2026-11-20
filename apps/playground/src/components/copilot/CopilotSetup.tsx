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
  const [autoApply, setAutoApply] = useState(config.autoApply);

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
      setAccountLabel(def ? `${def.label} Account` : `${pId} Account`);
    }
  };

  const handleStartAddAccount = () => {
    setIsCreatingNew(true);
    setEditingAccountId(null);
    setSelectedProvider("gemini");
    const geminiDef = providers.find((p) => p.id === "gemini");
    setAccountLabel(geminiDef ? `${geminiDef.label} Account` : "Gemini Account");
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
      setErrorMessage(`Please enter an API key for ${activeProviderDef.label}.`);
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
      temperature,
      autoApply
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
          <h3>AI Provider Accounts</h3>
          <p>Add N providers and API keys. Stored securely in your browser.</p>
        </div>
      </div>

      {/* Configured Accounts List */}
      <div className="copilot-accounts-section">
        <div className="copilot-accounts-header">
          <span className="copilot-section-title">
            Configured Accounts ({accounts.length})
          </span>
          <button
            type="button"
            className="copilot-add-account-btn"
            onClick={handleStartAddAccount}
            title="Add another API key or provider"
          >
            <Plus size={12} />
            <span>Add Account</span>
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
                      {isActive && <span className="copilot-acc-badge-active">Active</span>}
                    </div>
                    <span className="copilot-acc-meta">
                      {pDef?.label || acc.providerId}
                      {" • "}
                      {hasKey ? "Key configured" : "Key missing"}
                    </span>
                  </div>
                  <div className="copilot-acc-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="copilot-acc-edit-btn"
                      onClick={() => handleSelectAccountToEdit(acc)}
                      title="Edit this account"
                    >
                      <Edit2 size={12} />
                    </button>
                    {accounts.length > 1 && (
                      <button
                        type="button"
                        className="copilot-acc-delete-btn"
                        onClick={() => handleDeleteAccount(acc.id)}
                        title="Delete this account"
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
          <span>{isCreatingNew ? "Add New Account" : `Editing: ${accountLabel || activeProviderDef.label}`}</span>
        </div>

        {/* Account Label */}
        <div className="copilot-form-group">
          <label className="copilot-form-label" htmlFor="copilot-account-label">
            Account Nickname / Label
          </label>
          <input
            id="copilot-account-label"
            type="text"
            className="copilot-text-input"
            value={accountLabel}
            onChange={(e) => setAccountLabel(e.target.value)}
            placeholder="e.g. Gemini Personal, OpenAI Work, Ollama Local"
            spellCheck={false}
          />
        </div>

        {/* Provider Dropdown */}
        <div className="copilot-form-group" ref={dropdownRef}>
          <label className="copilot-form-label">Provider</label>
          <div className="copilot-dropdown-container">
            <button
              type="button"
              className={`copilot-dropdown-trigger ${isProviderDropdownOpen ? "is-open" : ""}`}
              onClick={() => setIsProviderDropdownOpen((prev) => !prev)}
            >
              <div className="copilot-dropdown-trigger-content">
                <span className="copilot-dropdown-trigger-title">{activeProviderDef.label}</span>
                <span className="copilot-dropdown-trigger-desc">{activeProviderDef.description}</span>
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
                      <span className="copilot-dropdown-item-desc">{p.description}</span>
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
            {activeProviderDef.label} API Key
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
                ? "API key from Mistral..."
                : selectedProvider === "xai"
                ? "xai-..."
                : selectedProvider === "ollama"
                ? "No key required for local Ollama"
                : "API Key (if required)"
            }
            autoComplete="off"
            spellCheck={false}
          />
          <span className="copilot-form-hint">
            {selectedProvider === "gemini" && (
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">
                Get free Gemini API Key <ExternalLink size={10} />
              </a>
            )}
            {selectedProvider === "openai" && (
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
                Get OpenAI API Key <ExternalLink size={10} />
              </a>
            )}
            {selectedProvider === "anthropic" && (
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                Get Anthropic API Key <ExternalLink size={10} />
              </a>
            )}
            {selectedProvider === "groq" && (
              <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
                Get free Groq API Key <ExternalLink size={10} />
              </a>
            )}
            {selectedProvider === "deepseek" && (
              <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">
                Get DeepSeek API Key <ExternalLink size={10} />
              </a>
            )}
            {selectedProvider === "openrouter" && (
              <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
                Get OpenRouter API Key (supports 200+ models in-browser) <ExternalLink size={10} />
              </a>
            )}
            {selectedProvider === "mistral" && (
              <a href="https://console.mistral.ai/api-keys/" target="_blank" rel="noreferrer">
                Get Mistral API Key <ExternalLink size={10} />
              </a>
            )}
            {selectedProvider === "xai" && (
              <a href="https://console.x.ai/" target="_blank" rel="noreferrer">
                Get xAI API Key <ExternalLink size={10} />
              </a>
            )}
            {selectedProvider === "ollama" && (
              <span>Local Ollama running on your machine. Default: http://localhost:11434</span>
            )}
            {selectedProvider === "openai-compatible" && (
              <span>Supports vLLM, LM Studio, Together, or any self-hosted OpenAI-compatible server.</span>
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
              {selectedProvider === "ollama" ? "Ollama Endpoint URL" : "Custom Endpoint Base URL"}
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
              CORS Proxy URL (Optional)
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
              Anthropic API restricts direct browser calls. Enter your proxy URL, or use OpenRouter via OpenAI-compatible.
            </span>
          </div>
        )}

        {/* Creativity / Temperature */}
        <div className="copilot-form-group">
          <label className="copilot-form-label">
            Creativity & Temperature: {temperature}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="copilot-slider"
          />
          <span className="copilot-form-hint">
            Lower values (0.1 - 0.3) generate strict, deterministic project schedules.
          </span>
        </div>

        {/* Live Auto-Commit */}
        <div className="copilot-form-group">
          <label className="copilot-checkbox-row">
            <input
              type="checkbox"
              checked={autoApply}
              onChange={(e) => setAutoApply(e.target.checked)}
              className="copilot-checkbox"
            />
            <span className="copilot-checkbox-label">
              <strong>Live Auto-Commit</strong> — Immediately apply clean AI edits to the chart & JSON editor
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="copilot-setup-footer">
          <div className="copilot-secure-note">
            <ShieldCheck size={14} />
            <span>Keys stay on your device; available models are fetched live from your provider API</span>
          </div>
          <button type="button" className="copilot-save-btn" onClick={handleSave}>
            {savedSuccess ? (
              <>
                <Check size={14} />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save size={14} />
                <span>Save Account & Settings</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
