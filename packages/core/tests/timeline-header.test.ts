// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderTimelineHeader } from "../src/renderers/timeline-header";
import { createTooltipController } from "../src/renderers/tooltip";
import { layout } from "../src/layout";
import { renderJantt } from "../src/renderer";
import { themeManager } from "../src/themes";
import { GridHeader, JanttData, Task } from "../src/types";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  document.querySelectorAll(".jantt-hover-card").forEach((n) => n.remove());
});

if (typeof window.PointerEvent === "undefined") {
  class MockPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, params: any = {}) {
      super(type, params);
      this.pointerId = params.pointerId || 1;
      this.pointerType = params.pointerType || "mouse";
    }
  }
  window.PointerEvent = MockPointerEvent as any;
  (global as any).PointerEvent = MockPointerEvent as any;
}

describe("Timeline Header Interactions (Click to Filter & Border Drag to Resize)", () => {
  const mockHeader: GridHeader = {
    totalHeight: 60,
    totalWidth: 360,
    startDate: "2026-09-01",
    endDate: "2026-09-03",
    totalDays: 3,
    spansMultipleYears: false,
    years: [],
    months: [
      { label: "September 2026", x: 0, width: 360 }
    ],
    weeks: [],
    days: [
      {
        dateStr: "2026-09-01",
        label: "1",
        dayName: "Tu",
        dayOfWeek: 2,
        dayOfMonth: 1,
        isWeekend: false,
        isToday: false,
        isTaskBoundary: false,
        x: 0,
        width: 36
      },
      {
        dateStr: "2026-09-02",
        label: "2",
        dayName: "We",
        dayOfWeek: 3,
        dayOfMonth: 2,
        isWeekend: false,
        isToday: false,
        isTaskBoundary: true,
        x: 36,
        width: 36
      },
      {
        dateStr: "2026-09-03",
        label: "3",
        dayName: "Th",
        dayOfWeek: 4,
        dayOfMonth: 3,
        isWeekend: false,
        isToday: true,
        isTaskBoundary: false,
        x: 72,
        width: 36
      }
    ],
    todayX: 72,
    scale: "day"
  };

  it("renders day cells with both click filter support and col-resize handles", () => {
    const onDateClick = vi.fn();
    const onColumnResize = vi.fn();

    const el = renderTimelineHeader(mockHeader, {
      onDateClick,
      onColumnResize,
      dayWidth: 36
    });

    const dayCells = el.querySelectorAll<HTMLElement>(".jantt-day-cell");
    expect(dayCells.length).toBe(3);

    // Each cell has a resize handle between columns
    const resizeHandles = el.querySelectorAll<HTMLElement>(".jantt-col-resize-handle");
    expect(resizeHandles.length).toBeGreaterThanOrEqual(3);

    // Clicking day cell fires onDateClick
    dayCells[0].click();
    expect(onDateClick).toHaveBeenCalledTimes(1);
    expect(onDateClick).toHaveBeenCalledWith("2026-09-01");

    dayCells[1].click();
    expect(onDateClick).toHaveBeenCalledTimes(2);
    expect(onDateClick).toHaveBeenCalledWith("2026-09-02");
  });

  it("clicking the resize handle does NOT trigger onDateClick", () => {
    const onDateClick = vi.fn();
    const onColumnResize = vi.fn();

    const el = renderTimelineHeader(mockHeader, {
      onDateClick,
      onColumnResize,
      dayWidth: 36
    });

    const firstCell = el.querySelector<HTMLElement>(".jantt-day-cell")!;
    const handle = firstCell.querySelector<HTMLElement>(".jantt-col-resize-handle")!;
    expect(handle).toBeTruthy();

    handle.click();
    expect(onDateClick).not.toHaveBeenCalled();
  });

  it("dragging the resize handle between columns invokes onColumnResize", () => {
    const onDateClick = vi.fn();
    const onColumnResize = vi.fn();
    const onColumnResizeStart = vi.fn();
    const onColumnResizeEnd = vi.fn();

    // Stub requestAnimationFrame
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });

    const el = renderTimelineHeader(mockHeader, {
      onDateClick,
      onColumnResize,
      onColumnResizeStart,
      onColumnResizeEnd,
      dayWidth: 36
    });

    document.body.appendChild(el);

    const firstCell = el.querySelector<HTMLElement>(".jantt-day-cell")!;
    const handle = firstCell.querySelector<HTMLElement>(".jantt-col-resize-handle")!;

    // 1. Pointerdown on handle
    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 50,
        button: 0
      })
    );

    // 2. Pointermove past threshold
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 130,
        clientY: 50
      })
    );

    expect(onColumnResizeStart).toHaveBeenCalled();
    expect(onColumnResize).toHaveBeenCalled();

    // 3. Pointerup ends drag
    window.dispatchEvent(
      new PointerEvent("pointerup", {
        clientX: 130,
        clientY: 50
      })
    );

    expect(onColumnResizeEnd).toHaveBeenCalled();

    document.body.removeChild(el);
  });

  it("highlights the selected date with is-date-selected class", () => {
    const el = renderTimelineHeader(mockHeader, {
      selectedDate: "2026-09-02",
      dayWidth: 36
    });

    const dayCells = el.querySelectorAll<HTMLElement>(".jantt-day-cell");
    expect(dayCells[0].classList.contains("is-date-selected")).toBe(false);
    expect(dayCells[1].classList.contains("is-date-selected")).toBe(true);
    expect(dayCells[2].classList.contains("is-date-selected")).toBe(false);
  });

  it("holding and dragging a day cell horizontally invokes onColumnResize and suppresses onDateClick", () => {
    const onDateClick = vi.fn();
    const onColumnResize = vi.fn();
    const onColumnResizeStart = vi.fn();
    const onColumnResizeEnd = vi.fn();

    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });

    const el = renderTimelineHeader(mockHeader, {
      onDateClick,
      onColumnResize,
      onColumnResizeStart,
      onColumnResizeEnd,
      dayWidth: 36
    });

    document.body.appendChild(el);
    const firstCell = el.querySelector<HTMLElement>(".jantt-day-cell")!;

    // 1. Pointerdown on day cell body (not handle)
    firstCell.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientX: 50,
        clientY: 30,
        button: 0
      })
    );

    // 2. Drag 60px horizontally
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 110,
        clientY: 30
      })
    );

    expect(onColumnResizeStart).toHaveBeenCalled();
    expect(onColumnResize).toHaveBeenCalled();

    // 3. Pointerup ends drag
    window.dispatchEvent(
      new PointerEvent("pointerup", {
        clientX: 110,
        clientY: 30
      })
    );

    expect(onColumnResizeEnd).toHaveBeenCalled();

    // 4. Subsequent click event should be suppressed because user dragged
    firstCell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onDateClick).not.toHaveBeenCalled();

    // 5. A later plain click filters again (the suppression is one-shot)
    firstCell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onDateClick).toHaveBeenCalledWith("2026-09-01");

    document.body.removeChild(el);
  });

  it("applies the latest pointer position once per frame and flushes it before the drag ends", () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    const calls: string[] = [];
    const onColumnResize = vi.fn((w: number) => calls.push(`resize:${w}`));
    const el = renderTimelineHeader(mockHeader, {
      onColumnResize,
      onColumnResizeStart: () => calls.push("start"),
      onColumnResizeEnd: () => calls.push("end"),
      dayWidth: 36
    });
    document.body.appendChild(el);
    const handle = el.querySelector<HTMLElement>(".jantt-col-resize-handle")!;

    handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 100, clientY: 50, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 130, clientY: 50 }));
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 160, clientY: 50 }));
    expect(frames).toHaveLength(1); // coalesced to one frame
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: 160, clientY: 50 }));

    // Final width uses the latest pointer (36 + 60 * 0.35 = 57) and lands before the anchor is released
    expect(calls).toEqual(["start", "resize:57", "end"]);
    document.body.removeChild(el);
  });

  it("aborting the signal tears down an in-progress drag and restores the body cursor", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    const controller = new AbortController();
    const onColumnResize = vi.fn();
    const el = renderTimelineHeader(mockHeader, { onColumnResize, dayWidth: 36, signal: controller.signal });
    document.body.appendChild(el);
    const handle = el.querySelector<HTMLElement>(".jantt-col-resize-handle")!;

    handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 100, clientY: 50, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 120, clientY: 50 }));
    expect(document.body.style.cursor).toBe("col-resize");
    const callsBeforeAbort = onColumnResize.mock.calls.length;

    controller.abort();
    expect(document.body.style.cursor).toBe("");
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 50 }));
    expect(onColumnResize.mock.calls.length).toBe(callsBeforeAbort);
    document.body.removeChild(el);
  });

  it("makes the days row a single roving tab stop operable with Enter and arrow keys", () => {
    const onDateClick = vi.fn();
    const el = renderTimelineHeader(mockHeader, { onDateClick, dayWidth: 36 });
    document.body.appendChild(el);
    const cells = Array.from(el.querySelectorAll<HTMLElement>(".jantt-day-cell"));
    const tabStops = cells.filter((c) => c.tabIndex === 0);
    expect(tabStops).toHaveLength(1);
    expect(tabStops[0].dataset.date).toBe("2026-09-03"); // today
    expect(cells[0].getAttribute("role")).toBe("button");

    tabStops[0].focus();
    tabStops[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(document.activeElement).toBe(cells[1]);
    expect(cells[1].tabIndex).toBe(0);
    expect(cells[2].tabIndex).toBe(-1);

    cells[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onDateClick).toHaveBeenCalledWith("2026-09-02");
    document.body.removeChild(el);
  });
});

describe("Zoom-adaptive header tiers", () => {
  const data: JanttData = {
    tasks: [
      { id: "a", category: "dev", start: "2026-02-01", end: "2026-05-20" },
      { id: "b", category: "dev", start: "2026-06-01", end: "2026-10-15" }
    ]
  };

  it("renders months over ISO weeks at month scale (no per-day cells)", () => {
    const res = layout(data, { dayWidth: 8, showToday: false });
    expect(res.header.scale).toBe("month");
    const el = renderTimelineHeader(res.header, { dayWidth: 8, onColumnResize: vi.fn(), onDateClick: vi.fn() });
    expect(el.querySelectorAll(".jantt-day-cell")).toHaveLength(0);
    expect(el.querySelectorAll(".jantt-week-cell")).toHaveLength(res.header.weeks.length);
    expect(el.querySelectorAll(".jantt-month-cell")).toHaveLength(res.header.months.length);
  });

  it("renders quarters over short month names at quarter/year scale", () => {
    const res = layout(data, { dayWidth: 3, showToday: false });
    expect(res.header.scale).toBe("quarter");
    const el = renderTimelineHeader(res.header, { dayWidth: 3, onColumnResize: vi.fn() });
    const compactMonths = el.querySelectorAll(".jantt-month-cell.is-compact");
    expect(compactMonths).toHaveLength(res.header.months.length);
    expect(compactMonths[0].textContent).toMatch(/^[A-Z][a-z]{2}$/);
    const quarterLabels = Array.from(el.querySelectorAll(".jantt-header-months .jantt-tier-label")).map((n) => n.textContent);
    expect(quarterLabels.every((l) => /^Q[1-4]/.test(l || ""))).toBe(true);
    // Bounded node count regardless of the number of days
    expect(el.querySelectorAll("*").length).toBeLessThan(res.header.days.length);
  });

  it("filters on the day under the pointer when a zoomed-out tier is clicked", () => {
    const res = layout(data, { dayWidth: 8, showToday: false });
    const onDateClick = vi.fn();
    const el = renderTimelineHeader(res.header, { dayWidth: 8, onColumnResize: vi.fn(), onDateClick });
    document.body.appendChild(el);
    const week = el.querySelectorAll<HTMLElement>(".jantt-week-cell")[2];
    // jsdom has no layout: the header's left edge is 0, so clientX is the canvas x
    const x = res.header.days[20].x + 3;
    week.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x }));
    expect(onDateClick).toHaveBeenCalledWith(res.header.days[20].dateStr);
    el.remove();
  });

  it("reports the pointer-down position as the zoom anchor when a drag starts", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    const res = layout(data, { dayWidth: 8, showToday: false });
    const onColumnResizeStart = vi.fn();
    const el = renderTimelineHeader(res.header, { dayWidth: 8, onColumnResize: vi.fn(), onColumnResizeStart });
    document.body.appendChild(el);
    const week = el.querySelector<HTMLElement>(".jantt-week-cell")!;
    week.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 140, clientY: 20, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 170, clientY: 20 }));
    expect(onColumnResizeStart).toHaveBeenCalledWith(140);
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: 170, clientY: 20 }));
    el.remove();
  });

  it("pins the active date filter on zoomed-out tiers and clears it on click", () => {
    const res = layout(data, { dayWidth: 3, showToday: false, selectedDate: "2026-06-10" });
    const onDateClick = vi.fn();
    const el = renderTimelineHeader(res.header, { dayWidth: 3, selectedDate: "2026-06-10", onDateClick });
    const pin = el.querySelector<HTMLButtonElement>(".jantt-header-date-pin")!;
    expect(pin).not.toBeNull();
    pin.click();
    expect(onDateClick).toHaveBeenCalledWith("2026-06-10");
  });
});

describe("Renderer hardening (escaping, read-only links, stacking, themes)", () => {
  const PAYLOAD = "<img src=x onerror=\"window.__janttXss=1\">";
  const COLOR_PAYLOAD = "red\"><img src=x onerror=\"window.__janttXss=1\">";

  const mount = (data: JanttData, options: Parameters<typeof renderJantt>[2] = {}) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const chart = renderJantt(container, data, options);
    return {
      container,
      chart,
      cleanup: () => {
        chart.destroy();
        container.remove();
      }
    };
  };

  const linkedPlan = (): JanttData => ({
    tasks: [
      { id: "a", label: "Design", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      { id: "b", label: "Build", category: "dev", start: "2026-09-08", end: "2026-09-12", dependsOn: "a" }
    ]
  });

  it("hover cards escape every plan value and only render numeric costs", () => {
    const tooltip = createTooltipController();
    const task = {
      id: "t<1>",
      label: PAYLOAD,
      category: "dev",
      start: "<img src=x>",
      end: "2026-09-05",
      assignee: PAYLOAD,
      priority: PAYLOAD,
      notes: PAYLOAD,
      dependsOn: [PAYLOAD],
      estimatedCost: PAYLOAD as unknown as number
    } as Task;
    tooltip.show(task, { label: PAYLOAD, color: COLOR_PAYLOAD }, { clientX: 10, clientY: 10 } as MouseEvent);
    const card = document.querySelector(".jantt-hover-card")!;
    expect(card).not.toBeNull();
    expect(card.querySelector("img")).toBeNull();
    expect(card.querySelector("[onerror]")).toBeNull();
    expect(card.textContent).toContain("<img src=x");
    expect(card.textContent).not.toContain("Planned Budget");
    card.querySelectorAll<HTMLElement>("[style]").forEach((n) => {
      expect(n.getAttribute("style") || "").not.toContain("<");
    });
    tooltip.hide();
  });

  it("hover card durations are inclusive, matching the task table", () => {
    const tooltip = createTooltipController();
    tooltip.show(
      { id: "t", label: "T", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      { label: "Dev", color: "#3B82F6" },
      { clientX: 0, clientY: 0 } as MouseEvent
    );
    expect(document.querySelector(".jantt-hover-card")!.textContent).toContain("(5d)");
    tooltip.hide();
  });

  it("never turns plan colors or labels into markup or url() requests", () => {
    const { container, cleanup } = mount({
      categories: { dev: { label: PAYLOAD, color: COLOR_PAYLOAD } },
      people: [{ id: "p1", name: "Eve Example", color: COLOR_PAYLOAD }],
      tasks: [
        { id: "t1", label: PAYLOAD, category: "dev", start: "2026-09-01", end: "2026-09-05", assignee: "Eve Example" },
        { id: "t2", label: "Styled", category: "dev", start: "2026-09-02", end: "2026-09-06", color: "url(https://attacker.example/beacon)" }
      ]
    });
    expect(container.querySelector("img")).toBeNull();
    expect((window as any).__janttXss).toBeUndefined();
    const styled = container.querySelector<HTMLElement>('.jantt-task-bar[data-task-id="t2"]')!;
    expect(styled.style.background).not.toContain("url(");
    container.querySelectorAll<HTMLElement>("[style]").forEach((n) => {
      expect(n.getAttribute("style") || "").not.toContain("url(");
    });
    cleanup();
  });

  it("read-only charts render links without any removal affordance", () => {
    const onCommit = vi.fn();
    const { container, chart, cleanup } = mount(linkedPlan(), { readOnly: true, onCommit });
    expect(container.querySelectorAll(".jantt-dep-path")).toHaveLength(1);
    expect(container.querySelector(".jantt-dep-hit")).toBeNull();
    container.querySelector(".jantt-dep-path")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(container.querySelector(".jantt-link-remove-chip")).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
    expect(chart.getData().tasks[1].dependsOn).toBe("a");
    cleanup();
  });

  it("editable charts confirm link removal with an anchored chip and report it", () => {
    const onCommit = vi.fn();
    const onLinkDelete = vi.fn();
    const { container, chart, cleanup } = mount(linkedPlan(), { onCommit, onLinkDelete });
    const hit = container.querySelector(".jantt-dep-hit")!;
    expect(hit.querySelector("title")?.textContent).toContain("Design → Build");

    hit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onCommit).not.toHaveBeenCalled(); // one stray click never deletes
    const chip = container.querySelector<HTMLButtonElement>(".jantt-link-remove-chip")!;
    expect(chip).not.toBeNull();

    chip.click();
    expect(onLinkDelete).toHaveBeenCalledWith("a", "b");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(chart.getData().tasks[1].dependsOn).toBeNull();
    expect(container.querySelectorAll(".jantt-dep-path")).toHaveLength(0);
    cleanup();
  });

  it("keeps bars, links and the today line inside the isolated canvas below the sticky header", () => {
    const { container, cleanup } = mount(linkedPlan(), { viewport: { showCriticalPath: true, currentTime: new Date("2026-09-03T12:00:00Z") } });
    const area = container.querySelector(".jantt-timeline-area")!;
    const header = area.querySelector(":scope > .jantt-timeline-header")!;
    const canvas = area.querySelector(":scope > .jantt-grid-container")!;
    expect(header).not.toBeNull();
    expect(canvas).not.toBeNull();
    expect(header.compareDocumentPosition(canvas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    container.querySelectorAll(".jantt-task-bar, .jantt-milestone, .jantt-svg-overlay, .jantt-today-line").forEach((n) => {
      expect(canvas.contains(n)).toBe(true);
    });
    // The splitter follows the sticky table instead of the scrolling content
    expect(container.querySelector(".jantt-label-column > .jantt-splitter")).not.toBeNull();
    cleanup();
  });

  it("theme.css isolates the canvas and keeps critical-path styling static and contained", () => {
    const css = readFileSync(resolve(__dirname, "../src/theme.css"), "utf8");
    const rule = (selector: string) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return css.match(new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[2] ?? "";
    };
    expect(rule(".jantt-grid-container")).toMatch(/isolation:\s*isolate/);
    expect(rule(".jantt-grid-container")).toMatch(/z-index:\s*0/);
    expect(rule(".jantt-timeline-header")).toMatch(/z-index:\s*(?:var\(--jantt-z-header,\s*)?40\b/);
    expect(rule(".jantt-body-wrap")).toMatch(/isolation:\s*isolate/);
    expect(css).not.toMatch(/animation[^;]*infinite/);
    const criticalBlocks = css.match(/[^}]*is-critical[^{]*\{[^}]*\}/g) || [];
    criticalBlocks.forEach((block) => expect(block).not.toMatch(/z-index:[^;]*!important/));
  });

  it("switching themes removes tokens the new theme does not define", () => {
    const el = document.createElement("div");
    themeManager.applyTheme(el, "beenie");
    expect(el.style.getPropertyValue("--jantt-bar-radius")).toBe("14px");
    themeManager.applyTheme(el, "swiss-dark");
    expect(el.style.getPropertyValue("--jantt-bar-radius")).toBe("");
    expect(el.style.getPropertyValue("--jantt-bg")).toBe("#000000");
  });

  it("a built-in themeClassName alone applies that theme's tokens to the chart", () => {
    const { container, chart, cleanup } = mount(linkedPlan(), { themeClassName: "jantt-theme-cyber-emerald" });
    const root = container.querySelector<HTMLElement>(".jantt-container")!;
    expect(root.style.getPropertyValue("--jantt-bg")).toBe("#041410");
    chart.update(chart.getData(), { themeClassName: "jantt-theme-beenie" });
    expect(root.style.getPropertyValue("--jantt-bg")).toBe("#FFF5F8");
    cleanup();
  });

  it("toolbar Add Task button follows readOnly changes", () => {
    const { container, chart, cleanup } = mount(linkedPlan());
    expect(container.querySelector(".jantt-add-task-btn")).not.toBeNull();
    chart.update(chart.getData(), { readOnly: true });
    expect(container.querySelector(".jantt-add-task-btn")).toBeNull();
    chart.update(chart.getData(), { readOnly: false });
    expect(container.querySelector(".jantt-add-task-btn")).not.toBeNull();
    cleanup();
  });

  it("keeps keyboard focus on the same task across re-renders", () => {
    const { container, chart, cleanup } = mount(linkedPlan());
    container.querySelector<HTMLElement>('.jantt-task-bar[data-task-id="b"]')!.focus();
    chart.update(chart.getData());
    const active = document.activeElement as HTMLElement;
    expect(active.isConnected).toBe(true);
    expect(active.dataset.taskId).toBe("b");
    cleanup();
  });

  it("commit payloads are never rewritten by later interactions", () => {
    const commits: JanttData[] = [];
    const { container, chart, cleanup } = mount(linkedPlan(), { onCommit: (d) => commits.push(d) });
    container.querySelector(".jantt-dep-hit")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    container.querySelector<HTMLButtonElement>(".jantt-link-remove-chip")!.click();
    expect(commits).toHaveLength(1);
    const committed = commits[0];
    const committedTasks = committed.tasks;
    expect(committed).not.toBe(chart.getData());

    // A keyboard move goes through the controller, which replaces the engine's task array
    const bar = container.querySelector<HTMLElement>('.jantt-task-bar[data-task-id="a"]')!;
    bar.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(chart.getData().tasks).not.toBe(committedTasks);
    expect(committed.tasks).toBe(committedTasks);
    cleanup();
  });

  it("is inert after destroy", () => {
    const { container, chart } = mount(linkedPlan());
    chart.destroy();
    expect(container.innerHTML).toBe("");
    expect(() => chart.update(linkedPlan())).not.toThrow();
    chart.filterByDate("2026-09-02");
    expect(container.innerHTML).toBe("");
    container.remove();
  });

  it("renders adaptive hour and minute headers with bounded DOM nodes on long plans", () => {
    const longPlan: JanttData = {
      categories: { dev: { label: "Dev", color: "#3B82F6" } },
      tasks: [{ id: "t1", label: "Work", category: "dev", start: "2026-09-01T09:00", end: "2026-10-15T17:00" }]
    };
    const hourRes = layout(longPlan, { scale: "hour", timeFormat: "12h", showToday: false });
    const hourEl = renderTimelineHeader(hourRes.header);
    expect(hourEl.querySelectorAll(".jantt-subtick-cell").length).toBeGreaterThan(0);
    expect(hourEl.querySelectorAll(".jantt-subtick-cell").length).toBeLessThan(450);

    const minRes = layout(longPlan, { dayWidth: 36000, timeFormat: "24h", showToday: false });
    const minEl = renderTimelineHeader(minRes.header);
    expect(minEl.querySelectorAll(".jantt-subday-upper.is-hour-header").length).toBeGreaterThan(0);
    expect(minEl.querySelectorAll(".jantt-subtick-cell").length).toBeLessThan(450);
  });
});

