import React from "react";
import { MoreVertical, Share2, Eye, KeyRound, ChevronDown, Sparkles, WifiOff } from "lucide-react";
import { JanttIcon, JanttLogo } from "../common/JanttLogo";
import type { RoomPresence, UserProfile } from "../../firebase/types";
import type { User as FirebaseUser } from "firebase/auth";
import type { ActiveView } from "../../types";
import { MobileActionMenuSheet } from "./MobileActionMenuSheet";
import type { PanelSlot } from "./Navbar";
import { Layers, Kanban, CheckSquare, Activity, StickyNote } from "lucide-react";
import { triggerHaptic } from "../../services/platform";

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
  /** Controlled Tools & Settings sheet, so Android Back can close it like any other overlay. */
  isMenuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  isOnline: boolean;
  isCopilotOpen: boolean;
  updateAvailable: boolean;
  canInstall: boolean;
  isIosSafari: boolean;
  isStandalone: boolean;
  onInstall: () => void;
  onApplyUpdate: () => void;
  appModeLabel: string;
  notesCount?: number;
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
  setActiveView,
  isMenuOpen,
  onMenuOpenChange,
  isOnline,
  isCopilotOpen,
  updateAvailable,
  canInstall,
  isIosSafari,
  isStandalone,
  onInstall,
  onApplyUpdate,
  appModeLabel,
  notesCount = 0
}) => {
  const isRoomActive = Boolean(activeRoomId);
  const isFloating = variant === "floating";

  const sheet = (
    <MobileActionMenuSheet
      isOpen={isMenuOpen}
      onClose={() => onMenuOpenChange(false)}
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
      onCreateNewPlan={handleOpenAddPlanModal}
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
      activeView={activeView}
      setActiveView={setActiveView}
      canInstall={canInstall}
      isIosSafari={isIosSafari}
      isStandalone={isStandalone}
      onInstall={onInstall}
      updateAvailable={updateAvailable}
      onApplyUpdate={onApplyUpdate}
      appModeLabel={appModeLabel}
    />
  );

  if (isFloating) {
    return (
      <>
        <header className="mobile-landscape-rail">
          <button type="button" className="mobile-landscape-plan-btn" onClick={onOpenPlanManager} aria-label={`Manage plan: ${activePlanName}`}>
            <JanttIcon size={16} />
            <span className="mobile-landscape-plan-name">{activePlanName}</span>
            {isOnline ? isRoomActive && <span className="mobile-room-pulse-dot" aria-label="Live" /> : <WifiOff size={12} aria-label="Offline" />}
            <ChevronDown size={11} className="mobile-plan-chevron" aria-hidden="true" />
          </button>
          <nav className="mobile-landscape-tabs" aria-label="View navigation">
            {([
              { id: "gantt", label: "Timeline", icon: <Layers size={14} /> },
              { id: "kanban", label: "Board", icon: <Kanban size={14} /> },
              { id: "tasks", label: "Tasks", icon: <CheckSquare size={14} /> },
              { id: "summary", label: "Health", icon: <Activity size={14} /> },
              { id: "notes", label: "Notes", icon: <StickyNote size={14} /> }
            ] as const).map((tab) => {
              const active = activeView === tab.id || (tab.id === "gantt" && activeView === "canvas");
              return <button key={tab.id} type="button" className={`mobile-landscape-tab ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => { triggerHaptic("light"); setActiveView(tab.id); }}>
                {tab.icon}<span>{tab.label}</span>{tab.id === "notes" && notesCount > 0 && <span className="mobile-nav-badge">{notesCount}</span>}
              </button>;
            })}
          </nav>
          <div className="mobile-landscape-actions">
            <button type="button" className="mobile-nav-icon-btn" onClick={() => onToggleCopilot?.()} aria-label="Open AI Copilot"><Sparkles size={16} /></button>
            <button type="button" className="mobile-nav-icon-btn" onClick={onOpenShare} aria-label="Share plan"><Share2 size={16} /></button>
            <button type="button" className="mobile-nav-icon-btn is-menu-trigger" onClick={() => onMenuOpenChange(true)} aria-label="Open tools and settings menu" aria-haspopup="dialog" aria-expanded={isMenuOpen}><MoreVertical size={16} />{updateAvailable && <span className="mobile-update-dot" />}</button>
          </div>
        </header>
        {sheet}
      </>
    );
  }

  return (
    <>
      <header className="mobile-navbar">
        {/* Left: tappable brand + plan switcher pill */}
        <div className="mobile-nav-left">
          <button
            type="button"
            className="mobile-plan-selector-pill"
            onClick={onOpenPlanManager}
            title={`Current plan: ${activePlanName}. Tap to switch or manage plans.`}
            aria-label={`Current plan: ${activePlanName}${isRoomActive ? " (live cloud room)" : ""}${
              isOnline ? "" : " (offline)"
            }. Switch or manage plans`}
          >
            <span className="mobile-brand-mark" aria-hidden="true">
              <JanttLogo size={20} />
            </span>
            <span className="mobile-plan-name">{activePlanName}</span>
            {!isOnline ? (
              <span className="mobile-offline-badge">
                <WifiOff size={10} aria-hidden="true" />
                <span>Offline</span>
              </span>
            ) : isRoomActive ? (
              <span
                className="mobile-room-indicator"
                title={`Live room${onlineUsers.length > 0 ? ` (${onlineUsers.length} online)` : ""}`}
                aria-hidden="true"
              >
                <span className="mobile-room-pulse-dot" />
              </span>
            ) : null}
            <ChevronDown size={12} className="mobile-plan-chevron" aria-hidden="true" />
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

        {/* Right: three crisp thumb targets; New Plan lives in the plan manager and sheet. */}
        <div className="mobile-nav-right">
          <button
            type="button"
            className={`mobile-nav-icon-btn is-copilot ${isCopilotOpen ? "is-active" : ""}`}
            onClick={() => onToggleCopilot?.()}
            title={isCopilotOpen ? "Close AI Copilot" : "Open AI Copilot"}
            aria-label={isCopilotOpen ? "Close AI Copilot" : "Open AI Copilot"}
            aria-expanded={isCopilotOpen}
          >
            <Sparkles size={18} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="mobile-nav-icon-btn"
            onClick={onOpenShare}
            title={isRoomActive ? "Invite & share room" : "Share plan"}
            aria-label={isRoomActive ? "Invite people and share this room" : "Share this plan"}
          >
            <Share2 size={17} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="mobile-nav-icon-btn is-menu-trigger"
            onClick={() => onMenuOpenChange(true)}
            title="Tools & Settings Menu"
            aria-label="Open tools and settings menu"
            aria-haspopup="dialog"
            aria-expanded={isMenuOpen}
          >
            <MoreVertical size={18} aria-hidden="true" />
            {updateAvailable && <span className="mobile-update-dot" aria-hidden="true" />}
          </button>
        </div>
      </header>

      {sheet}
    </>
  );
};
