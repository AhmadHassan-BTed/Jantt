import React, { useState } from "react";
import { Sparkles, X, Settings, Trash2, ArrowLeft, BookOpen } from "lucide-react";
import type { UseCopilotReturn } from "../../hooks/useCopilot";
import { useSheetSwipeDismiss } from "../../hooks/useSheetSwipeDismiss";
import { triggerHaptic } from "../../services/platform";
import { useI18n } from "../../i18n/I18nProvider";
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
  const { t } = useI18n();
  const [showSettings, setShowSettings] = useState(false);
  const drawer = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    if (!isOpen || !isMobile) return;
    const opener = document.activeElement as HTMLElement | null;
    const panel = drawer.current;
    if (!panel) return;
    panel.focus({ preventScroll: true });
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panel.contains(e.target as Node)) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex='0']"))
        .filter(control => control.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault(); last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first?.focus();
      }
    };
    panel.addEventListener("keydown", trap);
    return () => {
      panel.removeEventListener("keydown", trap);
      if (opener?.isConnected && document.activeElement === document.body) opener.focus({ preventScroll: true });
    };
  }, [isOpen, isMobile]);
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
          style={swipe.backdropStyle}
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
        ref={drawer}
        tabIndex={-1}
        role="dialog"
        aria-label={t("copilot.title")}
        aria-modal={isMobile || undefined}
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
              title={t("copilot.backToConversation")}
              aria-label={t("copilot.backToConversation")}
            >
              <ArrowLeft size={15} />
            </button>
          ) : (
            <div className="copilot-header-brand">
              <Sparkles size={16} className="copilot-sparkle-icon" />
              <h2>{t("copilot.title")}</h2>
            </div>
          )}

          <div className="copilot-header-actions">
            {!showSettings && (
              <>
                 {onOpenPromptModal && (
                   <button
                     type="button"
                     className="copilot-icon-btn"
                     onClick={onOpenPromptModal}
                     title={t("copilot.promptReferenceTitle")}
                     aria-label={t("copilot.promptReference")}
                   >
                     <BookOpen size={14} />
                   </button>
                 )}

                <button
                  type="button"
                  className="copilot-icon-btn"
                  onClick={copilot.clearHistory}
                  title={t("copilot.clearConversation")}
                  aria-label={t("copilot.clearConversation")}
                  disabled={copilot.messages.length === 0}
                >
                  <Trash2 size={14} />
                </button>
                <button
                  type="button"
                  className="copilot-icon-btn"
                  onClick={() => setShowSettings(true)}
                  title={t("copilot.settings")}
                  aria-label={t("copilot.settings")}
                >
                  <Settings size={14} />
                </button>
              </>
            )}
            <button
              type="button"
              className="copilot-icon-btn is-close"
              onClick={onClose}
              title={t("copilot.closeTitle")}
              aria-label={t("copilot.close")}
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
                readOnly={copilot.isReadOnly}
                stale={copilot.isProposalStale}
                onAcceptDiff={handleAcceptDiff}
                onRejectDiff={copilot.rejectChange}
                onRevertDiff={copilot.revertChange}
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
