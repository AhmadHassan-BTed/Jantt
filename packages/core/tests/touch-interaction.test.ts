// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { InteractionController } from "../src/controller";
import { JanttData, Task } from "../src/types";

// Polyfill PointerEvent in JSDOM if missing
if (typeof (globalThis as any).PointerEvent === "undefined") {
  class MockPointerEvent extends MouseEvent {
    pointerType: string;
    pointerId: number;

    constructor(type: string, params: any = {}) {
      super(type, params);
      this.pointerType = params.pointerType || "mouse";
      this.pointerId = params.pointerId || 0;
    }
  }
  (globalThis as any).PointerEvent = MockPointerEvent;
  (window as any).PointerEvent = MockPointerEvent;
}

describe("Touch & Mobile Interaction Controller", () => {
  const initialData: JanttData = {
    tasks: [
      { id: "task-1", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      { id: "task-2", category: "qa", start: "2026-09-06", end: "2026-09-10" }
    ]
  };

  function setupController(overridesOptions = {}) {
    const onRenderRequest = vi.fn();
    const openModalHandler = vi.fn();
    const container = document.createElement("div");
    const bodyWrap = document.createElement("div");
    bodyWrap.className = "jantt-body-wrap";
    container.appendChild(bodyWrap);

    const controller = new InteractionController(
      JSON.parse(JSON.stringify(initialData)),
      { ...overridesOptions },
      40,
      onRenderRequest,
      openModalHandler,
      undefined,
      undefined,
      container
    );

    return { controller, onRenderRequest, openModalHandler, container };
  }

  it("ignores marquee selection on touch events to preserve native touch scrolling", () => {
    const { controller, container } = setupController();
    const canvas = document.createElement("div");
    container.appendChild(canvas);

    const touchEvent = new PointerEvent("pointerdown", {
      pointerType: "touch",
      button: 0,
      clientX: 50,
      clientY: 50,
      cancelable: true
    });
    const preventDefaultSpy = vi.spyOn(touchEvent, "preventDefault");

    controller.startMarqueeSelection(touchEvent, canvas, []);

    // Verify marquee selection did not capture or prevent touch scroll
    expect(preventDefaultSpy).not.toHaveBeenCalled();
    expect(canvas.querySelector(".jantt-selection-box")).toBeNull();
  });

  it("suppresses splitter dragging on touch to avoid conflict with timeline panning", () => {
    const { controller } = setupController();
    const touchEvent = new PointerEvent("pointerdown", {
      pointerType: "touch",
      button: 0,
      clientX: 100,
      clientY: 100,
      cancelable: true
    });
    const preventDefaultSpy = vi.spyOn(touchEvent, "preventDefault");

    controller.startSplitterDrag(touchEvent, 200);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it("suppresses task bar dragging on touch and triggers openModalHandler on clean tap", () => {
    const { controller, openModalHandler } = setupController();
    const task = initialData.tasks[0];
    const bar = document.createElement("div");
    const captureSpy = vi.fn();
    bar.setPointerCapture = captureSpy;

    const touchDown = new PointerEvent("pointerdown", {
      pointerType: "touch",
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      cancelable: true
    });
    const preventDefaultSpy = vi.spyOn(touchDown, "preventDefault");

    controller.startDrag(touchDown, task, "move", bar);

    // Verify touch drag was not initiated (no preventDefault, no pointer capture)
    expect(preventDefaultSpy).not.toHaveBeenCalled();
    expect(captureSpy).not.toHaveBeenCalled();

    // Now simulate clean tap (release at almost same spot within short interval)
    const touchUp = new PointerEvent("pointerup", {
      pointerType: "touch",
      pointerId: 1,
      clientX: 102,
      clientY: 101
    });
    window.dispatchEvent(touchUp);

    // Tap should open modal
    expect(openModalHandler).toHaveBeenCalledWith(task);
  });

  it("does NOT open modal when touch gesture is a scroll/pan swipe (movement > 12px)", () => {
    const { controller, openModalHandler } = setupController();
    const task = initialData.tasks[0];
    const bar = document.createElement("div");

    const touchDown = new PointerEvent("pointerdown", {
      pointerType: "touch",
      pointerId: 2,
      clientX: 100,
      clientY: 100
    });

    controller.startDrag(touchDown, task, "move", bar);

    // Simulate pan/swipe (moved 50px)
    const touchUp = new PointerEvent("pointerup", {
      pointerType: "touch",
      pointerId: 2,
      clientX: 150,
      clientY: 110
    });
    window.dispatchEvent(touchUp);

    // Since user was panning, modal should NOT open
    expect(openModalHandler).not.toHaveBeenCalled();
  });
});
