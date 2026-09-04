import React from "react";
import {
  Save,
  X,
  CheckCircle2,
  RefreshCw,
  Clock,
  HardDrive
} from "lucide-react";
import type { AutoSaveInterval } from "../types";
import { AUTOSAVE_OPTIONS } from "../constants";

interface AutoSaveModalProps {
  showAutoSaveModal: boolean;
  setShowAutoSaveModal: (show: boolean) => void;
  saveStatus: "saved" | "saving" | "pending";
  lastSavedAt: Date;
  handleManualSaveNow: () => void;
  autoSaveInterval: AutoSaveInterval;
  setAutoSaveInterval: (interval: AutoSaveInterval) => void;
  storageSizeKb: string;
}

export const AutoSaveModal: React.FC<AutoSaveModalProps> = ({
  showAutoSaveModal,
  setShowAutoSaveModal,
  saveStatus,
  lastSavedAt,
  handleManualSaveNow,
  autoSaveInterval,
  setAutoSaveInterval,
  storageSizeKb
}) => {
  if (!showAutoSaveModal) return null;

  return (
    <div className="prompt-modal-backdrop" onClick={() => setShowAutoSaveModal(false)}>
      <div
        className="prompt-modal-window"
        style={{ maxWidth: "480px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="prompt-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
            <Save size={18} style={{ color: "var(--jantt-accent)" }} />
            <div>
              <h2 style={{ fontSize: "15px", fontWeight: 700, margin: 0 }}>Auto-Save Settings</h2>
              <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                Configure automatic persistence and review client storage
              </span>
            </div>
          </div>
          <button className="prompt-modal-close-btn" onClick={() => setShowAutoSaveModal(false)}>
            <X size={15} />
          </button>
        </div>

        <div className="prompt-modal-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Status Banner */}
          <div
            style={{
              background: saveStatus === "saved" ? "rgba(16, 185, 129, 0.09)" : "rgba(245, 158, 11, 0.09)",
              border: `1px solid ${saveStatus === "saved" ? "rgba(16, 185, 129, 0.25)" : "rgba(245, 158, 11, 0.25)"}`,
              borderRadius: "10px",
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {saveStatus === "saved" ? (
                <CheckCircle2 size={18} style={{ color: "#10B981", flexShrink: 0 }} />
              ) : saveStatus === "saving" ? (
                <RefreshCw size={18} className="spin-sync-icon" style={{ color: "var(--jantt-accent)", flexShrink: 0 }} />
              ) : (
                <Clock size={18} style={{ color: "#F59E0B", flexShrink: 0 }} />
              )}
              <div>
                <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--jantt-text)" }}>
                  {saveStatus === "saved"
                    ? "All changes saved"
                    : saveStatus === "saving"
                    ? "Saving changes..."
                    : "Pending unsaved changes"}
                </div>
                <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                  Last saved: {lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
              </div>
            </div>

            <button
              className="btn-nav btn-nav-primary"
              onClick={handleManualSaveNow}
              style={{ fontSize: "11.5px", padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: "5px" }}
              title="Force an immediate save to permanent browser storage"
            >
              <Save size={12} />
              <span>Save Now</span>
            </button>
          </div>

          {/* Cadence Selector */}
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--jantt-text-muted)", marginBottom: "8px" }}>
              Auto-Save Cadence
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {AUTOSAVE_OPTIONS.map((opt) => (
                <label
                  key={opt.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    padding: "8px 12px",
                    background: autoSaveInterval === opt.id ? "var(--jantt-surface-hover, rgba(56, 189, 248, 0.08))" : "var(--jantt-surface)",
                    border: `1px solid ${autoSaveInterval === opt.id ? "var(--jantt-accent, #38BDF8)" : "var(--jantt-border)"}`,
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                >
                  <input
                    type="radio"
                    name="autosave-interval"
                    value={opt.id}
                    checked={autoSaveInterval === opt.id}
                    onChange={() => setAutoSaveInterval(opt.id)}
                    style={{ marginTop: "3px" }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--jantt-text)" }}>{opt.label}</span>
                      {opt.recommended && (
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--jantt-accent)", background: "var(--jantt-accent-glow)", padding: "1px 6px", borderRadius: "100px" }}>
                          Recommended
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)", marginTop: "2px" }}>
                      {opt.desc}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Diagnostic Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              background: "var(--jantt-surface)",
              borderRadius: "8px",
              border: "1px solid var(--jantt-border-subtle)",
              fontSize: "11.5px",
              color: "var(--jantt-text-muted)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <HardDrive size={13} style={{ color: "var(--jantt-accent)" }} />
              <span>Persistent Client Storage (localStorage)</span>
            </div>
            <span style={{ fontFamily: "var(--jantt-font-mono)", fontWeight: 600, color: "var(--jantt-text)" }}>
              ~{storageSizeKb} KB
            </span>
          </div>
        </div>

        <div className="prompt-modal-footer">
          <button className="btn-nav" onClick={() => setShowAutoSaveModal(false)}>
            Close
          </button>
          <button className="btn-nav btn-nav-primary" onClick={() => setShowAutoSaveModal(false)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
