import { JanttData, Task, JanttOptions, TaskLayout } from "../types";

export type DragMode = "move" | "resize" | "progress" | "link" | "split" | "marquee";

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
  moved: boolean;
  element?: HTMLElement;
  pointerId?: number;
  linkFromTaskId?: string;
  multiTasks?: Map<string, { start: string; end: string }>;
  selectionBoxEl?: HTMLElement;
  canvasEl?: HTMLElement;
  taskLayouts?: TaskLayout[];
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
  onLiveLinkUpdate?: (wireData: { fromX: number; fromY: number; toX: number; toY: number } | null) => void;
  onSplitResize?: (newWidth: number) => void;
  onRenderRequest: () => void;
  scheduleRender: () => void;
  selectTask: (taskId: string, toggle?: boolean) => void;
  clearSelection: () => void;
  setTasks: (tasks: Task[], triggerCascade?: boolean) => void;
  commitData: () => void;
}

export interface IGestureStrategy {
  readonly mode: DragMode;
  onMove(e: PointerEvent, state: DragState, ctx: GestureContext): void;
  onUp(e: PointerEvent, state: DragState, ctx: GestureContext): void;
}
