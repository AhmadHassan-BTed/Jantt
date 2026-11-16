import React, { useRef } from "react";
import {
  Save,
  CheckCircle2,
  RefreshCw,
  Clock,
  HardDrive,
  ArrowUpFromLine,
  ArrowDownToLine,
  FileSpreadsheet,
  AlertTriangle
} from "lucide-react";
import { Modal, ModalHeader } from "./ModalHost";
import type { AutoSaveInterval } from "../../types";
import { AUTOSAVE_OPTIONS } from "../../constants";

/** "error" means the last save did not reach persistent browser storage (e.g. quota exceeded). */
export type AutoSaveStatus = "saved" | "saving" | "pending" | "error";

interface AutoSaveModalProps {
  showAutoSaveModal: boolean;
  setShowAutoSaveModal: (show: boolean) => void;
  saveStatus: AutoSaveStatus;
  /** null when nothing has been saved yet in this session. */
  lastSavedAt: Date | null;
  /** Human-readable reason for a failed save, shown with the "error" status. */
  saveError?: string | null;
  handleManualSaveNow: () => void;
  autoSaveInterval: AutoSaveInterval;
  setAutoSaveInterval: (interval: AutoSaveInterval) => void;
  storageSizeKb: string;
  onImportJson?: () => void;
  onExportJson?: () => void;
  onExportCsv?: () => void;
}

const STATUS_COPY: Record<AutoSaveStatus, { title: string; color: string }> = {
  saved: { title: "All changes saved", color: "#10B981" },
  saving: { title: "Saving changes...", color: "var(--jantt-accent)" },
  pending: { title: "Unsaved changes", color: "#F59E0B" },
  error: { title: "Changes are NOT saved", color: "#EF4444" }
};

const exportButtonStyle: React.CSSProperties = { justifyContent: "center", height: "34px", padding: "0 8px" };

export const AutoSaveModal: React.FC<AutoSaveModalProps> = ({
  showAutoSaveModal,
  setShowAutoSaveModal,
  saveStatus,
  lastSavedAt,
  saveError,
  handleManualSaveNow,
  autoSaveInterval,
  setAutoSaveInterval,
  storageSizeKb,
  onImportJson,
  onExportJson,
  onExportCsv
}) => {
  const cadenceRefs = useRef<(HTMLDivElement | null)[]>([]);

  if (!showAutoSaveModal) return null;

  const close = () => setShowAutoSaveModal(false);
  // useAutoSave keeps a failed write "pending" (it is retried) and reports the failure through saveError.
  const effectiveStatus: AutoSaveStatus = saveError && saveStatus !== "saving" ? "error" : saveStatus;
  const status = STATUS_COPY[effectiveStatus] ?? STATUS_COPY.pending;
  const isOff = autoSaveInterval === "off";

  const lastSavedText = lastSavedAt
    ? `Last saved: ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
    : "Not saved yet in this session";

  const statusDetail =
    effectiveStatus === "error"
      ? saveError || "Browser storage rejected the save (it may be full). Export a JSON backup now to avoid losing work."
      : effectiveStatus === "pending" && isOff
      ? `Auto-save is off. Click Save Now to keep your changes. ${lastSavedText}.`
      : lastSavedText;

  const selectedIndex = Math.max(0, AUTOSAVE_OPTIONS.findIndex((opt) => opt.id === autoSaveInterval));

  // Radio-group keyboard model: arrows move and select, focus follows the selection.
  const handleCadenceKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, index: number) => {
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (index + 1) % AUTOSAVE_OPTIONS.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (index - 1 + AUTOSAVE_OPTIONS.length) % AUTOSAVE_OPTIONS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = AUTOSAVE_OPTIONS.length - 1;
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      setAutoSaveInterval(AUTOSAVE_OPTIONS[index].id);
      return;
    }
    if (next < 0) return;
    e.preventDefault();
    setAutoSaveInterval(AUTOSAVE_OPTIONS[next].id);
    cadenceRefs.current[next]?.focus();
  };

  return (
    <Modal onClose={close} maxWidth={520}>
      <ModalHeader
        icon={<Save size={18} />}
        title="Auto-Save Settings"
        subtitle="Choose how often plans are saved to this browser"
      />

      {/* Modal Body */}
      <div className="prompt-modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "18px 22px" }}>
        {/* Status Hero Card */}
        <div
          className={`settings-hero-card is-${effectiveStatus === "error" ? "pending" : effectiveStatus}`}
          style={
            effectiveStatus === "error"
              ? { background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.35)", flexWrap: "wrap" }
              : { flexWrap: "wrap" }
          }
        >
          <div role="status" style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: "1 1 220px" }}>
            {effectiveStatus === "saved" ? (
              <CheckCircle2 size={22} style={{ color: status.color, flexShrink: 0 }} />
            ) : effectiveStatus === "saving" ? (
              <RefreshCw size={22} className="spin-sync-icon" style={{ color: status.color, flexShrink: 0 }} />
            ) : effectiveStatus === "error" ? (
              <AlertTriangle size={22} style={{ color: status.color, flexShrink: 0 }} />
            ) : (
              <Clock size={22} style={{ color: status.color, flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--jantt-text)", lineHeight: 1.2 }}>
                {status.title}
              </div>
              <div style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
                {statusDetail}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            {effectiveStatus === "error" && onExportJson && (
              <button
                type="button"
                className="btn-nav"
                onClick={onExportJson}
                style={{ fontSize: "12px", padding: "0 12px", height: "30px", borderRadius: "8px" }}
                title="Download the current plan as a JSON backup"
              >
                <ArrowDownToLine size={13} />
                <span>Export Backup</span>
              </button>
            )}
            <button
              type="button"
              className="btn-nav btn-nav-primary"
              onClick={handleManualSaveNow}
              disabled={effectiveStatus === "saving"}
              style={{
                fontSize: "12px",
                padding: "0 12px",
                height: "30px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                borderRadius: "8px",
                fontWeight: 600,
                opacity: effectiveStatus === "saving" ? 0.6 : 1
              }}
              title="Save to browser storage now"
            >
              <Save size={13} />
              <span>{effectiveStatus === "error" ? "Retry Save" : "Save Now"}</span>
            </button>
          </div>
        </div>

        {/* Cadence Selector */}
        <div>
          <div className="settings-section-title" id="autosave-cadence-label">
            Save Frequency
          </div>
          <div className="settings-cadence-list" role="radiogroup" aria-labelledby="autosave-cadence-label">
            {AUTOSAVE_OPTIONS.map((opt, index) => {
              const isSelected = autoSaveInterval === opt.id;
              return (
                <div
                  key={opt.id}
                  ref={(el) => {
                    cadenceRefs.current[index] = el;
                  }}
                  className={`settings-cadence-item ${isSelected ? "is-selected" : ""}`}
                  onClick={() => setAutoSaveInterval(opt.id)}
                  role="radio"
                  aria-checked={isSelected}
                  aria-describedby={`autosave-opt-${opt.id}-desc`}
                  tabIndex={index === selectedIndex ? 0 : -1}
                  onKeyDown={(e) => handleCadenceKeyDown(e, index)}
                >
                  {/* Custom Styled Radio Indicator */}
                  <div className="settings-radio-indicator" aria-hidden="true">
                    <div className="settings-radio-inner-dot" />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--jantt-text)" }}>
                        {opt.label}
                      </span>
                      {opt.recommended && (
                        <span className="settings-badge-rec">
                          Recommended
                        </span>
                      )}
                    </div>
                    <div id={`autosave-opt-${opt.id}-desc`} style={{ fontSize: "11px", color: "var(--jantt-text-muted)", marginTop: "2px", lineHeight: 1.3 }}>
                      {opt.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Diagnostic Storage Card */}
        <div className="settings-storage-card" style={{ flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <HardDrive size={15} style={{ color: "var(--jantt-accent)", flexShrink: 0 }} />
            <div>
              <span style={{ fontWeight: 600, color: "var(--jantt-text)" }}>
                Browser Storage
              </span>
              <span style={{ display: "block", fontSize: "10.5px", color: "var(--jantt-text-muted)" }}>
                Plans live only in this browser on this device. Export JSON to back them up.
              </span>
            </div>
          </div>
          <span
            title="Approximate space used by Jantt in this browser's localStorage"
            style={{
              fontFamily: "var(--jantt-font-mono, monospace)",
              fontWeight: 700,
              color: "var(--jantt-accent, #38BDF8)",
              fontSize: "12px",
              background: "var(--jantt-accent-glow, rgba(56, 189, 248, 0.1))",
              border: "1px solid var(--jantt-border, rgba(56, 189, 248, 0.2))",
              padding: "3px 8px",
              borderRadius: "6px",
              flexShrink: 0
            }}
          >
            ~{storageSizeKb} KB used
          </span>
        </div>

        {/* Data Import & Export Section */}
        {(onImportJson || onExportJson || onExportCsv) && (
          <div>
            <div className="settings-section-title">Import &amp; Export</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "8px" }}>
              {onImportJson && (
                <button
                  type="button"
                  className="btn-nav"
                  onClick={() => {
                    close();
                    onImportJson();
                  }}
                  style={exportButtonStyle}
                  title="Open a JSON, MS Project XML, Primavera XER or CSV file as a new plan"
                >
                  <ArrowUpFromLine size={13} />
                  <span style={{ fontSize: "11.5px" }}>Import File</span>
                </button>
              )}
              {onExportJson && (
                <button
                  type="button"
                  className="btn-nav"
                  onClick={onExportJson}
                  style={exportButtonStyle}
                  title="Download the current plan as JSON"
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
                  style={exportButtonStyle}
                  title="Download the current plan's tasks as CSV"
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
      <div className="prompt-modal-footer" style={{ justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn-nav btn-nav-primary"
          onClick={close}
          style={{ padding: "0 18px", height: "32px" }}
        >
          Done
        </button>
      </div>
    </Modal>
  );
};
