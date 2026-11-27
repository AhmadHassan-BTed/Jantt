import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Layers,
  Search,
  HardDrive,
  Cloud,
  Users,
  Crown,
  Plus,
  Check,
  ArrowLeftRight,
  ChevronDown,
  Share2,
  Upload,
  Sparkles,
  GripVertical,
  LogOut,
  Trash2,
  UserMinus,
  MoreVertical,
  Edit2,
  Files,
  FileJson,
  FileSpreadsheet,
  Github,
  ShieldCheck,
  Loader2,
  Link2,
  X
} from "lucide-react";
import type { JanttData } from "@jantt/core";
import type { SavedProject } from "../../types";
import { getRoom, type UserRoomPointer, type UserProfile } from "../../firebase";
import { DEFAULT_TEMPLATE } from "../../constants";
import { tGlobal, type MessageKey, type MessageParams } from "../../i18n";
import { useI18n } from "../../i18n/I18nProvider";
import { ConfirmDialog, Modal, ModalHeader, downloadPlanExport, useMediaQuery, type ConfirmDialogProps } from "./ModalHost";

import "./plan-manager.css";

type Translator = (key: MessageKey, params?: MessageParams) => string;

export interface PlanManagerModalProps {
  show: boolean;
  setShow: (show: boolean) => void;
  activeProjectId: string;
  customProjects: SavedProject[];
  ownedRooms: UserRoomPointer[];
  sharedRooms: UserRoomPointer[];
  userProfile?: UserProfile | null;
  /** Live editor data of the open plan; it can hold edits that are not autosaved yet. */
  activePlanData?: JanttData | null;
  /** Defaults to whether a user profile is present. */
  isLoggedIn?: boolean;
  /** Whether cloud rooms may be created (GitHub verification gate passed or disabled). */
  isCloudVerified?: boolean;
  /** A GitHub sign-in is in progress: sign-in buttons are disabled so it is not started twice. */
  isSigningIn?: boolean;
  onLogin?: () => void;
  onRequireVerification?: () => void;
  onSelectProject: (id: string) => void;
  /**
   * Removes a plan (or a cached room copy) from this device. The Plan Manager confirms in-app first
   * and passes `{ confirm: false }`, so the implementation must not prompt again. Returns false when
   * nothing was removed.
   */
  onDeleteProject: (id: string, options?: { confirm?: boolean }) => boolean | void;
  onDuplicateProject: (id: string) => void;
  onRenameProject: (id: string, newName: string) => void;
  onCreateLocalCopy: (title: string, data: JanttData) => void;
  /** Creates a cloud room from the data and resolves with its id, or null when it was not created. */
  onPublishToCloud: (title: string, data: JanttData) => Promise<string | null>;
  onDeleteCloudRoom?: (roomId: string) => Promise<void>;
  onLeaveCloudRoom?: (roomId: string) => Promise<void>;
  onOpenShareRoom?: (roomId: string) => void;
  onOpenAddPlanModal: () => void;
  onCreateNewRoom?: () => void;
  /** Opens the "join a room by link or ID" dialog (offered in the "Shared with me" list). */
  onJoinRoomLink?: () => void;
  onSignOut?: () => Promise<void>;
  /** Opens the file picker that imports .json, MS Project .xml, Primavera .xer or .csv files. */
  onImportFile: () => void;
  showToast: (msg: string, isErr?: boolean) => void;
}

/* --------------------------------------------------------------------------
   Plan lists & transfer rules (pure, so drag & drop and the dropdown share them)
   -------------------------------------------------------------------------- */

export type PlanListId = "device" | "cloud" | "shared";
export type PlanItemKind = "template" | "local" | "owned_room" | "shared_room" | "cached_room";
export type TransferKind = "copy_to_cloud" | "move_to_cloud" | "copy_to_device";

export interface PlanCardItem {
  id: string;
  name: string;
  kind: PlanItemKind;
  list: PlanListId;
  /** null when neither a cached copy nor the room pointer knows the count. */
  taskCount: number | null;
  updatedAt?: string;
  data?: JanttData;
  roomId?: string;
  roleLabel?: string;
  ownerUsername?: string;
  badge?: string;
  isActive: boolean;
}

export interface TransferOption {
  list: PlanListId;
  label: string;
  /** Set when the transfer can run; otherwise `disabledReason` explains why not. */
  kind?: TransferKind;
  disabledReason?: string;
}

export const PLAN_LIST_ORDER: PlanListId[] = ["device", "cloud", "shared"];

function latestTimestamp(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

/**
 * Splits everything the user can open into exactly three lists:
 * "This device" (local plans + the built-in sample), "My cloud" (rooms the user owns) and
 * "Shared with me" (rooms shared with the user, plus rooms cached on this device that are in
 * neither pointer list, e.g. opened from a link or while signed out).
 */
export function buildPlanLists({
  customProjects,
  ownedRooms,
  sharedRooms,
  activeProjectId,
  isLoggedIn
}: {
  customProjects: SavedProject[];
  ownedRooms: UserRoomPointer[];
  sharedRooms: UserRoomPointer[];
  activeProjectId: string;
  isLoggedIn: boolean;
}, t: Translator = tGlobal): Record<PlanListId, PlanCardItem[]> {
  const cachedRooms = new Map<string, SavedProject>();
  const device: PlanCardItem[] = [];

  for (const project of customProjects) {
    if (project.source === "room") {
      if (project.roomId) cachedRooms.set(project.roomId, project);
      continue;
    }
    device.push({
      id: project.id,
      name: project.name,
      kind: "local",
      list: "device",
      taskCount: project.data?.tasks?.length ?? 0,
      updatedAt: project.updatedAt,
      data: project.data,
      isActive: activeProjectId === project.id
    });
  }
  device.push({
    id: "default",
    name: DEFAULT_TEMPLATE.name,
    kind: "template",
    list: "device",
    taskCount: DEFAULT_TEMPLATE.data.tasks?.length ?? 0,
    data: DEFAULT_TEMPLATE.data,
    badge: t("plan.badgeBuiltInSample"),
    isActive: activeProjectId === "default"
  });

  const listedRoomIds = new Set<string>();
  const toRoomItem = (
    pointer: UserRoomPointer,
    kind: "owned_room" | "shared_room",
    list: PlanListId,
    roleLabel: string
  ): PlanCardItem => {
    listedRoomIds.add(pointer.roomId);
    const cached = cachedRooms.get(pointer.roomId);
    const id = cached?.id ?? `room-${pointer.roomId}`;
    return {
      id,
      name: pointer.title || cached?.name || t("plan.roomFallback", { id: pointer.roomId }),
      kind,
      list,
      roomId: pointer.roomId,
      taskCount: cached?.data?.tasks?.length ?? pointer.taskCount ?? null,
      updatedAt: latestTimestamp(cached?.updatedAt, pointer.updatedAt),
      data: cached?.data,
      roleLabel,
      ownerUsername: kind === "shared_room" ? pointer.ownerUsername : undefined,
      isActive: activeProjectId === id
    };
  };

  const cloud = ownedRooms.map((r) => toRoomItem(r, "owned_room", "cloud", t("plan.roleOwner")));
  const shared = sharedRooms
    .filter((r) => !listedRoomIds.has(r.roomId))
    .map((r) =>
      toRoomItem(r, "shared_room", "shared", r.role === "editor" ? t("plan.roleEditor") : t("plan.roleViewer"))
    );

  for (const [roomId, project] of cachedRooms) {
    if (listedRoomIds.has(roomId)) continue;
    shared.push({
      id: project.id,
      name: project.name,
      kind: "cached_room",
      list: "shared",
      roomId,
      taskCount: project.data?.tasks?.length ?? 0,
      updatedAt: project.updatedAt,
      data: project.data,
      roleLabel: project.role === "collaborator" ? t("plan.roleEditor") : t("plan.roleViewer"),
      badge: isLoggedIn ? t("plan.badgeOpenedViaLink") : t("plan.badgeSavedOffline"),
      isActive: activeProjectId === project.id
    });
  }

  return { device, cloud, shared };
}

/**
 * Every transfer a card can offer, grouped by target list, with an explanation for targets that
 * are not possible. Transfers never delete or leave a cloud room: rooms are only copied to the
 * device, and only a device plan can be moved (copied to the cloud, then removed locally).
 */
export function getTransferOptions(
  kind: PlanItemKind,
  cloudBlockedReason?: string,
  t: Translator = tGlobal
): TransferOption[] {
  const toCloud = (label: string, transfer: TransferKind): TransferOption =>
    cloudBlockedReason
      ? { list: "cloud", label, disabledReason: cloudBlockedReason }
      : { list: "cloud", label, kind: transfer };

  switch (kind) {
    case "template":
      return [
        toCloud(t("plan.transfer.copyIntoNewRoom"), "copy_to_cloud"),
        { list: "shared", label: t("plan.transfer.notPossible"), disabledReason: t("plan.reason.sharedListOnly") }
      ];
    case "local":
      return [
        toCloud(t("plan.transfer.copyToCloudKeep"), "copy_to_cloud"),
        toCloud(t("plan.transfer.moveToCloudRemove"), "move_to_cloud"),
        { list: "shared", label: t("plan.transfer.notPossible"), disabledReason: t("plan.reason.sharedListOnly") }
      ];
    case "owned_room":
      return [
        { list: "device", label: t("plan.transfer.saveCopyRoomCloud"), kind: "copy_to_device" },
        { list: "shared", label: t("plan.transfer.notPossible"), disabledReason: t("plan.reason.youOwnRoom") }
      ];
    case "shared_room":
    case "cached_room":
      return [
        { list: "device", label: t("plan.transfer.saveCopyRoomShared"), kind: "copy_to_device" },
        toCloud(t("plan.transfer.copyIntoOwnRoom"), "copy_to_cloud")
      ];
  }
}

/** A transfer that never removes anything. Drops may only perform these. */
export type CopyTransferKind = Exclude<TransferKind, "move_to_cloud">;

/** The transfer a drop onto `list` performs: always the non-destructive copy, never a move. */
export function getDropTransfer(
  kind: PlanItemKind,
  list: PlanListId,
  cloudBlockedReason?: string,
  t: Translator = tGlobal
): CopyTransferKind | null {
  for (const option of getTransferOptions(kind, cloudBlockedReason, t)) {
    if (option.list === list && option.kind && option.kind !== "move_to_cloud") return option.kind;
  }
  return null;
}

/* --------------------------------------------------------------------------
   Presentation
   -------------------------------------------------------------------------- */

const LIST_META: Record<PlanListId, { titleKey: MessageKey; descriptionKey: MessageKey; icon: React.ReactNode }> = {
  device: {
    titleKey: "plan.list.device",
    descriptionKey: "plan.list.deviceDesc",
    icon: <HardDrive size={16} />
  },
  cloud: {
    titleKey: "plan.list.cloud",
    descriptionKey: "plan.list.cloudDesc",
    icon: <Crown size={16} />
  },
  shared: {
    titleKey: "plan.list.shared",
    descriptionKey: "plan.list.sharedDesc",
    icon: <Users size={16} />
  }
};

const DROP_HINTS: Record<CopyTransferKind, MessageKey> = {
  copy_to_cloud: "plan.drop.copyToCloud",
  copy_to_device: "plan.drop.copyToDevice"
};

/** Private drag type: only plan cards dragged inside this dialog are accepted as drops. */
const PLAN_DRAG_MIME = "application/x-jantt-plan";

const hasDragType = (event: { dataTransfer: DataTransfer | null }, type: string) =>
  Array.from(event.dataTransfer?.types ?? []).includes(type);

const TARGET_ICONS: Record<PlanListId, React.ReactNode> = {
  device: <HardDrive size={13} />,
  cloud: <Cloud size={13} />,
  shared: <Users size={13} />
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const KIND_ICONS: Record<PlanItemKind, React.ReactNode> = {
  template: <Sparkles size={16} style={{ color: "var(--jantt-accent, #38BDF8)", flexShrink: 0 }} />,
  local: <HardDrive size={16} style={{ color: "var(--jantt-accent)", flexShrink: 0 }} />,
  owned_room: <Crown size={16} style={{ color: "var(--jantt-accent)", flexShrink: 0 }} />,
  shared_room: <Users size={16} style={{ color: "var(--jantt-accent)", flexShrink: 0 }} />,
  cached_room: <Link2 size={16} style={{ color: "var(--jantt-accent)", flexShrink: 0 }} />
};

const pillStyle = (background: string, color: string): React.CSSProperties => ({
  padding: "1px 6px",
  borderRadius: "4px",
  fontSize: "10px",
  fontWeight: 600,
  textTransform: "uppercase",
  background,
  color,
  whiteSpace: "nowrap"
});

const hintStyle = (allowed: boolean): React.CSSProperties => ({
  margin: "8px 12px 0",
  padding: "6px 10px",
  borderRadius: "6px",
  fontSize: "11px",
  fontWeight: 600,
  border: `1px dashed ${allowed ? "rgba(16, 185, 129, 0.5)" : "rgba(148, 163, 184, 0.4)"}`,
  background: allowed ? "rgba(16, 185, 129, 0.1)" : "rgba(148, 163, 184, 0.08)",
  color: allowed ? "#10B981" : "var(--jantt-text-muted)"
});

const noticeStyle: React.CSSProperties = {
  margin: "8px 12px 0",
  padding: "8px 10px",
  borderRadius: "8px",
  fontSize: "11.5px",
  lineHeight: 1.4,
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexWrap: "wrap",
  background: "rgba(245, 158, 11, 0.08)",
  border: "1px solid rgba(245, 158, 11, 0.25)",
  color: "var(--jantt-text)"
};

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Every action that removes something; each one is confirmed exactly once, here, before it runs. */
type ConfirmAction = "delete_local" | "remove_cached" | "move_to_cloud" | "delete_room" | "leave_room";

interface ConfirmRequest {
  action: ConfirmAction;
  item: PlanCardItem;
}

/** A published "Move to My cloud" whose device copy is removed once the new room is listed. */
interface PendingMove {
  localId: string;
  roomId: string;
  name: string;
  startedAt: number;
}

/** A move whose room never shows up in the plan list keeps the device copy. */
const PENDING_MOVE_TIMEOUT_MS = 60_000;

interface MenuEntry {
  key: string;
  label: string;
  icon: React.ReactNode;
  tone?: "danger";
  /** Secondary line, e.g. why the entry is unavailable. */
  description?: string;
  /** Stays focusable (so its reason can be read) but cannot be activated. */
  disabled?: boolean;
  onSelect: () => void;
}

interface MenuGroup {
  label?: string;
  entries: MenuEntry[];
}

type CardMenuKind = "actions" | "transfer";

function describeConfirm(
  { action, item }: ConfirmRequest,
  t: Translator
): Omit<ConfirmDialogProps, "onConfirm" | "onCancel"> {
  const name = <strong>&ldquo;{item.name}&rdquo;</strong>;
  switch (action) {
    case "delete_local":
      return {
        title: t("plan.confirm.deleteLocal.title"),
        tone: "danger",
        confirmLabel: t("plan.confirm.deleteLocal.confirm"),
        message: (
          <>
            {t("plan.confirm.deleteLocal.before")} {name} {t("plan.confirm.deleteLocal.after")}
          </>
        )
      };
    case "remove_cached":
      return {
        title: t("plan.confirm.removeCached.title"),
        tone: "danger",
        confirmLabel: t("plan.confirm.removeCached.confirm"),
        message: (
          <>
            {t("plan.confirm.removeCached.before")} {name}
            {item.roomId ? ` (#${item.roomId})` : ""} {t("plan.confirm.removeCached.after")}
          </>
        )
      };
    case "move_to_cloud":
      return {
        title: t("plan.confirm.moveToCloud.title"),
        confirmLabel: t("plan.confirm.moveToCloud.confirm"),
        message: (
          <>
            {t("plan.confirm.moveToCloud.before")} {name}{t("plan.confirm.moveToCloud.after")}
          </>
        )
      };
    case "delete_room":
      return {
        title: t("plan.confirm.deleteRoom.title"),
        tone: "danger",
        confirmLabel: t("plan.confirm.deleteRoom.confirm"),
        confirmPhrase: item.name,
        message: (
          <>
            {t("plan.confirm.deleteRoom.before")} {name} (#{item.roomId}) {t("plan.confirm.deleteRoom.after")}
          </>
        )
      };
    case "leave_room":
      return {
        title: t("plan.confirm.leaveRoom.title"),
        tone: "danger",
        confirmLabel: t("plan.confirm.leaveRoom.confirm"),
        message: (
          <>
            {t("plan.confirm.leaveRoom.before")} {name}
            {item.ownerUsername ? ` ${t("plan.confirm.leaveRoom.ownedBy", { name: item.ownerUsername })}` : ""}{" "}
            {t("plan.confirm.leaveRoom.after")}
          </>
        )
      };
  }
}

/** Positions a menu inside `container` (its containing block): below the anchor, or above when roomier. */
function computeMenuPosition(menu: HTMLElement, container: HTMLElement, anchorEl: HTMLElement) {
  const margin = 8;
  const gap = 4;
  const bounds = container.getBoundingClientRect();
  const originTop = bounds.top + container.clientTop;
  const originLeft = bounds.left + container.clientLeft;
  const innerHeight = container.clientHeight;
  const innerWidth = container.clientWidth;
  const anchor = anchorEl.getBoundingClientRect();
  const spaceBelow = originTop + innerHeight - anchor.bottom - margin - gap;
  const spaceAbove = anchor.top - originTop - margin - gap;
  const openUp = menu.scrollHeight > spaceBelow && spaceAbove > spaceBelow;
  const maxHeight = Math.max(120, openUp ? spaceAbove : spaceBelow);
  const height = Math.min(menu.scrollHeight, maxHeight);
  const rawTop = openUp ? anchor.top - originTop - gap - height : anchor.bottom - originTop + gap;
  const top = Math.min(Math.max(rawTop, margin), Math.max(margin, innerHeight - height - margin));
  const rawLeft = anchor.right - originLeft - menu.offsetWidth;
  const left = Math.min(Math.max(rawLeft, margin), Math.max(margin, innerWidth - menu.offsetWidth - margin));
  return { top, left, maxHeight };
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export const PlanManagerModal: React.FC<PlanManagerModalProps> = (props) => {
  const { customProjects, onDeleteProject, showToast } = props;
  const { t } = useI18n();

  // One plan action at a time, across reopenings too: closing the manager during a publish and
  // opening it again must not allow a second publish of the same plan.
  const busyRef = useRef(false);

  // "Move to My cloud" (already confirmed) = publish a room, then remove the device copy. The
  // removal runs only once the new room is committed to the project list, so it can never act on
  // a list from before the room existed, and nothing is removed if publishing fails. This lives
  // outside the dialog because a successful publish closes the dialog.
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  useEffect(() => {
    if (!pendingMove) return;
    const kept = () =>
      showToast(t("plan.toast.keptLocal", { name: pendingMove.name }), true);
    if (customProjects.some((p) => p.roomId === pendingMove.roomId)) {
      setPendingMove(null);
      if (onDeleteProject(pendingMove.localId, { confirm: false }) === false) kept();
      else showToast(t("plan.toast.movedToCloud", { name: pendingMove.name }));
      return;
    }
    // Measured from the start, so frequent list updates (autosaves) cannot keep postponing it.
    const timer = window.setTimeout(() => {
      setPendingMove(null);
      kept();
    }, Math.max(0, pendingMove.startedAt + PENDING_MOVE_TIMEOUT_MS - Date.now()));
    return () => window.clearTimeout(timer);
  }, [pendingMove, customProjects, onDeleteProject, showToast, t]);

  if (!props.show) return null;
  // Mounted per open: search, menus and confirmations always start fresh.
  return <PlanManagerDialog {...props} busyRef={busyRef} onMoveCompleted={setPendingMove} />;
};

interface PlanManagerDialogProps extends PlanManagerModalProps {
  busyRef: React.MutableRefObject<boolean>;
  onMoveCompleted: (move: PendingMove) => void;
}

const PlanManagerDialog: React.FC<PlanManagerDialogProps> = (props) => {
  const {
    setShow,
    activeProjectId,
    customProjects,
    ownedRooms,
    sharedRooms,
    userProfile,
    isCloudVerified = true,
    isSigningIn = false,
    onLogin,
    onRequireVerification,
    onDuplicateProject,
    onRenameProject,
    onDeleteCloudRoom,
    onLeaveCloudRoom,
    onOpenShareRoom,
    onOpenAddPlanModal,
    onCreateNewRoom,
    onJoinRoomLink,
    onSignOut,
    onImportFile,
    showToast,
    busyRef,
    onMoveCompleted
  } = props;
  const { t } = useI18n();
  // Handlers called after an await use the newest props, not the ones from the click's render.
  const latestRef = useRef(props);
  latestRef.current = props;

  const isLoggedIn = props.isLoggedIn ?? Boolean(userProfile);
  const cloudBlockedReason = !isLoggedIn
    ? t("plan.reason.signInFirst")
    : !isCloudVerified
    ? t("plan.reason.verifyFirst")
    : undefined;
  const isNarrow = useMediaQuery("(max-width: 960px)");

  const filterRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [narrowList, setNarrowList] = useState<PlanListId>(() =>
    activeProjectId.startsWith("room-")
      ? ownedRooms.some((r) => `room-${r.roomId}` === activeProjectId)
        ? "cloud"
        : "shared"
      : "device"
  );
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renamingIdRef = useRef<string | null>(null);
  const renameReturnFocusRef = useRef<HTMLElement | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ itemId: string; kind: CardMenuKind; anchor: HTMLButtonElement } | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [dragging, setDragging] = useState<{ id: string; kind: PlanItemKind; list: PlanListId } | null>(null);
  const [dragOverList, setDragOverList] = useState<PlanListId | null>(null);

  const lists = useMemo(
    () => buildPlanLists({ customProjects, ownedRooms, sharedRooms, activeProjectId, isLoggedIn }, t),
    [customProjects, ownedRooms, sharedRooms, activeProjectId, isLoggedIn, t]
  );
  const itemsById = useMemo(() => {
    const map = new Map<string, PlanCardItem>();
    PLAN_LIST_ORDER.forEach((list) => lists[list].forEach((item) => map.set(item.id, item)));
    return map;
  }, [lists]);
  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return lists;
    const matches = (item: PlanCardItem) =>
      item.name.toLowerCase().includes(query) ||
      Boolean(item.roomId?.toLowerCase().includes(query)) ||
      Boolean(item.ownerUsername?.toLowerCase().includes(query));
    return {
      device: lists.device.filter(matches),
      cloud: lists.cloud.filter(matches),
      shared: lists.shared.filter(matches)
    };
  }, [lists, searchQuery]);

  const close = () => setShow(false);

  /* ----- actions ----- */

  // One action at a time across the whole manager: no duplicate rooms from double clicks or drops.
  const runExclusive = async (itemId: string, task: () => Promise<void> | void) => {
    if (busyRef.current) {
      showToast(t("plan.toast.busy"), true);
      return;
    }
    busyRef.current = true;
    setBusyItemId(itemId);
    try {
      await task();
    } catch (err) {
      showToast(errorMessage(err), true);
    } finally {
      busyRef.current = false;
      setBusyItemId(null);
    }
  };

  const resolvePlanData = async (item: PlanCardItem): Promise<JanttData | null> => {
    const { activePlanData } = latestRef.current;
    if (item.isActive && activePlanData) return activePlanData;
    if (item.roomId) {
      try {
        const payload = await getRoom(item.roomId);
        if (payload?.data) return payload.data;
      } catch (err) {
        if (!item.data) {
          showToast(t("plan.toast.loadFailed", { name: item.name, error: errorMessage(err) }), true);
          return null;
        }
        showToast(t("plan.toast.offlineCopy", { name: item.name }), true);
      }
    }
    if (item.data) return item.data;
    showToast(t("plan.toast.noData", { name: item.name }), true);
    return null;
  };

  const requestCloudAccess = () => {
    if (!isLoggedIn) {
      if (!latestRef.current.isSigningIn) onLogin?.();
    } else {
      onRequireVerification?.();
    }
  };

  // Only reachable through a confirmed `move_to_cloud` request or a non-destructive copy.
  const performTransfer = (item: PlanCardItem, kind: TransferKind) =>
    runExclusive(item.id, async () => {
      if (kind === "copy_to_device") {
        const data = await resolvePlanData(item);
        if (data) latestRef.current.onCreateLocalCopy(item.name, data);
        return;
      }
      // Rooms are never moved: only a device plan can leave this device.
      if (kind === "move_to_cloud" && item.kind !== "local") return;
      if (cloudBlockedReason) {
        requestCloudAccess();
        return;
      }
      const data = await resolvePlanData(item);
      if (!data) return;
      // Success and failure feedback comes from the room publisher itself.
      const roomId = await latestRef.current.onPublishToCloud(item.name, data);
      if (roomId && kind === "move_to_cloud") {
        onMoveCompleted({ localId: item.id, roomId, name: item.name, startedAt: Date.now() });
      }
    });

  /** Every transfer entry point (menu and drop) goes through here; moves are confirmed first. */
  const requestTransfer = (item: PlanCardItem, kind: TransferKind) => {
    if (kind === "move_to_cloud") setConfirm({ action: "move_to_cloud", item });
    else void performTransfer(item, kind);
  };

  const executeConfirmed = ({ action, item }: ConfirmRequest) => {
    setConfirm(null);
    const roomId = item.roomId;
    switch (action) {
      case "delete_local":
      case "remove_cached":
        // Confirmed above, so the project hook must not ask a second time.
        void runExclusive(item.id, () => {
          latestRef.current.onDeleteProject(item.id, { confirm: false });
        });
        break;
      case "move_to_cloud":
        void performTransfer(item, "move_to_cloud");
        break;
      case "delete_room":
        if (roomId) {
          void runExclusive(item.id, () => latestRef.current.onDeleteCloudRoom?.(roomId));
        }
        break;
      case "leave_room":
        if (roomId) {
          void runExclusive(item.id, () => latestRef.current.onLeaveCloudRoom?.(roomId));
        }
        break;
    }
  };

  const exportPlan = (item: PlanCardItem, format: "json" | "csv") =>
    runExclusive(item.id, async () => {
      const data = await resolvePlanData(item);
      if (!data) return;
      try {
        downloadPlanExport(item.name, data, format);
      } catch (err) {
        showToast(t("plan.toast.exportFailed", { format: format.toUpperCase(), error: errorMessage(err) }), true);
      }
    });

  const startRename = (item: PlanCardItem, returnFocusTo: HTMLElement | null) => {
    renamingIdRef.current = item.id;
    renameReturnFocusRef.current = returnFocusTo;
    setRenameValue(item.name);
    setRenamingId(item.id);
  };

  const finishRename = (item: PlanCardItem, mode: "commit" | "cancel", returnFocus: boolean) => {
    if (renamingIdRef.current !== item.id) return;
    renamingIdRef.current = null;
    setRenamingId(null);
    const nextName = renameValue.trim();
    if (mode === "commit" && nextName && nextName !== item.name) onRenameProject(item.id, nextName);
    const target = renameReturnFocusRef.current;
    if (returnFocus && target?.isConnected) target.focus();
  };

  /* ----- card menu ----- */

  const closeMenu = (returnFocus: boolean) => {
    const anchor = menu?.anchor;
    setMenu(null);
    if (returnFocus && anchor?.isConnected) anchor.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!menu || !el) return;
    // Place the menu inside the dialog card, below the trigger or above it when there is more room.
    const container = (el.offsetParent as HTMLElement | null) ?? el.parentElement;
    if (container) {
      setMenuPosition(computeMenuPosition(el, container, menu.anchor));
    }
    el.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || menu.anchor.contains(target)) return;
      setMenu(null);
    };
    const handleScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const handleResize = () => setMenu(null);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [menu]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => items[(i + items.length) % items.length].focus();
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(items.length - 1);
        break;
      case "Escape":
      case "Tab":
        // preventDefault also keeps Escape from closing the whole dialog.
        event.preventDefault();
        closeMenu(true);
        break;
    }
  };

  const openMenu = (item: PlanCardItem, kind: CardMenuKind, anchor: HTMLButtonElement) => {
    setMenuPosition(null);
    setMenu({ itemId: item.id, kind, anchor });
  };

  // Menu-button pattern: click, Enter, Space or ArrowDown open the menu; nothing runs until an
  // entry is activated (unlike a native <select>, whose arrow keys fire `change` while closed).
  const menuTriggerProps = (item: PlanCardItem, kind: CardMenuKind) => {
    const isOpen = menu?.itemId === item.id && menu.kind === kind;
    return {
      "aria-haspopup": "menu" as const,
      "aria-expanded": isOpen,
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        if (isOpen) closeMenu(false);
        else openMenu(item, kind, event.currentTarget);
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== "ArrowDown" || isOpen) return;
        event.preventDefault();
        openMenu(item, kind, event.currentTarget);
      }
    };
  };

  const getTransferGroups = (item: PlanCardItem): MenuGroup[] => {
    const options = getTransferOptions(item.kind, cloudBlockedReason, t);
    return PLAN_LIST_ORDER.filter((list) => list !== item.list).map((list) => ({
      label: t("plan.menu.toList", { list: t(LIST_META[list].titleKey) }),
      entries: options
        .filter((option) => option.list === list)
        .map((option, index): MenuEntry => {
          const kind = option.kind;
          return {
            key: kind ?? `blocked-${list}-${index}`,
            label: option.label,
            icon: TARGET_ICONS[list],
            description: option.disabledReason ? capitalize(option.disabledReason) : undefined,
            disabled: !kind,
            onSelect: () => {
              if (kind) requestTransfer(item, kind);
            }
          };
        })
    }));
  };

  const getActionGroups = (item: PlanCardItem): MenuGroup[] => {
    const anchor = menu?.anchor ?? null;
    const editing: MenuEntry[] = [];
    if (item.kind === "local") {
      editing.push({ key: "rename", label: t("plan.action.rename"), icon: <Edit2 size={13} />, onSelect: () => startRename(item, anchor) });
    }
    if (item.kind === "local" || item.kind === "template") {
      editing.push({ key: "duplicate", label: t("plan.action.duplicate"), icon: <Files size={13} />, onSelect: () => onDuplicateProject(item.id) });
    }
    const sharing: MenuEntry[] = [
      { key: "json", label: t("plan.action.exportJson"), icon: <FileJson size={13} />, onSelect: () => void exportPlan(item, "json") },
      { key: "csv", label: t("plan.action.exportCsv"), icon: <FileSpreadsheet size={13} />, onSelect: () => void exportPlan(item, "csv") }
    ];
    if (item.roomId && onOpenShareRoom && (item.kind === "owned_room" || item.kind === "shared_room")) {
      const roomId = item.roomId;
      sharing.push({ key: "share", label: t("plan.action.share"), icon: <Share2 size={13} />, onSelect: () => onOpenShareRoom(roomId) });
    }
    const destructive: MenuEntry[] = [];
    if (item.kind === "local") {
      destructive.push({ key: "delete", label: t("plan.action.deletePlan"), tone: "danger", icon: <Trash2 size={13} />, onSelect: () => setConfirm({ action: "delete_local", item }) });
    } else if (item.kind === "owned_room" && onDeleteCloudRoom) {
      destructive.push({ key: "delete-room", label: t("plan.action.deleteRoom"), tone: "danger", icon: <Trash2 size={13} />, onSelect: () => setConfirm({ action: "delete_room", item }) });
    } else if (item.kind === "shared_room" && onLeaveCloudRoom) {
      destructive.push({ key: "leave", label: t("plan.action.leaveRoom"), tone: "danger", icon: <UserMinus size={13} />, onSelect: () => setConfirm({ action: "leave_room", item }) });
    } else if (item.kind === "cached_room") {
      destructive.push({ key: "remove", label: t("plan.action.removeDevice"), tone: "danger", icon: <Trash2 size={13} />, onSelect: () => setConfirm({ action: "remove_cached", item }) });
    }
    return [editing, sharing, destructive].filter((entries) => entries.length > 0).map((entries) => ({ entries }));
  };

  /* ----- drag & drop (copy only; the "Move / copy to..." menu is the keyboard and touch alternative) ----- */

  const clearDrag = () => {
    setDragging(null);
    setDragOverList(null);
  };

  useEffect(() => {
    // A file dropped anywhere on the dialog would otherwise make the browser navigate to it.
    const blockFileDrop = (event: DragEvent) => {
      if (event.defaultPrevented || !hasDragType(event, "Files")) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    };
    // Switching windows mid-drag can swallow `dragend`.
    const handleBlur = () => {
      setDragging(null);
      setDragOverList(null);
    };
    window.addEventListener("dragover", blockFileDrop);
    window.addEventListener("drop", blockFileDrop);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("dragover", blockFileDrop);
      window.removeEventListener("drop", blockFileDrop);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  const dropTargetProps = (list: PlanListId) => ({
    onDragOver: (event: React.DragEvent) => {
      if (!dragging || !hasDragType(event, PLAN_DRAG_MIME)) return;
      if (dragging.list === list || !getDropTransfer(dragging.kind, list, cloudBlockedReason, t)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      if (dragOverList !== list) setDragOverList(list);
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setDragOverList((current) => (current === list ? null : current));
      }
    },
    onDrop: (event: React.DragEvent) => {
      const dragged = dragging;
      if (!dragged || !hasDragType(event, PLAN_DRAG_MIME)) return;
      event.preventDefault();
      clearDrag();
      if (dragged.list === list) return;
      const kind = getDropTransfer(dragged.kind, list, cloudBlockedReason, t);
      const item = itemsById.get(dragged.id);
      if (kind && item) void performTransfer(item, kind);
    }
  });

  const renderDropHint = (list: PlanListId) => {
    if (!dragging || dragging.list === list) return null;
    const kind = getDropTransfer(dragging.kind, list, cloudBlockedReason, t);
    if (kind) return <div style={hintStyle(true)}>{t(DROP_HINTS[kind])}</div>;
    const reason = getTransferOptions(dragging.kind, cloudBlockedReason, t).find((o) => o.list === list)?.disabledReason;
    return <div style={hintStyle(false)}>{t("plan.cantDrop")}{reason ? `: ${reason}` : ""}</div>;
  };

  /* ----- rendering ----- */

  const formatUpdatedAt = (isoStr?: string): string => {
    if (!isoStr) return t("plan.updated.never");
    const time = new Date(isoStr).getTime();
    if (Number.isNaN(time)) return t("plan.updated.unknown");
    const diff = Math.floor((Date.now() - time) / 1000);
    if (diff < 5) return t("plan.updated.justNow");
    if (diff < 60) return t("plan.updated.secondsAgo", { count: diff });
    if (diff < 3600) return t("plan.updated.minutesAgo", { count: Math.floor(diff / 60) });
    if (diff < 86400) return t("plan.updated.hoursAgo", { count: Math.floor(diff / 3600) });
    return t("plan.updated.daysAgo", { count: Math.floor(diff / 86400) });
  };

  const renderCard = (item: PlanCardItem) => {
    const isBusy = busyItemId === item.id;
    const isRenaming = renamingId === item.id;
    const isActionsMenuOpen = menu?.itemId === item.id && menu.kind === "actions";
    const isTransferMenuOpen = menu?.itemId === item.id && menu.kind === "transfer";
    const taskLabel =
      item.taskCount === null
        ? t("plan.tasksUnknown")
        : item.taskCount === 1
        ? t("plan.tasksOne", { count: item.taskCount })
        : t("plan.tasksMany", { count: item.taskCount });

    return (
      <div
        key={item.id}
        className={`plan-card ${item.isActive ? "is-active-plan" : ""} ${dragging?.id === item.id ? "is-dragging" : ""}`}
        draggable={!isNarrow && !isRenaming && !busyItemId}
        aria-busy={isBusy || undefined}
        onDragStart={(event) => {
          if (menu) setMenu(null);
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(PLAN_DRAG_MIME, item.id);
          event.dataTransfer.setData("text/plain", item.name);
          setDragging({ id: item.id, kind: item.kind, list: item.list });
        }}
        onDragEnd={clearDrag}
      >
        <div className="plan-card-top-row">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
            <GripVertical className="plan-drag-grip" size={14} aria-hidden="true" style={{ color: "var(--jantt-text-muted)", flexShrink: 0, opacity: 0.7 }} />
            {KIND_ICONS[item.kind]}
            {isRenaming ? (
              <input
                type="text"
                autoFocus
                className="select-input"
                aria-label={t("plan.renameAria", { name: item.name })}
                enterKeyHint="done"
                maxLength={120}
                style={{ padding: "2px 6px", fontSize: "13px", fontWeight: 600, flex: 1, height: "26px", minWidth: 0 }}
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onBlur={() => finishRename(item, "commit", false)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    finishRename(item, "commit", true);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    finishRename(item, "cancel", true);
                  }
                }}
              />
            ) : (
              <span
                className="plan-card-name"
                style={{
                  fontWeight: 600,
                  fontSize: "13.5px",
                  color: "var(--jantt-text, #F8FAFC)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
                title={item.name}
              >
                {item.name}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
            {isBusy && <Loader2 size={14} className="spin-sync-icon" aria-label={t("plan.working")} />}
            {item.isActive && (
              <span
                className="plan-current-marker"
              >
                <Check size={12} aria-hidden="true" /> {t("plan.openNow")}
              </span>
            )}
          </div>
        </div>

        <div className="plan-card-meta-row">
          <span>{taskLabel}</span>
          <span aria-hidden="true">&bull;</span>
          <span>{item.updatedAt ? formatUpdatedAt(item.updatedAt) : item.kind === "template" ? t("plan.builtIn") : t("plan.notSavedYet")}</span>
          {item.roomId && (
            <span style={{ padding: "1px 5px", borderRadius: "4px", background: "rgba(255, 255, 255, 0.05)", fontFamily: "monospace", fontSize: "10.5px" }}>
              #{item.roomId}
            </span>
          )}
          {item.roleLabel && (
            <span
              style={pillStyle(
                "var(--jantt-surface-hover)",
                "var(--jantt-text)"
              )}
            >
              {item.roleLabel}
            </span>
          )}
          {item.badge && <span style={pillStyle("rgba(148, 163, 184, 0.15)", "var(--jantt-text-muted)")}>{item.badge}</span>}
          {item.ownerUsername && <span style={{ fontSize: "11px" }}>{t("plan.byOwner", { name: item.ownerUsername })}</span>}
        </div>

        <div className="plan-card-action-bar">
          {!item.isActive && (
            <button
              type="button"
              className="btn-nav btn-nav-primary"
              style={{ padding: "4px 10px", fontSize: "11.5px" }}
              onClick={() => {
                latestRef.current.onSelectProject(item.id);
                close();
              }}
            >
              {t("plan.open")}
            </button>
          )}

          <button
            type="button"
            className={`btn-nav ${isTransferMenuOpen ? "btn-nav-primary" : ""}`}
            style={{ padding: "4px 9px", fontSize: "11.5px", gap: "5px" }}
            aria-label={t("plan.moveCopyAria", { name: item.name })}
            title={t("plan.moveCopyTitle")}
            disabled={Boolean(busyItemId)}
            {...menuTriggerProps(item, "transfer")}
          >
            <ArrowLeftRight size={12} aria-hidden="true" />
            <span>{t("plan.moveCopy")}</span>
            <ChevronDown size={12} aria-hidden="true" />
          </button>

          <button
            type="button"
            className={`btn-nav ${isActionsMenuOpen ? "btn-nav-primary" : ""}`}
            style={{ padding: "4px 6px", fontSize: "11px", marginLeft: "auto" }}
            aria-label={t("plan.moreActionsAria", { name: item.name })}
            title={t("plan.moreActions")}
            disabled={isBusy}
            {...menuTriggerProps(item, "actions")}
          >
            <MoreVertical size={13} />
          </button>
        </div>
      </div>
    );
  };

  const renderEmptyState = (list: PlanListId) => {
    if (searchQuery.trim()) {
      return (
        <div className="plan-board-empty-zone">
          <Search size={20} style={{ opacity: 0.5 }} />
          <span>{t("plan.empty.noMatch", { query: searchQuery.trim() })}</span>
        </div>
      );
    }
    if (list === "cloud" && !isLoggedIn) {
      return (
        <div className="plan-board-empty-zone">
          <Cloud size={24} style={{ opacity: 0.5 }} />
          <span style={{ fontWeight: 600 }}>{t("plan.empty.signInCloudTitle")}</span>
          <span style={{ fontSize: "11px", maxWidth: "240px", lineHeight: 1.4 }}>
            {t("plan.empty.signInCloudBody")}
          </span>
          {onLogin && (
            <button
              type="button"
              className="btn-nav btn-nav-primary"
              style={{ fontSize: "12px", gap: "6px" }}
              onClick={onLogin}
              disabled={isSigningIn}
              aria-busy={isSigningIn || undefined}
            >
              {isSigningIn ? <Loader2 size={13} className="spin-sync-icon" aria-hidden="true" /> : <Github size={13} />}
              <span>{isSigningIn ? t("plan.signingIn") : t("plan.signInGithub")}</span>
            </button>
          )}
        </div>
      );
    }
    if (list === "cloud") {
      return (
        <div className="plan-board-empty-zone">
          <Cloud size={24} style={{ opacity: 0.5 }} />
          <span style={{ fontWeight: 500 }}>{t("plan.empty.cloudTitle")}</span>
          <span style={{ fontSize: "11px", maxWidth: "240px", lineHeight: 1.4 }}>
            {t("plan.empty.cloudBody")}
          </span>
        </div>
      );
    }
    if (list === "shared") {
      return (
        <div className="plan-board-empty-zone">
          <Users size={24} style={{ opacity: 0.5 }} />
          <span style={{ fontWeight: 500 }}>{t("plan.empty.sharedTitle")}</span>
          <span style={{ fontSize: "11px", maxWidth: "240px", lineHeight: 1.4 }}>
            {isLoggedIn ? t("plan.empty.sharedBodySignedIn") : t("plan.empty.sharedBodySignedOut")}
          </span>
        </div>
      );
    }
    return (
      <div className="plan-board-empty-zone">
        <HardDrive size={22} style={{ opacity: 0.5 }} />
        <span>{t("plan.empty.deviceTitle")}</span>
      </div>
    );
  };

  const renderColumn = (list: PlanListId) => {
    const meta = LIST_META[list];
    const items = filtered[list];
    const isDragOver = dragOverList === list;
    return (
      <section
        key={list}
        id={`plan-list-panel-${list}`}
        role={isNarrow ? "tabpanel" : undefined}
        aria-labelledby={isNarrow ? `plan-list-tab-${list}` : `plan-list-title-${list}`}
        className={`plan-board-column ${isDragOver ? (list === "device" ? "is-drag-over-emerald" : "is-drag-over") : ""}`}
        {...dropTargetProps(list)}
      >
        <div className="plan-board-column-header" style={{ gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
            {meta.icon}
            <div style={{ minWidth: 0 }}>
              <h3
                id={`plan-list-title-${list}`}
                style={{ margin: 0, fontWeight: 700, fontSize: "13.5px", color: "var(--jantt-text)", display: "flex", alignItems: "center", gap: "6px" }}
              >
                {t(meta.titleKey)}
                <span
                  style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "10px", background: "rgba(148, 163, 184, 0.15)", color: "var(--jantt-text)", fontWeight: 600 }}
                >
                  {items.length}
                </span>
              </h3>
              <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>{t(meta.descriptionKey)}</div>
            </div>
          </div>
          {list === "cloud" && isLoggedIn && onCreateNewRoom && (
            <button
              type="button"
              className="btn-nav"
              style={{ padding: "3px 8px", fontSize: "11px", gap: "4px", flexShrink: 0 }}
              onClick={() => {
                close();
                onCreateNewRoom();
              }}
            >
              <Plus size={12} />
              <span>{t("plan.newRoom")}</span>
            </button>
          )}
          {list === "shared" && onJoinRoomLink && (
            <button
              type="button"
              className="btn-nav"
              style={{ padding: "3px 8px", fontSize: "11px", gap: "4px", flexShrink: 0 }}
              title={t("plan.joinTitle")}
              onClick={() => {
                close();
                onJoinRoomLink();
              }}
            >
              <Link2 size={12} aria-hidden="true" />
              <span>{t("plan.joinByLink")}</span>
            </button>
          )}
        </div>

        {renderDropHint(list)}

        {list === "cloud" && isLoggedIn && !isCloudVerified && (
          <div style={noticeStyle}>
            <ShieldCheck size={14} style={{ color: "var(--jantt-accent)", flexShrink: 0 }} />
            <span style={{ flex: "1 1 160px" }}>{t("plan.verifyNotice")}</span>
            {onRequireVerification && (
              <button type="button" className="btn-nav" style={{ fontSize: "11px", padding: "3px 8px" }} onClick={onRequireVerification}>
                {t("plan.verify")}
              </button>
            )}
          </div>
        )}
        {list === "shared" && !isLoggedIn && items.length > 0 && (
          <div style={noticeStyle}>
            <span style={{ flex: "1 1 160px" }}>{t("plan.savedInBrowserNotice")}</span>
          </div>
        )}

        <div className="plan-board-column-body">{items.length > 0 ? items.map(renderCard) : renderEmptyState(list)}</div>
      </section>
    );
  };

  const menuItem = menu ? itemsById.get(menu.itemId) : undefined;
  const visibleLists = isNarrow ? [narrowList] : PLAN_LIST_ORDER;

  const headerActions = (
    <>
      {userProfile?.username ? (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "3px 6px 3px 10px",
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "20px",
            fontSize: "12px",
            fontWeight: 600
          }}
        >
          <span>@{userProfile.username}</span>
          {onSignOut && (
            <button
              type="button"
              className="prompt-modal-close-btn"
              style={{ padding: "3px" }}
              onClick={() => void onSignOut()}
              aria-label={t("plan.signOut")}
              title={t("plan.signOut")}
            >
              <LogOut size={12} />
            </button>
          )}
        </div>
      ) : !isLoggedIn && onLogin ? (
        <button
          type="button"
          className="btn-nav"
          style={{ padding: "6px 11px", fontSize: "12px", gap: "6px" }}
          onClick={onLogin}
          disabled={isSigningIn}
          aria-busy={isSigningIn || undefined}
        >
          {isSigningIn ? <Loader2 size={13} className="spin-sync-icon" aria-hidden="true" /> : <Github size={13} />}
          <span>{isSigningIn ? t("plan.signingIn") : t("plan.signIn")}</span>
        </button>
      ) : null}
      <button
        type="button"
        className="btn-nav"
        style={{ padding: "6px 11px", fontSize: "12px", gap: "6px" }}
        onClick={onImportFile}
        title={t("plan.importTitle")}
      >
        <Upload size={13} />
        <span>{t("plan.import")}</span>
      </button>
      <button
        type="button"
        className="btn-nav btn-nav-primary"
        style={{ padding: "6px 12px", fontSize: "12px", gap: "6px" }}
        onClick={() => {
          close();
          onOpenAddPlanModal();
        }}
      >
        <Plus size={14} />
        <span>{t("plan.new")}</span>
      </button>
    </>
  );

  const confirmDetails = confirm ? describeConfirm(confirm, t) : null;

  return (
    <>
      <Modal onClose={close} maxWidth={1180} tall>
        <ModalHeader
          icon={<Layers size={18} />}
          title={t("plan.title")}
          subtitle={
            isNarrow
              ? undefined
              : t("plan.subtitle")
          }
          actions={headerActions}
        />

        <div
          className="plan-manager-tools"
          style={{
            padding: "10px 20px",
            borderBottom: "1px solid var(--jantt-border-subtle, rgba(255, 255, 255, 0.06))",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
            flexShrink: 0
          }}
        >
          <div className="plan-manager-filter" style={{ position: "relative", flex: "1 1 240px", maxWidth: isNarrow ? undefined : "380px" }}>
            <Search
              size={14}
              aria-hidden="true"
              style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--jantt-text-muted)" }}
            />
            <input
              ref={filterRef}
              type="search"
              enterKeyHint="search"
              className="select-input"
              aria-label={t("plan.filterAria")}
              style={{ width: "100%", paddingLeft: "32px", paddingRight: "10px", fontSize: "12px", height: "32px", boxSizing: "border-box" }}
              placeholder={t("plan.filterPlaceholder")}
              value={searchQuery}
              // Start in the filter on desktop; on phones a focused input would pop up the keyboard.
              data-autofocus={isNarrow ? undefined : true}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && isNarrow) {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === "Escape" && searchQuery) {
                  event.preventDefault();
                  setSearchQuery("");
                }
              }}
            />
            {searchQuery && (
              <button
                type="button"
                className="plan-filter-clear"
                aria-label={t("plan.clearFilter")}
                onClick={() => { setSearchQuery(""); filterRef.current?.focus(); }}
              >
                <X size={15} />
              </button>
            )}
          </div>

          {isNarrow && (
            <div
              className="plan-scope-tabs"
              role="tablist"
              aria-label={t("plan.listsAria")}
              style={{ display: "flex", gap: "6px", flex: "1 1 100%", overflowX: "auto" }}
              onKeyDown={(event) => {
                if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const step = event.key === "ArrowRight" ? 1 : -1;
                const index = PLAN_LIST_ORDER.indexOf(narrowList);
                const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? PLAN_LIST_ORDER.length - 1 : (index + step + PLAN_LIST_ORDER.length) % PLAN_LIST_ORDER.length;
                const next = PLAN_LIST_ORDER[nextIndex];
                setNarrowList(next);
                document.getElementById(`plan-list-tab-${next}`)?.focus();
              }}
            >
              {PLAN_LIST_ORDER.map((list) => {
                const selected = narrowList === list;
                return (
                  <button
                    key={list}
                    id={`plan-list-tab-${list}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-label={t("plan.tabAria", { list: t(LIST_META[list].titleKey), count: filtered[list].length })}
                    aria-controls={selected ? `plan-list-panel-${list}` : undefined}
                    tabIndex={selected ? 0 : -1}
                    data-autofocus={selected ? true : undefined}
                    className={`btn-nav ${selected ? "btn-nav-primary" : ""}`}
                    style={{
                      flex: "1 0 auto",
                      justifyContent: "center",
                      fontSize: "12px",
                      padding: "5px 10px",
                      gap: "6px",
                      outline: dragOverList === list ? "2px dashed var(--jantt-accent, #38BDF8)" : undefined
                    }}
                    onClick={() => setNarrowList(list)}
                    {...dropTargetProps(list)}
                  >
                    {list === "device" ? t("plan.tab.device") : list === "cloud" ? t("plan.tab.cloud") : t("plan.tab.shared")}
                    <span className="plan-tab-count">{filtered[list].length}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className={`plan-board-container ${dragging ? "is-dragging-card" : ""}`}>{visibleLists.map(renderColumn)}</div>

        {menu && menuItem && (
          <div
            ref={menuRef}
            role="menu"
            aria-label={
              menu.kind === "transfer"
                ? t("plan.menu.transferAria", { name: menuItem.name })
                : t("plan.menu.actionsAria", { name: menuItem.name })
            }
            className="card-floating-actions-menu plan-manager-menu"
            onKeyDown={handleMenuKeyDown}
            style={{
              position: "absolute",
              top: menuPosition?.top ?? 0,
              left: menuPosition?.left ?? 0,
              maxHeight: menuPosition?.maxHeight,
              opacity: menuPosition ? 1 : 0,
              overflowY: "auto",
              zIndex: 5,
              minWidth: "220px",
              maxWidth: "min(340px, calc(100% - 16px))",
              background: "var(--jantt-surface-solid)",
              border: "1px solid var(--jantt-border, rgba(255, 255, 255, 0.12))",
              borderRadius: "8px",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)",
              padding: "5px",
              display: "flex",
              flexDirection: "column",
              gap: "2px"
            }}
          >
            {(menu.kind === "transfer" ? getTransferGroups(menuItem) : getActionGroups(menuItem)).map((group, groupIndex) => (
              <React.Fragment key={group.label ?? groupIndex}>
                {groupIndex > 0 && (
                  <div role="separator" style={{ height: "1px", background: "var(--jantt-border-subtle, rgba(255, 255, 255, 0.08))", margin: "3px 4px" }} />
                )}
                <div role="group" aria-label={group.label} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {group.label && (
                    <div
                      aria-hidden="true"
                      style={{ padding: "4px 10px 2px", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--jantt-text-muted)" }}
                    >
                      {group.label}
                    </div>
                  )}
                  {group.entries.map((entry) => (
                    <button
                      key={entry.key}
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      aria-disabled={entry.disabled || undefined}
                      className={`card-menu-item ${entry.tone === "danger" ? "is-danger" : ""}`}
                      style={{
                        alignItems: entry.description ? "flex-start" : undefined,
                        ...(entry.disabled ? { opacity: 0.6, cursor: "not-allowed" } : null)
                      }}
                      onClick={() => {
                        if (entry.disabled) return;
                        closeMenu(true);
                        entry.onSelect();
                      }}
                    >
                      {entry.icon}
                      <span style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 }}>
                        <span>{entry.label}</span>
                        {entry.description && (
                          <span style={{ fontSize: "10.5px", lineHeight: 1.35, color: "var(--jantt-text-muted)", whiteSpace: "normal" }}>
                            {entry.description}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </Modal>

      {confirm && confirmDetails && (
        <ConfirmDialog {...confirmDetails} onCancel={() => setConfirm(null)} onConfirm={() => executeConfirmed(confirm)} />
      )}
    </>
  );
};
