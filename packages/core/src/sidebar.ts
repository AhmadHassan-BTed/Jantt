import { Task, Category, CategoriesMap, DependencyItem } from "./types";
import { diffDays, addDays, taskDurationDays } from "./date-math";
import { resolveSchedule, ResolveScheduleOptions } from "./resolver";
import { getDependsOnItems, getTaskDependencyRelations, parseDependencyRelation, TaskIdLookup } from "./dependencies";
import { escapeHtml, syncTaskProgressAndStatus } from "./utils";
import { sanitizeCssColor } from "./layout";
import { constrainedStart, dependencyItemFor } from "./controller/contracts";
import { formatTimelineLabel } from "./timeline-labels";

const SIDEBAR_LABELS = {
  locked: "Locked",
  readOnly: "Read-Only",
  urgent: "Urgent",
  milestone: "Milestone",
  readOnlyHint: "You are in Read-Only Viewer mode. Task attributes cannot be modified.",
  name: "Task Name / Label",
  category: "Category",
  start: "Start Date",
  end: "End Date",
  duration: "Calculated Span:",
  assignee: "Assignee / Owner",
  priority: "Priority",
  wbs: "WBS Code",
  cost: "Estimated Budget / Cost ($)",
  status: "Status",
  progress: "Progress",
  notes: "Notes & Description",
  attributes: "Custom Attributes",
  deleteTask: "Delete Task",
  save: "Save Changes",
  independent: "None (Independent Task)",
  addPrerequisite: "+ Add Prerequisite Dependency...",
  noAttributes: "No custom attributes defined.",
  add: "+ Add",
  unsaved: "You have unsaved changes. Save your changes or discard them.",
  discard: "Discard",
  closeTitle: "Close Sidebar (Esc)",
  closeDetails: "Close task details",
  assigneeExample: "e.g. Sarah Chen",
  wbsExample: "e.g. 1.2",
  notesPlaceholder: "Add task notes or updates...",
  dependencyKind: "Dependency type and lag",
  removeDependency: "Remove dependency",
  removeAttribute: "Remove attribute",
  newAttributeName: "New attribute name",
  attributeNameExample: "Attribute name (e.g. depth)",
  newAttributeValue: "New attribute value",
  attributeValueExample: "Value (e.g. 45m)",
  dialog: "Task details: {task}",
  general: "General",
  none: "(none)",
  noPriority: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgentPriority: "Urgent (Critical)",
  notStarted: "Not Started",
  inProgress: "In Progress",
  submitted: "Submitted",
  completed: "Completed",
  blocked: "Blocked",
  oneDay: "{days} day",
  manyDays: "{days} days",
  prerequisites: "Prerequisite Dependencies",
  close: "Close",
  cancel: "Cancel",
  removeDependencyOn: "Remove dependency on {task}",
  ends: "Ends: {date}",
  conflict: "Dependency Timing Conflict:",
  conflictDetail: "Starts on {start}, but its prerequisites allow {allowed} at the earliest.",
  alignStart: "Align Start Date to {date}",
  removeAttributeNamed: "Remove attribute {name}",
  confirmDelete: "Are you sure you want to delete task \"{task}\"?",
  readOnlyError: "This chart is read-only; task changes are not saved.",
  lockedError: "Task \"{id}\" is locked; unlock it before changing its schedule."
};

export type TaskSidebarLabelKey = keyof typeof SIDEBAR_LABELS;
type TaskSidebarText = (key: TaskSidebarLabelKey, values?: Record<string, string | number>) => string;

export interface TaskSidebarOptions {
  /** Translates task details UI. Return undefined to use the English message for a key. */
  translate?: (key: TaskSidebarLabelKey) => string | undefined;
  locale?: string;
  task: Task;
  allTasks?: Task[];
  categories: CategoriesMap;
  container?: HTMLElement;
  theme?: Record<string, string>;
  themeClassName?: string;
  readOnly?: boolean;
  /**
   * Scheduling rules (gap, working calendars) used to flag dependency timing conflicts.
   * Defaults to the standard project gap.
   */
  scheduleOptions?: ResolveScheduleOptions;
  onSave: (updatedTask: Task) => void;
  onDelete?: (taskId: string) => void;
  onClose: () => void;
  /** Receives edits that were rejected (read-only chart, locked task). */
  onError?: (error: Error) => void;
  customRenderer?: (
    task: Task,
    container: HTMLElement,
    api: {
      updateTask: (patch: Partial<Task>) => void;
      close: () => void;
      /** True when the chart is read-only: `updateTask` is then a no-op. */
      readOnly: boolean;
      /** True when the task is locked: schedule fields (dates, dependencies) cannot be changed. */
      locked: boolean;
    }
  ) => void;
}

export interface TaskSidebarInstance {
  close: () => void;
  /** Requests a user-initiated dismissal. Returns false while unsaved edits await confirmation. */
  requestDismiss: () => boolean;
  element: HTMLElement;
}

/** Fields a locked task protects from edits. */
const SCHEDULE_FIELDS = ["start", "end", "dependsOn", "milestone"] as const;
const STATUS_OPTIONS: ReadonlyArray<[string, TaskSidebarLabelKey]> = [
  ["not-started", "notStarted"],
  ["in-progress", "inProgress"],
  ["submitted", "submitted"],
  ["completed", "completed"],
  ["blocked", "blocked"]
];
const PRIORITY_OPTIONS: ReadonlyArray<[string, TaskSidebarLabelKey]> = [
  ["", "noPriority"],
  ["low", "low"],
  ["medium", "medium"],
  ["high", "high"],
  ["urgent", "urgentPriority"]
];
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const CLOSE_ANIMATION_MS = 180;

let sidebarInstanceCounter = 0;

/**
 * Creates and mounts a slide-out Task Details Sidebar / Drawer with full multi-dependency management.
 */
export function createTaskSidebar(options: TaskSidebarOptions): TaskSidebarInstance {
  const {
    task,
    allTasks = [],
    categories,
    container,
    theme,
    themeClassName,
    readOnly = false,
    scheduleOptions,
    onSave,
    onDelete,
    onClose,
    onError,
    customRenderer
  } = options;

  const text: TaskSidebarText = (key, values) => {
    const template = options.translate?.(key) ?? SIDEBAR_LABELS[key];
    return values ? formatTimelineLabel(template, values) : template;
  };

  let currentTask: Task = {
    ...task,
    fields: task.fields ? { ...task.fields } : {}
  };

  const isCustomContainer = Boolean(container);
  const uid = `jantt-sidebar-${++sidebarInstanceCounter}`;
  const focusedAtOpen = document.activeElement as HTMLElement | null;
  const opener = focusedAtOpen && focusedAtOpen !== document.body ? focusedAtOpen : null;

  // Wrapper element
  const backdrop = document.createElement("div");
  backdrop.className = isCustomContainer
    ? `jantt-sidebar-embedded-wrap ${themeClassName || ""}`
    : `jantt-sidebar-backdrop ${themeClassName || ""}`;
  backdrop.setAttribute("role", "dialog");
  if (options.locale) backdrop.lang = options.locale;
  backdrop.setAttribute("aria-label", text("dialog", { task: task.label || task.name || task.id }));
  if (!isCustomContainer) backdrop.setAttribute("aria-modal", "true");

  const sidebarEl = document.createElement("aside");
  sidebarEl.className = `jantt-sidebar-drawer ${themeClassName || ""}`;
  sidebarEl.tabIndex = -1;
  backdrop.appendChild(sidebarEl);

  // Apply custom theme CSS variables if provided
  if (theme) {
    Object.entries(theme).forEach(([k, v]) => {
      const varName = k.startsWith("--") ? k : `--jantt-${k}`;
      backdrop.style.setProperty(varName, v);
      sidebarEl.style.setProperty(varName, v);
    });
  }

  let releaseSwipe: (() => void) | undefined;
  let closed = false;
  let form: SidebarForm | null = null;
  let discardArmed = false;
  const openedAt = Date.now();
  let pointerDownTarget: EventTarget | null = null;

  const restoreFocus = () => {
    const active = document.activeElement;
    if (active && active !== document.body && !backdrop.contains(active)) return; // user moved on
    if (opener?.isConnected) {
      opener.focus({ preventScroll: true });
      return;
    }
    // The bar that opened the drawer was usually re-rendered: focus its replacement.
    const bars = document.querySelectorAll<HTMLElement>(".jantt-task-bar[data-task-id], .jantt-milestone[data-task-id]");
    Array.from(bars).find((el) => el.dataset.taskId === task.id)?.focus({ preventScroll: true });
  };

  // Idempotent; listeners are removed and onClose fires right away (only the DOM removal waits
  // for the exit animation), so a host that opens a new drawer immediately stays consistent.
  const close = () => {
    if (closed) return;
    closed = true;
    releaseSwipe?.();
    document.removeEventListener("keydown", onKeyDown);
    if (sidebarEl.style.transform !== "translateY(100%)") sidebarEl.style.removeProperty("animation");
    sidebarEl.classList.add("is-closing");
    restoreFocus();
    setTimeout(() => backdrop.remove(), CLOSE_ANIMATION_MS);
    onClose();
  };

  /** Escape, backdrop click or swipe: never silently drops unsaved edits. Returns true when closed. */
  const requestDismiss = (): boolean => {
    if (!form || readOnly || discardArmed || !form.isDirty()) {
      close();
      return true;
    }
    discardArmed = true;
    form.showUnsavedNotice(close);
    return false;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      requestDismiss();
    } else if (e.key === "Tab" && !isCustomContainer) {
      trapTab(e, sidebarEl);
    }
  };

  document.addEventListener("keydown", onKeyDown);

  if (!isCustomContainer) {
    backdrop.addEventListener("pointerdown", (e) => {
      pointerDownTarget = e.target;
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target !== backdrop) return;
      if (pointerDownTarget && pointerDownTarget !== backdrop) {
        pointerDownTarget = null;
        return;
      }
      if (Date.now() - openedAt < 180 && pointerDownTarget !== backdrop) return;
      pointerDownTarget = null;
      requestDismiss();
    });
  }

  if (customRenderer) {
    customRenderer(currentTask, sidebarEl, {
      updateTask: (patch) => {
        if (readOnly) {
          onError?.(new Error(text("readOnlyError")));
          return;
        }
        if (currentTask.locked && patch.locked !== false && SCHEDULE_FIELDS.some((key) => key in patch)) {
          onError?.(new Error(text("lockedError", { id: currentTask.id })));
          return;
        }
        currentTask = { ...currentTask, ...patch };
        onSave(currentTask);
      },
      close,
      readOnly,
      locked: Boolean(currentTask.locked)
    });
  } else {
    form = renderDefaultSidebarContent(sidebarEl, {
      task: currentTask,
      original: task,
      text,
      locale: options.locale,
      allTasks,
      categories,
      readOnly,
      uid,
      scheduleOptions,
      onSave: (updated) => {
        currentTask = updated;
        onSave(updated);
        close();
      },
      onDelete: onDelete
        ? () => {
            onDelete(currentTask.id);
            close();
          }
        : undefined,
      onClose: close,
      onDismiss: requestDismiss
    });
  }

  const mountTarget = container || document.body;
  if (!isCustomContainer && typeof document !== "undefined") {
    // A document-level task drawer is a singleton modal. If one is already open, remove it.
    document.querySelectorAll(".jantt-sidebar-backdrop").forEach((el) => {
      el.remove();
    });
  }
  mountTarget.appendChild(backdrop);

  if (!isCustomContainer) {
    releaseSwipe = bindSheetSwipe(sidebarEl, requestDismiss);
  }
  sidebarEl.focus({ preventScroll: true });

  return {
    close,
    requestDismiss,
    element: sidebarEl
  };
}

/** Keeps Tab / Shift+Tab focus inside the modal drawer. */
function trapTab(e: KeyboardEvent, root: HTMLElement) {
  const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (focusables.length === 0) {
    e.preventDefault();
    root.focus();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === root || !root.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !root.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Mobile bottom sheet: dragging the pull handle or header down dismisses the sheet.
 * Only active while the pull handle is displayed (the bottom-sheet layout).
 */
function bindSheetSwipe(sheet: HTMLElement, requestDismiss: () => boolean) {
  const handle = sheet.querySelector<HTMLElement>(".jantt-sidebar-pull-handle");
  if (!handle) return;
  const grips = [handle, sheet.querySelector<HTMLElement>(".jantt-sidebar-header")].filter(
    (el): el is HTMLElement => Boolean(el)
  );

  let pointerId: number | null = null;
  let startY = 0;
  let lastY = 0, lastTime = 0, velocity = 0, dy = 0, height = 1;
  const backdrop = sheet.parentElement;
  function onMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    velocity = .35 * velocity + .65 * (e.clientY - lastY) / Math.max(1, e.timeStamp - lastTime);
    lastY = e.clientY;
    lastTime = e.timeStamp;
    dy = e.clientY - startY;
    const offset = dy < 0 ? -Math.min(14, Math.sqrt(-dy)) : Math.min(dy, height) + Math.sqrt(Math.max(0, dy - height));
    sheet.style.transform = `translate3d(0,${offset}px,0)`;
    backdrop?.style.setProperty("--sheet-opacity", String(Math.max(0, 1 - Math.max(0, offset) / height)));
  }
  function release() {
    pointerId = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onEnd);
    window.removeEventListener("pointercancel", onEnd);
  }
  function onEnd(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    release();
    sheet.style.transition = "transform 220ms cubic-bezier(.2,.85,.25,1.08)";
    const flick = dy > 22 && e.timeStamp - lastTime < 125 && velocity > .45;
    if (e.type === "pointerup" && (dy > height * .3 || flick)) {
      sheet.style.setProperty("animation", "none", "important");
      sheet.style.transform = "translateY(100%)";
      if (requestDismiss()) { backdrop?.style.setProperty("--sheet-opacity", "0"); return; }
    }
    backdrop?.style.removeProperty("--sheet-opacity");
    sheet.style.transform = "";
  }
  function onStart(e: PointerEvent) {
    if (pointerId !== null || !e.isPrimary || e.button !== 0 || !handle?.offsetHeight) return;
    if ((e.target as Element).closest("button, input, select, textarea, a[href]")) return;
    pointerId = e.pointerId;
    startY = lastY = e.clientY;
    lastTime = e.timeStamp;
    height = Math.max(1, sheet.offsetHeight);
    dy = velocity = 0;
    sheet.style.setProperty("animation", "none", "important");
    sheet.style.transition = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  }
  for (const grip of grips) {
    grip.style.touchAction = "none";
    grip.addEventListener("pointerdown", onStart);
  }
  return () => {
    release();
    for (const grip of grips) grip.removeEventListener("pointerdown", onStart);
  };
}

interface SidebarForm {
  /** True when the form differs from the task it was opened with. */
  isDirty: () => boolean;
  /** Shows an inline "unsaved changes" notice with a Discard action. */
  showUnsavedNotice: (discard: () => void) => void;
}

interface SidebarContentProps {
  text: TaskSidebarText;
  locale?: string;
  task: Task;
  original: Task;
  allTasks: Task[];
  categories: CategoriesMap;
  readOnly: boolean;
  uid: string;
  scheduleOptions?: ResolveScheduleOptions;
  onSave: (task: Task) => void;
  onDelete?: () => void;
  onClose: () => void;
  onDismiss: () => void;
}

function renderOptions(options: ReadonlyArray<[string, string]>, selected: string): string {
  const known = options.some(([value]) => value === selected);
  // A stored value the form does not know is shown (and kept) instead of being replaced.
  const extra = known ? "" : `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>`;
  return (
    extra +
    options
      .map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`)
      .join("")
  );
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/** Converts edited text back to the type the field originally had (number, boolean, object). */
function parseFieldValue(text: string, original: unknown): unknown {
  if (typeof original === "number") {
    const n = Number(text);
    return text.trim() !== "" && Number.isFinite(n) ? n : text;
  }
  if (typeof original === "boolean") {
    if (text.trim() === "true") return true;
    if (text.trim() === "false") return false;
    return text;
  }
  if (original !== null && typeof original === "object") {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function formatDependencyKind(item: DependencyItem, knownIds: TaskIdLookup): string {
  const rel = parseDependencyRelation(item, knownIds);
  if (!rel || (rel.type === "FS" && !rel.explicitLag && rel.lagDays === 0)) return "";
  const lag = rel.lagDays === 0 ? (rel.explicitLag ? "+0d" : "") : `${rel.lagDays > 0 ? "+" : ""}${rel.lagDays}d`;
  return `${rel.type}${lag}`;
}

/**
 * Renders the full task inspector with multi-dependency management and conflict detection.
 * Only fields the user actually changed are written back on save.
 */
function renderDefaultSidebarContent(container: HTMLElement, props: SidebarContentProps): SidebarForm {
  const { task, original, allTasks, categories, readOnly, uid, scheduleOptions, onSave, onDelete, onClose, text, locale } = props;
  const html: TaskSidebarText = (key, values) => escapeHtml(text(key, values));
  const number = new Intl.NumberFormat(locale);
  const hasCategory = typeof task.category === "string" && Object.prototype.hasOwnProperty.call(categories, task.category);
  const cat: Category | undefined = hasCategory ? categories[task.category] : undefined;
  const catLabel = String(cat?.label || task.category || text("general"));
  const catColor = sanitizeCssColor(cat?.color, "#38BDF8");
  const editLocked = readOnly || Boolean(task.locked);
  const disabledIf = (flag: boolean) => (flag ? "disabled" : "");
  const labelId = (name: string) => `${uid}-${name}`;

  const liveTasks = allTasks.filter((t) => t && !t._deleted);
  const taskById = new Map(liveTasks.map((t) => [t.id, t] as [string, Task]));
  // Every id of the plan, so links to ids such as "model-3d" are not read as lag shorthand.
  const knownIds = new Set<string>([task.id]);
  allTasks.forEach((t) => {
    if (t) knownIds.add(t.id);
  });

  // Tasks that (transitively) depend on this one cannot become its prerequisites (no cycles).
  const dependentsOf = new Map<string, string[]>();
  liveTasks.forEach((t) => {
    getTaskDependencyRelations(t, knownIds).forEach((rel) => {
      const list = dependentsOf.get(rel.id);
      if (list) list.push(t.id);
      else dependentsOf.set(rel.id, [t.id]);
    });
  });
  const successors = new Set<string>();
  const stack = [task.id];
  while (stack.length > 0) {
    for (const s of dependentsOf.get(stack.pop()!) ?? []) {
      if (!successors.has(s)) {
        successors.add(s);
        stack.push(s);
      }
    }
  }

  // Dependencies are edited as their raw items, so typed links (SS/FF/SF, lag) survive a save.
  let depItems: DependencyItem[] = (getDependsOnItems(task.dependsOn) as unknown[]).filter(
    (item): item is DependencyItem => parseDependencyRelation(item, knownIds) !== null
  );
  let depsDirty = false;

  const initial = {
    label: task.label || task.name || task.id,
    category: typeof task.category === "string" ? task.category : "",
    start: task.start,
    end: task.end,
    status: typeof task.status === "string" ? task.status : "",
    priority: typeof task.priority === "string" ? task.priority : "",
    cost: typeof task.estimatedCost === "number" && Number.isFinite(task.estimatedCost) ? String(task.estimatedCost) : "",
    progress: Math.round(Math.max(0, Math.min(1, Number.isFinite(task.progress) ? (task.progress as number) : 0)) * 100)
  };

  const categoryOptions: Array<[string, string]> = Object.entries(categories).map(([key, c]) => [key, String(c?.label || key)]);
  const statusOptions: Array<[string, string]> = STATUS_OPTIONS.map(([key, label]) => [key, text(label)]);
  if (!initial.status) statusOptions.unshift(["", text("none")]);
  const durationText = (s: string, e: string) => {
    // Same rule as the chart: flagged or same-day tasks are milestones (0 days).
    const days = taskDurationDays(s, e, Boolean(task.milestone) || diffDays(s, e) === 0);
    return text(days === 1 ? "oneDay" : "manyDays", { days: number.format(days) });
  };

  container.innerHTML = `
    <!-- Pull handle for mobile bottom sheet -->
    <div class="jantt-sidebar-pull-handle" aria-hidden="true"></div>
    <!-- Header -->
    <div class="jantt-sidebar-header">
      <div class="jantt-sidebar-header-info">
        <div class="jantt-sidebar-tags">
          <span class="jantt-hover-category-pill" style="background: color-mix(in srgb, ${catColor} 12%, transparent); color: var(--jantt-text); border: 1px solid color-mix(in srgb, ${catColor} 31%, transparent);">
            <span class="jantt-hover-dot" style="background: ${catColor};"></span>
            ${escapeHtml(catLabel)}
          </span>
          <span class="jantt-hover-id-badge">#${escapeHtml(task.id)}</span>
          ${task.locked ? `<span class="jantt-hover-type-pill is-locked">${html("locked")}</span>` : ""}
          ${readOnly ? `<span class="jantt-hover-type-pill is-locked" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.4);">${html("readOnly")}</span>` : ""}
          ${task.urgent ? `<span class="jantt-hover-type-pill is-urgent">${html("urgent")}</span>` : ""}
          ${task.milestone ? `<span class="jantt-hover-type-pill is-milestone">${html("milestone")}</span>` : ""}
        </div>
        <h2 class="jantt-sidebar-title" id="${labelId("title")}">${escapeHtml(initial.label)}</h2>
      </div>
      <button type="button" class="jantt-sidebar-close-btn" title="${html("closeTitle")}" aria-label="${html("closeDetails")}" style="display: flex; align-items: center; justify-content: center;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>

    <!-- Body Content -->
    <div class="jantt-sidebar-body">
      ${
        readOnly
          ? `<div style="margin-bottom: 14px; padding: 10px 12px; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; font-size: 11.5px; color: #f59e0b; display: flex; align-items: center; gap: 8px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span>${html("readOnlyHint")}</span></div>`
          : ""
      }
      <!-- Title & Label Field -->
      <div class="jantt-form-group">
        <label class="jantt-form-label" id="${labelId("label-l")}">${html("name")}</label>
        <input type="text" id="jantt-sidebar-label" aria-labelledby="${labelId("label-l")}" class="jantt-input" value="${escapeHtml(initial.label)}" ${disabledIf(editLocked)} />
      </div>

      <!-- Category Selector -->
      <div class="jantt-form-group">
        <label class="jantt-form-label" id="${labelId("category-l")}">${html("category")}</label>
        <select id="jantt-sidebar-category" aria-labelledby="${labelId("category-l")}" class="jantt-select" ${disabledIf(editLocked)}>
          ${renderOptions(initial.category ? categoryOptions : [["", text("none")], ...categoryOptions], initial.category)}
        </select>
      </div>

      <!-- Schedule Card (Start, End, Dynamic Duration) -->
      <div class="jantt-sidebar-card">
        <div class="jantt-form-grid-2">
          <div class="jantt-form-group">
            <label class="jantt-form-label" id="${labelId("start-l")}">${html("start")}</label>
            <input type="date" id="jantt-sidebar-start" aria-labelledby="${labelId("start-l")}" class="jantt-input" value="${escapeHtml(task.start)}" ${disabledIf(editLocked)} />
          </div>
          <div class="jantt-form-group">
            <label class="jantt-form-label" id="${labelId("end-l")}">${html("end")}</label>
            <input type="date" id="jantt-sidebar-end" aria-labelledby="${labelId("end-l")}" class="jantt-input" value="${escapeHtml(task.end)}" ${disabledIf(editLocked)} />
          </div>
        </div>
        <div class="jantt-sidebar-stat-footer">
          <span style="font-size: 11px; color: var(--jantt-text-muted);">${html("duration")}</span>
          <span id="jantt-sidebar-duration" style="font-family: var(--jantt-font-mono); font-weight: 700; color: var(--jantt-accent);">
            ${escapeHtml(durationText(task.start, task.end))}
          </span>
        </div>
      </div>

      <!-- Multi-Dependency Management Section -->
      <div class="jantt-form-group">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <label class="jantt-form-label" id="${labelId("deps-l")}" style="margin: 0;">${html("prerequisites")} (<span id="jantt-sidebar-dep-count">${number.format(depItems.length)}</span>)</label>
        </div>
        <div id="jantt-sidebar-deps-container" style="display: flex; flex-direction: column; gap: 8px;">
          <!-- Active Dependency Chips -->
          <div id="jantt-sidebar-dep-chips" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>

          <!-- Add Dependency Dropdown -->
          ${
            !editLocked
              ? `
          <div style="display: flex; gap: 6px; align-items: center;">
            <select id="jantt-sidebar-add-dep-select" aria-labelledby="${labelId("deps-l")}" class="jantt-select" style="font-size: 12px;">
              <option value="">${html("addPrerequisite")}</option>
            </select>
          </div>
          `
              : ""
          }

          <!-- Timing Conflict Alert Area -->
          <div id="jantt-sidebar-dep-conflict-box" role="status" style="display: none;"></div>
        </div>
      </div>

      <!-- Assignee & Priority -->
      <div class="jantt-form-grid-2">
        <div class="jantt-form-group">
          <label class="jantt-form-label" id="${labelId("assignee-l")}">${html("assignee")}</label>
          <input type="text" id="jantt-sidebar-assignee" aria-labelledby="${labelId("assignee-l")}" class="jantt-input" placeholder="${html("assigneeExample")}" value="${escapeHtml(task.assignee || "")}" ${disabledIf(editLocked)} />
        </div>

        <div class="jantt-form-group">
          <label class="jantt-form-label" id="${labelId("priority-l")}">${html("priority")}</label>
          <select id="jantt-sidebar-priority" aria-labelledby="${labelId("priority-l")}" class="jantt-select" ${disabledIf(editLocked)}>
            ${renderOptions(PRIORITY_OPTIONS.map(([key, label]) => [key, text(label)]), initial.priority)}
          </select>
        </div>
      </div>

      <!-- WBS & Estimated Cost -->
      <div class="jantt-form-grid-2">
        <div class="jantt-form-group">
          <label class="jantt-form-label" id="${labelId("wbs-l")}">${html("wbs")}</label>
          <input type="text" id="jantt-sidebar-wbs" aria-labelledby="${labelId("wbs-l")}" class="jantt-input" placeholder="${html("wbsExample")}" value="${escapeHtml(task.wbs || "")}" ${disabledIf(editLocked)} />
        </div>

        <div class="jantt-form-group">
          <label class="jantt-form-label" id="${labelId("cost-l")}">${html("cost")}</label>
          <input type="number" id="jantt-sidebar-cost" aria-labelledby="${labelId("cost-l")}" class="jantt-input" placeholder="0" value="${escapeHtml(initial.cost)}" ${disabledIf(editLocked)} />
        </div>
      </div>

      <!-- Status & Progress -->
      <div class="jantt-form-grid-2">
        <div class="jantt-form-group">
          <label class="jantt-form-label" id="${labelId("status-l")}">${html("status")}</label>
          <select id="jantt-sidebar-status" aria-labelledby="${labelId("status-l")}" class="jantt-select" ${disabledIf(readOnly)}>
            ${renderOptions(statusOptions, initial.status)}
          </select>
        </div>

        <div class="jantt-form-group">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <label class="jantt-form-label" id="${labelId("progress-l")}" style="margin: 0;">${html("progress")}</label>
            <span id="jantt-sidebar-prog-val" style="font-family: var(--jantt-font-mono); font-size: 11px; font-weight: 700; color: var(--jantt-accent);">${initial.progress}%</span>
          </div>
          <input type="range" id="jantt-sidebar-prog-input" aria-labelledby="${labelId("progress-l")}" min="0" max="100" value="${initial.progress}" class="jantt-slider" ${disabledIf(readOnly)} />
        </div>
      </div>

      <!-- Notes Field -->
      <div class="jantt-form-group">
        <label class="jantt-form-label" id="${labelId("notes-l")}">${html("notes")}</label>
        <textarea id="jantt-sidebar-notes" aria-labelledby="${labelId("notes-l")}" class="jantt-textarea" rows="3" placeholder="${html("notesPlaceholder")}" ${disabledIf(readOnly)}>${escapeHtml(task.notes || "")}</textarea>
      </div>

      <!-- Custom Fields Bag -->
      <div class="jantt-form-group">
        <label class="jantt-form-label">${html("attributes")}</label>
        <div id="jantt-sidebar-fields" class="jantt-sidebar-fields-container"></div>
      </div>
    </div>

    <!-- Footer Actions -->
    <div class="jantt-sidebar-footer" style="flex-wrap: wrap;">
      <div id="jantt-sidebar-unsaved" role="alert" style="display: none; width: 100%; margin-bottom: 8px; font-size: 11.5px; color: #f59e0b; align-items: center; gap: 8px;"></div>
      ${
        onDelete && !editLocked
          ? `<button type="button" class="jantt-btn jantt-btn-danger" id="jantt-sidebar-delete">${html("deleteTask")}</button>`
          : ""
      }
      <div style="display: flex; gap: 8px; margin-left: auto;">
        <button type="button" class="jantt-btn jantt-btn-secondary" id="jantt-sidebar-cancel">${html(readOnly ? "close" : "cancel")}</button>
        ${
          !readOnly
            ? `<button type="button" class="jantt-btn jantt-btn-primary" id="jantt-sidebar-save">${html("save")}</button>`
            : ""
        }
      </div>
    </div>
  `;

  const q = <T extends Element>(selector: string) => container.querySelector<T>(selector);

  // Bind close and cancel handlers (explicit actions always discard)
  q(".jantt-sidebar-close-btn")?.addEventListener("click", () => props.onDismiss());
  q("#jantt-sidebar-cancel")?.addEventListener("click", () => onClose());

  const labelInput = q<HTMLInputElement>("#jantt-sidebar-label");
  const categorySelect = q<HTMLSelectElement>("#jantt-sidebar-category");
  const startInput = q<HTMLInputElement>("#jantt-sidebar-start");
  const endInput = q<HTMLInputElement>("#jantt-sidebar-end");
  const durLabel = q<HTMLElement>("#jantt-sidebar-duration");
  const conflictBox = q<HTMLElement>("#jantt-sidebar-dep-conflict-box");
  const chipsContainer = q<HTMLElement>("#jantt-sidebar-dep-chips");
  const depCount = q<HTMLElement>("#jantt-sidebar-dep-count");
  const addSelect = q<HTMLSelectElement>("#jantt-sidebar-add-dep-select");
  const assigneeInput = q<HTMLInputElement>("#jantt-sidebar-assignee");
  const prioritySelect = q<HTMLSelectElement>("#jantt-sidebar-priority");
  const wbsInput = q<HTMLInputElement>("#jantt-sidebar-wbs");
  const costInput = q<HTMLInputElement>("#jantt-sidebar-cost");
  const statusSelect = q<HTMLSelectElement>("#jantt-sidebar-status");
  const progInput = q<HTMLInputElement>("#jantt-sidebar-prog-input");
  const progVal = q<HTMLElement>("#jantt-sidebar-prog-val");
  const notesInput = q<HTMLTextAreaElement>("#jantt-sidebar-notes");
  const unsavedNotice = q<HTMLElement>("#jantt-sidebar-unsaved");

  const currentDependsOn = (): Task["dependsOn"] =>
    depItems.length === 0 ? null : depItems.length === 1 ? depItems[0] : [...depItems];

  const resolveProbe = (tasks: Task[]) => resolveSchedule(tasks, { ...scheduleOptions, autoCascade: true });

  const renderDeps = () => {
    if (depCount) depCount.textContent = number.format(depItems.length);

    if (chipsContainer) {
      if (depItems.length === 0) {
        chipsContainer.innerHTML =
          `<span style="font-size: 12px; color: var(--jantt-text-muted); font-style: italic;">${html("independent")}</span>`;
      } else {
        chipsContainer.innerHTML = depItems
          .map((item, index) => {
            const depId = parseDependencyRelation(item, knownIds)?.id ?? "";
            const prereq = taskById.get(depId);
            const pLabel = prereq ? prereq.label || prereq.name || prereq.id : depId;
            const kind = formatDependencyKind(item, knownIds);
            return `
            <span class="jantt-badge" style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; font-size: 11.5px; background: var(--jantt-surface-solid); border: 1px solid var(--jantt-border);">
              <span>${escapeHtml(pLabel)} (#${escapeHtml(depId)})</span>
              ${kind ? `<span style="font-family: var(--jantt-font-mono); font-size: 10.5px; color: var(--jantt-accent);" title="${html("dependencyKind")}">${escapeHtml(kind)}</span>` : ""}
              ${
                !editLocked
                  ? `<button type="button" data-remove-dep-index="${index}" aria-label="${html("removeDependencyOn", { task: pLabel })}" style="background: none; border: none; color: var(--jantt-text-dim); cursor: pointer; padding: 0; display: inline-flex; align-items: center; justify-content: center;" title="${html("removeDependency")}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`
                  : ""
              }
            </span>
          `;
          })
          .join("");

        chipsContainer.querySelectorAll<HTMLButtonElement>("[data-remove-dep-index]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const index = Number(btn.dataset.removeDepIndex);
            depItems = depItems.filter((_, i) => i !== index);
            depsDirty = true;
            renderDeps();
          });
        });
      }
    }

    // Refresh add dropdown options: never offer the task itself, current prerequisites or any task
    // that already depends on this one (which would create a cycle).
    if (addSelect) {
      const linked = new Set(depItems.map((item) => parseDependencyRelation(item, knownIds)?.id));
      const available = liveTasks.filter((t) => t.id !== task.id && !linked.has(t.id) && !successors.has(t.id));
      addSelect.innerHTML =
        `<option value="">${html("addPrerequisite")}</option>` +
        available
          .map((t) => {
            const tLabel = escapeHtml(t.label || t.name || t.id);
            return `<option value="${escapeHtml(t.id)}">${tLabel} (#${escapeHtml(t.id)}) [${html("ends", { date: t.end })}]</option>`;
          })
          .join("");
    }

    renderConflicts();
  };

  // Flags a start date earlier than the scheduler allows, using the scheduler's own rules.
  const renderConflicts = () => {
    if (!conflictBox || !startInput || !endInput) return;
    const curStart = startInput.value;
    const curEnd = endInput.value || curStart;
    const allowed =
      curStart && depItems.length > 0
        ? constrainedStart(
            { ...task, start: curStart, end: curEnd, dependsOn: currentDependsOn() },
            (id) => taskById.get(id),
            resolveProbe,
            knownIds
          )
        : curStart;

    if (!curStart || diffDays(curStart, allowed) <= 0) {
      conflictBox.style.display = "none";
      conflictBox.innerHTML = "";
      return;
    }

    conflictBox.style.display = "block";
    conflictBox.innerHTML = `
      <div style="background: rgba(244, 63, 94, 0.12); border-left: 3px solid #F43F5E; padding: 8px 12px; border-radius: 6px; font-size: 11.5px; margin-top: 4px;">
        <div style="color: #F43F5E; font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #F43F5E;"></span>
          ${html("conflict")}
        </div>
        <div style="color: var(--jantt-text-muted);">
          ${html("conflictDetail", { start: curStart, allowed })}
        </div>
        ${
          !editLocked
            ? `<button type="button" id="jantt-sidebar-align-btn" class="jantt-btn jantt-btn-secondary" style="padding: 3px 8px; font-size: 11px; margin-top: 6px;">${html("alignStart", { date: allowed })}</button>`
            : ""
        }
      </div>
    `;

    conflictBox.querySelector("#jantt-sidebar-align-btn")?.addEventListener("click", () => {
      const oldSpan = Math.max(diffDays(startInput.value, endInput.value), 0);
      startInput.value = allowed;
      endInput.value = addDays(allowed, oldSpan);
      updateDuration();
    });
  };

  addSelect?.addEventListener("change", () => {
    const val = addSelect.value;
    if (val && taskById.has(val) && !successors.has(val)) {
      depItems = [...depItems, dependencyItemFor(val)];
      depsDirty = true;
      renderDeps();
    }
  });

  const updateDuration = () => {
    if (startInput && endInput && durLabel && startInput.value && endInput.value) {
      durLabel.textContent = durationText(startInput.value, endInput.value);
    }
    renderConflicts();
  };

  startInput?.addEventListener("change", () => {
    if (startInput && endInput && startInput.value && endInput.value && diffDays(startInput.value, endInput.value) < 0) {
      endInput.value = startInput.value;
    }
    updateDuration();
  });

  endInput?.addEventListener("change", () => {
    if (startInput && endInput && startInput.value && endInput.value && diffDays(startInput.value, endInput.value) < 0) {
      startInput.value = endInput.value;
    }
    updateDuration();
  });

  renderDeps();

  // Progress slider feedback with bidirectional status sync
  const syncProgToStatus = () => {
    if (!progInput || !progVal || !statusSelect) return;
    const pVal = parseInt(progInput.value, 10);
    progVal.textContent = `${pVal}%`;
    const synced = syncTaskProgressAndStatus({ progress: pVal / 100 }, { status: statusSelect.value || undefined });
    const nextStatus = synced.status;
    if (nextStatus && nextStatus !== statusSelect.value && Array.from(statusSelect.options).some((o) => o.value === nextStatus)) {
      statusSelect.value = nextStatus;
    }
  };

  progInput?.addEventListener("input", syncProgToStatus);
  progInput?.addEventListener("change", syncProgToStatus);

  // Status change auto-sync with progress
  statusSelect?.addEventListener("change", () => {
    if (!progInput || !progVal || !statusSelect || !statusSelect.value) return;
    const synced = syncTaskProgressAndStatus(
      { status: statusSelect.value },
      { progress: parseInt(progInput.value, 10) / 100 }
    );
    if (synced.progress !== undefined && synced.progress !== null) {
      const newPct = Math.round(synced.progress * 100);
      progInput.value = String(newPct);
      progVal.textContent = `${newPct}%`;
    }
  });

  // Custom attributes: edited as text, written back with their original types.
  const originalFields: Record<string, unknown> = task.fields ? { ...task.fields } : {};
  const fieldDraft: Record<string, string> = {};
  Object.entries(originalFields).forEach(([k, v]) => {
    fieldDraft[k] = formatFieldValue(v);
  });
  let fieldsDirty = false;

  const renderFieldsSection = () => {
    const fieldsContainer = q<HTMLElement>("#jantt-sidebar-fields");
    if (!fieldsContainer) return;

    const entries = Object.entries(fieldDraft);
    let markup = "";
    if (entries.length === 0) {
      markup += `<div style="font-size: 12px; color: var(--jantt-text-dim); font-style: italic;">${html("noAttributes")}</div>`;
    } else {
      entries.forEach(([key, val]) => {
        markup += `
          <div class="jantt-sidebar-field-row" style="display: flex; align-items: center; gap: 8px;">
            <span class="jantt-sidebar-field-key" style="font-family: var(--jantt-font-mono); font-size: 11.5px; font-weight: 600; color: var(--jantt-text-muted); min-width: 90px; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(key)}:</span>
            <input type="text" data-field-val-key="${escapeHtml(key)}" aria-label="${escapeHtml(key)}" value="${escapeHtml(val)}" class="jantt-input jantt-input-sm" style="flex-grow: 1;" ${disabledIf(editLocked)} />
            ${!editLocked ? `<button type="button" data-del-field-key="${escapeHtml(key)}" aria-label="${html("removeAttributeNamed", { name: key })}" class="jantt-btn jantt-btn-secondary" style="padding: 2px 6px; font-size: 11px; height: 26px; display: inline-flex; align-items: center; justify-content: center;" title="${html("removeAttribute")}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` : ""}
          </div>
        `;
      });
    }

    if (!editLocked) {
      markup += `
        <div style="display: flex; gap: 6px; align-items: center; margin-top: 6px; padding-top: 8px; border-top: 1px dashed var(--jantt-border-subtle);">
          <input type="text" id="jantt-new-field-key" aria-label="${html("newAttributeName")}" class="jantt-input jantt-input-sm" placeholder="${html("attributeNameExample")}" style="width: 130px; font-size: 11.5px;" />
          <input type="text" id="jantt-new-field-val" aria-label="${html("newAttributeValue")}" class="jantt-input jantt-input-sm" placeholder="${html("attributeValueExample")}" style="flex-grow: 1; font-size: 11.5px;" />
          <button type="button" id="jantt-add-field-btn" class="jantt-btn jantt-btn-secondary" style="font-size: 11.5px; white-space: nowrap; height: 28px;">${html("add")}</button>
        </div>
      `;
    }

    fieldsContainer.innerHTML = markup;

    fieldsContainer.querySelectorAll<HTMLButtonElement>("[data-del-field-key]").forEach((btn) => {
      btn.addEventListener("click", () => {
        delete fieldDraft[btn.dataset.delFieldKey!];
        fieldsDirty = true;
        renderFieldsSection();
      });
    });

    fieldsContainer.querySelectorAll<HTMLInputElement>("[data-field-val-key]").forEach((inp) => {
      inp.addEventListener("input", () => {
        fieldDraft[inp.dataset.fieldValKey!] = inp.value;
        fieldsDirty = true;
      });
    });

    const addBtn = fieldsContainer.querySelector<HTMLButtonElement>("#jantt-add-field-btn");
    const keyInput = fieldsContainer.querySelector<HTMLInputElement>("#jantt-new-field-key");
    const valInput = fieldsContainer.querySelector<HTMLInputElement>("#jantt-new-field-val");

    const handleAdd = () => {
      const k = keyInput?.value.trim();
      if (k) {
        fieldDraft[k] = valInput?.value.trim() || "";
        fieldsDirty = true;
        renderFieldsSection();
      }
    };

    addBtn?.addEventListener("click", handleAdd);
    valInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAdd();
      }
    });
    keyInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        valInput?.focus();
      }
    });
  };

  renderFieldsSection();

  /** The fields the user changed, ready to merge onto the task. */
  const collectChanges = (): Partial<Task> => {
    const patch: Partial<Task> = {};
    const label = labelInput?.value.trim() ?? "";
    if (label && label !== initial.label) {
      patch.label = label;
      if (original.name !== undefined) patch.name = label;
    }
    if (categorySelect && categorySelect.value !== initial.category) patch.category = categorySelect.value;
    if (startInput?.value && startInput.value !== initial.start) patch.start = startInput.value;
    if (endInput?.value && endInput.value !== initial.end) patch.end = endInput.value;
    if (depsDirty) patch.dependsOn = currentDependsOn();
    if (assigneeInput && assigneeInput.value !== (task.assignee || "")) patch.assignee = assigneeInput.value || undefined;
    if (prioritySelect && prioritySelect.value !== initial.priority) patch.priority = prioritySelect.value || undefined;
    if (wbsInput && wbsInput.value !== (task.wbs || "")) patch.wbs = wbsInput.value || undefined;
    if (costInput && costInput.value !== initial.cost) {
      const cost = parseFloat(costInput.value);
      if (costInput.value.trim() === "") patch.estimatedCost = undefined;
      else if (Number.isFinite(cost)) patch.estimatedCost = cost;
    }

    // Status and progress are only written when changed (status alone derives progress & v.v.).
    const statusPatch: Partial<Task> = {};
    if (statusSelect && statusSelect.value !== initial.status) statusPatch.status = statusSelect.value || undefined;
    if (progInput && parseInt(progInput.value, 10) !== initial.progress) statusPatch.progress = parseInt(progInput.value, 10) / 100;
    if (Object.keys(statusPatch).length > 0) {
      Object.assign(patch, syncTaskProgressAndStatus(statusPatch, task));
    }

    if (notesInput && notesInput.value !== (task.notes || "")) patch.notes = notesInput.value;

    if (fieldsDirty) {
      const nextFields: Record<string, unknown> = {};
      let changed = Object.keys(originalFields).some((k) => !(k in fieldDraft));
      Object.entries(fieldDraft).forEach(([k, text]) => {
        const had = Object.prototype.hasOwnProperty.call(originalFields, k);
        if (had && text === formatFieldValue(originalFields[k])) {
          nextFields[k] = originalFields[k];
        } else {
          nextFields[k] = parseFieldValue(text, had ? originalFields[k] : "");
          changed = true;
        }
      });
      if (changed) patch.fields = Object.keys(nextFields).length > 0 ? nextFields : undefined;
    }
    return patch;
  };

  // Delete Task Handler
  q("#jantt-sidebar-delete")?.addEventListener("click", () => {
    if (confirm(text("confirmDelete", { task: task.label || task.id }))) {
      onDelete?.();
    }
  });

  // Save Task Handler: the task as it was opened plus exactly the user's changes.
  q("#jantt-sidebar-save")?.addEventListener("click", () => {
    onSave({ ...original, ...collectChanges() });
  });

  return {
    isDirty: () => !readOnly && Object.keys(collectChanges()).length > 0,
    showUnsavedNotice: (discard) => {
      if (!unsavedNotice) {
        discard();
        return;
      }
      unsavedNotice.style.display = "flex";
      unsavedNotice.innerHTML =
        `<span>${html("unsaved")}</span>` +
        `<button type="button" class="jantt-btn jantt-btn-secondary" id="jantt-sidebar-discard" style="padding: 3px 8px; font-size: 11px; margin-left: auto;">${html("discard")}</button>`;
      const discardBtn = unsavedNotice.querySelector<HTMLButtonElement>("#jantt-sidebar-discard");
      discardBtn?.addEventListener("click", () => discard());
      discardBtn?.focus();
    }
  };
}
