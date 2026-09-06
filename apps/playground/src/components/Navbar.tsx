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
  Star
} from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import type { UserProfile } from "../firebase/types";
import { JanttLogo } from "./JanttLogo";
import type { ActiveView } from "../types";
import { AVAILABLE_THEMES } from "../constants";

interface NavbarProps {
  saveStatus: "saved" | "saving" | "pending";
  lastSavedAt: Date;
  autoSaveInterval: string;
  autoSaveLabel: string;
  setShowAutoSaveModal: (show: boolean) => void;
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
  currentUser?: FirebaseUser | null;
  userProfile?: UserProfile | null;
  isSigningIn?: boolean;
  onLogin?: () => void;
  onOpenUserHub?: () => void;
  isGitHubVerified?: boolean;
  onOpenVerificationModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  saveStatus,
  lastSavedAt,
  autoSaveInterval,
  autoSaveLabel,
  setShowAutoSaveModal,
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
  currentUser,
  userProfile,
  isSigningIn = false,
  onLogin,
  onOpenUserHub,
  isGitHubVerified = false,
  onOpenVerificationModal
}) => {
  return (
    <header className="navbar">
      {/* 1. Left Zone: Brand, AutoSave Status & Version History */}
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

        {/* GitHub Authentication & User Profile Hub */}
        {currentUser && userProfile ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
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

            {/* GitHub Verification Badge */}
            {onOpenVerificationModal && (
              <button
                type="button"
                onClick={onOpenVerificationModal}
                title={
                  isGitHubVerified
                    ? "GitHub Verification Active: Starred & following requirements satisfied. Cloud rooms unlocked!"
                    : "Action Required: Star developer repos & follow creator to unlock cloud collaboration rooms."
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  background: isGitHubVerified ? "rgba(34, 197, 94, 0.15)" : "rgba(245, 158, 11, 0.18)",
                  border: isGitHubVerified ? "1px solid rgba(34, 197, 94, 0.35)" : "1px solid rgba(245, 158, 11, 0.45)",
                  color: isGitHubVerified ? "#22c55e" : "#f59e0b",
                  borderRadius: "14px",
                  padding: "3px 9px",
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.18s ease"
                }}
              >
                {isGitHubVerified ? (
                  <CheckCircle2 size={11} />
                ) : (
                  <Star size={11} />
                )}
                <span>{isGitHubVerified ? "Cloud Active" : "Verify Cloud"}</span>
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="btn-github-signin"
            onClick={onLogin}
            disabled={isSigningIn}
            title="Sign in with GitHub to unlock real-time multi-user cloud collaboration rooms"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              background: "rgba(255, 255, 255, 0.08)",
              color: "var(--jantt-text, #f0f6fc)",
              border: "1px solid var(--jantt-border, rgba(255,255,255,0.15))",
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
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            )}
            <span>{isSigningIn ? "Signing in..." : "Sign in with GitHub"}</span>
          </button>
        )}
      </div>
    </header>
  );
};
