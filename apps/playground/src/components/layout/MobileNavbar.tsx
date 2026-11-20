import React, { useState } from "react";
import { FolderKanban, MoreVertical, Plus, Share2, Eye, KeyRound, ChevronDown } from "lucide-react";
import { JanttLogo } from "../common/JanttLogo";
import type { RoomPresence, UserProfile } from "../../firebase/types";
import type { User as FirebaseUser } from "firebase/auth";
import type { ActiveView } from "../../types";
import { MobileActionMenuSheet } from "./MobileActionMenuSheet";
import type { PanelSlot } from "./Navbar";

interface MobileNavbarProps {
  /**
   * "bar": regular top bar. "floating": a single menu button floating over the chart, used in
   * immersive landscape where the bars are hidden; its menu then also offers the view switcher.
   */
  variant?: "bar" | "floating";
  activePlanName: string;
  handleOpenAddPlanModal: () => void;
  onOpenPlanManager: () => void;
  activeRoomId?: string | null;
  onlineUsers?: RoomPresence[];
  /** Opens the right share flow for the active plan (room invite or link share). */
  onOpenShare: () => void;
  setShowPeopleModal: (show: boolean) => void;
  saveStatus: "saved" | "saving" | "pending";
  autoSaveLabel: string;
  onOpenAutoSave: () => void;
  snapshotsCount?: number;
  onOpenVersionHistory?: () => void;
  selectedThemeId: string;
  setSelectedThemeId: (id: string) => void;
  onOpenPromptModal: () => void;
  onToggleCopilot?: () => void;
  onOpenJsonEditor: () => void;
  onImportFile?: () => void;
  currentUser?: FirebaseUser | null;
  userProfile?: UserProfile | null;
  isGitHubVerified?: boolean;
  onLogin?: () => void;
  /** A GitHub sign-in popup is open (disables the sign-in button). */
  isSigningIn?: boolean;
  onLogout?: () => void;
  onOpenVerificationModal?: () => void;
  isViewer?: boolean;
  onPromptFork?: () => void;
  isPendingLoginEditor?: boolean;
  onOpenEditorLogin?: () => void;
  /** Cloud panel shown in the menu sheet; a function receives `close` (closes the sheet). */
  cloudPanel?: PanelSlot;
  cloudStatusLabel?: string;
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
}

export const MobileNavbar: React.FC<MobileNavbarProps> = ({
  variant = "bar",
  activePlanName,
  handleOpenAddPlanModal,
  onOpenPlanManager,
  activeRoomId,
  onlineUsers = [],
  onOpenShare,
  setShowPeopleModal,
  saveStatus,
  autoSaveLabel,
  onOpenAutoSave,
  snapshotsCount = 0,
  onOpenVersionHistory,
  selectedThemeId,
  setSelectedThemeId,
  onOpenPromptModal,
  onToggleCopilot,
  onOpenJsonEditor,
  onImportFile,
  currentUser,
  userProfile,
  isGitHubVerified = false,
  onLogin,
  isSigningIn = false,
  onLogout,
  onOpenVerificationModal,
  isViewer = false,
  onPromptFork,
  isPendingLoginEditor = false,
  onOpenEditorLogin,
  cloudPanel,
  cloudStatusLabel,
  activeView,
  setActiveView
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isRoomActive = Boolean(activeRoomId);
  const isFloating = variant === "floating";

  const sheet = (
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
      onToggleCopilot={onToggleCopilot}
      onOpenPlanManager={onOpenPlanManager}
      onOpenPeopleModal={() => setShowPeopleModal(true)}
      onOpenJsonEditor={onOpenJsonEditor}
      onImportFile={onImportFile}
      currentUser={currentUser}
      userProfile={userProfile}
      isGitHubVerified={isGitHubVerified}
      onLogin={onLogin}
      isSigningIn={isSigningIn}
      onLogout={onLogout}
      onOpenVerificationModal={onOpenVerificationModal}
      cloudPanel={cloudPanel}
      cloudStatusLabel={cloudStatusLabel}
      activeView={isFloating ? activeView : undefined}
      setActiveView={isFloating ? setActiveView : undefined}
    />
  );

  if (isFloating) {
    return (
      <>
        <button
          type="button"
          className="mobile-immersive-fab"
          onClick={() => setIsMenuOpen(true)}
          aria-label={`Open menu: views, plans and settings (current plan: ${activePlanName})`}
          aria-haspopup="dialog"
          aria-expanded={isMenuOpen}
        >
          <MoreVertical size={18} aria-hidden="true" />
          {isRoomActive && <span className="mobile-room-pulse-dot" aria-hidden="true" />}
        </button>
        {sheet}
      </>
    );
  }

  return (
    <>
      <header className="mobile-navbar">
        {/* Left: Brand + Plan Title Pill */}
        <div className="mobile-nav-left">
          <button
            type="button"
            className="mobile-logo-wrap"
            onClick={onOpenPlanManager}
            title="Open plans"
            aria-label="Open plan manager"
          >
            <JanttLogo size={24} />
          </button>

          <button
            type="button"
            className="mobile-plan-selector-pill"
            onClick={onOpenPlanManager}
            title={`Current plan: ${activePlanName}. Tap to switch or manage plans.`}
            aria-label={`Current plan: ${activePlanName}${isRoomActive ? " (live cloud room)" : ""}. Switch or manage plans`}
          >
            <FolderKanban size={13} style={{ color: "var(--jantt-accent, #38BDF8)", flexShrink: 0 }} aria-hidden="true" />
            <span className="mobile-plan-name">{activePlanName}</span>
            {isRoomActive && (
              <span
                className="mobile-room-indicator"
                title={`Live room${onlineUsers.length > 0 ? ` (${onlineUsers.length} online)` : ""}`}
                aria-hidden="true"
              >
                <span className="mobile-room-pulse-dot" />
              </span>
            )}
            <ChevronDown size={12} style={{ opacity: 0.6, flexShrink: 0 }} aria-hidden="true" />
          </button>

          {isPendingLoginEditor ? (
            <button
              type="button"
              className="mobile-role-chip is-pending-editor"
              onClick={() => onOpenEditorLogin?.()}
              title="Editor invite. Tap to sign in and edit live."
            >
              <KeyRound size={10} aria-hidden="true" />
              <span>Sign in to Edit</span>
            </button>
          ) : isViewer ? (
            <button
              type="button"
              className="mobile-role-chip is-viewer"
              onClick={() => onPromptFork?.()}
              title="Read-only room. Tap to make a local copy to edit."
            >
              <Eye size={10} aria-hidden="true" />
              <span>Viewer</span>
            </button>
          ) : null}
        </div>

        {/* Right: Quick Action Buttons & Menu Trigger */}
        <div className="mobile-nav-right">
          <button
            type="button"
            className="mobile-nav-icon-btn"
            onClick={onOpenShare}
            title={isRoomActive ? "Invite & share room" : "Share plan"}
            aria-label={isRoomActive ? "Invite people and share this room" : "Share this plan"}
          >
            <Share2 size={16} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="mobile-nav-icon-btn"
            onClick={handleOpenAddPlanModal}
            title="Create New Plan"
            aria-label="Create a new plan"
          >
            <Plus size={16} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="mobile-nav-icon-btn is-menu-trigger"
            onClick={() => setIsMenuOpen(true)}
            title="Tools & Settings Menu"
            aria-label="Open tools and settings menu"
            aria-haspopup="dialog"
            aria-expanded={isMenuOpen}
          >
            <MoreVertical size={17} aria-hidden="true" />
          </button>
        </div>
      </header>

      {sheet}
    </>
  );
};
