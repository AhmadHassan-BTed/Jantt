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
  Calendar,
  Paperclip,
  AtSign,
  CheckSquare,
  User,
  X,
  PlusCircle
} from "lucide-react";
import type { JanttData, NoteItem, Task, Team } from "@jantt/core";
import { formatRelativeTime } from "../utils";
import type { EffectivePerson } from "../types";

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
  effectivePeople?: EffectivePerson[];
  teams?: Team[];
}

const STORAGE_KEY_ACTIVE_NOTE = "jantt_active_note_id";

export const NotesView: React.FC<NotesViewProps> = ({
  parsedData,
  handleChartCommit,
  effectivePeople = [],
  teams = []
}) => {
  const notes: NoteItem[] = useMemo(() => parsedData.notes || [], [parsedData.notes]);
  const allTasks: Task[] = useMemo(() => parsedData.tasks || [], [parsedData.tasks]);
  const teamsMap = useMemo(() => {
    if (Array.isArray(teams)) {
      return Object.fromEntries(teams.map((tm) => [tm.id, tm]));
    }
    return teams || {};
  }, [teams]);

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

  // Quick picker popovers
  const [showAttachPicker, setShowAttachPicker] = useState(false);
  const [showMentionPersonPicker, setShowMentionPersonPicker] = useState(false);
  const [showMentionTaskPicker, setShowMentionTaskPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeNoteId) || null,
    [notes, activeNoteId]
  );

  // References for debounced auto-save & cursor insertion
  const debounceTimerRef = useRef<number | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
      setShowAttachPicker(false);
      setShowMentionPersonPicker(false);
      setShowMentionTaskPicker(false);
      setPickerSearch("");

      if (isNewlyCreatedRef.current) {
        isNewlyCreatedRef.current = false;
        setTimeout(() => {
          titleInputRef.current?.focus();
          titleInputRef.current?.select();
        }, 50);
      }
    }
  }, [activeNoteId]);

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
          task_ids: updates.task_ids ?? [],
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
    (updates: { title?: string; content?: string; color?: string; pinned?: boolean; task_ids?: string[] }) => {
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
      task_ids: [],
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

  // Attach task to note
  const handleAttachTask = (taskId: string) => {
    if (!activeNoteId || !activeNote) return;
    const currentAttached = activeNote.task_ids || [];
    if (currentAttached.includes(taskId)) return;
    const nextAttached = [...currentAttached, taskId];
    commitNoteChanges(activeNoteId, { task_ids: nextAttached });
    setShowAttachPicker(false);
    setPickerSearch("");
  };

  // Detach task from note
  const handleDetachTask = (taskId: string) => {
    if (!activeNoteId || !activeNote) return;
    const currentAttached = activeNote.task_ids || [];
    const nextAttached = currentAttached.filter((id) => id !== taskId);
    commitNoteChanges(activeNoteId, { task_ids: nextAttached });
  };

  // Quick insertion of @mention or /task into textarea
  const insertTextAtCursor = (textToInsert: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      const nextContent = editContent ? `${editContent} ${textToInsert}` : textToInsert;
      setEditContent(nextContent);
      triggerDebouncedSave({ content: nextContent, title: editTitle, color: editColor, pinned: editPinned });
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = editContent.substring(0, start);
    const after = editContent.substring(end);
    const updated = `${before}${textToInsert}${after}`;
    setEditContent(updated);
    triggerDebouncedSave({ content: updated, title: editTitle, color: editColor, pinned: editPinned });

    setTimeout(() => {
      textarea.focus();
      const newCursor = start + textToInsert.length;
      textarea.setSelectionRange(newCursor, newCursor);
    }, 15);
  };

  // Parse Mentioned Entities from Note Markdown Body
  const { mentionedTasks, mentionedPeople } = useMemo(() => {
    if (!editContent) {
      return { mentionedTasks: [], mentionedPeople: [] };
    }

    const peopleMatches = Array.from(editContent.matchAll(/@([a-zA-Z0-9_.-]+)/g)).map((m) => m[1].toLowerCase());
    const taskMatches = Array.from(editContent.matchAll(/(?:\/|#)([a-zA-Z0-9_-]+)/g)).map((m) => m[1].toLowerCase());

    const attachedSet = new Set(activeNote?.task_ids || []);

    // Resolve Mentioned Tasks
    const mTasks: Task[] = [];
    const seenTaskIds = new Set<string>();
    allTasks.forEach((t) => {
      const idMatch = taskMatches.includes(t.id.toLowerCase());
      if (idMatch && !attachedSet.has(t.id) && !seenTaskIds.has(t.id)) {
        seenTaskIds.add(t.id);
        mTasks.push(t);
      }
    });

    // Resolve Mentioned People
    const mPeople: EffectivePerson[] = [];
    const seenPersonIds = new Set<string>();
    effectivePeople.forEach((p) => {
      const idMatch = peopleMatches.includes(p.id.toLowerCase());
      const nameMatch = peopleMatches.some((pm) => p.name.toLowerCase().replace(/\s+/g, "").includes(pm));
      if ((idMatch || nameMatch) && !seenPersonIds.has(p.id)) {
        seenPersonIds.add(p.id);
        mPeople.push(p);
      }
    });

    return { mentionedTasks: mTasks, mentionedPeople: mPeople };
  }, [editContent, allTasks, activeNote?.task_ids, effectivePeople]);

  // Resolve Attached Tasks list
  const attachedTasks = useMemo(() => {
    const ids = activeNote?.task_ids || [];
    return allTasks.filter((t) => ids.includes(t.id));
  }, [activeNote?.task_ids, allTasks]);

  // Tasks available to be attached
  const unattachedTasks = useMemo(() => {
    const attachedSet = new Set(activeNote?.task_ids || []);
    return allTasks.filter((t) => {
      if (attachedSet.has(t.id)) return false;
      if (!pickerSearch.trim()) return true;
      const q = pickerSearch.toLowerCase();
      const title = t.label || t.name || "";
      return t.id.toLowerCase().includes(q) || title.toLowerCase().includes(q);
    });
  }, [allTasks, activeNote?.task_ids, pickerSearch]);

  // Filtered People for @ Mention Dropdown
  const filterablePeople = useMemo(() => {
    if (!pickerSearch.trim()) return effectivePeople;
    const q = pickerSearch.toLowerCase();
    return effectivePeople.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
  }, [effectivePeople, pickerSearch]);

  // Filtered Tasks for / Mention Dropdown
  const filterableMentionTasks = useMemo(() => {
    if (!pickerSearch.trim()) return allTasks;
    const q = pickerSearch.toLowerCase();
    return allTasks.filter((t) => {
      const title = t.label || t.name || "";
      return t.id.toLowerCase().includes(q) || title.toLowerCase().includes(q);
    });
  }, [allTasks, pickerSearch]);

  // Helper for rendering lines in preview with highlight pills
  const renderLineWithMentions = (line: string) => {
    const tokens = line.split(/(@[a-zA-Z0-9_.-]+|(?:\/|#)[a-zA-Z0-9_-]+)/g);
    return tokens.map((part, i) => {
      if (part.startsWith("@")) {
        const matchName = part.slice(1).toLowerCase();
        const person = effectivePeople.find(
          (p) => p.id.toLowerCase() === matchName || p.name.toLowerCase().replace(/\s+/g, "").includes(matchName)
        );
        return (
          <span
            key={i}
            className="note-mention-pill is-person"
            title={person ? `${person.name} (${person.role || "Team Member"})` : part}
          >
            <AtSign size={11} />
            <span>{person ? person.name : part.slice(1)}</span>
          </span>
        );
      }
      if (part.startsWith("/") || part.startsWith("#")) {
        const matchId = part.slice(1).toLowerCase();
        const task = allTasks.find((t) => t.id.toLowerCase() === matchId);
        const taskTitle = task ? task.label || task.name || "Task" : part;
        return (
          <span
            key={i}
            className="note-mention-pill is-task"
            title={task ? `${taskTitle} [${task.id}] - ${task.status || "pending"}` : part}
          >
            <CheckSquare size={11} />
            <span>{task ? `${task.id}: ${taskTitle}` : part}</span>
          </span>
        );
      }
      return part;
    });
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

  // Reading stats
  const wordCount = useMemo(() => {
    if (!editContent.trim()) return 0;
    return editContent.trim().split(/\s+/).length;
  }, [editContent]);

  const charCount = editContent.length;

  return (
    <div className="notes-view-container">
      {activeNoteId && activeNote ? (
        /* ========================================================================= */
        /* DETAIL NOTE EDITOR VIEW (Type, Format, Mention & Attach Tasks)            */
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

            {/* Quick Mention & Attach Tool Strip */}
            {!isPreviewMode && (
              <div className="note-quick-tools-bar">
                <span style={{ fontWeight: 600, color: "var(--jantt-text-muted)", marginRight: "4px" }}>
                  Quick Insert:
                </span>

                {/* Mention Person Button & Dropdown */}
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    className="note-quick-tool-btn"
                    onClick={() => {
                      setShowMentionPersonPicker(!showMentionPersonPicker);
                      setShowMentionTaskPicker(false);
                      setShowAttachPicker(false);
                      setPickerSearch("");
                    }}
                    title="Tag a team member (@)"
                  >
                    <AtSign size={13} />
                    <span>@ Person</span>
                  </button>
                  {showMentionPersonPicker && (
                    <div className="note-picker-popover">
                      <input
                        type="text"
                        className="note-picker-search-input"
                        placeholder="Search person..."
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        autoFocus
                      />
                      {filterablePeople.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="note-picker-item"
                          onClick={() => {
                            insertTextAtCursor(`@${p.name.replace(/\s+/g, "")} `);
                            setShowMentionPersonPicker(false);
                            setPickerSearch("");
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span
                              className="note-person-avatar-circle"
                              style={{ background: p.color || "var(--jantt-accent)" }}
                            >
                              {p.name.charAt(0)}
                            </span>
                            <span style={{ fontWeight: 600 }}>{p.name}</span>
                          </div>
                          <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                            {p.role || p.id}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Mention Task Button & Dropdown */}
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    className="note-quick-tool-btn"
                    onClick={() => {
                      setShowMentionTaskPicker(!showMentionTaskPicker);
                      setShowMentionPersonPicker(false);
                      setShowAttachPicker(false);
                      setPickerSearch("");
                    }}
                    title="Mention a task (/task-id)"
                  >
                    <CheckSquare size={13} />
                    <span>/ Task</span>
                  </button>
                  {showMentionTaskPicker && (
                    <div className="note-picker-popover">
                      <input
                        type="text"
                        className="note-picker-search-input"
                        placeholder="Search task to mention..."
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        autoFocus
                      />
                      {filterableMentionTasks.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className="note-picker-item"
                          onClick={() => {
                            insertTextAtCursor(`/${t.id} `);
                            setShowMentionTaskPicker(false);
                            setPickerSearch("");
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{t.id}: {t.label || t.name || "Task"}</span>
                          <span style={{ fontSize: "10.5px", color: "var(--jantt-text-muted)" }}>
                            {t.status || "pending"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Attach Task Button & Dropdown */}
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    className="note-quick-tool-btn"
                    onClick={() => {
                      setShowAttachPicker(!showAttachPicker);
                      setShowMentionPersonPicker(false);
                      setShowMentionTaskPicker(false);
                      setPickerSearch("");
                    }}
                    title="Attach task directly to note"
                  >
                    <Paperclip size={13} />
                    <span>Attach Task</span>
                  </button>
                  {showAttachPicker && (
                    <div className="note-picker-popover">
                      <input
                        type="text"
                        className="note-picker-search-input"
                        placeholder="Search task to attach..."
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        autoFocus
                      />
                      {unattachedTasks.length === 0 ? (
                        <div style={{ padding: "8px", fontSize: "12px", color: "var(--jantt-text-muted)", textAlign: "center" }}>
                          No unattached tasks found
                        </div>
                      ) : (
                        unattachedTasks.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className="note-picker-item"
                            onClick={() => handleAttachTask(t.id)}
                          >
                            <span style={{ fontWeight: 600 }}>{t.id}: {t.label || t.name || "Task"}</span>
                            <span style={{ fontSize: "10.5px", color: "var(--jantt-accent)" }}>+ Attach</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Content Area (Edit vs Preview) */}
            {isPreviewMode ? (
              <div className="note-preview-content">
                {editContent.trim() ? (
                  editContent.split("\n").map((line, idx) => {
                    if (line.startsWith("### ")) {
                      return <h3 key={idx}>{renderLineWithMentions(line.slice(4))}</h3>;
                    }
                    if (line.startsWith("## ")) {
                      return <h2 key={idx}>{renderLineWithMentions(line.slice(3))}</h2>;
                    }
                    if (line.startsWith("# ")) {
                      return <h1 key={idx}>{renderLineWithMentions(line.slice(2))}</h1>;
                    }
                    if (line.startsWith("- ") || line.startsWith("* ")) {
                      return (
                        <li key={idx} style={{ marginLeft: "18px", marginBottom: "4px" }}>
                          {renderLineWithMentions(line.slice(2))}
                        </li>
                      );
                    }
                    if (line.trim() === "") {
                      return <div key={idx} style={{ height: "12px" }} />;
                    }
                    return <p key={idx} style={{ margin: "0 0 8px 0" }}>{renderLineWithMentions(line)}</p>;
                  })
                ) : (
                  <p style={{ color: "var(--jantt-text-muted)", fontStyle: "italic" }}>
                    No content yet. Click Edit to start writing. Type @ to mention people or / to mention tasks.
                  </p>
                )}
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                className="note-editor-textarea"
                value={editContent}
                onChange={(e) => {
                  setEditContent(e.target.value);
                  triggerDebouncedSave({ content: e.target.value, title: editTitle, color: editColor, pinned: editPinned });
                }}
                placeholder="Start typing your note (Markdown supported). Use @name to mention team members, and /task-id to mention tasks..."
                rows={16}
              />
            )}

            {/* ================================================================= */}
            {/* SECTIONED LISTS: ATTACHED TASKS, MENTIONED TASKS & PEOPLE         */}
            {/* ================================================================= */}
            <div className="note-sections-container">
              {/* 1. ATTACHED TASKS SECTION */}
              <div className="note-section-card">
                <div className="note-section-header">
                  <div className="note-section-title-wrap">
                    <Paperclip size={14} style={{ color: "var(--jantt-accent)" }} />
                    <span>Attached Tasks</span>
                    <span className="note-section-badge">{attachedTasks.length}</span>
                  </div>

                  <div style={{ position: "relative" }}>
                    <button
                      type="button"
                      className="note-quick-tool-btn"
                      onClick={() => {
                        setShowAttachPicker(!showAttachPicker);
                        setShowMentionPersonPicker(false);
                        setShowMentionTaskPicker(false);
                        setPickerSearch("");
                      }}
                    >
                      <Plus size={13} />
                      <span>Attach Task</span>
                    </button>
                  </div>
                </div>

                {attachedTasks.length === 0 ? (
                  <div style={{ fontSize: "12px", color: "var(--jantt-text-muted)", fontStyle: "italic", padding: "4px 0" }}>
                    No tasks explicitly attached to this note yet. Click "+ Attach Task" above or mention with /task-id in your note.
                  </div>
                ) : (
                  <div className="note-entity-list">
                    {attachedTasks.map((t) => {
                      const cat = parsedData.categories?.[t.category || ""];
                      const isCompleted = t.status === "completed" || (t.progress ?? 0) >= 1.0;
                      const statusClass = isCompleted
                        ? "is-completed"
                        : t.status === "in-progress"
                        ? "is-in-progress"
                        : t.status === "blocked"
                        ? "is-blocked"
                        : "is-pending";

                      return (
                        <div key={t.id} className="note-task-row">
                          <div className="note-task-info-left">
                            <span
                              style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                background: cat?.color || "var(--jantt-accent)",
                                flexShrink: 0
                              }}
                            />
                            <span className="note-task-id-tag">{t.id}</span>
                            <span className="note-task-label-text">{t.label || t.name || "Task"}</span>
                          </div>

                          <div className="note-task-info-right">
                            <span className={`note-task-status-tag ${statusClass}`}>
                              {t.status || (isCompleted ? "completed" : "pending")}
                            </span>
                            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--jantt-text-muted)" }}>
                              {Math.round((t.progress ?? 0) * 100)}%
                            </span>
                            <button
                              type="button"
                              className="note-detach-btn"
                              onClick={() => handleDetachTask(t.id)}
                              title="Detach task from note"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 2. MENTIONED TASKS SECTION */}
              {mentionedTasks.length > 0 && (
                <div className="note-section-card">
                  <div className="note-section-header">
                    <div className="note-section-title-wrap">
                      <CheckSquare size={14} style={{ color: "#10B981" }} />
                      <span>Mentioned Tasks in Note Text</span>
                      <span className="note-section-badge">{mentionedTasks.length}</span>
                    </div>
                  </div>

                  <div className="note-entity-list">
                    {mentionedTasks.map((t) => {
                      const isCompleted = t.status === "completed" || (t.progress ?? 0) >= 1.0;
                      return (
                        <div key={t.id} className="note-task-row">
                          <div className="note-task-info-left">
                            <span className="note-task-id-tag">{t.id}</span>
                            <span className="note-task-label-text">{t.label || t.name || "Task"}</span>
                          </div>

                          <div className="note-task-info-right">
                            <span className="note-task-status-tag is-in-progress">
                              {t.status || (isCompleted ? "completed" : "pending")}
                            </span>
                            <button
                              type="button"
                              className="note-quick-tool-btn"
                              onClick={() => handleAttachTask(t.id)}
                              title="Pin as attached task"
                              style={{ padding: "2px 8px", fontSize: "11px" }}
                            >
                              <PlusCircle size={12} />
                              <span>Pin to Attached</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. MENTIONED PEOPLE SECTION */}
              {mentionedPeople.length > 0 && (
                <div className="note-section-card">
                  <div className="note-section-header">
                    <div className="note-section-title-wrap">
                      <User size={14} style={{ color: "var(--jantt-accent)" }} />
                      <span>Mentioned Team Members</span>
                      <span className="note-section-badge">{mentionedPeople.length}</span>
                    </div>
                  </div>

                  <div className="note-entity-list">
                    {mentionedPeople.map((p) => {
                      const team = p.teamId ? teamsMap[p.teamId] : undefined;
                      return (
                        <div key={p.id} className="note-person-row">
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span
                              className="note-person-avatar-circle"
                              style={{ background: p.color || "var(--jantt-accent)" }}
                            >
                              {p.name.charAt(0)}
                            </span>
                            <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--jantt-text)" }}>
                              {p.name}
                            </span>
                            {p.role && (
                              <span style={{ fontSize: "11px", color: "var(--jantt-text-muted)" }}>
                                ({p.role})
                              </span>
                            )}
                          </div>

                          {team && (
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 600,
                                padding: "2px 8px",
                                borderRadius: "100px",
                                background: `${team.color || "var(--jantt-accent)"}20`,
                                color: team.color || "var(--jantt-accent)"
                              }}
                            >
                              {team.name}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
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

              const attachedCount = note.task_ids?.length || 0;
              const hasMentions = note.content && /(@[a-zA-Z0-9_.-]+|(?:\/|#)[a-zA-Z0-9_-]+)/.test(note.content);

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

                  {/* Card Badges Row */}
                  {(attachedCount > 0 || hasMentions) && (
                    <div className="note-card-badges-row">
                      {attachedCount > 0 && (
                        <span className="note-card-badge">
                          <Paperclip size={10} />
                          <span>{attachedCount} attached</span>
                        </span>
                      )}
                      {hasMentions && (
                        <span className="note-card-badge" style={{ color: "var(--jantt-accent)" }}>
                          <AtSign size={10} />
                          <span>mentions</span>
                        </span>
                      )}
                    </div>
                  )}

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
