import React from "react";
import { Keyboard } from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";
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

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ show, onClose }) => {
  const { t } = useI18n();
  if (!show) return null;

  /** Mirrors the global key handler in App.tsx; keep the two in sync. */
  const shortcuts: ShortcutRow[] = [
    { keys: ["Mod", "K"], description: t("shortcuts.openPalette"), category: t("shortcuts.categories.general") },
    { keys: ["Mod", "J"], description: t("shortcuts.toggleCopilot"), category: t("shortcuts.categories.general") },
    { keys: ["?"], description: t("shortcuts.showList"), category: t("shortcuts.categories.general") },
    { keys: ["Esc"], description: t("shortcuts.closeDialog"), category: t("shortcuts.categories.general") },

    { keys: ["1"], description: t("shortcuts.gantt"), category: t("shortcuts.categories.switchView") },
    { keys: ["2"], description: t("shortcuts.canvas"), category: t("shortcuts.categories.switchView") },
    { keys: ["3"], description: t("shortcuts.kanban"), category: t("shortcuts.categories.switchView") },
    { keys: ["4"], description: t("shortcuts.tasks"), category: t("shortcuts.categories.switchView") },
    { keys: ["5"], description: t("shortcuts.health"), category: t("shortcuts.categories.switchView") },
    { keys: ["6"], description: t("shortcuts.notes"), category: t("shortcuts.categories.switchView") },

    { keys: ["C"], description: t("shortcuts.criticalPath"), category: t("shortcuts.categories.filters") },
    { keys: ["B"], description: t("shortcuts.baselines"), category: t("shortcuts.categories.filters") },
    { keys: ["T"], description: t("shortcuts.today"), category: t("shortcuts.categories.filters") },
    { keys: ["W"], description: t("shortcuts.week"), category: t("shortcuts.categories.filters") },

    { keys: ["+"], altKeys: ["="], description: t("shortcuts.zoomIn"), category: t("shortcuts.categories.timelineScale") },
    { keys: ["-"], description: t("shortcuts.zoomOut"), category: t("shortcuts.categories.timelineScale") },
    { keys: ["0"], description: t("shortcuts.resetScale"), category: t("shortcuts.categories.timelineScale") },

    { keys: ["Mod", "Z"], description: t("shortcuts.undo"), category: t("shortcuts.categories.history") },
    { keys: ["Mod", "Shift", "Z"], altKeys: ["Mod", "Y"], description: t("shortcuts.redo"), category: t("shortcuts.categories.history") }
  ];

  const categories = Array.from(new Set(shortcuts.map((s) => s.category)));

  return (
    <Modal onClose={onClose} maxWidth={620}>
      <ModalHeader
        icon={<Keyboard size={18} />}
        title={t("shortcuts.title")}
        subtitle={t("shortcuts.subtitle")}
      />

      <div className="prompt-modal-body" style={{ overflowY: "auto", padding: "16px 20px" }}>
        {categories.map((category) => {
          const rows = shortcuts.filter((s) => s.category === category);
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
                          <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>{t("shortcuts.or")}</span>
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
          {t("shortcuts.tipBefore")} <kbd style={kbdStyle}>?</kbd> {t("shortcuts.tipAfter")}
        </span>
        <button type="button" className="btn-nav btn-nav-primary" onClick={onClose} style={{ padding: "6px 16px" }}>
          {t("shortcuts.gotIt")}
        </button>
      </div>
    </Modal>
  );
};
