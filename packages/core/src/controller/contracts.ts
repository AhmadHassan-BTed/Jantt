import { JanttData, Task, JanttOptions, TaskLayout } from "../types";
import { getTaskDependencyRelations, parseDependencyRelation, DependencyItem, TaskIdLookup } from "../dependencies";

export type DragMode = "move" | "resize" | "progress" | "link" | "split" | "marquee" | "pan";

/**
 * Optional hooks a host engine passes to the {@link InteractionController} constructor. Both are
 * additive: without them the controller behaves exactly as before.
 */
export interface InteractionHooks {
  /**
   * Receives a new plan container (`{ ...data, tasks }`) after every task edit, drag frame,
   * cancel or cascade toggle. With this hook the controller never mutates the container it was
   * given, so the host owns a single, immutable copy of the data and should store `next` as its
   * current plan. Without it, the controller replaces `data.tasks` on the given container.
   */
  onDataChange?(next: JanttData): void;
  /**
   * Drag fast path: called once per animation frame of a move, resize or progress drag, in place
   * of a full re-render, with the ids of the tasks whose objects changed since the last painted
   * frame (moved tasks and their cascaded successors). Return true when the host updated those
   * bars and links itself; return false to get a full render for that frame. The end and the
   * cancellation of a gesture always render fully.
   */
  onGestureFrame?(changedTaskIds: ReadonlySet<string>): boolean;
}

export interface DragState {
  taskId?: string;
  mode: DragMode;
  startX: number;
  startY: number;
  canvasStartX?: number;
  canvasStartY?: number;
  origStart?: string;
  origEnd?: string;
  origProgress?: number;
  origLabelWidth?: number;
  origScrollLeft?: number;
  origScrollTop?: number;
  moved: boolean;
  element?: HTMLElement;
  pointerId?: number;
  linkFromTaskId?: string;
  resizeStart?: boolean;
  snappedTaskId?: string;
  dragHint?: HTMLElement;
  multiTasks?: Map<string, { start: string; end: string }>;
  selectionBoxEl?: HTMLElement;
  canvasEl?: HTMLElement;
  taskLayouts?: TaskLayout[];
  /** `data.tasks` as it was when the gesture started; restored when the gesture is cancelled. */
  origTasks?: Task[];
  /** `origTasks` by id, built once per gesture by the strategies that need lookups. */
  origById?: Map<string, Task>;
  /** Horizontal pixels the controller auto-scrolled the timeline since the gesture started. */
  autoScrollX?: number;
  /** Rendered bar width (px) captured at gesture start, used by the progress gesture. */
  barWidth?: number;
  /** Last value a strategy applied (day delta, progress or width); repeated values are skipped. */
  lastValue?: number;
}

export interface LiveLinkWire {
  fromX: number; fromY: number; toX: number; toY: number;
  fromSide?: "start" | "end";
  toSide?: "start" | "end";
}

export interface GestureContext {
  data: JanttData;
  options: JanttOptions;
  dayWidth: number;
  defaultGapDays: number;
  autoCascade: boolean;
  selectedTaskIds: Set<string>;
  container?: HTMLElement;
  openModalHandler: (task: Task) => void;
  onLiveLinkUpdate?: (wireData: LiveLinkWire | null) => void;
  /** Reports a new label-column width; `isFinal` is true once, when the splitter drag ends. */
  onSplitResize?: (newWidth: number, isFinal?: boolean) => void;
  onRenderRequest: () => void;
  scheduleRender: () => void;
  selectTask: (taskId: string, toggle?: boolean) => void;
  clearSelection: () => void;
  /** Replaces `data.tasks`; with `triggerCascade`, runs the cascade first when Auto-Cascade is on. */
  setTasks: (tasks: Task[], triggerCascade?: boolean) => void;
  commitData: () => void;
  /** Runs the plan's cascade (gap, link types, working calendars) regardless of Auto-Cascade. */
  resolve: (tasks: Task[]) => Task[];
}

export interface IGestureStrategy {
  readonly mode: DragMode;
  /** Return `false` when the event changed nothing, so the controller can skip the re-render. */
  onMove(e: PointerEvent, state: DragState, ctx: GestureContext): boolean | void;
  onUp(e: PointerEvent, state: DragState, ctx: GestureContext): void;
}

/**
 * Returns the start the scheduler would give `task` (at its current dates) given only its
 * predecessors, using the real cascade so link types, lags, gaps and calendars all apply.
 * Predecessors are pinned in place; `getTask` decides which tasks count as predecessors.
 * Pass the plan's task ids as `knownIds` so ids such as "model-3d" are not read as lag shorthand.
 * Returns `task.start` unchanged when nothing constrains it.
 */
export function constrainedStart(
  task: Task,
  getTask: (id: string) => Task | undefined,
  resolve: (tasks: Task[]) => Task[],
  knownIds?: TaskIdLookup
): string {
  const predecessors: Task[] = [];
  for (const rel of getTaskDependencyRelations(task, knownIds)) {
    const pred = rel.id === task.id ? undefined : getTask(rel.id);
    if (pred && !pred._deleted) predecessors.push({ ...pred, locked: true });
  }
  if (predecessors.length === 0) return task.start;
  const resolved = resolve([...predecessors, { ...task, locked: false }]);
  return resolved[resolved.length - 1]?.start || task.start;
}

/**
 * The `dependsOn` item for a new finish-to-start link on `predecessorId`: the plain id, or
 * `{ id }` when the id itself reads as shorthand ("render-3d", "a:SS") or as a list ("a,b"), so
 * readers that do not know the plan's ids (exports, other tools) never misparse the new link.
 */
export function dependencyItemFor(predecessorId: string): DependencyItem {
  if (/[,;]/.test(predecessorId)) return { id: predecessorId };
  const plain = parseDependencyRelation(predecessorId);
  return plain && plain.id === predecessorId && plain.type === "FS" && !plain.explicitLag ? predecessorId : { id: predecessorId };
}
