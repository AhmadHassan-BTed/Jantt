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
  CheckSquare
} from "lucide-react";
import { sanitizeCssColor, type Task, type Team, type NoteItem } from "@jantt/core";
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
import { useI18n } from "../../../i18n/I18nProvider";
import type { MessageKey } from "../../../i18n";

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

/** Localized palette color name; unknown palette entries keep their English label. */
function noteColorLabel(t: (key: MessageKey) => string, id: string, fallback: string): string {
  switch (id) {
    case "#3B82F6": return t("notes.color.blue");
    case "#10B981": return t("notes.color.emerald");
    case "#F59E0B": return t("notes.color.amber");
    case "#8B5CF6": return t("notes.color.violet");
    case "#F43F5E": return t("notes.color.rose");
    case "#06B6D4": return t("notes.color.cyan");
    case "#64748B": return t("notes.color.slate");
    default: return fallback;
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
  const { t } = useI18n();
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
  const colorAnchorRef = useRef<HTMLDivElement>(null);
  const colorTriggerRef = useRef<HTMLButtonElement>(null);
  usePopoverDismiss(showColorPicker, () => setShowColorPicker(false), colorAnchorRef, colorTriggerRef);

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
            aria-label={t("notes.allNotes")}
            title={t("notes.backToOverview")}
          >
            <ArrowLeft size={16} />
            <span>{t("notes.allNotes")}</span>
          </button>
          <div className="note-save-indicator" aria-live="polite">
            {isViewer ? (
              <button
                type="button"
                className="save-tag is-viewer"
                onClick={() => onPromptFork?.()}
                title={t("notes.readOnlyCopyTitle")}
              >
                <Eye size={12} />
                <span>{t("notes.readOnlyCopy")}</span>
              </button>
            ) : saveStatus === "saved" ? (
              <span className="save-tag is-saved">
                <CheckCircle2 size={12} />
                <span>{t("notes.saved")}</span>
              </span>
            ) : (
              <span className="save-tag is-saving">
                <RefreshCw size={12} className="spin-icon" />
                <span>{t("notes.saving")}</span>
              </span>
            )}
          </div>
        </div>

        <div className="note-topbar-actions">
          <button
            type="button"
            className={`note-action-btn ${editPinned ? "is-pinned" : ""}`}
            onClick={() => setEditPinned(!editPinned)}
            disabled={isViewer}
            aria-pressed={editPinned}
            aria-label={editPinned ? t("notes.unpin") : t("notes.pin")}
            title={isViewer ? (editPinned ? t("notes.pinnedReadOnly") : t("notes.notPinnedReadOnly")) : editPinned ? t("notes.unpin") : t("notes.pin")}
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
              aria-label={t("notes.changeColor")}
              title={isViewer ? t("notes.colorReadOnly") : t("notes.changeColor")}
            >
              <span className="note-color-swatch-indicator" style={{ backgroundColor: sanitizeCssColor(editColor, DEFAULT_NOTE_COLOR) }} />
            </button>

            {!isViewer && showColorPicker && (
              <div className="note-color-picker-dropdown" role="group" aria-label={t("notes.noteColor")}>
                {NOTE_PALETTE.map((pal) => (
                  <button
                    key={pal.id}
                    type="button"
                    className={`note-picker-swatch ${editColor === pal.id ? "is-selected" : ""}`}
                    style={{ backgroundColor: pal.bg }}
                    aria-pressed={editColor === pal.id}
                    aria-label={noteColorLabel(t, pal.id, pal.label)}
                    onClick={() => {
                      setEditColor(pal.id);
                      setShowColorPicker(false);
                      colorTriggerRef.current?.focus();
                    }}
                    title={noteColorLabel(t, pal.id, pal.label)}
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
            aria-label={isPreviewMode ? t("notes.backToEditing") : t("notes.previewToggle")}
            title={isPreviewMode ? t("notes.backToEditing") : t("notes.previewToggleTitle")}
          >
            {isPreviewMode ? <Edit3 size={15} /> : <Eye size={15} />}
          </button>

          {!isViewer && (
            <button
              type="button"
              className="note-action-btn is-danger"
              onClick={() => onDeleteNote(activeNote.id)}
              aria-label={t("notes.deleteThis")}
              title={t("notes.deleteThis")}
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
            placeholder={isViewer ? t("notes.untitled") : t("notes.titlePlaceholder")}
            aria-label={t("notes.titleAria")}
            value={editTitle}
            readOnly={isViewer}
            onChange={(e) => {
              if (!isViewer) setEditTitle(e.target.value);
            }}
          />

          {/* Rich ContentEditable Body or formatted preview */}
          {isPreviewMode ? (
            <div className="note-preview-body">
              {toText(editContent).trim() ? (
                <div style={{ lineHeight: 1.6, overflowWrap: "anywhere" }}>{previewBlocks.map(renderBlock)}</div>
              ) : (
                <span className="note-preview-empty">{t("notes.noContent")}</span>
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
              aria-label={t("notes.bodyAria")}
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
                  ? t("notes.bodyEmptyViewer")
                  : t("notes.bodyPlaceholder")
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
            {mentionPopup.type === "person" ? t("notes.mentionPerson") : t("notes.mentionTask")}
          </div>

          <div className="note-dropdown-list" id={listboxId} role="listbox" aria-labelledby={`${listboxId}-label`}>
            {mentionPopup.type === "person" ? (
              autocompletePeople.length === 0 ? (
                <div className="note-dropdown-empty">{t("notes.noMatchingPeople")}</div>
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
              <div className="note-dropdown-empty">{t("tasks.noMatching")}</div>
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
