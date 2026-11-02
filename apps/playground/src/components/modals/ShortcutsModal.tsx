import React from "react";
import { X, Keyboard } from "lucide-react";

export interface ShortcutsModalProps {
  show: boolean;
  onClose: () => void;
}

interface ShortcutRow {
  keys: string[];
  description: string;
  category: "Navigation" | "Views" | "Visualization" | "History & Editing";
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ show, onClose }) => {
  if (!show) return null;

  const shortcuts: ShortcutRow[] = [
    // Views
    { keys: ["1"], description: "Switch to Gantt Timeline View", category: "Views" },
    { keys: ["2"], description: "Switch to 60 FPS Canvas Virtualized Engine", category: "Views" },
    { keys: ["3"], description: "Switch to Kanban Task Board", category: "Views" },
    { keys: ["4"], description: "Switch to Task Checklist & Grid", category: "Views" },
    { keys: ["5"], description: "Switch to Health & EVM Analytics", category: "Views" },
    { keys: ["6"], description: "Switch to Project Notes & Docs", category: "Views" },

    // Navigation & Command
    { keys: ["Ctrl", "K"], description: "Open Universal Command Palette & Search", category: "Navigation" },
    { keys: ["T"], description: "Jump and align timeline with Today", category: "Navigation" },
    { keys: ["W"], description: "Filter timeline to Current Week", category: "Navigation" },
    { keys: ["?"], description: "Open Keyboard Shortcuts Cheatsheet", category: "Navigation" },
    { keys: ["Esc"], description: "Close active modal or drawer", category: "Navigation" },

    // Visualization
    { keys: ["C"], description: "Toggle Critical Path Highlighting (Zero-Float Chain)", category: "Visualization" },
    { keys: ["B"], description: "Toggle Planned vs Actual Baseline Shadows", category: "Visualization" },
    { keys: ["+"], description: "Zoom in timeline scale (Increase day width)", category: "Visualization" },
    { keys: ["-"], description: "Zoom out timeline scale (Decrease day width)", category: "Visualization" },
    { keys: ["0"], description: "Reset timeline pan and zoom to default", category: "Visualization" },

    // History
    { keys: ["Ctrl", "Z"], description: "Undo last project action or modification", category: "History & Editing" },
    { keys: ["Ctrl", "Y"], description: "Redo undone project action", category: "History & Editing" }
  ];

  const categories = ["Navigation", "Views", "Visualization", "History & Editing"] as const;

  return (
    <div className="prompt-modal-backdrop" onClick={onClose}>
      <div
        className="prompt-modal-card"
        style={{ maxWidth: "620px", width: "90%" }}
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
                color: "#38BDF8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Keyboard size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--jantt-text)" }}>
                Keyboard Shortcuts Cheatsheet
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--jantt-text-muted)" }}>
                Power-user shortcuts for rapid navigation and project orchestration
              </p>
            </div>
          </div>
          <button className="btn-close-modal" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="prompt-modal-body" style={{ maxHeight: "60vh", overflowY: "auto", padding: "16px 20px" }}>
          {categories.map((category) => {
            const rows = shortcuts.filter((s) => s.category === category);
            return (
              <div key={category} style={{ marginBottom: "20px" }}>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: "#38BDF8",
                    marginBottom: "8px",
                    paddingBottom: "4px",
                    borderBottom: "1px solid var(--jantt-border)"
                  }}
                >
                  {category}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {rows.map((row, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        background: "rgba(255, 255, 255, 0.02)"
                      }}
                    >
                      <span style={{ fontSize: "12.5px", color: "var(--jantt-text)" }}>{row.description}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        {row.keys.map((k, idx) => (
                          <kbd
                            key={idx}
                            style={{
                              fontSize: "10.5px",
                              fontWeight: 600,
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: "rgba(255, 255, 255, 0.08)",
                              color: "var(--jantt-text)",
                              border: "1px solid rgba(255, 255, 255, 0.15)",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.2)"
                            }}
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="prompt-modal-footer" style={{ justifyContent: "space-between" }}>
          <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
            Tip: Press <kbd style={{ padding: "1px 4px", borderRadius: "3px", background: "rgba(255,255,255,0.1)" }}>?</kbd> anytime to summon this sheet
          </span>
          <button className="btn-nav btn-nav-primary" onClick={onClose} style={{ padding: "6px 16px" }}>
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};

