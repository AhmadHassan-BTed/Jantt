// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Jantt } from "../../react/src/Jantt";
import { JanttData } from "../src/types";
import { JanttInstance } from "../src/renderer";

vi.mock("@jantt/core", async () => import("../src/index"));
const data: JanttData = { tasks: [{ id: "a", start: "2026-01-05T14:00", end: "2026-01-05T16:00", label: "Task" }] };
const host = document.createElement("div");
afterEach(() => { host.remove(); vi.restoreAllMocks(); });

it("forwards timeFormat changes to the mounted chart and sends width-only changes directly", () => {
  document.body.appendChild(host);
  const root = createRoot(host);
  let instance: JanttInstance | null = null;
  const onInstance = (next: JanttInstance | null) => { instance = next; };
  const viewport = { dayWidth: 480, timeFormat: "12h" as const, startDate: "2026-01-05", endDate: "2026-01-06" };
  try {
    act(() => root.render(<Jantt data={data} viewport={viewport} onInstance={onInstance} />));
    expect(host.querySelector(".jantt-task-bar")?.getAttribute("aria-description")).toContain("2:00 PM");
    const mounted = instance! as JanttInstance;
    const update = vi.spyOn(mounted, "update");
    const setDayWidth = vi.spyOn(mounted, "setDayWidth");
    act(() => root.render(<Jantt data={data} viewport={{ ...viewport, timeFormat: "24h" }} onInstance={onInstance} />));
    expect(instance).toBe(mounted);
    expect(update).toHaveBeenCalledTimes(1);
    expect(host.querySelector(".jantt-task-bar")?.getAttribute("aria-description")).toContain("14:00");
    const bar = host.querySelector(".jantt-task-bar");
    update.mockClear();
    act(() => root.render(<Jantt data={data} viewport={{ ...viewport, timeFormat: "24h", dayWidth: 600 }} onInstance={onInstance} />));
    expect(setDayWidth).toHaveBeenCalledExactlyOnceWith(600);
    expect(update).not.toHaveBeenCalled();
    expect(host.querySelector(".jantt-task-bar")).toBe(bar);
  } finally {
    act(() => root.unmount());
  }
});
