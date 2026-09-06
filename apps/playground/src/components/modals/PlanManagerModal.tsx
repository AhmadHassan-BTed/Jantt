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
  FileSpreadsheet,
  Trash2,
  Edit2,
  Check,
  Share2,
  Upload,
  ArrowRight,
  FileJson,
  UserMinus,
  Sparkles
} from "lucide-react";
import type { SavedProject } from "../../types";
import type { UserRoomPointer, UserProfile } from "../../firebase";
import { DEFAULT_TEMPLATE } from "../../constants";
import { formatRelativeTime } from "../../utils";
import { downloadCsv, type JanttData } from "@jantt/core";

export type PlanFilterTab = "all" | "local" | "owned" | "shared";

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
  onImportJsonFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  showToast: (msg: string, isErr?: boolean) => void;
}

export const PlanManagerModal: React.FC<PlanManagerModalProps> = ({
  show,
  setShow,
  activeProjectId,
  customProjects,
  ownedRooms = [],
  sharedRooms = [],
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
  onImportJsonFile,
  showToast
}) => {
  const [activeTab, setActiveTab] = useState<PlanFilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isActionBusy, setIsActionBusy] = useState(false);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  if (!show) return null;

  // Compile unified plans list
  const localProjects = customProjects.filter((p) => p.source !== "room");

  // Format default template item
  const defaultTemplateItem = {
    id: "default",
    name: DEFAULT_TEMPLATE.name,
    type: "template" as const,
    taskCount: DEFAULT_TEMPLATE.data.tasks?.length || 0,
    updatedAt: "Built-in",
    data: DEFAULT_TEMPLATE.data,
    isActive: activeProjectId === "default"
  };

  // Build unified items
  const allItems = [
    // Default Template
    defaultTemplateItem,
    // Local Plans
    ...localProjects.map((p) => ({
      id: p.id,
      name: p.name,
      type: "local" as const,
      taskCount: p.data?.tasks?.length || 0,
      updatedAt: p.updatedAt ? formatRelativeTime(p.updatedAt) : "Recently",
      data: p.data,
      rawProject: p,
      isActive: activeProjectId === p.id
    })),
    // Owned Cloud Rooms
    ...ownedRooms.map((r) => {
      const matchingProj = customProjects.find((p) => p.id === `room-${r.roomId}`);
      return {
        id: `room-${r.roomId}`,
        roomId: r.roomId,
        name: r.title,
        type: "owned_room" as const,
        role: "owner" as const,
        taskCount: matchingProj?.data?.tasks?.length || (r as any).taskCount || 0,
        updatedAt: r.updatedAt ? formatRelativeTime(r.updatedAt) : "Recently",
        data: matchingProj?.data,
        rawRoom: r,
        isActive: activeProjectId === `room-${r.roomId}`
      };
    }),
    // Shared Cloud Rooms
    ...sharedRooms.map((r) => {
      const matchingProj = customProjects.find((p) => p.id === `room-${r.roomId}`);
      return {
        id: `room-${r.roomId}`,
        roomId: r.roomId,
        name: r.title,
        type: "shared_room" as const,
        role: r.role || "viewer",
        ownerUsername: r.ownerUsername,
        taskCount: matchingProj?.data?.tasks?.length || (r as any).taskCount || 0,
        updatedAt: r.updatedAt ? formatRelativeTime(r.updatedAt) : "Recently",
        data: matchingProj?.data,
        rawRoom: r,
        isActive: activeProjectId === `room-${r.roomId}`
      };
    })
  ];

  // Tab counts
  const countAll = allItems.length;
  const countLocal = localProjects.length + 1; // including default template
  const countOwned = ownedRooms.length;
  const countShared = sharedRooms.length;

  // Filter items by tab and search
  const filteredItems = allItems.filter((item) => {
    if (activeTab === "local") {
      if (item.type !== "local" && item.type !== "template") return false;
    } else if (activeTab === "owned") {
      if (item.type !== "owned_room") return false;
    } else if (activeTab === "shared") {
      if (item.type !== "shared_room") return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchRoom = (item as any).roomId?.toLowerCase().includes(q);
      return matchName || matchRoom;
    }

    return true;
  });

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

  const handlePublishClick = async (title: string, data?: JanttData) => {
    if (!data) return;
    setIsActionBusy(true);
    try {
      const roomId = await onPublishToCloud(title, data);
      if (roomId) {
        setShow(false);
      }
    } finally {
      setIsActionBusy(false);
    }
  };

  return (
    <div className="prompt-modal-backdrop" onClick={() => setShow(false)}>
      <div
        className="prompt-modal-card"
        style={{
          maxWidth: "840px",
          width: "95%",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="prompt-modal-header" style={{ padding: "16px 22px" }}>
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
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "var(--jantt-text)" }}>
                Plan &amp; Project Manager
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--jantt-text-muted)" }}>
                Manage, publish, duplicate, copy, and export all local offline plans &amp; cloud collaboration rooms
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Quick Import JSON Button */}
            <input
              type="file"
              ref={modalFileInputRef}
              accept=".json"
              style={{ display: "none" }}
              onChange={onImportJsonFile}
            />
            <button
              className="btn-nav"
              style={{ padding: "6px 10px", fontSize: "12px", gap: "6px" }}
              onClick={() => modalFileInputRef.current?.click()}
              title="Import Jantt JSON file"
            >
              <Upload size={13} />
              <span>Import JSON</span>
            </button>

            {/* Quick New Plan Button */}
            <button
              className="btn-nav btn-nav-primary"
              style={{ padding: "6px 12px", fontSize: "12px", gap: "6px" }}
              onClick={() => {
                setShow(false);
                onOpenAddPlanModal();
              }}
              title="Create a new local plan or cloud room"
            >
              <Plus size={14} />
              <span>New Plan</span>
            </button>

            <button
              className="prompt-modal-close-btn"
              onClick={() => setShow(false)}
              title="Close"
              style={{ marginLeft: "4px" }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Toolbar: Search + Filter Tabs */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 22px",
            borderBottom: "1px solid var(--jantt-border)",
            background: "rgba(15, 23, 42, 0.4)"
          }}
        >
          {/* Tabs */}
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              className={`btn-nav ${activeTab === "all" ? "btn-nav-primary" : ""}`}
              style={{ padding: "5px 12px", fontSize: "12px" }}
              onClick={() => setActiveTab("all")}
            >
              All Plans ({countAll})
            </button>
            <button
              className={`btn-nav ${activeTab === "local" ? "btn-nav-primary" : ""}`}
              style={{ padding: "5px 12px", fontSize: "12px" }}
              onClick={() => setActiveTab("local")}
            >
              <HardDrive size={13} />
              <span>Local Offline ({countLocal})</span>
            </button>
            <button
              className={`btn-nav ${activeTab === "owned" ? "btn-nav-primary" : ""}`}
              style={{ padding: "5px 12px", fontSize: "12px" }}
              onClick={() => setActiveTab("owned")}
            >
              <Crown size={13} />
              <span>My Cloud Rooms ({countOwned})</span>
            </button>
            <button
              className={`btn-nav ${activeTab === "shared" ? "btn-nav-primary" : ""}`}
              style={{ padding: "5px 12px", fontSize: "12px" }}
              onClick={() => setActiveTab("shared")}
            >
              <Users size={13} />
              <span>Shared Rooms ({countShared})</span>
            </button>
          </div>

          {/* Search Input */}
          <div
            style={{
              position: "relative",
              width: "240px"
            }}
          >
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
              placeholder="Search plans or room IDs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 10px 6px 30px",
                fontSize: "12px",
                borderRadius: "6px",
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid var(--jantt-border)",
                color: "var(--jantt-text)",
                boxSizing: "border-box"
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "var(--jantt-text-muted)",
                  cursor: "pointer",
                  padding: 0
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Plans List Container */}
        <div
          className="prompt-modal-body"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 22px",
            display: "flex",
            flexDirection: "column",
            gap: "10px"
          }}
        >
          {filteredItems.length === 0 ? (
            <div
              style={{
                padding: "48px 20px",
                textAlign: "center",
                color: "var(--jantt-text-muted)",
                background: "rgba(15, 23, 42, 0.3)",
                borderRadius: "10px",
                border: "1px dashed var(--jantt-border)"
              }}
            >
              <Layers size={36} style={{ marginBottom: "12px", opacity: 0.5 }} />
              <h4 style={{ margin: "0 0 6px 0", color: "var(--jantt-text)" }}>No plans found</h4>
              <p style={{ margin: 0, fontSize: "12px" }}>
                {searchQuery
                  ? `No plans match "${searchQuery}". Try a different search term.`
                  : "You don't have any plans in this category yet."}
              </p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isRenaming = renamingId === item.id;
              const isDefault = item.type === "template";
              const isLocal = item.type === "local";
              const isOwnedRoom = item.type === "owned_room";
              const isSharedRoom = item.type === "shared_room";
              const isRoom = isOwnedRoom || isSharedRoom;

              return (
                <div
                  key={item.id}
                  style={{
                    padding: "14px 16px",
                    borderRadius: "10px",
                    border: item.isActive
                      ? "2px solid var(--jantt-accent, #38BDF8)"
                      : "1px solid var(--jantt-border)",
                    background: item.isActive
                      ? "var(--jantt-surface-hover, rgba(56, 189, 248, 0.06))"
                      : "var(--jantt-surface, rgba(15, 23, 42, 0.5))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "16px",
                    transition: "all 0.15s ease"
                  }}
                >
                  {/* Left: Plan Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      {/* Active Indicator */}
                      {item.isActive && (
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "var(--jantt-accent, #38BDF8)",
                            color: "var(--jantt-accent-contrast, #000000)",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px"
                          }}
                        >
                          <Sparkles size={10} /> Active
                        </span>
                      )}

                      {/* Type Badge */}
                      {isDefault && (
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "rgba(100, 116, 139, 0.2)",
                            color: "#94A3B8"
                          }}
                        >
                          System Template
                        </span>
                      )}
                      {isLocal && (
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "rgba(100, 116, 139, 0.2)",
                            color: "var(--jantt-text-muted)",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px"
                          }}
                        >
                          <HardDrive size={10} /> Local Offline
                        </span>
                      )}
                      {isOwnedRoom && (
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "rgba(56, 189, 248, 0.2)",
                            color: "var(--jantt-accent, #38BDF8)",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px"
                          }}
                        >
                          <Crown size={10} /> Cloud Room (Owner)
                        </span>
                      )}
                      {isSharedRoom && (
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "rgba(167, 139, 250, 0.2)",
                            color: "#A78BFA",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px"
                          }}
                        >
                          <Users size={10} /> Shared (@{(item as any).ownerUsername} •{" "}
                          {(item as any).role === "editor" ? "Editor" : "Viewer"})
                        </span>
                      )}

                      {/* Room ID pill if cloud room */}
                      {(item as any).roomId && (
                        <code
                          style={{
                            fontSize: "10px",
                            padding: "1px 5px",
                            borderRadius: "4px",
                            background: "rgba(15, 23, 42, 0.8)",
                            color: "var(--jantt-accent, #38BDF8)",
                            border: "1px solid var(--jantt-border)"
                          }}
                        >
                          {(item as any).roomId}
                        </code>
                      )}
                    </div>

                    {/* Title or Rename Input */}
                    {isRenaming ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", margin: "4px 0" }}>
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCommitRename(item.id);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          autoFocus
                          style={{
                            padding: "4px 8px",
                            fontSize: "13px",
                            borderRadius: "6px",
                            background: "rgba(15, 23, 42, 0.9)",
                            border: "1px solid var(--jantt-accent)",
                            color: "var(--jantt-text)"
                          }}
                        />
                        <button
                          className="btn-nav btn-nav-primary"
                          style={{ padding: "4px 8px", fontSize: "11px" }}
                          onClick={() => handleCommitRename(item.id)}
                        >
                          <Check size={12} />
                        </button>
                        <button
                          className="btn-nav"
                          style={{ padding: "4px 8px", fontSize: "11px" }}
                          onClick={() => setRenamingId(null)}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <h4
                        style={{
                          margin: "2px 0 4px 0",
                          fontSize: "14px",
                          fontWeight: 700,
                          color: "var(--jantt-text)",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px"
                        }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.name}
                        </span>
                        {isLocal && (
                          <button
                            onClick={() => handleStartRename(item.id, item.name)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--jantt-text-muted)",
                              cursor: "pointer",
                              padding: "2px"
                            }}
                            title="Rename local plan"
                          >
                            <Edit2 size={12} />
                          </button>
                        )}
                      </h4>
                    )}

                    {/* Metadata Subtitle */}
                    <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)", display: "flex", gap: "12px" }}>
                      <span>{item.taskCount} tasks</span>
                      <span>•</span>
                      <span>Modified: {item.updatedAt}</span>
                    </div>
                  </div>

                  {/* Right: Actions Group */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                    {/* Switch to Plan Button */}
                    {!item.isActive ? (
                      <button
                        className="btn-nav btn-nav-primary"
                        style={{ padding: "5px 12px", fontSize: "12px", gap: "5px" }}
                        onClick={() => {
                          onSelectProject(item.id);
                          setShow(false);
                        }}
                        title="Switch to this plan"
                      >
                        <ArrowRight size={13} />
                        <span>Open</span>
                      </button>
                    ) : (
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "var(--jantt-accent, #38BDF8)",
                          padding: "4px 8px"
                        }}
                      >
                        Currently Open
                      </span>
                    )}

                    {/* Publish to Cloud Room (for Local or Default) */}
                    {(isLocal || isDefault) && item.data && (
                      <button
                        className="btn-nav"
                        style={{ padding: "5px 10px", fontSize: "12px", gap: "5px" }}
                        onClick={() => handlePublishClick(item.name, item.data)}
                        disabled={isActionBusy}
                        title="Publish this local plan to a live Real-Time Cloud Room"
                      >
                        <Cloud size={13} color="var(--jantt-accent)" />
                        <span>Publish Cloud</span>
                      </button>
                    )}

                    {/* Make Local Copy (for Rooms or Default Template) */}
                    {(isRoom || isDefault) && item.data && (
                      <button
                        className="btn-nav"
                        style={{ padding: "5px 10px", fontSize: "12px", gap: "5px" }}
                        onClick={() => onCreateLocalCopy(item.name, item.data!)}
                        title="Create an independent offline local copy"
                      >
                        <HardDrive size={13} />
                        <span>Make Local Copy</span>
                      </button>
                    )}

                    {/* Duplicate (for Local Plans) */}
                    {isLocal && (
                      <button
                        className="btn-nav"
                        style={{ padding: "5px 8px", fontSize: "12px" }}
                        onClick={() => onDuplicateProject(item.id)}
                        title="Duplicate plan into a new copy"
                      >
                        <Copy size={13} />
                      </button>
                    )}

                    {/* Share Button (for Cloud Rooms) */}
                    {isRoom && (item as any).roomId && onOpenShareRoom && (
                      <button
                        className="btn-nav"
                        style={{ padding: "5px 8px", fontSize: "12px" }}
                        onClick={() => onOpenShareRoom((item as any).roomId)}
                        title="Share cloud room and manage collaborator permissions"
                      >
                        <Share2 size={13} />
                      </button>
                    )}

                    {/* Export JSON Button */}
                    {item.data && (
                      <button
                        className="btn-nav"
                        style={{ padding: "5px 8px", fontSize: "12px" }}
                        onClick={() => handleDownloadPlanJson(item.name, item.data)}
                        title="Export JSON specification file"
                      >
                        <FileJson size={13} />
                      </button>
                    )}

                    {/* Export CSV Button */}
                    {item.data && (
                      <button
                        className="btn-nav"
                        style={{ padding: "5px 8px", fontSize: "12px" }}
                        onClick={() => handleDownloadPlanCsv(item.name, item.data)}
                        title="Export CSV spreadsheet"
                      >
                        <FileSpreadsheet size={13} />
                      </button>
                    )}

                    {/* Delete Local Plan */}
                    {isLocal && (
                      <button
                        className="btn-nav"
                        style={{ padding: "5px 8px", fontSize: "12px", color: "#EF4444" }}
                        onClick={() => onDeleteProject(item.id)}
                        title="Delete local plan from browser storage"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}

                    {/* Delete Owned Room */}
                    {isOwnedRoom && (item as any).roomId && onDeleteCloudRoom && (
                      <button
                        className="btn-nav"
                        style={{ padding: "5px 8px", fontSize: "12px", color: "#EF4444" }}
                        onClick={() => {
                          if (window.confirm(`Permanently delete cloud room "${item.name}"? All collaborators will lose access.`)) {
                            onDeleteCloudRoom((item as any).roomId);
                          }
                        }}
                        title="Delete cloud room permanently"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}

                    {/* Leave Shared Room */}
                    {isSharedRoom && (item as any).roomId && onLeaveCloudRoom && (
                      <button
                        className="btn-nav"
                        style={{ padding: "5px 8px", fontSize: "12px", color: "#F59E0B" }}
                        onClick={() => {
                          if (window.confirm(`Leave room "${item.name}"? You can rejoin later if invited.`)) {
                            onLeaveCloudRoom((item as any).roomId);
                          }
                        }}
                        title="Leave this shared cloud room"
                      >
                        <UserMinus size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="prompt-modal-footer" style={{ padding: "12px 22px", justifyContent: "space-between" }}>
          <div style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
            Showing <strong>{filteredItems.length}</strong> of <strong>{allItems.length}</strong> total plans
          </div>
          <button className="btn-nav" onClick={() => setShow(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
