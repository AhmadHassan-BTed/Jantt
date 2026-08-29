/**
 * Jantt Core Types
 * Specification for the JSON Gantt Chart engine
 */

export interface JanttMeta {
  title?: string;
  person?: string;
  start?: string; // YYYY-MM-DD
  end?: string; // YYYY-MM-DD
  chartStart?: string; // Backwards-compatible alias for start
  chartEnd?: string; // Backwards-compatible alias for end
  defaultGapDays?: number;
  scale?: TimeScale;
  linkRouting?: LinkRoutingStyle;
  showCriticalPath?: boolean;
  showBaselines?: boolean;
  generatedAt?: string;
  [key: string]: unknown;
}

export type LinkRoutingStyle = "orthogonal" | "curved" | "direct";

export interface Category {
  label: string;
  color: string;
  soft?: string;
  [key: string]: unknown;
}

export type CategoriesMap = Record<string, Category>;

export interface DocumentItem {
  id: string;
  label: string;
  status?: "have" | "pending" | "missing" | string;
  note?: string;
  [key: string]: unknown;
}

export interface TaskBaseline {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

export interface Task {
  id: string;
  label?: string;
  name?: string; // Backwards-compatible alias for label
  category: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  dependsOn?: string | string[] | null;
  gapDays?: number | null;
  minGapDays?: number | null; // Backwards-compatible alias for gapDays
  locked?: boolean;
  progress?: number | null; // 0.0 to 1.0
  milestone?: boolean;
  baseline?: TaskBaseline;
  status?: "not-started" | "in-progress" | "submitted" | "completed" | "blocked" | string;
  urgent?: boolean;
  notes?: string;
  fields?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface JanttData {
  $schema?: string;
  meta?: JanttMeta;
  categories?: CategoriesMap;
  documents?: DocumentItem[];
  tasks: Task[];
  [key: string]: unknown;
}

export interface ValidationError {
  path: string;
  taskId?: string;
  message: string;
  suggestion?: string;
  code:
    | "MISSING_TASKS"
    | "INVALID_TASK_OBJECT"
    | "MISSING_TASK_ID"
    | "DUPLICATE_TASK_ID"
    | "MISSING_CATEGORY"
    | "UNKNOWN_CATEGORY"
    | "INVALID_DATE_FORMAT"
    | "INVALID_DATE_RANGE"
    | "DANGLING_DEPENDENCY"
    | "CIRCULAR_DEPENDENCY"
    | "DEP_TIMING_CONFLICT"
    | "INVALID_PROGRESS"
    | "SCHEMA_MISMATCH";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export type TimeScale = "day" | "week" | "month" | "quarter" | "year";

export interface GridColumn {
  id: string;
  label: string;
  width?: number;
  align?: "left" | "center" | "right";
  render?: (task: Task) => string;
}

export interface ViewportOptions {
  dayWidth?: number; // Override day pixel width (auto-calculated per scale if omitted)
  rowHeight?: number; // Default 46px
  labelWidth?: number; // Default 320px
  headerHeight?: number; // Default 58px
  startDate?: string;
  endDate?: string;
  scale?: TimeScale; // "day" | "week" | "month" | "quarter" | "year"
  linkRouting?: LinkRoutingStyle; // "orthogonal" | "curved" | "direct"
  showToday?: boolean;
  showWeekends?: boolean;
  showCriticalPath?: boolean;
  showBaselines?: boolean;
  columns?: GridColumn[];
}

export interface TaskLayout {
  task: Task;
  x: number;
  y: number;
  width: number;
  height: number;
  rowIndex: number;
  category: Category;
  displayLabel: string;
  durationDays: number;
  isMilestone: boolean;
  isCritical: boolean;
  baselineLayout?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface DependencyLine {
  fromTaskId: string;
  toTaskId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  path: string;
  isCritical: boolean;
}

export interface HeaderYear {
  label: string;
  x: number;
  width: number;
}

export interface HeaderMonth {
  label: string;
  x: number;
  width: number;
}

export interface HeaderWeek {
  label: string;
  x: number;
  width: number;
}

export interface HeaderDay {
  label: string;
  dayName: string;
  dateStr: string;
  dayOfMonth: number;
  dayOfWeek: number;
  x: number;
  width: number;
  isWeekend: boolean;
  isToday: boolean;
}

export interface GridHeader {
  years: HeaderYear[];
  months: HeaderMonth[];
  weeks: HeaderWeek[];
  days: HeaderDay[];
  spansMultipleYears: boolean;
  todayX: number | null;
  totalWidth: number;
  totalHeight: number;
  startDate: string;
  endDate: string;
  totalDays: number;
  scale: TimeScale;
}

export interface JanttLayoutResult {
  tasks: TaskLayout[];
  dependencies: DependencyLine[];
  header: GridHeader;
  viewport: Required<Omit<ViewportOptions, "columns">> & { columns?: GridColumn[] };
  canvasWidth: number;
  canvasHeight: number;
  criticalTaskIds: Set<string>;
}

export interface JanttOptions {
  viewport?: ViewportOptions;
  theme?: Record<string, string>;
  themeClassName?: string;
  className?: string;
  readOnly?: boolean;
  searchQuery?: string;
  sidebarContainer?: HTMLElement | string;
  onChange?: (draft: JanttData) => void;
  onCommit?: (final: JanttData) => void;
  onTaskClick?: (task: Task) => void;
  onTaskDelete?: (taskId: string) => void;
  onLinkCreate?: (fromTaskId: string, toTaskId: string) => void;
  onLinkDelete?: (fromTaskId: string, toTaskId: string) => void;
  renderDetail?: (
    task: Task,
    container: HTMLElement,
    api: {
      updateTask: (patch: Partial<Task>) => void;
      close: () => void;
    }
  ) => void;
}
