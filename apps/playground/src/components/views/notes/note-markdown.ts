import type { Task } from "@jantt/core";
import type { EffectivePerson } from "../../../types";

export const NOTE_PALETTE = [
  { id: "#3B82F6", label: "Blue", bg: "#3B82F6" },
  { id: "#10B981", label: "Emerald", bg: "#10B981" },
  { id: "#F59E0B", label: "Amber", bg: "#F59E0B" },
  { id: "#8B5CF6", label: "Violet", bg: "#8B5CF6" },
  { id: "#F43F5E", label: "Rose", bg: "#F43F5E" },
  { id: "#06B6D4", label: "Cyan", bg: "#06B6D4" },
  { id: "#64748B", label: "Slate", bg: "#64748B" }
];

export function getCaretCoordinates(): { top: number; left: number } | null {
  if (typeof window === "undefined") return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const rects = range.getClientRects();
  const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
  if (!rect || (rect.top === 0 && rect.left === 0 && rect.bottom === 0)) {
    return null;
  }
  return {
    top: Math.min(rect.bottom + 6, window.innerHeight - 260),
    left: Math.max(16, Math.min(rect.left, window.innerWidth - 300))
  };
}

export function serializeEditorToMarkdown(editorEl: HTMLElement): string {
  let result = "";

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.nodeValue || "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;

      if (el.classList.contains("note-mention-pill")) {
        const type = el.getAttribute("data-mention-type");
        const id = el.getAttribute("data-mention-id") || "";
        const label = el.getAttribute("data-mention-label") || id;

        if (type === "person") {
          result += `@${label.replace(/\s+/g, "")}`;
        } else if (type === "task") {
          result += `/${id}`;
        }
        return;
      }

      const tag = el.tagName.toLowerCase();
      if (tag === "br") {
        result += "\n";
        return;
      }

      const isBlock = ["div", "p", "h1", "h2", "h3", "li"].includes(tag);
      if (isBlock && result.length > 0 && !result.endsWith("\n")) {
        result += "\n";
      }

      for (let i = 0; i < el.childNodes.length; i++) {
        walk(el.childNodes[i]);
      }

      if (isBlock && !result.endsWith("\n")) {
        result += "\n";
      }
    }
  }

  for (let i = 0; i < editorEl.childNodes.length; i++) {
    walk(editorEl.childNodes[i]);
  }

  return result.replace(/\u00A0/g, " ");
}

export function populateEditorWithContent(
  editorEl: HTMLElement,
  content: string,
  people: EffectivePerson[],
  tasks: Task[]
) {
  editorEl.innerHTML = "";
  if (!content) return;

  const lines = content.split("\n");
  lines.forEach((line) => {
    const div = document.createElement("div");
    if (line === "") {
      div.appendChild(document.createElement("br"));
      editorEl.appendChild(div);
      return;
    }

    const tokens = line.split(/(@[a-zA-Z0-9_.-]+|(?:\/|#)[a-zA-Z0-9_-]+)/g);
    tokens.forEach((tok) => {
      if (tok.startsWith("@")) {
        const query = tok.slice(1).toLowerCase();
        const person = people.find(
          (p) =>
            p.name.toLowerCase().replace(/\s+/g, "") === query ||
            p.id.toLowerCase() === query ||
            p.name.toLowerCase() === query
        );
        if (person) {
          const pill = document.createElement("span");
          pill.className = "note-mention-pill is-person";
          pill.setAttribute("contenteditable", "false");
          pill.setAttribute("data-mention-type", "person");
          pill.setAttribute("data-mention-id", person.id);
          pill.setAttribute("data-mention-label", person.name);
          pill.innerHTML = `
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="4"></circle>
              <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"></path>
            </svg>
          `;
          const textSpan = document.createElement("span");
          textSpan.className = "note-pill-text";
          textSpan.textContent = `@${person.name}`;
          pill.appendChild(textSpan);
          div.appendChild(pill);
          return;
        }
      } else if (tok.startsWith("/") || tok.startsWith("#")) {
        const taskId = tok.slice(1).toLowerCase();
        const task = tasks.find((t) => t.id.toLowerCase() === taskId);
        if (task) {
          const pill = document.createElement("span");
          pill.className = "note-mention-pill is-task";
          pill.setAttribute("contenteditable", "false");
          pill.setAttribute("data-mention-type", "task");
          pill.setAttribute("data-mention-id", task.id);
          const taskLabel = task.label || task.name || task.id;
          pill.setAttribute("data-mention-label", taskLabel);
          pill.innerHTML = `
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 11 12 14 22 4"></polyline>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
            </svg>
          `;
          const textSpan = document.createElement("span");
          textSpan.className = "note-pill-text";
          textSpan.textContent = `${task.id}: ${taskLabel}`;
          pill.appendChild(textSpan);
          div.appendChild(pill);
          return;
        }
      }

      div.appendChild(document.createTextNode(tok));
    });

    editorEl.appendChild(div);
  });
}

export function insertPillAtRange(
  _editorEl: HTMLElement,
  rangeInfo: { textNode: Text; startIndex: number; endIndex: number },
  pillData: { type: "person" | "task"; id: string; label: string; color?: string }
) {
  const { textNode, startIndex, endIndex } = rangeInfo;
  const parent = textNode.parentNode;
  if (!parent) return;

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
    `;
    const textSpan = document.createElement("span");
    textSpan.className = "note-pill-text";
    textSpan.textContent = `@${pillData.label}`;
    pill.appendChild(textSpan);
  } else {
    pill.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 11 12 14 22 4"></polyline>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
      </svg>
    `;
    const textSpan = document.createElement("span");
    textSpan.className = "note-pill-text";
    textSpan.textContent = `${pillData.id}: ${pillData.label}`;
    pill.appendChild(textSpan);
  }

  const trailingSpace = document.createTextNode("\u00A0");

  try {
    const afterNode = textNode.splitText(endIndex);
    const targetNode = textNode.splitText(startIndex);

    parent.replaceChild(pill, targetNode);
    parent.insertBefore(trailingSpace, afterNode);

    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      const r = document.createRange();
      r.setStart(trailingSpace, 1);
      r.setEnd(trailingSpace, 1);
      sel.addRange(r);
    }
  } catch (err) {
    console.error("Failed to insert pill at range", err);
  }
}
