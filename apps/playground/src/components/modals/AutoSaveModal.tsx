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
import { useI18n } from "../../i18n/I18nProvider";
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

const STATUS_COLORS: Record<AutoSaveStatus, string> = {
  saved: "#10B981",
  saving: "var(--jantt-accent)",
  pending: "#F59E0B",
  error: "#EF4444"
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
  const { t, locale } = useI18n();
  const cadenceRefs = useRef<(HTMLDivElement | null)[]>([]);

  if (!showAutoSaveModal) return null;

  const close = () => setShowAutoSaveModal(false);
  // useAutoSave keeps a failed write "pending" (it is retried) and reports the failure through saveError.
  const effectiveStatus: AutoSaveStatus = saveError && saveStatus !== "saving" ? "error" : saveStatus;
  const status = { title: t(`autosave.status.${effectiveStatus}`), color: STATUS_COLORS[effectiveStatus] };
  const isOff = autoSaveInterval === "off";

  const lastSavedText = lastSavedAt
    ? t("autosave.lastSaved", {
        time: lastSavedAt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      })
    : t("autosave.notSavedSession");

  const statusDetail =
    effectiveStatus === "error"
      ? saveError || t("autosave.storageRejected")
      : effectiveStatus === "pending" && isOff
      ? t("autosave.offHint", { lastSaved: lastSavedText })
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
        title={t("autosave.title")}
        subtitle={t("autosave.subtitle")}
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
                title={t("autosave.exportBackupTitle")}
              >
                <ArrowDownToLine size={13} />
                <span>{t("autosave.exportBackup")}</span>
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
              title={t("autosave.saveNowTitle")}
            >
              <Save size={13} />
              <span>{effectiveStatus === "error" ? t("autosave.retrySave") : t("autosave.saveNow")}</span>
            </button>
          </div>
        </div>

        {/* Cadence Selector */}
        <div>
          <div className="settings-section-title" id="autosave-cadence-label">
            {t("autosave.frequency")}
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
                        {t(`autosave.opt.${opt.id}.label`)}
                      </span>
                      {opt.recommended && (
                        <span className="settings-badge-rec">
                          {t("autosave.recommended")}
                        </span>
                      )}
                    </div>
                    <div id={`autosave-opt-${opt.id}-desc`} style={{ fontSize: "11px", color: "var(--jantt-text-muted)", marginTop: "2px", lineHeight: 1.3 }}>
                      {t(`autosave.opt.${opt.id}.desc`)}
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
                {t("autosave.browserStorage")}
              </span>
              <span style={{ display: "block", fontSize: "10.5px", color: "var(--jantt-text-muted)" }}>
                {t("autosave.storageNote")}
              </span>
            </div>
          </div>
          <span
            title={t("autosave.storageSizeTitle")}
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
            {t("autosave.storageUsed", { size: storageSizeKb })}
          </span>
        </div>

        {/* Data Import & Export Section */}
        {(onImportJson || onExportJson || onExportCsv) && (
          <div>
            <div className="settings-section-title">{t("autosave.importExport")}</div>
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
                  title={t("autosave.importTitle")}
                >
                  <ArrowUpFromLine size={13} />
                  <span style={{ fontSize: "11.5px" }}>{t("autosave.import")}</span>
                </button>
              )}
              {onExportJson && (
                <button
                  type="button"
                  className="btn-nav"
                  onClick={onExportJson}
                  style={exportButtonStyle}
                  title={t("autosave.exportJsonTitle")}
                >
                  <ArrowDownToLine size={13} />
                  <span style={{ fontSize: "11.5px" }}>{t("autosave.exportJson")}</span>
                </button>
              )}
              {onExportCsv && (
                <button
                  type="button"
                  className="btn-nav"
                  onClick={onExportCsv}
                  style={exportButtonStyle}
                  title={t("autosave.exportCsvTitle")}
                >
                  <FileSpreadsheet size={13} />
                  <span style={{ fontSize: "11.5px" }}>{t("autosave.exportCsv")}</span>
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
          {t("common.done")}
        </button>
      </div>
    </Modal>
  );
};
