// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { it, expect, vi } from "vitest";
import type { JanttData } from "@jantt/core";
import { useAutoSave } from "./useAutoSave";
import { useEditorState } from "./useEditorState";

it("keeps updates pending until a valid draft reaches durable storage", () => {
  const plan: JanttData = { meta: { title: "Original" }, tasks: [] };
  const save = vi.fn(() => true);
  const ref: { edit?: (value: string) => void; prepare?: () => boolean } = {};
  const container = document.createElement("div");
  const root = createRoot(container);
  function Fixture() {
    const editor = useEditorState({ initialJson: JSON.stringify(plan), initialParsed: plan });
    const autoSave = useAutoSave({ parsedData: editor.parsedData, activeProjectId: "test", onSaveProject: save,
      flushEditorDraft: editor.flushEditorDraft, showToast: () => {} });
    ref.edit = editor.handleEditorChange;
    ref.prepare = autoSave.prepareReload;
    return null;
  }
  let ready = false;
  try {
    act(() => root.render(<Fixture />));
    act(() => ref.edit!("{"));
    act(() => { ready = ref.prepare!(); });
    expect(ready).toBe(false);
    expect(save).not.toHaveBeenCalled();
    save.mockReturnValueOnce(false);
    act(() => ref.edit!(JSON.stringify({ ...plan, meta: { title: "Latest draft" } })));
    act(() => { ready = ref.prepare!(); });
    expect(ready).toBe(false);
    expect(save).toHaveBeenLastCalledWith("test", expect.objectContaining({ meta: { title: "Latest draft" } }));
    act(() => { ready = ref.prepare!(); });
    expect(ready).toBe(true);
  } finally {
    act(() => root.unmount());
  }
});

