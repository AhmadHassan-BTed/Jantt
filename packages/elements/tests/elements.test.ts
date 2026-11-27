// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderJantt } from "@jantt/core";
import type { JanttData, JanttOptions } from "@jantt/core";
import { JanttTimelineElement, registerJanttElement } from "../src/index";

// Pass-through spy so tests can reach the options the element hands to the engine.
vi.mock("@jantt/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@jantt/core")>();
  return { ...actual, renderJantt: vi.fn(actual.renderJantt) };
});

const renderJanttMock = vi.mocked(renderJantt);

describe("<jantt-timeline> Custom Element", () => {
  const samplePlan: JanttData = {
    tasks: [
      { id: "t1", label: "Spec", category: "dev", start: "2026-11-01", end: "2026-11-04" },
      { id: "t2", label: "Build", category: "dev", start: "2026-11-05", end: "2026-11-10", dependsOn: "t1" }
    ]
  };

  const otherPlan: JanttData = {
    tasks: [{ id: "x1", label: "Other", category: "dev", start: "2026-12-01", end: "2026-12-03" }]
  };

  const create = (attrs: Record<string, string> = {}): JanttTimelineElement => {
    const el = document.createElement("jantt-timeline") as JanttTimelineElement;
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  };

  const root = (el: HTMLElement) => el.querySelector(".jantt-container") as HTMLElement | null;

  beforeEach(() => {
    registerJanttElement();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("registers <jantt-timeline> in customElements registry", () => {
    expect(customElements.get("jantt-timeline")).toBeDefined();
  });

  it("mounts container element upon connection to DOM", () => {
    const el = create();
    document.body.appendChild(el);

    const container = el.querySelector(".jantt-timeline-container");
    expect(container).not.toBeNull();
  });

  it("renders when data is set via property", () => {
    const el = create();
    document.body.appendChild(el);

    el.data = samplePlan;
    expect(el.getData()).toEqual(samplePlan);
    expect(el.controller).not.toBeNull();
  });

  it("renders when data is provided via inline JSON attribute", () => {
    const el = create({ data: JSON.stringify(samplePlan) });
    document.body.appendChild(el);

    expect(el.getData()).toEqual(samplePlan);
    expect(el.controller).not.toBeNull();
  });

  it("updates the language from the locale attribute and property without replacing the chart", () => {
    const el = create({ locale: "zh-CN" });
    el.data = samplePlan;
    document.body.appendChild(el);
    try {
      expect(root(el)?.lang).toBe("zh-CN");
      expect(el.querySelector(".jantt-label-header")?.textContent).toContain("任务与分类");
      const instance = el.controller;
      el.locale = "en";
      expect(el.getAttribute("locale")).toBe("en");
      expect(el.querySelector(".jantt-label-header")?.textContent).toContain("Task & Category");
      expect(el.controller).toBe(instance);
    } finally {
      el.remove();
    }
  });

  it("cleans up controller on disconnection", () => {
    const el = create();
    document.body.appendChild(el);
    el.data = samplePlan;

    expect(el.controller).not.toBeNull();
    document.body.removeChild(el);
    expect(el.controller).toBeNull();
  });

  it("keeps data assigned before the element was defined", () => {
    const tag = "jantt-upgrade-test";
    const el = document.createElement(tag) as JanttTimelineElement;
    (el as unknown as { data: JanttData }).data = samplePlan;
    document.body.appendChild(el);

    customElements.define(tag, class extends JanttTimelineElement {});

    expect(el.getData()).toEqual(samplePlan);
    expect(el.controller).not.toBeNull();
  });

  it("updates the existing chart instead of remounting, keeping the user's zoom", () => {
    const el = create();
    document.body.appendChild(el);
    el.data = samplePlan;
    const controller = el.controller!;
    controller.setDayWidth(77);

    el.data = otherPlan;
    expect(el.controller).toBe(controller);
    expect(controller.getData().tasks.map((t) => t.id)).toEqual(["x1"]);
    expect(controller.getDayWidth()).toBe(77);

    el.setAttribute("scale", "month");
    expect(el.controller).toBe(controller);
    expect(controller.getDayWidth()).not.toBe(77);
  });

  it("skips its own committed plan once, but applies it again after other data (redo)", () => {
    const el = create();
    document.body.appendChild(el);
    el.data = samplePlan;
    const controller = el.controller!;
    const update = vi.spyOn(controller, "update");

    let committed: JanttData | null = null;
    el.addEventListener("jantt-plan-change", (e) => {
      committed = (e as CustomEvent).detail.data;
    });
    const options = renderJanttMock.mock.calls[renderJanttMock.mock.calls.length - 1][2] as JanttOptions;
    options.onCommit!(controller.getData()); // the engine commits an edit
    expect(committed).toBe(controller.getData());

    el.data = committed; // echo of the engine's plan
    expect(update).not.toHaveBeenCalled();

    el.data = otherPlan; // undo
    el.data = committed!; // redo
    expect(update).toHaveBeenCalledTimes(2);
    expect(controller.getData().tasks).toHaveLength(2);
  });

  it("maps show-critical-path and show-baselines to the viewport", () => {
    const el = create({ "show-critical-path": "" });
    el.data = samplePlan;
    document.body.appendChild(el);
    expect(root(el)!.classList.contains("jantt-show-critical")).toBe(true);

    el.setAttribute("show-critical-path", "false");
    expect(root(el)!.classList.contains("jantt-show-critical")).toBe(false);

    el.setAttribute("show-critical-path", "true");
    expect(root(el)!.classList.contains("jantt-show-critical")).toBe(true);

    el.removeAttribute("show-critical-path"); // back to the plan/engine default (off)
    expect(root(el)!.classList.contains("jantt-show-critical")).toBe(false);

    expect(() => el.setAttribute("show-baselines", "false")).not.toThrow();
  });

  it("applies built-in themes and warns once for unknown ones", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const el = create({ theme: "dark" });
    el.data = samplePlan;
    document.body.appendChild(el);
    expect(root(el)!.classList.contains("jantt-theme-dark")).toBe(true);
    expect(warn).not.toHaveBeenCalled();

    el.setAttribute("theme", "cyber-emerald");
    expect(root(el)!.classList.contains("jantt-theme-cyber-emerald")).toBe(true);
    expect(root(el)!.classList.contains("jantt-theme-dark")).toBe(false);

    el.setAttribute("theme", "zinc");
    el.refresh();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("zinc");
  });

  it("clears the chart when the data attribute is removed", () => {
    const el = create({ data: JSON.stringify(samplePlan) });
    document.body.appendChild(el);
    expect(el.controller).not.toBeNull();

    el.removeAttribute("data");
    expect(el.controller).toBeNull();
    expect(el.getData()).toBeNull();
  });

  it("dispatches a bubbling jantt-error for invalid inline JSON", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onError = vi.fn();
    document.addEventListener("jantt-error", onError);
    const el = create();
    document.body.appendChild(el);

    el.setAttribute("data", "{not json");
    expect(onError).toHaveBeenCalledTimes(1);

    // Markup parses the attribute once, not again on connect.
    document.body.innerHTML = '<jantt-timeline data="{not json"></jantt-timeline>';
    expect(onError).toHaveBeenCalledTimes(2);
    document.removeEventListener("jantt-error", onError);
  });

  it("never mounts an engine on a detached element", () => {
    const el = create();
    document.body.appendChild(el);
    document.body.removeChild(el);

    el.data = samplePlan;
    el.setAttribute("scale", "week");
    expect(el.controller).toBeNull();

    document.body.appendChild(el); // reattaching renders the latest data
    expect(el.controller).not.toBeNull();
    expect(el.controller!.getData().tasks).toHaveLength(2);
  });

  describe("data-src", () => {
    /** fetch stub whose responses resolve only when the test says so. */
    function stubFetch() {
      const pending = new Map<string, { resolve: (body: unknown, status?: number) => void; signal?: AbortSignal }>();
      const fetchMock = vi.fn((url: string, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          pending.set(url, {
            signal: init?.signal ?? undefined,
            resolve: (body, status = 200) =>
              resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response)
          });
        })
      );
      vi.stubGlobal("fetch", fetchMock);
      return { fetchMock, pending };
    }

    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    it("fetches once for a parsed element and renders the response", async () => {
      const { fetchMock, pending } = stubFetch();
      document.body.innerHTML = '<jantt-timeline data-src="/a.json"></jantt-timeline>';
      const el = document.querySelector("jantt-timeline") as JanttTimelineElement;
      expect(fetchMock).toHaveBeenCalledTimes(1);

      pending.get("/a.json")!.resolve(samplePlan);
      await flush();
      expect(el.controller!.getData().tasks).toHaveLength(2);

      // Reconnecting reuses the loaded data instead of refetching.
      document.body.removeChild(el);
      document.body.appendChild(el);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(el.controller).not.toBeNull();
    });

    it("ignores a stale response after data-src changed", async () => {
      const { pending } = stubFetch();
      const el = create({ "data-src": "/a.json" });
      document.body.appendChild(el);
      el.setAttribute("data-src", "/b.json");
      expect(pending.get("/a.json")!.signal?.aborted).toBe(true);

      pending.get("/b.json")!.resolve(otherPlan);
      await flush();
      pending.get("/a.json")!.resolve(samplePlan); // slow, stale response
      await flush();

      expect(el.getData()).toEqual(otherPlan);
    });

    it("aborts the request when the element is disconnected", () => {
      const { pending } = stubFetch();
      const el = create({ "data-src": "/a.json" });
      document.body.appendChild(el);
      document.body.removeChild(el);
      expect(pending.get("/a.json")!.signal?.aborted).toBe(true);
    });

    it("fetches only once connected, using the latest data-src", async () => {
      const { fetchMock, pending } = stubFetch();
      const el = create({ "data-src": "/a.json" });
      el.setAttribute("data-src", "/b.json");
      expect(fetchMock).not.toHaveBeenCalled();

      document.body.appendChild(el);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe("/b.json");

      pending.get("/b.json")!.resolve(otherPlan);
      await flush();
      expect(el.getData()).toEqual(otherPlan);

      // Setting data-src again while detached reloads on connect, as it would when connected.
      el.removeAttribute("data-src");
      el.data = samplePlan;
      document.body.removeChild(el);
      el.setAttribute("data-src", "/b.json");
      document.body.appendChild(el);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("rejects an invalid plan with jantt-error and keeps the current chart", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { pending } = stubFetch();
      const errors: Error[] = [];
      const el = create({ "data-src": "/a.json" });
      el.addEventListener("jantt-error", (e) => errors.push((e as CustomEvent).detail.error));
      document.body.appendChild(el);
      pending.get("/a.json")!.resolve(samplePlan);
      await flush();
      const controller = el.controller;

      el.setAttribute("data-src", "/bad.json");
      pending.get("/bad.json")!.resolve({ tasks: [{ id: "t1", label: "No dates" }] });
      await flush();

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("/bad.json");
      expect(errors[0].message).toContain("tasks[0]");
      expect(el.getData()).toEqual(samplePlan);
      expect(el.controller).toBe(controller);
      expect(controller!.getData().tasks).toHaveLength(2);
    });

    it("reports non-object responses and HTTP failures without mounting", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { pending } = stubFetch();
      const errors: Error[] = [];
      const el = create({ "data-src": "/null.json" });
      el.addEventListener("jantt-error", (e) => errors.push((e as CustomEvent).detail.error));
      document.body.appendChild(el);
      pending.get("/null.json")!.resolve(null);
      await flush();

      el.setAttribute("data-src", "/missing.json");
      pending.get("/missing.json")!.resolve(samplePlan, 404);
      await flush();

      expect(errors.map((e) => e.message)).toEqual([
        expect.stringContaining("not a valid Jantt plan"),
        expect.stringContaining("404")
      ]);
      expect(el.getData()).toBeNull();
      expect(el.controller).toBeNull();
    });
  });

  it("can be imported where HTMLElement does not exist (SSR)", async () => {
    vi.resetModules();
    vi.stubGlobal("HTMLElement", undefined);
    vi.stubGlobal("customElements", undefined);
    vi.stubGlobal("window", undefined);
    try {
      const mod = await import("../src/index");
      expect(typeof mod.JanttTimelineElement).toBe("function");
      expect(() => mod.registerJanttElement()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
