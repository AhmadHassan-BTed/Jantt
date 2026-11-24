import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import type { Task } from "@jantt/core";
import type { EffectivePerson } from "../../../types";
import {
  getCaretCoordinates,
  getTaskTitle,
  insertPillAtCurrentCaret,
  insertPillAtRange,
  toText,
  type PopupCoords
} from "./note-markdown";

/** Upper bound on rendered suggestions so large plans stay responsive while typing. */
const MAX_SUGGESTIONS = 50;

const PERSON_TRIGGER_RE = /(?:^|\s)@([\p{L}\p{N}_.\-]*)$/u;
const TASK_TRIGGER_RE = /(?:^|\s)\/([\p{L}\p{N}_.\-]*)$/u;

export interface MentionPopupState {
  isOpen: boolean;
  type: "person" | "task";
  query: string;
  coords: PopupCoords;
  selectedIndex: number;
}

interface PopupRange {
  textNode: Text;
  startIndex: number;
  endIndex: number;
}

/**
 * Closes a popover on an outside pointer press or Escape, returning focus to its trigger.
 * `containerRef` must wrap both the trigger and the popover.
 */
export function usePopoverDismiss(
  open: boolean,
  onDismiss: () => void,
  containerRef: React.RefObject<HTMLElement>,
  triggerRef?: React.RefObject<HTMLElement>
) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const container = containerRef.current;
      if (container && !container.contains(e.target as Node)) onDismissRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onDismissRef.current();
      triggerRef?.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, containerRef, triggerRef]);
}

export function useNoteMentionEngine(
  contentEditableRef: React.RefObject<HTMLDivElement>,
  effectivePeople: EffectivePerson[],
  allTasks: Task[],
  onContentChange: () => void
) {
  const popupRangeRef = useRef<PopupRange | null>(null);

  const [mentionPopup, setMentionPopup] = useState<MentionPopupState>({
    isOpen: false,
    type: "person",
    query: "",
    coords: { left: 0, top: 0, maxHeight: 260 },
    selectedIndex: 0
  });

  const closeMentionPopup = useCallback(() => {
    popupRangeRef.current = null;
    setMentionPopup((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
  }, []);

  const insertPill = useCallback(
    (pillData: { type: "person" | "task"; id: string; label: string; color?: string }) => {
      const editorEl = contentEditableRef.current;
      if (!editorEl) return;
      const targetRange = popupRangeRef.current;
      if (targetRange && targetRange.textNode.parentNode && editorEl.contains(targetRange.textNode)) {
        insertPillAtRange(editorEl, targetRange, pillData);
      } else {
        insertPillAtCurrentCaret(editorEl, pillData);
      }
      closeMentionPopup();
      onContentChange();
    },
    [contentEditableRef, onContentChange, closeMentionPopup]
  );

  const insertPersonPill = useCallback(
    (person: EffectivePerson) =>
      insertPill({ type: "person", id: person.id, label: toText(person.name) || person.id, color: person.color }),
    [insertPill]
  );

  const insertTaskPill = useCallback(
    (task: Task) => insertPill({ type: "task", id: task.id, label: getTaskTitle(task) }),
    [insertPill]
  );

  const autocompletePeople = useMemo(() => {
    if (!mentionPopup.isOpen || mentionPopup.type !== "person") return [];
    const q = mentionPopup.query.trim().toLowerCase();
    const matches = q
      ? effectivePeople.filter((p) => {
          const name = toText(p.name).toLowerCase();
          return name.includes(q) || toText(p.id).toLowerCase().includes(q) || name.replace(/\s+/g, "").includes(q);
        })
      : effectivePeople;
    return matches.slice(0, MAX_SUGGESTIONS);
  }, [mentionPopup.isOpen, mentionPopup.type, mentionPopup.query, effectivePeople]);

  const autocompleteTasks = useMemo(() => {
    if (!mentionPopup.isOpen || mentionPopup.type !== "task") return [];
    const q = mentionPopup.query.trim().toLowerCase();
    const results: Task[] = [];
    for (const t of allTasks) {
      if (t._deleted) continue;
      if (!q || toText(t.id).toLowerCase().includes(q) || getTaskTitle(t).toLowerCase().includes(q)) {
        results.push(t);
        if (results.length >= MAX_SUGGESTIONS) break;
      }
    }
    return results;
  }, [mentionPopup.isOpen, mentionPopup.type, mentionPopup.query, allTasks]);

  const handleEditorInput = useCallback(() => {
    const sel = window.getSelection();
    const anchorNode = sel && sel.rangeCount > 0 ? sel.anchorNode : null;
    if (!sel || !anchorNode || anchorNode.nodeType !== Node.TEXT_NODE) {
      closeMentionPopup();
      onContentChange();
      return;
    }

    const caretPos = sel.anchorOffset;
    const textBeforeCaret = (anchorNode.nodeValue || "").slice(0, caretPos);
    const atMatch = PERSON_TRIGGER_RE.exec(textBeforeCaret);
    const slashMatch = atMatch ? null : TASK_TRIGGER_RE.exec(textBeforeCaret);
    const match = atMatch ?? slashMatch;

    if (match) {
      const type = atMatch ? "person" : "task";
      popupRangeRef.current = {
        textNode: anchorNode as Text,
        startIndex: textBeforeCaret.lastIndexOf(atMatch ? "@" : "/"),
        endIndex: caretPos
      };
      const coords =
        getCaretCoordinates(null, contentEditableRef.current) ?? { left: 16, top: 16, maxHeight: 260 };
      setMentionPopup((prev) => ({
        isOpen: true,
        type,
        query: match[1],
        coords,
        // Keep the highlighted row while the query is unchanged (e.g. caret re-entry).
        selectedIndex: prev.isOpen && prev.type === type && prev.query === match[1] ? prev.selectedIndex : 0
      }));
    } else {
      closeMentionPopup();
    }

    onContentChange();
  }, [contentEditableRef, onContentChange, closeMentionPopup]);

  const handleEditorKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!mentionPopup.isOpen) return;

      const items = mentionPopup.type === "person" ? autocompletePeople : autocompleteTasks;
      const itemsCount = items.length;

      if (e.key === "ArrowDown" && itemsCount > 0) {
        e.preventDefault();
        setMentionPopup((prev) => ({ ...prev, selectedIndex: (prev.selectedIndex + 1) % itemsCount }));
      } else if (e.key === "ArrowUp" && itemsCount > 0) {
        e.preventDefault();
        setMentionPopup((prev) => ({ ...prev, selectedIndex: (prev.selectedIndex - 1 + itemsCount) % itemsCount }));
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (itemsCount === 0) {
          // Nothing to pick: let the key behave normally (newline / focus move).
          closeMentionPopup();
          return;
        }
        e.preventDefault();
        const index = Math.min(mentionPopup.selectedIndex, itemsCount - 1);
        if (mentionPopup.type === "person") insertPersonPill(autocompletePeople[index]);
        else insertTaskPill(autocompleteTasks[index]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeMentionPopup();
      }
    },
    [mentionPopup, autocompletePeople, autocompleteTasks, insertPersonPill, insertTaskPill, closeMentionPopup]
  );

  // While open: close when the caret leaves the trigger text, follow the caret on scroll/resize.
  useEffect(() => {
    if (!mentionPopup.isOpen) return;

    const onSelectionChange = () => {
      const target = popupRangeRef.current;
      const sel = window.getSelection();
      if (!target || !sel || sel.rangeCount === 0) return closeMentionPopup();
      if (sel.anchorNode !== target.textNode || sel.anchorOffset <= target.startIndex) closeMentionPopup();
    };

    const reposition = (e?: Event) => {
      const el = e?.target;
      if (el instanceof Element && el.closest(".note-mention-dropdown")) return;
      const target = popupRangeRef.current;
      if (!target || !target.textNode.isConnected) return closeMentionPopup();
      const range = document.createRange();
      const len = target.textNode.data.length;
      range.setStart(target.textNode, Math.min(target.startIndex, len));
      range.setEnd(target.textNode, Math.min(target.endIndex, len));
      const coords = getCaretCoordinates(range, contentEditableRef.current);
      if (coords) setMentionPopup((prev) => (prev.isOpen ? { ...prev, coords } : prev));
    };

    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
    };
  }, [mentionPopup.isOpen, contentEditableRef, closeMentionPopup]);

  return {
    mentionPopup,
    setMentionPopup,
    autocompletePeople,
    autocompleteTasks,
    insertPersonPill,
    insertTaskPill,
    handleEditorInput,
    handleEditorKeyDown,
    closeMentionPopup
  };
}
