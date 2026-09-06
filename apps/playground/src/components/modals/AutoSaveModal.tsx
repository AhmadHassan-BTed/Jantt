import React from "react";
import {
  Save,
  X,
  CheckCircle2,
  RefreshCw,
  Clock,
  HardDrive,
  ArrowUpFromLine,
  ArrowDownToLine,
  FileSpreadsheet
} from "lucide-react";
import type { AutoSaveInterval } from "../../types";
import { AUTOSAVE_OPTIONS } from "../../constants";

interface AutoSaveModalProps {
  showAutoSaveModal: boolean;
  setShowAutoSaveModal: (show: boolean) => void;
  saveStatus: "saved" | "saving" | "pending";
  lastSavedAt: Date;
  handleManualSaveNow: () => void;
  autoSaveInterval: AutoSaveInterval;
  setAutoSaveInterval: (interval: AutoSaveInterval) => void;
  storageSizeKb: string;
  onImportJson?: () => void;
  onExportJson?: () => void;
  onExportCsv?: () => void;
}

export const AutoSaveModal: React.FC<AutoSaveModalProps> = ({
  showAutoSaveModal,
  setShowAutoSaveModal,
  saveStatus,
  lastSavedAt,
  handleManualSaveNow,
  autoSaveInterval,
  setAutoSaveInterval,
  storageSizeKb,
  onImportJson,
  onExportJson,
  onExportCsv
}) => {
  if (!showAutoSaveModal) return null;

  return (
    <div className="prompt-modal-backdrop" onClick={() => setShowAutoSaveModal(false)}>
      <div
        className="settings-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Icon Box & Version Pill */}
        <div className="prompt-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div className="settings-header-icon">
              <Save size={18} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "var(--jantt-text)" }}>
                  Auto-Save Settings
                </h3>
                <span className="brand-badge" style={{ fontSize: "11px", padding: "2px 8px" }}>
                  v1.1.1
                </span>
              </div>
              <p style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)", margin: "2px 0 0 0" }}>
                Configure automatic persistence and review client storage
              </p>
            </div>
          </div>
          <button
            type="button"
            className="prompt-modal-close-btn"
            onClick={() => setShowAutoSaveModal(false)}
            title="Close Settings (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="prompt-modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "18px 22px" }}>
          {/* Status Hero Card */}
          <div className={`settings-hero-card is-${saveStatus}`}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {saveStatus === "saved" ? (
                <CheckCircle2 size={22} style={{ color: "#10B981", flexShrink: 0 }} />
              ) : saveStatus === "saving" ? (
                <RefreshCw size={22} className="spin-sync-icon" style={{ color: "var(--jantt-accent)", flexShrink: 0 }} />
              ) : (
                <Clock size={22} style={{ color: "#F59E0B", flexShrink: 0 }} />
              )}
              <div>
                <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--jantt-text)", lineHeight: 1.2 }}>
                  {saveStatus === "saved"
                    ? "All changes saved"
                    : saveStatus === "saving"
                    ? "Saving changes..."
                    : "Pending unsaved changes"}
                </div>
                <div style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
                  Last saved: {lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
              </div>
            </div>

            <button
              type="button"
              className="btn-nav btn-nav-primary"
              onClick={handleManualSaveNow}
              style={{
                fontSize: "12px",
                padding: "0 12px",
                height: "30px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                borderRadius: "8px",
                fontWeight: 600
              }}
              title="Force an immediate save to permanent browser storage"
            >
              <Save size={13} />
              <span>Save Now</span>
            </button>
          </div>

          {/* Cadence Selector */}
          <div>
            <div className="settings-section-title">
              Auto-Save Cadence
            </div>
            <div className="settings-cadence-list">
              {AUTOSAVE_OPTIONS.map((opt) => {
                const isSelected = autoSaveInterval === opt.id;
                return (
                  <div
                    key={opt.id}
                    className={`settings-cadence-item ${isSelected ? "is-selected" : ""}`}
                    onClick={() => setAutoSaveInterval(opt.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setAutoSaveInterval(opt.id);
                      }
                    }}
                  >
                    {/* Custom Styled Radio Indicator */}
                    <div className="settings-radio-indicator">
                      <div className="settings-radio-inner-dot" />
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--jantt-text)" }}>
                          {opt.label}
                        </span>
                        {opt.recommended && (
                          <span className="settings-badge-rec">
                            Recommended
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)", marginTop: "2px", lineHeight: 1.3 }}>
                        {opt.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Diagnostic Storage Card */}
          <div className="settings-storage-card">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <HardDrive size={15} style={{ color: "var(--jantt-accent)" }} />
              <div>
                <span style={{ fontWeight: 600, color: "var(--jantt-text)" }}>
                  Browser LocalStorage
                </span>
                <span style={{ display: "block", fontSize: "10.5px", color: "var(--jantt-text-muted)" }}>
                  Offline-first persistent storage
                </span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontFamily: "var(--jantt-font-mono, monospace)",
                  fontWeight: 700,
                  color: "var(--jantt-accent, #38BDF8)",
                  fontSize: "12px",
                  background: "var(--jantt-accent-glow, rgba(56, 189, 248, 0.1))",
                  border: "1px solid var(--jantt-border, rgba(56, 189, 248, 0.2))",
                  padding: "3px 8px",
                  borderRadius: "6px"
                }}
              >
                ~{storageSizeKb} KB
              </span>
            </div>
          </div>

          {/* Data Import & Export Section */}
          {(onImportJson || onExportJson || onExportCsv) && (
            <div style={{ marginTop: "16px" }}>
              <div className="settings-section-title">Project Data &amp; Export</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                {onImportJson && (
                  <button
                    type="button"
                    className="btn-nav"
                    onClick={() => {
                      setShowAutoSaveModal(false);
                      onImportJson();
                    }}
                    style={{ justifyContent: "center", height: "34px", padding: "0 8px" }}
                    title="Upload and load a Jantt JSON file"
                  >
                    <ArrowUpFromLine size={13} />
                    <span style={{ fontSize: "11.5px" }}>Import JSON</span>
                  </button>
                )}
                {onExportJson && (
                  <button
                    type="button"
                    className="btn-nav"
                    onClick={onExportJson}
                    style={{ justifyContent: "center", height: "34px", padding: "0 8px" }}
                    title="Download project as JSON"
                  >
                    <ArrowDownToLine size={13} />
                    <span style={{ fontSize: "11.5px" }}>Export JSON</span>
                  </button>
                )}
                {onExportCsv && (
                  <button
                    type="button"
                    className="btn-nav"
                    onClick={onExportCsv}
                    style={{ justifyContent: "center", height: "34px", padding: "0 8px" }}
                    title="Download tasks as CSV"
                  >
                    <FileSpreadsheet size={13} />
                    <span style={{ fontSize: "11.5px" }}>Export CSV</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="prompt-modal-footer">
          <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
            Press <kbd style={{ padding: "1px 4px", borderRadius: "4px", background: "var(--jantt-surface-solid)", border: "1px solid var(--jantt-border)" }}>Esc</kbd> to close
          </span>
          <button
            type="button"
            className="btn-nav btn-nav-primary"
            onClick={() => setShowAutoSaveModal(false)}
            style={{ padding: "0 18px", height: "32px" }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
