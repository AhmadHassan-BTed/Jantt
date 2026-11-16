// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import type { Task } from "@jantt/core";
import type { EffectivePerson } from "../../../types";
import {
  createMentionLookup,
  createMentionPill,
  formatPersonMention,
  insertPillAtCurrentCaret,
  noteContentToPlainText,
  parseNoteMarkdown,
  populateEditorWithContent,
  serializeEditorToMarkdown,
  tokenizeNoteLine,
  toText
} from "./note-markdown";

const people: EffectivePerson[] = [
  { id: "ann", name: "Ann Lee" },
  { id: "jose", name: "José Núñez" },
  { id: "p-ar", name: "أحمد" }
] as EffectivePerson[];

const tasks: Task[] = [
  { id: "T1", label: "Design", category: "x", start: "2026-01-01", end: "2026-01-05" },
  { id: "1.2", label: "Dotted", category: "x", start: "2026-01-01", end: "2026-01-05" },
  { id: "GONE", label: "Deleted", category: "x", start: "2026-01-01", end: "2026-01-05", _deleted: true }
];

let editor: HTMLDivElement;

const roundTrip = (content: string) => {
  populateEditorWithContent(editor, content, people, tasks);
  return serializeEditorToMarkdown(editor);
};

beforeEach(() => {
  document.body.innerHTML = "";
  editor = document.createElement("div");
  editor.contentEditable = "true";
  document.body.appendChild(editor);
});

describe("note serialization round trip", () => {
  it.each([
    ["single line", "hello"],
    ["multi line", "a\nb\nc"],
    ["blank lines", "a\n\nb"],
    ["leading blank line", "\nstart"],
    ["trailing newline", "end\n"],
    ["empty", ""],
    ["spaces", "  indented  text "],
    ["person mention", `Ping ${formatPersonMention("ann", "Ann Lee")} today`],
    ["unicode person", `${formatPersonMention("jose", "José Núñez")} and ${formatPersonMention("p-ar", "أحمد")}`],
    ["task mention", "Blocked by /T1 and /1.2"],
    ["hash and urls are text", "Issue #5 see https://example.com/T1 or a/T1"]
  ])("%s survives populate -> serialize unchanged", (_name, content) => {
    expect(roundTrip(content)).toBe(content);
  });

  it("does not grow a newline on every edit session", () => {
    let content = "first\nsecond";
    for (let i = 0; i < 5; i++) content = roundTrip(content);
    expect(content).toBe("first\nsecond");
  });

  it("serializes browser-style markup (bare text, <br> placeholders, nested blocks)", () => {
    editor.innerHTML = "one<div>two</div><div><br></div><div><div>three</div></div><div>four<br></div>";
    expect(serializeEditorToMarkdown(editor)).toBe("one\ntwo\n\nthree\nfour");
  });

  it("upgrades legacy @Handle tokens to unambiguous person tokens", () => {
    expect(roundTrip("Hi @AnnLee.")).toBe(`Hi ${formatPersonMention("ann", "Ann Lee")}.`);
  });

  it("keeps unknown explicit person tokens lossless and leaves unknown tasks as text", () => {
    const token = formatPersonMention("ex-member", "Former Member");
    expect(roundTrip(`${token} /NOPE /GONE`)).toBe(`${token} /NOPE /GONE`);
  });

  it("links a task id before trailing sentence punctuation", () => {
    populateEditorWithContent(editor, "see /T1.", people, tasks);
    const pill = editor.querySelector(".note-mention-pill");
    expect(pill?.getAttribute("data-mention-id")).toBe("T1");
    expect(serializeEditorToMarkdown(editor)).toBe("see /T1.");
  });

  it("escapes brackets and parentheses in person tokens", () => {
    const token = formatPersonMention("odd)(id", "Name [x]");
    expect(token).toBe("@[Name x](person:odd%29%28id)");
    const lookup = createMentionLookup([{ id: "odd)(id", name: "Name [x]" } as EffectivePerson], []);
    expect(tokenizeNoteLine(token, lookup)).toEqual([{ kind: "person", id: "odd)(id", label: "Name [x]" }]);
  });
});

describe("mention pills never interpret plan data as HTML", () => {
  const payload = `<img src=x onerror="window.__pwned=1">`;

  it("createMentionPill keeps hostile labels as text", () => {
    const pill = createMentionPill({ type: "person", id: payload, label: payload });
    expect(pill.querySelector("img")).toBeNull();
    expect(pill.textContent).toContain(payload);
  });

  it("caret insertion (fallback path) keeps hostile labels as text", () => {
    insertPillAtCurrentCaret(editor, { type: "task", id: "T9", label: payload });
    expect(editor.querySelector("img")).toBeNull();
    expect(editor.textContent).toContain(payload);
  });

  it("populate keeps hostile task labels and person names as text", () => {
    const hostileTasks = [{ id: "X1", label: payload, category: "x", start: "2026-01-01", end: "2026-01-02" }] as Task[];
    const hostilePeople = [{ id: "evil", name: payload }] as EffectivePerson[];
    populateEditorWithContent(editor, `/X1 ${formatPersonMention("evil", payload)}`, hostilePeople, hostileTasks);
    expect(editor.querySelector("img")).toBeNull();
    expect(editor.querySelectorAll(".note-mention-pill")).toHaveLength(2);
  });
});

describe("helpers", () => {
  it("toText coerces malformed fields", () => {
    expect(toText(5)).toBe("5");
    expect(toText(null)).toBe("");
    expect(toText(undefined)).toBe("");
  });

  it("noteContentToPlainText shows mentions as @Name", () => {
    expect(noteContentToPlainText(`# Title with ${formatPersonMention("ann", "Ann Lee")}`)).toBe("Title with @Ann Lee");
    expect(noteContentToPlainText(42)).toBe("42");
  });

  it("parseNoteMarkdown builds a safe block model", () => {
    const lookup = createMentionLookup(people, tasks);
    const blocks = parseNoteMarkdown(
      "# Heading\n- one\n- **two** /T1\n1. first\n> quote\n---\n[ok](https://example.com) [bad](javascript:alert(1))",
      lookup
    );
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "list", "list", "quote", "rule", "paragraph"]);
    const bullets = blocks[1];
    expect(bullets.kind === "list" && bullets.items).toHaveLength(2);
    const last = blocks[5];
    if (last.kind !== "paragraph") throw new Error("expected paragraph");
    const links = last.inlines.filter((n) => n.kind === "link");
    expect(links).toHaveLength(1);
    expect(links[0].kind === "link" && links[0].href).toBe("https://example.com");
    expect(last.inlines.some((n) => n.kind === "text" && n.text.includes("javascript:"))).toBe(true);
  });
});
