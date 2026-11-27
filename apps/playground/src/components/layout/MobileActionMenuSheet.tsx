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
  Languages,
  Github,
  LogOut,
  FolderKanban,
  Share2,
  FolderPlus,
  Users,
  Cloud,
  ChevronDown,
  Loader2,
  Undo2, Redo2, Upload,
  Layers,
  Zap,
  Kanban,
  CheckSquare,
  Activity,
  StickyNote,
  Download,
  Share,
  ShieldCheck,
  Smartphone
} from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import type { UserProfile } from "../../firebase/types";
import type { ActiveView } from "../../types";
import { AVAILABLE_THEMES } from "../../constants";
import { getTrustedAvatarUrl } from "../../room-storage";
import { useSheetSwipeDismiss } from "../../hooks/useSheetSwipeDismiss";
import { renderPanelSlot, type PanelSlot } from "./Navbar";
import { useI18n } from "../../i18n/I18nProvider";
import type { MessageKey } from "../../i18n";

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
  onToggleCopilot?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onOpenPlanManager: () => void;
  onShare: () => void;
  onCreateNewPlan: () => void;
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
  /** View switcher, always available on mobile, including the 60 fps Canvas renderer. */
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  canInstall: boolean;
  isIosSafari: boolean;
  isStandalone: boolean;
  onInstall: () => void;
  updateAvailable: boolean;
  onApplyUpdate: () => void;
  /** Human-readable runtime: "Standalone App", "Android App" or "Web". */
  appModeLabel: string;
}

const VIEW_TILES: Array<{ id: ActiveView; labelKey: MessageKey; icon: React.ReactNode }> = [
  { id: "gantt", labelKey: "view.gantt", icon: <Layers size={16} /> },
  { id: "canvas", labelKey: "view.canvas", icon: <Zap size={16} /> },
  { id: "kanban", labelKey: "view.kanban", icon: <Kanban size={16} /> },
  { id: "tasks", labelKey: "view.tasks", icon: <CheckSquare size={16} /> },
  { id: "summary", labelKey: "view.health", icon: <Activity size={16} /> },
  { id: "notes", labelKey: "view.notes", icon: <StickyNote size={16} /> }
];

const FOCUSABLE_SELECTOR =
  'summary, button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  onToggleCopilot, onUndo, onRedo,
  onOpenPlanManager, onShare,
  onCreateNewPlan,
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
  setActiveView,
  canInstall,
  isIosSafari,
  isStandalone,
  onInstall,
  updateAvailable,
  onApplyUpdate,
  appModeLabel
}) => {
  const { t, locale, setLocale, locales } = useI18n();
  const cardRef = useRef<HTMLDivElement>(null);
  const [isCloudExpanded, setIsCloudExpanded] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const swipe = useSheetSwipeDismiss({ onClose, enabled: true });

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
      const focusables = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(el => el.getClientRects().length > 0);
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
    <div className="mobile-sheet-backdrop" style={swipe.backdropStyle} onClick={onClose}>
      <div
        ref={cardRef}
        className={`mobile-sheet-card ${swipe.isDragging ? "is-dragging" : ""}`}
        style={swipe.sheetStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-sheet-title"
        tabIndex={-1}
      >
        <div className="mobile-sheet-pull-handle" aria-hidden="true" {...swipe.handleProps} />

        <div className="mobile-sheet-header" {...swipe.handleProps}>
          <h3 className="mobile-sheet-title" id="mobile-sheet-title">
            {t("mobile.toolsSettings")}
          </h3>
          <button type="button" className="mobile-sheet-close-btn" onClick={onClose} aria-label={t("mobile.closeMenu")}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mobile-sheet-body">
          {updateAvailable && (
            <div className="mobile-sheet-update-card" role="status">
              <RefreshCw size={16} aria-hidden="true" />
              <div className="mobile-sheet-update-copy">
                <strong>{t("mobile.updateAvailable")}</strong>
                <span>{t("mobile.updateBody")}</span>
              </div>
              <button
                type="button"
                className="mobile-sheet-update-btn"
                onClick={() => {
                  onApplyUpdate();
                  onClose();
                }}
              >
                {t("mobile.refreshNow")}
              </button>
            </div>
          )}

          <div className="mobile-menu-grid mobile-menu-shortcuts" role="group" aria-label={t("mobile.planActions")}>
            <button type="button" className="mobile-menu-tile" onClick={act(onShare)}><Share2 size={17} /><span>{t("mobile.share")}</span></button>
            {onToggleCopilot && <button type="button" className="mobile-menu-tile" onClick={act(onToggleCopilot)}>
              <Sparkles size={17} /><span>{t("mobile.copilot")}</span></button>}
            <button type="button" className="mobile-menu-tile" disabled={!onUndo} onClick={act(onUndo)}>
              <Undo2 size={17} /><span>{t("mobile.undo")}</span></button>
            <button type="button" className="mobile-menu-tile" disabled={!onRedo} onClick={act(onRedo)}>
              <Redo2 size={17} /><span>{t("mobile.redo")}</span></button>
          </div>
          <details className="mobile-menu-section mobile-tools-group">
            <summary><Layers size={18} />{t("mobile.viewsRenderer")}<ChevronDown size={16} /></summary>
            <div className="mobile-menu-grid is-three-col" role="group" aria-label={t("mobile.switchView")}>
              {VIEW_TILES.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  className={`mobile-menu-tile ${activeView === tile.id ? "is-active" : ""}`}
                  aria-pressed={activeView === tile.id}
                  onClick={act(() => setActiveView(tile.id))}
                >
                  {tile.icon}
                  <span>{t(tile.labelKey)}</span>
                </button>
              ))}
            </div>
          </details>

          {/* Core Plan & JSON State */}
          <details className="mobile-menu-section mobile-tools-group">
            <summary><FolderKanban size={18} />{t("mobile.plansFiles")}<ChevronDown size={16} /></summary>
            <div className="mobile-menu-grid">
              <button type="button" className="mobile-menu-tile" onClick={act(onCreateNewPlan)}>
                <FolderPlus size={16} aria-hidden="true" />
                <span>{t("mobile.newPlan")}</span>
              </button>

              <button type="button" className="mobile-menu-tile" onClick={act(onOpenPlanManager)}>
                <FolderKanban size={16} aria-hidden="true" />
                <span>{t("mobile.managePlans")}</span>
              </button>

              <button type="button" className="mobile-menu-tile" onClick={act(onOpenPeopleModal)}>
                <Users size={16} aria-hidden="true" />
                <span>{t("mobile.peopleTeams")}</span>
              </button>

              <button type="button" className="mobile-menu-tile" onClick={act(onOpenJsonEditor)}>
                <FileJson size={16} aria-hidden="true" />
                <span>{t("mobile.jsonEditor")}</span>
              </button>

              {onImportFile && (
                <button type="button" className="mobile-menu-tile" onClick={act(onImportFile)}>
                  <Upload size={16} aria-hidden="true" />
                  <span>{t("mobile.importFile")}</span>
                </button>
              )}

              <button type="button" className="mobile-menu-tile" onClick={act(onOpenPromptModal)}>
                <FileJson size={16} aria-hidden="true" />
                <span>{t("mobile.promptAi")}</span>
              </button>
            </div>
          </details>

          {/* User Account Section */}
          <details className="mobile-menu-section mobile-tools-group">
            <summary><Cloud size={18} />{t("mobile.accountCloud")}<ChevronDown size={16} /></summary>
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
                        t("mobile.githubVerified")
                      ) : onOpenVerificationModal ? (
                        <button
                          type="button"
                          className="mobile-menu-link-btn"
                          onClick={act(onOpenVerificationModal)}
                        >
                          {t("mobile.verifyGithub")}
                        </button>
                      ) : (
                        t("mobile.signedInGithub")
                      )}
                    </div>
                  </div>
                </div>
                <button type="button" className="mobile-menu-item-btn is-logout" onClick={act(onLogout)}>
                  <LogOut size={14} aria-hidden="true" />
                  <span>{t("mobile.signOut")}</span>
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
                <span>{isSigningIn ? t("mobile.signingIn") : t("mobile.signIn")}</span>
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
                    <span>{t("mobile.cloudCollab")}</span>
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
          </details>

          {/* AutoSave & History */}
          <details className="mobile-menu-section mobile-tools-group">
            <summary><History size={18} />{t("mobile.savingHistory")}<ChevronDown size={16} /></summary>
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
                  <span>{t("mobile.autosaveInterval")}</span>
                </div>
                <span className="mobile-menu-badge">{autoSaveLabel}</span>
              </button>

              {onOpenVersionHistory && (
                <button type="button" className="mobile-menu-list-row" onClick={act(onOpenVersionHistory)}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <History size={14} aria-hidden="true" />
                    <span>{t("mobile.versionHistory")}</span>
                  </div>
                  {snapshotsCount > 0 && <span className="mobile-menu-badge">{t("mobile.snapshots", { count: snapshotsCount })}</span>}
                </button>
              )}
            </div>
          </details>

          <div className="mobile-theme-row">
            <label htmlFor="mobile-theme-select"><Palette size={18} />{t("mobile.theme")}</label>
            <select
              id="mobile-theme-select"
              className="select-input mobile-theme-select"
              value={selectedThemeId}
              onChange={(e) => setSelectedThemeId(e.target.value)}
            >
              <optgroup label={t("mobile.darkModes")}>
                {AVAILABLE_THEMES.filter((theme) => theme.mode === "dark").map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t("mobile.lightModes")}>
                {AVAILABLE_THEMES.filter((theme) => theme.mode === "light").map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </div>

          <div className="mobile-theme-row">
            <label htmlFor="mobile-language-select"><Languages size={18} />{t("mobile.language")}</label>
            <select
              id="mobile-language-select"
              className="select-input mobile-theme-select"
              value={locale}
              onChange={(e) => setLocale(e.target.value as (typeof locales)[number]["id"])}
            >
              {locales.map((option) => (
                <option key={option.id} value={option.id} lang={option.id}>
                  {option.nativeLabel}
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </div>

          {!isStandalone && (canInstall || isIosSafari) && (
            <div className="mobile-menu-section">
              <span className="mobile-menu-section-label">{t("mobile.install")}</span>
              {canInstall ? (
                <button type="button" className="mobile-menu-install-row" onClick={act(onInstall)}>
                  <Download size={16} aria-hidden="true" />
                  <span className="mobile-menu-install-copy">
                    <strong>{t("mobile.installJantt")}</strong>
                    <span>{t("mobile.installDesc")}</span>
                  </span>
                </button>
              ) : (
                <div className="mobile-menu-install-hint">
                  <Share size={15} aria-hidden="true" />
                  <span>
                    {t("mobile.iosInstallHint")}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="mobile-sheet-footer">
            <span className="mobile-sheet-mode">
              <Smartphone size={12} aria-hidden="true" />
              <span>{appModeLabel}</span>
            </span>
            <a
              className="mobile-sheet-privacy-link"
              href="./privacy.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ShieldCheck size={12} aria-hidden="true" />
              <span>{t("mobile.privacy")}</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
