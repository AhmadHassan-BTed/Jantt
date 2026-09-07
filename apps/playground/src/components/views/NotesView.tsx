import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { JanttData, NoteItem, Task, Team } from "@jantt/core";
import type { EffectivePerson } from "../../types";
import { storageService } from "../../services/storage";
import {
  populateEditorWithContent,
  serializeEditorToMarkdown,
  NotesSidebar,
  NoteEditor
} from "./notes";

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
    return storageService.getItem<string>(STORAGE_KEY_ACTIVE_NOTE) || null;
  });

  const setActiveNoteId = useCallback((id: string | null) => {
    setActiveNoteIdState(id);
    if (id) {
      storageService.setItem(STORAGE_KEY_ACTIVE_NOTE, id);
    } else {
      storageService.removeItem(STORAGE_KEY_ACTIVE_NOTE);
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

  const debounceTimerRef = useRef<number | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const contentEditableRef = useRef<HTMLDivElement>(null);
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

      if (contentEditableRef.current) {
        populateEditorWithContent(
          contentEditableRef.current,
          activeNote.content || "",
          effectivePeople,
          allTasks
        );
      }

      if (isNewlyCreatedRef.current) {
        isNewlyCreatedRef.current = false;
        setTimeout(() => {
          titleInputRef.current?.focus();
          titleInputRef.current?.select();
        }, 50);
      }
    }
  }, [activeNoteId]);

  // When switching from Preview back to Edit mode, rehydrate editor
  useEffect(() => {
    if (!isPreviewMode && contentEditableRef.current && activeNote) {
      populateEditorWithContent(
        contentEditableRef.current,
        editContent,
        effectivePeople,
        allTasks
      );
    }
  }, [isPreviewMode]);

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
    if (!currentAttached.includes(taskId)) {
      const nextAttached = [...currentAttached, taskId];
      commitNoteChanges(activeNoteId, { task_ids: nextAttached });
    }
  };

  // Detach task from note
  const handleDetachTask = (taskId: string) => {
    if (!activeNoteId || !activeNote) return;
    const currentAttached = activeNote.task_ids || [];
    const nextAttached = currentAttached.filter((id) => id !== taskId);
    commitNoteChanges(activeNoteId, { task_ids: nextAttached });
  };

  // Sync current contenteditable text back to state & trigger debounced save
  const handleContentChange = useCallback(() => {
    if (!contentEditableRef.current) return;
    const serialized = serializeEditorToMarkdown(contentEditableRef.current);
    setEditContent(serialized);
    triggerDebouncedSave({ content: serialized, title: editTitle, color: editColor, pinned: editPinned });
  }, [triggerDebouncedSave, editTitle, editColor, editPinned]);

  const handleTitleChange = (newTitle: string) => {
    setEditTitle(newTitle);
    triggerDebouncedSave({ title: newTitle, content: editContent, color: editColor, pinned: editPinned });
  };

  const handleColorChange = (newColor: string) => {
    setEditColor(newColor);
    triggerDebouncedSave({ color: newColor, title: editTitle, content: editContent, pinned: editPinned });
  };

  const handlePinnedToggle = (newPinned: boolean) => {
    setEditPinned(newPinned);
    triggerDebouncedSave({ pinned: newPinned, title: editTitle, content: editContent, color: editColor });
  };

  return (
    <div className="notes-view-container">
      {/* 1. Left Sidebar with notes list & search */}
      <NotesSidebar
        notes={notes}
        activeNoteId={activeNoteId}
        onSelectNote={setActiveNoteId}
        onCreateNote={handleCreateNote}
        onDeleteNote={handleDeleteNote}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedColor={selectedColor}
        onSelectColor={setSelectedColor}
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
        />
      ) : (
        <div className="note-editor-empty-state">
          <p className="note-editor-empty-title">Select or create a note</p>
          <p className="note-editor-empty-sub">
            Capture project meeting summaries, team action items, and link roadmap tasks directly in your notes.
          </p>
          <button
            type="button"
            className="notes-empty-create-btn"
            onClick={handleCreateNote}
          >
            Create New Note
          </button>
        </div>
      )}
    </div>
  );
};
