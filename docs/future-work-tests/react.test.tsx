import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { StrictMode } from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { renderJantt } from "@jantt/core";
import type { JanttData, JanttOptions } from "@jantt/core";
import { Jantt, JanttLogo, JanttIcon } from "D:/Repos/Jantt/packages/react/src/index";

vi.mock("@jantt/core", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    renderJantt: vi.fn((...args: any[]) => {
      const inst = actual.renderJantt(...args);
      inst.update = vi.fn(inst.update);
      inst.destroy = vi.fn(inst.destroy);
      return inst;
    })
  };
});
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const mock = vi.mocked(renderJantt);
const plan: JanttData = {
  tasks: [
    { id: "t1", label: "A", category: "dev", start: "2026-11-01", end: "2026-11-05" },
    { id: "t2", label: "B", category: "dev", start: "2026-11-06", end: "2026-11-09", dependsOn: "t1" }
  ]
};

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  mock.mockClear();
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
const inst = (i = mock.mock.results.length - 1) => mock.mock.results[i].value as any;
const opts = (i = mock.mock.calls.length - 1) => mock.mock.calls[i][2] as JanttOptions;

describe("react wrapper", () => {
  it("mounts once without a second update", () => {
    act(() => root.render(<Jantt data={plan} viewport={{ scale: "week" }} />));
    expect(mock).toHaveBeenCalledTimes(1);
    expect(inst().update).not.toHaveBeenCalled();
    expect(opts().className).toBeUndefined();
    expect(opts().onOpenAutoSave).toBeUndefined();
    act(() => root.unmount());
    expect(inst().destroy).toHaveBeenCalledTimes(1);
  });
  it("StrictMode: remount, single live instance, no extra update", () => {
    act(() => root.render(<StrictMode><Jantt data={plan} /></StrictMode>));
    expect(mock).toHaveBeenCalledTimes(2);
    expect(inst(0).destroy).toHaveBeenCalledTimes(1);
    expect(inst(1).destroy).not.toHaveBeenCalled();
    expect(inst(1).update).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
  it("data-only change keeps zoom and does not forward viewport", () => {
    act(() => root.render(<Jantt data={plan} viewport={{ scale: "week" }} />));
    act(() => inst().setDayWidth(80));
    act(() => root.render(<Jantt data={{ tasks: [...plan.tasks] }} viewport={{ scale: "week" }} />));
    expect(inst().update).toHaveBeenCalledTimes(1);
    expect(inst().update.mock.calls[0][1]).not.toHaveProperty("viewport");
    expect(inst().getDayWidth()).toBe(80);
    act(() => root.unmount());
  });
  it("controlled zoom echo is skipped, real change forwarded", () => {
    let vp: any = { scale: "week", dayWidth: 20 };
    act(() => root.render(<Jantt data={plan} viewport={vp} />));
    act(() => inst().setDayWidth(55));
    vp = { scale: "month", dayWidth: inst().getDayWidth() };
    act(() => root.render(<Jantt data={plan} viewport={vp} />));
    expect(inst().update).not.toHaveBeenCalled();
    act(() => root.render(<Jantt data={plan} viewport={{ ...vp, dayWidth: 90 }} />));
    expect(inst().update).toHaveBeenCalledTimes(1);
    expect(inst().update.mock.calls[0][1].viewport).toEqual({ dayWidth: 90 });
    expect(inst().getDayWidth()).toBe(90);
    act(() => root.unmount());
  });
  it("engine commit echoed back as data is not re-applied", () => {
    const onCommit = vi.fn();
    act(() => root.render(<Jantt data={plan} onCommit={onCommit} />));
    const committed = inst().getData();
    opts().onCommit!(committed);
    expect(onCommit).toHaveBeenCalledWith(committed);
    act(() => root.render(<Jantt data={committed} onCommit={onCommit} />));
    expect(inst().update).not.toHaveBeenCalled();
    const older = { tasks: [plan.tasks[0]] };
    act(() => root.render(<Jantt data={older} onCommit={onCommit} />)); // undo
    act(() => root.render(<Jantt data={committed} onCommit={onCommit} />)); // redo
    expect(inst().update).toHaveBeenCalledTimes(2);
    expect(inst().getData().tasks).toHaveLength(2);
    act(() => root.unmount());
  });
  it("theme change keeps the engine's own data", () => {
    act(() => root.render(<Jantt data={plan} theme={{ accent: "#111111" }} />));
    const engineData = inst().getData();
    act(() => root.render(<Jantt data={plan} theme={{ accent: "#222222" }} />));
    expect(inst().update).toHaveBeenCalledTimes(1);
    expect(inst().update.mock.calls[0][0]).toBe(engineData);
    act(() => root.unmount());
  });
  it("mount errors go to onError and are retried on prop change", () => {
    mock.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const onError = vi.fn();
    act(() => root.render(<Jantt data={plan} onError={onError} />));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }));
    expect(onError).toHaveBeenCalledTimes(1);
    act(() => root.render(<Jantt data={{ tasks: [...plan.tasks] }} onError={onError} />));
    expect(mock).toHaveBeenCalledTimes(2);
    expect(inst().getData().tasks).toHaveLength(2);
    act(() => root.unmount());
  });
  it("update errors go to onError without unmounting", () => {
    const onError = vi.fn();
    act(() => root.render(<Jantt data={plan} onError={onError} />));
    inst().update.mockImplementationOnce(() => {
      throw new Error("upd");
    });
    act(() => root.render(<Jantt data={{ tasks: [] }} onError={onError} />));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "upd" }));
    expect(host.querySelector(".jantt-react-wrapper")).not.toBeNull();
    act(() => root.unmount());
  });
  it("toolbar data callbacks forwarded only when provided", () => {
    const onExportJson = vi.fn();
    act(() => root.render(<Jantt data={plan} onExportJson={onExportJson} />));
    expect(opts().onExportJson).toBeTypeOf("function");
    expect(opts().onImportJson).toBeUndefined();
    act(() => root.unmount());
  });
  it("selectedDate forwarded only when it changes", () => {
    act(() => root.render(<Jantt data={plan} selectedDate={null} />));
    act(() => inst().filterByDate("2026-11-02"));
    act(() => root.render(<Jantt data={{ tasks: [...plan.tasks] }} selectedDate={null} />));
    expect(inst().getSelectedDate()).toBe("2026-11-02");
    act(() => root.render(<Jantt data={plan} selectedDate={"2026-11-03"} />));
    expect(inst().getSelectedDate()).toBe("2026-11-03");
    act(() => root.unmount());
  });
  it("logo ids are unique per instance and accessible", () => {
    act(() =>
      root.render(
        <div>
          <JanttIcon />
          <JanttIcon />
          <JanttLogo />
          <JanttLogo showWordmark={false} />
        </div>
      )
    );
    const ids = [...host.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    const svgs = host.querySelectorAll("svg");
    expect(svgs[0].getAttribute("role")).toBe("img");
    expect(svgs[0].querySelector("title")?.textContent).toBe("Jantt");
    expect(svgs[2].getAttribute("aria-hidden")).toBe("true");
    expect(svgs[3].getAttribute("role")).toBe("img");
    const fill = svgs[1].querySelector("rect")!.getAttribute("fill")!;
    expect(fill).toMatch(/^url\(#jantt-logo-[A-Za-z0-9_-]+-badge-bg\)$/);
    expect(ids).toContain(fill.slice(5, -1));
    expect((host.querySelector(".jantt-brand-logo") as HTMLElement).style.cursor).toBe("");
    act(() => root.unmount());
  });
});
