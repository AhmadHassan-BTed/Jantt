import React from "react";
import {
  Sparkles,
  CheckCircle2,
  FileJson,
  Layers,
  Kanban,
  Clock,
  RefreshCw,
  CheckSquare,
  Activity,
  StickyNote,
  History,
  ShieldCheck,
  HardDrive,
  Cloud,
  AlertTriangle,
  Radio,
  Users,
  Lock
} from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import type { UserProfile } from "../firebase/types";
import { JanttLogo } from "./JanttLogo";
import type { ActiveView } from "../types";
import { AVAILABLE_THEMES } from "../constants";
import type { SyncStatus } from "../hooks/useDynamicSync";

interface NavbarProps {
  saveStatus: "saved" | "saving" | "pending";
  lastSavedAt: Date;
  autoSaveInterval: string;
  autoSaveLabel: string;
  setShowAutoSaveModal: (show: boolean) => void;
  syncStatus?: SyncStatus;
  syncMessage?: string;
  isQuotaShieldActive?: boolean;
  cloudProvider?: string;
  isGoogleDrive?: boolean;
  snapshotsCount?: number;
  setShowVersionHistoryModal?: (show: boolean) => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  notesCount?: number;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleImportJsonFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedThemeId: string;
  setSelectedThemeId: (themeId: string) => void;
  setShowPromptModal: (show: boolean) => void;
  activeRoomId?: string | null;
  activeRoomRole?: "collaborator" | "viewer" | "none";
  onOpenRoomModal?: () => void;
  currentUser?: FirebaseUser | null;
  userProfile?: UserProfile | null;
  isSigningIn?: boolean;
  onLogin?: () => void;
  onOpenUserHub?: () => void;
  onOpenShareRoom?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  saveStatus,
  lastSavedAt,
  autoSaveInterval,
  autoSaveLabel,
  setShowAutoSaveModal,
  syncStatus,
  syncMessage,
  isQuotaShieldActive,
  cloudProvider,
  isGoogleDrive = false,
  snapshotsCount = 0,
  setShowVersionHistoryModal,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  activeView,
  setActiveView,
  notesCount,
  fileInputRef,
  handleImportJsonFile,
  selectedThemeId,
  setSelectedThemeId,
  setShowPromptModal,
  activeRoomId,
  activeRoomRole,
  onOpenRoomModal,
  currentUser,
  userProfile,
  isSigningIn = false,
  onLogin,
  onOpenUserHub,
  onOpenShareRoom
}) => {
  const isGdrive = isGoogleDrive || cloudProvider === "google-drive";

  return (
    <header className="navbar">
      {/* 1. Left Zone: Brand, AutoSave Status, Dynamic Sync & Version History */}
      <div className="brand-section nav-group-left">
        <JanttLogo size={28} />
        <button
          type="button"
          className={`btn-autosave-badge is-${saveStatus}`}
          onClick={() => setShowAutoSaveModal(true)}
          title={`Last auto-saved: ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} • Cadence: ${autoSaveInterval} • Click to configure`}
        >
          {saveStatus === "saving" ? (
            <RefreshCw size={11} className="spin-sync-icon" />
          ) : saveStatus === "pending" ? (
            <Clock size={11} />
          ) : (
            <CheckCircle2 size={11} />
          )}
          <span>{autoSaveLabel}</span>
        </button>

        {/* Dynamic Real-Time Collaboration Sync Badge */}
        {syncStatus && !activeRoomId && (
          <div
            className={`btn-sync-badge is-${syncStatus}`}
            title={
              syncStatus === "draft"
                ? "This linked cloud source is read-only (view access). Your edits are saved in browser storage, but not written to Google Drive."
                : `Real-Time Collaboration Sync: ${syncMessage || "Live"} • Continuous change detection active`
            }
          >
            {syncStatus === "draft" ? (
              <AlertTriangle size={11} style={{ marginRight: 4, flexShrink: 0 }} />
            ) : (
              <span className="sync-pulse-dot" />
            )}
            <span>{syncMessage || "In sync"}</span>
          </div>
        )}

        {/* Cloud Room Indicator */}
        {activeRoomId && (
          <div
            className={`btn-cloud-source-badge ${activeRoomRole === "collaborator" ? "is-room-collaborator" : "is-room-viewer"}`}
            onClick={onOpenShareRoom || onOpenRoomModal}
            title={
              activeRoomRole === "collaborator"
                ? `Active Cloud Room: "${activeRoomId}" • Live Two-Way Auto-Sync Active • Click to share with teammates`
                : `Active Cloud Room: "${activeRoomId}" • View-Only Mode`
            }
          >
            {activeRoomRole === "collaborator" ? (
              <Radio size={11} className="spin-slow" />
            ) : (
              <Lock size={11} />
            )}
            <span>Room: {activeRoomId} ({activeRoomRole === "collaborator" ? "Live Sync" : "View Only"})</span>
          </div>
        )}

        {/* Google Drive Source Indicator */}
        {isGdrive && !activeRoomId && (
          <div
            className="btn-cloud-source-badge is-google-drive"
            title="Linked to Google Drive JSON file (Read-Only Cloud Feed). Changes you make are stored locally in your browser."
          >
            <HardDrive size={11} />
            <span>Google Drive (View Feed)</span>
          </div>
        )}

        {/* Other Cloud Provider Indicator */}
        {cloudProvider && !isGdrive && !activeRoomId && (
          <div
            className="btn-cloud-source-badge"
            title={`Linked to ${cloudProvider} file (Read-Only Cloud Feed). Changes you make are stored locally in your browser.`}
          >
            <Cloud size={11} />
            <span>{cloudProvider} (View Feed)</span>
          </div>
        )}

        {/* Serverless Quota Shield Indicator */}
        {isQuotaShieldActive && !activeRoomId && (
          <div
            className="btn-quota-shield-badge"
            title="Google Drive Quota Shield is ACTIVE: Request coalescing and edge cache fallback engaged to protect against rate limits (429/403)."
          >
            <ShieldCheck size={11} />
            <span>Quota Shield</span>
          </div>
        )}

        {/* Cloud Room Manage Button */}
        {onOpenRoomModal && (
          <button
            type="button"
            className="btn-nav"
            onClick={onOpenRoomModal}
            title="Cloud Collaboration Rooms (100+ concurrent editors with zero logins)"
          >
            <Users size={12} />
            <span>{activeRoomId ? "Room" : "Collab"}</span>
          </button>
        )}

        {/* Version History & Recovery Vault Button */}
        {setShowVersionHistoryModal && (
          <button
            type="button"
            className="btn-nav btn-version-history"
            onClick={() => setShowVersionHistoryModal(true)}
            title="Version History & Recovery Vault (Roll back to past snapshots with zero data loss)"
          >
            <History size={12} />
            <span>History</span>
            {snapshotsCount > 0 && (
              <span className="history-count-badge">{snapshotsCount}</span>
            )}
          </button>
        )}

        {isSidebarCollapsed && (
          <button
            type="button"
            className="btn-nav btn-restore-sidebar"
            onClick={() => setIsSidebarCollapsed(false)}
            title="Expand JSON Editor Sidebar"
            style={{ marginLeft: "4px" }}
          >
            <FileJson size={13} />
            <span>Show JSON Editor</span>
          </button>
        )}
      </div>

      {/* 2. Center Zone: Primary View Switcher */}
      <div className="nav-group-center">
        <div className="jantt-scale-group">
          <button
            type="button"
            className={`jantt-scale-btn ${activeView === "gantt" ? "is-active" : ""}`}
            onClick={() => setActiveView("gantt")}
            title="Gantt Timeline Schedule"
          >
            <Layers size={13} />
            <span>Gantt</span>
          </button>
          <button
            type="button"
            className={`jantt-scale-btn ${activeView === "kanban" ? "is-active" : ""}`}
            onClick={() => setActiveView("kanban")}
            title="Kanban Task Board"
          >
            <Kanban size={13} />
            <span>Kanban</span>
          </button>
          <button
            type="button"
            className={`jantt-scale-btn ${activeView === "tasks" ? "is-active" : ""}`}
            onClick={() => setActiveView("tasks")}
            title="Detailed Tasks & Interactive Todo Checklist"
          >
            <CheckSquare size={13} />
            <span>Tasks</span>
          </button>
          <button
            type="button"
            className={`jantt-scale-btn ${activeView === "summary" ? "is-active" : ""}`}
            onClick={() => setActiveView("summary")}
            title="Project Health, Schedule Buffers, EVM & Budget Performance"
          >
            <Activity size={13} />
            <span>Health &amp; PM</span>
          </button>
          <button
            type="button"
            className={`jantt-scale-btn ${activeView === "notes" ? "is-active" : ""}`}
            onClick={() => setActiveView("notes")}
            title="Shared Project Notes, Specs & Documentation"
          >
            <StickyNote size={13} />
            <span>Notes</span>
            {typeof notesCount === "number" && notesCount > 0 && (
              <span
                style={{
                  fontSize: "9.5px",
                  fontWeight: 700,
                  padding: "1px 5px",
                  borderRadius: "10px",
                  background: activeView === "notes" ? "rgba(0,0,0,0.18)" : "var(--jantt-border)",
                  color: activeView === "notes" ? "var(--jantt-accent-contrast, #000000)" : "var(--jantt-text-muted)",
                  marginLeft: "2px"
                }}
              >
                {notesCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 3. Right Zone: Theme Selector & AI Prompt */}
      <div className="nav-controls nav-group-right">
        {/* Hidden File Input for JSON Import */}
        <input
          type="file"
          ref={fileInputRef}
          accept=".json,application/json"
          onChange={(e) => {
            handleImportJsonFile(e);
            if (e.target) e.target.value = "";
          }}
          style={{ display: "none" }}
        />

        {/* Theme Selector — Sectioned by Dark Mode & Light Mode */}
        <div className="nav-select-group">
          <label htmlFor="theme-select">Theme:</label>
          <select
            id="theme-select"
            className="select-input"
            value={selectedThemeId}
            onChange={(e) => setSelectedThemeId(e.target.value)}
            title="Visual Theme (Sectioned by Dark & Light Modes)"
          >
            <optgroup label="Dark Modes">
              {AVAILABLE_THEMES.filter((t) => t.mode === "dark").map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Light Modes">
              {AVAILABLE_THEMES.filter((t) => t.mode === "light").map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Prompt AI Button */}
        <button
          type="button"
          className="btn-prompt"
          onClick={() => setShowPromptModal(true)}
          title="Generate AI Prompt for LLM output"
        >
          <Sparkles size={14} />
          <span>AI Prompt</span>
        </button>

        {/* Google Authentication & User Profile Hub */}
        {currentUser && userProfile ? (
          <button
            type="button"
            className="btn-user-profile-chip"
            onClick={onOpenUserHub}
            title={`Logged in as ${userProfile.displayName || "User"} (@${userProfile.username}). Click to open your Personal Hub & Rooms.`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              background: "rgba(56, 189, 248, 0.12)",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              borderRadius: "20px",
              padding: "3px 10px 3px 4px",
              cursor: "pointer",
              transition: "all 0.18s ease"
            }}
          >
            {userProfile.photoURL ? (
              <img
                src={userProfile.photoURL}
                alt={userProfile.displayName || "Avatar"}
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  objectFit: "cover"
                }}
              />
            ) : (
              <div
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  background: "var(--jantt-accent, #38BDF8)",
                  color: "#000",
                  fontWeight: 700,
                  fontSize: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                {(userProfile.displayName?.[0] || userProfile.username?.[0] || "U").toUpperCase()}
              </div>
            )}
            <span
              style={{
                fontSize: "0.82rem",
                fontWeight: 600,
                color: "var(--jantt-accent, #38BDF8)",
                letterSpacing: "0.01em"
              }}
            >
              @{userProfile.username}
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="btn-google-signin"
            onClick={onLogin}
            disabled={isSigningIn}
            title="Sign in with Google to use real-time collaboration rooms and unique usernames"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              background: "rgba(255, 255, 255, 0.08)",
              color: "var(--jantt-text)",
              border: "1px solid var(--jantt-border)",
              borderRadius: "8px",
              padding: "5px 12px",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: isSigningIn ? "wait" : "pointer",
              transition: "all 0.18s ease"
            }}
          >
            {isSigningIn ? (
              <RefreshCw size={13} className="spin-sync-icon" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
            )}
            <span>{isSigningIn ? "Signing in..." : "Google Sign-In"}</span>
          </button>
        )}
      </div>
    </header>
  );
};
