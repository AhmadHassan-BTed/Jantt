import React from "react";
import { Eye, Copy, ShieldAlert } from "lucide-react";
import { Modal, ModalHeader } from "./ModalHost";

interface ReadOnlyForkModalProps {
  show: boolean;
  setShow: (show: boolean) => void;
  roomTitle?: string;
  allowFork?: boolean;
  onMakeLocalCopy: () => void;
}

export const ReadOnlyForkModal: React.FC<ReadOnlyForkModalProps> = ({
  show,
  setShow,
  roomTitle = "Shared Plan",
  allowFork = true,
  onMakeLocalCopy
}) => {
  if (!show) return null;

  const close = () => setShow(false);

  return (
    <Modal onClose={close} maxWidth={480} ariaDescribedBy="readonly-fork-desc">
      <ModalHeader
        icon={<Eye size={18} />}
        title="This Room Is View-Only for You"
        subtitle={<span style={{ overflowWrap: "anywhere" }}>{roomTitle}</span>}
      />

      <div className="prompt-modal-body" style={{ gap: "16px" }}>
        <div
          id="readonly-fork-desc"
          style={{
            background: "var(--jantt-surface-hover, rgba(30, 41, 59, 0.6))",
            border: "1px solid var(--jantt-border, #334155)",
            borderRadius: "10px",
            padding: "14px",
            fontSize: "13px",
            lineHeight: 1.5,
            color: "var(--jantt-text)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", color: "#F59E0B", fontWeight: 600 }}>
            <ShieldAlert size={16} aria-hidden="true" />
            <span>Your changes can&apos;t be saved here</span>
          </div>
          <p style={{ margin: "0 0 8px 0" }}>
            You have <strong>view-only</strong> access to this cloud room, so edits are not saved to the shared plan.
          </p>
          <p style={{ margin: 0, color: "var(--jantt-text-muted)", fontSize: "12.5px" }}>
            {allowFork ? "Create a private local copy to edit on this device, or ask the owner for editor access." : "Ask the room owner for editor access."}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {allowFork && <button
            type="button"
            className="btn btn-primary"
            data-autofocus
            style={{ width: "100%", padding: "11px 16px" }}
            onClick={() => {
              close();
              onMakeLocalCopy();
            }}
          >
            <Copy size={16} aria-hidden="true" />
            <span>Make a Private Local Copy</span>
          </button>}

          <button type="button" className="btn btn-secondary" style={{ width: "100%" }} onClick={close}>
            Keep Viewing Read-Only
          </button>
        </div>
      </div>
    </Modal>
  );
};
