import React, { useEffect, useRef, useState } from "react";
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
  Users,
  Cloud,
  ChevronDown,
  Loader2,
  Upload,
  Layers,
  Zap,
  Kanban,
  CheckSquare,
  Activity,
  StickyNote
} from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import type { UserProfile } from "../../firebase/types";
import type { ActiveView } from "../../types";
import { AVAILABLE_THEMES } from "../../constants";
import { getTrustedAvatarUrl } from "../../room-storage";
import { renderPanelSlot, type PanelSlot } from "./Navbar";

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
  /** True only when the GitHub verification is actually satisfied. */
  isGitHubVerified?: boolean;
  onLogin?: () => void;
  /** A GitHub sign-in popup is open: the sign-in button is disabled until it settles. */
  isSigningIn?: boolean;
  onLogout?: () => void;
  onOpenVerificationModal?: () => void;
  /**
   * Cloud collaboration panel (room status, invite, join...), shown inline under the "Cloud"
   * entry. A function receives `close`, which closes the sheet.
   */
  cloudPanel?: PanelSlot;
  /** Short status shown next to the "Cloud" entry, e.g. "Live room - Editor". */
  cloudStatusLabel?: string;
  onImportFile?: () => void;
  /** When provided, a view switcher is shown (used when the bottom navigation is hidden). */
  activeView?: ActiveView;
  setActiveView?: (view: ActiveView) => void;
}

const VIEW_TILES: Array<{ id: ActiveView; label: string; icon: React.ReactNode }> = [
  { id: "gantt", label: "Gantt", icon: <Layers size={16} style={{ color: "#38BDF8" }} /> },
  { id: "canvas", label: "Canvas", icon: <Zap size={16} style={{ color: "#A855F7" }} /> },
  { id: "kanban", label: "Kanban", icon: <Kanban size={16} style={{ color: "#F59E0B" }} /> },
  { id: "tasks", label: "Tasks", icon: <CheckSquare size={16} style={{ color: "#10B981" }} /> },
  { id: "summary", label: "Health", icon: <Activity size={16} style={{ color: "#F43F5E" }} /> },
  { id: "notes", label: "Notes", icon: <StickyNote size={16} style={{ color: "#06B6D4" }} /> }
];

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const MobileActionMenuSheet: React.FC<MobileActionMenuSheetProps> = (props) => {
  if (!props.isOpen) return null;
  return <MobileActionMenuSheetDialog {...props} />;
};

const MobileActionMenuSheetDialog: React.FC<MobileActionMenuSheetProps> = ({
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
  isSigningIn = false,
  onLogout,
  onOpenVerificationModal,
  cloudPanel,
  cloudStatusLabel,
  onImportFile,
  activeView,
  setActiveView
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isCloudExpanded, setIsCloudExpanded] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Dialog behaviour: initial focus, Escape to close, focus trap, focus restored on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      const card = cardRef.current;
      if (!card) return;
      // A dialog opened from the sheet sits above it and handles its own keys.
      const target = e.target as Node | null;
      if (target && target !== document.body && !card.contains(target)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === card)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Do not pull focus back behind a dialog that the chosen action opened and focused.
      const focusLost = !document.activeElement || document.activeElement === document.body;
      if (focusLost && previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  // Only GitHub-hosted avatars are loaded (profile fields are self-written); otherwise initials.
  const avatarUrl = getTrustedAvatarUrl(userProfile?.photoURL) || getTrustedAvatarUrl(currentUser?.photoURL);

  /** Runs an action and closes the sheet. */
  const act = (fn?: () => void) => () => {
    fn?.();
    onClose();
  };

  return (
    <div className="mobile-sheet-backdrop" onClick={onClose}>
      <div
        ref={cardRef}
        className="mobile-sheet-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-sheet-title"
        tabIndex={-1}
      >
        <div className="mobile-sheet-pull-handle" aria-hidden="true" />

        <div className="mobile-sheet-header">
          <h3 className="mobile-sheet-title" id="mobile-sheet-title">
            Tools &amp; Settings
          </h3>
          <button type="button" className="mobile-sheet-close-btn" onClick={onClose} aria-label="Close menu">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mobile-sheet-body">
          {/* View switcher (only when the bottom navigation is hidden, e.g. immersive landscape) */}
          {activeView && setActiveView && (
            <div className="mobile-menu-section">
              <span className="mobile-menu-section-label">Views</span>
              <div className="mobile-menu-grid is-three-col" role="group" aria-label="Switch view">
                {VIEW_TILES.map((tile) => (
                  <button
                    key={tile.id}
                    type="button"
                    className={`mobile-menu-tile ${activeView === tile.id ? "is-active" : ""}`}
                    aria-pressed={activeView === tile.id}
                    onClick={act(() => setActiveView(tile.id))}
                  >
                    {tile.icon}
                    <span>{tile.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* User Account Section */}
          <div className="mobile-menu-section">
            <span className="mobile-menu-section-label">Account &amp; Cloud</span>
            {currentUser ? (
              <div className="mobile-menu-user-row">
                <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="mobile-menu-user-avatar" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="mobile-menu-user-avatar-fallback" aria-hidden="true">
                      {(userProfile?.username || currentUser.displayName || "U")[0].toUpperCase()}
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "13px" }}>
                      @{userProfile?.username || currentUser.displayName || "User"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                      {isGitHubVerified ? (
                        "GitHub Verified"
                      ) : onOpenVerificationModal ? (
                        <button
                          type="button"
                          className="mobile-menu-link-btn"
                          onClick={act(onOpenVerificationModal)}
                        >
                          Verify GitHub Profile
                        </button>
                      ) : (
                        "Signed in with GitHub"
                      )}
                    </div>
                  </div>
                </div>
                <button type="button" className="mobile-menu-item-btn is-logout" onClick={act(onLogout)}>
                  <LogOut size={14} aria-hidden="true" />
                  <span>Sign out</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="mobile-menu-item-btn is-accent"
                onClick={act(onLogin)}
                disabled={isSigningIn}
                aria-busy={isSigningIn || undefined}
              >
                {isSigningIn ? (
                  <Loader2 size={15} className="spin-sync-icon" aria-hidden="true" />
                ) : (
                  <Github size={15} aria-hidden="true" />
                )}
                <span>{isSigningIn ? "Signing in…" : "Sign in with GitHub"}</span>
              </button>
            )}

            {cloudPanel && (
              <div className="mobile-menu-cloud">
                <button
                  type="button"
                  className="mobile-menu-list-row"
                  aria-expanded={isCloudExpanded}
                  aria-controls="mobile-menu-cloud-panel"
                  onClick={() => setIsCloudExpanded((prev) => !prev)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Cloud size={14} style={{ color: "var(--jantt-accent)" }} aria-hidden="true" />
                    <span>Cloud collaboration</span>
                  </div>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    {cloudStatusLabel && <span className="mobile-menu-badge">{cloudStatusLabel}</span>}
                    <ChevronDown
                      size={14}
                      aria-hidden="true"
                      style={{ transform: isCloudExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}
                    />
                  </span>
                </button>
                {isCloudExpanded && (
                  <div id="mobile-menu-cloud-panel" className="mobile-menu-cloud-panel">
                    {renderPanelSlot(cloudPanel, onClose)}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Core Plan & JSON State */}
          <div className="mobile-menu-section">
            <span className="mobile-menu-section-label">Project &amp; Data</span>
            <div className="mobile-menu-grid">
              <button type="button" className="mobile-menu-tile" onClick={act(onOpenPlanManager)}>
                <FolderKanban size={16} style={{ color: "var(--jantt-accent)" }} aria-hidden="true" />
                <span>Manage Plans</span>
              </button>

              <button type="button" className="mobile-menu-tile" onClick={act(onOpenPeopleModal)}>
                <Users size={16} style={{ color: "#22C55E" }} aria-hidden="true" />
                <span>People &amp; Teams</span>
              </button>

              <button type="button" className="mobile-menu-tile" onClick={act(onOpenJsonEditor)}>
                <FileJson size={16} style={{ color: "#EAB308" }} aria-hidden="true" />
                <span>JSON Editor</span>
              </button>

              {onImportFile && (
                <button type="button" className="mobile-menu-tile" onClick={act(onImportFile)}>
                  <Upload size={16} style={{ color: "#38BDF8" }} aria-hidden="true" />
                  <span>Import File</span>
                </button>
              )}

              <button type="button" className="mobile-menu-tile" onClick={act(onOpenPromptModal)}>
                <Sparkles size={16} style={{ color: "#A855F7" }} aria-hidden="true" />
                <span>Prompt AI</span>
              </button>
            </div>
          </div>

          {/* AutoSave & History */}
          <div className="mobile-menu-section">
            <span className="mobile-menu-section-label">State &amp; Recovery</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <button type="button" className="mobile-menu-list-row" onClick={act(onOpenAutoSave)}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {saveStatus === "saving" ? (
                    <RefreshCw size={14} className="spin-sync-icon" aria-hidden="true" />
                  ) : saveStatus === "pending" ? (
                    <Clock size={14} aria-hidden="true" />
                  ) : (
                    <CheckCircle2 size={14} style={{ color: "#22C55E" }} aria-hidden="true" />
                  )}
                  <span>AutoSave Cadence</span>
                </div>
                <span className="mobile-menu-badge">{autoSaveLabel}</span>
              </button>

              {onOpenVersionHistory && (
                <button type="button" className="mobile-menu-list-row" onClick={act(onOpenVersionHistory)}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <History size={14} aria-hidden="true" />
                    <span>Version History Vault</span>
                  </div>
                  {snapshotsCount > 0 && <span className="mobile-menu-badge">{snapshotsCount} snapshots</span>}
                </button>
              )}
            </div>
          </div>

          {/* Theme Selector */}
          <div className="mobile-menu-section">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <label className="mobile-menu-section-label" style={{ margin: 0 }} htmlFor="mobile-theme-select">
                Theme
              </label>
              <Palette size={13} style={{ opacity: 0.6 }} aria-hidden="true" />
            </div>
            <select
              id="mobile-theme-select"
              className="select-input mobile-theme-select"
              value={selectedThemeId}
              onChange={(e) => setSelectedThemeId(e.target.value)}
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
