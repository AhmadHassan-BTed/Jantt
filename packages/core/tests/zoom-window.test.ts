// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import * as geometry from "../src/layout";
import * as resolver from "../src/resolver";
import { renderJantt, JanttInstance } from "../src/renderer";
import { renderDependencyLinks } from "../src/renderers/dependency-links";
import { renderTimelineHeader } from "../src/renderers/timeline-header";
import { renderTimelineGrid } from "../src/renderers/timeline-grid";
import { DependencyLine, JanttData, JanttOptions } from "../src/types";

const plan: JanttData = {
  tasks: [
    { id: "a", label: "Build", start: "2026-01-05", end: "2026-01-07", progress: 0.5,
      baseline: { start: "2026-01-04", end: "2026-01-06" } },
    { id: "b", label: "Ship", start: "2026-01-10", end: "2026-01-10", milestone: true, dependsOn: ["a"] }
  ]
};
let chart: JanttInstance | undefined;
let host: HTMLElement;
function mount(dayWidth = 60, options: JanttOptions = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  chart = renderJantt(host, plan, { showToolbar: false, ...options, viewport: {
    startDate: "2026-01-01", endDate: "2026-12-31", currentTime: new Date("2026-01-05T12:00:00"),
    rowHeightMode: "custom", rowHeight: 40, showBaselines: true, dayWidth, ...options.viewport
  } });
  return chart;
}
function node<T extends Element = HTMLElement>(selector: string): T {
  const found = host.querySelector<T>(selector);
  expect(found).not.toBeNull();
  return found!;
}
afterEach(() => {
  chart?.destroy();
  chart = undefined;
  host?.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("windowed vector rendering", () => {
  it("clamps a wide SVG without rewriting canvas-space paths, including crossing links", () => {
    const dep = (id: string, fromX: number, toX: number): DependencyLine => ({
      fromTaskId: id, toTaskId: "target", fromX, toX, fromY: 20, toY: 60,
      path: `M ${fromX} 20 L ${toX} 60`, isCritical: false
    });
    const dependencies = [dep("crossing", 0, 5000), dep("near", 900, 950), dep("outside", 5000, 6000)];
    const paths = new Map<string, SVGPathElement>();
    const { svg, previewWireSvg } = renderDependencyLinks({ dependencies, canvasWidth: 240000,
      canvasHeight: 100, showCritical: false, visibleXRange: { startX: 1000, endX: 3000 }, depPathElements: paths });
    expect(svg.style.left).toBe("1000px");
    expect(svg.getAttribute("width")).toBe("2000");
    expect(svg.getAttribute("viewBox")).toBe("1000 0 2000 100");
    expect(paths.size).toBe(2);
    expect(paths.get("crossing->target")?.getAttribute("d")).toBe(dependencies[0].path);
    expect(svg.contains(previewWireSvg)).toBe(true);
    const small = renderDependencyLinks({ dependencies, canvasWidth: 5000, canvasHeight: 100,
      showCritical: false, visibleXRange: { startX: 1000, endX: 3000 } });
    expect(small.svg.getAttribute("viewBox")).toBe("0 0 5000 100");
    expect(small.depPathElements.size).toBe(3);
  });

  it.each([20, 60])("windows wide day/week headers and grid at %ipx, retaining the selected date", dayWidth => {
    const result = geometry.layout(plan, { dayWidth, startDate: "2026-01-01", endDate: "2026-12-31" });
    const visibleXRange = { startX: 2000, endX: 3000 };
    const selectedDate = result.header.days[0].dateStr;
    const header = renderTimelineHeader(result.header, { visibleXRange, selectedDate });
    expect(header.querySelectorAll(".is-windowed")).toHaveLength(2);
    const days = header.querySelectorAll<HTMLElement>(".jantt-day-cell");
    expect(days.length).toBeLessThan(result.header.days.length);
    expect(header.querySelector(`[data-date="${selectedDate}"]`)).not.toBeNull();
    const { gridLayer } = renderTimelineGrid({ header: result.header, taskLayouts: result.tasks,
      rowHeight: 40, showToday: true, visibleXRange });
    for (const column of gridLayer.querySelectorAll<HTMLElement>(".jantt-grid-day-col")) {
      expect(parseFloat(column.style.left)).toBeLessThanOrEqual(3000);
      expect(parseFloat(column.style.left) + parseFloat(column.style.width)).toBeGreaterThanOrEqual(2000);
    }
  });
});

describe("persistent timeline DOM", () => {
  it("restores narrow read-only labels without an empty badge gap after zooming out", () => {
    const instance = mount(20, { readOnly: true });
    const bar = node(".jantt-task-bar");
    expect(bar.querySelector(".jantt-bar-badges")).toBeNull();
    instance.setDayWidth(60);
    expect(bar.querySelector(".jantt-bar-percent")?.textContent).toBe("50%");
    instance.setDayWidth(20);
    expect(node(".jantt-task-bar")).toBe(bar);
    expect(bar.querySelector(".jantt-bar-badges")).toBeNull();
  });

  it("retains vector task nodes through every scale transition in both directions", () => {
    const instance = mount(1);
    const label = node(".jantt-label-column");
    const bar = node(".jantt-task-bar");
    for (const width of [1, 3, 8, 20, 60, 480, 2880, 480, 60, 20, 8, 3, 1]) {
      instance.setDayWidth(width);
      expect(node(".jantt-label-column")).toBe(label);
      expect(node(".jantt-task-bar")).toBe(bar);
      const expected = geometry.layout(instance.getData(), { dayWidth: width,
        startDate: "2026-01-01", endDate: "2026-12-31", rowHeight: 40, showBaselines: true });
      expect(parseFloat(bar.style.left)).toBe(expected.tasks[0].x);
      expect(parseFloat(bar.style.width)).toBe(expected.tasks[0].width);
      expect(Boolean(bar.querySelector(".jantt-bar-percent"))).toBe(expected.tasks[0].width >= 90);
    }
  });

  it("patches bars, milestones and baselines in place, while retaining label focus and row hover", () => {
    const instance = mount();
    const label = node(".jantt-label-column");
    const row = node('[data-row-id="a"]');
    const bar = node('.jantt-task-bar[data-task-id="a"]');
    const milestone = node(".jantt-milestone");
    const baseline = node(".jantt-baseline-bar");
    const oldWidth = parseFloat(bar.style.width);
    const oldLeft = parseFloat(bar.style.left);
    const oldBaseWidth = parseFloat(baseline.style.width);
    row.focus();
    row.dispatchEvent(new MouseEvent("mouseenter"));
    instance.setDayWidth(120);
    expect(node(".jantt-label-column")).toBe(label);
    expect(node('.jantt-task-bar[data-task-id="a"]')).toBe(bar);
    expect(node(".jantt-milestone")).toBe(milestone);
    expect(node(".jantt-baseline-bar")).toBe(baseline);
    expect(parseFloat(bar.style.width)).toBeGreaterThan(oldWidth);
    expect(parseFloat(bar.style.left)).toBe(oldLeft * 2);
    expect(parseFloat(baseline.style.width)).toBeGreaterThan(oldBaseWidth);
    expect(document.activeElement).toBe(row);
    expect(node('[data-grid-row-id="a"]').classList.contains("is-row-highlighted")).toBe(true);
    row.dispatchEvent(new MouseEvent("mouseleave"));
    expect(node('[data-grid-row-id="a"]').classList.contains("is-row-highlighted")).toBe(false);
  });

  it.each([60, 480, 2880])("refreshes horizontal windows at %ipx without layout, task DOM replacement, or scroll changes", dayWidth => {
    vi.useFakeTimers();
    mount(dayWidth);
    const label = node(".jantt-label-column");
    const bar = node(".jantt-task-bar");
    const header = node(".jantt-timeline-header");
    const wrap = node(".jantt-body-wrap");
    const layoutSpy = vi.spyOn(geometry, "layout");
    const boundsSpy = vi.spyOn(geometry, "computeChartBounds");
    wrap.scrollLeft = 12000;
    wrap.scrollTop = 15;
    wrap.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(20);
    expect(node(".jantt-timeline-header")).not.toBe(header);
    expect(node(".jantt-label-column")).toBe(label);
    expect(node(".jantt-task-bar")).toBe(bar);
    expect(layoutSpy).not.toHaveBeenCalled();
    expect(boundsSpy).not.toHaveBeenCalled();
    expect(wrap.scrollLeft).toBe(12000);
    expect(wrap.scrollTop).toBe(15);
    expect(parseFloat(node<SVGSVGElement>(".jantt-svg-overlay").style.left)).toBeGreaterThan(0);
  });

  it("keeps task resolution and CPM cached on viewport updates and computes bounds once", () => {
    const instance = mount();
    const tasks = instance.getData().tasks;
    const resolveSpy = vi.spyOn(resolver, "resolveSchedule");
    const criticalSpy = vi.spyOn(resolver, "calculateCriticalPath");
    const boundsSpy = vi.spyOn(geometry, "computeChartBounds");
    instance.update(plan, { viewport: { dayWidth: 80 } });
    instance.update(instance.getData(), { viewport: { dayWidth: 100 } });
    instance.update(plan, { viewport: { dayWidth: 120 } });
    expect(instance.getData().tasks).toBe(tasks);
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(criticalSpy).not.toHaveBeenCalled();
    expect(boundsSpy).toHaveBeenCalledTimes(3);
    const bar = node(".jantt-task-bar");
    instance.update({ ...plan, tasks: plan.tasks.map(t => ({ ...t, label: "Changed" })) });
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(node(".jantt-task-bar")).not.toBe(bar);
    expect(node(".jantt-bar-title").textContent).toBe("Changed");
  });

  it("applies in-place edits to reused input objects, including updates with viewport options", () => {
    const instance = mount();
    const data = structuredClone(plan);
    instance.update(data);
    data.tasks.push({ id: "c", label: "Added", start: "2026-01-12", end: "2026-01-13" });
    instance.update(data);
    expect(instance.getData().tasks).toHaveLength(3);
    expect(node('[data-task-id="c"]')).toBeTruthy();
    data.tasks[0].label = "Edited in place";
    instance.update(data, { viewport: { dayWidth: 90 } });
    expect(node('[data-task-id="a"] .jantt-bar-title').textContent).toBe("Edited in place");
  });

  it("applies getData mutations and restores a previously supplied plan after an edit", () => {
    const instance = mount();
    const input = structuredClone(plan);
    instance.update(input);
    const current = instance.getData();
    current.tasks[0].label = "Changed through getData";
    instance.update(current);
    expect(node('[data-task-id="a"] .jantt-bar-title').textContent).toBe("Changed through getData");
    instance.update(input);
    expect(node('[data-task-id="a"] .jantt-bar-title').textContent).toBe("Build");
    instance.getData().tasks[0].label = "Unsaved edit";
    instance.update(input);
    expect(instance.getData().tasks[0].label).toBe("Build");
  });

  it("rebuilds structural changes and queries the live grid from a retained label column", () => {
    const instance = mount();
    const label = node(".jantt-label-column");
    const bar = node(".jantt-task-bar");
    instance.update(instance.getData(), { viewport: { startDate: "2026-01-01", endDate: "2026-12-31", currentTime: new Date("2026-01-05T12:00:00"), rowHeightMode: "custom", rowHeight: 40, linkRouting: "straight" } });
    expect(node(".jantt-label-column")).toBe(label);
    expect(node(".jantt-task-bar")).not.toBe(bar);
    node('[data-row-id="a"]').dispatchEvent(new MouseEvent("mouseenter"));
    expect(node('[data-grid-row-id="a"]').classList.contains("is-row-highlighted")).toBe(true);
    const nextBar = node(".jantt-task-bar");
    instance.update(instance.getData(), { viewport: { timeFormat: "24h" } });
    expect(node(".jantt-label-column")).not.toBe(label);
    expect(node(".jantt-task-bar")).not.toBe(nextBar);
  });

  it("keeps dependency hover working after replacing the SVG, including mouse leave", () => {
    const instance = mount();
    const bar = node('.jantt-task-bar[data-task-id="a"]');
    bar.dispatchEvent(new MouseEvent("mouseenter"));
    instance.setDayWidth(80);
    expect(node(".jantt-dep-path").classList.contains("is-active")).toBe(true);
    bar.dispatchEvent(new MouseEvent("mouseleave"));
    expect(node(".jantt-dep-path").classList.contains("is-active")).toBe(false);
    bar.dispatchEvent(new MouseEvent("mouseenter"));
    expect(node(".jantt-dep-path").classList.contains("is-active")).toBe(true);
  });

  it("debounces wheel callbacks, preserves synchronous API callbacks, and cancels settle on destroy", () => {
    vi.useFakeTimers();
    const onDayWidthChange = vi.fn();
    const onViewportChange = vi.fn();
    const instance = mount(60, { onDayWidthChange, onViewportChange });
    const wrap = node(".jantt-body-wrap");
    for (let i = 0; i < 10; i++) wrap.dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: -5 }));
    expect(onDayWidthChange).not.toHaveBeenCalled();
    expect(onViewportChange).not.toHaveBeenCalled();
    expect(node(".jantt-container").classList.contains("is-zooming")).toBe(true);
    vi.advanceTimersByTime(139);
    expect(onDayWidthChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDayWidthChange).toHaveBeenCalledExactlyOnceWith(instance.getDayWidth());
    expect(onViewportChange).toHaveBeenCalledTimes(1);
    expect(node(".jantt-container").classList.contains("is-zooming")).toBe(false);
    instance.setDayWidth(120);
    expect(onDayWidthChange).toHaveBeenCalledTimes(2);
    expect(onViewportChange).toHaveBeenCalledTimes(2);
    wrap.dispatchEvent(new WheelEvent("wheel", { metaKey: true, deltaY: -10 }));
    instance.destroy();
    vi.advanceTimersByTime(200);
    expect(onDayWidthChange).toHaveBeenCalledTimes(2);
  });

  it.each([480, 6480, 31680])("covers a scrolled 4K viewport with at most 220 ticks at %ipx", dayWidth => {
    vi.useFakeTimers();
    mount(dayWidth);
    const wrap = node(".jantt-body-wrap");
    Object.defineProperty(wrap, "clientWidth", { value: 3840 });
    wrap.scrollLeft = 20000;
    wrap.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(20);
    const ticks = host.querySelectorAll<HTMLElement>(".jantt-subtick-cell");
    expect(ticks.length).toBeLessThanOrEqual(220);
    expect(parseFloat(ticks[0].style.left)).toBeLessThanOrEqual(wrap.scrollLeft);
    const last = ticks[ticks.length - 1];
    const visibleWidth = 3840 - parseFloat(node(".jantt-label-column").style.width);
    expect(parseFloat(last.style.left) + parseFloat(last.style.width)).toBeGreaterThanOrEqual(wrap.scrollLeft + visibleWidth);
  });
});
