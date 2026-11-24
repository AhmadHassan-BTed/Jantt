// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useAndroidBackNavigation } from "./useAndroidBackNavigation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("restores the overlay's history entry when Back encounters unsaved changes", async () => {
  const url = "/?view=gantt#project";
  window.history.replaceState({ project: "local" }, "", url);
  const close = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
  function Harness() {
    useAndroidBackNavigation([{ id: "task", isOpen: true, close }], true);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  const pressBack = () => act(async () => {
    const traversed = new Promise(resolve => window.addEventListener("popstate", resolve, { once: true }));
    window.history.back();
    await traversed;
  });
  try {
    await act(async () => root.render(<Harness />));
    await pressBack();
    expect(close).toHaveBeenCalledTimes(1);
    expect(window.history.state).toEqual({ project: "local", janttOverlay: "task" });
    await pressBack();
    expect(close).toHaveBeenCalledTimes(2);
    expect(window.history.state).toEqual({ project: "local" });
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(url);
  } finally {
    await act(async () => root.unmount());
  }
});
