import React from "react";
import { KeyRound, LogIn, X, Copy, ArrowRight, ShieldCheck } from "lucide-react";

interface EditorLoginModalProps {
  show: boolean;
  setShow: (show: boolean) => void;
  roomTitle?: string;
  onLogin: () => void;
  onMakeLocalCopy?: () => void;
}

export const EditorLoginModal: React.FC<EditorLoginModalProps> = ({
  show,
  setShow,
  roomTitle = "Shared Plan",
  onLogin,
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
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        backdropFilter: "blur(6px)",
        padding: "16px"
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "490px",
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
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "rgba(56, 189, 248, 0.15)",
                color: "#38bdf8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              <KeyRound size={24} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "#f8fafc" }}>
                Editor Invitation
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
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", color: "#38bdf8", fontWeight: 600 }}>
            <ShieldCheck size={16} />
            <span>Editor Capabilities Detected</span>
          </div>
          <p style={{ margin: "0 0 8px 0" }}>
            You opened an <strong>Editor Invitation</strong> link for this cloud room. You can view the roadmap right now without an account.
          </p>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.82rem" }}>
            To make live changes and sync them with your team, please <strong>log in with GitHub</strong>. If you prefer not to log in, you can create a private local copy instead.
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            type="button"
            onClick={() => {
              setShow(false);
              onLogin();
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
            <LogIn size={16} />
            <span>Log In with GitHub to Edit</span>
            <ArrowRight size={15} />
          </button>

          {onMakeLocalCopy && (
            <button
              type="button"
              onClick={() => {
                setShow(false);
                onMakeLocalCopy();
              }}
              style={{
                width: "100%",
                background: "rgba(255, 255, 255, 0.06)",
                color: "#e2e8f0",
                border: "1px solid #334155",
                borderRadius: "10px",
                padding: "10px 16px",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px"
              }}
            >
              <Copy size={15} />
              <span>Make a Local Copy (No Login Required)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShow(false)}
            style={{
              width: "100%",
              background: "transparent",
              color: "#94a3b8",
              border: "none",
              padding: "8px 16px",
              fontSize: "0.82rem",
              fontWeight: 500,
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
