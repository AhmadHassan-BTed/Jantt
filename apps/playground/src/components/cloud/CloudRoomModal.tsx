import React, { useEffect, useId, useRef, useState } from "react";
import { Radio, ArrowRight, Plus, Loader2, LogIn } from "lucide-react";
import type { SavedProject, ActiveView } from "../../types";
import type { UserProfile } from "../../firebase";
import { parseRoomLink } from "../../room-storage";
import { Modal, ModalHeader } from "../modals/ModalHost";

type CloudRoomTab = "join" | "create";

interface CloudRoomModalProps {
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  activeProject?: SavedProject;
  /** Resolves to `false` (or `null`) when the room could not be created; the dialog then stays open. */
  onCreateRoom: (options: { title: string; roomId?: string }) => Promise<unknown>;
  /** Resolves to `false` when the room could not be opened; the dialog then stays open. */
  onJoinRoom: (roomId: string, secretKey?: string) => Promise<unknown>;
  isProcessing: boolean;
  activeRoomId?: string | null;
  activeRoomRole?: "collaborator" | "viewer" | "none";
  currentUserProfile?: UserProfile | null;
  /** Shown on the "Start a room" tab when signed out. */
  onLogin?: () => void;
  /** Tab shown when the dialog opens (default: "join"). */
  initialTab?: CloudRoomTab;
  /** @deprecated Unused: room links are built by the Share dialog. */
  activeView?: ActiveView;
  /** @deprecated Unused: room links are built by the Share dialog. */
  selectedThemeId?: string;
  /** @deprecated Edit keys no longer grant access; editors are invited by the room owner. */
  onUnlockCollaborator?: (secretKey: string) => Promise<void>;
  /** @deprecated See `onUnlockCollaborator`. */
  activeSecretKey?: string | null;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: "8px",
  background: "var(--jantt-bg, rgba(15, 23, 42, 0.7))",
  border: "1px solid var(--jantt-border, rgba(255, 255, 255, 0.14))",
  color: "var(--jantt-text)",
  fontSize: "0.9rem"
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.82rem",
  fontWeight: 600,
  marginBottom: "6px",
  color: "var(--jantt-text)"
};

const helpStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: "0.78rem",
  color: "var(--jantt-text-muted)",
  lineHeight: 1.45
};

const isSuccess = (result: unknown) => result !== false && result !== null;

/** "Cloud rooms" dialog: open a room from a link or ID, or start a room from the current plan. */
export const CloudRoomModal: React.FC<CloudRoomModalProps> = ({
  showModal,
  setShowModal,
  activeProject,
  onCreateRoom,
  onJoinRoom,
  isProcessing,
  activeRoomId,
  currentUserProfile,
  onLogin,
  initialTab = "join"
}) => {
  const baseId = useId();
  const [activeTab, setActiveTab] = useState<CloudRoomTab>(initialTab);
  const [joinInput, setJoinInput] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [roomTitle, setRoomTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const tabRefs = useRef<Record<CloudRoomTab, HTMLButtonElement | null>>({ join: null, create: null });
  // Read on open only: a plan rename while the dialog is open must not wipe what was typed.
  const activeNameRef = useRef(activeProject?.name || "");
  activeNameRef.current = activeProject?.name || "";

  useEffect(() => {
    if (!showModal) return;
    setActiveTab(initialTab);
    setJoinInput("");
    setJoinError(null);
    setCreateError(null);
    setRoomTitle(activeNameRef.current);
  }, [showModal, initialTab]);

  if (!showModal) return null;

  const close = () => setShowModal(false);
  const isSignedIn = Boolean(currentUserProfile);
  const tabs: { id: CloudRoomTab; label: string; icon: React.ReactNode }[] = [
    { id: "join", label: "Join a room", icon: <ArrowRight size={14} aria-hidden="true" /> },
    { id: "create", label: "Start a room", icon: <Plus size={14} aria-hidden="true" /> }
  ];
  const tabId = (tab: CloudRoomTab) => `${baseId}-tab-${tab}`;
  const panelId = (tab: CloudRoomTab) => `${baseId}-panel-${tab}`;

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const index = tabs.findIndex((t) => t.id === activeTab);
    const nextIndex =
      event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const next = tabs[nextIndex].id;
    setActiveTab(next);
    tabRefs.current[next]?.focus();
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return;
    const roomId = parseRoomLink(joinInput);
    if (!roomId) {
      setJoinError("Paste a room link (it contains ?room=…) or a room ID such as room_ab12cd34ef.");
      return;
    }
    if (roomId === activeRoomId) {
      close();
      return;
    }
    setJoinError(null);
    if (isSuccess(await onJoinRoom(roomId))) {
      close();
    } else {
      setJoinError("The room could not be opened. Check the link, or ask the owner to share it again.");
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = roomTitle.trim();
    if (!title || isProcessing) return;
    setCreateError(null);
    if (isSuccess(await onCreateRoom({ title }))) {
      close();
    } else {
      setCreateError("The room could not be created. Please try again.");
    }
  };

  return (
    <Modal onClose={close} maxWidth={500}>
      <ModalHeader
        icon={<Radio size={18} />}
        title="Cloud rooms"
        subtitle="Open a room someone shared with you, or start one from this plan."
      />

      <div
        role="tablist"
        aria-label="Cloud room actions"
        style={{
          display: "flex",
          gap: "4px",
          margin: "14px 20px 0",
          padding: "4px",
          borderRadius: "10px",
          border: "1px solid var(--jantt-border)",
          background: "var(--jantt-surface)"
        }}
      >
        {tabs.map((tab) => {
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              id={tabId(tab.id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId(tab.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={handleTabKeyDown}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "7px 10px",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                fontSize: "0.84rem",
                fontWeight: 600,
                background: selected ? "var(--jantt-accent)" : "transparent",
                color: selected ? "var(--jantt-accent-contrast, #000000)" : "var(--jantt-text-muted)"
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ padding: "18px 20px 20px", overflowY: "auto" }}>
        {activeTab === "join" ? (
          <form
            id={panelId("join")}
            role="tabpanel"
            aria-labelledby={tabId("join")}
            onSubmit={handleJoinSubmit}
            noValidate
          >
            <label htmlFor={`${baseId}-join-input`} style={labelStyle}>
              Room link or ID
            </label>
            <input
              id={`${baseId}-join-input`}
              type="text"
              data-autofocus
              autoComplete="off"
              spellCheck={false}
              placeholder="https://…?room=room_ab12cd34ef"
              value={joinInput}
              onChange={(e) => {
                setJoinInput(e.target.value);
                if (joinError) setJoinError(null);
              }}
              aria-invalid={Boolean(joinError)}
              aria-describedby={`${baseId}-join-help`}
              style={inputStyle}
            />
            {joinError ? (
              <p id={`${baseId}-join-help`} role="alert" style={{ ...helpStyle, color: "#F87171" }}>
                {joinError}
              </p>
            ) : (
              <p id={`${baseId}-join-help`} style={helpStyle}>
                Anyone with a room link can view the plan live. To edit, the room owner adds you as an Editor
                {isSignedIn ? "" : " (sign in with GitHub first)"}.
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
              <button type="button" className="btn btn-secondary" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={!joinInput.trim() || isProcessing}>
                {isProcessing ? <Loader2 size={15} className="spin-sync-icon" aria-hidden="true" /> : <ArrowRight size={15} aria-hidden="true" />}
                <span>{isProcessing ? "Opening…" : "Open room"}</span>
              </button>
            </div>
          </form>
        ) : (
          <div id={panelId("create")} role="tabpanel" aria-labelledby={tabId("create")}>
            {!isSignedIn ? (
              <>
                <p style={{ ...helpStyle, marginTop: 0, fontSize: "0.85rem" }}>
                  Cloud rooms belong to a GitHub account. Sign in to start a room from this plan and invite teammates.
                </p>
                {onLogin && (
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "18px" }}>
                    <button type="button" className="btn btn-primary" onClick={onLogin} data-autofocus>
                      <LogIn size={15} aria-hidden="true" />
                      <span>Sign in with GitHub</span>
                    </button>
                  </div>
                )}
              </>
            ) : (
              <form onSubmit={handleCreateSubmit} noValidate>
                <label htmlFor={`${baseId}-title-input`} style={labelStyle}>
                  Room name
                </label>
                <input
                  id={`${baseId}-title-input`}
                  type="text"
                  data-autofocus
                  maxLength={120}
                  placeholder="e.g. Q4 Platform Migration"
                  value={roomTitle}
                  onChange={(e) => {
                    setRoomTitle(e.target.value);
                    if (createError) setCreateError(null);
                  }}
                  aria-invalid={Boolean(createError)}
                  aria-describedby={`${baseId}-title-help`}
                  style={inputStyle}
                />
                {createError ? (
                  <p id={`${baseId}-title-help`} role="alert" style={{ ...helpStyle, color: "#F87171" }}>
                    {createError}
                  </p>
                ) : (
                  <p id={`${baseId}-title-help`} style={helpStyle}>
                    Copies the plan you are viewing into a new room that syncs live. Anyone with its link can view it;
                    you choose who can edit from Share.
                    {activeRoomId ? " The current room is not changed." : " Your local plan stays as it is."}
                  </p>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
                  <button type="button" className="btn btn-secondary" onClick={close}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={!roomTitle.trim() || isProcessing}>
                    {isProcessing ? <Loader2 size={15} className="spin-sync-icon" aria-hidden="true" /> : <Radio size={15} aria-hidden="true" />}
                    <span>{isProcessing ? "Starting room…" : "Start room"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
