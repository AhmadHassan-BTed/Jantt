import React, { useState } from "react";
import { Sparkles, X, Settings, Trash2, ArrowLeft, Zap } from "lucide-react";
import type { UseCopilotReturn } from "../../hooks/useCopilot";
import { CopilotMessages } from "./CopilotMessages";
import { CopilotInput } from "./CopilotInput";
import { CopilotSetup } from "./CopilotSetup";

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  copilot: UseCopilotReturn;
  themeClassName?: string;
  isMobile: boolean;
}

export const CopilotDrawer: React.FC<CopilotDrawerProps> = ({
  isOpen,
  onClose,
  copilot,
  isMobile
}) => {
  const [showSettings, setShowSettings] = useState(false);

  if (!isOpen) return null;

  const isConfigured = copilot.isConfigured;

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && (
        <div
          className="jantt-copilot-backdrop is-visible"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`jantt-copilot-drawer ${isOpen ? "is-open" : ""}`}
        role="dialog"
        aria-label="Jantt AI Copilot"
        aria-modal="true"
      >
        {/* Drawer Header */}
        <div className="copilot-header">
          {showSettings ? (
            <button
              type="button"
              className="copilot-icon-btn"
              onClick={() => setShowSettings(false)}
              title="Back to conversation"
              aria-label="Back to conversation"
            >
              <ArrowLeft size={15} />
            </button>
          ) : (
            <div className="copilot-header-brand">
              <Sparkles size={16} className="copilot-sparkle-icon" />
              <h2>Jantt AI Copilot</h2>
            </div>
          )}

          <div className="copilot-header-actions">
            {!showSettings && (
              <>
                <button
                  type="button"
                  className={`copilot-auto-apply-pill ${copilot.config.autoApply ? "is-active" : ""}`}
                  onClick={() => copilot.updateConfig({ autoApply: !copilot.config.autoApply })}
                  title={
                    copilot.config.autoApply
                      ? "Live Auto-Commit active: valid AI changes are immediately applied to the chart"
                      : "Manual Review active: click Apply Changes before updates take effect"
                  }
                  aria-pressed={copilot.config.autoApply}
                >
                  <Zap size={11} className={copilot.config.autoApply ? "is-active-icon" : ""} />
                  <span>{copilot.config.autoApply ? "Live" : "Review"}</span>
                </button>

                <button
                  type="button"
                  className="copilot-icon-btn"
                  onClick={copilot.clearHistory}
                  title="Clear conversation"
                  aria-label="Clear conversation"
                  disabled={copilot.messages.length === 0}
                >
                  <Trash2 size={14} />
                </button>
                <button
                  type="button"
                  className="copilot-icon-btn"
                  onClick={() => setShowSettings(true)}
                  title="Copilot Settings"
                  aria-label="Copilot Settings"
                >
                  <Settings size={14} />
                </button>
              </>
            )}
            <button
              type="button"
              className="copilot-icon-btn is-close"
              onClick={onClose}
              title="Close Copilot (Esc)"
              aria-label="Close Copilot"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="copilot-body">
          {!isConfigured || showSettings ? (
            <CopilotSetup
              config={copilot.config}
              providers={copilot.availableProviders}
              accounts={copilot.accounts}
              onAddAccount={copilot.addAccount}
              onUpdateAccount={copilot.updateAccount}
              onDeleteAccount={copilot.deleteAccount}
              onSelectAccount={(accId) => copilot.updateConfig({ activeAccountId: accId })}
              onSaveConfig={(updated) => {
                copilot.updateConfig(updated);
                setShowSettings(false);
              }}
              onClose={() => setShowSettings(false)}
            />
          ) : (
            <>
              <CopilotMessages
                messages={copilot.messages}
                pendingDiff={copilot.pendingDiff}
                onAcceptDiff={copilot.acceptChange}
                onRejectDiff={copilot.rejectChange}
                onRevertDiff={copilot.revertChange}
                onPromptClick={(prompt) => copilot.sendMessage(prompt)}
              />

              <CopilotInput
                onSendMessage={copilot.sendMessage}
                onStopGeneration={copilot.stopGeneration}
                isStreaming={copilot.isStreaming}
                isReadOnly={!isConfigured}
                currentModelLabel={copilot.currentModelLabel}
                providers={copilot.availableProviders}
                configuredAccounts={copilot.configuredAccounts}
                activeAccountId={copilot.config.activeAccountId}
                activeProviderId={copilot.config.providerId}
                activeModelId={copilot.config.modelId}
                onSelectAccountAndModel={(accountId, modelId) => {
                  copilot.selectAccountAndModel(accountId, modelId);
                }}
                onOpenSettings={() => setShowSettings(true)}
              />
            </>
          )}
        </div>
      </aside>
    </>
  );
};
