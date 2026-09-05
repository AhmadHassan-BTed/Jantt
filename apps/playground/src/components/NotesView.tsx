import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  StickyNote,
  Plus,
  Search,
  Trash2,
  ArrowLeft,
  Pin,
  Clock,
  CheckCircle2,
  RefreshCw,
  Eye,
  Edit3,
  Calendar
} from "lucide-react";
import type { JanttData, NoteItem } from "@jantt/core";
import { formatRelativeTime } from "../utils";

const NOTE_PALETTE = [
  { id: "#3B82F6", label: "Blue", bg: "#3B82F6" },
  { id: "#10B981", label: "Emerald", bg: "#10B981" },
  { id: "#F59E0B", label: "Amber", bg: "#F59E0B" },
  { id: "#8B5CF6", label: "Violet", bg: "#8B5CF6" },
  { id: "#F43F5E", label: "Rose", bg: "#F43F5E" },
  { id: "#06B6D4", label: "Cyan", bg: "#06B6D4" },
  { id: "#64748B", label: "Slate", bg: "#64748B" }
];

interface NotesViewProps {
  parsedData: JanttData;
  handleChartCommit: (data: JanttData) => void;
}

const STORAGE_KEY_ACTIVE_NOTE = "jantt_active_note_id";

export const NotesView: React.FC<NotesViewProps> = ({
  parsedData,
  handleChartCommit
}) => {
  const notes: NoteItem[] = useMemo(() => parsedData.notes || [], [parsedData.notes]);

  const [activeNoteId, setActiveNoteIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_ACTIVE_NOTE) || null;
    } catch {
      return null;
    }
  });

  const setActiveNoteId = useCallback((id: string | null) => {
    setActiveNoteIdState(id);
    try {
      if (id) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_NOTE, id);
      } else {
        localStorage.removeItem(STORAGE_KEY_ACTIVE_NOTE);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Validate that if activeNoteId is set, it actually exists in notes
  useEffect(() => {
    if (activeNoteId && notes.length > 0 && !notes.some((n) => n.id === activeNoteId)) {
      setActiveNoteId(null);
    }
  }, [notes, activeNoteId, setActiveNoteId]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedColor, setSelectedColor] = useState<string>("all");

  // Local state for the active note being edited
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editColor, setEditColor] = useState("#3B82F6");
  const [editPinned, setEditPinned] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeNoteId) || null,
    [notes, activeNoteId]
  );

  // References for debounced auto-save
  const debounceTimerRef = useRef<number | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const isNewlyCreatedRef = useRef(false);

  const latestEditRef = useRef({
    activeNoteId,
    saveStatus,
    editTitle,
    editContent,
    editColor,
    editPinned
  });
  latestEditRef.current = {
    activeNoteId,
    saveStatus,
    editTitle,
    editContent,
    editColor,
    editPinned
  };

  // Sync active note data into local editor state when opened
  useEffect(() => {
    if (activeNote) {
      setEditTitle(activeNote.title || "");
      setEditContent(activeNote.content || "");
      setEditColor(activeNote.color || "#3B82F6");
      setEditPinned(!!activeNote.pinned);
      setSaveStatus("saved");

      if (isNewlyCreatedRef.current) {
        isNewlyCreatedRef.current = false;
        setTimeout(() => {
          titleInputRef.current?.focus();
          titleInputRef.current?.select();
        }, 50);
      }
    }
  }, [activeNoteId]); // Only when switching notes

  // Function to commit changes immediately to JanttData JSON
  const commitNoteChanges = useCallback(
    (noteId: string, updates: Partial<NoteItem>) => {
      const currentNotes = parsedData.notes || [];
      const noteExists = currentNotes.some((n) => n.id === noteId);

      const now = new Date().toISOString();
      let updatedNotes: NoteItem[];

      if (noteExists) {
        updatedNotes = currentNotes.map((n) => {
          if (n.id === noteId) {
            return {
              ...n,
              ...updates,
              updatedAt: now
            };
          }
          return n;
        });
      } else {
        const fullNote: NoteItem = {
          id: noteId,
          title: updates.title ?? "Untitled Note",
          content: updates.content ?? "",
          color: updates.color ?? "#3B82F6",
          pinned: updates.pinned ?? false,
          createdAt: now,
          updatedAt: now,
          ...updates
        };
        updatedNotes = [fullNote, ...currentNotes];
      }

      handleChartCommit({
        ...parsedData,
        notes: updatedNotes
      });
      setSaveStatus("saved");
    },
    [parsedData, handleChartCommit]
  );

  // Debounced save when user types in editor
  const triggerDebouncedSave = useCallback(
    (updates: { title?: string; content?: string; color?: string; pinned?: boolean }) => {
      if (!activeNoteId) return;
      setSaveStatus("saving");

      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = window.setTimeout(() => {
        commitNoteChanges(activeNoteId, updates);
      }, 350);
    },
    [activeNoteId, commitNoteChanges]
  );

  // Clean up timer & flush pending edits on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
      const state = latestEditRef.current;
      if (state.activeNoteId && state.saveStatus === "saving") {
        commitNoteChanges(state.activeNoteId, {
          title: state.editTitle,
          content: state.editContent,
          color: state.editColor,
          pinned: state.editPinned
        });
      }
    };
  }, [commitNoteChanges]);

  // Flush any pending changes when exiting editor
  const handleBackToGallery = () => {
    if (activeNoteId && saveStatus === "saving") {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
      commitNoteChanges(activeNoteId, {
        title: editTitle,
        content: editContent,
        color: editColor,
        pinned: editPinned
      });
    }
    setActiveNoteId(null);
  };

  // Create a fresh note
  const handleCreateNote = () => {
    const newId = `note-${Date.now()}`;
    const now = new Date().toISOString();
    const newNote: NoteItem = {
      id: newId,
      title: "New Project Note",
      content: "",
      color: "#3B82F6",
      pinned: false,
      createdAt: now,
      updatedAt: now
    };

    isNewlyCreatedRef.current = true;
    const currentNotes = parsedData.notes || [];
    handleChartCommit({
      ...parsedData,
      notes: [newNote, ...currentNotes]
    });
    setActiveNoteId(newId);
  };

  // Delete note
  const handleDeleteNote = (noteId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const confirmed = window.confirm("Are you sure you want to delete this note from the project?");
    if (!confirmed) return;

    const currentNotes = parsedData.notes || [];
    const updatedNotes = currentNotes.filter((n) => n.id !== noteId);

    handleChartCommit({
      ...parsedData,
      notes: updatedNotes
    });

    if (activeNoteId === noteId) {
      setActiveNoteId(null);
    }
  };

  // Filtered & Sorted Notes for Gallery Grid
  const filteredNotes = useMemo(() => {
    return notes
      .filter((n) => {
        if (selectedColor !== "all" && n.color !== selectedColor) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const matchTitle = (n.title || "").toLowerCase().includes(q);
        const matchContent = (n.content || "").toLowerCase().includes(q);
        return matchTitle || matchContent;
      })
      .sort((a, b) => {
        // Pinned notes come first
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        // Then sort by updatedAt descending
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
  }, [notes, searchQuery, selectedColor]);

  // Reading / word stats for editor
  const wordCount = useMemo(() => {
    if (!editContent.trim()) return 0;
    return editContent.trim().split(/\s+/).length;
  }, [editContent]);

  const charCount = editContent.length;

  return (
    <div className="notes-view-container">
      {activeNoteId && activeNote ? (
        /* ========================================================================= */
        /* DETAIL NOTE EDITOR VIEW (Type, Format & Auto-Save into JSON)              */
        /* ========================================================================= */
        <div className="note-editor-wrapper">
          {/* Top Editor Toolbar */}
          <div className="note-editor-header">
            <div className="note-editor-left-tools">
              <button
                type="button"
                className="btn-note-back"
                onClick={handleBackToGallery}
                title="Return to Notes Gallery (Ctrl+Esc)"
              >
                <ArrowLeft size={14} />
                <span>All Notes</span>
              </button>

              <div className="note-save-badge">
                {saveStatus === "saving" ? (
                  <>
                    <RefreshCw size={12} className="spin-sync-icon" />
                    <span>Saving to JSON...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={12} style={{ color: "#10B981" }} />
                    <span>Saved in JSON</span>
                  </>
                )}
              </div>
            </div>

            <div className="note-editor-right-tools">
              {/* Color Picker Palette */}
              <div className="note-palette-bar">
                {NOTE_PALETTE.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`note-palette-dot ${editColor === p.id ? "is-selected" : ""}`}
                    style={{ background: p.bg }}
                    onClick={() => {
                      setEditColor(p.id);
                      triggerDebouncedSave({ color: p.id, title: editTitle, content: editContent, pinned: editPinned });
                    }}
                    title={`Set color: ${p.label}`}
                  />
                ))}
              </div>

              {/* Pin Toggle Button */}
              <button
                type="button"
                className={`btn-note-tool ${editPinned ? "is-active" : ""}`}
                onClick={() => {
                  const nextPinned = !editPinned;
                  setEditPinned(nextPinned);
                  triggerDebouncedSave({ pinned: nextPinned, title: editTitle, content: editContent, color: editColor });
                }}
                title={editPinned ? "Unpin note" : "Pin note to top"}
              >
                <Pin size={13} style={{ transform: editPinned ? "rotate(-45deg)" : "none" }} />
                <span>{editPinned ? "Pinned" : "Pin"}</span>
              </button>

              {/* Markdown Preview / Edit toggle */}
              <button
                type="button"
                className={`btn-note-tool ${isPreviewMode ? "is-active" : ""}`}
                onClick={() => setIsPreviewMode(!isPreviewMode)}
                title={isPreviewMode ? "Switch to edit view" : "Preview formatted note"}
              >
                {isPreviewMode ? <Edit3 size={13} /> : <Eye size={13} />}
                <span>{isPreviewMode ? "Edit" : "Preview"}</span>
              </button>

              {/* Delete Button */}
              <button
                type="button"
                className="btn-note-tool is-danger"
                onClick={() => handleDeleteNote(activeNote.id)}
                title="Delete note"
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
            </div>
          </div>

          {/* Editor Canvas Card */}
          <div className="note-editor-card" style={{ borderTopColor: editColor }}>
            {/* Title Input */}
            <input
              ref={titleInputRef}
              type="text"
              className="note-editor-title-input"
              value={editTitle}
              onChange={(e) => {
                setEditTitle(e.target.value);
                triggerDebouncedSave({ title: e.target.value, content: editContent, color: editColor, pinned: editPinned });
              }}
              placeholder="Note title..."
            />

            {/* Note Meta Bar */}
            <div className="note-editor-meta-strip">
              <span className="note-meta-item">
                <Clock size={12} />
                <span>Updated: {formatRelativeTime(activeNote.updatedAt || activeNote.createdAt)}</span>
              </span>
              <span>•</span>
              <span className="note-meta-item">
                <span>{wordCount} words</span>
              </span>
              <span>•</span>
              <span className="note-meta-item">
                <span>{charCount} characters</span>
              </span>
              {activeNote.createdAt && (
                <>
                  <span>•</span>
                  <span className="note-meta-item">
                    <Calendar size={12} />
                    <span>Created: {new Date(activeNote.createdAt).toLocaleDateString()}</span>
                  </span>
                </>
              )}
            </div>

            {/* Content Area (Edit vs Preview) */}
            {isPreviewMode ? (
              <div className="note-preview-content">
                {editContent.trim() ? (
                  editContent.split("\n").map((line, idx) => {
                    if (line.startsWith("### ")) {
                      return <h3 key={idx}>{line.slice(4)}</h3>;
                    }
                    if (line.startsWith("## ")) {
                      return <h2 key={idx}>{line.slice(3)}</h2>;
                    }
                    if (line.startsWith("# ")) {
                      return <h1 key={idx}>{line.slice(2)}</h1>;
                    }
                    if (line.startsWith("- ") || line.startsWith("* ")) {
                      return (
                        <li key={idx} style={{ marginLeft: "18px", marginBottom: "4px" }}>
                          {line.slice(2)}
                        </li>
                      );
                    }
                    if (line.trim() === "") {
                      return <div key={idx} style={{ height: "12px" }} />;
                    }
                    return <p key={idx} style={{ margin: "0 0 8px 0" }}>{line}</p>;
                  })
                ) : (
                  <p style={{ color: "var(--jantt-text-muted)", fontStyle: "italic" }}>
                    No content yet. Click Edit to start writing.
                  </p>
                )}
              </div>
            ) : (
              <textarea
                className="note-editor-textarea"
                value={editContent}
                onChange={(e) => {
                  setEditContent(e.target.value);
                  triggerDebouncedSave({ content: e.target.value, title: editTitle, color: editColor, pinned: editPinned });
                }}
                placeholder="Start typing your note, meeting minutes, architecture specs, or task checklist here (Markdown supported)..."
                rows={16}
              />
            )}
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* GALLERY GRID VIEW (Browse, Search, Filter & Quick-Add)                    */
        /* ========================================================================= */
        <div className="notes-gallery-wrapper">
          {/* Header & Controls Bar */}
          <div className="notes-gallery-header">
            <div>
              <h2 className="notes-gallery-title">
                <StickyNote size={18} style={{ color: "var(--jantt-accent)" }} />
                <span>Project Notes &amp; Documentation</span>
              </h2>
              <p className="notes-gallery-subtitle">
                Keep architecture specs, meeting minutes, decision logs, and ideas directly inside your project JSON.
              </p>
            </div>

            <div className="notes-gallery-actions">
              {/* Search Bar */}
              <div className="notes-search-box">
                <Search size={14} className="notes-search-icon" />
                <input
                  type="text"
                  className="notes-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search notes..."
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="notes-search-clear"
                    onClick={() => setSearchQuery("")}
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Color Filter Dots */}
              <div className="notes-filter-palette">
                <button
                  type="button"
                  className={`notes-filter-dot ${selectedColor === "all" ? "is-active" : ""}`}
                  onClick={() => setSelectedColor("all")}
                  title="Show all colors"
                >
                  All
                </button>
                {NOTE_PALETTE.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`notes-filter-dot-color ${selectedColor === p.id ? "is-active" : ""}`}
                    style={{ background: p.bg }}
                    onClick={() => setSelectedColor(selectedColor === p.id ? "all" : p.id)}
                    title={`Filter by ${p.label}`}
                  />
                ))}
              </div>

              {/* New Note Button */}
              <button
                type="button"
                className="btn-create-note"
                onClick={handleCreateNote}
                title="Create a new note (stores into JSON)"
              >
                <Plus size={14} />
                <span>New Note</span>
              </button>
            </div>
          </div>

          {/* Notes Grid */}
          <div className="notes-grid">
            {/* Quick Add Card */}
            <div
              className="note-card note-card-create-prompt"
              onClick={handleCreateNote}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleCreateNote();
              }}
              title="Click to create a new note"
            >
              <div className="note-create-icon-wrap">
                <Plus size={24} />
              </div>
              <span style={{ fontWeight: 600, fontSize: "13px" }}>Create New Note</span>
              <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                Auto-saved directly into project JSON
              </span>
            </div>

            {/* Rendered Note Cards */}
            {filteredNotes.map((note) => {
              const previewSnippet = note.content
                ? note.content.replace(/[#*`_]/g, "").trim().slice(0, 160)
                : "Empty note. Tap to write...";

              return (
                <div
                  key={note.id}
                  className="note-card"
                  style={{ borderTopColor: note.color || "#3B82F6" }}
                  onClick={() => setActiveNoteId(note.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setActiveNoteId(note.id);
                  }}
                >
                  {/* Card Header */}
                  <div className="note-card-header">
                    <h3 className="note-card-title">{note.title || "Untitled Note"}</h3>
                    {note.pinned && (
                      <span className="note-card-pin-badge" title="Pinned note">
                        <Pin size={11} style={{ transform: "rotate(-45deg)" }} />
                      </span>
                    )}
                  </div>

                  {/* Card Body Preview */}
                  <p className="note-card-snippet">{previewSnippet}</p>

                  {/* Card Footer */}
                  <div className="note-card-footer">
                    <div className="note-card-timestamp">
                      <Clock size={11} />
                      <span>{formatRelativeTime(note.updatedAt || note.createdAt)}</span>
                    </div>

                    <button
                      type="button"
                      className="btn-note-delete-quick"
                      onClick={(e) => handleDeleteNote(note.id, e)}
                      title="Delete note"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Empty Search Result State */}
          {filteredNotes.length === 0 && notes.length > 0 && (
            <div className="notes-empty-search">
              <Search size={28} style={{ color: "var(--jantt-text-muted)" }} />
              <span style={{ fontWeight: 600, fontSize: "14px", marginTop: "8px" }}>
                No notes match "{searchQuery}"
              </span>
              <button
                type="button"
                className="btn-clear-search"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedColor("all");
                }}
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
