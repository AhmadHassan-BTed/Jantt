import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, ArrowUp, Square, Plus } from "lucide-react";
import { CopilotModelSelector } from "./CopilotModelSelector";
import type { ProviderDefinition, ProviderAccount } from "../../services/ai/types";
import type { ModelDiscoveryResult } from "../../services/ai/model-discovery";

interface CopilotInputProps {
  onSendMessage: (text: string) => void;
  onStopGeneration: () => void;
  isStreaming: boolean;
  isReadOnly: boolean;
  currentModelLabel: string;
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

export const CopilotInput: React.FC<CopilotInputProps> = ({
  onSendMessage,
  onStopGeneration,
  isStreaming,
  isReadOnly,
  currentModelLabel,
  providers,
  configuredAccounts,
  discoveredModelsByAccount,
  loadingModelsByAccount,
  onRefreshModelsForAccount,
  onRefreshAllModels,
  activeAccountId,
  activeProviderId,
  activeModelId,
  onSelectAccountAndModel,
  onOpenSettings
}) => {
  const [text, setText] = useState("");
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) {
        onStopGeneration();
      } else if (text.trim() && !isReadOnly) {
        onSendMessage(text);
        setText("");
      }
    }
  };

  const handleButtonClick = () => {
    if (isStreaming) {
      onStopGeneration();
    } else if (text.trim() && !isReadOnly) {
      onSendMessage(text);
      setText("");
    }
  };

  return (
    <div className="copilot-input-wrapper">
      <div className="copilot-input-card">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isReadOnly ? "Plan is read-only..." : "Ask anything, @ to mention, / for actions"}
          rows={1}
          className="copilot-textarea"
          disabled={isReadOnly}
        />

        <div className="copilot-input-bottom-bar">
          <div className="copilot-model-pill-anchor">
            <button
              type="button"
              className="copilot-model-pill"
              onClick={() => setIsModelSelectorOpen((prev) => !prev)}
              title="Select AI Model or Provider"
            >
              <Plus size={11} className="copilot-pill-plus" />
              <span className="copilot-pill-text">{currentModelLabel}</span>
              <ChevronDown size={11} className="copilot-pill-chevron" />
            </button>

            <CopilotModelSelector
              isOpen={isModelSelectorOpen}
              onClose={() => setIsModelSelectorOpen(false)}
              providers={providers}
              configuredAccounts={configuredAccounts}
              discoveredModelsByAccount={discoveredModelsByAccount}
              loadingModelsByAccount={loadingModelsByAccount}
              onRefreshModelsForAccount={onRefreshModelsForAccount}
              onRefreshAllModels={onRefreshAllModels}
              activeAccountId={activeAccountId}
              activeProviderId={activeProviderId}
              activeModelId={activeModelId}
              onSelectAccountAndModel={onSelectAccountAndModel}
              onOpenSettings={onOpenSettings}
            />
          </div>

          <button
            type="button"
            className={`copilot-action-btn ${isStreaming ? "is-streaming" : text.trim() ? "is-ready" : "is-disabled"}`}
            onClick={handleButtonClick}
            disabled={!isStreaming && (!text.trim() || isReadOnly)}
            title={isStreaming ? "Stop generation" : "Send instruction"}
            aria-label={isStreaming ? "Stop generation" : "Send instruction"}
          >
            {isStreaming ? (
              <Square size={12} className="copilot-stop-icon" />
            ) : (
              <ArrowUp size={14} className="copilot-send-icon" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
