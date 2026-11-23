import React, { useState } from "react";
import { Sparkles, X, Settings, Trash2, ArrowLeft, Zap, BookOpen } from "lucide-react";
import type { UseCopilotReturn } from "../../hooks/useCopilot";
import { useSheetSwipeDismiss } from "../../hooks/useSheetSwipeDismiss";
import { triggerHaptic } from "../../services/platform";
import { CopilotMessages } from "./CopilotMessages";
import { CopilotInput } from "./CopilotInput";
import { CopilotSetup } from "./CopilotSetup";

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  copilot: UseCopilotReturn;
  themeClassName?: string;
  isMobile: boolean;
  onOpenPromptModal?: () => void;
}

export const CopilotDrawer: React.FC<CopilotDrawerProps> = ({
  isOpen,
  onClose,
  copilot,
  isMobile,
  onOpenPromptModal
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const swipe = useSheetSwipeDismiss({ onClose, enabled: isMobile && isOpen });

  if (!isOpen) return null;

  const isConfigured = copilot.isConfigured;
  const handleAcceptDiff = () => {
    triggerHaptic("success");
    copilot.acceptChange();
  };

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
        className={`jantt-copilot-drawer ${isOpen ? "is-open" : ""} ${
          isMobile ? "is-mobile-sheet" : ""
        } ${swipe.isDragging ? "is-dragging" : ""}`}
        style={isMobile ? swipe.sheetStyle : undefined}
        role="dialog"
        aria-label="Jantt AI Copilot"
        aria-modal="true"
      >
        {isMobile && (
          <div className="copilot-sheet-pull-handle" aria-hidden="true" {...swipe.handleProps} />
        )}

        {/* Drawer Header */}
        <div className="copilot-header" {...(isMobile ? swipe.handleProps : {})}>
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

                 {onOpenPromptModal && (
                   <button
                     type="button"
                     className="copilot-icon-btn"
                     onClick={onOpenPromptModal}
                     title="Prompt reference & JSON schema specification"
                     aria-label="Prompt reference"
                   >
                     <BookOpen size={14} />
                   </button>
                 )}

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
                onAcceptDiff={handleAcceptDiff}
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
                discoveredModelsByAccount={copilot.discoveredModelsByAccount}
                loadingModelsByAccount={copilot.loadingModelsByAccount}
                onRefreshModelsForAccount={copilot.refreshModelsForAccount}
                onRefreshAllModels={copilot.refreshAllAccountModels}
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
