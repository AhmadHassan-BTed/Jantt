// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useGanttViewport } from "./useGanttViewport";
import { storageService } from "../services/storage";
import { STORAGE_KEYS } from "../constants";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("debounces settings writes and flushes the latest pending values on pagehide and unmount", () => {
  vi.useFakeTimers();
  const write = vi.spyOn(storageService, "setItem");
  const root = createRoot(document.createElement("div"));
  let viewport: ReturnType<typeof useGanttViewport>;
  function Fixture() {
    viewport = useGanttViewport({ initialTheme: "default", initialScale: "day", initialRouting: "orthogonal",
      initialRowHeightMode: "custom", initialRowHeight: 40, initialCritical: false, initialBaselines: false,
      initialAutoCascade: true, initialView: "gantt" });
    return null;
  }
  try {
    act(() => root.render(<Fixture />));
    act(() => vi.advanceTimersByTime(150));
    write.mockClear();
    for (let width = 40; width < 50; width++) {
      act(() => viewport!.setCurrentDayWidth(width));
      act(() => vi.advanceTimersByTime(10));
    }
    expect(write).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(140));
    expect(write).toHaveBeenCalledTimes(10);
    expect(write).toHaveBeenCalledWith(STORAGE_KEYS.DAY_WIDTH, "49");
    write.mockClear();
    act(() => viewport!.setCurrentDayWidth(75));
    window.dispatchEvent(new Event("pagehide"));
    expect(write).toHaveBeenCalledWith(STORAGE_KEYS.DAY_WIDTH, "75");
    expect(write).toHaveBeenCalledTimes(10);
    act(() => vi.advanceTimersByTime(150));
    expect(write).toHaveBeenCalledTimes(10);
    write.mockClear();
    act(() => viewport!.setCurrentDayWidth(90));
  } finally {
    act(() => root.unmount());
  }
  expect(write).toHaveBeenCalledWith(STORAGE_KEYS.DAY_WIDTH, "90");
  expect(write).toHaveBeenCalledTimes(10);
  act(() => vi.advanceTimersByTime(500));
  expect(write).toHaveBeenCalledTimes(10);
});
