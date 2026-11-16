import React, {
  Suspense,
  createContext,
  lazy,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Info, X } from "lucide-react";
import { exportSpreadsheetCsv } from "@jantt/interop";
import { PromptModal } from "./PromptModal";
import { AddPlanModal, type PlanDestination } from "./AddPlanModal";
import { PeopleTeamsModal } from "./PeopleTeamsModal";
import type { ShareRoomRole } from "./ShareModal";
import { AutoSaveModal } from "./AutoSaveModal";
import { VersionHistoryModal } from "./VersionHistoryModal";
import { ENABLE_GITHUB_VERIFICATION_GATE, type UserRoomPointer } from "../../firebase";
import type { JanttData } from "@jantt/core";
import type { useProjectState } from "../../hooks/useProjectState";
import type { useAuth } from "../../hooks/useAuth";
import type { useToast } from "../../hooks/useToast";
import type { usePeopleTeams } from "../../hooks/usePeopleTeams";
import type { useEditorState } from "../../hooks/useEditorState";
import type { useRoomSync } from "../../hooks/useRoomSync";
import type { useGanttViewport } from "../../hooks/useGanttViewport";
import type { useSharing } from "../../hooks/useSharing";
import type { useSidebarResize } from "../../hooks/useSidebarResize";
import type { useAutoSave } from "../../hooks/useAutoSave";
import type { useSnapshotVault } from "../../hooks/useSnapshotVault";

/* ==========================================================================
   Shared dialog shell
   Every dialog rendered through <Modal> gets the same placement, Escape and
   backdrop dismissal, a Tab focus trap, focus return, body scroll lock and
   stacking. Placement itself lives in index.css (`.prompt-modal-backdrop` /
   `.prompt-modal-card`: centered card with a height cap, bottom sheet on phones,
   `--z-modal` layer), so the shell only adds what CSS cannot know.
   ========================================================================== */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']"
].join(",");

// Open dialogs, oldest first. Only the last one reacts to Escape and backdrop clicks.
const modalStack: { id: number; card: HTMLElement | null }[] = [];
let modalIdSequence = 0;
let lockedBodyOverflow: string | null = null;

/** Root that carries the theme variables; dialogs render there so ancestors cannot clip or offset them. */
const PORTAL_ROOT_SELECTOR = ".playground-app";

function pushModal(id: number, card: HTMLElement | null): number {
  modalStack.push({ id, card });
  if (modalStack.length === 1) {
    lockedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  return modalStack.length - 1;
}

function removeModal(id: number) {
  const index = modalStack.findIndex((entry) => entry.id === id);
  if (index >= 0) modalStack.splice(index, 1);
  if (modalStack.length === 0 && lockedBodyOverflow !== null) {
    document.body.style.overflow = lockedBodyOverflow;
    lockedBodyOverflow = null;
  }
}

const isTopModal = (id: number) => modalStack[modalStack.length - 1]?.id === id;

/** True while any dialog built on <Modal> is open (for global shortcut guards). */
export const isAnyModalOpen = (): boolean => modalStack.length > 0;

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.getClientRects().length > 0
  );
}

/** Tracks a CSS media query; re-renders when it starts or stops matching. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", update);
      return () => mql.removeEventListener("change", update);
    }
    // Safari < 14
    mql.addListener(update);
    return () => mql.removeListener(update);
  }, [query]);

  return matches;
}

interface ModalContextValue {
  titleId: string;
  close: () => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

function useModalContext(): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error("ModalHeader must be rendered inside <Modal>.");
  return ctx;
}

export interface ModalProps {
  /** Called on Escape, backdrop click and the header close button. Render the Modal only while open. */
  onClose: () => void;
  children: React.ReactNode;
  /** Card width cap in px on wide screens (index.css turns the card into a full-width sheet on phones). */
  maxWidth?: number;
  /**
   * Fill the available height (boards, long lists); inner regions scroll on their own.
   * Desktop only: on phones index.css turns every card into an auto-height bottom sheet.
   */
  tall?: boolean;
  /** Close when a press starts and ends on the backdrop. Disable while a form holds unsaved input. */
  dismissOnBackdrop?: boolean;
  role?: "dialog" | "alertdialog";
  /** Accessible name; defaults to the <ModalHeader> title. */
  ariaLabel?: string;
  ariaDescribedBy?: string;
  /** Focused on open; defaults to the first `[data-autofocus]` element, then the first focusable one. */
  initialFocusRef?: React.RefObject<HTMLElement>;
}

export const Modal: React.FC<ModalProps> = ({
  onClose,
  children,
  maxWidth = 580,
  tall = false,
  dismissOnBackdrop = true,
  role = "dialog",
  ariaLabel,
  ariaDescribedBy,
  initialFocusRef
}) => {
  const titleId = useId();
  const [id] = useState(() => ++modalIdSequence);
  // Captured during render: by the time effects run, autofocus may already have moved focus inside.
  const [opener] = useState(() =>
    typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null
  );
  // Resolved once per open; without the app root (tests, embeds) the dialog renders in place.
  const [portalRoot] = useState(() =>
    typeof document !== "undefined" ? document.querySelector<HTMLElement>(PORTAL_ROOT_SELECTOR) : null
  );
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const pressStartedOnBackdropRef = useRef(false);

  useLayoutEffect(() => {
    const stackIndex = pushModal(id, cardRef.current);
    // Stack above every dialog opened earlier, on the --z-modal layer (set before paint).
    if (overlayRef.current && stackIndex > 0) {
      overlayRef.current.style.zIndex = `calc(var(--z-modal, 1000) + ${stackIndex})`;
    }
    const card = cardRef.current;
    if (card && !card.contains(document.activeElement)) {
      const target =
        initialFocusRef?.current ??
        card.querySelector<HTMLElement>("[data-autofocus]") ??
        getFocusableElements(card)[0] ??
        card;
      target.focus({ preventScroll: true });
    }

    // Keys pressed inside the dialog are handled (and stopped) by the overlay. This only covers
    // Escape while focus has fallen back to <body>, e.g. after the focused element was removed.
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || !isTopModal(id)) return;
      const active = document.activeElement;
      if (active && active !== document.body) return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown);
      // Runs before the card leaves the DOM. A dialog closing underneath another one must not
      // pull focus out of the dialog above it.
      const active = document.activeElement;
      const ownsFocus = !active || active === document.body || Boolean(card?.contains(active));
      removeModal(id);
      if (!ownsFocus) return;
      if (opener && opener.isConnected && typeof opener.focus === "function") {
        opener.focus({ preventScroll: true });
      } else {
        // The opener is gone (closed menu, removed card): keep focus inside the dialog still open.
        modalStack[modalStack.length - 1]?.card?.focus({ preventScroll: true });
      }
    };
    // Runs once per open: initialFocusRef is only read when the dialog appears.
  }, [id, opener]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Keep keys typed in a dialog away from the app's global shortcuts behind it.
    event.stopPropagation();
    if (event.key === "Escape") {
      if (!event.defaultPrevented && !event.nativeEvent.isComposing && isTopModal(id)) {
        event.preventDefault();
        onCloseRef.current();
      }
      return;
    }
    if (event.key !== "Tab" || !cardRef.current) return;
    const card = cardRef.current;
    const focusable = getFocusableElements(card);
    if (focusable.length === 0) {
      event.preventDefault();
      card.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === card || !card.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !card.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  const contextValue = useMemo<ModalContextValue>(
    () => ({ titleId, close: () => onCloseRef.current() }),
    [titleId]
  );

  const overlay = (
    <div
      ref={overlayRef}
      className="prompt-modal-backdrop"
      style={{ overscrollBehavior: "contain" }}
      onPointerDown={(event) => {
        pressStartedOnBackdropRef.current = event.target === event.currentTarget;
      }}
      onMouseDown={(event) => {
        // Keep focus inside the dialog when the backdrop is pressed.
        if (event.target === event.currentTarget) event.preventDefault();
      }}
      onClick={(event) => {
        // A text selection that starts in the card and ends on the backdrop must not close the dialog.
        const startedOnBackdrop = pressStartedOnBackdropRef.current;
        pressStartedOnBackdropRef.current = false;
        if (dismissOnBackdrop && startedOnBackdrop && event.target === event.currentTarget && isTopModal(id)) {
          onCloseRef.current();
        }
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={cardRef}
        role={role}
        aria-modal="true"
        aria-labelledby={ariaLabel ? undefined : titleId}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
        className="prompt-modal-card"
        style={{
          position: "relative",
          maxWidth,
          // Percentages resolve against the backdrop, i.e. the viewport minus its padding.
          height: tall ? "min(920px, 100%)" : undefined,
          outline: "none"
        }}
      >
        <ModalContext.Provider value={contextValue}>{children}</ModalContext.Provider>
      </div>
    </div>
  );

  // React events still bubble through the component tree, so the handlers above keep working.
  return portalRoot ? createPortal(overlay, portalRoot) : overlay;
};

export interface ModalHeaderProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Extra controls placed before the close button; they wrap below the title on narrow screens. */
  actions?: React.ReactNode;
  /** Accent used for the icon tile. */
  tone?: "accent" | "danger";
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({ icon, title, subtitle, actions, tone = "accent" }) => {
  const { titleId, close } = useModalContext();
  return (
    <div className="prompt-modal-header" style={{ gap: "10px 12px", flexWrap: "wrap", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "1 1 220px", minWidth: 0 }}>
        {icon && (
          <div
            aria-hidden="true"
            style={{
              width: "34px",
              height: "34px",
              flexShrink: 0,
              borderRadius: "9px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: tone === "danger" ? "rgba(239, 68, 68, 0.14)" : "var(--jantt-accent-glow, rgba(56, 189, 248, 0.15))",
              color: tone === "danger" ? "#EF4444" : "var(--jantt-accent, #38BDF8)"
            }}
          >
            {icon}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <h2
            id={titleId}
            style={{ margin: 0, fontSize: "16px", fontWeight: 700, lineHeight: 1.3, color: "var(--jantt-text)" }}
          >
            {title}
          </h2>
          {subtitle && (
            <p style={{ margin: "2px 0 0", fontSize: "12px", lineHeight: 1.4, color: "var(--jantt-text-muted)" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
          justifyContent: "flex-end",
          marginLeft: "auto"
        }}
      >
        {actions}
        <button
          type="button"
          className="prompt-modal-close-btn"
          onClick={close}
          aria-label="Close dialog"
          title="Close (Esc)"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

const DANGER_BUTTON_STYLE: React.CSSProperties = {
  background: "#DC2626",
  borderColor: "#DC2626",
  color: "#FFFFFF"
};

export interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" styles the confirm button red and focuses Cancel first. */
  tone?: "danger" | "default";
  /** When set, confirming requires typing this exact text (for irreversible actions). */
  confirmPhrase?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** In-app replacement for window.confirm, rendered on top of the dialog that asks. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  confirmPhrase,
  onConfirm,
  onCancel
}) => {
  const messageId = useId();
  const [typedPhrase, setTypedPhrase] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const phraseRef = useRef<HTMLInputElement>(null);
  const phraseMatches = !confirmPhrase || typedPhrase.trim() === confirmPhrase.trim();
  const initialFocusRef = confirmPhrase ? phraseRef : tone === "danger" ? cancelRef : confirmRef;

  return (
    <Modal
      onClose={onCancel}
      maxWidth={460}
      role="alertdialog"
      ariaDescribedBy={messageId}
      initialFocusRef={initialFocusRef}
    >
      <form
        style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}
        onSubmit={(event) => {
          event.preventDefault();
          if (phraseMatches) onConfirm();
        }}
      >
        <ModalHeader
          icon={tone === "danger" ? <AlertTriangle size={18} /> : <Info size={18} />}
          tone={tone === "danger" ? "danger" : "accent"}
          title={title}
        />
        <div className="prompt-modal-body" style={{ fontSize: "13px", lineHeight: 1.5, color: "var(--jantt-text)" }}>
          <div id={messageId}>{message}</div>
          {confirmPhrase && (
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" }}>
              <span style={{ color: "var(--jantt-text-muted)" }}>
                Type <strong style={{ color: "var(--jantt-text)" }}>{confirmPhrase}</strong> to confirm:
              </span>
              <input
                ref={phraseRef}
                type="text"
                className="select-input"
                autoComplete="off"
                spellCheck={false}
                value={typedPhrase}
                onChange={(event) => setTypedPhrase(event.target.value)}
                style={{ height: "34px", padding: "6px 10px", fontSize: "13px" }}
              />
            </label>
          )}
        </div>
        <div className="prompt-modal-footer" style={{ justifyContent: "flex-end", flexWrap: "wrap", flexShrink: 0 }}>
          <button ref={cancelRef} type="button" className="btn-nav" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="submit"
            className="btn-nav btn-nav-primary"
            disabled={!phraseMatches}
            style={tone === "danger" ? DANGER_BUTTON_STYLE : undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
};

/**
 * `<name>-<yyyy-mm-dd>.<ext>` with a filesystem-safe slug (letters of any script are kept) and the
 * local calendar date, shared by every export in the dialogs.
 */
export function buildExportFilename(name: string, extension: string): string {
  const slug =
    Array.from(
      (name || "")
        .normalize("NFC")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "")
    )
      .slice(0, 80)
      .join("")
      .replace(/-+$/, "") || "jantt-plan";
  const now = new Date();
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
  return `${slug}-${date}.${extension}`;
}

/** Downloads text content as a file. The object URL is revoked after the browser has picked it up. */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Downloads plan data as JSON or as the interop spreadsheet CSV (the CSV format "Import file"
 * reads back). Every dialog exports through this, so the same plan gives the same file. Throws
 * when the exporter fails; callers report the error.
 */
export function downloadPlanExport(name: string, data: JanttData, format: "json" | "csv"): void {
  if (format === "json") {
    downloadTextFile(buildExportFilename(name, "json"), JSON.stringify(data, null, 2), "application/json");
  } else {
    downloadTextFile(buildExportFilename(name, "csv"), exportSpreadsheetCsv(data), "text/csv;charset=utf-8");
  }
}

/* ==========================================================================
   Modal host
   ========================================================================== */

// The heaviest dialogs (~100 kB minified together) are fetched on demand, which keeps them out of
// the startup bundle. They only reach the app through this host.
const loadPlanManager = () => import("./PlanManagerModal");
const loadShare = () => import("./ShareModal");
const loadCloudRoom = () => import("../cloud/CloudRoomModal");
const loadShareRoom = () => import("../cloud/ShareRoomModal");
const loadUsernameOnboarding = () => import("../cloud/UsernameOnboardingModal");
const loadGitHubVerification = () => import("../cloud/GitHubVerificationModal");

const PlanManagerModal = lazy(() => loadPlanManager().then((m) => ({ default: m.PlanManagerModal })));
const ShareModal = lazy(() => loadShare().then((m) => ({ default: m.ShareModal })));
const CloudRoomModal = lazy(() => loadCloudRoom().then((m) => ({ default: m.CloudRoomModal })));
const ShareRoomModal = lazy(() => loadShareRoom().then((m) => ({ default: m.ShareRoomModal })));
const UsernameOnboardingModal = lazy(() => loadUsernameOnboarding().then((m) => ({ default: m.UsernameOnboardingModal })));
const GitHubVerificationModal = lazy(() => loadGitHubVerification().then((m) => ({ default: m.GitHubVerificationModal })));

const PREFETCHED_DIALOGS = [loadPlanManager, loadShare, loadCloudRoom, loadShareRoom];
const PREFETCH_FALLBACK_DELAY_MS = 3000;

interface DialogSlotProps {
  open: boolean;
  /** Called when the dialog failed to load or render; it should close the dialog. */
  onFailure: (error: unknown) => void;
  children: React.ReactNode;
}

interface DialogSlotState {
  mounted: boolean;
  failed: boolean;
}

/**
 * Mounts a lazily loaded dialog on its first open and keeps it mounted afterwards (closed dialogs
 * render nothing, and some finish work after closing, like the Plan Manager's pending move).
 * A dialog that fails to load (offline, or a newer deploy replaced its chunk) or to render is
 * reported and closed instead of taking the whole app down; the next open tries again.
 */
class DialogSlot extends React.Component<DialogSlotProps, DialogSlotState> {
  state: DialogSlotState = { mounted: this.props.open, failed: false };

  static getDerivedStateFromProps(props: DialogSlotProps, state: DialogSlotState): Partial<DialogSlotState> | null {
    return props.open && !state.mounted ? { mounted: true } : null;
  }

  static getDerivedStateFromError(): Partial<DialogSlotState> {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onFailure(error);
  }

  componentDidUpdate() {
    // Unmount once closed: a lazy component whose chunk failed throws on every render, even closed.
    if (this.state.failed && !this.props.open) this.setState({ failed: false, mounted: false });
  }

  render() {
    if (!this.state.mounted || this.state.failed) return null;
    return <Suspense fallback={null}>{this.props.children}</Suspense>;
  }
}

type ProjectState = ReturnType<typeof useProjectState>;

export interface ModalHostProps {
  showPromptModal: boolean;
  setShowPromptModal: (show: boolean) => void;

  project: ProjectState;
  ownedRooms: UserRoomPointer[];
  sharedRooms: UserRoomPointer[];
  auth: ReturnType<typeof useAuth>;

  showPlanManagerModal: boolean;
  setShowPlanManagerModal: (show: boolean) => void;
  handleSelectProjectOrRoom: (id: string) => void;
  handleCreateCloudRoomFromData: (title: string, data: JanttData) => Promise<string | null>;
  handleDeleteCloudRoom: (roomId: string) => Promise<void>;
  handleLeaveCloudRoom: (roomId: string) => Promise<void>;
  handleOpenShareRoom: (roomId: string) => void;
  toast: ReturnType<typeof useToast>;

  people: ReturnType<typeof usePeopleTeams>;
  editor: ReturnType<typeof useEditorState>;

  roomSync: ReturnType<typeof useRoomSync>;
  viewport: ReturnType<typeof useGanttViewport>;

  sharing: ReturnType<typeof useSharing>;
  sidebar: ReturnType<typeof useSidebarResize>;

  autoSave: ReturnType<typeof useAutoSave>;

  vault: ReturnType<typeof useSnapshotVault>;
  handleRestoreSnapshot: (snapshot: JanttData, reason: string) => void;

  showShareRoomModal: boolean;
  setShowShareRoomModal: (show: boolean) => void;
  shareModalRoomId: string | null;
}

export const ModalHost: React.FC<ModalHostProps> = ({
  showPromptModal,
  setShowPromptModal,
  project,
  ownedRooms,
  sharedRooms,
  auth,
  showPlanManagerModal,
  setShowPlanManagerModal,
  handleSelectProjectOrRoom,
  handleCreateCloudRoomFromData,
  handleDeleteCloudRoom,
  handleLeaveCloudRoom,
  handleOpenShareRoom,
  toast,
  people,
  editor,
  roomSync,
  viewport,
  sharing,
  sidebar,
  autoSave,
  vault,
  handleRestoreSnapshot,
  showShareRoomModal,
  setShowShareRoomModal,
  shareModalRoomId
}) => {
  // App mounts one import input for every layout; dialogs only open its picker.
  const openImportPicker = () => project.fileInputRef.current?.click();

  // Cloud eligibility is derived once and shared by every dialog that offers cloud actions.
  const isLoggedIn = Boolean(auth.currentUser);
  const isCloudVerified =
    !ENABLE_GITHUB_VERIFICATION_GATE ||
    Boolean(auth.userProfile?.githubVerified || auth.verificationStatus?.isVerified);
  const requireVerification = ENABLE_GITHUB_VERIFICATION_GATE
    ? () => auth.setShowVerificationModal(true)
    : undefined;

  // "Add plan" opens on "This device" unless a caller asks for a cloud room; reset on every close.
  const [addPlanDestination, setAddPlanDestination] = useState<PlanDestination>("local");
  useEffect(() => {
    if (!project.showAddPlanModal) setAddPlanDestination("local");
  }, [project.showAddPlanModal]);
  const openAddPlan = (destination: PlanDestination) => {
    setAddPlanDestination(destination);
    project.handleOpenAddPlanModal();
  };

  // The live room pointers know the role best; the cached role covers rooms not listed (yet).
  const activeRoomId = roomSync.activeRoomId;
  const sharedPointerRole = activeRoomId ? sharedRooms.find((r) => r.roomId === activeRoomId)?.role : undefined;
  const shareRoomRole: ShareRoomRole | undefined = !activeRoomId
    ? undefined
    : ownedRooms.some((r) => r.roomId === activeRoomId)
    ? "owner"
    : sharedPointerRole
    ? sharedPointerRole
    : roomSync.activeRoomRole === "collaborator" || roomSync.isPendingLoginEditor
    ? "editor"
    : "viewer";

  // Every dialog that exports the open plan (Share, Auto-save) produces the same files as the Plan
  // Manager: same exporter, same `<name>-<date>.<ext>` name.
  const exportActivePlan = (format: "json" | "csv") => {
    if (!editor.parsedData) {
      toast.showToast("Fix the plan JSON before exporting it.", true);
      return;
    }
    try {
      downloadPlanExport(project.currentProjectName, editor.parsedData, format);
    } catch (err) {
      toast.showToast(`${format.toUpperCase()} export failed: ${err instanceof Error ? err.message : String(err)}`, true);
    }
  };

  // Join by link or ID lives in the cloud rooms dialog; dialogs that offer it hand over to it.
  const openJoinRoomDialog = () => {
    setShowPlanManagerModal(false);
    roomSync.setShowRoomModal(true);
  };

  // Warm the common lazy dialogs once the app is idle, so their first open is instant.
  useEffect(() => {
    const prefetch = () => PREFETCHED_DIALOGS.forEach((load) => void load().catch(() => undefined));
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(prefetch, { timeout: PREFETCH_FALLBACK_DELAY_MS * 2 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(prefetch, PREFETCH_FALLBACK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const dialogFailed = (close: () => void) => (error: unknown) => {
    console.error("A dialog failed to open:", error);
    toast.showToast("That dialog could not be opened. Check your connection, or reload the page to update Jantt.", true);
    close();
  };

  return (
    <>
      <PromptModal
        showPromptModal={showPromptModal}
        setShowPromptModal={setShowPromptModal}
      />

      <AddPlanModal
        showAddPlanModal={project.showAddPlanModal}
        setShowAddPlanModal={project.setShowAddPlanModal}
        newPlanTitle={project.newPlanTitle}
        setNewPlanTitle={project.setNewPlanTitle}
        newPlanTemplateType={project.newPlanTemplateType}
        setNewPlanTemplateType={project.setNewPlanTemplateType}
        handleCreateNewPlan={project.handleCreateNewPlan}
        initialDestination={addPlanDestination}
        isLoggedIn={isLoggedIn}
        isGitHubVerified={isCloudVerified}
        isSigningIn={auth.isSigningIn}
        onLogin={auth.loginWithGitHub}
        onRequireVerification={requireVerification}
      />

      <DialogSlot open={showPlanManagerModal} onFailure={dialogFailed(() => setShowPlanManagerModal(false))}>
        <PlanManagerModal
          show={showPlanManagerModal}
          setShow={setShowPlanManagerModal}
          activeProjectId={project.activeProjectId}
          customProjects={project.customProjects}
          ownedRooms={ownedRooms}
          sharedRooms={sharedRooms}
          userProfile={auth.userProfile}
          activePlanData={editor.parsedData}
          isLoggedIn={isLoggedIn}
          isCloudVerified={isCloudVerified}
          isSigningIn={auth.isSigningIn}
          onLogin={auth.loginWithGitHub}
          onRequireVerification={requireVerification}
          onSelectProject={handleSelectProjectOrRoom}
          onDeleteProject={project.handleDeleteProject}
          onDuplicateProject={project.handleDuplicateProject}
          onRenameProject={project.handleRenameProject}
          onCreateLocalCopy={project.handleCreateLocalCopyFromData}
          onPublishToCloud={handleCreateCloudRoomFromData}
          onDeleteCloudRoom={handleDeleteCloudRoom}
          onLeaveCloudRoom={handleLeaveCloudRoom}
          onOpenShareRoom={handleOpenShareRoom}
          onOpenAddPlanModal={() => openAddPlan("local")}
          onCreateNewRoom={() => openAddPlan("new_room")}
          onJoinRoomLink={openJoinRoomDialog}
          onSignOut={async () => {
            await auth.logout();
            setShowPlanManagerModal(false);
            toast.showToast("Signed out.");
          }}
          onImportFile={openImportPicker}
          showToast={toast.showToast}
        />
      </DialogSlot>

      <PeopleTeamsModal
        showPeopleModal={people.showPeopleModal}
        setShowPeopleModal={people.setShowPeopleModal}
        peopleModalTab={people.peopleModalTab}
        setPeopleModalTab={people.setPeopleModalTab}
        effectivePeople={people.effectivePeople}
        people={people.people}
        teams={people.teams}
        parsedData={editor.parsedData}
        newPersonName={people.newPersonName}
        setNewPersonName={people.setNewPersonName}
        newPersonRole={people.newPersonRole}
        setNewPersonRole={people.setNewPersonRole}
        newPersonTeamId={people.newPersonTeamId}
        setNewPersonTeamId={people.setNewPersonTeamId}
        handleAddPerson={people.handleAddPerson}
        onAddRealTeammate={people.handleAddRealTeammate}
        handlePersistAllPeople={people.handlePersistAllPeople}
        handlePersistPerson={people.handlePersistPerson}
        handleRemovePerson={people.handleRemovePerson}
        newTeamName={people.newTeamName}
        setNewTeamName={people.setNewTeamName}
        newTeamColor={people.newTeamColor}
        setNewTeamColor={people.setNewTeamColor}
        newTeamDesc={people.newTeamDesc}
        setNewTeamDesc={people.setNewTeamDesc}
        handleAddTeam={people.handleAddTeam}
        handleRemoveTeam={people.handleRemoveTeam}
      />

      <DialogSlot open={roomSync.showRoomModal} onFailure={dialogFailed(() => roomSync.setShowRoomModal(false))}>
        <CloudRoomModal
          showModal={roomSync.showRoomModal}
          setShowModal={roomSync.setShowRoomModal}
          activeProject={project.activeProject}
          // Both resolve false on failure, which keeps the dialog open with its error message.
          onCreateRoom={roomSync.handleCreateRoom}
          onJoinRoom={roomSync.handleJoinRoom}
          onLogin={auth.loginWithGitHub}
          isProcessing={roomSync.isProcessing}
          activeRoomId={roomSync.activeRoomId}
          activeRoomRole={roomSync.activeRoomRole}
          currentUserProfile={auth.userProfile}
        />
      </DialogSlot>

      <DialogSlot open={sharing.showShareModal} onFailure={dialogFailed(() => sharing.setShowShareModal(false))}>
        <ShareModal
          showShareModal={sharing.showShareModal}
          setShowShareModal={sharing.setShowShareModal}
          currentProjectName={project.currentProjectName}
          parsedData={editor.parsedData}
          activeView={viewport.activeView}
          activeTheme={viewport.activeTheme}
          activeProject={project.activeProject}
          activeProjectId={project.activeProjectId}
          shareUrl={sharing.shareUrl}
          roomRole={shareRoomRole}
          setIsSidebarCollapsed={sidebar.setIsSidebarCollapsed}
          handleDownloadJson={() => exportActivePlan("json")}
          isLoggedIn={isLoggedIn}
          isCloudVerified={isCloudVerified}
          isSigningIn={auth.isSigningIn}
          onCreateRoomFromActive={roomSync.createRoomFromActive}
          onOpenShareRoom={handleOpenShareRoom}
          onLogin={auth.loginWithGitHub}
          onOpenVerificationModal={requireVerification}
          onMakeLocalCopy={() => {
            if (editor.parsedData) {
              project.handleCreateLocalCopyFromData(project.currentProjectName, editor.parsedData);
            }
          }}
          showToast={toast.showToast}
        />
      </DialogSlot>

      <AutoSaveModal
        showAutoSaveModal={autoSave.showAutoSaveModal}
        setShowAutoSaveModal={autoSave.setShowAutoSaveModal}
        saveStatus={autoSave.saveStatus}
        lastSavedAt={autoSave.lastSavedAt}
        handleManualSaveNow={autoSave.handleManualSaveNow}
        autoSaveInterval={autoSave.autoSaveInterval}
        setAutoSaveInterval={autoSave.setAutoSaveInterval}
        storageSizeKb={autoSave.storageSizeKb}
        onImportJson={openImportPicker}
        onExportJson={() => exportActivePlan("json")}
        onExportCsv={() => exportActivePlan("csv")}
      />

      <VersionHistoryModal
        showModal={vault.showVersionHistoryModal}
        setShowModal={vault.setShowVersionHistoryModal}
        snapshots={vault.snapshots}
        currentProjectName={project.currentProjectName}
        onRestoreSnapshot={handleRestoreSnapshot}
        onClearHistory={() => vault.clearSnapshots(project.activeProjectId)}
      />

      {/* Blocking and not dismissable: a failure leaves the account without a handle, still usable locally. */}
      <DialogSlot open={auth.needsUsernameOnboarding} onFailure={dialogFailed(() => undefined)}>
        <UsernameOnboardingModal
          show={auth.needsUsernameOnboarding}
          currentUser={auth.currentUser}
          onClaimUsername={async (username: string) => {
            await auth.completeUsernameOnboarding(username);
            toast.showToast(`Username @${username} claimed! Welcome to Jantt Cloud.`);
          }}
          onSignOut={auth.logout}
        />
      </DialogSlot>

      <DialogSlot open={showShareRoomModal} onFailure={dialogFailed(() => setShowShareRoomModal(false))}>
        <ShareRoomModal
          show={showShareRoomModal}
          setShow={setShowShareRoomModal}
          roomId={shareModalRoomId}
          roomTitle={
            ownedRooms.find((r) => r.roomId === shareModalRoomId)?.title ||
            sharedRooms.find((r) => r.roomId === shareModalRoomId)?.title ||
            project.customProjects.find((p) => p.roomId === shareModalRoomId)?.name ||
            "Project Room"
          }
          currentUserProfile={auth.userProfile}
          showToast={toast.showToast}
          // Teams, people and counts come from the shared room itself (it may not be the open plan).
          activeView={viewport.activeView}
          selectedThemeId={viewport.selectedThemeId}
        />
      </DialogSlot>

      <DialogSlot
        open={ENABLE_GITHUB_VERIFICATION_GATE && auth.showVerificationModal}
        onFailure={dialogFailed(() => auth.setShowVerificationModal(false))}
      >
        <GitHubVerificationModal
          show={ENABLE_GITHUB_VERIFICATION_GATE && auth.showVerificationModal}
          setShow={auth.setShowVerificationModal}
          verificationStatus={auth.verificationStatus}
          isVerifying={auth.isVerifying}
          onVerify={auth.checkVerification}
          onFollowCreator={auth.followCreatorHandler}
          onFollowOrg={auth.followOrgHandler}
          onStarRepo={auth.starRepoHandler}
          onStarAll={auth.starAllHandler}
          githubUsername={auth.userProfile?.githubUsername || auth.userProfile?.username}
        />
      </DialogSlot>
    </>
  );
};
