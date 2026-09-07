import { useState, useRef, useMemo, useCallback } from "react";
import type { Task } from "@jantt/core";
import type { EffectivePerson } from "../../../types";
import {
  getCaretCoordinates,
  insertPillAtRange
} from "./note-markdown";

function insertPillAtCurrentCaret(
  editorEl: HTMLElement,
  pillData: { type: "person" | "task"; id: string; label: string; color?: string }
) {
  const sel = window.getSelection();
  let range: Range | null = null;
  if (sel && sel.rangeCount > 0) {
    range = sel.getRangeAt(0);
  }

  const pill = document.createElement("span");
  pill.className = `note-mention-pill ${pillData.type === "person" ? "is-person" : "is-task"}`;
  pill.setAttribute("contenteditable", "false");
  pill.setAttribute("data-mention-type", pillData.type);
  pill.setAttribute("data-mention-id", pillData.id);
  pill.setAttribute("data-mention-label", pillData.label);

  if (pillData.type === "person") {
    pill.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="4"></circle>
        <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"></path>
      </svg>
      <span class="note-pill-text">@${pillData.label}</span>
    `;
  } else {
    pill.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 11 12 14 22 4"></polyline>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
      </svg>
      <span class="note-pill-text">${pillData.id}: ${pillData.label}</span>
    `;
  }

  const trailingSpace = document.createTextNode("\u00A0");

  if (range && editorEl.contains(range.commonAncestorContainer)) {
    range.deleteContents();
    range.insertNode(trailingSpace);
    range.insertNode(pill);

    sel?.removeAllRanges();
    const newRange = document.createRange();
    newRange.setStart(trailingSpace, 1);
    newRange.setEnd(trailingSpace, 1);
    sel?.addRange(newRange);
  } else {
    editorEl.appendChild(pill);
    editorEl.appendChild(trailingSpace);
    sel?.removeAllRanges();
    const newRange = document.createRange();
    newRange.setStart(trailingSpace, 1);
    newRange.setEnd(trailingSpace, 1);
    sel?.addRange(newRange);
  }

  editorEl.focus();
}

export interface MentionPopupState {
  isOpen: boolean;
  type: "person" | "task";
  query: string;
  coords: { top: number; left: number };
  selectedIndex: number;
}

export function useNoteMentionEngine(
  contentEditableRef: React.RefObject<HTMLDivElement>,
  effectivePeople: EffectivePerson[],
  allTasks: Task[],
  onContentChange: () => void
) {
  const popupRangeRef = useRef<{ textNode: Text; startIndex: number; endIndex: number } | null>(null);

  const [mentionPopup, setMentionPopup] = useState<MentionPopupState>({
    isOpen: false,
    type: "person",
    query: "",
    coords: { top: 0, left: 0 },
    selectedIndex: 0
  });

  const insertPersonPill = useCallback(
    (person: EffectivePerson) => {
      const editorEl = contentEditableRef.current;
      if (!editorEl) return;

      const targetRange = popupRangeRef.current;
      if (targetRange && targetRange.textNode.parentNode && editorEl.contains(targetRange.textNode)) {
        insertPillAtRange(editorEl, targetRange, {
          type: "person",
          id: person.id,
          label: person.name,
          color: person.color
        });
      } else {
        insertPillAtCurrentCaret(editorEl, {
          type: "person",
          id: person.id,
          label: person.name,
          color: person.color
        });
      }

      popupRangeRef.current = null;
      setMentionPopup((prev) => ({ ...prev, isOpen: false }));
      onContentChange();
    },
    [contentEditableRef, onContentChange]
  );

  const insertTaskPill = useCallback(
    (task: Task) => {
      const editorEl = contentEditableRef.current;
      if (!editorEl) return;

      const targetRange = popupRangeRef.current;
      const label = task.label || task.name || task.id;
      if (targetRange && targetRange.textNode.parentNode && editorEl.contains(targetRange.textNode)) {
        insertPillAtRange(editorEl, targetRange, {
          type: "task",
          id: task.id,
          label
        });
      } else {
        insertPillAtCurrentCaret(editorEl, {
          type: "task",
          id: task.id,
          label
        });
      }

      popupRangeRef.current = null;
      setMentionPopup((prev) => ({ ...prev, isOpen: false }));
      onContentChange();
    },
    [contentEditableRef, onContentChange]
  );

  const autocompletePeople = useMemo(() => {
    if (!mentionPopup.isOpen || mentionPopup.type !== "person") return [];
    const q = mentionPopup.query.trim().toLowerCase();
    if (!q) return effectivePeople;
    return effectivePeople.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.name.toLowerCase().replace(/\s+/g, "").includes(q)
    );
  }, [mentionPopup.isOpen, mentionPopup.type, mentionPopup.query, effectivePeople]);

  const autocompleteTasks = useMemo(() => {
    if (!mentionPopup.isOpen || mentionPopup.type !== "task") return [];
    const q = mentionPopup.query.trim().toLowerCase();
    if (!q) return allTasks;
    return allTasks.filter((t) => {
      const title = t.label || t.name || "";
      return t.id.toLowerCase().includes(q) || title.toLowerCase().includes(q);
    });
  }, [mentionPopup.isOpen, mentionPopup.type, mentionPopup.query, allTasks]);

  const handleEditorInput = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      onContentChange();
      return;
    }

    const anchorNode = sel.anchorNode;
    if (!anchorNode || anchorNode.nodeType !== Node.TEXT_NODE) {
      if (mentionPopup.isOpen) {
        setMentionPopup((prev) => ({ ...prev, isOpen: false }));
        popupRangeRef.current = null;
      }
      onContentChange();
      return;
    }

    const text = anchorNode.nodeValue || "";
    const caretPos = sel.anchorOffset;
    const textBeforeCaret = text.slice(0, caretPos);

    const atMatch = textBeforeCaret.match(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/);
    const slashMatch = textBeforeCaret.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/);

    if (atMatch) {
      const query = atMatch[1];
      const atIndex = textBeforeCaret.lastIndexOf("@");
      const coords = getCaretCoordinates() || { top: 120, left: 120 };
      popupRangeRef.current = {
        textNode: anchorNode as Text,
        startIndex: atIndex,
        endIndex: caretPos
      };
      setMentionPopup({
        isOpen: true,
        type: "person",
        query,
        coords,
        selectedIndex: 0
      });
    } else if (slashMatch) {
      const query = slashMatch[1];
      const slashIndex = textBeforeCaret.lastIndexOf("/");
      const coords = getCaretCoordinates() || { top: 120, left: 120 };
      popupRangeRef.current = {
        textNode: anchorNode as Text,
        startIndex: slashIndex,
        endIndex: caretPos
      };
      setMentionPopup({
        isOpen: true,
        type: "task",
        query,
        coords,
        selectedIndex: 0
      });
    } else {
      if (mentionPopup.isOpen) {
        setMentionPopup((prev) => ({ ...prev, isOpen: false }));
        popupRangeRef.current = null;
      }
    }

    onContentChange();
  }, [mentionPopup.isOpen, onContentChange]);

  const handleEditorKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!mentionPopup.isOpen) return;

      const itemsCount =
        mentionPopup.type === "person" ? autocompletePeople.length : autocompleteTasks.length;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionPopup((prev) => ({
          ...prev,
          selectedIndex: (prev.selectedIndex + 1) % Math.max(1, itemsCount)
        }));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionPopup((prev) => ({
          ...prev,
          selectedIndex: (prev.selectedIndex - 1 + itemsCount) % Math.max(1, itemsCount)
        }));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (mentionPopup.type === "person" && autocompletePeople[mentionPopup.selectedIndex]) {
          insertPersonPill(autocompletePeople[mentionPopup.selectedIndex]);
        } else if (mentionPopup.type === "task" && autocompleteTasks[mentionPopup.selectedIndex]) {
          insertTaskPill(autocompleteTasks[mentionPopup.selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setMentionPopup((prev) => ({ ...prev, isOpen: false }));
        popupRangeRef.current = null;
      }
    },
    [mentionPopup, autocompletePeople, autocompleteTasks, insertPersonPill, insertTaskPill]
  );

  const closeMentionPopup = useCallback(() => {
    setMentionPopup((prev) => ({ ...prev, isOpen: false }));
    popupRangeRef.current = null;
  }, []);

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
