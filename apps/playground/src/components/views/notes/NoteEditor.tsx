import "./note-editor.css";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Pin,
  Trash2,
  Eye,
  Edit3,
  CheckCircle2,
  RefreshCw,
  User,
  CheckSquare,
  Clock,
  CalendarClock
} from "lucide-react";
import {
  sanitizeCssColor,
  formatTimestampWithFormat,
  splitTimestampToLocalInputs,
  combineLocalInputsToISO,
  type Task,
  type Team,
  type NoteItem,
  type TimeFormat
} from "@jantt/core";
import type { EffectivePerson } from "../../../types";
import {
  DEFAULT_NOTE_COLOR,
  NOTE_PALETTE,
  createMentionLookup,
  getTaskTitle,
  insertPlainTextAt,
  parseNoteMarkdown,
  toText,
  type NoteBlock,
  type NoteInline
} from "./note-markdown";
import { AttachedTasksDrawer } from "./AttachedTasksDrawer";
import { useNoteMentionEngine, usePopoverDismiss } from "./useNoteMentionEngine";

export interface NoteEditorProps {
  activeNote: NoteItem;
  editTitle: string;
  setEditTitle: (t: string) => void;
  editColor: string;
  setEditColor: (c: string) => void;
  editPinned: boolean;
  setEditPinned: (p: boolean) => void;
  editTimestamp?: string;
  setEditTimestamp?: (ts: string) => void;
  timeFormat?: TimeFormat;
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
  isViewer?: boolean;
  onPromptFork?: () => void;
}

function renderInlines(inlines: NoteInline[]): React.ReactNode[] {
  return inlines.map((node, i) => {
    switch (node.kind) {
      case "text":
        return <React.Fragment key={i}>{node.text}</React.Fragment>;
      case "strong":
        return <strong key={i}>{renderInlines(node.children)}</strong>;
      case "em":
        return <em key={i}>{renderInlines(node.children)}</em>;
      case "code":
        return <code key={i}>{node.text}</code>;
      case "link":
        return (
          <a key={i} href={node.href} target="_blank" rel="noopener noreferrer">
            {renderInlines(node.children)}
          </a>
        );
      case "person":
        return (
          <span key={i} className="note-mention-pill is-person">
            <User size={11} aria-hidden="true" />
            <span className="note-pill-text">@{node.label}</span>
          </span>
        );
      case "task":
        return (
          <span key={i} className="note-mention-pill is-task">
            <CheckSquare size={11} aria-hidden="true" />
            <span className="note-pill-text">{node.id}: {node.label}</span>
          </span>
        );
      default:
        return null;
    }
  });
}

function renderBlock(block: NoteBlock, i: number): React.ReactNode {
  switch (block.kind) {
    case "heading": {
      const Tag = (`h${block.level}` as unknown) as "h1";
      return <Tag key={i} style={{ margin: "0.6em 0 0.3em" }}>{renderInlines(block.inlines)}</Tag>;
    }
    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag key={i} style={{ margin: "0.3em 0", paddingLeft: "1.4em" }}>
          {block.items.map((item, j) => (
            <li key={j}>{renderInlines(item)}</li>
          ))}
        </ListTag>
      );
    }
    case "quote":
      return (
        <blockquote
          key={i}
          style={{ margin: "0.3em 0", paddingLeft: "0.8em", borderLeft: "3px solid var(--jantt-border-strong, #475569)", color: "var(--jantt-text-muted)" }}
        >
          {renderInlines(block.inlines)}
        </blockquote>
      );
    case "rule":
      return <hr key={i} style={{ border: 0, borderTop: "1px solid var(--jantt-border)", margin: "0.8em 0" }} />;
    case "blank":
      return <div key={i} style={{ height: "0.8em" }} aria-hidden="true" />;
    default:
      return <p key={i} style={{ margin: 0 }}>{renderInlines(block.inlines)}</p>;
  }
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  activeNote,
  editTitle,
  setEditTitle,
  editColor,
  setEditColor,
  editPinned,
  setEditPinned,
  editTimestamp = "",
  setEditTimestamp,
  timeFormat = "12h",
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
  onUnlinkTask,
  isViewer = false,
  onPromptFork
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    const revealFocus = () => {
      frame = 0;
      const scroller = scrollRef.current;
      const active = document.activeElement;
      if (!scroller || !(active instanceof HTMLElement) || !scroller.contains(active)) return;
      if (!active.matches("input, textarea, [contenteditable=true]")) return;
      const bounds = scroller.getBoundingClientRect();
      const top = Math.max(viewport.offsetTop, bounds.top) + 8;
      const bottom = Math.min(viewport.offsetTop + viewport.height, bounds.bottom) - 8;
      let rect = active.getBoundingClientRect();
      if (active.isContentEditable) {
        const selection = window.getSelection();
        if (selection?.rangeCount) {
          const range = selection.getRangeAt(0).cloneRange();
          range.collapse(false);
          const caret = range.getClientRects()[0];
          if (caret) rect = caret;
        }
      }
      if (rect.top < top || rect.bottom > bottom) {
        scroller.scrollTop += active.classList.contains("note-picker-input") || rect.top < top || rect.height > bottom - top
          ? rect.top - top : rect.bottom - bottom;
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(revealFocus); };
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
    };
  }, []);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showTimestampEditor, setShowTimestampEditor] = useState(false);
  const colorAnchorRef = useRef<HTMLDivElement>(null);
  const colorTriggerRef = useRef<HTMLButtonElement>(null);
  usePopoverDismiss(showColorPicker, () => setShowColorPicker(false), colorAnchorRef, colorTriggerRef);

  useEffect(() => {
    setShowTimestampEditor(false);
  }, [activeNote.id]);

  const idBase = useId();
  const listboxId = `${idBase}-mentions`;
  const optionId = (idx: number) => `${idBase}-mention-${idx}`;

  const {
    mentionPopup,
    setMentionPopup,
    autocompletePeople,
    autocompleteTasks,
    insertPersonPill,
    insertTaskPill,
    handleEditorInput,
    handleEditorKeyDown,
    closeMentionPopup
  } = useNoteMentionEngine(contentEditableRef, effectivePeople, allTasks, onContentChange);

  const isMentionOpen = !isViewer && mentionPopup.isOpen;
  const mentionCount = mentionPopup.type === "person" ? autocompletePeople.length : autocompleteTasks.length;
  const activeOptionId =
    isMentionOpen && mentionCount > 0 ? optionId(Math.min(mentionPopup.selectedIndex, mentionCount - 1)) : undefined;

  // Keep the keyboard-highlighted suggestion visible inside the scrolling list.
  useEffect(() => {
    if (activeOptionId) document.getElementById(activeOptionId)?.scrollIntoView({ block: "nearest" });
  }, [activeOptionId]);

  // Leaving edit mode (preview / viewer) must not leave a dangling popup behind.
  useEffect(() => {
    if (isPreviewMode || isViewer) closeMentionPopup();
  }, [isPreviewMode, isViewer, closeMentionPopup]);

  // Paste and drop insert plain text only: foreign HTML (remote images, styled markup) never
  // enters the editor DOM, so what is shown is exactly what gets saved.
  const insertPlainText = (text: string, range?: Range | null) => {
    const editorEl = contentEditableRef.current;
    if (!editorEl || !insertPlainTextAt(editorEl, text, range)) return;
    closeMentionPopup();
    onContentChange();
  };

  const handleInsertInlineTimestamp = () => {
    const editorEl = contentEditableRef.current;
    if (!editorEl || isViewer || isPreviewMode) return;
    const stamp = `[${formatTimestampWithFormat(new Date().toISOString(), timeFormat, true)}] `;
    const sel = window.getSelection();
    const hasRangeInEditor = Boolean(
      sel && sel.rangeCount > 0 && editorEl.contains(sel.getRangeAt(0).commonAncestorContainer)
    );
    if (!hasRangeInEditor) {
      editorEl.focus();
      const range = document.createRange();
      range.selectNodeContents(editorEl);
      range.collapse(false);
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    const existing = toText(editContent);
    const prefix = !hasRangeInEditor && existing.trim().length > 0 && !existing.endsWith("\n") ? "\n" : "";
    insertPlainText(`${prefix}${stamp}`);
  };

  const primaryTimestampIso = editTimestamp || activeNote.createdAt || activeNote.updatedAt;
  const primaryTimestampLabel = formatTimestampWithFormat(primaryTimestampIso, timeFormat, true);
  const createdTimestampLabel = activeNote.createdAt ? formatTimestampWithFormat(activeNote.createdAt, timeFormat, true) : "";
  const updatedTimestampLabel = activeNote.updatedAt ? formatTimestampWithFormat(activeNote.updatedAt, timeFormat, true) : "";
  const timestampInputs = useMemo(
    () => splitTimestampToLocalInputs(editTimestamp || activeNote.createdAt),
    [editTimestamp, activeNote.createdAt]
  );

  const handleTimestampInputUpdate = (nextDate: string, nextTime: string) => {
    if (!setEditTimestamp || isViewer) return;
    const iso = combineLocalInputsToISO(nextDate, nextTime);
    setEditTimestamp(iso);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    insertPlainText(e.clipboardData.getData("text/plain"));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.dataTransfer.getData("text/plain");
    if (!text) return; // files and other non-text payloads are ignored
    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    let range: Range | null = null;
    if (typeof doc.caretRangeFromPoint === "function") {
      range = doc.caretRangeFromPoint(e.clientX, e.clientY);
    } else if (typeof doc.caretPositionFromPoint === "function") {
      const pos = doc.caretPositionFromPoint(e.clientX, e.clientY);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }
    insertPlainText(text, range);
  };

  const previewBlocks = useMemo(
    () => (isPreviewMode ? parseNoteMarkdown(editContent, createMentionLookup(effectivePeople, allTasks)) : []),
    [isPreviewMode, editContent, effectivePeople, allTasks]
  );

  return (
    <div className="note-editor-pane">
      {/* Editor Top Navigation Bar */}
      <div className="note-editor-topbar">
        <div className="note-topbar-left">
          <button
            type="button"
            className="note-back-btn"
            onClick={onBackToGallery}
            aria-label="All notes"
            title="Back to Notes Overview"
          >
            <ArrowLeft size={16} />
            <span>All Notes</span>
          </button>
          <div className="note-save-indicator" aria-live="polite">
            {isViewer ? (
              <button
                type="button"
                className="save-tag is-viewer"
                onClick={() => onPromptFork?.()}
                title="This shared note is read-only. Click to make an editable local copy."
              >
                <Eye size={12} />
                <span>Read-only · Make a copy</span>
              </button>
            ) : saveStatus === "saved" ? (
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
          {!isViewer && (
            <button
              type="button"
              className="note-stamp-btn"
              disabled={isPreviewMode}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleInsertInlineTimestamp}
              aria-label="Insert current timestamp into note body"
              title={isPreviewMode ? "Switch to editing to insert a timestamp" : "Insert current date & time stamp at cursor"}
            >
              <Clock size={13} />
              <span>Timestamp</span>
            </button>
          )}

          <button
            type="button"
            className={`note-action-btn ${editPinned ? "is-pinned" : ""}`}
            onClick={() => setEditPinned(!editPinned)}
            disabled={isViewer}
            aria-pressed={editPinned}
            aria-label={editPinned ? "Unpin note" : "Pin note to top"}
            title={isViewer ? (editPinned ? "Pinned (read-only)" : "Not pinned (read-only)") : editPinned ? "Unpin note" : "Pin note to top"}
          >
            <Pin size={15} />
          </button>

          {/* Color Palette Popover */}
          <div className="note-color-picker-anchor" ref={colorAnchorRef}>
            <button
              ref={colorTriggerRef}
              type="button"
              className="note-action-btn"
              onClick={() => setShowColorPicker((open) => !open)}
              disabled={isViewer}
              aria-haspopup="true"
              aria-expanded={showColorPicker}
              aria-label="Change note color"
              title={isViewer ? "Note color (read-only)" : "Change note color"}
            >
              <span className="note-color-swatch-indicator" style={{ backgroundColor: sanitizeCssColor(editColor, DEFAULT_NOTE_COLOR) }} />
            </button>

            {!isViewer && showColorPicker && (
              <div className="note-color-picker-dropdown" role="group" aria-label="Note color">
                {NOTE_PALETTE.map((pal) => (
                  <button
                    key={pal.id}
                    type="button"
                    className={`note-picker-swatch ${editColor === pal.id ? "is-selected" : ""}`}
                    style={{ backgroundColor: pal.bg }}
                    aria-pressed={editColor === pal.id}
                    aria-label={pal.label}
                    onClick={() => {
                      setEditColor(pal.id);
                      setShowColorPicker(false);
                      colorTriggerRef.current?.focus();
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
            aria-pressed={isPreviewMode}
            aria-label={isPreviewMode ? "Back to editing" : "Preview formatted note"}
            title={isPreviewMode ? "Back to editing" : "Preview formatted note (Markdown)"}
          >
            {isPreviewMode ? <Edit3 size={15} /> : <Eye size={15} />}
          </button>

          {!isViewer && (
            <button
              type="button"
              className="note-action-btn is-danger"
              onClick={() => onDeleteNote(activeNote.id)}
              aria-label="Delete this note"
              title="Delete this note"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Editor Document Surface */}
      <div className="note-editor-doc-scroll" ref={scrollRef}>
        <div className="note-editor-sheet">
          <input
            ref={titleInputRef}
            type="text"
            className={`note-title-input ${isViewer ? "is-readonly" : ""}`}
            placeholder={isViewer ? "Untitled Note" : "Note title..."}
            aria-label="Note title"
            value={editTitle}
            readOnly={isViewer}
            onChange={(e) => {
              if (!isViewer) setEditTitle(e.target.value);
            }}
          />

          {/* Timestamps metadata bar (12h/24h aware + custom note timestamp picker) */}
          <div className="note-timestamps-bar">
            {setEditTimestamp && !isViewer ? (
              <button
                type="button"
                className={`note-ts-chip is-editable ${showTimestampEditor ? "is-open" : ""}`}
                onClick={() => setShowTimestampEditor((open) => !open)}
                aria-expanded={showTimestampEditor}
                title="Click to customize note timestamp"
              >
                <CalendarClock size={12} />
                <span>{primaryTimestampLabel || "Set Timestamp"}</span>
              </button>
            ) : (
              primaryTimestampLabel && (
                <span className="note-ts-chip">
                  <CalendarClock size={12} />
                  <span>{primaryTimestampLabel}</span>
                </span>
              )
            )}
            {createdTimestampLabel && (
              <span className="note-ts-meta">Created {createdTimestampLabel}</span>
            )}
            {updatedTimestampLabel && updatedTimestampLabel !== createdTimestampLabel && (
              <span className="note-ts-meta">Updated {updatedTimestampLabel}</span>
            )}
          </div>

          {!isViewer && setEditTimestamp && showTimestampEditor && (
            <div className="note-ts-editor" role="group" aria-label="Edit note timestamp">
              <input
                type="date"
                className="note-ts-input"
                aria-label="Note timestamp date"
                value={timestampInputs.date}
                onChange={(e) => handleTimestampInputUpdate(e.target.value, timestampInputs.time)}
              />
              <input
                type="time"
                step="60"
                className="note-ts-input"
                aria-label="Note timestamp time"
                value={timestampInputs.time}
                onChange={(e) => handleTimestampInputUpdate(timestampInputs.date, e.target.value)}
              />
              <button
                type="button"
                className="note-ts-action-btn"
                onClick={() => setEditTimestamp(new Date().toISOString())}
                title="Set timestamp to right now"
              >
                Now
              </button>
              {editTimestamp && (
                <button
                  type="button"
                  className="note-ts-action-btn"
                  onClick={() => setEditTimestamp("")}
                  title="Clear custom timestamp"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Rich ContentEditable Body or formatted preview */}
          {isPreviewMode ? (
            <div className="note-preview-body">
              {toText(editContent).trim() ? (
                <div style={{ lineHeight: 1.6, overflowWrap: "anywhere" }}>{previewBlocks.map(renderBlock)}</div>
              ) : (
                <span className="note-preview-empty">No content in this note.</span>
              )}
            </div>
          ) : (
            <div
              ref={contentEditableRef}
              className={`note-contenteditable-surface ${isViewer ? "is-readonly" : ""}`}
              contentEditable={!isViewer}
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label="Note body"
              aria-readonly={isViewer || undefined}
              aria-autocomplete={isViewer ? undefined : "list"}
              aria-controls={isMentionOpen ? listboxId : undefined}
              aria-activedescendant={activeOptionId}
              onInput={isViewer ? undefined : handleEditorInput}
              onKeyDown={isViewer ? undefined : handleEditorKeyDown}
              onBlur={isViewer ? undefined : closeMentionPopup}
              onPaste={isViewer ? undefined : handlePaste}
              onDrop={isViewer ? undefined : handleDrop}
              data-placeholder={
                isViewer
                  ? "This note is empty."
                  : "Start typing your note... Use @ to mention team members and / to reference tasks."
              }
            />
          )}

          {/* Attached Tasks Drawer */}
          <AttachedTasksDrawer
            attachedTaskIds={Array.isArray(activeNote.task_ids) ? activeNote.task_ids : []}
            allTasks={allTasks}
            teamsMap={teamsMap}
            onAttachTask={onAttachTask}
            onUnlinkTask={onUnlinkTask}
            isViewer={isViewer}
          />
        </div>
      </div>

      {/* Floating Autocomplete Popover (Editors only) */}
      {isMentionOpen && (
        <div
          className="note-mention-dropdown"
          // Keep focus (and the caret) in the editor while interacting with the list.
          onMouseDown={(e) => e.preventDefault()}
          style={{
            top: mentionPopup.coords.top !== undefined ? `${mentionPopup.coords.top}px` : undefined,
            bottom: mentionPopup.coords.bottom !== undefined ? `${mentionPopup.coords.bottom}px` : undefined,
            left: `${mentionPopup.coords.left}px`,
            maxHeight: `${mentionPopup.coords.maxHeight}px`
          }}
        >
          <div className="note-dropdown-header" id={`${listboxId}-label`}>
            {mentionPopup.type === "person" ? "Mention team member" : "Reference task"}
          </div>

          <div className="note-dropdown-list" id={listboxId} role="listbox" aria-labelledby={`${listboxId}-label`}>
            {mentionPopup.type === "person" ? (
              autocompletePeople.length === 0 ? (
                <div className="note-dropdown-empty">No matching team members</div>
              ) : (
                autocompletePeople.map((person, idx) => (
                  <button
                    key={person.id}
                    id={optionId(idx)}
                    type="button"
                    role="option"
                    aria-selected={idx === mentionPopup.selectedIndex}
                    tabIndex={-1}
                    className={`note-dropdown-item ${idx === mentionPopup.selectedIndex ? "is-selected" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertPersonPill(person);
                    }}
                    onMouseEnter={() => setMentionPopup((prev) => ({ ...prev, selectedIndex: idx }))}
                  >
                    <User size={14} className="note-dropdown-icon" />
                    <div className="note-dropdown-info">
                      <span className="note-dropdown-name">{toText(person.name)}</span>
                      {person.role && <span className="note-dropdown-role">{toText(person.role)}</span>}
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
                  id={optionId(idx)}
                  type="button"
                  role="option"
                  aria-selected={idx === mentionPopup.selectedIndex}
                  tabIndex={-1}
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
                    <span className="note-dropdown-name">{getTaskTitle(task)}</span>
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
