// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { InteractionController, InteractionHooks } from "../src/controller";
import { createTaskSidebar } from "../src/sidebar";
import { createDetailModal } from "../src/detail-modal";
import { renderJantt } from "../src/renderer";
import { JanttData, JanttOptions, Task } from "../src/types";

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

/** Deterministic requestAnimationFrame: frames run only when flushed. */
function installManualRaf() {
  if (typeof window.requestAnimationFrame !== "function") {
    (window as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number;
    (window as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
  }
  const queue = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  const caf = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    queue.delete(id);
  });
  return {
    flush() {
      const callbacks = Array.from(queue.values());
      queue.clear();
      callbacks.forEach((cb) => cb(0));
    },
    restore() {
      raf.mockRestore();
      caf.mockRestore();
    }
  };
}

const pointer = (type: string, init: Record<string, unknown> = {}) =>
  new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerType: "mouse",
    pointerId: 1,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
    clientX: 100,
    clientY: 100,
    ...init
  } as PointerEventInit);

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("Touch & Mobile Interaction Controller", () => {
  const initialData: JanttData = {
    tasks: [
      { id: "task-1", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      { id: "task-2", category: "qa", start: "2026-09-06", end: "2026-09-10" }
    ]
  };

  function setupController(overridesOptions: Partial<JanttOptions> = {}, data: JanttData = initialData) {
    const onRenderRequest = vi.fn();
    const openModalHandler = vi.fn();
    const container = document.createElement("div");
    const bodyWrap = document.createElement("div");
    bodyWrap.className = "jantt-body-wrap";
    container.appendChild(bodyWrap);

    const controller = new InteractionController(
      JSON.parse(JSON.stringify(data)),
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
    const onTaskClick = vi.fn();
    const { controller, openModalHandler } = setupController({ onTaskClick });
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

    // Tap should open modal and report the click to the host
    expect(openModalHandler).toHaveBeenCalledWith(task);
    expect(onTaskClick).toHaveBeenCalledWith(task);
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

  it("only lets the finger that touched the bar complete the tap", () => {
    const { controller, openModalHandler } = setupController();
    controller.startDrag(pointer("pointerdown", { pointerType: "touch", pointerId: 7 }), initialData.tasks[0], "move");

    window.dispatchEvent(pointer("pointerup", { pointerType: "touch", pointerId: 8 }));
    expect(openModalHandler).not.toHaveBeenCalled();

    window.dispatchEvent(pointer("pointerup", { pointerType: "touch", pointerId: 7 }));
    expect(openModalHandler).toHaveBeenCalledTimes(1);
  });

  it("removes pending tap listeners on destroy()", () => {
    const { controller, openModalHandler } = setupController();
    controller.startDrag(pointer("pointerdown", { pointerType: "touch", pointerId: 3 }), initialData.tasks[0], "move");
    controller.destroy();

    window.dispatchEvent(pointer("pointerup", { pointerType: "touch", pointerId: 3 }));
    expect(openModalHandler).not.toHaveBeenCalled();
  });

  it("allows mouse/laptop dragging of task bars even when disableDragOnTouch is enabled", () => {
    const { controller, container } = setupController({ disableDragOnTouch: true });
    const task = initialData.tasks[0];
    const bar = document.createElement("div");
    const captureSpy = vi.fn();
    // Capture goes to the persistent root, because bars are re-rendered during the drag
    container.setPointerCapture = captureSpy;

    const mouseDown = new PointerEvent("pointerdown", {
      pointerType: "mouse",
      pointerId: 3,
      clientX: 100,
      clientY: 100,
      button: 0,
      cancelable: true
    });
    const preventDefaultSpy = vi.spyOn(mouseDown, "preventDefault");

    controller.startDrag(mouseDown, task, "move", bar);

    // Mouse drag MUST be initiated: preventDefault called and capture set
    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(captureSpy).toHaveBeenCalledWith(3);
    expect(bar.classList.contains("is-dragging")).toBe(true);
    controller.destroy();
  });

  it("ignores non-primary mouse buttons on task bars", () => {
    const { controller } = setupController();
    const down = pointer("pointerdown", { button: 2 });
    const preventDefaultSpy = vi.spyOn(down, "preventDefault");
    controller.startDrag(down, initialData.tasks[0], "move", document.createElement("div"));
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it("allows mouse/laptop splitter dragging even when disableDragOnTouch or isMobile is true", () => {
    const { controller } = setupController({ disableDragOnTouch: true, isMobile: true });
    const mouseDown = new PointerEvent("pointerdown", {
      pointerType: "mouse",
      pointerId: 4,
      clientX: 200,
      clientY: 200,
      button: 0,
      cancelable: true
    });
    const preventDefaultSpy = vi.spyOn(mouseDown, "preventDefault");

    controller.startSplitterDrag(mouseDown, 250);

    expect(preventDefaultSpy).toHaveBeenCalled();
    controller.destroy();
  });

  it("allows mouse/laptop canvas drag to pan timeline bodyWrap scrollLeft", () => {
    const { controller, container } = setupController();
    const bodyWrap = container.querySelector<HTMLElement>(".jantt-body-wrap")!;
    bodyWrap.scrollLeft = 100;
    const canvas = document.createElement("div");
    bodyWrap.appendChild(canvas);

    controller.startCanvasDrag(pointer("pointerdown", { pointerId: 5, clientX: 200, clientY: 200 }), canvas, []);

    // Move pointer left by 50px (simulating dragging timeline to scroll right)
    window.dispatchEvent(pointer("pointermove", { pointerId: 5, clientX: 150, clientY: 200 }));

    // bodyWrap.scrollLeft should have panned: origScrollLeft (100) - deltaX (-50) = 150
    expect(bodyWrap.scrollLeft).toBe(150);

    window.dispatchEvent(pointer("pointerup", { pointerId: 5, clientX: 150, clientY: 200 }));
  });
});

describe("Interaction controller gesture lifecycle", () => {
  const plan = (): JanttData => ({
    tasks: [
      { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      { id: "b", category: "dev", start: "2026-09-07", end: "2026-09-10", dependsOn: "a" }
    ]
  });

  function setup(options: Partial<JanttOptions> = {}, data: JanttData = plan()) {
    const raf = installManualRaf();
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const onTaskClick = vi.fn();
    const openModalHandler = vi.fn();
    const onRenderRequest = vi.fn();
    const container = document.createElement("div");
    const bodyWrap = document.createElement("div");
    bodyWrap.className = "jantt-body-wrap";
    container.appendChild(bodyWrap);
    document.body.appendChild(container);
    const controller = new InteractionController(
      data,
      { onChange, onCommit, onTaskClick, ...options },
      40,
      onRenderRequest,
      openModalHandler,
      undefined,
      undefined,
      container
    );
    const task = (id: string) => controller.getData().tasks.find((t) => t.id === id)!;
    return { controller, raf, onChange, onCommit, onTaskClick, openModalHandler, onRenderRequest, container, bodyWrap, task };
  }

  it("pointercancel restores the original dates and never commits", () => {
    const { controller, raf, onChange, onCommit, task } = setup();
    controller.startDrag(pointer("pointerdown"), task("a"), "move", document.createElement("div"));
    window.dispatchEvent(pointer("pointermove", { clientX: 180 }));
    raf.flush();
    expect(task("a").start).toBe("2026-09-03");

    window.dispatchEvent(pointer("pointercancel"));
    expect(task("a").start).toBe("2026-09-01");
    expect(task("b").start).toBe("2026-09-07");
    expect(onCommit).not.toHaveBeenCalled();
    expect(onChange.mock.lastCall?.[0].tasks[0].start).toBe("2026-09-01");
    raf.restore();
  });

  it("Escape cancels an active drag", () => {
    const { controller, raf, onCommit, task } = setup();
    controller.startDrag(pointer("pointerdown"), task("a"), "resize", document.createElement("div"));
    window.dispatchEvent(pointer("pointermove", { clientX: 260 }));
    expect(task("a").end).toBe("2026-09-09");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(task("a").end).toBe("2026-09-05");

    // The gesture is over: further moves and the release do nothing
    window.dispatchEvent(pointer("pointermove", { clientX: 300 }));
    window.dispatchEvent(pointer("pointerup", { clientX: 300 }));
    expect(task("a").end).toBe("2026-09-05");
    expect(onCommit).not.toHaveBeenCalled();
    raf.restore();
  });

  it("ignores other pointers and a second gesture while one is active", () => {
    const { controller, raf, task } = setup();
    controller.startDrag(pointer("pointerdown", { pointerId: 1 }), task("a"), "move", document.createElement("div"));
    controller.startDrag(pointer("pointerdown", { pointerId: 2 }), task("b"), "move", document.createElement("div"));

    window.dispatchEvent(pointer("pointermove", { pointerId: 2, clientX: 300 }));
    expect(task("a").start).toBe("2026-09-01");

    window.dispatchEvent(pointer("pointermove", { pointerId: 1, clientX: 140 }));
    expect(task("a").start).toBe("2026-09-02");
    controller.destroy();
    raf.restore();
  });

  it("cancels only when the root itself loses pointer capture", () => {
    const { controller, raf, task, bodyWrap, container } = setup();
    controller.startDrag(pointer("pointerdown"), task("a"), "move", document.createElement("div"));
    window.dispatchEvent(pointer("pointermove", { clientX: 140 }));

    // A descendant's capture change bubbles up to the root: the drag goes on
    bodyWrap.dispatchEvent(pointer("lostpointercapture"));
    window.dispatchEvent(pointer("pointermove", { clientX: 180 }));
    expect(task("a").start).toBe("2026-09-03");

    container.dispatchEvent(pointer("lostpointercapture"));
    expect(task("a").start).toBe("2026-09-01");
    raf.restore();
  });

  it("treats sub-threshold jitter as a click: no date change, opens the task", () => {
    const { controller, raf, onCommit, onTaskClick, openModalHandler, task } = setup({}, {
      tasks: [{ id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" }]
    });
    // Year zoom: 2.2px per day, so even 2px of jitter would be a whole day
    controller.updateData(controller.getData(), 2.2);
    controller.startDrag(pointer("pointerdown"), task("a"), "move", document.createElement("div"));
    window.dispatchEvent(pointer("pointermove", { clientX: 102 }));
    window.dispatchEvent(pointer("pointerup", { clientX: 102 }));

    expect(task("a").start).toBe("2026-09-01");
    expect(onCommit).not.toHaveBeenCalled();
    expect(onTaskClick).toHaveBeenCalledTimes(1);
    expect(openModalHandler).toHaveBeenCalledTimes(1);
    raf.restore();
  });

  it("finishes the drag when the mouse button was released outside the window", () => {
    const { controller, raf, onCommit, task } = setup();
    controller.startDrag(pointer("pointerdown"), task("a"), "move", document.createElement("div"));
    window.dispatchEvent(pointer("pointermove", { clientX: 140 }));
    // Next move arrives with no button pressed: the pointerup was lost
    window.dispatchEvent(pointer("pointermove", { clientX: 400, buttons: 0 }));

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(task("a").start).toBe("2026-09-02");
    window.dispatchEvent(pointer("pointermove", { clientX: 600 }));
    expect(task("a").start).toBe("2026-09-02");
    raf.restore();
  });

  it("coalesces onChange to one call per animation frame during a drag", () => {
    const { controller, raf, onChange, task } = setup();
    controller.startDrag(pointer("pointerdown"), task("a"), "move", document.createElement("div"));
    window.dispatchEvent(pointer("pointermove", { clientX: 140 }));
    window.dispatchEvent(pointer("pointermove", { clientX: 180 }));
    window.dispatchEvent(pointer("pointermove", { clientX: 220 }));
    expect(onChange).not.toHaveBeenCalled();

    raf.flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].tasks[0].start).toBe("2026-09-04");
    controller.destroy();
    raf.restore();
  });

  it("hands hosts committed payloads that later drags never mutate", () => {
    const { controller, raf, onCommit, task } = setup();
    controller.startDrag(pointer("pointerdown"), task("a"), "move", document.createElement("div"));
    window.dispatchEvent(pointer("pointermove", { clientX: 180 }));
    window.dispatchEvent(pointer("pointerup", { clientX: 180 }));
    const committed: JanttData = onCommit.mock.calls[0][0];
    const snapshot = JSON.stringify(committed);
    expect(committed.tasks[0].start).toBe("2026-09-03");

    controller.startDrag(pointer("pointerdown"), task("a"), "move", document.createElement("div"));
    window.dispatchEvent(pointer("pointermove", { clientX: 300 }));
    window.dispatchEvent(pointer("pointerup", { clientX: 300 }));

    expect(JSON.stringify(committed)).toBe(snapshot);
    expect(onCommit.mock.calls[1][0].tasks[0].start).not.toBe("2026-09-03");
    raf.restore();
  });

  it("read-only: a press on a bar opens it on release, and a drag pans instead", () => {
    const { controller, raf, openModalHandler, onTaskClick, bodyWrap, task } = setup({ readOnly: true });
    controller.startDrag(pointer("pointerdown"), task("a"), "move", document.createElement("div"));
    expect(openModalHandler).not.toHaveBeenCalled();
    window.dispatchEvent(pointer("pointerup"));
    expect(openModalHandler).toHaveBeenCalledTimes(1);
    expect(onTaskClick).toHaveBeenCalledTimes(1);

    bodyWrap.scrollLeft = 300;
    controller.startDrag(pointer("pointerdown"), task("a"), "move", document.createElement("div"));
    window.dispatchEvent(pointer("pointermove", { clientX: 40 }));
    window.dispatchEvent(pointer("pointerup", { clientX: 40 }));
    expect(bodyWrap.scrollLeft).toBe(360);
    expect(openModalHandler).toHaveBeenCalledTimes(1);
    expect(task("a").start).toBe("2026-09-01");
    raf.restore();
  });

  it("read-only: Auto-Cascade toggles the view flag only and locks cannot change", () => {
    const { controller, raf, onCommit, task } = setup({ readOnly: true, autoCascade: false });
    expect(controller.toggleAutoCascade()).toBe(true);
    controller.toggleTaskLock("a");
    expect(task("a").locked).toBeUndefined();
    expect(onCommit).not.toHaveBeenCalled();
    raf.restore();
  });
});

describe("Interaction controller keyboard editing", () => {
  function setup(data: JanttData, options: Partial<JanttOptions> = {}) {
    const onCommit = vi.fn();
    const onTaskDelete = vi.fn();
    const openModalHandler = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderBars = () => {
      container.innerHTML = "";
      controller.getData().tasks.forEach((t) => {
        const bar = document.createElement("div");
        bar.className = "jantt-task-bar";
        bar.dataset.taskId = t.id;
        bar.tabIndex = 0;
        container.appendChild(bar);
      });
    };
    const onRenderRequest = vi.fn(renderBars);
    const controller: InteractionController = new InteractionController(
      data,
      { onCommit, onTaskDelete, ...options },
      40,
      onRenderRequest,
      openModalHandler,
      undefined,
      undefined,
      container
    );
    renderBars();
    const task = (id: string) => controller.getData().tasks.find((t) => t.id === id);
    const key = (id: string, init: KeyboardEventInit) => controller.handleKeyDown(new KeyboardEvent("keydown", init), task(id)!);
    return { controller, onCommit, onTaskDelete, openModalHandler, onRenderRequest, container, task, key };
  }

  it("Delete removes the task from the live data and keeps other typed links", () => {
    const { key, task, controller, onCommit, onTaskDelete } = setup({
      tasks: [
        { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "c", category: "dev", start: "2026-09-01", end: "2026-09-02" },
        { id: "b", category: "dev", start: "2026-09-10", end: "2026-09-12", dependsOn: [{ id: "a", type: "SS", lagDays: 2 }, "c"] }
      ]
    });

    key("c", { key: "Delete" });

    expect(task("c")).toBeUndefined();
    expect(controller.getData().tasks).toHaveLength(2);
    expect(task("b")?.dependsOn).toEqual({ id: "a", type: "SS", lagDays: 2 });
    expect(onTaskDelete).toHaveBeenCalledWith("c");
    expect(onCommit.mock.calls[0][0].tasks.map((t: Task) => t.id)).toEqual(["a", "b"]);
  });

  it("Strict mode: Delete does not reschedule the remaining tasks", () => {
    const { key, task } = setup(
      {
        tasks: [
          { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" },
          { id: "c", category: "dev", start: "2026-09-01", end: "2026-09-02" },
          // Manually placed before what its link to "a" allows (legal in Strict mode)
          { id: "b", category: "dev", start: "2026-09-03", end: "2026-09-04", dependsOn: "a" }
        ]
      },
      { autoCascade: false }
    );
    key("c", { key: "Delete" });
    expect(task("c")).toBeUndefined();
    expect(task("b")?.start).toBe("2026-09-03");
  });

  it("arrow nudges cascade into the live data and keep keyboard focus", () => {
    const { key, task, container, onCommit } = setup({
      tasks: [
        { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "b", category: "dev", start: "2026-09-07", end: "2026-09-10", dependsOn: "a" }
      ]
    });
    container.querySelector<HTMLElement>('[data-task-id="a"]')!.focus();

    key("a", { key: "ArrowRight" });

    expect(task("a")?.start).toBe("2026-09-02");
    expect(task("b")?.start).toBe("2026-09-08");
    expect(onCommit.mock.calls[0][0].tasks[1].start).toBe("2026-09-08");
    // The focused bar was re-rendered; focus moved to its replacement
    expect((document.activeElement as HTMLElement).dataset.taskId).toBe("a");
  });

  it("Strict mode: ArrowLeft cannot break a dependency", () => {
    const { key, task, onCommit } = setup(
      {
        tasks: [
          { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" },
          { id: "b", category: "dev", start: "2026-09-07", end: "2026-09-10", dependsOn: "a" }
        ]
      },
      { autoCascade: false }
    );
    key("b", { key: "ArrowLeft" });
    expect(task("b")?.start).toBe("2026-09-07");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("Strict mode: links to ids that look like lag shorthand still constrain arrow nudges", () => {
    const { key, task, onCommit } = setup(
      {
        tasks: [
          { id: "model-3d", category: "dev", start: "2026-09-01", end: "2026-09-05" },
          { id: "b", category: "dev", start: "2026-09-07", end: "2026-09-10", dependsOn: "model-3d" }
        ]
      },
      { autoCascade: false }
    );
    key("b", { key: "ArrowLeft" });
    expect(task("b")?.start).toBe("2026-09-07");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("Shift+ArrowLeft never shrinks a task below the resize minimum", () => {
    const { key, task, onCommit } = setup({ tasks: [{ id: "a", category: "dev", start: "2026-09-01", end: "2026-09-02" }] });
    key("a", { key: "ArrowLeft", shiftKey: true });
    expect(task("a")?.end).toBe("2026-09-02");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("leaves keys aimed at the bar's lock button to the button", () => {
    const { controller, task, openModalHandler } = setup({ tasks: [{ id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" }] });
    const bar = document.createElement("div");
    const lockBtn = document.createElement("button");
    bar.appendChild(lockBtn);
    document.body.appendChild(bar);
    bar.addEventListener("keydown", (e) => controller.handleKeyDown(e, task("a")!));

    lockBtn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(openModalHandler).not.toHaveBeenCalled();

    bar.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(openModalHandler).toHaveBeenCalledTimes(1);
  });

  it("keyboard edits on a mounted chart reach instance.getData()", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const onCommit = vi.fn();
    const chart = renderJantt(
      host,
      {
        categories: { dev: { label: "Dev", color: "#3B82F6" } },
        tasks: [
          { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" },
          { id: "b", category: "dev", start: "2026-09-07", end: "2026-09-10", dependsOn: "a" }
        ]
      },
      { onCommit }
    );
    const bar = (id: string) =>
      Array.from(host.querySelectorAll<HTMLElement>(".jantt-task-bar[data-task-id]")).find((el) => el.dataset.taskId === id)!;

    bar("a").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(chart.getData().tasks.find((t) => t.id === "b")?.start).toBe("2026-09-08");

    bar("a").dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    expect(chart.getData().tasks.map((t) => t.id)).toEqual(["b"]);
    expect(onCommit).toHaveBeenCalledTimes(2);
    chart.destroy();
  });

  it("drags on a mounted chart commit once, and Escape restores the plan", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const onCommit = vi.fn();
    const chart = renderJantt(
      host,
      { tasks: [{ id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" }] },
      { onCommit, viewport: { dayWidth: 40 } }
    );
    const bar = () => host.querySelector<HTMLElement>('.jantt-task-bar[data-task-id="a"]')!;

    bar().dispatchEvent(pointer("pointerdown", { clientX: 100 }));
    window.dispatchEvent(pointer("pointermove", { clientX: 180 }));
    window.dispatchEvent(pointer("pointerup", { clientX: 180 }));
    expect(chart.getData().tasks[0].start).toBe("2026-09-03");
    expect(onCommit).toHaveBeenCalledTimes(1);

    bar().dispatchEvent(pointer("pointerdown", { clientX: 100 }));
    window.dispatchEvent(pointer("pointermove", { clientX: 300 }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(chart.getData().tasks[0].start).toBe("2026-09-03");
    expect(onCommit).toHaveBeenCalledTimes(1);
    chart.destroy();
  });

  it("Escape with nothing selected does not re-render", () => {
    const { key, onRenderRequest } = setup({ tasks: [{ id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" }] });
    onRenderRequest.mockClear();
    key("a", { key: "Escape" });
    expect(onRenderRequest).not.toHaveBeenCalled();
  });
});

describe("Interaction controller host hooks", () => {
  const deepFreeze = <T>(value: T): T => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  };

  const plan = (): JanttData => ({
    tasks: [
      { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      { id: "b", category: "dev", start: "2026-09-07", end: "2026-09-10", dependsOn: "a" },
      { id: "z", category: "dev", start: "2026-09-01", end: "2026-09-03" }
    ]
  });

  function setup(data: JanttData, hooks: InteractionHooks) {
    const raf = installManualRaf();
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderBars = vi.fn(() => {
      container.innerHTML = "";
      controller.getData().tasks.forEach((t) => {
        const bar = document.createElement("div");
        bar.className = "jantt-task-bar";
        bar.dataset.taskId = t.id;
        container.appendChild(bar);
      });
    });
    const controller: InteractionController = new InteractionController(
      data,
      { onChange, onCommit },
      40,
      renderBars,
      vi.fn(),
      undefined,
      undefined,
      container,
      hooks
    );
    renderBars();
    renderBars.mockClear();
    const task = (id: string) => controller.getData().tasks.find((t) => t.id === id)!;
    const drag = (id: string) => controller.startDrag(pointer("pointerdown"), task(id), "move", document.createElement("div"));
    return { controller, raf, onChange, onCommit, renderBars, task, drag };
  }

  it("with onDataChange the given container is never mutated and every change is a new container", () => {
    const frozen = deepFreeze(plan());
    const seen: JanttData[] = [];
    const { controller, raf, onCommit, task, drag } = setup(frozen, { onDataChange: (next) => seen.push(next) });

    controller.handleKeyDown(new KeyboardEvent("keydown", { key: "ArrowRight" }), task("a"));
    controller.handleKeyDown(new KeyboardEvent("keydown", { key: "Delete" }), task("z"));
    drag("a");
    window.dispatchEvent(pointer("pointermove", { clientX: 180 }));
    window.dispatchEvent(pointer("pointerup", { clientX: 180 }));

    expect(seen.length).toBeGreaterThanOrEqual(3);
    seen.forEach((next, i) => expect(next).not.toBe(i === 0 ? frozen : seen[i - 1]));
    expect(controller.getData()).toBe(seen[seen.length - 1]);
    expect(task("a").start).toBe("2026-09-04");
    expect(task("b").start).toBe("2026-09-10");
    expect(task("z")).toBeUndefined();
    expect(frozen.tasks.map((t) => t.start)).toEqual(["2026-09-01", "2026-09-07", "2026-09-01"]);
    expect(onCommit).toHaveBeenCalledTimes(3);
    raf.restore();
  });

  it("with onGestureFrame a drag patches only the changed bars between full renders", () => {
    const frames: string[][] = [];
    const { raf, onChange, onCommit, renderBars, drag } = setup(plan(), {
      onGestureFrame: (ids) => {
        frames.push(Array.from(ids).sort());
        return true;
      }
    });

    drag("a");
    window.dispatchEvent(pointer("pointermove", { clientX: 140 }));
    raf.flush(); // The first frame of a gesture renders fully (selection change, patch baseline)
    window.dispatchEvent(pointer("pointermove", { clientX: 180 }));
    raf.flush();
    window.dispatchEvent(pointer("pointermove", { clientX: 220 }));
    raf.flush();

    expect(renderBars).toHaveBeenCalledTimes(1);
    // The moved task and its cascaded successor; the unrelated task is untouched
    expect(frames).toEqual([
      ["a", "b"],
      ["a", "b"]
    ]);
    expect(onChange).toHaveBeenCalledTimes(3);

    window.dispatchEvent(pointer("pointerup", { clientX: 220 }));
    expect(renderBars).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenCalledTimes(1);
    raf.restore();
  });

  it("renders fully when onGestureFrame declines a frame or the gesture is cancelled", () => {
    const onGestureFrame = vi.fn(() => false);
    const { raf, renderBars, task, drag } = setup(plan(), { onGestureFrame });

    drag("a");
    window.dispatchEvent(pointer("pointermove", { clientX: 140 }));
    raf.flush();
    window.dispatchEvent(pointer("pointermove", { clientX: 180 }));
    raf.flush();
    expect(onGestureFrame).toHaveBeenCalledTimes(1);
    expect(renderBars).toHaveBeenCalledTimes(2);

    window.dispatchEvent(pointer("pointercancel"));
    expect(renderBars).toHaveBeenCalledTimes(3);
    expect(task("a").start).toBe("2026-09-01");
    raf.restore();
  });
});

describe("Task sidebar (detail drawer)", () => {
  const categories = { dev: { label: "Development", color: "#3B82F6" } };

  function open(task: Task, extra: Partial<Parameters<typeof createTaskSidebar>[0]> = {}) {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const sidebar = createTaskSidebar({ task, allTasks: [task], categories, onSave, onClose, ...extra });
    const save = () => sidebar.element.querySelector<HTMLButtonElement>("#jantt-sidebar-save")!.click();
    return { sidebar, onSave, onClose, save };
  }

  it("escapes every plan value it renders (no injected markup or handlers)", () => {
    const evil = '"><img src=x onerror="window.__janttXss=1">';
    const task: Task = { id: "t1", category: "dev", start: `2026-09-01${evil}`, end: evil, estimatedCost: evil as any };
    const other: Task = { id: "t2", label: "Other", category: "dev", start: "2026-09-01", end: evil };
    const { sidebar } = open(task, {
      allTasks: [task, other],
      categories: { dev: { label: "Dev", color: `red${evil}` } }
    });

    const all = Array.from(sidebar.element.querySelectorAll("*"));
    expect(sidebar.element.querySelectorAll("img")).toHaveLength(0);
    expect(all.some((el) => Array.from(el.attributes).some((a) => a.name.startsWith("on")))).toBe(false);
    expect(sidebar.element.querySelector(".jantt-hover-dot")?.getAttribute("style")).toContain("#38BDF8");
    expect((window as any).__janttXss).toBeUndefined();
  });

  it.each([
    '"><img src=x onerror="window.__janttXss=1">',
    "</textarea><script>window.__janttXss=2</script>",
    "'><iframe src=javascript:window.__janttXss=3>",
    "url(javascript:window.__janttXss=4)"
  ])("renders hostile text in every field as text only: %s", (payload) => {
    const other: Task = { id: `${payload}-p`, label: payload, category: payload, start: "2026-08-01", end: payload };
    const task: Task = {
      id: payload,
      label: payload,
      category: payload,
      start: payload,
      end: payload,
      status: payload as Task["status"],
      priority: payload as Task["priority"],
      assignee: payload,
      wbs: payload,
      notes: payload,
      estimatedCost: payload as any,
      dependsOn: [{ id: other.id }],
      fields: { [payload]: payload }
    };
    const { sidebar } = open(task, {
      allTasks: [other, task],
      categories: { [payload]: { label: payload, color: payload } }
    });
    const root = sidebar.element;
    const all = Array.from(root.querySelectorAll("*"));

    expect(root.querySelectorAll("img, script, iframe")).toHaveLength(0);
    expect(all.some((el) => Array.from(el.attributes).some((a) => a.name.startsWith("on")))).toBe(false);
    expect(all.some((el) => (el.getAttribute("style") || "").includes("url("))).toBe(false);
    // Escaped exactly once: form controls hold the raw text
    for (const id of ["#jantt-sidebar-label", "#jantt-sidebar-assignee", "#jantt-sidebar-wbs", "#jantt-sidebar-notes"]) {
      expect(root.querySelector<HTMLInputElement>(id)?.value).toBe(payload);
    }
    expect(root.querySelector<HTMLInputElement>("[data-field-val-key]")?.value).toBe(payload);
    expect(root.querySelector("#jantt-sidebar-dep-chips")?.textContent).toContain(payload);
    expect((window as any).__janttXss).toBeUndefined();
  });

  it("reads links to ids that look like lag shorthand as ids, and adds new ones unambiguously", () => {
    const model: Task = { id: "model-3d", label: "Model", category: "dev", start: "2026-09-01", end: "2026-09-05" };
    const render: Task = { id: "render-3d", label: "Render", category: "dev", start: "2026-09-01", end: "2026-09-02" };
    const task: Task = { id: "t1", category: "dev", start: "2026-09-08", end: "2026-09-09", dependsOn: "model-3d" };
    const { sidebar, onSave, save } = open(task, { allTasks: [model, render, task] });
    const chips = sidebar.element.querySelector("#jantt-sidebar-dep-chips")!;
    expect(chips.textContent).toContain("Model (#model-3d)");
    expect(chips.textContent).not.toContain("FS-3d");
    const options = Array.from(sidebar.element.querySelectorAll<HTMLOptionElement>("#jantt-sidebar-add-dep-select option")).map((o) => o.value);
    expect(options).toEqual(["", "render-3d"]);

    const select = sidebar.element.querySelector<HTMLSelectElement>("#jantt-sidebar-add-dep-select")!;
    select.value = "render-3d";
    select.dispatchEvent(new Event("change"));
    save();
    expect(onSave.mock.calls[0][0].dependsOn).toEqual(["model-3d", { id: "render-3d" }]);
  });

  it("keeps progress and a missing status when only the notes are edited", () => {
    const { sidebar, onSave, save } = open({ id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-05", progress: 0.6 });
    sidebar.element.querySelector<HTMLTextAreaElement>("#jantt-sidebar-notes")!.value = "Updated";
    save();

    const saved: Task = onSave.mock.calls[0][0];
    expect(saved.progress).toBe(0.6);
    expect(saved.status).toBeUndefined();
    expect(saved.notes).toBe("Updated");
    // Saves the task as opened plus the edits: no empty `fields` bag appears
    expect(Object.keys(saved).sort()).toEqual(["category", "end", "id", "notes", "progress", "start"]);
  });

  it("shows same-day tasks as 0-day milestones, like the chart draws them", () => {
    const { sidebar } = open({ id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-01" });
    expect(sidebar.element.querySelector("#jantt-sidebar-duration")?.textContent?.trim()).toBe("0 days");
  });

  it("preserves unknown status, category and unset priority on save", () => {
    const task: Task = { id: "t1", category: "legacy", start: "2026-09-01", end: "2026-09-05", status: "done", progress: 1, urgent: true };
    const { onSave, save } = open(task);
    save();
    const saved: Task = onSave.mock.calls[0][0];
    expect(saved.status).toBe("done");
    expect(saved.category).toBe("legacy");
    expect(saved.priority).toBeUndefined();
    expect(saved.progress).toBe(1);
  });

  it("keeps typed dependencies (SS/FF/lag) when saving and when removing another link", () => {
    const a: Task = { id: "a", category: "dev", start: "2026-08-01", end: "2026-08-03" };
    const c: Task = { id: "c", category: "dev", start: "2026-08-01", end: "2026-08-02" };
    const task: Task = {
      id: "t1",
      category: "dev",
      start: "2026-09-01",
      end: "2026-09-05",
      dependsOn: [{ id: "a", type: "SS", lagDays: 2 }, "c:FF+1d"]
    };
    const first = open(task, { allTasks: [a, c, task] });
    first.save();
    expect(first.onSave.mock.calls[0][0].dependsOn).toEqual(task.dependsOn);

    const second = open(task, { allTasks: [a, c, task] });
    const chips = second.sidebar.element.querySelectorAll<HTMLButtonElement>("[data-remove-dep-index]");
    expect(chips).toHaveLength(2);
    expect(second.sidebar.element.querySelector("#jantt-sidebar-dep-chips")?.textContent).toContain("SS+2d");
    chips[1].click();
    second.save();
    expect(second.onSave.mock.calls[0][0].dependsOn).toEqual({ id: "a", type: "SS", lagDays: 2 });
  });

  it("writes custom fields back with their original types", () => {
    const task: Task = {
      id: "t1",
      category: "dev",
      start: "2026-09-01",
      end: "2026-09-05",
      fields: { count: 42, flag: true, meta: { a: 1 }, note: "x" }
    };
    const untouched = open(task);
    untouched.save();
    expect(untouched.onSave.mock.calls[0][0].fields).toEqual(task.fields);

    const edited = open(task);
    const input = edited.sidebar.element.querySelector<HTMLInputElement>('[data-field-val-key="count"]')!;
    input.value = "43";
    input.dispatchEvent(new Event("input"));
    edited.save();
    expect(edited.onSave.mock.calls[0][0].fields).toEqual({ count: 43, flag: true, meta: { a: 1 }, note: "x" });
  });

  it("never offers successors as prerequisites (no cycles)", () => {
    const a: Task = { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-02" };
    const b: Task = { id: "b", category: "dev", start: "2026-09-03", end: "2026-09-04", dependsOn: "a" };
    const c: Task = { id: "c", category: "dev", start: "2026-09-05", end: "2026-09-06", dependsOn: "b" };
    const d: Task = { id: "d", category: "dev", start: "2026-09-05", end: "2026-09-06" };
    const { sidebar } = open(a, { allTasks: [a, b, c, d] });
    const values = Array.from(sidebar.element.querySelectorAll<HTMLOptionElement>("#jantt-sidebar-add-dep-select option")).map((o) => o.value);
    expect(values).toEqual(["", "d"]);
  });

  it("shows inclusive durations and flags conflicts with the scheduler's gap", () => {
    const a: Task = { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" };
    const b: Task = { id: "b", category: "dev", start: "2026-09-06", end: "2026-09-08", dependsOn: "a" };
    const withGap = open(b, { allTasks: [a, b] });
    expect(withGap.sidebar.element.querySelector("#jantt-sidebar-duration")?.textContent?.trim()).toBe("3 days");
    expect(withGap.sidebar.element.querySelector("#jantt-sidebar-dep-conflict-box")?.textContent).toContain("2026-09-07");

    const noGap = open(b, { allTasks: [a, b], scheduleOptions: { defaultGapDays: 0 } });
    expect((noGap.sidebar.element.querySelector("#jantt-sidebar-dep-conflict-box") as HTMLElement).style.display).toBe("none");
  });

  it("hides Delete for locked tasks", () => {
    const { sidebar } = open({ id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-05", locked: true }, { onDelete: vi.fn() });
    expect(sidebar.element.querySelector("#jantt-sidebar-delete")).toBeNull();
  });

  it("closes once and reports onClose synchronously", () => {
    const { sidebar, onClose } = open({ id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-05" });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    sidebar.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not drop unsaved edits on Escape until confirmed", () => {
    const { sidebar, onClose } = open({ id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-05" });
    expect(document.querySelector(".jantt-sidebar-backdrop")?.getAttribute("aria-modal")).toBe("true");
    sidebar.element.querySelector<HTMLTextAreaElement>("#jantt-sidebar-notes")!.value = "draft";

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).not.toHaveBeenCalled();
    expect((sidebar.element.querySelector("#jantt-sidebar-unsaved") as HTMLElement).style.display).toBe("flex");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("gives custom renderers the read-only/locked state and blocks their writes", () => {
    const onSave = vi.fn();
    const onError = vi.fn();
    let api: any;
    createTaskSidebar({
      task: { id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-05", locked: true },
      categories,
      readOnly: true,
      onSave,
      onClose: vi.fn(),
      onError,
      customRenderer: (_task, _el, a) => {
        api = a;
      }
    });
    expect(api.readOnly).toBe(true);
    expect(api.locked).toBe(true);
    api.updateTask({ notes: "x" });
    expect(onSave).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("createDetailModal opens the same hardened editor as a modal overlay", () => {
    const onClose = vi.fn();
    const modal = createDetailModal({
      task: { id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-05" },
      categories: { dev: { label: "Dev", color: 'x" onmouseover="alert(1)' } },
      onSave: vi.fn(),
      onClose
    });
    const backdrop = document.querySelector(".jantt-sidebar-backdrop")!;
    expect(backdrop.getAttribute("aria-modal")).toBe("true");
    expect(backdrop.querySelector("[onmouseover]")).toBeNull();
    modal.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
