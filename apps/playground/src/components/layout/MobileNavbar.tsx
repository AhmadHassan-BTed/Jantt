import React, { useState } from "react";
import { FolderKanban, MoreVertical, Plus, Share2, Eye, KeyRound } from "lucide-react";
import { JanttLogo } from "../common/JanttLogo";
import type { SavedProject } from "../../types";
import type { UserRoomPointer, RoomPresence, UserProfile } from "../../firebase/types";
import type { User as FirebaseUser } from "firebase/auth";
import { DEFAULT_TEMPLATE } from "../../constants";
import { MobileActionMenuSheet } from "./MobileActionMenuSheet";

interface MobileNavbarProps {
  activeProjectId: string;
  customProjects: SavedProject[];
  handleSelectProject?: (id: string) => void;
  handleOpenAddPlanModal: () => void;
  onOpenPlanManager: () => void;
  activeRoomId?: string | null;
  activeRoomTitle?: string;
  onlineUsers?: RoomPresence[];
  onOpenShareRoom?: (roomId: string) => void;
  setShowShareModal: (show: boolean) => void;
  setShowPeopleModal: (show: boolean) => void;
  saveStatus: "saved" | "saving" | "pending";
  autoSaveLabel: string;
  onOpenAutoSave: () => void;
  snapshotsCount?: number;
  onOpenVersionHistory?: () => void;
  selectedThemeId: string;
  setSelectedThemeId: (id: string) => void;
  onOpenPromptModal: () => void;
  onOpenJsonEditor: () => void;
  currentUser?: FirebaseUser | null;
  userProfile?: UserProfile | null;
  isGitHubVerified?: boolean;
  onLogin?: () => void;
  onLogout?: () => void;
  onOpenVerificationModal?: () => void;
  ownedRooms?: UserRoomPointer[];
  sharedRooms?: UserRoomPointer[];
  isViewer?: boolean;
  onPromptFork?: () => void;
  isPendingLoginEditor?: boolean;
  onOpenEditorLogin?: () => void;
}

export const MobileNavbar: React.FC<MobileNavbarProps> = ({
  activeProjectId,
  customProjects,
  handleOpenAddPlanModal,
  onOpenPlanManager,
  activeRoomId,
  activeRoomTitle,
  onlineUsers = [],
  onOpenShareRoom,
  setShowShareModal,
  setShowPeopleModal,
  saveStatus,
  autoSaveLabel,
  onOpenAutoSave,
  snapshotsCount = 0,
  onOpenVersionHistory,
  selectedThemeId,
  setSelectedThemeId,
  onOpenPromptModal,
  onOpenJsonEditor,
  currentUser,
  userProfile,
  isGitHubVerified = false,
  onLogin,
  onLogout,
  onOpenVerificationModal,
  ownedRooms = [],
  sharedRooms = [],
  isViewer = false,
  onPromptFork,
  isPendingLoginEditor = false,
  onOpenEditorLogin
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isRoomActive = Boolean(activeRoomId);

  // Derive display title for current plan
  const activePlanName = (() => {
    if (activeProjectId === "default") return DEFAULT_TEMPLATE.name;
    const custom = customProjects.find((p) => p.id === activeProjectId);
    if (custom) return custom.name;
    const owned = ownedRooms.find((r) => `room-${r.roomId}` === activeProjectId);
    if (owned) return owned.title;
    const shared = sharedRooms.find((s) => `room-${s.roomId}` === activeProjectId);
    if (shared) return shared.title;
    return activeRoomTitle || "Active Plan";
  })();

  return (
    <>
      <header className="mobile-navbar">
        {/* Left: Brand + Plan Title Pill */}
        <div className="mobile-nav-left">
          <div className="mobile-logo-wrap" onClick={onOpenPlanManager} title="Jantt Home">
            <JanttLogo size={24} />
          </div>

          <div className="mobile-plan-selector-pill" onClick={onOpenPlanManager}>
            <FolderKanban size={13} style={{ color: "var(--jantt-accent, #38BDF8)", flexShrink: 0 }} />
            <span className="mobile-plan-name">{activePlanName}</span>
            {isRoomActive && (
              <span
                className="mobile-room-indicator"
                title={`Room #${activeRoomId}${onlineUsers.length > 0 ? ` (${onlineUsers.length} online)` : ""}`}
              >
                <span className="mobile-room-pulse-dot" />
              </span>
            )}
          </div>

          {isPendingLoginEditor ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenEditorLogin?.();
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                padding: "3px 7px",
                fontSize: "10px",
                fontWeight: 700,
                borderRadius: "6px",
                background: "linear-gradient(135deg, #0ea5e9, #6366f1)",
                color: "#ffffff",
                border: "none",
                cursor: "pointer",
                flexShrink: 0
              }}
              title="Editor Invite. Tap to sign in and edit live."
            >
              <KeyRound size={10} />
              <span>Sign in to Edit</span>
            </button>
          ) : isViewer ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPromptFork?.();
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                padding: "3px 7px",
                fontSize: "10px",
                fontWeight: 700,
                borderRadius: "6px",
                background: "rgba(245, 158, 11, 0.2)",
                border: "1px solid rgba(245, 158, 11, 0.4)",
                color: "#f59e0b",
                cursor: "pointer",
                flexShrink: 0
              }}
              title="Read-Only Room. Tap to make a local copy to edit."
            >
              <Eye size={10} />
              <span>Viewer</span>
            </button>
          ) : null}
        </div>

        {/* Right: Quick Action Buttons & Menu Trigger */}
        <div className="mobile-nav-right">
          {/* Quick Share Button */}
          <button
            type="button"
            className="mobile-nav-icon-btn"
            onClick={() => {
              if (activeRoomId && onOpenShareRoom) {
                onOpenShareRoom(activeRoomId);
              } else {
                setShowShareModal(true);
              }
            }}
            title="Share Plan"
            aria-label="Share active project plan"
          >
            <Share2 size={16} />
          </button>

          {/* Quick Add Plan Button */}
          <button
            type="button"
            className="mobile-nav-icon-btn"
            onClick={handleOpenAddPlanModal}
            title="Create New Plan"
            aria-label="Add new plan"
          >
            <Plus size={16} />
          </button>

          {/* Menu Trigger */}
          <button
            type="button"
            className="mobile-nav-icon-btn is-menu-trigger"
            onClick={() => setIsMenuOpen(true)}
            title="Tools & Settings Menu"
            aria-label="Open tools and settings menu"
          >
            <MoreVertical size={17} />
          </button>
        </div>
      </header>

      <MobileActionMenuSheet
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        selectedThemeId={selectedThemeId}
        setSelectedThemeId={setSelectedThemeId}
        saveStatus={saveStatus}
        autoSaveLabel={autoSaveLabel}
        onOpenAutoSave={onOpenAutoSave}
        snapshotsCount={snapshotsCount}
        onOpenVersionHistory={onOpenVersionHistory}
        onOpenPromptModal={onOpenPromptModal}
        onOpenPlanManager={onOpenPlanManager}
        onOpenPeopleModal={() => setShowPeopleModal(true)}
        onOpenJsonEditor={onOpenJsonEditor}
        currentUser={currentUser}
        userProfile={userProfile}
        isGitHubVerified={isGitHubVerified}
        onLogin={onLogin}
        onLogout={onLogout}
        onOpenVerificationModal={onOpenVerificationModal}
      />
    </>
  );
};
