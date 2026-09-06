import React, { useRef } from "react";
import {
  FileJson,
  Zap,
  RotateCcw,
  Copy,
  Check,
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
  Info,
  Upload,
  Download,
  FileSpreadsheet
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
          {handleImportJsonFile && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                accept=".json"
                style={{ display: "none" }}
                onChange={handleImportJsonFile}
              />
              <button
                className="btn-nav"
                style={{ padding: "3px 7px", fontSize: "11px", gap: "4px" }}
                onClick={() => fileInputRef.current?.click()}
                title="Import JSON plan file directly into editor"
              >
                <Upload size={12} />
                <span>Import</span>
              </button>
            </>
          )}
          {handleDownloadJson && (
            <button
              className="btn-nav"
              style={{ padding: "3px 7px", fontSize: "11px", gap: "4px" }}
              onClick={handleDownloadJson}
              title="Download active plan as JSON"
            >
              <Download size={12} />
              <span>JSON</span>
            </button>
          )}
          {handleExportCsv && (
            <button
              className="btn-nav"
              style={{ padding: "3px 7px", fontSize: "11px", gap: "4px" }}
              onClick={handleExportCsv}
              title="Export active plan as CSV"
            >
              <FileSpreadsheet size={12} />
              <span>CSV</span>
            </button>
          )}
          <button className="btn-nav" style={{ padding: "3px 7px", fontSize: "11px" }} onClick={formatJson} title="Format JSON">
            Format
          </button>
          <button className="btn-nav" style={{ padding: "3px 7px", fontSize: "11px" }} onClick={handleResetActiveProject} title="Reset current plan back to saved state or default template">
            <RotateCcw size={12} />
            <span>Reset</span>
          </button>
          <button className="btn-nav" style={{ padding: "3px 7px", fontSize: "11px" }} onClick={handleCopyJson} title="Copy JSON">
            {copiedJson ? <Check size={12} /> : <Copy size={12} />}
            {copiedJson ? "Copied" : "Copy"}
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
