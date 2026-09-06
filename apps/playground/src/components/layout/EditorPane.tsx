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
  ArrowDownUp
} from "lucide-react";
import type { JanttData, ValidationResult } from "@jantt/core";

interface EditorPaneProps {
  isSidebarCollapsed: boolean;
  sidebarWidth: number;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  isLiveSyncing: boolean;
  jsonText: string;
  parsedData: JanttData | null;
  validationResult: ValidationResult;
  formatJson: () => void;
  handleResetActiveProject: () => void;
  handleCopyJson: () => void;
  copiedJson: boolean;
  handleEditorChange: (text: string) => void;
  handleImportJsonFile?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDownloadJson?: () => void;
  handleExportCsv?: () => void;
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
  handleExportCsv
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showImportExportMenu, setShowImportExportMenu] = useState(false);
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

  return (
    <section
      id="editor-pane"
      className={`editor-pane ${isSidebarCollapsed ? "is-collapsed" : ""}`}
      style={{ width: isSidebarCollapsed ? "0px" : `${sidebarWidth}px` }}
    >
      <div className="pane-header">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <FileJson size={15} />
          <span>JSON State (Source of Truth)</span>
          {isLiveSyncing && (
            <span className="sync-pulse-badge">
              <Zap size={11} />
              <span>Live Synced</span>
            </span>
          )}
        </div>
        <div className="pane-actions">
          {/* Consolidated Import / Export Dropdown with Sub-Popup */}
          <div ref={importExportMenuRef} style={{ position: "relative" }}>
            {handleImportJsonFile && (
              <input
                type="file"
                ref={fileInputRef}
                accept=".json"
                style={{ display: "none" }}
                onChange={(e) => {
                  setShowImportExportMenu(false);
                  handleImportJsonFile(e);
                }}
              />
            )}
            <button
              type="button"
              className={`btn-nav ${showImportExportMenu ? "btn-nav-primary" : ""}`}
              style={{ padding: "3px 8px", fontSize: "11px", gap: "5px", display: "flex", alignItems: "center" }}
              onClick={() => setShowImportExportMenu((prev) => !prev)}
              title="Import or export plan data"
            >
              <ArrowDownUp size={12} />
              <span>Import / Export</span>
              <ChevronDown
                size={11}
                style={{
                  opacity: 0.7,
                  transform: showImportExportMenu ? "rotate(180deg)" : "none",
                  transition: "transform 0.15s ease"
                }}
              />
            </button>

            {showImportExportMenu && (
              <div
                className="editor-import-export-popup"
                style={{
                  position: "absolute",
                  top: "calc(100% + 5px)",
                  right: 0,
                  zIndex: 100,
                  minWidth: "210px",
                  background: "var(--jantt-surface-elevated, #1e293b)",
                  border: "1px solid var(--jantt-border, rgba(255, 255, 255, 0.14))",
                  borderRadius: "8px",
                  boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)",
                  padding: "6px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                  backdropFilter: "blur(12px)"
                }}
              >
                {/* 1. Import JSON Plan */}
                {handleImportJsonFile && (
                  <button
                    type="button"
                    className="editor-popup-item"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      width: "100%",
                      padding: "7px 10px",
                      fontSize: "12px",
                      color: "var(--jantt-text, #f8fafc)",
                      background: "transparent",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      textAlign: "left"
                    }}
                    onClick={() => {
                      setShowImportExportMenu(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    <Upload size={13} style={{ color: "var(--jantt-accent, #38BDF8)", flexShrink: 0 }} />
                    <span style={{ fontWeight: 500 }}>Import JSON Plan (.json)</span>
                  </button>
                )}

                <div
                  style={{
                    height: "1px",
                    background: "var(--jantt-border, rgba(255, 255, 255, 0.08))",
                    margin: "3px 4px"
                  }}
                />

                {/* 2. Export as JSON */}
                {handleDownloadJson && (
                  <button
                    type="button"
                    className="editor-popup-item"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      width: "100%",
                      padding: "7px 10px",
                      fontSize: "12px",
                      color: "var(--jantt-text, #f8fafc)",
                      background: "transparent",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      textAlign: "left"
                    }}
                    onClick={() => {
                      setShowImportExportMenu(false);
                      handleDownloadJson();
                    }}
                  >
                    <FileJson size={13} style={{ color: "#34D399", flexShrink: 0 }} />
                    <span style={{ fontWeight: 500 }}>Export as JSON (.json)</span>
                  </button>
                )}

                {/* 3. Export as CSV */}
                {handleExportCsv && (
                  <button
                    type="button"
                    className="editor-popup-item"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      width: "100%",
                      padding: "7px 10px",
                      fontSize: "12px",
                      color: "var(--jantt-text, #f8fafc)",
                      background: "transparent",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      textAlign: "left"
                    }}
                    onClick={() => {
                      setShowImportExportMenu(false);
                      handleExportCsv();
                    }}
                  >
                    <FileSpreadsheet size={13} style={{ color: "#FBBF24", flexShrink: 0 }} />
                    <span style={{ fontWeight: 500 }}>Export as CSV (.csv)</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <button className="btn-nav" style={{ padding: "3px 7px", fontSize: "11px" }} onClick={formatJson} title="Format JSON">
            Format
          </button>
          <button className="btn-nav" style={{ padding: "3px 7px", fontSize: "11px" }} onClick={handleResetActiveProject} title="Reset current plan back to saved state or default template">
            <RotateCcw size={12} />
            <span>Reset</span>
          </button>
          <button className="btn-nav" style={{ padding: "3px 7px", fontSize: "11px" }} onClick={handleCopyJson} title="Copy JSON">
            {copiedJson ? <Check size={12} /> : <Copy size={12} />}
            <span>{copiedJson ? "Copied" : "Copy"}</span>
          </button>
          <button
            className="btn-nav"
            style={{ padding: "3px 6px", fontSize: "11px" }}
            onClick={() => setIsSidebarCollapsed(true)}
            title="Collapse JSON Sidebar"
          >
            <ChevronLeft size={13} />
          </button>
        </div>
      </div>

      <div className={`editor-wrapper ${isLiveSyncing ? "is-live-updating" : ""}`}>
        <textarea
          id="json-editor-textarea"
          className={`code-textarea ${isLiveSyncing ? "is-live-glowing" : ""}`}
          value={jsonText}
          onChange={(e) => handleEditorChange(e.target.value)}
          spellCheck={false}
          placeholder="Paste or write your Jantt JSON plan here..."
        />
      </div>

      {/* Real-time Diagnostics Bar */}
      <div className="diagnostics-panel" id="diagnostics-panel">
        <div className="diagnostics-title">
          {validationResult.valid ? (
            <>
              <CheckCircle2 size={16} className="diag-valid" />
              <span className="diag-valid">Valid Jantt Plan ({parsedData?.tasks?.length || 0} tasks)</span>
            </>
          ) : (
            <>
              <AlertTriangle size={16} className="diag-invalid" />
              <span className="diag-invalid">{validationResult.errors.length} Schema Issue(s) Found</span>
            </>
          )}
        </div>

        {!validationResult.valid && (
          <div className="error-list">
            {validationResult.errors.map((err, idx) => (
              <div key={idx} className="error-card">
                <div className="error-msg">
                  <strong>{err.path}:</strong> {err.message}
                </div>
                {err.suggestion && (
                  <div className="error-suggestion" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Info size={14} style={{ flexShrink: 0 }} />
                    <span>{err.suggestion}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
