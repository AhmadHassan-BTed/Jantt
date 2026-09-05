import React from "react";
import { History, X, RotateCcw, Clock, ShieldCheck, Trash2 } from "lucide-react";
import type { SnapshotEntry, JanttData } from "@jantt/core";

interface VersionHistoryModalProps {
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  snapshots: SnapshotEntry[];
  currentProjectName: string;
  onRestoreSnapshot: (data: JanttData, reason: string) => void;
  onClearHistory: () => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  showModal,
  setShowModal,
  snapshots,
  currentProjectName,
  onRestoreSnapshot,
  onClearHistory
}) => {
  if (!showModal) return null;

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diffSec < 60) return "Just now";
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " at " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return isoString;
    }
  };

  const getReasonBadgeStyle = (reason: string) => {
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

  return (
    <div className="prompt-modal-backdrop" onClick={() => setShowModal(false)}>
      <div
        className="prompt-modal-card"
        style={{ maxWidth: "680px", width: "90%", maxHeight: "85vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="prompt-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "rgba(56, 189, 248, 0.15)",
                color: "var(--jantt-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <History size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--jantt-text)" }}>
                Version History &amp; Safety Vault
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--jantt-text-muted)" }}>
                Plan: <strong>{currentProjectName}</strong> &bull; {snapshots.length} automatic restore points saved
              </p>
            </div>
          </div>
          <button className="btn-modal-close" onClick={() => setShowModal(false)} title="Close">
            <X size={16} />
          </button>
        </div>

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
              Before any collaborator changes or saves occur, Jantt automatically preserves a complete snapshot. You can roll back anytime with zero data loss.
            </span>
          </div>

          {snapshots.length === 0 ? (
            <div style={{ textAlign: "center", padding: "36px 0", color: "var(--jantt-text-muted)", fontSize: "13px" }}>
              No snapshots captured yet for this plan. Snapshots are created automatically when saves or collaborator syncs occur.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {snapshots.map((snap, idx) => (
                <div
                  key={snap.id}
                  style={{
                    background: idx === 0 ? "rgba(56, 189, 248, 0.05)" : "var(--jantt-surface, #1E293B)",
                    border: idx === 0 ? "1px solid rgba(56, 189, 248, 0.3)" : "1px solid var(--jantt-border-subtle, #334155)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px"
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: "4px",
                          ...getReasonBadgeStyle(snap.reason)
                        }}
                      >
                        {snap.reason}
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
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", color: "var(--jantt-text-muted)" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <Clock size={12} />
                        {formatTime(snap.timestamp)}
                      </span>
                      <span>&bull;</span>
                      <span>{snap.taskCount} tasks</span>
                      <span>&bull;</span>
                      <span style={{ fontFamily: "var(--jantt-font-mono)", fontSize: "11px" }}>
                        hash: {snap.contentHash.slice(0, 8)}
                      </span>
                    </div>
                  </div>

                  <button
                    className="btn-nav"
                    style={{
                      padding: "6px 12px",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      whiteSpace: "nowrap"
                    }}
                    onClick={() => {
                      onRestoreSnapshot(snap.data, `Restored from ${formatTime(snap.timestamp)}`);
                      setShowModal(false);
                    }}
                    title="Restore this plan snapshot"
                  >
                    <RotateCcw size={13} />
                    <span>Restore</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="prompt-modal-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {snapshots.length > 0 ? (
            <button
              className="btn-nav"
              style={{ color: "#EF4444", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
              onClick={onClearHistory}
            >
              <Trash2 size={13} />
              <span>Clear History</span>
            </button>
          ) : (
            <div />
          )}
          <button className="btn-nav btn-nav-primary" onClick={() => setShowModal(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
