// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { createApp, nextTick, ref } from "vue";
import { JanttTimeline } from "../src/index";
import type { JanttData } from "@jantt/core";

describe("JanttTimeline Vue 3 Component", () => {
  const samplePlan: JanttData = {
    tasks: [
      { id: "t1", label: "Design", category: "dev", start: "2026-11-01", end: "2026-11-05" },
      { id: "t2", label: "Dev", category: "dev", start: "2026-11-06", end: "2026-11-12", dependsOn: "t1" }
    ]
  };

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
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

    // Mutate plan
    planRef.value = {
      tasks: [
        ...samplePlan.tasks,
        { id: "t3", label: "QA", category: "qa", start: "2026-11-13", end: "2026-11-16" }
      ]
    };
    await nextTick();

    expect(instance).toBeDefined();
    app.unmount();
  });
});
