import React, { useState } from "react";
import {
  Cloud,
  Radio,
  Users,
  Copy,
  Check,
  Sparkles,
  Shield,
  Eye,
  Edit3,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FolderKanban,
  LogIn,
  ArrowRight
} from "lucide-react";
import type { RoomPresence } from "../firebase/types";
import type { RoomSyncStatus } from "../hooks/useRoomSync";

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
  onOpenRoomModal?: () => void; // Join Room modal
  onOpenUserHub?: () => void;   // My Rooms modal
}

export const CloudBar: React.FC<CloudBarProps> = ({
  activeRoomId,
  activeRoomRole = "none",
  activeRoomTitle,
  onlineUsers = [],
  syncStatus = "in-sync",
  syncMessage = "In sync",
  isProcessing = false,
  onStartCloudRoom,
  onOpenShareRoom,
  onOpenRoomModal,
  onOpenUserHub
}) => {
  const [copiedLink, setCopiedLink] = useState(false);

  const isRoomActive = Boolean(activeRoomId);

  const handleCopyLink = async () => {
    if (!activeRoomId || typeof window === "undefined") return;
    try {
      const origin = window.location.origin + window.location.pathname;
      const link = `${origin}?room=${encodeURIComponent(activeRoomId)}`;
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {}
  };

  return (
    <div className={`cloud-bar ${isRoomActive ? "is-live-room" : "is-local-mode"}`}>
      {/* ─── State A: Active Live Cloud Room ─── */}
      {isRoomActive ? (
        <>
          {/* Left: Live Room Identity & Status */}
          <div className="cloud-bar-left">
            <div className="cloud-bar-room-badge" title={`Active Cloud Room: ${activeRoomId}`}>
              <span className="cloud-bar-pulse-dot" />
              <Radio size={12} className="cloud-bar-radio-icon" />
              <span className="cloud-bar-room-label">
                Live Room: <strong>{activeRoomTitle || activeRoomId}</strong>
              </span>
              <span className="cloud-bar-room-id">#{activeRoomId}</span>
            </div>

            {/* User Role Pill */}
            <div
              className={`cloud-bar-role-pill is-${activeRoomRole}`}
              title={
                activeRoomRole === "collaborator"
                  ? "Editor: Full two-way live collaboration and auto-sync"
                  : "Viewer: Read-only access to this cloud room"
              }
            >
              {activeRoomRole === "collaborator" ? (
                <>
                  <Edit3 size={11} />
                  <span>Editor</span>
                </>
              ) : (
                <>
                  <Eye size={11} />
                  <span>Viewer</span>
                </>
              )}
            </div>

            {/* ACID OCC Sync Status */}
            <div
              className={`cloud-bar-sync-status is-${syncStatus}`}
              title={`Real-Time Engine: ${syncMessage}`}
            >
              {syncStatus === "syncing" ? (
                <RefreshCw size={11} className="spin-sync-icon" />
              ) : syncStatus === "merged" ? (
                <Sparkles size={11} style={{ color: "#10b981" }} />
              ) : syncStatus === "error" || syncStatus === "conflict" ? (
                <AlertTriangle size={11} style={{ color: "#f59e0b" }} />
              ) : (
                <CheckCircle2 size={11} style={{ color: "#22c55e" }} />
              )}
              <span>{syncMessage}</span>
            </div>
          </div>

          {/* Center: Live Online Collaborators Stack */}
          <div className="cloud-bar-center">
            {onlineUsers.length > 0 ? (
              <div
                className="cloud-bar-presence-group"
                onClick={() => activeRoomId && onOpenShareRoom?.(activeRoomId)}
                title={`${onlineUsers.length} collaborator${onlineUsers.length > 1 ? "s" : ""} online now. Click to view roster & manage.`}
              >
                <div className="cloud-bar-avatar-stack">
                  {onlineUsers.slice(0, 5).map((user, idx) => (
                    <div
                      key={user.uid || idx}
                      className="cloud-bar-avatar-pill"
                      style={{ zIndex: 5 - idx }}
                      title={`${user.displayName || user.username || "Collaborator"}${user.isOwner ? " (Owner)" : ""}`}
                    >
                      {user.photoURL ? (
                        <img src={user.photoURL} alt={user.displayName || "User"} />
                      ) : (
                        <span>{(user.displayName?.[0] || user.username?.[0] || "P").toUpperCase()}</span>
                      )}
                    </div>
                  ))}
                  {onlineUsers.length > 5 && (
                    <div className="cloud-bar-avatar-more" style={{ zIndex: 0 }}>
                      +{onlineUsers.length - 5}
                    </div>
                  )}
                </div>
                <div className="cloud-bar-presence-text">
                  <span className="cloud-bar-live-dot" />
                  <span>{onlineUsers.length} online</span>
                </div>
              </div>
            ) : (
              <div className="cloud-bar-presence-empty">
                <Users size={12} style={{ opacity: 0.6 }} />
                <span>You are the only one in this room</span>
              </div>
            )}
          </div>

          {/* Right: Room Actions (Invite Teammates & Teams, Copy Link, Room Hub) */}
          <div className="cloud-bar-right">
            <button
              type="button"
              className="cloud-bar-btn is-primary"
              onClick={() => activeRoomId && onOpenShareRoom?.(activeRoomId)}
              title="Add individuals by username, bulk-invite entire teams, or generate invite links"
            >
              <Users size={13} />
              <span>Invite &amp; Teams</span>
            </button>

            <button
              type="button"
              className="cloud-bar-btn is-secondary"
              onClick={handleCopyLink}
              title="Copy direct join link to clipboard"
            >
              {copiedLink ? <Check size={13} style={{ color: "#22c55e" }} /> : <Copy size={13} />}
              <span>{copiedLink ? "Link Copied!" : "Copy Link"}</span>
            </button>

            {onOpenUserHub && (
              <button
                type="button"
                className="cloud-bar-btn is-ghost"
                onClick={onOpenUserHub}
                title="Open your Personal Cloud Rooms & Hub"
              >
                <FolderKanban size={13} />
                <span>My Rooms</span>
              </button>
            )}
          </div>
        </>
      ) : (
        /* ─── State B: Local Plan / Template (Offline Mode) ─── */
        <>
          {/* Left: Local Mode Indicator */}
          <div className="cloud-bar-left">
            <div className="cloud-bar-local-pill" title="This plan is stored locally in your browser">
              <Shield size={12} style={{ color: "var(--jantt-accent, #38bdf8)" }} />
              <span>Local Plan</span>
              <span className="cloud-bar-local-sub">(Private / Offline)</span>
            </div>
          </div>

          {/* Center: Value Proposition Micro-copy */}
          <div className="cloud-bar-center">
            <div className="cloud-bar-local-hint">
              <Cloud size={13} style={{ color: "var(--jantt-accent, #38bdf8)", flexShrink: 0 }} />
              <span>Real-time cloud collaboration available: 100+ concurrent editors, live presence &amp; 0 conflicts.</span>
            </div>
          </div>

          {/* Right: Cloud Onboarding Actions */}
          <div className="cloud-bar-right">
            {onStartCloudRoom && (
              <button
                type="button"
                className="cloud-bar-btn is-primary is-glowing"
                onClick={onStartCloudRoom}
                disabled={isProcessing}
                title="Start a live Cloud Room from this plan and invite teammates"
              >
                <Sparkles size={13} />
                <span>Start Cloud Room</span>
                <ArrowRight size={12} />
              </button>
            )}

            {onOpenRoomModal && (
              <button
                type="button"
                className="cloud-bar-btn is-secondary"
                onClick={onOpenRoomModal}
                title="Join an existing Cloud Room via Room ID or Secret Key"
              >
                <LogIn size={13} />
                <span>Join Room</span>
              </button>
            )}

            {onOpenUserHub && (
              <button
                type="button"
                className="cloud-bar-btn is-ghost"
                onClick={onOpenUserHub}
                title="View your saved Cloud Rooms & Collaboration Hub"
              >
                <FolderKanban size={13} />
                <span>My Rooms</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
