import React, { useState } from "react";
import { KeyRound, ShieldCheck, ExternalLink, Save, Check } from "lucide-react";
import type { CopilotConfig, ProviderDefinition, ProviderId } from "../../services/ai/types";

interface CopilotSetupProps {
  config: CopilotConfig;
  providers: ProviderDefinition[];
  onSaveConfig: (updated: Partial<CopilotConfig>) => void;
  onClose?: () => void;
}

export const CopilotSetup: React.FC<CopilotSetupProps> = ({
  config,
  providers,
  onSaveConfig,
  onClose
}) => {
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(config.providerId);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [customBaseUrl, setCustomBaseUrl] = useState(config.customBaseUrl || "");
  const [proxyUrl, setProxyUrl] = useState(config.proxyUrl || "");
  const [temperature, setTemperature] = useState(config.temperature);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const activeProviderDef = providers.find((p) => p.id === selectedProvider) || providers[0];

  const handleProviderChange = (pId: ProviderId) => {
    setSelectedProvider(pId);
  };

  const handleSave = () => {
    onSaveConfig({
      providerId: selectedProvider,
      apiKey: apiKey.trim(),
      customBaseUrl: customBaseUrl.trim(),
      proxyUrl: proxyUrl.trim(),
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
          <h3>AI Provider Configuration</h3>
          <p>Bring your own API key. Keys are saved securely in your browser&apos;s local storage.</p>
        </div>
      </div>

      <div className="copilot-setup-form">
        <div className="copilot-form-group">
          <label className="copilot-form-label">Provider</label>
          <div className="copilot-provider-radios">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`copilot-provider-card ${selectedProvider === p.id ? "is-active" : ""}`}
                onClick={() => handleProviderChange(p.id)}
              >
                <span className="copilot-p-label">{p.label}</span>
                <span className="copilot-p-desc">{p.description}</span>
              </button>
            ))}
          </div>
        </div>

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
                : "API Key (optional for local Ollama)"
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
            {selectedProvider === "openai-compatible" && (
              <span>Supports Groq, DeepSeek, OpenRouter, or local Ollama (http://localhost:11434/v1).</span>
            )}
          </span>
        </div>

        {selectedProvider === "openai-compatible" && (
          <div className="copilot-form-group">
            <label className="copilot-form-label" htmlFor="copilot-base-url">
              Custom Endpoint Base URL
            </label>
            <input
              id="copilot-base-url"
              type="text"
              className="copilot-text-input"
              value={customBaseUrl}
              onChange={(e) => setCustomBaseUrl(e.target.value)}
              placeholder="https://api.groq.com/openai or http://localhost:11434"
              spellCheck={false}
            />
          </div>
        )}

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

        <div className="copilot-setup-footer">
          <div className="copilot-secure-note">
            <ShieldCheck size={14} />
            <span>Keys remain on your device only</span>
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
                <span>Save Configuration</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
