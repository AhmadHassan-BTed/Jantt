import React, { useEffect, useRef, useState } from "react";
import { Check, Settings, Sparkles, Plus, CornerDownLeft, KeyRound } from "lucide-react";
import type { ModelDefinition, ProviderDefinition, ProviderId, ProviderAccount } from "../../services/ai/types";
import { getModelsForProvider } from "../../services/ai/provider-registry";
import { addCustomModel } from "../../services/ai/storage";

interface CopilotModelSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  providers: ProviderDefinition[];
  configuredAccounts: ProviderAccount[];
  activeAccountId?: string;
  activeProviderId: string;
  activeModelId: string;
  onSelectAccountAndModel: (accountId: string, modelId: string) => void;
  onOpenSettings: () => void;
}

export const CopilotModelSelector: React.FC<CopilotModelSelectorProps> = ({
  isOpen,
  onClose,
  providers,
  configuredAccounts,
  activeAccountId,
  activeModelId,
  onSelectAccountAndModel,
  onOpenSettings
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [customModelText, setCustomModelText] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

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

  // Find active account to attach custom model
  const activeAccount = configuredAccounts.find((a) => a.id === activeAccountId) || configuredAccounts[0];

  const handleAddCustomModel = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = customModelText.trim();
    if (!trimmed || !activeAccount) return;
    addCustomModel(activeAccount.providerId as ProviderId, trimmed);
    onSelectAccountAndModel(activeAccount.id, trimmed);
    setCustomModelText("");
    setShowCustomInput(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div ref={panelRef} className="copilot-model-selector-panel" role="menu">
      {configuredAccounts.length === 0 ? (
        <div className="copilot-empty-models-notice">
          <div className="copilot-empty-models-icon">
            <KeyRound size={20} />
          </div>
          <div className="copilot-empty-models-text">
            <strong>No AI Providers Configured</strong>
            <p>Add an API key in Settings to enable models for chatting and schedule edits.</p>
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
            <span>Configure Provider & Key</span>
          </button>
        </div>
      ) : (
        <>
          <div className="copilot-model-list">
            {configuredAccounts.map((acc) => {
              const pDef = providers.find((p) => p.id === acc.providerId);
              const models = getModelsForProvider(acc.providerId);
              const isCurrentAccount = acc.id === (activeAccountId || configuredAccounts[0]?.id);

              return (
                <div key={acc.id} className="copilot-model-group">
                  <div className="copilot-group-header">
                    <Sparkles size={11} />
                    <span className="copilot-group-acc-label">{acc.label}</span>
                    <span className="copilot-group-provider-badge">{pDef?.label || acc.providerId}</span>
                  </div>
                  {models.map((m: ModelDefinition) => {
                    const isSelected = isCurrentAccount && m.id === activeModelId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={`copilot-model-option ${isSelected ? "is-selected" : ""}`}
                        onClick={() => {
                          onSelectAccountAndModel(acc.id, m.id);
                          onClose();
                        }}
                      >
                        <span className="copilot-model-name">{m.label}</span>
                        {isSelected && <Check size={13} className="copilot-check-icon" />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {activeAccount && (
            <div className="copilot-custom-model-box">
              {showCustomInput ? (
                <form className="copilot-custom-model-form" onSubmit={handleAddCustomModel}>
                  <input
                    type="text"
                    className="copilot-custom-model-field"
                    placeholder={`Enter model ID for ${activeAccount.label}...`}
                    value={customModelText}
                    onChange={(e) => setCustomModelText(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" className="copilot-custom-model-submit" title="Add & Select Model">
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
                  <span>Add Custom Model ID...</span>
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
          <span>Provider & API Key Settings</span>
        </button>
      </div>
    </div>
  );
};
