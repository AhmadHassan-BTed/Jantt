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

export const DEFAULT_NOTE_COLOR = NOTE_PALETTE[0].id;

/**
 * Coerces an untrusted (shared / imported) field into display text so malformed
 * plans such as `{ "content": 5 }` can never crash a render.
 */
export function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

export function getTaskTitle(task: Pick<Task, "id" | "label" | "name">): string {
  return toText(task.label) || toText(task.name) || toText(task.id);
}

// ---------------------------------------------------------------------------
// Mention tokens
// ---------------------------------------------------------------------------

export type MentionType = "person" | "task";

export interface MentionPillData {
  type: MentionType;
  id: string;
  label: string;
  color?: string;
}

/** `@[Display Name](person:url-encoded-id)`: unambiguous, Unicode-safe and rename-safe. */
const PERSON_TOKEN_SOURCE = String.raw`@\[([^\]\r\n]*)\]\(person:([^)\s]+)\)`;
/** Legacy `@Name` / task `/ID` tokens; only recognised at a line start or after whitespace. */
const SIGIL_TOKEN_SOURCE = String.raw`(^|\s)([@/])([\p{L}\p{N}_.\-]+)`;
const MENTION_SCAN_RE = new RegExp(`${PERSON_TOKEN_SOURCE}|${SIGIL_TOKEN_SOURCE}`, "gu");
const PERSON_TOKEN_RE = new RegExp(PERSON_TOKEN_SOURCE, "gu");
const TRAILING_PUNCTUATION_RE = /[._\-]+$/u;

function encodeMentionId(id: string): string {
  return encodeURIComponent(id).replace(/[()]/g, (c) => (c === "(" ? "%28" : "%29"));
}

function decodeMentionId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function formatPersonMention(id: string, label: string): string {
  const safeLabel = label.replace(/[[\]\r\n]/g, "").trim() || id;
  return `@[${safeLabel}](person:${encodeMentionId(id)})`;
}

export function formatTaskMention(id: string): string {
  return `/${id}`;
}

export interface MentionLookup {
  findPersonById: (id: string) => EffectivePerson | undefined;
  findPersonByHandle: (handle: string) => EffectivePerson | undefined;
  findTask: (id: string) => Task | undefined;
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** Builds O(1) lookups once per hydrate/render instead of scanning lists per token. */
export function createMentionLookup(people: EffectivePerson[], tasks: Task[]): MentionLookup {
  const peopleById = new Map<string, EffectivePerson>();
  const peopleByHandle = new Map<string, EffectivePerson>();
  for (const p of people) {
    if (!p || typeof p.id !== "string") continue;
    peopleById.set(p.id, p);
    const name = toText(p.name);
    for (const handle of [p.id.toLowerCase(), name.toLowerCase(), squash(name)]) {
      if (handle && !peopleByHandle.has(handle)) peopleByHandle.set(handle, p);
    }
  }
  const tasksById = new Map<string, Task>();
  const tasksByLowerId = new Map<string, Task>();
  for (const t of tasks) {
    if (!t || typeof t.id !== "string" || t._deleted) continue;
    tasksById.set(t.id, t);
    if (!tasksByLowerId.has(t.id.toLowerCase())) tasksByLowerId.set(t.id.toLowerCase(), t);
  }
  return {
    findPersonById: (id) => peopleById.get(id),
    findPersonByHandle: (handle) => peopleByHandle.get(handle.toLowerCase()),
    findTask: (id) => tasksById.get(id) || tasksByLowerId.get(id.toLowerCase())
  };
}

export type NoteInlineToken =
  | { kind: "text"; text: string }
  | { kind: "person"; id: string; label: string }
  | { kind: "task"; id: string; label: string };

/**
 * Resolves `word`, then progressively drops trailing punctuation (".", "-", "_")
 * so "see /T1." links T1 while dotted IDs such as "/1.2" still resolve whole.
 */
function resolveWord<T>(word: string, find: (w: string) => T | undefined): { match: T; consumed: string } | null {
  let candidate = word;
  while (candidate) {
    const match = find(candidate);
    if (match) return { match, consumed: candidate };
    const trimmed = candidate.replace(TRAILING_PUNCTUATION_RE, "");
    if (trimmed === candidate) return null;
    candidate = trimmed;
  }
  return null;
}

/** Splits one line of note text into plain text and resolved mention tokens. */
export function tokenizeNoteLine(line: string, lookup: MentionLookup): NoteInlineToken[] {
  const tokens: NoteInlineToken[] = [];
  const pushText = (text: string) => {
    if (!text) return;
    const prev = tokens[tokens.length - 1];
    if (prev && prev.kind === "text") prev.text += text;
    else tokens.push({ kind: "text", text });
  };

  let cursor = 0;
  for (const m of line.matchAll(MENTION_SCAN_RE)) {
    const index = m.index ?? 0;
    if (m[2] !== undefined) {
      // Explicit person token: keep it as a pill even if the person is gone, so it round-trips.
      const id = decodeMentionId(m[2]);
      const person = lookup.findPersonById(id);
      pushText(line.slice(cursor, index));
      tokens.push({ kind: "person", id, label: person ? toText(person.name) : m[1] || id });
      cursor = index + m[0].length;
      continue;
    }

    const lead = m[3] ?? "";
    const sigil = m[4];
    const word = m[5] ?? "";
    const tokenStart = index + lead.length;
    if (sigil === "@") {
      const hit = resolveWord(word, lookup.findPersonByHandle);
      if (!hit) continue;
      pushText(line.slice(cursor, tokenStart));
      tokens.push({ kind: "person", id: hit.match.id, label: toText(hit.match.name) });
      cursor = tokenStart + 1 + hit.consumed.length;
    } else {
      const hit = resolveWord(word, lookup.findTask);
      if (!hit) continue;
      pushText(line.slice(cursor, tokenStart));
      tokens.push({ kind: "task", id: hit.match.id, label: getTaskTitle(hit.match) });
      cursor = tokenStart + 1 + hit.consumed.length;
    }
  }
  pushText(line.slice(cursor));
  return tokens;
}

/** Plain-text excerpt for list previews and search (mention tokens shown as `@Name`). */
export function noteContentToPlainText(content: unknown): string {
  return toText(content)
    .replace(PERSON_TOKEN_RE, (_match, label: string) => `@${label}`)
    .replace(/[#*`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// DOM helpers for the contenteditable surface
// ---------------------------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";

/** Static icon geometry. Never derived from plan data, so pills cannot carry markup. */
const PILL_ICON_SHAPES: Record<MentionType, Array<[string, Record<string, string>]>> = {
  person: [
    ["circle", { cx: "12", cy: "12", r: "4" }],
    ["path", { d: "M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" }]
  ],
  task: [
    ["polyline", { points: "9 11 12 14 22 4" }],
    ["path", { d: "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" }]
  ]
};

const PILL_SVG_ATTRS: Record<string, string> = {
  width: "11",
  height: "11",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2.5",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "aria-hidden": "true"
};

/**
 * Builds a mention pill. User-controlled values (id, label) only ever reach the DOM
 * through attributes and `textContent`, never through `innerHTML`.
 */
export function createMentionPill(pillData: MentionPillData): HTMLSpanElement {
  const pill = document.createElement("span");
  pill.className = `note-mention-pill ${pillData.type === "person" ? "is-person" : "is-task"}`;
  pill.setAttribute("contenteditable", "false");
  pill.setAttribute("data-mention-type", pillData.type);
  pill.setAttribute("data-mention-id", pillData.id);
  pill.setAttribute("data-mention-label", pillData.label);

  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [name, value] of Object.entries(PILL_SVG_ATTRS)) svg.setAttribute(name, value);
  for (const [tag, attrs] of PILL_ICON_SHAPES[pillData.type]) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) shape.setAttribute(name, value);
    svg.appendChild(shape);
  }
  pill.appendChild(svg);

  const textSpan = document.createElement("span");
  textSpan.className = "note-pill-text";
  textSpan.textContent = pillData.type === "person" ? `@${pillData.label}` : `${pillData.id}: ${pillData.label}`;
  pill.appendChild(textSpan);
  return pill;
}

export interface PopupCoords {
  left: number;
  /** Set when the popup opens below the anchor. */
  top?: number;
  /** Set when the popup opens above the anchor (distance from the viewport bottom). */
  bottom?: number;
  maxHeight: number;
}

const POPUP_GAP = 6;
const POPUP_PREFERRED_HEIGHT = 260;
const POPUP_WIDTH = 280;
const VIEWPORT_MARGIN = 8;

/** Places a popup next to `rect`, flipping above when there is more room there. */
export function placePopupNearRect(rect: Pick<DOMRect, "top" | "bottom" | "left">): PopupCoords {
  const viewport = window.visualViewport;
  const topEdge = (viewport?.offsetTop ?? 0) + VIEWPORT_MARGIN;
  const leftEdge = (viewport?.offsetLeft ?? 0) + VIEWPORT_MARGIN;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  const bottomEdge = topEdge + height - 2 * VIEWPORT_MARGIN;
  const left = Math.max(leftEdge, Math.min(rect.left, leftEdge + width - POPUP_WIDTH - 2 * VIEWPORT_MARGIN));
  const below = Math.max(topEdge, Math.min(bottomEdge, rect.bottom + POPUP_GAP));
  const above = Math.max(topEdge, Math.min(bottomEdge, rect.top - POPUP_GAP));
  const spaceBelow = bottomEdge - below;
  const spaceAbove = above - topEdge;
  if (spaceBelow >= POPUP_PREFERRED_HEIGHT || spaceBelow >= spaceAbove) {
    return { left, top: below, maxHeight: Math.min(POPUP_PREFERRED_HEIGHT, spaceBelow) };
  }
  const maxHeight = Math.min(POPUP_PREFERRED_HEIGHT, spaceAbove);
  return { left, top: above - maxHeight, maxHeight };
}

function isUsableRect(rect: DOMRect | undefined | null): rect is DOMRect {
  return Boolean(rect && !(rect.top === 0 && rect.left === 0 && rect.bottom === 0));
}

/**
 * Viewport coordinates for a popup anchored at `range` (defaults to the current caret).
 * Falls back to the top-left of `fallbackEl` instead of an arbitrary screen position.
 */
export function getCaretCoordinates(range?: Range | null, fallbackEl?: HTMLElement | null): PopupCoords | null {
  if (typeof window === "undefined") return null;
  let anchor = range ?? null;
  if (!anchor) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) anchor = sel.getRangeAt(0);
  }
  if (anchor) {
    const rects = anchor.getClientRects();
    const rect = rects.length > 0 ? rects[0] : anchor.getBoundingClientRect();
    if (isUsableRect(rect)) return placePopupNearRect(rect);
  }
  if (fallbackEl) {
    const rect = fallbackEl.getBoundingClientRect();
    return placePopupNearRect({ top: rect.top, bottom: rect.top + 24, left: rect.left });
  }
  return null;
}

const BLOCK_TAGS = new Set([
  "div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol", "blockquote", "pre", "section", "article"
]);

/**
 * Serializes the editor DOM back to note text. Each block element is one line and
 * lines are joined with "\n", so `serialize(populate(x)) === x` (no newline growth).
 */
export function serializeEditorToMarkdown(editorEl: HTMLElement): string {
  const lines: string[] = [];
  let current = "";
  const endLine = () => {
    lines.push(current);
    current = "";
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      current += node.nodeValue || "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    if (el.classList.contains("note-mention-pill")) {
      const type = el.getAttribute("data-mention-type");
      const id = el.getAttribute("data-mention-id") || "";
      const label = el.getAttribute("data-mention-label") || id;
      if (id && type === "person") current += formatPersonMention(id, label);
      else if (id && type === "task") current += formatTaskMention(id);
      return;
    }

    const tag = el.tagName.toLowerCase();
    if (tag === "br") {
      // A <br> terminates the current line; a trailing placeholder <br> adds no extra line.
      endLine();
      return;
    }

    if (BLOCK_TAGS.has(tag)) {
      if (current !== "") endLine();
      const linesBefore = lines.length;
      el.childNodes.forEach(walk);
      // Close the block's last line; an empty block still counts as one (empty) line.
      if (current !== "" || lines.length === linesBefore) endLine();
      return;
    }

    el.childNodes.forEach(walk);
  };

  editorEl.childNodes.forEach(walk);
  if (current !== "") endLine();
  return lines.join("\n").replace(/ /g, " ");
}

export function populateEditorWithContent(
  editorEl: HTMLElement,
  content: string,
  people: EffectivePerson[],
  tasks: Task[]
) {
  editorEl.textContent = "";
  const text = toText(content);
  if (!text) return;

  const lookup = createMentionLookup(people, tasks);
  const fragment = document.createDocumentFragment();
  for (const line of text.split(/\r?\n/)) {
    const div = document.createElement("div");
    if (line === "") {
      div.appendChild(document.createElement("br"));
    } else {
      for (const token of tokenizeNoteLine(line, lookup)) {
        div.appendChild(
          token.kind === "text"
            ? document.createTextNode(token.text)
            : createMentionPill({ type: token.kind, id: token.id, label: token.label })
        );
      }
    }
    fragment.appendChild(div);
  }
  editorEl.appendChild(fragment);
}

function placeCaretAfter(node: Node) {
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.setStartAfter(node);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

function insertPillWithTrailingSpace(range: Range, pill: HTMLElement) {
  const trailingSpace = document.createTextNode(" ");
  range.deleteContents();
  range.insertNode(trailingSpace);
  range.insertNode(pill);
  placeCaretAfter(trailingSpace);
}

/** Replaces the typed `@query` / `/query` text with a pill. */
export function insertPillAtRange(
  _editorEl: HTMLElement,
  rangeInfo: { textNode: Text; startIndex: number; endIndex: number },
  pillData: MentionPillData
) {
  const { textNode, startIndex, endIndex } = rangeInfo;
  if (!textNode.parentNode) return;
  const length = textNode.data.length;
  const r = document.createRange();
  r.setStart(textNode, Math.min(startIndex, length));
  r.setEnd(textNode, Math.min(Math.max(startIndex, endIndex), length));
  insertPillWithTrailingSpace(r, createMentionPill(pillData));
}

/** Inserts a pill at the caret, or appends it when the caret is outside the editor. */
export function insertPillAtCurrentCaret(editorEl: HTMLElement, pillData: MentionPillData) {
  const sel = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const pill = createMentionPill(pillData);
  if (range && editorEl.contains(range.commonAncestorContainer)) {
    insertPillWithTrailingSpace(range, pill);
  } else {
    const trailingSpace = document.createTextNode(" ");
    editorEl.appendChild(pill);
    editorEl.appendChild(trailingSpace);
    placeCaretAfter(trailingSpace);
  }
  editorEl.focus();
}

/**
 * Inserts `text` as a plain text node at `range` (defaults to the current selection) and puts the
 * caret after it. Pasted or dropped content goes through here so foreign HTML (remote images,
 * styled spans) never enters the editor DOM; only what the serializer saves is ever shown.
 * Returns false when the target is outside the editor.
 */
export function insertPlainTextAt(editorEl: HTMLElement, text: string, range?: Range | null): boolean {
  const sel = window.getSelection();
  const target = range ?? (sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null);
  if (!target || !editorEl.contains(target.commonAncestorContainer)) return false;
  target.deleteContents();
  if (text) {
    const node = document.createTextNode(text.replace(/\r\n?/g, "\n"));
    target.insertNode(node);
    placeCaretAfter(node);
  }
  return true;
}

/** Caret position as a character offset into the editor's text (pills count as their text). */
export function getCaretTextOffset(editorEl: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!editorEl.contains(range.endContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(editorEl);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

/** Restores a caret saved with `getCaretTextOffset` after the editor was re-populated. */
export function setCaretTextOffset(editorEl: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  const r = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (remaining <= text.data.length) {
      const pill = text.parentElement?.closest(".note-mention-pill");
      if (pill && editorEl.contains(pill)) r.setStartAfter(pill);
      else r.setStart(text, remaining);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      return;
    }
    remaining -= text.data.length;
  }
  r.selectNodeContents(editorEl);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}

// ---------------------------------------------------------------------------
// Safe Markdown subset for the read view (rendered as React elements, never HTML)
// ---------------------------------------------------------------------------

export type NoteInline =
  | NoteInlineToken
  | { kind: "strong" | "em"; children: NoteInline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; children: NoteInline[] };

export type NoteBlock =
  | { kind: "heading"; level: 1 | 2 | 3; inlines: NoteInline[] }
  | { kind: "paragraph"; inlines: NoteInline[] }
  | { kind: "list"; ordered: boolean; items: NoteInline[][] }
  | { kind: "quote"; inlines: NoteInline[] }
  | { kind: "rule" }
  | { kind: "blank" };

const INLINE_MARKDOWN_RE = /`([^`\n]+)`|\*\*([^*\n]+?)\*\*|\*([^*\s][^*\n]*?)\*|\[([^\]\n]+)\]\(([^)\s]+)\)/;
const SAFE_HREF_RE = /^(https?:\/\/|mailto:)/i;

function parseInlineMarkdown(text: string): NoteInline[] {
  const out: NoteInline[] = [];
  let rest = text;
  while (rest) {
    const m = INLINE_MARKDOWN_RE.exec(rest);
    if (!m) {
      out.push({ kind: "text", text: rest });
      break;
    }
    if (m.index > 0) out.push({ kind: "text", text: rest.slice(0, m.index) });
    if (m[1] !== undefined) out.push({ kind: "code", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "strong", children: parseInlineMarkdown(m[2]) });
    else if (m[3] !== undefined) out.push({ kind: "em", children: parseInlineMarkdown(m[3]) });
    else if (m[4] !== undefined && m[5] !== undefined) {
      out.push(
        SAFE_HREF_RE.test(m[5])
          ? { kind: "link", href: m[5], children: parseInlineMarkdown(m[4]) }
          : { kind: "text", text: m[0] }
      );
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

function parseInlines(line: string, lookup: MentionLookup): NoteInline[] {
  const result: NoteInline[] = [];
  for (const token of tokenizeNoteLine(line, lookup)) {
    if (token.kind === "text") result.push(...parseInlineMarkdown(token.text));
    else result.push(token);
  }
  return result;
}

/** Parses note text into a small, safe Markdown block model (headings, lists, quotes, rules). */
export function parseNoteMarkdown(content: unknown, lookup: MentionLookup): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  for (const line of toText(content).split(/\r?\n/)) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const prev = blocks[blocks.length - 1];

    if (line.trim() === "") {
      blocks.push({ kind: "blank" });
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
    } else if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3, inlines: parseInlines(heading[2], lookup) });
    } else if (bullet || numbered) {
      const ordered = Boolean(numbered && !bullet);
      const item = parseInlines((bullet ?? numbered)![1], lookup);
      if (prev && prev.kind === "list" && prev.ordered === ordered) prev.items.push(item);
      else blocks.push({ kind: "list", ordered, items: [item] });
    } else if (/^\s*>\s?/.test(line)) {
      blocks.push({ kind: "quote", inlines: parseInlines(line.replace(/^\s*>\s?/, ""), lookup) });
    } else {
      blocks.push({ kind: "paragraph", inlines: parseInlines(line, lookup) });
    }
  }
  return blocks;
}
