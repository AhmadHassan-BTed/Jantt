import React, { useEffect, useState } from "react";
import { History, RotateCcw, Clock, ShieldCheck, Trash2, Eye } from "lucide-react";
import { ConfirmDialog, Modal, ModalHeader } from "./ModalHost";
import type { SnapshotEntry, JanttData } from "@jantt/core";

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
const formatAbsoluteTime = (isoString: string) => {
  const d = parseTimestamp(isoString);
  if (!d) return isoString || "Unknown time";
  return d.toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

/** Relative wording for display only; never persist it. */
const formatRelativeTime = (isoString: string) => {
  const d = parseTimestamp(isoString);
  if (!d) return isoString || "Unknown time";
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return formatAbsoluteTime(isoString);
};

/**
 * Entries come straight from browser storage: coerce every rendered field so a malformed or
 * hand-edited entry renders (and is skipped for restore) instead of crashing the dialog.
 */
const describeSnapshot = (snap: SnapshotEntry, index: number) => {
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
    reason: typeof snap.reason === "string" && snap.reason ? snap.reason : "Snapshot",
    taskCount,
    hash: typeof snap.contentHash === "string" ? snap.contentHash.slice(0, 8) : "",
    data
  };
};

type SnapshotView = ReturnType<typeof describeSnapshot>;

const pluralTasks = (n: number) => `${n} task${n === 1 ? "" : "s"}`;

const getReasonBadgeStyle = (reason: string): React.CSSProperties => {
  if (reason.includes("Collaborator") || reason.includes("Pre-Merge")) {
    return {
      background: "rgba(245, 158, 11, 0.15)",
      color: "#F59E0B",
      border: "1px solid rgba(245, 158, 11, 0.3)"
    };
  }
  if (reason.includes("Restore")) {
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
    .map(describeSnapshot);
  const count = entries.length;
  // A role downgrade while the confirmation is open must not let the restore through.
  const restoreTarget = readOnly ? null : pendingRestore;

  const handleConfirmRestore = (snap: SnapshotView) => {
    if (readOnly || !snap.data) return;
    // Absolute time keeps the persisted audit label meaningful later ("5m ago" would not be).
    onRestoreSnapshot(snap.data, `Restored version from ${formatAbsoluteTime(snap.timestamp)}`);
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
          title="Version History"
          subtitle={
            <span style={{ overflowWrap: "anywhere" }}>
              Plan: <strong>{currentProjectName}</strong> &bull; {count} restore point{count === 1 ? "" : "s"}
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
              Restore points are captured automatically after each auto-save and before collaborator changes are merged
              (newest 30 per plan, kept in this browser). Restoring replaces the current plan; edits that are not in a
              restore point are overwritten.
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
                <strong>View only.</strong> Restoring a version would change this room, so it is disabled. Make a local
                copy to edit your own version.
              </span>
            </div>
          )}

          {count === 0 ? (
            <div style={{ textAlign: "center", padding: "36px 0", color: "var(--jantt-text-muted)", fontSize: "13px" }}>
              No restore points for this plan yet. One is captured after the next auto-save or collaborator sync.
            </div>
          ) : (
            <ul style={{ display: "flex", flexDirection: "column", gap: "8px", listStyle: "none", margin: 0, padding: 0 }}>
              {entries.map((snap, idx) => {
                const absoluteTime = formatAbsoluteTime(snap.timestamp);
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
                            Latest
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", fontSize: "12px", color: "var(--jantt-text-muted)" }}>
                        <time dateTime={snap.timestamp || undefined} title={absoluteTime} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <Clock size={12} />
                          {formatRelativeTime(snap.timestamp)}
                        </time>
                        <span aria-hidden="true">&bull;</span>
                        <span>{pluralTasks(snap.taskCount)}</span>
                        <span aria-hidden="true">&bull;</span>
                        <span style={{ fontFamily: "var(--jantt-font-mono)", fontSize: "11px" }} title="Content fingerprint">
                          hash: {snap.hash}
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
                          ? "View only: make a local copy to edit"
                          : canRestore
                          ? `Restore the version from ${absoluteTime}`
                          : "This restore point is damaged and cannot be restored"
                      }
                    >
                      <RotateCcw size={13} />
                      <span>Restore&hellip;</span>
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
              <span>Clear History&hellip;</span>
            </button>
          ) : (
            <div />
          )}
          <button type="button" className="btn-nav btn-nav-primary" onClick={close}>
            Close
          </button>
        </div>
      </Modal>

      {restoreTarget && (
        <ConfirmDialog
          tone="danger"
          title="Restore this version?"
          message={
            <>
              Replace the current plan with the version from <strong>{formatAbsoluteTime(restoreTarget.timestamp)}</strong>{" "}
              ({pluralTasks(restoreTarget.taskCount)})? Edits that are not in a restore point are overwritten.
            </>
          }
          confirmLabel="Restore Version"
          onConfirm={() => handleConfirmRestore(restoreTarget)}
          onCancel={() => setPendingRestore(null)}
        />
      )}

      {confirmClear && (
        <ConfirmDialog
          tone="danger"
          title="Delete all restore points?"
          message={
            <>
              This permanently deletes all {count} restore point{count === 1 ? "" : "s"} for{" "}
              <strong>{currentProjectName}</strong> from this browser. The current plan itself is not changed.
            </>
          }
          confirmLabel="Delete All"
          onConfirm={handleConfirmClear}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </>
  );
};
