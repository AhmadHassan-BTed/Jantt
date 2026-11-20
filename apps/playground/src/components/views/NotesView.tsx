import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { JanttData, NoteItem, Task, Team } from "@jantt/core";
import type { EffectivePerson } from "../../types";
import { storageService } from "../../services/storage";
import { STORAGE_KEYS } from "../../constants";
import {
  DEFAULT_NOTE_COLOR,
  getCaretTextOffset,
  populateEditorWithContent,
  serializeEditorToMarkdown,
  setCaretTextOffset,
  toText,
  NotesSidebar,
  NoteEditor
} from "./notes";

/** Idle time before typed changes are committed to the plan (and synced). */
const NOTE_SAVE_DEBOUNCE_MS = 350;

type NoteDraftField = "title" | "content" | "color" | "pinned" | "task_ids";
type NotePatch = Partial<Pick<NoteItem, NoteDraftField>>;

interface NotesViewProps {
  parsedData: JanttData;
  /** Must be the guarded plan commit (viewer / pending-login checks + undo snapshot). */
  handleChartCommit: (data: JanttData) => void;
  effectivePeople?: EffectivePerson[];
  teams?: Team[];
  isViewer?: boolean;
  onPromptFork?: () => void;
  activeProjectId?: string;
}

export const NotesView: React.FC<NotesViewProps> = ({
  parsedData,
  handleChartCommit,
  effectivePeople = [],
  teams = [],
  isViewer = false,
  onPromptFork,
  activeProjectId = "default"
}) => {
  const notes: NoteItem[] = useMemo(
    () => (Array.isArray(parsedData.notes) ? parsedData.notes : []).filter((n) => n && typeof n.id === "string" && !n._deleted),
    [parsedData.notes]
  );
  const allTasks: Task[] = useMemo(() => (parsedData.tasks || []).filter((t) => !t._deleted), [parsedData.tasks]);
  const liveTaskIds = useMemo(() => new Set(allTasks.map((t) => t.id)), [allTasks]);
  const teamsMap = useMemo(() => {
    if (Array.isArray(teams)) {
      return Object.fromEntries(teams.map((tm) => [tm.id, tm]));
    }
    return teams || {};
  }, [teams]);

  const storageKey = useMemo(() => {
    return `jantt_active_note_id_${activeProjectId}`;
  }, [activeProjectId]);

  const [activeNoteId, setActiveNoteIdState] = useState<string | null>(() => {
    return storageService.getItem<string>(`jantt_active_note_id_${activeProjectId}`) || null;
  });

  // Re-hydrate activeNoteId when room/project switches
  useEffect(() => {
    const stored = storageService.getItem<string>(storageKey) || null;
    setActiveNoteIdState(stored);
  }, [storageKey]);

  const setActiveNoteId = useCallback((id: string | null) => {
    setActiveNoteIdState(id);
    if (id) {
      storageService.setItem(storageKey, id);
    } else {
      storageService.removeItem(storageKey);
    }
  }, [storageKey]);

  // Validate that if activeNoteId is set, it actually exists in notes of the current room
  useEffect(() => {
    if (activeNoteId && !notes.some((n) => n.id === activeNoteId)) {
      setActiveNoteId(null);
    }
  }, [notes, activeNoteId, setActiveNoteId]);

  const [searchQuery, setSearchQuery] = useState(() => {
    const saved = storageService.getItem<{ searchQuery?: string }>(STORAGE_KEYS.NOTES_VIEW_STATE);
    return typeof saved?.searchQuery === "string" ? saved.searchQuery : "";
  });
  const [selectedColor, setSelectedColor] = useState<string>(() => {
    const saved = storageService.getItem<{ selectedColor?: string }>(STORAGE_KEYS.NOTES_VIEW_STATE);
    return typeof saved?.selectedColor === "string" && saved.selectedColor ? saved.selectedColor : "all";
  });

  // Local state for the active note being edited
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editColor, setEditColor] = useState(DEFAULT_NOTE_COLOR);
  const [editPinned, setEditPinned] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(() => {
    const saved = storageService.getItem<{ isPreviewMode?: boolean }>(STORAGE_KEYS.NOTES_VIEW_STATE);
    return Boolean(saved?.isPreviewMode);
  });
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");

  useEffect(() => {
    storageService.setItem(STORAGE_KEYS.NOTES_VIEW_STATE, {
      searchQuery,
      selectedColor,
      isPreviewMode
    });
  }, [searchQuery, selectedColor, isPreviewMode]);

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeNoteId) || null,
    [notes, activeNoteId]
  );

  const debounceTimerRef = useRef<number | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const contentEditableRef = useRef<HTMLDivElement>(null);
  const isNewlyCreatedRef = useRef(false);
  /** Id of the note whose content is currently loaded into the editor. */
  const hydratedNoteIdRef = useRef<string | null>(null);
  /** Unsaved local edits: only the fields the user actually changed, for one note. */
  const pendingRef = useRef<{ noteId: string; patch: NotePatch } | null>(null);

  // Latest-value refs: deferred commits (debounce timer, unmount flush) must never
  // write back a stale plan snapshot or call a stale commit function.
  const latestDataRef = useRef(parsedData);
  latestDataRef.current = parsedData;
  const commitRef = useRef(handleChartCommit);
  commitRef.current = handleChartCommit;
  const viewerRef = useRef({ isViewer, onPromptFork });
  viewerRef.current = { isViewer, onPromptFork };
  const latestEditRef = useRef({ editTitle, editContent, editColor, editPinned, isPreviewMode });
  latestEditRef.current = { editTitle, editContent, editColor, editPinned, isPreviewMode };
  const mentionSourcesRef = useRef({ effectivePeople, allTasks });
  mentionSourcesRef.current = { effectivePeople, allTasks };

  const populateEditor = useCallback((content: string, preserveCaret = false) => {
    const el = contentEditableRef.current;
    if (!el) return;
    const caret = preserveCaret && document.activeElement === el ? getCaretTextOffset(el) : null;
    const { effectivePeople: people, allTasks: tasks } = mentionSourcesRef.current;
    populateEditorWithContent(el, content, people, tasks);
    if (caret !== null) setCaretTextOffset(el, caret);
  }, []);

  /**
   * Commits `next` and makes it the base for any further commit in the same tick
   * (e.g. a flushed edit followed by "New note"), so the second commit cannot drop the first.
   */
  const commitPlan = useCallback((next: JanttData) => {
    latestDataRef.current = next;
    commitRef.current(next);
  }, []);

  /** Applies a field patch to the latest plan and commits it (stable identity). */
  const commitNoteChanges = useCallback((noteId: string, updates: NotePatch) => {
    if (viewerRef.current.isViewer) {
      viewerRef.current.onPromptFork?.();
      return;
    }
    const data = latestDataRef.current;
    const currentNotes = Array.isArray(data.notes) ? data.notes : [];
    // The note was deleted (e.g. by a collaborator) or the plan was switched: never
    // resurrect it past its tombstone or write it into another project.
    if (!currentNotes.some((n) => n && n.id === noteId)) return;
    const now = new Date().toISOString();
    const updatedNotes = currentNotes.map((n) => (n && n.id === noteId ? { ...n, ...updates, updatedAt: now } : n));
    commitPlan({ ...data, notes: updatedNotes });
  }, [commitPlan]);

  const flushPendingSave = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) commitNoteChanges(pending.noteId, pending.patch);
    setSaveStatus("saved");
  }, [commitNoteChanges]);

  const scheduleSave = useCallback(
    (noteId: string, patch: NotePatch) => {
      const prev = pendingRef.current;
      if (prev && prev.noteId !== noteId) flushPendingSave();
      pendingRef.current = {
        noteId,
        patch: prev && prev.noteId === noteId ? { ...prev.patch, ...patch } : patch
      };
      setSaveStatus("saving");
      if (debounceTimerRef.current !== null) window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(flushPendingSave, NOTE_SAVE_DEBOUNCE_MS);
    },
    [flushPendingSave]
  );

  // Flush pending edits when the view unmounts (e.g. switching to Kanban).
  useEffect(() => flushPendingSave, [flushPendingSave]);

  // Adopt changes made elsewhere (collaborators, JSON editor, undo) to the open note,
  // field by field, unless the user has unsaved edits to that same field.
  // Declared before the hydration effect so a note switch is handled by hydration alone.
  useEffect(() => {
    if (!activeNote || hydratedNoteIdRef.current !== activeNote.id) return;
    const pending = pendingRef.current?.noteId === activeNote.id ? pendingRef.current.patch : {};
    const local = latestEditRef.current;

    const remoteTitle = toText(activeNote.title);
    if (!("title" in pending) && remoteTitle !== local.editTitle) setEditTitle(remoteTitle);
    const remoteColor = toText(activeNote.color) || DEFAULT_NOTE_COLOR;
    if (!("color" in pending) && remoteColor !== local.editColor) setEditColor(remoteColor);
    const remotePinned = Boolean(activeNote.pinned);
    if (!("pinned" in pending) && remotePinned !== local.editPinned) setEditPinned(remotePinned);

    const remoteContent = toText(activeNote.content);
    if (!("content" in pending) && remoteContent !== local.editContent) {
      setEditContent(remoteContent);
      if (!local.isPreviewMode) populateEditor(remoteContent, true);
    }
  }, [activeNote, populateEditor]);

  // Load the selected note into the editor: on selection, on mount (restored selection)
  // and when a stored selection's note arrives after the plan finishes loading.
  const activeNoteKey = activeNote?.id ?? null;
  useEffect(() => {
    if (!activeNote) {
      hydratedNoteIdRef.current = null;
      return;
    }
    hydratedNoteIdRef.current = activeNote.id;
    const content = toText(activeNote.content);
    setEditTitle(toText(activeNote.title));
    setEditContent(content);
    setEditColor(toText(activeNote.color) || DEFAULT_NOTE_COLOR);
    setEditPinned(Boolean(activeNote.pinned));
    setSaveStatus(pendingRef.current ? "saving" : "saved");
    // Keep latestEditRef coherent for effects running before the next render.
    latestEditRef.current = { ...latestEditRef.current, editContent: content };
    if (!latestEditRef.current.isPreviewMode) populateEditor(content);

    if (isNewlyCreatedRef.current) {
      isNewlyCreatedRef.current = false;
      window.setTimeout(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      }, 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNoteKey]);

  // Returning from Preview to Edit mode: the editor DOM was unmounted, rebuild it from
  // the latest local text. Only a real true -> false transition counts (never on mount).
  const wasPreviewRef = useRef(isPreviewMode);
  useEffect(() => {
    const wasPreview = wasPreviewRef.current;
    wasPreviewRef.current = isPreviewMode;
    if (wasPreview && !isPreviewMode) populateEditor(latestEditRef.current.editContent);
  }, [isPreviewMode, populateEditor]);

  const handleSelectNote = useCallback(
    (id: string | null) => {
      flushPendingSave();
      setActiveNoteId(id);
    },
    [flushPendingSave, setActiveNoteId]
  );

  const handleBackToGallery = () => handleSelectNote(null);

  // Create a fresh note
  const handleCreateNote = () => {
    if (isViewer) {
      onPromptFork?.();
      return;
    }
    flushPendingSave();
    const newId = `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const newNote: NoteItem = {
      id: newId,
      title: "New Project Note",
      content: "",
      color: DEFAULT_NOTE_COLOR,
      pinned: false,
      task_ids: [],
      createdAt: now,
      updatedAt: now
    };

    isNewlyCreatedRef.current = true;
    const data = latestDataRef.current;
    commitPlan({
      ...data,
      notes: [newNote, ...(Array.isArray(data.notes) ? data.notes : [])]
    });
    setActiveNoteId(newId);
  };

  // Delete note (with a tombstone so sync does not resurrect it)
  const handleDeleteNote = (noteId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isViewer) {
      onPromptFork?.();
      return;
    }
    const target = notes.find((n) => n.id === noteId);
    const label = toText(target?.title).trim() || "this note";
    if (!window.confirm(`Delete "${label}" from the project?`)) return;

    if (pendingRef.current?.noteId === noteId) {
      if (debounceTimerRef.current !== null) window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      pendingRef.current = null;
      setSaveStatus("saved");
    }

    const data = latestDataRef.current;
    const deletedAt = new Date().toISOString();
    commitPlan({
      ...data,
      meta: {
        ...data.meta,
        tombstones: {
          ...(data.meta?.tombstones || {}),
          [noteId]: { deletedAt, entityType: "note" }
        }
      },
      notes: (Array.isArray(data.notes) ? data.notes : []).filter((n) => n.id !== noteId)
    });

    if (activeNoteId === noteId) {
      setActiveNoteId(null);
    }
  };

  const currentTaskIds = (): string[] => {
    const ids = activeNote?.task_ids;
    return Array.isArray(ids) ? ids : [];
  };

  // Attach task to note
  const handleAttachTask = (taskId: string) => {
    if (!activeNoteId || !activeNote) return;
    const currentAttached = currentTaskIds();
    if (!currentAttached.includes(taskId)) {
      commitNoteChanges(activeNoteId, { task_ids: [...currentAttached, taskId] });
    }
  };

  // Detach task from note
  const handleDetachTask = (taskId: string) => {
    if (!activeNoteId || !activeNote) return;
    commitNoteChanges(activeNoteId, { task_ids: currentTaskIds().filter((id) => id !== taskId) });
  };

  // Sync current contenteditable text back to state & schedule a save of the body only
  const handleContentChange = useCallback(() => {
    const el = contentEditableRef.current;
    if (!el || !activeNoteId) return;
    const serialized = serializeEditorToMarkdown(el);
    setEditContent(serialized);
    scheduleSave(activeNoteId, { content: serialized });
  }, [activeNoteId, scheduleSave]);

  const handleTitleChange = (newTitle: string) => {
    if (!activeNoteId) return;
    setEditTitle(newTitle);
    scheduleSave(activeNoteId, { title: newTitle });
  };

  const handleColorChange = (newColor: string) => {
    if (!activeNoteId) return;
    setEditColor(newColor);
    scheduleSave(activeNoteId, { color: newColor });
  };

  const handlePinnedToggle = (newPinned: boolean) => {
    if (!activeNoteId) return;
    setEditPinned(newPinned);
    scheduleSave(activeNoteId, { pinned: newPinned });
  };

  return (
    <div className={`notes-view-container ${activeNote ? "has-active-note" : ""}`}>
      {/* 1. Left Sidebar with notes list & search */}
      <NotesSidebar
        notes={notes}
        activeNoteId={activeNoteId}
        onSelectNote={handleSelectNote}
        onCreateNote={handleCreateNote}
        onDeleteNote={handleDeleteNote}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedColor={selectedColor}
        onSelectColor={setSelectedColor}
        isViewer={isViewer}
        liveTaskIds={liveTaskIds}
      />

      {/* 2. Main Editor Surface */}
      {activeNote ? (
        <NoteEditor
          activeNote={activeNote}
          editTitle={editTitle}
          setEditTitle={handleTitleChange}
          editColor={editColor}
          setEditColor={handleColorChange}
          editPinned={editPinned}
          setEditPinned={handlePinnedToggle}
          editContent={editContent}
          saveStatus={saveStatus}
          isPreviewMode={isPreviewMode}
          setIsPreviewMode={setIsPreviewMode}
          contentEditableRef={contentEditableRef}
          titleInputRef={titleInputRef}
          effectivePeople={effectivePeople}
          allTasks={allTasks}
          teamsMap={teamsMap}
          onBackToGallery={handleBackToGallery}
          onDeleteNote={handleDeleteNote}
          onContentChange={handleContentChange}
          onAttachTask={handleAttachTask}
          onUnlinkTask={handleDetachTask}
          isViewer={isViewer}
          onPromptFork={onPromptFork}
        />
      ) : (
        <div className="note-editor-empty-state">
          <p className="note-editor-empty-title">Select or create a note</p>
          <p className="note-editor-empty-sub">
            {isViewer
              ? "This shared room is read-only. Select a note to read it, or make a local copy to edit."
              : "Capture project meeting summaries, team action items, and link roadmap tasks directly in your notes."}
          </p>
          <button
            type="button"
            className="notes-empty-create-btn"
            onClick={isViewer ? onPromptFork : handleCreateNote}
          >
            {isViewer ? "Make a Local Copy" : "Create New Note"}
          </button>
        </div>
      )}
    </div>
  );
};
