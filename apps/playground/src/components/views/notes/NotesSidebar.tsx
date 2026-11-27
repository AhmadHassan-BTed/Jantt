import React, { useMemo } from "react";
import { StickyNote, Plus, Search, Trash2, Pin, Clock, Paperclip, CheckSquare, X } from "lucide-react";
import {
  sanitizeCssColor,
  formatTimestampWithFormat,
  type NoteItem,
  type Task,
  type TimeFormat
} from "@jantt/core";
import { formatRelativeTime } from "../../../utils";
import { DEFAULT_NOTE_COLOR, NOTE_PALETTE, getTaskTitle, noteContentToPlainText, toText } from "./note-markdown";

export interface NotesSidebarProps {
  notes: NoteItem[];
  activeNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (id: string, e: React.MouseEvent) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedColor: string;
  onSelectColor: (c: string) => void;
  isViewer?: boolean;
  /** IDs of live tasks; attachment counts ignore links to deleted/missing tasks when provided. */
  liveTaskIds?: ReadonlySet<string>;
  timeFormat?: TimeFormat;
  allTasks?: Task[];
  selectedTaskFilterId?: string | null;
  onSelectTaskFilter?: (taskId: string | null) => void;
}

const timeOf = (note: NoteItem) => {
  const t = new Date(toText(note.updatedAt || note.timestamp || note.createdAt) || 0).getTime();
  return Number.isFinite(t) ? t : 0;
};

export const NotesSidebar: React.FC<NotesSidebarProps> = ({
  notes,
  activeNoteId,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  searchQuery,
  onSearchChange,
  selectedColor,
  onSelectColor,
  isViewer = false,
  liveTaskIds,
  timeFormat = "12h",
  allTasks = [],
  selectedTaskFilterId = null,
  onSelectTaskFilter
}) => {
  // Plain-text excerpts depend only on the notes, not on the search or on keystrokes in the
  // open editor (which re-render this list), so they are derived once per notes change.
  const plainTextById = useMemo(
    () => new Map(notes.map((n) => [n.id, noteContentToPlainText(n.content)])),
    [notes]
  );

  const taskNoteCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of notes) {
      if (!Array.isArray(note.task_ids)) continue;
      for (const tid of new Set(note.task_ids)) {
        counts.set(tid, (counts.get(tid) || 0) + 1);
      }
    }
    return counts;
  }, [notes]);

  const filteredTask = useMemo(
    () => (selectedTaskFilterId ? allTasks.find((t) => t.id === selectedTaskFilterId) || null : null),
    [allTasks, selectedTaskFilterId]
  );

  const sortedNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = notes.filter((n) => {
      if (selectedTaskFilterId) {
        const linked = Array.isArray(n.task_ids) ? n.task_ids : [];
        if (!linked.includes(selectedTaskFilterId)) return false;
      }
      if (selectedColor !== "all" && n.color !== selectedColor) return false;
      if (!q) return true;
      if (toText(n.title).toLowerCase().includes(q)) return true;
      if ((plainTextById.get(n.id) ?? "").toLowerCase().includes(q)) return true;
      return Array.isArray(n.tags) && n.tags.some((tag) => toText(tag).toLowerCase().includes(q));
    });
    return filtered.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return timeOf(b) - timeOf(a);
    });
  }, [notes, plainTextById, searchQuery, selectedColor, selectedTaskFilterId]);

  const hasFilter = searchQuery.trim() !== "" || selectedColor !== "all" || Boolean(selectedTaskFilterId);
  const clearFilters = () => {
    onSearchChange("");
    onSelectColor("all");
    onSelectTaskFilter?.(null);
  };

  const countAttached = (note: NoteItem) => {
    const ids = Array.isArray(note.task_ids) ? note.task_ids : [];
    return liveTaskIds ? ids.filter((id) => liveTaskIds.has(id)).length : ids.length;
  };

  return (
    <aside className="notes-sidebar">
      <div className="notes-sidebar-header">
        <div className="notes-sidebar-title-row">
          <div className="notes-sidebar-brand">
            <StickyNote size={18} className="notes-brand-icon" />
            <span className="notes-brand-title">{filteredTask ? "Task Notes" : "Project Notes"}</span>
            <span className="notes-count-badge">{selectedTaskFilterId ? sortedNotes.length : notes.length}</span>
            {isViewer && <span className="notes-view-only-badge">View-Only</span>}
          </div>
          {!isViewer && (
            <button
              type="button"
              className="notes-new-btn"
              onClick={onCreateNote}
              title={filteredTask ? `Add note for ${getTaskTitle(filteredTask)}` : "Create a new note"}
            >
              <Plus size={14} />
              <span>{filteredTask ? "Add Note" : "New Note"}</span>
            </button>
          )}
        </div>

        <div className="notes-search-bar">
          <Search size={14} className="notes-search-icon" />
          <input
            type="text"
            className="notes-search-input"
            placeholder="Search notes or tags..."
            aria-label="Search notes"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {onSelectTaskFilter && allTasks.length > 0 && (
          <div className="notes-task-filter-bar">
            {selectedTaskFilterId ? (
              <div className="notes-task-banner">
                <CheckSquare size={13} className="notes-task-banner-icon" />
                <span className="notes-task-banner-label" title={filteredTask ? getTaskTitle(filteredTask) : selectedTaskFilterId}>
                  {filteredTask ? getTaskTitle(filteredTask) : selectedTaskFilterId}
                </span>
                <button
                  type="button"
                  className="notes-task-clear-btn"
                  onClick={() => onSelectTaskFilter(null)}
                  title="Show all project notes"
                  aria-label="Clear task filter and show all notes"
                >
                  <X size={12} />
                  <span>All Notes</span>
                </button>
              </div>
            ) : (
              <select
                className="notes-task-filter-select"
                value=""
                onChange={(e) => onSelectTaskFilter(e.target.value || null)}
                aria-label="Filter notes by task"
              >
                <option value="">All Tasks ({notes.length} notes)</option>
                {allTasks.map((t) => {
                  const count = taskNoteCounts.get(t.id) || 0;
                  return (
                    <option key={t.id} value={t.id}>
                      {getTaskTitle(t)} (#{t.id}){count > 0 ? ` [${count}]` : ""}
                    </option>
                  );
                })}
              </select>
            )}
          </div>
        )}

        <div className="notes-color-filter-strip" role="group" aria-label="Filter notes by color">
          <button
            type="button"
            className={`notes-color-chip is-all ${selectedColor === "all" ? "is-active" : ""}`}
            onClick={() => onSelectColor("all")}
            aria-pressed={selectedColor === "all"}
            title="Show all note colors"
          >
            All
          </button>
          {NOTE_PALETTE.map((pal) => (
            <button
              key={pal.id}
              type="button"
              className={`notes-color-chip ${selectedColor === pal.id ? "is-active" : ""}`}
              style={{ backgroundColor: pal.bg }}
              onClick={() => onSelectColor(selectedColor === pal.id ? "all" : pal.id)}
              aria-pressed={selectedColor === pal.id}
              aria-label={`Filter by ${pal.label}`}
              title={`Filter by ${pal.label}`}
            />
          ))}
        </div>
      </div>

      <div className="notes-list-scroll">
        {sortedNotes.length === 0 ? (
          <div className="notes-empty-list">
            <StickyNote size={28} className="notes-empty-icon" />
            {selectedTaskFilterId ? (
              <>
                <p className="notes-empty-text">
                  {hasFilter && (searchQuery.trim() || selectedColor !== "all")
                    ? "No notes match your filters for this task."
                    : isViewer
                      ? "No notes linked to this task yet."
                      : "No notes linked to this task yet."}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center" }}>
                  {!isViewer && (
                    <button type="button" className="notes-empty-create-btn" onClick={onCreateNote}>
                      Add Note to Task
                    </button>
                  )}
                  <button type="button" className="notes-empty-create-btn" onClick={clearFilters}>
                    Show All Notes
                  </button>
                </div>
              </>
            ) : notes.length > 0 && hasFilter ? (
              <>
                <p className="notes-empty-text">
                  {searchQuery.trim() ? "No notes match your search." : "No notes with this color."}
                </p>
                <button type="button" className="notes-empty-create-btn" onClick={clearFilters}>
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <p className="notes-empty-text">
                  {isViewer ? "No project notes yet in this shared room." : "No project notes yet."}
                </p>
                {!isViewer && (
                  <button type="button" className="notes-empty-create-btn" onClick={onCreateNote}>
                    Create your first note
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          sortedNotes.map((note) => {
            const isActive = note.id === activeNoteId;
            const attachedCount = countAttached(note);
            const title = toText(note.title) || "Untitled Note";
            const preview = (plainTextById.get(note.id) ?? "").slice(0, 90);
            return (
              <div
                key={note.id}
                className={`note-list-item ${isActive ? "is-active" : ""} ${note.pinned ? "is-pinned" : ""}`}
                style={{ borderLeftColor: sanitizeCssColor(note.color, DEFAULT_NOTE_COLOR) }}
              >
                <div className="note-item-header">
                  <button type="button" className="note-item-title note-open-button" onClick={() => onSelectNote(note.id)}
                    aria-label={`Open note ${title}`} aria-current={isActive ? "true" : undefined}>{title}</button>
                  <div className="note-item-badges">
                    {note.pinned && <Pin size={11} className="note-pin-badge" aria-label="Pinned" />}
                    {!isViewer && (
                      <button
                        type="button"
                        className="note-item-del-btn"
                        onClick={(e) => onDeleteNote(note.id, e)}
                        aria-label={`Delete note ${title}`}
                        title="Delete note"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>

                <p className="note-item-preview">{preview || "Empty note..."}</p>

                <div className="note-item-footer">
                  {(() => {
                    const primaryIso = toText(note.timestamp || note.updatedAt || note.createdAt) || undefined;
                    const exactStamp = primaryIso ? formatTimestampWithFormat(primaryIso, timeFormat, false) : "";
                    const relLabel = formatRelativeTime(primaryIso);
                    const createdLabel = note.createdAt ? formatTimestampWithFormat(toText(note.createdAt), timeFormat, true) : "";
                    const updatedLabel = note.updatedAt ? formatTimestampWithFormat(toText(note.updatedAt), timeFormat, true) : "";
                    const tooltipParts = [
                      note.timestamp ? `Timestamp: ${formatTimestampWithFormat(toText(note.timestamp), timeFormat, true)}` : "",
                      createdLabel ? `Created: ${createdLabel}` : "",
                      updatedLabel ? `Updated: ${updatedLabel}` : ""
                    ].filter(Boolean);
                    return (
                      <span className="note-item-time" title={tooltipParts.join(" | ") || relLabel}>
                        <Clock size={11} />
                        <span>{exactStamp || relLabel}</span>
                        {exactStamp && <span className="note-item-rel-sep">· {relLabel}</span>}
                      </span>
                    );
                  })()}
                  {attachedCount > 0 && (
                    <span className="note-item-attached-count" title={`${attachedCount} linked task(s)`}>
                      <Paperclip size={10} />
                      <span>{attachedCount}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
