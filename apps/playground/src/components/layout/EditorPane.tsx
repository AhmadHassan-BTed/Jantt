import React, { useRef, useState, useEffect } from "react";
import {
  FileJson,
  Zap,
  RotateCcw,
  Copy,
  Check,
  ChevronLeft,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Info,
  Upload,
  FileSpreadsheet,
  ArrowDownUp,
  AlignLeft,
  X,
  Eye,
  KeyRound,
  LogIn
} from "lucide-react";
import type { JanttData, ValidationResult } from "@jantt/core";
import { ConfirmDialog } from "../modals/ModalHost";
import { useI18n } from "../../i18n/I18nProvider";
import { validationMessage } from "../../i18n/diagnostics";

interface EditorPaneProps {
  isSidebarCollapsed: boolean;
  sidebarWidth: number;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  isLiveSyncing: boolean;
  jsonText: string;
  parsedData: JanttData | null;
  validationResult: ValidationResult & { syntaxError?: boolean };
  formatJson: () => void;
  handleResetActiveProject: () => void;
  handleCopyJson: () => void;
  copiedJson: boolean;
  handleEditorChange: (text: string) => void;
  handleImportJsonFile?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDownloadJson?: () => void;
  handleExportCsv?: () => void;
  isMobile?: boolean;
  isViewer?: boolean;
  onPromptFork?: () => void;
  isPendingLoginEditor?: boolean;
  onOpenEditorLogin?: () => void;
}

/** Accepted by the shared importer (JSON, MS Project XML, Primavera XER, CSV). */
const IMPORT_ACCEPT = ".json,.xml,.xer,.csv,application/json,text/xml,text/csv";

/** Keys that would modify text; viewers pressing them get the "make a local copy" prompt. */
function isEditingKey(e: React.KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  return e.key.length === 1 || e.key === "Backspace" || e.key === "Delete" || e.key === "Enter";
}

export const EditorPane: React.FC<EditorPaneProps> = ({
  isSidebarCollapsed,
  sidebarWidth,
  setIsSidebarCollapsed,
  isLiveSyncing,
  jsonText,
  parsedData,
  validationResult,
  formatJson,
  handleResetActiveProject,
  handleCopyJson,
  copiedJson,
  handleEditorChange,
  handleImportJsonFile,
  handleDownloadJson,
  handleExportCsv,
  isMobile,
  isViewer = false,
  onPromptFork,
  isPendingLoginEditor = false,
  onOpenEditorLogin
}) => {
  const { t, locale } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showImportExportMenu, setShowImportExportMenu] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const importExportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showImportExportMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (importExportMenuRef.current && !importExportMenuRef.current.contains(e.target as Node)) {
        setShowImportExportMenu(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowImportExportMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showImportExportMenu]);

  const isCompact = isMobile || sidebarWidth < 510;
  const isNarrow = !isMobile && sidebarWidth < 310;

  return (
    <section
      id="editor-pane"
      className={`editor-pane ${isSidebarCollapsed ? "is-collapsed" : ""} ${isCompact ? "is-compact" : ""} ${isNarrow ? "is-narrow" : ""}`}
      style={{ width: isSidebarCollapsed ? "0px" : `${sidebarWidth}px` }}
      aria-label={t("editor.paneAria")}
      aria-hidden={isSidebarCollapsed || undefined}
      // A collapsed editor must leave the tab order and the accessibility tree entirely.
      {...({ inert: isSidebarCollapsed ? "" : undefined } as Record<string, unknown>)}
    >
      <div className="pane-header">
        <div className="pane-title" title={t("editor.paneTitle")}>
          <FileJson size={15} className="pane-title-icon" aria-hidden="true" />
          <span className="pane-title-text">{t("editor.jsonPlan")}</span>
          {isLiveSyncing && (
            <span className="sync-pulse-badge" title={t("editor.liveSyncedTitle")}>
              <Zap size={11} />
              <span className="pane-btn-label">{t("editor.liveSynced")}</span>
            </span>
          )}
        </div>

        <div className="pane-actions">
          {/* Consolidated Import / Export Dropdown with Sub-Popup */}
          <div ref={importExportMenuRef} className="editor-import-export-wrap">
            {handleImportJsonFile && (
              <input
                type="file"
                ref={fileInputRef}
                accept={IMPORT_ACCEPT}
                style={{ display: "none" }}
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  setShowImportExportMenu(false);
                  handleImportJsonFile(e);
                  e.target.value = "";
                }}
              />
            )}
            <button
              type="button"
              className={`btn-nav pane-action-btn ${showImportExportMenu ? "is-open" : ""}`}
              onClick={() => setShowImportExportMenu((prev) => !prev)}
              title={t("editor.importExportTitle")}
              aria-label={t("editor.importExportTitle")}
              aria-haspopup="menu"
              aria-expanded={showImportExportMenu}
            >
              <ArrowDownUp size={13} style={{ color: "#38BDF8" }} aria-hidden="true" />
              <span className="pane-btn-label">{t("editor.importExport")}</span>
              <ChevronDown
                size={11}
                style={{
                  opacity: 0.7,
                  transform: showImportExportMenu ? "rotate(180deg)" : "none",
                  transition: "transform 0.15s ease"
                }}
                aria-hidden="true"
              />
            </button>

            {showImportExportMenu && (
              <div
                className="editor-import-export-popup"
                role="menu"
                aria-label={t("editor.importExportAria")}
              >
                {/* 1. Import JSON Plan */}
                {handleImportJsonFile && (
                  <button
                    type="button"
                    className="editor-popup-item"
                    role="menuitem"
                    onClick={() => {
                      setShowImportExportMenu(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    <Upload size={13} style={{ color: "#38BDF8", flexShrink: 0 }} aria-hidden="true" />
                    <span>{t("editor.importFile")}</span>
                  </button>
                )}

                <div className="editor-popup-divider" />

                {/* 2. Export as JSON */}
                {handleDownloadJson && (
                  <button
                    type="button"
                    className="editor-popup-item"
                    role="menuitem"
                    onClick={() => {
                      setShowImportExportMenu(false);
                      handleDownloadJson();
                    }}
                  >
                    <FileJson size={13} style={{ color: "#34D399", flexShrink: 0 }} aria-hidden="true" />
                    <span>{t("editor.exportJson")}</span>
                  </button>
                )}

                {/* 3. Export as CSV */}
                {handleExportCsv && (
                  <button
                    type="button"
                    className="editor-popup-item"
                    role="menuitem"
                    onClick={() => {
                      setShowImportExportMenu(false);
                      handleExportCsv();
                    }}
                  >
                    <FileSpreadsheet size={13} style={{ color: "#FBBF24", flexShrink: 0 }} aria-hidden="true" />
                    <span>{t("editor.exportCsv")}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn-nav pane-action-btn"
            onClick={formatJson}
            title={t("editor.formatJson")}
            aria-label={t("editor.formatJson")}
            disabled={isViewer}
          >
            <AlignLeft size={13} aria-hidden="true" />
            <span className="pane-btn-label">{t("editor.format")}</span>
          </button>
          <button
            type="button"
            className="btn-nav pane-action-btn"
            onClick={() => setConfirmReset(true)}
            title={t("editor.resetTitle")}
            aria-label={t("editor.resetAria")}
            disabled={isViewer}
          >
            <RotateCcw size={13} aria-hidden="true" />
            <span className="pane-btn-label">{t("common.reset")}</span>
          </button>
          <button
            type="button"
            className="btn-nav pane-action-btn"
            onClick={handleCopyJson}
            title={copiedJson ? t("editor.copiedJson") : t("editor.copyJson")}
            aria-label={copiedJson ? t("editor.copiedJson") : t("editor.copyJson")}
          >
            {copiedJson ? (
              <Check size={13} style={{ color: "#10B981" }} aria-hidden="true" />
            ) : (
              <Copy size={13} aria-hidden="true" />
            )}
            <span className="pane-btn-label">{copiedJson ? t("editor.copied") : t("editor.copy")}</span>
          </button>
        </div>

        <button
          type="button"
          className="btn-nav pane-collapse-btn"
          onClick={() => setIsSidebarCollapsed(true)}
          title={isMobile ? t("editor.closeEditorTitle") : t("editor.collapseSidebarTitle")}
          aria-label={isMobile ? t("editor.closeEditorAria") : t("editor.collapseSidebarAria")}
          aria-controls="editor-pane"
          aria-expanded="true"
        >
          {isMobile ? (
            <>
              <X size={13} aria-hidden="true" />
              <span>{t("common.close")}</span>
            </>
          ) : (
            <ChevronLeft size={14} aria-hidden="true" />
          )}
        </button>
      </div>

      {isViewer && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px",
            background: isPendingLoginEditor ? "rgba(56, 189, 248, 0.12)" : "rgba(245, 158, 11, 0.12)",
            borderBottom: isPendingLoginEditor ? "1px solid rgba(56, 189, 248, 0.3)" : "1px solid rgba(245, 158, 11, 0.3)",
            fontSize: "11.5px",
            color: isPendingLoginEditor ? "#38bdf8" : "#f59e0b",
            flexShrink: 0
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {isPendingLoginEditor ? <KeyRound size={13} style={{ flexShrink: 0 }} /> : <Eye size={13} style={{ flexShrink: 0 }} />}
            <span>
              {isPendingLoginEditor ? (
                <>
                  <strong>{t("editor.invitationTitle")}</strong> {t("editor.invitationBody")}
                </>
              ) : (
                <>
                  <strong>{t("editor.readOnlyTitle")}</strong> {t("editor.readOnlyBody")}
                </>
              )}
            </span>
          </div>
          {isPendingLoginEditor && onOpenEditorLogin ? (
            <button
              type="button"
              onClick={onOpenEditorLogin}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "2px 8px",
                fontSize: "11px",
                fontWeight: 700,
                borderRadius: "6px",
                background: "linear-gradient(135deg, #0ea5e9, #6366f1)",
                color: "#ffffff",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
              title={t("editor.signInToEditTitle")}
            >
              <LogIn size={11} />
              <span>{t("editor.signInToEdit")}</span>
            </button>
          ) : onPromptFork ? (
            <button
              type="button"
              onClick={onPromptFork}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "2px 8px",
                fontSize: "11px",
                fontWeight: 600,
                borderRadius: "6px",
                background: "#f59e0b",
                color: "#0f172a",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
              title={t("editor.makeLocalCopyTitle")}
            >
              <Copy size={11} />
              <span>{t("editor.makeLocalCopy")}</span>
            </button>
          ) : null}
        </div>
      )}

      <div className={`editor-wrapper ${isLiveSyncing ? "is-live-updating" : ""}`}>
        <textarea
          id="json-editor-textarea"
          className={`code-textarea ${isLiveSyncing ? "is-live-glowing" : ""}`}
          value={jsonText}
          readOnly={isViewer}
          aria-label={t("editor.planJsonAria")}
          aria-invalid={!validationResult.valid}
          aria-describedby="diagnostics-panel"
          onChange={(e) => {
            if (isViewer) return;
            handleEditorChange(e.target.value);
          }}
          // Viewers can select and copy freely; only an actual edit attempt asks to make a copy.
          onKeyDown={(e) => {
            if (isViewer && isEditingKey(e)) {
              e.preventDefault();
              onPromptFork?.();
            }
          }}
          onPaste={(e) => {
            if (isViewer) {
              e.preventDefault();
              onPromptFork?.();
            }
          }}
          onCut={(e) => {
            if (isViewer) {
              e.preventDefault();
              onPromptFork?.();
            }
          }}
          onDrop={(e) => {
            if (isViewer) {
              e.preventDefault();
              onPromptFork?.();
            }
          }}
          spellCheck={false}
          placeholder={t("editor.placeholder")}
        />
      </div>

      {/* Real-time Diagnostics Bar */}
      <div className="diagnostics-panel" id="diagnostics-panel" aria-live="polite">
        <div className="diagnostics-title">
          {validationResult.valid ? (
            <>
              <CheckCircle2 size={16} className="diag-valid" />
              <span className="diag-valid">{t("editor.validPlan", { count: parsedData?.tasks?.length || 0 })}</span>
            </>
          ) : (
            <>
              <AlertTriangle size={16} className="diag-invalid" />
              <span className="diag-invalid">{t("editor.schemaIssues", { count: validationResult.errors.length })}</span>
            </>
          )}
        </div>

        {!validationResult.valid && (
          <div className="error-list">
            {validationResult.errors.map((err, idx) => (
              <div key={idx} className="error-card">
                <div className="error-msg">
                  <strong>{err.path}:</strong> {validationMessage(err, validationResult.syntaxError, locale, t)}
                </div>
                {locale === "en" ? err.suggestion && (
                  <div className="error-suggestion" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Info size={14} style={{ flexShrink: 0 }} />
                    <span>{err.suggestion}</span>
                  </div>
                ) : (
                  <details>
                    <summary>{t("editor.diagnostics.technicalDetails")}</summary>
                    <div lang="en">{err.message}{err.suggestion && ` ${err.suggestion}`}</div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmReset && (
        <ConfirmDialog
          title={t("editor.resetConfirmTitle")}
          tone="danger"
          confirmLabel={t("editor.discardEdits")}
          message={t("editor.resetConfirmMessage")}
          onConfirm={() => {
            setConfirmReset(false);
            handleResetActiveProject();
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </section>
  );
};
