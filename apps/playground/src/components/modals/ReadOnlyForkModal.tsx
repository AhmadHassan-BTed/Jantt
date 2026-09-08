import React from "react";
import { Eye, Copy, X, ShieldAlert, ArrowRight } from "lucide-react";

interface ReadOnlyForkModalProps {
  show: boolean;
  setShow: (show: boolean) => void;
  roomTitle?: string;
  onMakeLocalCopy: () => void;
}

export const ReadOnlyForkModal: React.FC<ReadOnlyForkModalProps> = ({
  show,
  setShow,
  roomTitle = "Shared Plan",
  onMakeLocalCopy
}) => {
  if (!show) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={() => setShow(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        padding: "16px"
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "480px",
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: "16px",
          boxShadow: "0 25px 50px rgba(0,0,0,0.6)",
          padding: "24px",
          color: "#f8fafc",
          fontFamily: "inherit"
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "12px",
                background: "rgba(245, 158, 11, 0.15)",
                color: "#f59e0b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              <Eye size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "#f8fafc" }}>
                Read-Only Cloud Room
              </h2>
              <p style={{ margin: "2px 0 0 0", fontSize: "0.82rem", color: "#94a3b8" }}>
                {roomTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShow(false)}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              padding: "4px"
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content explanation */}
        <div
          style={{
            background: "rgba(30, 41, 59, 0.6)",
            border: "1px solid #334155",
            borderRadius: "10px",
            padding: "14px",
            marginBottom: "20px",
            fontSize: "0.85rem",
            lineHeight: 1.5,
            color: "#cbd5e1"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", color: "#f59e0b", fontWeight: 600 }}>
            <ShieldAlert size={16} />
            <span>Viewer Permissions Active</span>
          </div>
          <p style={{ margin: "0 0 8px 0" }}>
            You have <strong>view-only</strong> access to this cloud room. Edits cannot be saved to the shared cloud roadmap.
          </p>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.8rem" }}>
            To make changes, you can create a private <strong>Local Copy</strong> on your device. Your local copy will have full editing rights and won't affect the cloud room.
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            type="button"
            onClick={() => {
              setShow(false);
              onMakeLocalCopy();
            }}
            style={{
              width: "100%",
              background: "linear-gradient(135deg, #0ea5e9, #6366f1)",
              color: "#ffffff",
              border: "none",
              borderRadius: "10px",
              padding: "12px 16px",
              fontSize: "0.9rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: "0 4px 15px rgba(99, 102, 241, 0.35)"
            }}
          >
            <Copy size={16} />
            <span>Make a Local Copy (Edit Freely)</span>
            <ArrowRight size={15} />
          </button>

          <button
            type="button"
            onClick={() => setShow(false)}
            style={{
              width: "100%",
              background: "rgba(255, 255, 255, 0.06)",
              color: "#94a3b8",
              border: "1px solid #334155",
              borderRadius: "10px",
              padding: "10px 16px",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Keep Viewing Read-Only
          </button>
        </div>
      </div>
    </div>
  );
};
