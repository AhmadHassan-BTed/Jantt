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
  autoCascade?: boolean;
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

export interface NoteItem {
  id: string;
  title: string;
  content: string; // Markdown or plaintext body
  createdAt?: string; // ISO 8601 string
  updatedAt?: string; // ISO 8601 string
  color?: string; // Hex tint / accent (e.g. #3B82F6, #10B981, #F59E0B, #8B5CF6, #EF4444)
  pinned?: boolean;
  category?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface Team {
  id: string;
  name: string;
  color?: string; // Hex color for team badge
  description?: string;
  [key: string]: unknown;
}

export interface Person {
  id: string;
  name: string;
  teamId?: string; // References Team.id
  role?: string;
  avatar?: string; // URL or initials fallback
  color?: string; // Hex color for avatar badge
  email?: string;
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
  priority?: "low" | "medium" | "high" | "urgent" | string;
  assignee?: string; // Person.id or Person.name
  teamId?: string; // Direct or inherited Team.id
  wbs?: string;
  phase?: string;
  estimatedCost?: number;
  actualCost?: number;
  notes?: string;
  description?: string;
  fields?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface JanttData {
  $schema?: string;
  meta?: JanttMeta;
  categories?: CategoriesMap;
  documents?: DocumentItem[];
  notes?: NoteItem[];
  teams?: Team[];
  people?: Person[];
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

export type RowHeightMode = "custom" | "fit";

export interface ViewportOptions {
  dayWidth?: number; // Override day pixel width (auto-calculated per scale if omitted)
  rowHeight?: number; // Default 46px (when in custom mode)
  rowHeightMode?: RowHeightMode; // "custom" (default) or "fit" (dynamically fits all rows in canvas)
  labelWidth?: number; // Default 320px
  headerHeight?: number; // Default 58px
  startDate?: string;
  endDate?: string;
  scale?: TimeScale; // "day" | "week" | "month" | "quarter" | "year"
  linkRouting?: LinkRoutingStyle; // "orthogonal" | "curved" | "direct"
  showToday?: boolean;
  showTodayTag?: boolean;
  showWeekends?: boolean;
  showCriticalPath?: boolean;
  showBaselines?: boolean;
  autoCascade?: boolean;
  currentTime?: Date;
  selectedDate?: string | null;
  showDateFilterBadge?: boolean;
  filterTasksByDate?: boolean;
  columns?: GridColumn[];
  criticalResult?: CriticalPathResult;
}

export interface CriticalPathOptions {
  targetDate?: string; // Contractual completion deadline (causes negative float if project slips)
  nearCriticalThresholdDays?: number; // Default: 3 days
  defaultGapDays?: number;
}

export interface TaskScheduleMetrics {
  taskId: string;
  earlyStart: string;
  earlyFinish: string;
  lateStart: string;
  lateFinish: string;
  totalFloat: number; // in days: LS - ES = LF - EF
  freeFloat: number; // in days: min(succ.ES - lag) - EF
  isCritical: boolean;
  isNearCritical: boolean;
  drivingPredecessors: string[];
  slackLabel: string; // Intuitive label: e.g. "0d (Critical)", "4d buffer", "Overdue by 2d"
}

export interface CriticalPathResult {
  criticalTaskIds: Set<string>;
  criticalDepKeys: Set<string>;
  nearCriticalTaskIds: Set<string>;
  projectEarlyFinish: string;
  projectLateFinish: string;
  projectTotalFloat: number;
  criticalPaths: string[][]; // Ordered sequences of task IDs along each critical path
  metrics: Map<string, TaskScheduleMetrics>;
}

export interface TaskEVMMetrics {
  taskId: string;
  plannedValue: number; // PV
  earnedValue: number; // EV
  actualCost: number; // AC
  scheduleVariance: number; // SV = EV - PV
  costVariance: number; // CV = EV - AC
  plannedProgress: number; // 0.0 - 1.0
  actualProgress: number; // 0.0 - 1.0
  isBlocked: boolean; // True if any predecessor is not yet completed
}

export interface EVMResult {
  // Classical ANSI/EIA-748 Metrics
  bac: number; // Budget at Completion
  pv: number; // Planned Value
  ev: number; // Earned Value
  ac: number; // Actual Cost
  sv: number; // Schedule Variance (EV - PV)
  cv: number; // Cost Variance (EV - AC)
  svPercent: number; // SV / PV * 100
  cvPercent: number; // CV / EV * 100
  spi: number; // Schedule Performance Index (EV / PV)
  cpi: number; // Cost Performance Index (EV / AC)
  criticalRatio: number; // SPI * CPI
  eac: number; // Estimate at Completion (BAC / CPI)
  etc: number; // Estimate to Complete (EAC - AC)
  vac: number; // Variance at Completion (BAC - EAC)
  tcpi: number; // To-Complete Performance Index

  // Intuitive Executive & Hobbyist Metrics
  scheduleStatus: "ahead" | "on-track" | "behind";
  costStatus: "under-budget" | "on-budget" | "over-budget";
  overallHealth: "healthy" | "at-risk" | "critical";
  healthScore: number; // 0 to 100
  taskCountTotal: number;
  taskCountCompleted: number;
  taskCountInProgress: number;
  taskCountNotStarted: number;
  taskCountBlocked: number;
  daysRemaining: number;
  projectProgressPercent: number;
  projectPaceLabel: string;
  taskMetrics: Map<string, TaskEVMMetrics>;
}

export interface ScheduleHealthIssue {
  type: "missing-logic" | "high-float" | "negative-float" | "out-of-sequence" | "broken-chain";
  severity: "low" | "medium" | "high";
  taskId?: string;
  taskName?: string;
  message: string;
  recommendation: string;
}

export interface ScheduleHealthResult {
  healthScore: number; // 0 - 100
  grade: "A" | "B" | "C" | "D" | "F";
  summary: string;
  issues: ScheduleHealthIssue[];
  missingLogicCount: number;
  negativeFloatCount: number;
  highFloatCount: number;
  totalTasksChecked: number;
}

export interface PertRiskResult {
  expectedProjectDurationDays: number;
  standardDeviationDays: number;
  varianceDays: number;
  confidencePercentages: {
    targetDate?: string;
    onTimeProbability: number; // 0.0 - 1.0 (e.g. 0.85 = 85%)
  };
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
  scheduleMetrics?: TaskScheduleMetrics;
  anchorInX?: number;
  anchorInY?: number;
  anchorOutX?: number;
  anchorOutY?: number;
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
  isTaskBoundary?: boolean;
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
  viewport: Required<Omit<ViewportOptions, "columns" | "currentTime" | "selectedDate" | "criticalResult" | "showDateFilterBadge" | "filterTasksByDate">> & {
    columns?: GridColumn[];
    currentTime?: Date;
    selectedDate?: string | null;
    showDateFilterBadge?: boolean;
    filterTasksByDate?: boolean;
    criticalResult?: CriticalPathResult;
  };
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
  selectedDate?: string | null;
  showDateFilterBadge?: boolean;
  filterTasksByDate?: boolean;
  autoCascade?: boolean;
  sidebarContainer?: HTMLElement | string;
  onChange?: (draft: JanttData) => void;
  onCommit?: (final: JanttData) => void;
  onViewportChange?: (viewport: ViewportOptions) => void;
  onTaskClick?: (task: Task) => void;
  onDateClick?: (dateStr: string) => void;
  onClearDateFilter?: () => void;
  onDayWidthChange?: (dayWidth: number) => void;
  onTaskDelete?: (taskId: string) => void;
  onTaskAdd?: (newTask: Task) => void;
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
