// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createApp, nextTick, ref, h } from "vue";
import { renderJantt } from "@jantt/core";
import type { JanttData, JanttInstance, JanttOptions } from "@jantt/core";
import { Jantt, JanttTimeline } from "../src/index";

// Wrap the real engine so tests can inspect the options it receives and count updates.
vi.mock("@jantt/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@jantt/core")>();
  return {
    ...actual,
    renderJantt: vi.fn((...args: Parameters<typeof actual.renderJantt>) => {
      const instance = actual.renderJantt(...args);
      instance.update = vi.fn(instance.update);
      return instance;
    })
  };
});

const renderJanttMock = vi.mocked(renderJantt);

describe("JanttTimeline Vue 3 Component", () => {
  const samplePlan: JanttData = {
    tasks: [
      { id: "t1", label: "Design", category: "dev", start: "2026-11-01", end: "2026-11-05" },
      { id: "t2", label: "Dev", category: "dev", start: "2026-11-06", end: "2026-11-12", dependsOn: "t1" }
    ]
  };

  const otherPlan: JanttData = {
    tasks: [{ id: "x1", label: "Other", category: "dev", start: "2026-12-01", end: "2026-12-03" }]
  };

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    renderJanttMock.mockClear();
  });

  /** Mounts the component with reactive props; returns the app plus the ready instance. */
  function mountTimeline(initialProps: Record<string, unknown>, listeners: Record<string, unknown> = {}) {
    const props = ref<Record<string, unknown>>(initialProps);
    let instance: JanttInstance | null = null;
    const app = createApp({
      setup: () => () =>
        h(JanttTimeline as any, {
          ...props.value,
          ...listeners,
          onReady: (inst: JanttInstance) => {
            instance = inst;
          }
        })
    });
    app.mount("#app");
    return {
      app,
      props,
      get instance() {
        return instance as unknown as JanttInstance & { update: ReturnType<typeof vi.fn> };
      },
      lastOptions: () => renderJanttMock.mock.calls[renderJanttMock.mock.calls.length - 1][2] as JanttOptions
    };
  }

  it("updates the chart locale from Vue props without remounting or resetting zoom", async () => {
    expect(Jantt).toBe(JanttTimeline);
    const { app, props, instance } = mountTimeline({ data: samplePlan, locale: "zh-CN" });
    try {
      const wrapper = document.querySelector<HTMLElement>(".jantt-vue-timeline-container")!;
      expect(wrapper.lang).toBe("zh-CN");
      expect(wrapper.querySelector(".jantt-label-header")?.textContent).toContain("任务与分类");
      expect(wrapper.querySelector(".jantt-search-input")?.getAttribute("aria-label")).toBe("搜索任务");
      expect(wrapper.querySelector(".jantt-settings-btn")?.getAttribute("aria-label")).toBe("图表设置");
      wrapper.querySelector<HTMLButtonElement>('.jantt-time-scale-group [data-scale="month"]')!.click();
      const zoom = instance.getDayWidth();
      expect(wrapper.querySelector('.jantt-time-scale-group [data-scale="month"]')?.getAttribute("aria-pressed")).toBe("true");

      wrapper.querySelector<HTMLElement>(".jantt-label-row[data-row-id='t1']")!.click();
      expect(document.querySelector(".jantt-sidebar-backdrop")?.getAttribute("lang")).toBe("zh-CN");
      expect(document.querySelector("#jantt-sidebar-save")?.textContent).toBe("保存更改");
      document.querySelector<HTMLButtonElement>("#jantt-sidebar-cancel")!.click();

      props.value = { ...props.value, locale: "en" };
      await nextTick();
      expect(wrapper.lang).toBe("en");
      expect(wrapper.querySelector(".jantt-label-header")?.textContent).toContain("Task & Category");
      expect(wrapper.querySelector(".jantt-search-input")?.getAttribute("aria-label")).toBe("Search tasks");
      expect(wrapper.querySelector(".jantt-task-bar")?.textContent).toContain("Design");
      expect(instance.getDayWidth()).toBe(zoom);
      expect(renderJanttMock).toHaveBeenCalledTimes(1);

      props.value = { ...props.value, locale: "fr-FR" };
      await nextTick();
      expect(wrapper.lang).toBe("en");
      expect(instance.update).toHaveBeenCalledTimes(1);
    } finally {
      app.unmount();
    }
  });

  it("mounts and renders DOM container elements properly", async () => {
    let readyInstance: any = null;

    const App = {
      components: { JanttTimeline },
      setup() {
        const plan = ref<JanttData>(samplePlan);
        const onReady = (inst: any) => {
          readyInstance = inst;
        };
        return { plan, onReady };
      },
      template: '<JanttTimeline :data="plan" @ready="onReady" />'
    };

    const app = createApp(App);
    app.mount("#app");
    await nextTick();

    const container = document.querySelector(".jantt-vue-timeline-container");
    expect(container).not.toBeNull();
    expect(readyInstance).not.toBeNull();
    expect(readyInstance.destroy).toBeDefined();

    app.unmount();
  });

  it("updates underlying chart when plan data prop changes reactively", async () => {
    let instance: any = null;
    const planRef = ref<JanttData>(samplePlan);

    const App = {
      components: { JanttTimeline },
      setup() {
        return {
          plan: planRef,
          onReady: (inst: any) => {
            instance = inst;
          }
        };
      },
      template: '<JanttTimeline :data="plan" @ready="onReady" />'
    };

    const app = createApp(App);
    app.mount("#app");
    await nextTick();

    expect(instance).not.toBeNull();

    // Replace the plan
    planRef.value = {
      tasks: [
        ...samplePlan.tasks,
        { id: "t3", label: "QA", category: "qa", start: "2026-11-13", end: "2026-11-16" }
      ]
    };
    await nextTick();
    expect(instance.getData().tasks).toHaveLength(3);

    // Mutate the plan in place
    planRef.value.tasks.push({ id: "t4", label: "Ship", category: "qa", start: "2026-11-17", end: "2026-11-18" });
    await nextTick();
    expect(instance.getData().tasks).toHaveLength(4);

    app.unmount();
  });

  it("leaves absent optional booleans and selectedDate to the engine defaults", () => {
    const t = mountTimeline({ data: samplePlan });
    const options = t.lastOptions();
    for (const key of ["autoCascade", "selectedDate", "showDateFilterBadge", "filterTasksByDate", "disableDragOnTouch", "isMobile"]) {
      expect(options[key as keyof JanttOptions]).toBeUndefined();
    }
    expect(options.className).toBeUndefined();
    t.app.unmount();
  });

  it("keeps the user's zoom when only data changes", async () => {
    const t = mountTimeline({ data: samplePlan, viewport: { scale: "week" } });
    t.instance.setDayWidth(80); // e.g. wheel zoom inside the chart

    t.props.value = { ...t.props.value, data: { tasks: [...samplePlan.tasks] } };
    await nextTick();

    expect(t.instance.update).toHaveBeenCalledTimes(1);
    expect(t.instance.update.mock.calls[0][1]).not.toHaveProperty("viewport");
    expect(t.instance.getDayWidth()).toBe(80);
    t.app.unmount();
  });

  it("forwards changed viewport keys only", async () => {
    const t = mountTimeline({ data: samplePlan, viewport: { scale: "week", showCriticalPath: false } });

    t.props.value = { ...t.props.value, viewport: { scale: "week", showCriticalPath: true } };
    await nextTick();

    const forwarded = t.instance.update.mock.calls[0][1].viewport;
    expect(forwarded).toEqual({ showCriticalPath: true });
    t.app.unmount();
  });

  it("reacts to selectedDate, isMobile and className changes", async () => {
    const t = mountTimeline({ data: samplePlan });

    t.props.value = { ...t.props.value, selectedDate: "2026-11-03" };
    await nextTick();
    expect(t.instance.getSelectedDate()).toBe("2026-11-03");

    t.props.value = { ...t.props.value, isMobile: true };
    await nextTick();
    expect(t.instance.update).toHaveBeenCalledTimes(2);
    expect(t.instance.update.mock.calls[1][1]).toMatchObject({ isMobile: true });

    t.props.value = { ...t.props.value, className: "my-chart" };
    await nextTick();
    expect(document.querySelector(".jantt-vue-timeline-container.my-chart")).not.toBeNull();
    t.app.unmount();
  });

  it("does not re-render when the engine's own commit is passed back as data", async () => {
    const onCommit = vi.fn();
    const t = mountTimeline({ data: samplePlan }, { onCommit });

    const committed = t.instance.getData();
    t.lastOptions().onCommit!(committed);
    expect(onCommit).toHaveBeenCalledWith(committed);

    t.props.value = { ...t.props.value, data: committed };
    await nextTick();
    expect(t.instance.update).not.toHaveBeenCalled();

    // Undo to an older plan, then redo back to the committed one: both must be applied.
    t.props.value = { ...t.props.value, data: otherPlan };
    await nextTick();
    t.props.value = { ...t.props.value, data: committed };
    await nextTick();
    expect(t.instance.update).toHaveBeenCalledTimes(2);
    expect(t.instance.getData().tasks).toHaveLength(2);
    t.app.unmount();
  });

  it("forwards toolbar data actions only for events that have a listener", () => {
    const onExportJson = vi.fn();
    const t = mountTimeline({ data: samplePlan }, { onExportJson });

    const options = t.lastOptions();
    expect(options.onExportJson).toBeTypeOf("function");
    expect(options.onImportJson).toBeUndefined();
    expect(options.onExportCsv).toBeUndefined();
    expect(options.onOpenAutoSave).toBeUndefined();

    options.onExportJson!();
    expect(onExportJson).toHaveBeenCalledTimes(1);
    t.app.unmount();
  });

  it("emits mount errors and retries once the data changes", async () => {
    renderJanttMock.mockImplementationOnce(() => {
      throw new Error("bad plan");
    });
    const onError = vi.fn();
    const t = mountTimeline({ data: samplePlan }, { onError });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "bad plan" }));
    expect(t.instance).toBeNull();

    t.props.value = { ...t.props.value, data: { tasks: [...samplePlan.tasks] } };
    await nextTick();
    expect(t.instance).not.toBeNull();
    expect(t.instance.getData().tasks).toHaveLength(2);
    t.app.unmount();
  });
});
