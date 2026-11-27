import React, { useEffect, useState } from "react";
import { History, RotateCcw, Clock, ShieldCheck, Trash2, Eye } from "lucide-react";
import { getActiveLocale, tGlobal, type MessageKey, type MessageParams } from "../../i18n";
import { useI18n } from "../../i18n/I18nProvider";
import { ConfirmDialog, Modal, ModalHeader } from "./ModalHost";
import type { SnapshotEntry, JanttData } from "@jantt/core";

type Translator = (key: MessageKey, params?: MessageParams) => string;

interface VersionHistoryModalProps {
  /** View-only room (viewer, or an editor who has not signed in): restoring is disabled. */
  readOnly?: boolean;
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  snapshots: SnapshotEntry[];
  currentProjectName: string;
  onRestoreSnapshot: (data: JanttData, reason: string) => void;
  onClearHistory: () => void;
}

const parseTimestamp = (isoString: string): Date | null => {
  const d = new Date(isoString);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Stable, absolute wording for labels that are persisted or need to stay meaningful later. */
const formatAbsoluteTime = (isoString: string, t: Translator = tGlobal, locale = getActiveLocale()) => {
  const d = parseTimestamp(isoString);
  if (!d) return isoString || t("history.unknownTime");
  return d.toLocaleString(locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

/** Relative wording for display only; never persist it. */
const formatRelativeTime = (isoString: string, t: Translator = tGlobal, locale = getActiveLocale()) => {
  const d = parseTimestamp(isoString);
  if (!d) return isoString || t("history.unknownTime");
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return t("history.justNow");
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t("history.minutesAgo", { count: diffMin });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t("history.hoursAgo", { count: diffHr });
  return formatAbsoluteTime(isoString, t, locale);
};

/**
 * Entries come straight from browser storage: coerce every rendered field so a malformed or
 * hand-edited entry renders (and is skipped for restore) instead of crashing the dialog.
 */
const describeSnapshot = (snap: SnapshotEntry, index: number, t: Translator = tGlobal) => {
  const data = snap.data && typeof snap.data === "object" && !Array.isArray(snap.data) ? snap.data : null;
  const taskCount =
    typeof snap.taskCount === "number" && Number.isFinite(snap.taskCount)
      ? snap.taskCount
      : data && Array.isArray(data.tasks)
      ? data.tasks.length
      : 0;
  return {
    key: typeof snap.id === "string" && snap.id ? snap.id : `snapshot-${index}`,
    timestamp: typeof snap.timestamp === "string" ? snap.timestamp : "",
    reason: typeof snap.reason === "string" && snap.reason ? snap.reason : t("history.snapshot"),
    taskCount,
    hash: typeof snap.contentHash === "string" ? snap.contentHash.slice(0, 8) : "",
    data
  };
};

type SnapshotView = ReturnType<typeof describeSnapshot>;

const pluralTasks = (n: number, t: Translator = tGlobal) =>
  n === 1 ? t("history.taskOne", { count: n }) : t("history.taskMany", { count: n });

const getReasonBadgeStyle = (reason: string): React.CSSProperties => {
  if (reason.includes("Collaborator") || reason.includes("Pre-Merge")) {
    return {
      background: "rgba(245, 158, 11, 0.15)",
      color: "#F59E0B",
      border: "1px solid rgba(245, 158, 11, 0.3)"
    };
  }
  if (reason.includes("Restore") || reason.includes("恢复")) {
    return {
      background: "rgba(139, 92, 246, 0.15)",
      color: "#8B5CF6",
      border: "1px solid rgba(139, 92, 246, 0.3)"
    };
  }
  return {
    background: "rgba(56, 189, 248, 0.15)",
    color: "var(--jantt-accent, #38BDF8)",
    border: "1px solid rgba(56, 189, 248, 0.3)"
  };
};

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  readOnly = false,
  showModal,
  setShowModal,
  snapshots,
  currentProjectName,
  onRestoreSnapshot,
  onClearHistory
}) => {
  const { t, locale } = useI18n();
  const [pendingRestore, setPendingRestore] = useState<SnapshotView | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // Never carry a half-finished confirmation into the next opening of the dialog.
  useEffect(() => {
    if (!showModal) {
      setPendingRestore(null);
      setConfirmClear(false);
    }
  }, [showModal]);

  if (!showModal) return null;

  const close = () => setShowModal(false);
  const entries = (Array.isArray(snapshots) ? snapshots : [])
    .filter((snap): snap is SnapshotEntry => Boolean(snap) && typeof snap === "object")
    .map((snap, index) => describeSnapshot(snap, index, t));
  const count = entries.length;
  // A role downgrade while the confirmation is open must not let the restore through.
  const restoreTarget = readOnly ? null : pendingRestore;

  const handleConfirmRestore = (snap: SnapshotView) => {
    if (readOnly || !snap.data) return;
    // Absolute time keeps the persisted audit label meaningful later ("5m ago" would not be).
    onRestoreSnapshot(snap.data, t("history.restoreReason", { time: formatAbsoluteTime(snap.timestamp, t, locale) }));
    setPendingRestore(null);
    close();
  };

  const handleConfirmClear = () => {
    onClearHistory();
    setConfirmClear(false);
  };

  return (
    <>
      <Modal onClose={close} maxWidth={680}>
        <ModalHeader
          icon={<History size={18} />}
          title={t("history.title")}
          subtitle={
            <span style={{ overflowWrap: "anywhere" }}>
              {t("history.planLabel")} <strong>{currentProjectName}</strong> &bull;{" "}
              {count === 1 ? t("history.restorePointOne", { count }) : t("history.restorePoints", { count })}
            </span>
          }
        />

        <div className="prompt-modal-body" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div
            style={{
              background: "var(--jantt-surface, #F8FAFC)",
              border: "1px solid var(--jantt-border-subtle, #E2E8F0)",
              borderRadius: "8px",
              padding: "10px 14px",
              fontSize: "12px",
              color: "var(--jantt-text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <ShieldCheck size={16} style={{ color: "#10B981", flexShrink: 0 }} />
            <span>
              {t("history.info")}
            </span>
          </div>

          {readOnly && (
            <div
              role="note"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                padding: "10px 14px",
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                borderRadius: "8px",
                fontSize: "12px",
                lineHeight: 1.45,
                color: "var(--jantt-text)"
              }}
            >
              <Eye size={14} aria-hidden="true" style={{ color: "#F59E0B", flexShrink: 0, marginTop: "2px" }} />
              <span>
                <strong>{t("history.viewOnlyTitle")}</strong> {t("history.viewOnlyBody")}
              </span>
            </div>
          )}

          {count === 0 ? (
            <div style={{ textAlign: "center", padding: "36px 0", color: "var(--jantt-text-muted)", fontSize: "13px" }}>
              {t("history.empty")}
            </div>
          ) : (
            <ul style={{ display: "flex", flexDirection: "column", gap: "8px", listStyle: "none", margin: 0, padding: 0 }}>
              {entries.map((snap, idx) => {
                const absoluteTime = formatAbsoluteTime(snap.timestamp, t, locale);
                const { reason } = snap;
                const canRestore = !readOnly && snap.data !== null;
                return (
                  <li
                    key={snap.key}
                    style={{
                      background: idx === 0 ? "rgba(56, 189, 248, 0.05)" : "var(--jantt-surface, #1E293B)",
                      border: idx === 0
                        ? "1px solid rgba(56, 189, 248, 0.3)"
                        : "1px solid var(--jantt-border-subtle, #334155)",
                      borderRadius: "8px",
                      padding: "12px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "12px"
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: "4px",
                            overflowWrap: "anywhere",
                            ...getReasonBadgeStyle(reason)
                          }}
                        >
                          {reason}
                        </span>
                        {idx === 0 && (
                          <span
                            style={{
                              fontSize: "10.5px",
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: "rgba(16, 185, 129, 0.15)",
                              color: "#10B981"
                            }}
                          >
                            {t("history.latest")}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", fontSize: "12px", color: "var(--jantt-text-muted)" }}>
                        <time dateTime={snap.timestamp || undefined} title={absoluteTime} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <Clock size={12} />
                          {formatRelativeTime(snap.timestamp, t, locale)}
                        </time>
                        <span aria-hidden="true">&bull;</span>
                        <span>{pluralTasks(snap.taskCount, t)}</span>
                        <span aria-hidden="true">&bull;</span>
                        <span style={{ fontFamily: "var(--jantt-font-mono)", fontSize: "11px" }} title={t("history.hashTitle")}>
                          {t("history.hashLabel", { hash: snap.hash })}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn-nav"
                      style={{
                        padding: "6px 12px",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        whiteSpace: "nowrap",
                        ...(canRestore ? null : { opacity: 0.5, cursor: "not-allowed" })
                      }}
                      onClick={() => setPendingRestore(snap)}
                      disabled={!canRestore}
                      title={
                        readOnly
                          ? t("history.viewOnlyShort")
                          : canRestore
                          ? t("history.restoreTitle", { time: absoluteTime })
                          : t("history.damaged")
                      }
                    >
                      <RotateCcw size={13} />
                      <span>{t("history.restore")}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="prompt-modal-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          {count > 0 ? (
            <button
              type="button"
              className="btn-nav"
              style={{ color: "#EF4444", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 size={13} />
              <span>{t("history.clear")}</span>
            </button>
          ) : (
            <div />
          )}
          <button type="button" className="btn-nav btn-nav-primary" onClick={close}>
            {t("common.close")}
          </button>
        </div>
      </Modal>

      {restoreTarget && (
        <ConfirmDialog
          tone="danger"
          title={t("history.confirmRestore.title")}
          message={
            <>
              {t("history.confirmRestore.messageBefore")}{" "}
              <strong>{formatAbsoluteTime(restoreTarget.timestamp, t, locale)}</strong>{" "}
              {t("history.confirmRestore.messageAfter", { tasks: pluralTasks(restoreTarget.taskCount, t) })}
            </>
          }
          confirmLabel={t("history.confirmRestore.confirm")}
          onConfirm={() => handleConfirmRestore(restoreTarget)}
          onCancel={() => setPendingRestore(null)}
        />
      )}

      {confirmClear && (
        <ConfirmDialog
          tone="danger"
          title={t("history.confirmClear.title")}
          message={
            <>
              {count === 1
                ? t("history.confirmClear.messageBeforeOne")
                : t("history.confirmClear.messageBefore", { count })}{" "}
              <strong>{currentProjectName}</strong>{t("history.confirmClear.messageAfter")}
            </>
          }
          confirmLabel={t("history.confirmClear.confirm")}
          onConfirm={handleConfirmClear}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </>
  );
};
