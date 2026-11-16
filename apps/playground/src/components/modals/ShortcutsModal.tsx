import React from "react";
import { Keyboard } from "lucide-react";
import { Modal, ModalHeader } from "./ModalHost";
import { PRIMARY_MODIFIER_LABEL } from "../common/CommandPalette";

interface ShortcutRow {
  /** Keys pressed together. "Mod" renders as Cmd on Apple platforms and Ctrl elsewhere. */
  keys: string[];
  /** Optional alternative combination with the same effect. */
  altKeys?: string[];
  description: string;
  category: string;
}

export interface ShortcutsModalProps {
  show: boolean;
  onClose: () => void;
}

/** Mirrors the global key handler in App.tsx; keep the two in sync. */
const SHORTCUTS: ShortcutRow[] = [
  { keys: ["Mod", "K"], description: "Open the command palette", category: "General" },
  { keys: ["?"], description: "Show this list of shortcuts", category: "General" },
  { keys: ["Esc"], description: "Close the open dialog", category: "General" },

  { keys: ["1"], description: "Gantt timeline", category: "Switch View" },
  { keys: ["2"], description: "Canvas timeline (large plans)", category: "Switch View" },
  { keys: ["3"], description: "Kanban board", category: "Switch View" },
  { keys: ["4"], description: "Task list", category: "Switch View" },
  { keys: ["5"], description: "Health & EVM analytics", category: "Switch View" },
  { keys: ["6"], description: "Notes", category: "Switch View" },

  { keys: ["C"], description: "Toggle critical path highlighting", category: "Filters & Display" },
  { keys: ["B"], description: "Toggle baseline (planned vs actual) bars", category: "Filters & Display" },
  { keys: ["T"], description: "Toggle filter: tasks active today", category: "Filters & Display" },
  { keys: ["W"], description: "Toggle filter: tasks active this week", category: "Filters & Display" },

  { keys: ["+"], altKeys: ["="], description: "Zoom timeline scale in (finer)", category: "Timeline Scale (Gantt & Canvas)" },
  { keys: ["-"], description: "Zoom timeline scale out (coarser)", category: "Timeline Scale (Gantt & Canvas)" },
  { keys: ["0"], description: "Reset timeline scale to Week", category: "Timeline Scale (Gantt & Canvas)" },

  { keys: ["Mod", "Z"], description: "Undo", category: "History" },
  { keys: ["Mod", "Shift", "Z"], altKeys: ["Mod", "Y"], description: "Redo", category: "History" }
];

// Same platform detection as the command palette and navbar hints.
const keyLabel = (key: string) => (key === "Mod" ? PRIMARY_MODIFIER_LABEL : key);
const keyTitle = (key: string) => (key === "Mod" ? (PRIMARY_MODIFIER_LABEL === "⌘" ? "Command" : "Control") : undefined);

const kbdStyle: React.CSSProperties = {
  fontSize: "10.5px",
  fontWeight: 600,
  padding: "2px 6px",
  borderRadius: "4px",
  background: "var(--jantt-surface-hover, rgba(255, 255, 255, 0.08))",
  color: "var(--jantt-text)",
  border: "1px solid var(--jantt-border, rgba(255, 255, 255, 0.15))",
  boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
  minWidth: "18px",
  textAlign: "center"
};

const KeyCombo: React.FC<{ keys: string[] }> = ({ keys }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
    {keys.map((k, idx) => (
      <kbd key={idx} style={kbdStyle} title={keyTitle(k)}>
        {keyLabel(k)}
      </kbd>
    ))}
  </span>
);

const CATEGORIES = Array.from(new Set(SHORTCUTS.map((s) => s.category)));

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ show, onClose }) => {
  if (!show) return null;

  return (
    <Modal onClose={onClose} maxWidth={620}>
      <ModalHeader
        icon={<Keyboard size={18} />}
        title="Keyboard Shortcuts"
        subtitle="Single-key shortcuts are ignored while you type in a text field."
      />

      <div className="prompt-modal-body" style={{ overflowY: "auto", padding: "16px 20px" }}>
        {CATEGORIES.map((category) => {
          const rows = SHORTCUTS.filter((s) => s.category === category);
          return (
            <section key={category} style={{ marginBottom: "20px" }} aria-label={category}>
              <h4
                style={{
                  margin: "0 0 8px 0",
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  color: "var(--jantt-accent, #38BDF8)",
                  paddingBottom: "4px",
                  borderBottom: "1px solid var(--jantt-border)"
                }}
              >
                {category}
              </h4>
              <dl style={{ display: "flex", flexDirection: "column", gap: "6px", margin: 0 }}>
                {rows.map((row) => (
                  <div
                    key={`${row.keys.join("+")}-${row.description}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      background: "var(--jantt-surface, rgba(255, 255, 255, 0.02))"
                    }}
                  >
                    <dt style={{ fontSize: "12.5px", color: "var(--jantt-text)" }}>{row.description}</dt>
                    <dd style={{ margin: 0, display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <KeyCombo keys={row.keys} />
                      {row.altKeys && (
                        <>
                          <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>or</span>
                          <KeyCombo keys={row.altKeys} />
                        </>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>

      <div className="prompt-modal-footer" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
          Tip: press <kbd style={kbdStyle}>?</kbd> anytime to open this list.
        </span>
        <button type="button" className="btn-nav btn-nav-primary" onClick={onClose} style={{ padding: "6px 16px" }}>
          Got it
        </button>
      </div>
    </Modal>
  );
};
