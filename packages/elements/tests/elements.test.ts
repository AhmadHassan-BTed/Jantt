// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { JanttTimelineElement, registerJanttElement } from "../src/index";
import type { JanttData } from "@jantt/core";

describe("<jantt-timeline> Custom Element", () => {
  const samplePlan: JanttData = {
    tasks: [
      { id: "t1", label: "Spec", category: "dev", start: "2026-11-01", end: "2026-11-04" },
      { id: "t2", label: "Build", category: "dev", start: "2026-11-05", end: "2026-11-10", dependsOn: "t1" }
    ]
  };

  beforeEach(() => {
    registerJanttElement();
    document.body.innerHTML = "";
  });

  it("registers <jantt-timeline> in customElements registry", () => {
    expect(customElements.get("jantt-timeline")).toBeDefined();
  });

  it("mounts container element upon connection to DOM", () => {
    const el = document.createElement("jantt-timeline") as JanttTimelineElement;
    document.body.appendChild(el);

    const container = el.querySelector(".jantt-timeline-container");
    expect(container).toBeDefined();
    expect(container).not.toBeNull();
  });

  it("renders when data is set via property", () => {
    const el = document.createElement("jantt-timeline") as JanttTimelineElement;
    document.body.appendChild(el);

    el.data = samplePlan;
    expect(el.getData()).toEqual(samplePlan);
    expect(el.controller).not.toBeNull();
  });

  it("renders when data is provided via inline JSON attribute", () => {
    const el = document.createElement("jantt-timeline") as JanttTimelineElement;
    el.setAttribute("data", JSON.stringify(samplePlan));
    document.body.appendChild(el);

    expect(el.getData()).toEqual(samplePlan);
    expect(el.controller).not.toBeNull();
  });

  it("cleans up controller on disconnection", () => {
    const el = document.createElement("jantt-timeline") as JanttTimelineElement;
    document.body.appendChild(el);
    el.data = samplePlan;

    expect(el.controller).not.toBeNull();
    document.body.removeChild(el);
    expect(el.controller).toBeNull();
  });
});
