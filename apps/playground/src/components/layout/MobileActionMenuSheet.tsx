import React from "react";
import {
  X,
  History,
  Clock,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  FileJson,
  Palette,
  Github,
  LogOut,
  FolderKanban,
  Users
} from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import type { UserProfile } from "../../firebase/types";
import { AVAILABLE_THEMES } from "../../constants";

interface MobileActionMenuSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selectedThemeId: string;
  setSelectedThemeId: (id: string) => void;
  saveStatus: "saved" | "saving" | "pending";
  autoSaveLabel: string;
  onOpenAutoSave: () => void;
  snapshotsCount?: number;
  onOpenVersionHistory?: () => void;
  onOpenPromptModal: () => void;
  onOpenPlanManager: () => void;
  onOpenPeopleModal: () => void;
  onOpenJsonEditor: () => void;
  currentUser?: FirebaseUser | null;
  userProfile?: UserProfile | null;
  isGitHubVerified?: boolean;
  onLogin?: () => void;
  onLogout?: () => void;
  onOpenVerificationModal?: () => void;
}

export const MobileActionMenuSheet: React.FC<MobileActionMenuSheetProps> = ({
  isOpen,
  onClose,
  selectedThemeId,
  setSelectedThemeId,
  saveStatus,
  autoSaveLabel,
  onOpenAutoSave,
  snapshotsCount = 0,
  onOpenVersionHistory,
  onOpenPromptModal,
  onOpenPlanManager,
  onOpenPeopleModal,
  onOpenJsonEditor,
  currentUser,
  userProfile,
  isGitHubVerified = false,
  onLogin,
  onLogout,
  onOpenVerificationModal
}) => {
  if (!isOpen) return null;

  return (
    <div className="mobile-sheet-backdrop" onClick={onClose}>
      <div
        className="mobile-sheet-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Quick Actions & Settings Menu"
      >
        <div className="mobile-sheet-pull-handle" aria-hidden="true" />

        <div className="mobile-sheet-header">
          <h3 className="mobile-sheet-title">Tools &amp; Settings</h3>
          <button
            type="button"
            className="mobile-sheet-close-btn"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mobile-sheet-body">
          {/* User Account Section */}
          <div className="mobile-menu-section">
            <span className="mobile-menu-section-label">Account &amp; Cloud</span>
            {currentUser ? (
              <div className="mobile-menu-user-row">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {(userProfile?.photoURL || currentUser.photoURL) ? (
                    <img
                      src={userProfile?.photoURL || currentUser.photoURL || ""}
                      alt={userProfile?.username || "User"}
                      className="mobile-menu-user-avatar"
                    />
                  ) : (
                    <div className="mobile-menu-user-avatar-fallback">
                      {(userProfile?.username || currentUser.displayName || "U")[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "13px" }}>
                      @{userProfile?.username || currentUser.displayName || "User"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                      {isGitHubVerified ? (
                        "GitHub Verified"
                      ) : onOpenVerificationModal ? (
                        <button
                          type="button"
                          style={{ background: "none", border: "none", color: "var(--jantt-accent)", padding: 0, font: "inherit", cursor: "pointer", textDecoration: "underline" }}
                          onClick={() => {
                            onOpenVerificationModal();
                            onClose();
                          }}
                        >
                          Verify GitHub Profile
                        </button>
                      ) : (
                        "Cloud Member"
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="mobile-menu-item-btn is-logout"
                  onClick={() => {
                    onLogout?.();
                    onClose();
                  }}
                  title="Sign Out"
                >
                  <LogOut size={14} />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="mobile-menu-item-btn is-accent"
                onClick={() => {
                  onLogin?.();
                  onClose();
                }}
              >
                <Github size={15} />
                <span>Sign in with GitHub</span>
              </button>
            )}
          </div>

          {/* Core Plan & JSON State */}
          <div className="mobile-menu-section">
            <span className="mobile-menu-section-label">Project &amp; Data</span>
            <div className="mobile-menu-grid">
              <button
                type="button"
                className="mobile-menu-tile"
                onClick={() => {
                  onOpenPlanManager();
                  onClose();
                }}
              >
                <FolderKanban size={16} style={{ color: "var(--jantt-accent)" }} />
                <span>Manage Plans</span>
              </button>

              <button
                type="button"
                className="mobile-menu-tile"
                onClick={() => {
                  onOpenPeopleModal();
                  onClose();
                }}
              >
                <Users size={16} style={{ color: "#22C55E" }} />
                <span>People &amp; Teams</span>
              </button>

              <button
                type="button"
                className="mobile-menu-tile"
                onClick={() => {
                  onOpenJsonEditor();
                  onClose();
                }}
              >
                <FileJson size={16} style={{ color: "#EAB308" }} />
                <span>JSON Editor</span>
              </button>

              <button
                type="button"
                className="mobile-menu-tile"
                onClick={() => {
                  onOpenPromptModal();
                  onClose();
                }}
              >
                <Sparkles size={16} style={{ color: "#A855F7" }} />
                <span>Prompt AI</span>
              </button>
            </div>
          </div>

          {/* AutoSave & History */}
          <div className="mobile-menu-section">
            <span className="mobile-menu-section-label">State &amp; Recovery</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <button
                type="button"
                className="mobile-menu-list-row"
                onClick={() => {
                  onOpenAutoSave();
                  onClose();
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {saveStatus === "saving" ? (
                    <RefreshCw size={14} className="spin-sync-icon" />
                  ) : saveStatus === "pending" ? (
                    <Clock size={14} />
                  ) : (
                    <CheckCircle2 size={14} style={{ color: "#22C55E" }} />
                  )}
                  <span>AutoSave Cadence</span>
                </div>
                <span className="mobile-menu-badge">{autoSaveLabel}</span>
              </button>

              {onOpenVersionHistory && (
                <button
                  type="button"
                  className="mobile-menu-list-row"
                  onClick={() => {
                    onOpenVersionHistory();
                    onClose();
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <History size={14} />
                    <span>Version History Vault</span>
                  </div>
                  {snapshotsCount > 0 && (
                    <span className="mobile-menu-badge">{snapshotsCount} snapshots</span>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Theme Selector */}
          <div className="mobile-menu-section">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span className="mobile-menu-section-label" style={{ margin: 0 }}>Theme</span>
              <Palette size={13} style={{ opacity: 0.6 }} />
            </div>
            <select
              className="select-input mobile-theme-select"
              value={selectedThemeId}
              onChange={(e) => setSelectedThemeId(e.target.value)}
              aria-label="Color theme selection"
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
        </div>
      </div>
    </div>
  );
};
