import React from "react";
import { StickyNote, Plus, Search, Trash2, Pin, Clock, Paperclip } from "lucide-react";
import type { NoteItem } from "@jantt/core";
import { formatRelativeTime } from "../../../utils";
import { NOTE_PALETTE } from "./note-markdown";

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
}

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
  isViewer = false
}) => {
  const filteredNotes = notes.filter((n) => {
    if (selectedColor !== "all" && n.color !== selectedColor) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (n.title || "").toLowerCase().includes(q);
      const matchBody = (n.content || "").toLowerCase().includes(q);
      const matchTags = (n.tags || []).some((tag) => tag.toLowerCase().includes(q));
      if (!matchTitle && !matchBody && !matchTags) return false;
    }
    return true;
  });

  const sortedNotes = [...filteredNotes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return timeB - timeA;
  });

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
          <button
            type="button"
            className="notes-new-btn"
            onClick={onCreateNote}
            title={isViewer ? "View-only room (Click to fork a local copy)" : "Create a new note"}
          >
            <Plus size={14} />
            <span>New Note</span>
          </button>
        </div>

        <div className="notes-search-bar">
          <Search size={14} className="notes-search-icon" />
          <input
            type="text"
            className="notes-search-input"
            placeholder="Search notes or tags..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <div className="notes-color-filter-strip">
          <button
            type="button"
            className={`notes-color-chip is-all ${selectedColor === "all" ? "is-active" : ""}`}
            onClick={() => onSelectColor("all")}
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
              title={`Filter by ${pal.label}`}
            />
          ))}
        </div>
      </div>

      <div className="notes-list-scroll">
        {sortedNotes.length === 0 ? (
          <div className="notes-empty-list">
            <StickyNote size={28} className="notes-empty-icon" />
            <p className="notes-empty-text">
              {searchQuery
                ? "No matching notes found."
                : isViewer
                ? "No project notes yet in this shared room."
                : "No project notes yet."}
            </p>
            {!searchQuery && !isViewer && (
              <button
                type="button"
                className="notes-empty-create-btn"
                onClick={onCreateNote}
              >
                Create your first note
              </button>
            )}
          </div>
        ) : (
          sortedNotes.map((note) => {
            const isActive = note.id === activeNoteId;
            const attachedCount = note.task_ids?.length || 0;
            return (
              <div
                key={note.id}
                className={`note-list-item ${isActive ? "is-active" : ""} ${note.pinned ? "is-pinned" : ""}`}
                style={{ borderLeftColor: note.color || "#3B82F6" }}
                onClick={() => onSelectNote(note.id)}
              >
                <div className="note-item-header">
                  <span className="note-item-title">{note.title || "Untitled Note"}</span>
                  <div className="note-item-badges">
                    {note.pinned && <Pin size={11} className="note-pin-badge" />}
                    {!isViewer && (
                      <button
                        type="button"
                        className="note-item-del-btn"
                        onClick={(e) => onDeleteNote(note.id, e)}
                        title="Delete note"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>

                <p className="note-item-preview">
                  {note.content ? note.content.replace(/[#@*`]/g, "").slice(0, 90) : "Empty note..."}
                </p>

                <div className="note-item-footer">
                  <span className="note-item-time">
                    <Clock size={11} />
                    <span>{formatRelativeTime(note.updatedAt || note.createdAt)}</span>
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
