import React, { useEffect, useState } from "react";
import {
  Cloud,
  Radio,
  Users,
  Copy,
  Check,
  Sparkles,
  Eye,
  Edit3,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  WifiOff,
  FolderKanban,
  LogIn,
  LogOut,
  BookmarkPlus,
  GitFork,
  Loader2,
  RotateCcw
} from "lucide-react";
import type { RoomPresence } from "../../firebase/types";
import type { RoomSyncStatus } from "../../hooks/useRoomSync";
import { buildRoomViewerUrl, getTrustedAvatarUrl } from "../../room-storage";
import { useI18n } from "../../i18n/I18nProvider";

export interface CloudBarProps {
  activeRoomId?: string | null;
  activeRoomRole?: "collaborator" | "viewer" | "none";
  activeRoomTitle?: string;
  onlineUsers?: RoomPresence[];
  syncStatus?: RoomSyncStatus;
  syncMessage?: string;
  isProcessing?: boolean;
  onStartCloudRoom?: () => void;
  onOpenShareRoom?: (roomId: string) => void;
  /** Opens the "Join a room" dialog. */
  onOpenRoomModal?: () => void;
  /** Opens the user's rooms (plan manager / hub). */
  onOpenUserHub?: () => void;
  /** Time of the last confirmed sync, shown next to the status. */
  lastSyncTime?: Date;
  /** Shown as "Retry" while the status is an error or offline. */
  onRetrySync?: () => void;
  /** An editor of the room who is signed out. */
  isPendingLoginEditor?: boolean;
  onOpenEditorLogin?: () => void;
  /** "Make a local copy" for view-only rooms. */
  onPromptFork?: () => void;
  /** When false, room creation is replaced by a sign-in prompt. Unknown (undefined) allows it. */
  isSignedIn?: boolean;
  onSignIn?: () => void;
  isRoomOwner?: boolean;
  /** Whether the signed-in user is on the room's member list ("Save to my rooms" is hidden then). */
  isRoomMember?: boolean;
  onSaveRoomToMyRooms?: () => void;
  /** "Leave room" for members who are not the owner (asks for a second click). */
  onLeaveRoom?: (roomId: string) => void;
  /** Included in the copied room link when provided. */
  activeView?: string;
  selectedThemeId?: string;
  /** Called after an action that opens another surface, so a host popover can close itself. */
  onRequestClose?: () => void;
  /** Edits of this user that merges with teammates' changes replaced (useRoomSync `syncConflicts`). */
  syncConflicts?: ReadonlyArray<{ description: string }>;
  /** "Restore my edits" for `syncConflicts` (shown to editors only). */
  onRestoreConflicts?: () => void;
  /** "Keep teammates' versions": dismisses `syncConflicts`. */
  onDismissConflicts?: () => void;
}

/** Replaced edits listed by name; the rest are counted. */
const MAX_LISTED_CONFLICTS = 4;

const panelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  color: "var(--jantt-text, #F8FAFC)",
  fontSize: "13px",
  lineHeight: 1.4
};

const mutedStyle: React.CSSProperties = { color: "var(--jantt-text-muted, #94A3B8)", fontSize: "12px" };

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid var(--jantt-border, rgba(255, 255, 255, 0.12))",
  background: "var(--jantt-surface, rgba(255, 255, 255, 0.04))"
};

const actionButtonStyle: React.CSSProperties = { width: "100%", justifyContent: "flex-start" };

const STATUS_TONE: Record<RoomSyncStatus, { color: string; icon: React.ReactNode }> = {
  idle: { color: "var(--jantt-text-muted, #94A3B8)", icon: <CheckCircle2 size={14} aria-hidden="true" /> },
  "in-sync": { color: "#22C55E", icon: <CheckCircle2 size={14} aria-hidden="true" /> },
  merged: { color: "#10B981", icon: <Sparkles size={14} aria-hidden="true" /> },
  syncing: { color: "var(--jantt-accent, #38BDF8)", icon: <RefreshCw size={14} className="spin-sync-icon" aria-hidden="true" /> },
  conflict: { color: "#F59E0B", icon: <AlertTriangle size={14} aria-hidden="true" /> },
  error: { color: "#F59E0B", icon: <AlertTriangle size={14} aria-hidden="true" /> },
  offline: { color: "#F59E0B", icon: <WifiOff size={14} aria-hidden="true" /> }
};

function initialsOf(user: RoomPresence): string {
  return (user.displayName?.trim()?.[0] || user.username?.[0] || "?").toUpperCase();
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Cloud room panel: the active room's identity, access, sync state and people, or (for local
 * plans) how to start or join a room. Renders as vertical panel content for a popover or menu;
 * it has no positioning or full-width strip styling of its own.
 */
export const CloudBar: React.FC<CloudBarProps> = ({
  activeRoomId,
  activeRoomRole = "none",
  activeRoomTitle,
  onlineUsers = [],
  syncStatus = "idle",
  syncMessage = "",
  isProcessing = false,
  onStartCloudRoom,
  onOpenShareRoom,
  onOpenRoomModal,
  onOpenUserHub,
  lastSyncTime,
  onRetrySync,
  isPendingLoginEditor = false,
  onOpenEditorLogin,
  onPromptFork,
  isSignedIn,
  onSignIn,
  isRoomOwner = false,
  isRoomMember,
  onSaveRoomToMyRooms,
  onLeaveRoom,
  activeView,
  selectedThemeId,
  onRequestClose,
  syncConflicts = [],
  onRestoreConflicts,
  onDismissConflicts
}) => {
  const { t, locale } = useI18n();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    setCopyState("idle");
    setConfirmLeave(false);
  }, [activeRoomId]);

  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 2200);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  useEffect(() => {
    if (!confirmLeave) return;
    const timer = window.setTimeout(() => setConfirmLeave(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmLeave]);

  const run = (action?: () => void) => () => {
    if (!action) return;
    action();
    onRequestClose?.();
  };

  const roomLink = activeRoomId ? buildRoomViewerUrl(activeRoomId, activeView, selectedThemeId) : "";

  const handleCopyLink = async () => {
    if (!roomLink) return;
    setCopyState((await copyToClipboard(roomLink)) ? "copied" : "failed");
  };

  // ─── Local plan ────────────────────────────────────────────────────────────
  if (!activeRoomId) {
    const needsSignIn = isSignedIn === false;
    return (
      <section className="cloud-panel" aria-label={t("bar.cloudCollab")} style={panelStyle}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <Cloud size={18} aria-hidden="true" style={{ color: "var(--jantt-accent, #38BDF8)", flexShrink: 0, marginTop: "1px" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{t("bar.thisPlanLocal")}</div>
            <div style={mutedStyle}>{t("bar.localBody")}</div>
          </div>
        </div>

        {needsSignIn ? (
          onSignIn && (
            <button type="button" className="btn btn-primary" style={actionButtonStyle} onClick={run(onSignIn)}>
              <LogIn size={15} aria-hidden="true" />
              <span>{t("bar.signInToStart")}</span>
            </button>
          )
        ) : (
          onStartCloudRoom && (
            <button
              type="button"
              className="btn btn-primary"
              style={actionButtonStyle}
              onClick={run(onStartCloudRoom)}
              disabled={isProcessing}
              aria-busy={isProcessing}
            >
              {isProcessing ? (
                <Loader2 size={15} className="spin-sync-icon" aria-hidden="true" />
              ) : (
                <Radio size={15} aria-hidden="true" />
              )}
              <span>{isProcessing ? t("bar.startingRoom") : t("bar.startRoom")}</span>
            </button>
          )
        )}

        {onOpenRoomModal && (
          <button type="button" className="btn btn-secondary" style={actionButtonStyle} onClick={run(onOpenRoomModal)}>
            <LogIn size={15} aria-hidden="true" />
            <span>{t("bar.joinRoom")}</span>
          </button>
        )}

        {onOpenUserHub && (
          <button type="button" className="btn btn-secondary" style={actionButtonStyle} onClick={run(onOpenUserHub)}>
            <FolderKanban size={15} aria-hidden="true" />
            <span>{t("bar.myRooms")}</span>
          </button>
        )}
      </section>
    );
  }

  // ─── Active cloud room ─────────────────────────────────────────────────────
  const canEdit = activeRoomRole === "collaborator";
  const tone = STATUS_TONE[syncStatus] ?? STATUS_TONE.idle;
  const showRetry = Boolean(onRetrySync) && (syncStatus === "error" || syncStatus === "offline");
  const lastSyncLabel =
    lastSyncTime && (syncStatus === "in-sync" || syncStatus === "merged")
      ? lastSyncTime.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
      : null;
  const visibleUsers = onlineUsers.slice(0, 6);
  const canSaveRoom = Boolean(onSaveRoomToMyRooms) && isSignedIn !== false && isRoomMember === false && !isRoomOwner;
  const canLeave = Boolean(onLeaveRoom) && isRoomMember === true && !isRoomOwner;

  return (
    <section className="cloud-panel" aria-label={t("bar.cloudRoomAria", { name: activeRoomTitle || activeRoomId })} style={panelStyle}>
      {/* Identity & role */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <span
          aria-hidden="true"
          style={{
            width: "8px",
            height: "8px",
            marginTop: "6px",
            borderRadius: "50%",
            flexShrink: 0,
            background: syncStatus === "offline" ? "#F59E0B" : "#22C55E",
            boxShadow: syncStatus === "offline" ? "none" : "0 0 6px #22C55E"
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={activeRoomTitle || activeRoomId}
          >
            {activeRoomTitle || activeRoomId}
          </div>
          <div style={{ ...mutedStyle, display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <span>{t("bar.cloudRoom")}</span>
            <code style={{ fontSize: "11px", color: "var(--jantt-text-muted, #94A3B8)" }}>#{activeRoomId}</code>
          </div>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            flexShrink: 0,
            padding: "2px 8px",
            borderRadius: "999px",
            fontSize: "11px",
            fontWeight: 700,
            background: canEdit ? "rgba(56, 189, 248, 0.16)" : "rgba(245, 158, 11, 0.16)",
            color: canEdit ? "var(--jantt-accent, #38BDF8)" : "#F59E0B"
          }}
        >
          {canEdit ? <Edit3 size={11} aria-hidden="true" /> : <Eye size={11} aria-hidden="true" />}
          {isRoomOwner ? t("bar.owner") : canEdit ? t("bar.editor") : t("bar.viewOnly")}
        </span>
      </div>

      {/* Sync status */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flex: 1 }}>
          <span style={{ color: tone.color, display: "inline-flex", flexShrink: 0 }}>{tone.icon}</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{syncMessage || t("bar.connected")}</span>
          {lastSyncLabel && <span style={{ ...mutedStyle, flexShrink: 0 }}>· {lastSyncLabel}</span>}
        </div>
        {showRetry && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "4px 10px", fontSize: "12px", flexShrink: 0 }}
            onClick={onRetrySync}
          >
            <RefreshCw size={12} aria-hidden="true" />
            <span>{t("bar.retry")}</span>
          </button>
        )}
      </div>

      {/* Own edits that a merge replaced */}
      {syncConflicts.length > 0 && (
        <div
          role="group"
          aria-label={t("bar.conflictsAria")}
          style={{ ...sectionStyle, borderColor: "rgba(245, 158, 11, 0.45)" }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
            <AlertTriangle size={15} aria-hidden="true" style={{ color: "#F59E0B", flexShrink: 0, marginTop: "1px" }} />
            <div style={{ fontWeight: 600 }}>
              {syncConflicts.length === 1
                ? t("bar.conflictOne")
                : t("bar.conflictMany", { count: syncConflicts.length })}
            </div>
          </div>
          <ul style={{ ...mutedStyle, margin: 0, paddingLeft: "18px", overflowWrap: "anywhere" }}>
            {syncConflicts.slice(0, MAX_LISTED_CONFLICTS).map((conflict, idx) => (
              <li key={idx}>{conflict.description}</li>
            ))}
          </ul>
          {syncConflicts.length > MAX_LISTED_CONFLICTS && (
            <div style={mutedStyle}>
              {t("bar.andMore", { count: syncConflicts.length - MAX_LISTED_CONFLICTS })}
            </div>
          )}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {canEdit && onRestoreConflicts && (
              <button type="button" className="btn btn-primary" style={{ padding: "4px 10px", fontSize: "12px" }} onClick={onRestoreConflicts}>
                <RotateCcw size={12} aria-hidden="true" />
                <span>{t("bar.restoreMine")}</span>
              </button>
            )}
            {onDismissConflicts && (
              <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "12px" }} onClick={onDismissConflicts}>
                <span>{t("bar.keepTheirs")}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* What this user can do */}
      {isPendingLoginEditor ? (
        <div style={sectionStyle}>
          <div style={mutedStyle}>{t("bar.editorSignInHint")}</div>
          {onOpenEditorLogin && (
            <button type="button" className="btn btn-primary" style={actionButtonStyle} onClick={run(onOpenEditorLogin)}>
              <LogIn size={15} aria-hidden="true" />
              <span>{t("bar.signInToEdit")}</span>
            </button>
          )}
        </div>
      ) : (
        !canEdit && (
          <div style={sectionStyle}>
            <div style={mutedStyle}>{t("bar.viewOnlyHint")}</div>
            {onPromptFork && (
              <button type="button" className="btn btn-secondary" style={actionButtonStyle} onClick={run(onPromptFork)}>
                <GitFork size={15} aria-hidden="true" />
                <span>{t("bar.makeLocalCopy")}</span>
              </button>
            )}
            {canSaveRoom && (
              <button type="button" className="btn btn-secondary" style={actionButtonStyle} onClick={onSaveRoomToMyRooms}>
                <BookmarkPlus size={15} aria-hidden="true" />
                <span>{t("bar.saveToMyRooms")}</span>
              </button>
            )}
          </div>
        )
      )}

      {/* People here now */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "24px" }}>
        {visibleUsers.length > 0 ? (
          <span aria-hidden="true" style={{ display: "inline-flex" }}>
            {visibleUsers.map((user, idx) => {
              const avatar = getTrustedAvatarUrl(user.photoURL);
              return (
                <span
                  key={user.uid || idx}
                  title={user.displayName || user.username || t("bar.collaborator")}
                  style={{
                    width: "22px",
                    height: "22px",
                    marginLeft: idx === 0 ? 0 : "-6px",
                    borderRadius: "50%",
                    border: "2px solid var(--jantt-surface-solid, #0F172A)",
                    background: "var(--jantt-accent, #38BDF8)",
                    color: "var(--jantt-accent-contrast, #000000)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "10px",
                    fontWeight: 700,
                    overflow: "hidden"
                  }}
                >
                  {avatar ? (
                    <img src={avatar} alt="" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%" }} />
                  ) : (
                    initialsOf(user)
                  )}
                </span>
              );
            })}
          </span>
        ) : (
          <Users size={15} aria-hidden="true" style={{ color: "var(--jantt-text-muted, #94A3B8)" }} />
        )}
        <span style={mutedStyle}>
          {onlineUsers.length === 0
            ? t("bar.noOneOnline")
            : onlineUsers.length > visibleUsers.length
              ? t("bar.onlineNowMore", {
                  count: onlineUsers.length,
                  more: onlineUsers.length - visibleUsers.length
                })
              : t("bar.onlineNow", { count: onlineUsers.length })}
        </span>
      </div>

      {/* Room actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {onOpenShareRoom && (
          <button
            type="button"
            className="btn btn-primary"
            style={actionButtonStyle}
            onClick={run(() => onOpenShareRoom(activeRoomId))}
          >
            <Users size={15} aria-hidden="true" />
            <span>{isRoomOwner ? t("bar.inviteManage") : t("bar.shareMembers")}</span>
          </button>
        )}

        <button type="button" className="btn btn-secondary" style={actionButtonStyle} onClick={handleCopyLink}>
          {copyState === "copied" ? <Check size={15} aria-hidden="true" style={{ color: "#22C55E" }} /> : <Copy size={15} aria-hidden="true" />}
          <span>{copyState === "copied" ? t("bar.linkCopied") : t("bar.copyRoomLink")}</span>
        </button>
        {copyState === "failed" && (
          <input
            readOnly
            value={roomLink}
            aria-label={t("bar.roomLink")}
            onFocus={(e) => e.currentTarget.select()}
            autoFocus
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "6px 8px",
              borderRadius: "6px",
              border: "1px solid var(--jantt-border, rgba(255, 255, 255, 0.12))",
              background: "var(--jantt-bg, rgba(15, 23, 42, 0.6))",
              color: "var(--jantt-text, #F8FAFC)",
              fontFamily: "var(--jantt-font-mono, monospace)",
              fontSize: "11px"
            }}
          />
        )}

        {onOpenUserHub && (
          <button type="button" className="btn btn-secondary" style={actionButtonStyle} onClick={run(onOpenUserHub)}>
            <FolderKanban size={15} aria-hidden="true" />
            <span>{t("bar.myRooms")}</span>
          </button>
        )}

        {canLeave && onLeaveRoom && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ ...actionButtonStyle, color: "#EF4444" }}
            onClick={() => {
              if (!confirmLeave) {
                setConfirmLeave(true);
                return;
              }
              setConfirmLeave(false);
              onLeaveRoom(activeRoomId);
              onRequestClose?.();
            }}
          >
            <LogOut size={15} aria-hidden="true" />
            <span>{confirmLeave ? t("bar.clickAgainLeave") : t("bar.leaveRoom")}</span>
          </button>
        )}
      </div>
    </section>
  );
};
