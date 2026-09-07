import React, { useState } from "react";
import {
  ArrowLeft,
  Pin,
  Trash2,
  Eye,
  Edit3,
  CheckCircle2,
  RefreshCw,
  User,
  CheckSquare
} from "lucide-react";
import type { Task, Team, NoteItem } from "@jantt/core";
import type { EffectivePerson } from "../../../types";
import { NOTE_PALETTE } from "./note-markdown";
import { AttachedTasksDrawer } from "./AttachedTasksDrawer";
import { useNoteMentionEngine } from "./useNoteMentionEngine";

export interface NoteEditorProps {
  activeNote: NoteItem;
  editTitle: string;
  setEditTitle: (t: string) => void;
  editColor: string;
  setEditColor: (c: string) => void;
  editPinned: boolean;
  setEditPinned: (p: boolean) => void;
  editContent: string;
  saveStatus: "saved" | "saving";
  isPreviewMode: boolean;
  setIsPreviewMode: (p: boolean) => void;
  contentEditableRef: React.RefObject<HTMLDivElement>;
  titleInputRef: React.RefObject<HTMLInputElement>;
  effectivePeople: EffectivePerson[];
  allTasks: Task[];
  teamsMap: Record<string, Team>;
  onBackToGallery: () => void;
  onDeleteNote: (id: string) => void;
  onContentChange: () => void;
  onAttachTask: (taskId: string) => void;
  onUnlinkTask: (taskId: string) => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  activeNote,
  editTitle,
  setEditTitle,
  editColor,
  setEditColor,
  editPinned,
  setEditPinned,
  editContent,
  saveStatus,
  isPreviewMode,
  setIsPreviewMode,
  contentEditableRef,
  titleInputRef,
  effectivePeople,
  allTasks,
  teamsMap,
  onBackToGallery,
  onDeleteNote,
  onContentChange,
  onAttachTask,
  onUnlinkTask
}) => {
  const [showColorPicker, setShowColorPicker] = useState(false);

  const {
    mentionPopup,
    setMentionPopup,
    autocompletePeople,
    autocompleteTasks,
    insertPersonPill,
    insertTaskPill,
    handleEditorInput,
    handleEditorKeyDown
  } = useNoteMentionEngine(contentEditableRef, effectivePeople, allTasks, onContentChange);

  return (
    <div className="note-editor-pane">
      {/* Editor Top Navigation Bar */}
      <div className="note-editor-topbar">
        <div className="note-topbar-left">
          <button
            type="button"
            className="note-back-btn"
            onClick={onBackToGallery}
            title="Back to Notes Overview"
          >
            <ArrowLeft size={16} />
            <span>All Notes</span>
          </button>
          <div className="note-save-indicator">
            {saveStatus === "saved" ? (
              <span className="save-tag is-saved">
                <CheckCircle2 size={12} />
                <span>Saved</span>
              </span>
            ) : (
              <span className="save-tag is-saving">
                <RefreshCw size={12} className="spin-icon" />
                <span>Saving...</span>
              </span>
            )}
          </div>
        </div>

        <div className="note-topbar-actions">
          <button
            type="button"
            className={`note-action-btn ${editPinned ? "is-pinned" : ""}`}
            onClick={() => setEditPinned(!editPinned)}
            title={editPinned ? "Unpin note" : "Pin note to top"}
          >
            <Pin size={15} />
          </button>

          {/* Color Palette Popover */}
          <div className="note-color-picker-anchor">
            <button
              type="button"
              className="note-action-btn"
              onClick={() => setShowColorPicker(!showColorPicker)}
              title="Change note color theme"
            >
              <span className="note-color-swatch-indicator" style={{ backgroundColor: editColor }} />
            </button>

            {showColorPicker && (
              <div className="note-color-picker-dropdown">
                {NOTE_PALETTE.map((pal) => (
                  <button
                    key={pal.id}
                    type="button"
                    className={`note-picker-swatch ${editColor === pal.id ? "is-selected" : ""}`}
                    style={{ backgroundColor: pal.bg }}
                    onClick={() => {
                      setEditColor(pal.id);
                      setShowColorPicker(false);
                    }}
                    title={pal.label}
                  />
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className={`note-action-btn ${isPreviewMode ? "is-active" : ""}`}
            onClick={() => setIsPreviewMode(!isPreviewMode)}
            title={isPreviewMode ? "Switch to Edit Mode" : "Preview Markdown"}
          >
            {isPreviewMode ? <Edit3 size={15} /> : <Eye size={15} />}
          </button>

          <button
            type="button"
            className="note-action-btn is-danger"
            onClick={() => onDeleteNote(activeNote.id)}
            title="Delete this note"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Editor Document Surface */}
      <div className="note-editor-doc-scroll">
        <div className="note-editor-sheet">
          {/* Note Title Input */}
          <input
            ref={titleInputRef}
            type="text"
            className="note-title-input"
            placeholder="Note title..."
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />

          {/* Rich ContentEditable Body or Markdown Preview */}
          {isPreviewMode ? (
            <div className="note-preview-body">
              {editContent ? (
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{editContent}</div>
              ) : (
                <span className="note-preview-empty">No content in this note.</span>
              )}
            </div>
          ) : (
            <div
              ref={contentEditableRef}
              className="note-contenteditable-surface"
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              onKeyDown={handleEditorKeyDown}
              data-placeholder="Start typing your note... Use @ to mention team members and / to attach tasks."
            />
          )}

          {/* Attached Tasks Drawer */}
          <AttachedTasksDrawer
            attachedTaskIds={activeNote.task_ids || []}
            allTasks={allTasks}
            teamsMap={teamsMap}
            onAttachTask={onAttachTask}
            onUnlinkTask={onUnlinkTask}
          />
        </div>
      </div>

      {/* Floating Autocomplete Popover */}
      {mentionPopup.isOpen && (
        <div
          className="note-mention-dropdown"
          style={{
            top: `${mentionPopup.coords.top}px`,
            left: `${mentionPopup.coords.left}px`
          }}
        >
          <div className="note-dropdown-header">
            {mentionPopup.type === "person" ? (
              <span>Mention Team Member</span>
            ) : (
              <span>Link Roadmap Task</span>
            )}
          </div>

          <div className="note-dropdown-list">
            {mentionPopup.type === "person" ? (
              autocompletePeople.length === 0 ? (
                <div className="note-dropdown-empty">No matching team members</div>
              ) : (
                autocompletePeople.map((person, idx) => (
                  <button
                    key={person.id}
                    type="button"
                    className={`note-dropdown-item ${idx === mentionPopup.selectedIndex ? "is-selected" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertPersonPill(person);
                    }}
                    onMouseEnter={() => setMentionPopup((prev) => ({ ...prev, selectedIndex: idx }))}
                  >
                    <User size={14} className="note-dropdown-icon" />
                    <div className="note-dropdown-info">
                      <span className="note-dropdown-name">{person.name}</span>
                      {person.role && <span className="note-dropdown-role">{person.role}</span>}
                    </div>
                  </button>
                ))
              )
            ) : autocompleteTasks.length === 0 ? (
              <div className="note-dropdown-empty">No matching tasks</div>
            ) : (
              autocompleteTasks.map((task, idx) => (
                <button
                  key={task.id}
                  type="button"
                  className={`note-dropdown-item ${idx === mentionPopup.selectedIndex ? "is-selected" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertTaskPill(task);
                  }}
                  onMouseEnter={() => setMentionPopup((prev) => ({ ...prev, selectedIndex: idx }))}
                >
                  <CheckSquare size={14} className="note-dropdown-icon" />
                  <div className="note-dropdown-info">
                    <span className="note-dropdown-id">{task.id}</span>
                    <span className="note-dropdown-name">{task.label || task.name || task.id}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
