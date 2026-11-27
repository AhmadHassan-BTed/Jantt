import { describe, it, expect, vi } from "vitest";
import {
  MoveGestureStrategy,
  ResizeGestureStrategy,
  ProgressGestureStrategy,
  LinkGestureStrategy,
  SplitterGestureStrategy,
  MarqueeGestureStrategy,
  PanGestureStrategy
} from "../src/controller/index";
import { GestureContext, DragState, constrainedStart } from "../src/controller/contracts";
import { resolveSchedule } from "../src/resolver";
import { JanttData, Task } from "../src/types";

function createMockContext(tasks: Task[], overrides?: Partial<GestureContext>): { ctx: GestureContext; commits: any[] } {
  const commits: any[] = [];
  const data: JanttData = { tasks };
  const resolve = (t: Task[]) => resolveSchedule(t, 2);
  const ctx: GestureContext = {
    data,
    options: {
      onCommit: (d) => commits.push(d),
      onChange: vi.fn(),
      onError: vi.fn(),
      onLinkCreate: vi.fn(),
      onTaskClick: vi.fn()
    },
    dayWidth: 40,
    defaultGapDays: 2,
    autoCascade: true,
    selectedTaskIds: new Set(),
    openModalHandler: vi.fn(),
    onRenderRequest: vi.fn(),
    scheduleRender: vi.fn(),
    selectTask: vi.fn(),
    clearSelection: vi.fn(),
    setTasks: (t, triggerCascade) => {
      data.tasks = triggerCascade && ctx.autoCascade ? resolve(t) : t;
    },
    commitData: () => {
      commits.push(data);
    },
    resolve,
    ...overrides
  };
  return { ctx, commits };
}

function moveState(tasks: Task[], taskId: string, overrides: Partial<DragState> = {}): DragState {
  const task = tasks.find((t) => t.id === taskId)!;
  return {
    mode: "move",
    taskId,
    startX: 100,
    startY: 100,
    origStart: task.start,
    origEnd: task.end,
    moved: true,
    origTasks: tasks,
    ...overrides
  };
}

const at = (clientX: number, clientY = 100) => ({ clientX, clientY }) as PointerEvent;

describe("Gesture Strategies", () => {
  describe("MoveGestureStrategy", () => {
    it("preserves timed endpoints when moving by whole days at day zoom", () => {
      const tasks: Task[] = [{ id: "t1", category: "dev", start: "2026-09-01T09:00", end: "2026-09-01T17:00" }];
      const { ctx } = createMockContext(tasks);
      new MoveGestureStrategy().onMove(at(140), moveState(tasks, "t1"), ctx);
      expect(ctx.data.tasks[0]).toMatchObject({ start: "2026-09-02T09:00", end: "2026-09-02T17:00" });
    });

    it.each([1440, -1440, 720])("preserves all-day duration after a %i-minute move at subday zoom", (minutes) => {
      const tasks: Task[] = [{ id: "t1", category: "dev", start: "2026-09-02", end: "2026-09-02" }];
      const { ctx } = createMockContext(tasks, { dayWidth: 1440 });
      new MoveGestureStrategy().onMove(at(100 + minutes), moveState(tasks, "t1"), ctx);
      const expected = minutes === 1440
        ? { start: "2026-09-03", end: "2026-09-03" }
        : minutes === -1440
          ? { start: "2026-09-01", end: "2026-09-01" }
          : { start: "2026-09-02T12:00", end: "2026-09-03T12:00" };
      expect(ctx.data.tasks[0]).toMatchObject(expected);
    });

    it("keeps whole-day moves after a timed predecessor in strict mode", () => {
      const tasks: Task[] = [
        { id: "a", category: "dev", start: "2026-09-01T09:00", end: "2026-09-01T17:00" },
        { id: "b", category: "dev", start: "2026-09-02T09:00", end: "2026-09-02T17:00", dependsOn: "a:FS+0" }
      ];
      const { ctx } = createMockContext(tasks, { autoCascade: false });
      new MoveGestureStrategy().onMove(at(60), moveState(tasks, "b"), ctx);
      expect(ctx.data.tasks[1]).toMatchObject({ start: "2026-09-02T09:00", end: "2026-09-02T17:00" });
    });

    it("shifts single task by calculated delta days and cascades dependents", () => {
      const strategy = new MoveGestureStrategy();
      const tasks: Task[] = [
        { id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "t2", category: "dev", start: "2026-09-07", end: "2026-09-10", dependsOn: "t1", gapDays: 2 }
      ];
      const { ctx, commits } = createMockContext(tasks);
      const state = moveState(tasks, "t1");

      // Drag 80px forward (80px / 40px/day = +2 days)
      strategy.onMove(at(180), state, ctx);

      expect(ctx.data.tasks.find((t) => t.id === "t1")?.start).toBe("2026-09-03");
      expect(ctx.data.tasks.find((t) => t.id === "t1")?.end).toBe("2026-09-07");
      // Dependent t2 must cascade forward: t1 ends 09-07 + 2 gapDays -> starts 09-09
      expect(ctx.data.tasks.find((t) => t.id === "t2")?.start).toBe("2026-09-09");

      // Pointer up commits changes
      strategy.onUp({} as PointerEvent, state, ctx);
      expect(commits.length).toBe(1);
    });

    it("never mutates the task objects or array it started from (copy-on-write)", () => {
      const strategy = new MoveGestureStrategy();
      const tasks: Task[] = [{ id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-05" }];
      const frozen = JSON.parse(JSON.stringify(tasks));
      const { ctx } = createMockContext(tasks, { autoCascade: false });

      strategy.onMove(at(220), moveState(tasks, "t1"), ctx);

      expect(tasks).toEqual(frozen);
      expect(ctx.data.tasks).not.toBe(tasks);
      expect(ctx.data.tasks[0].start).toBe("2026-09-04");
    });

    it("skips repeated deltas and restores the original tasks when dragged back", () => {
      const strategy = new MoveGestureStrategy();
      const tasks: Task[] = [{ id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-05" }];
      const { ctx, commits } = createMockContext(tasks);
      const state = moveState(tasks, "t1");

      expect(strategy.onMove(at(140), state, ctx)).toBe(true);
      // Same day bucket (+1 day): nothing to do
      expect(strategy.onMove(at(150), state, ctx)).toBe(false);
      // Back to the origin: the exact pre-drag array is restored
      expect(strategy.onMove(at(101), state, ctx)).toBe(true);
      expect(ctx.data.tasks).toBe(tasks);

      // A drag that ends where it started does not commit
      strategy.onUp({} as PointerEvent, state, ctx);
      expect(commits).toHaveLength(0);
    });

    it("builds the pre-drag task lookup once per gesture", () => {
      const strategy = new MoveGestureStrategy();
      const tasks: Task[] = [{ id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-05" }];
      const { ctx } = createMockContext(tasks, { autoCascade: false });
      const state = moveState(tasks, "t1");

      strategy.onMove(at(140), state, ctx);
      const lookup = state.origById;
      strategy.onMove(at(180), state, ctx);
      expect(lookup?.get("t1")).toBe(tasks[0]);
      expect(state.origById).toBe(lookup);
      expect(ctx.data.tasks[0].start).toBe("2026-09-03");
    });

    it("adds auto-scrolled distance so the bar stays under the cursor", () => {
      const strategy = new MoveGestureStrategy();
      const tasks: Task[] = [{ id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-05" }];
      const { ctx } = createMockContext(tasks, { autoCascade: false });

      // Pointer did not move, but the timeline scrolled 80px (2 days) under it
      strategy.onMove(at(100), moveState(tasks, "t1", { autoScrollX: 80 }), ctx);
      expect(ctx.data.tasks[0].start).toBe("2026-09-03");
    });

    it("shifts multi-selected tasks together", () => {
      const strategy = new MoveGestureStrategy();
      const tasks: Task[] = [
        { id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "t2", category: "dev", start: "2026-09-05", end: "2026-09-10" }
      ];
      const { ctx } = createMockContext(tasks, { autoCascade: false });
      const multiTasks = new Map([
        ["t1", { start: "2026-09-01", end: "2026-09-05" }],
        ["t2", { start: "2026-09-05", end: "2026-09-10" }]
      ]);
      const state: DragState = { mode: "move", taskId: "t1", startX: 0, startY: 0, moved: true, multiTasks };

      // Move 40px right (+1 day)
      strategy.onMove(at(40, 0), state, ctx);
      expect(ctx.data.tasks.find((t) => t.id === "t1")?.start).toBe("2026-09-02");
      expect(ctx.data.tasks.find((t) => t.id === "t2")?.start).toBe("2026-09-06");
    });

    it("strict mode clamps with the link's real type (SS) instead of finish-to-start", () => {
      const strategy = new MoveGestureStrategy();
      const tasks: Task[] = [
        { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "b", category: "dev", start: "2026-09-03", end: "2026-09-06", dependsOn: [{ id: "a", type: "SS" }] }
      ];
      const { ctx } = createMockContext(tasks, { autoCascade: false });

      // Drag b 5 days left: an SS link only requires b.start >= a.start
      strategy.onMove(at(-100), moveState(tasks, "b"), ctx);
      const b = ctx.data.tasks.find((t) => t.id === "b")!;
      expect(b.start).toBe("2026-09-01");
      expect(b.end).toBe("2026-09-04");
    });

    it("strict mode also clamps multi-selection drags against outside predecessors", () => {
      const strategy = new MoveGestureStrategy();
      const tasks: Task[] = [
        { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "b", category: "dev", start: "2026-09-08", end: "2026-09-10", dependsOn: "a" },
        { id: "c", category: "dev", start: "2026-09-12", end: "2026-09-14" }
      ];
      const { ctx } = createMockContext(tasks, { autoCascade: false });
      const multiTasks = new Map([
        ["b", { start: "2026-09-08", end: "2026-09-10" }],
        ["c", { start: "2026-09-12", end: "2026-09-14" }]
      ]);

      // Drag the group 5 days left; b may not start before a.end + 2 (09-07): group moves only 1 day
      strategy.onMove(at(-100), moveState(tasks, "b", { multiTasks }), ctx);
      expect(ctx.data.tasks.find((t) => t.id === "b")?.start).toBe("2026-09-07");
      expect(ctx.data.tasks.find((t) => t.id === "c")?.start).toBe("2026-09-11");
    });

    it("opens the task (and reports the click) when released without moving", () => {
      const strategy = new MoveGestureStrategy();
      const tasks: Task[] = [{ id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-05" }];
      const { ctx, commits } = createMockContext(tasks);

      strategy.onUp({} as PointerEvent, moveState(tasks, "t1", { moved: false }), ctx);
      expect(ctx.options.onTaskClick).toHaveBeenCalledWith(tasks[0]);
      expect(ctx.openModalHandler).toHaveBeenCalledWith(tasks[0]);
      expect(commits).toHaveLength(0);
    });
  });

  describe("ResizeGestureStrategy", () => {
    it("resizes task end date by delta days", () => {
      const strategy = new ResizeGestureStrategy();
      const tasks: Task[] = [{ id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-05" }];
      const { ctx } = createMockContext(tasks);
      const state = moveState(tasks, "t1", { mode: "resize" });

      // Drag right by 80px (+2 days)
      strategy.onMove(at(180), state, ctx);
      expect(ctx.data.tasks[0].start).toBe("2026-09-01");
      expect(ctx.data.tasks[0].end).toBe("2026-09-07");
    });

    it("resizes the start edge without moving the finish or breaking a strict predecessor", () => {
      const tasks: Task[] = [
        { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "b", category: "dev", start: "2026-09-10", end: "2026-09-13", dependsOn: "a" }
      ];
      const { ctx } = createMockContext(tasks, { autoCascade: false });
      const state = moveState(tasks, "b", { mode: "resize", resizeStart: true });
      new ResizeGestureStrategy().onMove(at(-140), state, ctx);
      expect(ctx.data.tasks[1]).toMatchObject({ start: "2026-09-07", end: "2026-09-13" });
    });

    it("clamps to the minimum duration instead of freezing at the last valid size", () => {
      const strategy = new ResizeGestureStrategy();
      const tasks: Task[] = [{ id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-10" }];
      const { ctx } = createMockContext(tasks);

      strategy.onMove(at(100 - 40 * 30), moveState(tasks, "t1", { mode: "resize" }), ctx);
      expect(ctx.data.tasks[0].end).toBe("2026-09-02");
    });
  });

  describe("ProgressGestureStrategy", () => {
    it("maps the pointer onto the rendered (inclusive) bar width and syncs status", () => {
      const strategy = new ProgressGestureStrategy();
      const tasks: Task[] = [
        { id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-10", progress: 0, status: "not-started" }
      ];
      const { ctx } = createMockContext(tasks);
      // 09-01..09-10 is drawn as 10 days * 40px = 400px
      const state: DragState = { mode: "progress", taskId: "t1", startX: 100, startY: 100, origProgress: 0, moved: true };

      // Drag 200px (50% progress)
      strategy.onMove(at(300), state, ctx);
      expect(ctx.data.tasks[0].progress).toBe(0.5);
      expect(ctx.data.tasks[0].status).toBe("in-progress");

      // Drag past bar width (100% progress)
      strategy.onMove(at(600), state, ctx);
      expect(ctx.data.tasks[0].progress).toBe(1);
      expect(ctx.data.tasks[0].status).toBe("completed");
    });

    it("prefers the bar width measured at drag start", () => {
      const strategy = new ProgressGestureStrategy();
      const tasks: Task[] = [{ id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-10", progress: 0 }];
      const { ctx } = createMockContext(tasks);
      const state: DragState = { mode: "progress", taskId: "t1", startX: 0, startY: 0, origProgress: 0, moved: true, barWidth: 100 };

      strategy.onMove(at(25, 0), state, ctx);
      expect(ctx.data.tasks[0].progress).toBe(0.25);
    });

    it("does not commit when the handle is only clicked", () => {
      const strategy = new ProgressGestureStrategy();
      const tasks: Task[] = [{ id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-10", progress: 0.3 }];
      const { ctx, commits } = createMockContext(tasks);

      strategy.onUp({} as PointerEvent, { mode: "progress", taskId: "t1", startX: 0, startY: 0, moved: false, origTasks: tasks }, ctx);
      expect(commits).toHaveLength(0);
      expect(ctx.onRenderRequest).not.toHaveBeenCalled();
    });
  });

  describe("LinkGestureStrategy", () => {
    function linkSetup(tasks: Task[], targetId: string, overrides?: Partial<GestureContext>) {
      const target = document.createElement("div");
      target.dataset.taskId = targetId;
      const spy = vi.spyOn(document, "elementFromPoint" as any).mockReturnValue(target);
      const { ctx, commits } = createMockContext(tasks, overrides);
      const state: DragState = { mode: "link", taskId: "a", linkFromTaskId: "a", startX: 0, startY: 0, moved: true };
      return { ctx, commits, state, restore: () => spy.mockRestore() };
    }

    // jsdom has no elementFromPoint; make it patchable for the spy above
    if (typeof (document as any).elementFromPoint !== "function") {
      (document as any).elementFromPoint = () => null;
    }

    it("appends the new link and keeps existing typed dependencies intact", () => {
      const strategy = new LinkGestureStrategy();
      const tasks: Task[] = [
        { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "x", category: "dev", start: "2026-09-01", end: "2026-09-03" },
        { id: "b", category: "dev", start: "2026-09-10", end: "2026-09-12", dependsOn: [{ id: "x", type: "SS", lagDays: 2 }] }
      ];
      const { ctx, commits, state, restore } = linkSetup(tasks, "b");

      strategy.onUp(at(0, 0), state, ctx);
      restore();

      const b = ctx.data.tasks.find((t) => t.id === "b")!;
      expect(b.dependsOn).toEqual([{ id: "x", type: "SS", lagDays: 2 }, "a"]);
      expect(ctx.options.onLinkCreate).toHaveBeenCalledWith("a", "b");
      expect(commits).toHaveLength(1);
    });

    it.each([["left", "left", "SS"], ["right", "right", "FF"], ["left", "right", "SF"]])(
      "serializes a %s to %s edge gesture as %s", (from, to, expected) => {
        const tasks: Task[] = [
          { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" },
          { id: "b", category: "dev", start: "2026-09-08", end: "2026-09-12" }
        ];
        const { ctx, state, restore } = linkSetup(tasks, "b");
        const target = document.elementFromPoint(0, 0) as HTMLElement;
        const port = document.createElement("div");
        port.className = `jantt-link-port-${to}`;
        target.appendChild(port);
        vi.mocked(document.elementFromPoint).mockReturnValue(port);
        state.element = document.createElement("div");
        state.element.className = `jantt-link-port-${from}`;
        new LinkGestureStrategy().onUp(at(0, 0), state, ctx);
        restore();
        expect(ctx.data.tasks[1].dependsOn).toEqual({ id: "a", type: expected });
      }
    );

    it("ignores drops onto an existing link (no event, no commit)", () => {
      const strategy = new LinkGestureStrategy();
      const tasks: Task[] = [
        { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "b", category: "dev", start: "2026-09-10", end: "2026-09-12", dependsOn: "a:SS+1d" }
      ];
      const { ctx, commits, state, restore } = linkSetup(tasks, "b");

      strategy.onUp(at(0, 0), state, ctx);
      restore();

      expect(ctx.data.tasks).toBe(tasks);
      expect(ctx.options.onLinkCreate).not.toHaveBeenCalled();
      expect(commits).toHaveLength(0);
    });

    it("rejects locked targets and cycles through onError", () => {
      const strategy = new LinkGestureStrategy();
      const locked: Task[] = [
        { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "b", category: "dev", start: "2026-09-10", end: "2026-09-12", locked: true }
      ];
      let setup = linkSetup(locked, "b");
      strategy.onUp(at(0, 0), setup.state, setup.ctx);
      setup.restore();
      expect(setup.ctx.options.onError).toHaveBeenCalledTimes(1);
      expect(setup.commits).toHaveLength(0);

      const cyclic: Task[] = [
        { id: "a", category: "dev", start: "2026-09-10", end: "2026-09-12", dependsOn: "b" },
        { id: "b", category: "dev", start: "2026-09-01", end: "2026-09-05" }
      ];
      setup = linkSetup(cyclic, "b");
      strategy.onUp(at(0, 0), setup.state, setup.ctx);
      setup.restore();
      expect(setup.ctx.options.onError).toHaveBeenCalledTimes(1);
      expect(setup.ctx.data.tasks).toBe(cyclic);
    });

    it("treats ids that look like lag shorthand as ids, and stores new links to them unambiguously", () => {
      const strategy = new LinkGestureStrategy();
      const tasks: Task[] = [
        { id: "render-3d", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "model-3d", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "b", category: "dev", start: "2026-09-10", end: "2026-09-12", dependsOn: "model-3d" }
      ];
      const target = document.createElement("div");
      target.dataset.taskId = "b";
      const spy = vi.spyOn(document, "elementFromPoint" as any).mockReturnValue(target);
      const drop = (from: string) => {
        const { ctx, commits } = createMockContext(tasks, { autoCascade: false });
        strategy.onUp(at(0, 0), { mode: "link", linkFromTaskId: from, startX: 0, startY: 0, moved: true }, ctx);
        return { ctx, commits };
      };

      // "model-3d" is already a predecessor (not "model" with a 3-day lead): a no-op
      expect(drop("model-3d").commits).toHaveLength(0);

      const { ctx, commits } = drop("render-3d");
      spy.mockRestore();
      expect(commits).toHaveLength(1);
      expect(ctx.data.tasks.find((t) => t.id === "b")?.dependsOn).toEqual(["model-3d", { id: "render-3d" }]);
    });

    it("does not reschedule the plan when Auto-Cascade is off", () => {
      const strategy = new LinkGestureStrategy();
      const tasks: Task[] = [
        { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" },
        { id: "b", category: "dev", start: "2026-09-02", end: "2026-09-03" }
      ];
      const { ctx, state, restore } = linkSetup(tasks, "b", { autoCascade: false });

      strategy.onUp(at(0, 0), state, ctx);
      restore();

      const b = ctx.data.tasks.find((t) => t.id === "b")!;
      expect(b.dependsOn).toBe("a");
      expect(b.start).toBe("2026-09-02");
    });

    it("draws the preview wire in canvas coordinates", () => {
      const strategy = new LinkGestureStrategy();
      const canvas = document.createElement("div");
      const bar = document.createElement("div");
      bar.dataset.taskId = "a";
      const port = document.createElement("div");
      bar.appendChild(port);
      canvas.appendChild(bar);
      canvas.getBoundingClientRect = () => ({ left: 300, top: 120 }) as DOMRect;
      bar.getBoundingClientRect = () => ({ left: 340, right: 440, top: 160, height: 20 }) as DOMRect;

      const wire = vi.fn();
      const { ctx } = createMockContext([], { onLiveLinkUpdate: wire });
      strategy.onMove(at(500, 200), { mode: "link", startX: 0, startY: 0, moved: true, element: port }, ctx);

      expect(wire).toHaveBeenCalledWith({ fromX: 140, fromY: 50, toX: 200, toY: 80 });
    });
  });

  describe("SplitterGestureStrategy", () => {
    it("clamps new width between min and max bounds", () => {
      const strategy = new SplitterGestureStrategy();
      let reportedWidth = 0;
      const { ctx } = createMockContext([], {
        onSplitResize: (w) => {
          reportedWidth = w;
        }
      });
      const state: DragState = { mode: "split", startX: 300, startY: 100, origLabelWidth: 320, moved: true };

      strategy.onMove(at(350), state, ctx);
      expect(reportedWidth).toBe(370);

      // Clamp max 600
      strategy.onMove(at(1000), state, ctx);
      expect(reportedWidth).toBe(600);

      // Clamp min 180
      strategy.onMove(at(-200), state, ctx);
      expect(reportedWidth).toBe(180);
    });

    it("keeps part of the timeline visible in a narrow container and reports the final width", () => {
      const strategy = new SplitterGestureStrategy();
      const container = document.createElement("div");
      Object.defineProperty(container, "clientWidth", { value: 500 });
      const calls: Array<[number, boolean | undefined]> = [];
      const { ctx } = createMockContext([], { container, onSplitResize: (w, final) => calls.push([w, final]) });
      const state: DragState = { mode: "split", startX: 0, startY: 0, origLabelWidth: 320, moved: true };

      strategy.onMove(at(400, 0), state, ctx);
      strategy.onUp(at(400, 0), state, ctx);
      expect(calls).toEqual([
        [340, undefined],
        [340, true]
      ]);
    });
  });

  describe("MarqueeGestureStrategy", () => {
    it("clears selection when click does not drag (not moved)", () => {
      const strategy = new MarqueeGestureStrategy();
      let cleared = false;
      const { ctx } = createMockContext([], {
        clearSelection: () => {
          cleared = true;
        }
      });
      const state: DragState = { mode: "marquee", startX: 10, startY: 10, moved: false };

      strategy.onUp({} as PointerEvent, state, ctx);
      expect(cleared).toBe(true);
    });
  });

  describe("PanGestureStrategy", () => {
    it("scrolls the timeline opposite to the pointer", () => {
      const strategy = new PanGestureStrategy();
      const container = document.createElement("div");
      const bodyWrap = document.createElement("div");
      bodyWrap.className = "jantt-body-wrap";
      container.appendChild(bodyWrap);
      const { ctx } = createMockContext([], { container });

      strategy.onMove(at(60, 90), { mode: "pan", startX: 100, startY: 100, origScrollLeft: 200, origScrollTop: 50, moved: true }, ctx);
      expect(bodyWrap.scrollLeft).toBe(240);
      expect(bodyWrap.scrollTop).toBe(60);
    });

    it("treats a press on a view-only bar without movement as a click on that task", () => {
      const strategy = new PanGestureStrategy();
      const tasks: Task[] = [{ id: "t1", category: "dev", start: "2026-09-01", end: "2026-09-05" }];
      const { ctx } = createMockContext(tasks);

      strategy.onUp({} as PointerEvent, { mode: "pan", taskId: "t1", startX: 0, startY: 0, moved: false }, ctx);
      expect(ctx.options.onTaskClick).toHaveBeenCalledWith(tasks[0]);
      expect(ctx.openModalHandler).toHaveBeenCalledWith(tasks[0]);
      expect(ctx.clearSelection).not.toHaveBeenCalled();
    });
  });

  describe("constrainedStart", () => {
    const resolve = (t: Task[]) => resolveSchedule(t, 2);

    it("returns the earliest start allowed by each link type", () => {
      const a: Task = { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" };
      const lookup = (id: string) => (id === "a" ? a : undefined);
      const base: Task = { id: "b", category: "dev", start: "2026-08-20", end: "2026-08-22" };

      expect(constrainedStart({ ...base, dependsOn: "a" }, lookup, resolve)).toBe("2026-09-07");
      expect(constrainedStart({ ...base, dependsOn: "a:SS" }, lookup, resolve)).toBe("2026-09-01");
      expect(constrainedStart({ ...base, dependsOn: "a:FF" }, lookup, resolve)).toBe("2026-09-03");
    });

    it("reads ids that look like lag shorthand as ids when the plan's ids are given", () => {
      const pred: Task = { id: "model-3d", category: "dev", start: "2026-09-01", end: "2026-09-05" };
      const lookup = (id: string) => (id === pred.id ? pred : undefined);
      const early: Task = { id: "b", category: "dev", start: "2026-08-20", end: "2026-08-22", dependsOn: "model-3d" };

      expect(constrainedStart(early, lookup, resolve, new Set(["model-3d", "b"]))).toBe("2026-09-07");
      // Without the ids the link reads as "model" with a 3-day lead, which does not exist
      expect(constrainedStart(early, lookup, resolve)).toBe("2026-08-20");
    });

    it("leaves unconstrained or already-valid starts unchanged", () => {
      const a: Task = { id: "a", category: "dev", start: "2026-09-01", end: "2026-09-05" };
      const valid: Task = { id: "b", category: "dev", start: "2026-09-20", end: "2026-09-22", dependsOn: "a" };
      expect(constrainedStart(valid, () => a, resolve)).toBe("2026-09-20");
      expect(constrainedStart({ ...valid, dependsOn: "missing" }, () => undefined, resolve)).toBe("2026-09-20");
    });

    it("snaps drag and resize by minutes at minute scale while preserving sub-day duration", () => {
      const move = new MoveGestureStrategy();
      const resize = new ResizeGestureStrategy();
      const tasks: Task[] = [
        { id: "t1", category: "dev", start: "2026-09-01T09:00", end: "2026-09-01T10:00" }
      ];
      // dayWidth = 14400 => 10 px/min, step = 1m (10px per minute)
      const { ctx } = createMockContext(tasks, { dayWidth: 14400, defaultGapDays: 0 });
      const mState = moveState(tasks, "t1");
      move.onMove(at(250), mState, ctx); // +150px / 10 px/min = +15m
      expect(ctx.data.tasks[0].start).toBe("2026-09-01T09:15");
      expect(ctx.data.tasks[0].end).toBe("2026-09-01T10:15");

      const rState: DragState = {
        mode: "resize",
        taskId: "t1",
        startX: 100,
        startY: 100,
        origStart: ctx.data.tasks[0].start,
        origEnd: ctx.data.tasks[0].end,
        moved: true,
        origTasks: ctx.data.tasks
      };
      resize.onMove(at(400), rState, ctx); // +300px => +30m
      expect(ctx.data.tasks[0].start).toBe("2026-09-01T09:15");
      expect(ctx.data.tasks[0].end).toBe("2026-09-01T10:45");
    });
  });
});
