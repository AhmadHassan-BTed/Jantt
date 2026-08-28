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
  generatedAt?: string;
  [key: string]: unknown;
}

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

export interface Task {
  id: string;
  label?: string;
  name?: string; // Backwards-compatible alias for label
  category: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  dependsOn?: string | null;
  gapDays?: number | null;
  minGapDays?: number | null; // Backwards-compatible alias for gapDays
  locked?: boolean;
  progress?: number | null; // 0.0 to 1.0
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
    | "INVALID_PROGRESS"
    | "SCHEMA_MISMATCH";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ViewportOptions {
  dayWidth?: number; // Default 32px
  rowHeight?: number; // Default 48px
  labelWidth?: number; // Default 240px
  headerHeight?: number; // Default 56px
  startDate?: string;
  endDate?: string;
  showToday?: boolean;
  showWeekends?: boolean;
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
}

export interface DependencyLine {
  fromTaskId: string;
  toTaskId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  path: string;
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
  dateStr: string;
  dayOfMonth: number;
  dayOfWeek: number;
  x: number;
  width: number;
  isWeekend: boolean;
  isToday: boolean;
}

export interface GridHeader {
  months: HeaderMonth[];
  weeks: HeaderWeek[];
  days: HeaderDay[];
  todayX: number | null;
  totalWidth: number;
  totalHeight: number;
  startDate: string;
  endDate: string;
  totalDays: number;
}

export interface JanttLayoutResult {
  tasks: TaskLayout[];
  dependencies: DependencyLine[];
  header: GridHeader;
  viewport: Required<ViewportOptions>;
  canvasWidth: number;
  canvasHeight: number;
}

export interface JanttOptions {
  viewport?: ViewportOptions;
  theme?: Record<string, string>;
  readOnly?: boolean;
  onChange?: (draft: JanttData) => void;
  onCommit?: (final: JanttData) => void;
  onTaskClick?: (task: Task) => void;
  renderDetail?: (
    task: Task,
    container: HTMLElement,
    api: {
      updateTask: (patch: Partial<Task>) => void;
      close: () => void;
    }
  ) => void;
}
