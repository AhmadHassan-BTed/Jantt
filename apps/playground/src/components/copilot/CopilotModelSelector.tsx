import React, { useEffect, useRef, useState } from "react";
import { Check, Settings, Sparkles, Plus, CornerDownLeft } from "lucide-react";
import type { ModelDefinition, ProviderDefinition, ProviderId } from "../../services/ai/types";
import { addCustomModel } from "../../services/ai/storage";

interface CopilotModelSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  providers: ProviderDefinition[];
  activeProviderId: string;
  activeModelId: string;
  onSelectModel: (providerId: string, modelId: string) => void;
  onOpenSettings: () => void;
}

export const CopilotModelSelector: React.FC<CopilotModelSelectorProps> = ({
  isOpen,
  onClose,
  providers,
  activeProviderId,
  activeModelId,
  onSelectModel,
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

  const handleAddCustomModel = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = customModelText.trim();
    if (!trimmed) return;
    addCustomModel(activeProviderId as ProviderId, trimmed);
    onSelectModel(activeProviderId, trimmed);
    setCustomModelText("");
    setShowCustomInput(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div ref={panelRef} className="copilot-model-selector-panel" role="menu">
      <div className="copilot-model-list">
        {providers.map((p) => {
          const isCurrentProvider = p.id === activeProviderId;
          return (
            <div key={p.id} className="copilot-model-group">
              <div className="copilot-group-header">
                <Sparkles size={11} />
                <span>{p.label}</span>
              </div>
              {p.models.map((m: ModelDefinition) => {
                const isSelected = isCurrentProvider && m.id === activeModelId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`copilot-model-option ${isSelected ? "is-selected" : ""}`}
                    onClick={() => {
                      onSelectModel(p.id, m.id);
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

      <div className="copilot-custom-model-box">
        {showCustomInput ? (
          <form className="copilot-custom-model-form" onSubmit={handleAddCustomModel}>
            <input
              type="text"
              className="copilot-custom-model-field"
              placeholder={`Enter model ID for ${providers.find(p => p.id === activeProviderId)?.label || activeProviderId}...`}
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
