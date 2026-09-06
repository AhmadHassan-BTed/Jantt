import React, { useState, useRef } from "react";
import {
  Layers,
  X,
  Search,
  HardDrive,
  Cloud,
  Users,
  Crown,
  Plus,
  Copy,
  Check,
  Share2,
  Upload,
  Sparkles,
  GripVertical,
  LogOut,
  CloudUpload
} from "lucide-react";
import type { SavedProject } from "../../types";
import type { UserRoomPointer, UserProfile } from "../../firebase";
import { DEFAULT_TEMPLATE } from "../../constants";
import { formatRelativeTime } from "../../utils";
import { downloadCsv, type JanttData } from "@jantt/core";

export interface PlanManagerModalProps {
  show: boolean;
  setShow: (show: boolean) => void;
  activeProjectId: string;
  customProjects: SavedProject[];
  ownedRooms: UserRoomPointer[];
  sharedRooms: UserRoomPointer[];
  userProfile?: UserProfile | null;
  onSelectProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onDuplicateProject: (id: string) => void;
  onRenameProject: (id: string, newName: string) => void;
  onCreateLocalCopy: (title: string, data: JanttData) => void;
  onPublishToCloud: (title: string, data: JanttData) => Promise<string | null>;
  onDeleteCloudRoom?: (roomId: string) => Promise<void>;
  onLeaveCloudRoom?: (roomId: string) => Promise<void>;
  onOpenShareRoom?: (roomId: string) => void;
  onOpenAddPlanModal: () => void;
  onCreateNewRoom?: () => void;
  onSignOut?: () => Promise<void>;
  onImportJsonFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  showToast: (msg: string, isErr?: boolean) => void;
}

interface PlanCardItem {
  id: string;
  name: string;
  type: "template" | "local" | "owned_room" | "shared_room";
  taskCount: number;
  updatedAt: string;
  data?: JanttData;
  rawProject?: SavedProject;
  rawRoom?: UserRoomPointer;
  roomId?: string;
  role?: string;
  ownerUsername?: string;
  isActive: boolean;
}

export const PlanManagerModal: React.FC<PlanManagerModalProps> = ({
  show,
  setShow,
  activeProjectId,
  customProjects,
  ownedRooms = [],
  sharedRooms = [],
  userProfile,
  onSelectProject,
  onDeleteProject,
  onDuplicateProject,
  onRenameProject,
  onCreateLocalCopy,
  onPublishToCloud,
  onDeleteCloudRoom,
  onLeaveCloudRoom,
  onOpenShareRoom,
  onOpenAddPlanModal,
  onCreateNewRoom,
  onSignOut,
  onImportJsonFile,
  showToast
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isActionBusy, setIsActionBusy] = useState(false);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  // HTML5 Drag and Drop State
  const [draggedPlan, setDraggedPlan] = useState<PlanCardItem | null>(null);
  const [dragOverCol, setDragOverCol] = useState<"local" | "owned" | null>(null);

  if (!show) return null;

  // 1. Local Offline Projects (+ Default Template)
  const localProjects = customProjects.filter((p) => p.source !== "room");
  const defaultTemplateItem: PlanCardItem = {
    id: "default",
    name: DEFAULT_TEMPLATE.name,
    type: "template",
    taskCount: DEFAULT_TEMPLATE.data.tasks?.length || 0,
    updatedAt: "Built-in",
    data: DEFAULT_TEMPLATE.data,
    isActive: activeProjectId === "default"
  };

  const localItems: PlanCardItem[] = [
    defaultTemplateItem,
    ...localProjects.map((p) => ({
      id: p.id,
      name: p.name,
      type: "local" as const,
      taskCount: p.data?.tasks?.length || 0,
      updatedAt: p.updatedAt ? formatRelativeTime(p.updatedAt) : "Recently",
      data: p.data,
      rawProject: p,
      isActive: activeProjectId === p.id
    }))
  ];

  // 2. Owned Cloud Rooms
  const ownedItems: PlanCardItem[] = ownedRooms.map((r) => {
    const matchingProj = customProjects.find((p) => p.id === `room-${r.roomId}`);
    return {
      id: `room-${r.roomId}`,
      roomId: r.roomId,
      name: r.title,
      type: "owned_room" as const,
      role: "Owner",
      taskCount: matchingProj?.data?.tasks?.length || (r as any).taskCount || 0,
      updatedAt: r.updatedAt ? formatRelativeTime(r.updatedAt) : "Recently",
      data: matchingProj?.data,
      rawRoom: r,
      isActive: activeProjectId === `room-${r.roomId}`
    };
  });

  // 3. Shared With Me Rooms
  const sharedItems: PlanCardItem[] = sharedRooms.map((r) => {
    const matchingProj = customProjects.find((p) => p.id === `room-${r.roomId}`);
    return {
      id: `room-${r.roomId}`,
      roomId: r.roomId,
      name: r.title,
      type: "shared_room" as const,
      role: r.role === "editor" ? "Editor" : "Viewer",
      ownerUsername: r.ownerUsername,
      taskCount: matchingProj?.data?.tasks?.length || (r as any).taskCount || 0,
      updatedAt: r.updatedAt ? formatRelativeTime(r.updatedAt) : "Recently",
      data: matchingProj?.data,
      rawRoom: r,
      isActive: activeProjectId === `room-${r.roomId}`
    };
  });

  // Filter items by search query
  const matchesSearch = (item: PlanCardItem) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      (item.roomId && item.roomId.toLowerCase().includes(q)) ||
      (item.ownerUsername && item.ownerUsername.toLowerCase().includes(q))
    );
  };

  const filteredLocal = localItems.filter(matchesSearch);
  const filteredOwned = ownedItems.filter(matchesSearch);
  const filteredShared = sharedItems.filter(matchesSearch);

  // Action handlers
  const handleStartRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const handleCommitRename = (id: string) => {
    if (renameValue.trim() && renamingId === id) {
      onRenameProject(id, renameValue.trim());
    }
    setRenamingId(null);
  };

  const handleDownloadPlanJson = (title: string, data?: JanttData) => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]/gi, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Downloaded "${title}.json"`);
  };

  const handleDownloadPlanCsv = (title: string, data?: JanttData) => {
    if (!data) return;
    downloadCsv(data, `${title.toLowerCase().replace(/[^a-z0-9]/gi, "-")}.csv`);
    showToast(`Exported "${title}.csv"`);
  };

  const handlePublishLocalToCloud = async (title: string, data?: JanttData) => {
    if (!data) return;
    setIsActionBusy(true);
    try {
      showToast(`Publishing "${title}" to Cloud Room...`);
      const roomId = await onPublishToCloud(title, data);
      if (roomId) {
        showToast(`Published! Cloud Room #${roomId} ready.`);
      }
    } catch (err: any) {
      showToast(err.message || "Failed to publish room", true);
    } finally {
      setIsActionBusy(false);
    }
  };

  // Card Action Handler (from card action menu or select dropdown)
  const handleCardAction = async (action: string, item: PlanCardItem) => {
    switch (action) {
      case "open":
        onSelectProject(item.id);
        setShow(false);
        break;
      case "publish_cloud":
        if (item.data) await handlePublishLocalToCloud(item.name, item.data);
        break;
      case "copy_local":
        if (item.data) onCreateLocalCopy(item.name, item.data);
        break;
      case "rename":
        handleStartRename(item.id, item.name);
        break;
      case "duplicate":
        onDuplicateProject(item.id);
        break;
      case "export_json":
        handleDownloadPlanJson(item.name, item.data);
        break;
      case "export_csv":
        handleDownloadPlanCsv(item.name, item.data);
        break;
      case "share":
        if (item.roomId && onOpenShareRoom) onOpenShareRoom(item.roomId);
        break;
      case "delete_local":
        onDeleteProject(item.id);
        break;
      case "delete_room":
        if (item.roomId && onDeleteCloudRoom) {
          if (window.confirm(`Permanently delete cloud room "${item.name}"? Collaborators will lose access.`)) {
            await onDeleteCloudRoom(item.roomId);
          }
        }
        break;
      case "leave_room":
        if (item.roomId && onLeaveCloudRoom) {
          if (window.confirm(`Leave room "${item.name}"?`)) {
            await onLeaveCloudRoom(item.roomId);
          }
        }
        break;
      default:
        break;
    }
  };

  // Drag and Drop Handlers for Dropping on Columns
  const handleDropOnCloudColumn = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!draggedPlan) return;

    if (draggedPlan.type === "local" || draggedPlan.type === "template") {
      if (draggedPlan.data) {
        await handlePublishLocalToCloud(draggedPlan.name, draggedPlan.data);
      }
    }
  };

  const handleDropOnLocalColumn = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!draggedPlan) return;

    if (draggedPlan.type === "owned_room" || draggedPlan.type === "shared_room") {
      if (draggedPlan.data) {
        onCreateLocalCopy(draggedPlan.name, draggedPlan.data);
      } else {
        showToast("Switch to this room first to load full data before saving offline copy.", true);
      }
    }
  };

  // Helper renderer for a single Plan Card
  const renderPlanCard = (item: PlanCardItem) => {
    const isTemplate = item.type === "template";
    const isLocal = item.type === "local" || isTemplate;
    const isOwned = item.type === "owned_room";
    const isShared = item.type === "shared_room";
    const isBeingRenamed = renamingId === item.id;
    const isCurrentlyDragged = draggedPlan?.id === item.id;

    return (
      <div
        key={item.id}
        className={`plan-card ${item.isActive ? "is-active-plan" : ""} ${isCurrentlyDragged ? "is-dragging" : ""}`}
        draggable={!isTemplate && Boolean(item.data)}
        onDragStart={(e) => {
          setDraggedPlan(item);
          e.dataTransfer.setData("text/plain", item.id);
          e.dataTransfer.effectAllowed = "copyMove";
        }}
        onDragEnd={() => {
          setDraggedPlan(null);
          setDragOverCol(null);
        }}
      >
        {/* Top Row: Icon, Title, Active Badge */}
        <div className="plan-card-top-row">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
            <div
              style={{
                cursor: !isTemplate ? "grab" : "default",
                color: "var(--jantt-text-muted)",
                display: "flex",
                alignItems: "center"
              }}
              title={!isTemplate ? "Drag this card to move or copy across columns" : "Built-in Template"}
            >
              {!isTemplate ? <GripVertical size={14} /> : null}
            </div>

            {isTemplate ? (
              <Sparkles size={16} style={{ color: "var(--jantt-accent, #38BDF8)", flexShrink: 0 }} />
            ) : isLocal ? (
              <HardDrive size={16} style={{ color: "#38BDF8", flexShrink: 0 }} />
            ) : isOwned ? (
              <Crown size={16} style={{ color: "#F59E0B", flexShrink: 0 }} />
            ) : (
              <Users size={16} style={{ color: "#A855F7", flexShrink: 0 }} />
            )}

            {isBeingRenamed ? (
              <input
                type="text"
                autoFocus
                className="select-input"
                style={{
                  padding: "2px 6px",
                  fontSize: "13px",
                  fontWeight: 600,
                  flex: 1,
                  height: "26px"
                }}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => handleCommitRename(item.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCommitRename(item.id);
                  if (e.key === "Escape") setRenamingId(null);
                }}
              />
            ) : (
              <span
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

          {item.isActive && (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                padding: "2px 7px",
                borderRadius: "10px",
                background: "rgba(56, 189, 248, 0.2)",
                border: "1px solid rgba(56, 189, 248, 0.4)",
                color: "var(--jantt-accent, #38BDF8)",
                flexShrink: 0
              }}
            >
              Active
            </span>
          )}
        </div>

        {/* Metadata Row: Task count, updated time, role */}
        <div className="plan-card-meta-row">
          <span>{item.taskCount} tasks</span>
          <span>•</span>
          <span>{item.updatedAt}</span>
          {item.roomId && (
            <>
              <span>•</span>
              <span
                style={{
                  padding: "1px 5px",
                  borderRadius: "4px",
                  background: "rgba(255, 255, 255, 0.05)",
                  fontFamily: "monospace",
                  fontSize: "10.5px"
                }}
              >
                #{item.roomId}
              </span>
            </>
          )}
          {item.role && (
            <span
              style={{
                marginLeft: "auto",
                padding: "1px 6px",
                borderRadius: "4px",
                fontSize: "10px",
                fontWeight: 600,
                textTransform: "uppercase",
                background: isOwned
                  ? "rgba(245, 158, 11, 0.15)"
                  : "rgba(168, 85, 247, 0.15)",
                color: isOwned ? "#F59E0B" : "#C084FC"
              }}
            >
              {item.role}
            </span>
          )}
          {item.ownerUsername && (
            <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
              by @{item.ownerUsername}
            </span>
          )}
        </div>

        {/* Action Bar: Open Plan + Card Action Dropdown + Quick Buttons */}
        <div className="plan-card-action-bar">
          {/* Primary Open Button */}
          {item.isActive ? (
            <button
              type="button"
              disabled
              className="btn-nav"
              style={{
                padding: "4px 9px",
                fontSize: "11.5px",
                gap: "5px",
                opacity: 0.8,
                cursor: "default"
              }}
            >
              <Check size={12} style={{ color: "var(--jantt-accent, #38BDF8)" }} />
              <span>Current</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn-nav btn-nav-primary"
              style={{ padding: "4px 10px", fontSize: "11.5px" }}
              onClick={() => {
                onSelectProject(item.id);
                setShow(false);
              }}
              title="Open and edit this plan"
            >
              Open Plan
            </button>
          )}

          {/* Quick Action Buttons */}
          {isLocal && !isTemplate && (
            <button
              type="button"
              className="btn-nav"
              style={{ padding: "4px 7px", fontSize: "11px" }}
              onClick={() => handlePublishLocalToCloud(item.name, item.data)}
              disabled={isActionBusy}
              title="Publish to a new Cloud Room"
            >
              <CloudUpload size={12} style={{ color: "#38BDF8" }} />
            </button>
          )}

          {!isLocal && (
            <button
              type="button"
              className="btn-nav"
              style={{ padding: "4px 7px", fontSize: "11px" }}
              onClick={() => {
                if (item.data) onCreateLocalCopy(item.name, item.data);
                else showToast("Open room to load data first", true);
              }}
              title="Save an offline local copy"
            >
              <Copy size={12} style={{ color: "#10B981" }} />
            </button>
          )}

          {item.roomId && onOpenShareRoom && (
            <button
              type="button"
              className="btn-nav"
              style={{ padding: "4px 7px", fontSize: "11px" }}
              onClick={() => onOpenShareRoom(item.roomId!)}
              title="Invite collaborators to room"
            >
              <Share2 size={12} style={{ color: "#A855F7" }} />
            </button>
          )}

          {/* Action Select Dropdown (User Requirement #2: "select from the dropdown or drag & drop") */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px" }}>
            <select
              className="select-input"
              style={{
                padding: "3px 8px",
                fontSize: "11px",
                height: "26px",
                background: "rgba(255, 255, 255, 0.05)",
                borderRadius: "6px",
                cursor: "pointer"
              }}
              value=""
              onChange={(e) => {
                const act = e.target.value;
                if (act) handleCardAction(act, item);
                e.target.value = "";
              }}
              title="Select action for this plan"
            >
              <option value="" disabled>
                Actions ▾
              </option>
              <option value="open">Open Plan</option>
              {isLocal && <option value="publish_cloud">🚀 Publish to Cloud Room</option>}
              {!isLocal && <option value="copy_local">💾 Save Offline Local Copy</option>}
              {!isTemplate && (isLocal || isOwned) && <option value="rename">✏️ Rename Plan</option>}
              {isLocal && !isTemplate && <option value="duplicate">📑 Duplicate Plan</option>}
              <option value="export_json">📥 Export JSON</option>
              <option value="export_csv">📊 Export CSV</option>
              {item.roomId && <option value="share">🔗 Invite & Share</option>}
              {isLocal && !isTemplate && <option value="delete_local">🗑️ Delete Plan</option>}
              {isOwned && <option value="delete_room">🗑️ Delete Cloud Room</option>}
              {isShared && <option value="leave_room">🚪 Leave Room</option>}
            </select>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="prompt-modal-backdrop" onClick={() => setShow(false)}>
      <div
        className="prompt-modal-card"
        style={{
          maxWidth: "1180px",
          width: "96vw",
          height: "88vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "14px",
          overflow: "hidden"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          className="prompt-modal-header"
          style={{
            padding: "16px 22px",
            borderBottom: "1px solid var(--jantt-border, rgba(255, 255, 255, 0.08))",
            flexShrink: 0
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "var(--jantt-accent-glow, rgba(56, 189, 248, 0.15))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--jantt-accent, #38BDF8)"
              }}
            >
              <Layers size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "var(--jantt-text, #F8FAFC)" }}>
                Plan &amp; Project Manager
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--jantt-text-muted, #94A3B8)" }}>
                Drag and drop between columns to publish or save copies, or choose actions from each card dropdown.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* User Profile / Status Indicator */}
            {userProfile?.username ? (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "4px 10px",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "20px",
                  fontSize: "12px"
                }}
              >
                <div
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    background: "var(--jantt-accent, #38BDF8)",
                    color: "#0F172A",
                    fontSize: "10px",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {userProfile.username[0].toUpperCase()}
                </div>
                <span style={{ fontWeight: 600 }}>@{userProfile.username}</span>
                {onSignOut && (
                  <button
                    type="button"
                    onClick={onSignOut}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--jantt-text-muted)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "11px",
                      padding: "2px 4px"
                    }}
                    title="Sign Out"
                  >
                    <LogOut size={12} />
                  </button>
                )}
              </div>
            ) : (
              <span
                style={{
                  fontSize: "11.5px",
                  color: "var(--jantt-text-muted)",
                  padding: "4px 8px",
                  background: "rgba(255, 255, 255, 0.04)",
                  borderRadius: "6px"
                }}
              >
                Local Mode
              </span>
            )}

            {/* Quick Import JSON Button */}
            <input
              type="file"
              ref={modalFileInputRef}
              accept=".json"
              style={{ display: "none" }}
              onChange={onImportJsonFile}
            />
            <button
              type="button"
              className="btn-nav"
              style={{ padding: "6px 11px", fontSize: "12px", gap: "6px" }}
              onClick={() => modalFileInputRef.current?.click()}
              title="Import local JSON file"
            >
              <Upload size={13} />
              <span>Import JSON</span>
            </button>

            {/* Quick New Plan Button */}
            <button
              type="button"
              className="btn-nav btn-nav-primary"
              style={{ padding: "6px 12px", fontSize: "12px", gap: "6px" }}
              onClick={() => {
                setShow(false);
                onOpenAddPlanModal();
              }}
              title="Create a new plan"
            >
              <Plus size={14} />
              <span>New Plan</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              className="prompt-modal-close-btn"
              onClick={() => setShow(false)}
              title="Close"
              style={{ marginLeft: "4px" }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search Bar Strip */}
        <div
          style={{
            padding: "10px 22px",
            background: "rgba(255, 255, 255, 0.015)",
            borderBottom: "1px solid var(--jantt-border-subtle, rgba(255, 255, 255, 0.06))",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexShrink: 0
          }}
        >
          <div style={{ position: "relative", flex: 1, maxWidth: "420px" }}>
            <Search
              size={14}
              style={{
                position: "absolute",
                left: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--jantt-text-muted)"
              }}
            />
            <input
              type="text"
              className="select-input"
              style={{
                width: "100%",
                paddingLeft: "32px",
                paddingRight: "10px",
                fontSize: "12px",
                height: "32px"
              }}
              placeholder="Filter plans by name, room ID, or teammate..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <span style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)" }}>
            Tip: Drag a local card onto Cloud Rooms to publish, or drag a cloud room to Local to save an offline copy.
          </span>
        </div>

        {/* 3-List Board Container */}
        <div className="plan-board-container">
          {/* ========================================================= */}
          {/* Column 1: Local Offline Plans                             */}
          {/* ========================================================= */}
          <div
            className={`plan-board-column ${dragOverCol === "local" ? "is-drag-over-emerald" : ""}`}
            onDragOver={(e) => {
              if (draggedPlan && (draggedPlan.type === "owned_room" || draggedPlan.type === "shared_room")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                if (dragOverCol !== "local") setDragOverCol("local");
              }
            }}
            onDragLeave={() => {
              setDragOverCol(null);
            }}
            onDrop={handleDropOnLocalColumn}
          >
            {/* Column Header */}
            <div className="plan-board-column-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <HardDrive size={16} style={{ color: "#38BDF8" }} />
                <span style={{ fontWeight: 700, fontSize: "13.5px", color: "var(--jantt-text)" }}>
                  Local Offline
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    padding: "1px 6px",
                    borderRadius: "10px",
                    background: "rgba(56, 189, 248, 0.15)",
                    color: "#38BDF8",
                    fontWeight: 600
                  }}
                >
                  {localItems.length}
                </span>
              </div>

              <button
                type="button"
                className="btn-nav"
                style={{ padding: "3px 8px", fontSize: "11px", gap: "4px" }}
                onClick={() => {
                  setShow(false);
                  onOpenAddPlanModal();
                }}
                title="Create a new local offline plan"
              >
                <Plus size={12} />
                <span>Plan</span>
              </button>
            </div>

            {/* Column Drop Helper / Body */}
            <div className="plan-board-column-body">
              {dragOverCol === "local" && (
                <div
                  style={{
                    padding: "14px",
                    border: "2px dashed #10B981",
                    borderRadius: "8px",
                    background: "rgba(16, 185, 129, 0.1)",
                    color: "#10B981",
                    textAlign: "center",
                    fontWeight: 600,
                    fontSize: "12.5px"
                  }}
                >
                  Drop here to save an Offline Local Copy!
                </div>
              )}

              {filteredLocal.map(renderPlanCard)}

              {filteredLocal.length === 0 && (
                <div className="plan-board-empty-zone">
                  <HardDrive size={22} style={{ opacity: 0.5 }} />
                  <span>No matching local plans found.</span>
                </div>
              )}
            </div>
          </div>

          {/* ========================================================= */}
          {/* Column 2: My Cloud Rooms                                  */}
          {/* ========================================================= */}
          <div
            className={`plan-board-column ${dragOverCol === "owned" ? "is-drag-over" : ""}`}
            onDragOver={(e) => {
              if (draggedPlan && (draggedPlan.type === "local" || draggedPlan.type === "template")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                if (dragOverCol !== "owned") setDragOverCol("owned");
              }
            }}
            onDragLeave={() => {
              setDragOverCol(null);
            }}
            onDrop={handleDropOnCloudColumn}
          >
            {/* Column Header */}
            <div className="plan-board-column-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Crown size={16} style={{ color: "#F59E0B" }} />
                <span style={{ fontWeight: 700, fontSize: "13.5px", color: "var(--jantt-text)" }}>
                  My Cloud Rooms
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    padding: "1px 6px",
                    borderRadius: "10px",
                    background: "rgba(245, 158, 11, 0.15)",
                    color: "#F59E0B",
                    fontWeight: 600
                  }}
                >
                  {ownedItems.length}
                </span>
              </div>

              {onCreateNewRoom && (
                <button
                  type="button"
                  className="btn-nav"
                  style={{ padding: "3px 8px", fontSize: "11px", gap: "4px" }}
                  onClick={() => {
                    setShow(false);
                    onCreateNewRoom();
                  }}
                  title="Create or host a new cloud room"
                >
                  <Plus size={12} />
                  <span>Room</span>
                </button>
              )}
            </div>

            {/* Column Drop Helper / Body */}
            <div className="plan-board-column-body">
              {dragOverCol === "owned" && (
                <div
                  style={{
                    padding: "14px",
                    border: "2px dashed #38BDF8",
                    borderRadius: "8px",
                    background: "rgba(56, 189, 248, 0.1)",
                    color: "#38BDF8",
                    textAlign: "center",
                    fontWeight: 600,
                    fontSize: "12.5px"
                  }}
                >
                  Drop here to Publish to a new Cloud Room!
                </div>
              )}

              {filteredOwned.map(renderPlanCard)}

              {filteredOwned.length === 0 && (
                <div className="plan-board-empty-zone">
                  <Cloud size={24} style={{ opacity: 0.5 }} />
                  <span style={{ fontWeight: 500 }}>No owned cloud rooms yet.</span>
                  <span style={{ fontSize: "11px", maxWidth: "220px", lineHeight: "1.4" }}>
                    Drag any local plan here to publish it to the cloud, or click + Room above.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ========================================================= */}
          {/* Column 3: Shared With Me                                  */}
          {/* ========================================================= */}
          <div className="plan-board-column">
            {/* Column Header */}
            <div className="plan-board-column-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Users size={16} style={{ color: "#A855F7" }} />
                <span style={{ fontWeight: 700, fontSize: "13.5px", color: "var(--jantt-text)" }}>
                  Shared With Me
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    padding: "1px 6px",
                    borderRadius: "10px",
                    background: "rgba(168, 85, 247, 0.15)",
                    color: "#C084FC",
                    fontWeight: 600
                  }}
                >
                  {sharedItems.length}
                </span>
              </div>
            </div>

            {/* Column Body */}
            <div className="plan-board-column-body">
              {filteredShared.map(renderPlanCard)}

              {filteredShared.length === 0 && (
                <div className="plan-board-empty-zone">
                  <Users size={24} style={{ opacity: 0.5 }} />
                  <span style={{ fontWeight: 500 }}>No shared rooms yet.</span>
                  <span style={{ fontSize: "11px", maxWidth: "220px", lineHeight: "1.4" }}>
                    When teammates invite you to their rooms, they will appear here automatically.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          className="prompt-modal-footer"
          style={{
            padding: "12px 22px",
            justifyContent: "space-between",
            borderTop: "1px solid var(--jantt-border-subtle, rgba(255, 255, 255, 0.06))",
            flexShrink: 0
          }}
        >
          <div style={{ fontSize: "11.5px", color: "var(--jantt-text-muted)" }}>
            Total Plans: <strong>{localItems.length + ownedItems.length + sharedItems.length}</strong> • Local:{" "}
            <strong>{localItems.length}</strong> • Owned Rooms: <strong>{ownedItems.length}</strong> • Shared:{" "}
            <strong>{sharedItems.length}</strong>
          </div>
          <button type="button" className="btn-nav" onClick={() => setShow(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
