import React, { useMemo } from "react";
import { StickyNote, Plus, Search, Trash2, Pin, Clock, Paperclip } from "lucide-react";
import { sanitizeCssColor, type NoteItem } from "@jantt/core";
import { formatRelativeTime } from "../../../utils";
import { DEFAULT_NOTE_COLOR, NOTE_PALETTE, noteContentToPlainText, toText } from "./note-markdown";

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
}

const timeOf = (note: NoteItem) => {
  const t = new Date(toText(note.updatedAt || note.createdAt) || 0).getTime();
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
  liveTaskIds
}) => {
  // Plain-text excerpts depend only on the notes, not on the search or on keystrokes in the
  // open editor (which re-render this list), so they are derived once per notes change.
  const plainTextById = useMemo(
    () => new Map(notes.map((n) => [n.id, noteContentToPlainText(n.content)])),
    [notes]
  );

  const sortedNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = notes.filter((n) => {
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
  }, [notes, plainTextById, searchQuery, selectedColor]);

  const hasFilter = searchQuery.trim() !== "" || selectedColor !== "all";
  const clearFilters = () => {
    onSearchChange("");
    onSelectColor("all");
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
            <span className="notes-brand-title">Project Notes</span>
            <span className="notes-count-badge">{notes.length}</span>
            {isViewer && <span className="notes-view-only-badge">View-Only</span>}
          </div>
          {!isViewer && (
            <button
              type="button"
              className="notes-new-btn"
              onClick={onCreateNote}
              title="Create a new note"
            >
              <Plus size={14} />
              <span>New Note</span>
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
            {notes.length > 0 && hasFilter ? (
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
                  <span className="note-item-time">
                    <Clock size={11} />
                    <span>{formatRelativeTime(toText(note.updatedAt || note.createdAt) || undefined)}</span>
                  </span>
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
