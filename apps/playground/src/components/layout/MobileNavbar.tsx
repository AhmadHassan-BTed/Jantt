import React from "react";
import { RoomPresenceStack } from "../cloud/RoomPresenceStack";
import { Search, Menu, Share2, Eye, KeyRound, ChevronDown, Sparkles, WifiOff } from "lucide-react";
import { JanttIcon } from "../common/JanttLogo";
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
  onSearch: () => void;
  roomConnection: string;
  onUndo?: () => void;
  onRedo?: () => void;
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
  updateAvailable: boolean;
  canInstall: boolean;
  isIosSafari: boolean;
  isStandalone: boolean;
  isTwa?: boolean;
  onInstall: () => void;
  onApplyUpdate: () => void;
  onOpenAndroidTesting?: () => void;
  onOpenWebAccess?: () => void;
  onOpenRateApp?: () => void;
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
  onSearch, roomConnection, onUndo, onRedo,
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
  updateAvailable,
  canInstall,
  isIosSafari,
  isStandalone,
  isTwa = false,
  onInstall,
  onApplyUpdate,
  onOpenAndroidTesting,
  onOpenWebAccess,
  onOpenRateApp,
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
      onUndo={onUndo} onRedo={onRedo}
      onOpenPlanManager={onOpenPlanManager}
      onShare={onOpenShare}
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
      isTwa={isTwa}
      onInstall={onInstall}
      updateAvailable={updateAvailable}
      onApplyUpdate={onApplyUpdate}
      onOpenAndroidTesting={onOpenAndroidTesting}
      onOpenWebAccess={onOpenWebAccess}
      onOpenRateApp={onOpenRateApp}
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
              { id: "gantt", label: "Timeline", icon: <Layers size={14} style={{ color: "#38BDF8" }} /> },
              { id: "kanban", label: "Board", icon: <Kanban size={14} style={{ color: "#F59E0B" }} /> },
              { id: "tasks", label: "Tasks", icon: <CheckSquare size={14} style={{ color: "#10B981" }} /> },
              { id: "summary", label: "Health", icon: <Activity size={14} style={{ color: "#F43F5E" }} /> },
              { id: "notes", label: "Notes", icon: <StickyNote size={14} style={{ color: "#06B6D4" }} /> }
            ] as const).map((tab) => {
              const active = activeView === tab.id || (tab.id === "gantt" && activeView === "canvas");
              return <button key={tab.id} type="button" className={`mobile-landscape-tab ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => { triggerHaptic("light"); setActiveView(tab.id); }}>
                {tab.icon}<span>{tab.label}</span>{tab.id === "notes" && notesCount > 0 && <span className="mobile-nav-badge">{notesCount}</span>}
              </button>;
            })}
          </nav>
          <div className="mobile-landscape-actions">
            <button type="button" className="mobile-nav-icon-btn" onClick={() => onToggleCopilot?.()} aria-label="Open AI Copilot"><Sparkles size={16} style={{ color: "#A855F7" }} /></button>
            <button type="button" className="mobile-nav-icon-btn" onClick={onOpenShare} aria-label="Share plan"><Share2 size={16} style={{ color: "#A855F7" }} /></button>
            <button type="button" className="mobile-nav-icon-btn is-menu-trigger" onClick={() => onMenuOpenChange(true)} aria-label="Open tools and settings menu" aria-haspopup="dialog" aria-expanded={isMenuOpen}><Menu size={16} />{updateAvailable && <span className="mobile-update-dot" />}</button>
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
            aria-haspopup="dialog"
            title={`Current plan: ${activePlanName}. Tap to switch or manage plans.`}
          >
            <span className="mobile-brand-mark" aria-hidden="true">
              <JanttIcon size={32} variant="outline" />
            </span>
            <span className="phone-plan-identity">
              <small>{!isOnline ? <><WifiOff size={11} /> Offline</> : isRoomActive ? roomConnection : "On this device"}</small>
              <span className="mobile-plan-name">{activePlanName}</span>
            </span>
            {isOnline && isRoomActive && <RoomPresenceStack users={onlineUsers} limit={2} />}
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

        <div className="mobile-nav-right">
          <button type="button" className="mobile-nav-icon-btn" onClick={onSearch}
            aria-label="Find tasks and commands" title="Find tasks and commands"><Search size={19} style={{ color: "#38BDF8" }} /></button>

          <button
            type="button"
            className="mobile-nav-icon-btn is-menu-trigger"
            onClick={() => onMenuOpenChange(true)}
            title="Tools & Settings Menu"
            aria-label="Open tools and settings menu"
            aria-haspopup="dialog"
            aria-expanded={isMenuOpen}
          >
            <Menu size={18} aria-hidden="true" />
            {updateAvailable && <span className="mobile-update-dot" aria-hidden="true" />}
          </button>
        </div>
      </header>

      {sheet}
    </>
  );
};
