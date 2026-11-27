import { Task, Category, CategoriesMap, DependencyItem, TimeFormat, NoteItem } from "./types";
import {
  diffDays,
  addDays,
  addMinutes,
  taskDurationDays,
  taskDurationMinutes,
  formatDurationLabel,
  formatHumanDate,
  formatTimeOfDay,
  formatTimestampWithFormat,
  getDatePart,
  getTimePart,
  hasTimeComponent,
  toEpochMinutes
} from "./date-math";
import { resolveSchedule, ResolveScheduleOptions } from "./resolver";
import { getDependsOnItems, getTaskDependencyRelations, parseDependencyRelation, TaskIdLookup } from "./dependencies";
import { escapeHtml, syncTaskProgressAndStatus } from "./utils";
import { sanitizeCssColor } from "./layout";
import { constrainedStart, dependencyItemFor } from "./controller/contracts";

export interface TaskSidebarOptions {
  task: Task;
  allTasks?: Task[];
  categories: CategoriesMap;
  container?: HTMLElement;
  theme?: Record<string, string>;
  themeClassName?: string;
  readOnly?: boolean;
  timeFormat?: TimeFormat;
  /** Notes attached to this task (rendered near the bottom of the inspector). */
  taskNotes?: NoteItem[];
  /** Invoked when the user clicks "Add Note" in the task inspector. */
  onAddNote?: (task: Task) => void;
  /** Invoked when the user opens a linked note or clicks "Manage Notes" for this task. */
  onOpenTaskNotes?: (task: Task, noteId?: string) => void;
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
const STATUS_OPTIONS: ReadonlyArray<[string, string]> = [
  ["not-started", "Not Started"],
  ["in-progress", "In Progress"],
  ["submitted", "Submitted"],
  ["completed", "Completed"],
  ["blocked", "Blocked"]
];
const PRIORITY_OPTIONS: ReadonlyArray<[string, string]> = [
  ["", "None"],
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
  ["urgent", "Urgent (Critical)"]
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
    timeFormat = "12h",
    taskNotes = [],
    onAddNote,
    onOpenTaskNotes,
    scheduleOptions,
    onSave,
    onDelete,
    onClose,
    onError,
    customRenderer
  } = options;

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
  backdrop.setAttribute("aria-label", `Task details: ${task.label || task.name || task.id}`);
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
          onError?.(new Error("This chart is read-only; task changes are not saved."));
          return;
        }
        if (currentTask.locked && patch.locked !== false && SCHEDULE_FIELDS.some((key) => key in patch)) {
          onError?.(new Error(`Task "${currentTask.id}" is locked; unlock it before changing its schedule.`));
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
      allTasks,
      categories,
      readOnly,
      timeFormat,
      taskNotes,
      uid,
      scheduleOptions,
      onAddNote: onAddNote ? () => onAddNote(currentTask) : undefined,
      onOpenTaskNotes: onOpenTaskNotes ? (noteId?: string) => onOpenTaskNotes(currentTask, noteId) : undefined,
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
  task: Task;
  original: Task;
  allTasks: Task[];
  categories: CategoriesMap;
  readOnly: boolean;
  timeFormat: TimeFormat;
  taskNotes: NoteItem[];
  uid: string;
  scheduleOptions?: ResolveScheduleOptions;
  onAddNote?: () => void;
  onOpenTaskNotes?: (noteId?: string) => void;
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
  const {
    task,
    original,
    allTasks,
    categories,
    readOnly,
    timeFormat,
    taskNotes,
    uid,
    scheduleOptions,
    onAddNote,
    onOpenTaskNotes,
    onSave,
    onDelete,
    onClose
  } = props;
  const linkedNotes = (Array.isArray(taskNotes) ? taskNotes : [])
    .filter((n) => n && !n._deleted && (!Array.isArray(n.task_ids) || n.task_ids.includes(task.id)))
    .slice()
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      const ta = new Date(a.updatedAt || a.timestamp || a.createdAt || 0).getTime() || 0;
      const tb = new Date(b.updatedAt || b.timestamp || b.createdAt || 0).getTime() || 0;
      return tb - ta;
    });
  const showTaskNotesSection = Boolean(onAddNote || onOpenTaskNotes || linkedNotes.length > 0);
  const taskNotePreviewHtml =
    linkedNotes.length > 0
      ? `<div class="jantt-sidebar-notes-list">${linkedNotes
          .slice(0, 3)
          .map((note) => {
            const noteColor = sanitizeCssColor(note.color, "#38BDF8");
            const noteTitle = String(note.title || "").trim() || "Untitled Note";
            const tsIso = note.timestamp || note.updatedAt || note.createdAt;
            const tsLabel = formatTimestampWithFormat(tsIso, timeFormat, false);
            return `<button type="button" class="jantt-sidebar-note-row" data-task-note-id="${escapeHtml(note.id)}" title="Open in Notes view">
              <span class="jantt-sidebar-note-dot" style="background: ${noteColor};"></span>
              <span class="jantt-sidebar-note-title">${escapeHtml(noteTitle)}</span>
              ${tsLabel ? `<span class="jantt-sidebar-note-time">${escapeHtml(tsLabel)}</span>` : ""}
            </button>`;
          })
          .join("")}</div>`
      : `<p class="jantt-sidebar-notes-empty">Keep timestamped notes, logs, and @mentions linked directly to this task.</p>`;
  const hasCategory = typeof task.category === "string" && Object.prototype.hasOwnProperty.call(categories, task.category);
  const cat: Category | undefined = hasCategory ? categories[task.category] : undefined;
  const catLabel = String(cat?.label || task.category || "General");
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

  const combineDateTime = (dateVal: string, timeVal: string): string => (dateVal && timeVal ? `${dateVal}T${timeVal}` : dateVal);
  const startDateInit = getDatePart(task.start);
  const startTimeInit = getTimePart(task.start);
  const endDateInit = getDatePart(task.end);
  const endTimeInit = getTimePart(task.end);
  const initialStartCanonical = combineDateTime(startDateInit, startTimeInit);
  const initialEndCanonical = combineDateTime(endDateInit, endTimeInit);

  const initial = {
    label: task.label || task.name || task.id,
    category: typeof task.category === "string" ? task.category : "",
    start: initialStartCanonical || task.start,
    end: initialEndCanonical || task.end,
    status: typeof task.status === "string" ? task.status : "",
    priority: typeof task.priority === "string" ? task.priority : "",
    cost: typeof task.estimatedCost === "number" && Number.isFinite(task.estimatedCost) ? String(task.estimatedCost) : "",
    progress: Math.round(Math.max(0, Math.min(1, Number.isFinite(task.progress) ? (task.progress as number) : 0)) * 100)
  };

  const categoryOptions: Array<[string, string]> = Object.entries(categories).map(([key, c]) => [key, String(c?.label || key)]);
  const statusOptions: Array<[string, string]> = initial.status ? [...STATUS_OPTIONS] : [["", "(none)"], ...STATUS_OPTIONS];
  const durationText = (s: string, e: string) => {
    if (hasTimeComponent(s) || hasTimeComponent(e)) {
      const mins = taskDurationMinutes(s, e, Boolean(task.milestone));
      return formatDurationLabel(mins, "long");
    }
    // Same rule as the chart: flagged or same-day tasks are milestones (0 days).
    const days = taskDurationDays(s, e, Boolean(task.milestone) || diffDays(s, e) === 0);
    return `${days} day${days === 1 ? "" : "s"}`;
  };
  const previewTimeLabel = (timeVal: string): string => {
    if (!timeVal) return "All day (optional time)";
    const [hh, mm] = timeVal.split(":").map((n) => parseInt(n, 10));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "";
    return formatTimeOfDay(hh, mm, timeFormat, false);
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
          ${task.locked ? '<span class="jantt-hover-type-pill is-locked">Locked</span>' : ""}
          ${readOnly ? '<span class="jantt-hover-type-pill is-locked" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.4);">Read-Only</span>' : ""}
          ${task.urgent ? '<span class="jantt-hover-type-pill is-urgent">Urgent</span>' : ""}
          ${task.milestone ? '<span class="jantt-hover-type-pill is-milestone">Milestone</span>' : ""}
        </div>
        <h2 class="jantt-sidebar-title" id="${labelId("title")}">${escapeHtml(initial.label)}</h2>
      </div>
      <button type="button" class="jantt-sidebar-close-btn" title="Close Sidebar (Esc)" aria-label="Close task details" style="display: flex; align-items: center; justify-content: center;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>

    <!-- Body Content -->
    <div class="jantt-sidebar-body">
      ${
        readOnly
          ? '<div style="margin-bottom: 14px; padding: 10px 12px; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; font-size: 11.5px; color: #f59e0b; display: flex; align-items: center; gap: 8px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span>You are in Read-Only Viewer mode. Task attributes cannot be modified.</span></div>'
          : ""
      }
      <!-- Title & Label Field -->
      <div class="jantt-form-group">
        <label class="jantt-form-label" id="${labelId("label-l")}">Task Name / Label</label>
        <input type="text" id="jantt-sidebar-label" aria-labelledby="${labelId("label-l")}" class="jantt-input" value="${escapeHtml(initial.label)}" ${disabledIf(editLocked)} />
      </div>

      <!-- Category Selector -->
      <div class="jantt-form-group">
        <label class="jantt-form-label" id="${labelId("category-l")}">Category</label>
        <select id="jantt-sidebar-category" aria-labelledby="${labelId("category-l")}" class="jantt-select" ${disabledIf(editLocked)}>
          ${renderOptions(initial.category ? categoryOptions : [["", "(none)"], ...categoryOptions], initial.category)}
        </select>
      </div>

      <!-- Schedule Card (Start, End, Dynamic Duration) -->
      <div class="jantt-sidebar-card">
        <div class="jantt-form-grid-2">
          <div class="jantt-form-group">
            <label class="jantt-form-label" id="${labelId("start-l")}">Start Date &amp; Time</label>
            <div class="jantt-datetime-stack">
              <input type="date" id="jantt-sidebar-start" aria-labelledby="${labelId("start-l")}" class="jantt-input" value="${escapeHtml(startDateInit)}" ${disabledIf(editLocked)} />
              <div class="jantt-time-row">
                <input type="time" id="jantt-sidebar-start-time" aria-label="Start time" step="60" class="jantt-input jantt-time-input" value="${escapeHtml(startTimeInit)}" ${disabledIf(editLocked)} />
                ${!editLocked && timeFormat === "12h" ? `<button type="button" class="jantt-time-ampm-pill" id="jantt-sidebar-start-ampm" title="Toggle AM/PM">${startTimeInit && Number(startTimeInit.slice(0, 2)) >= 12 ? "PM" : "AM"}</button>` : ""}
                ${!editLocked ? `<button type="button" class="jantt-time-clear-btn" id="jantt-sidebar-start-clear" title="Clear time (all day)" style="display: ${startTimeInit ? "inline-flex" : "none"};">All day</button>` : ""}
              </div>
              <div class="jantt-time-preview" id="jantt-sidebar-start-preview">${escapeHtml(previewTimeLabel(startTimeInit))}</div>
            </div>
          </div>
          <div class="jantt-form-group">
            <label class="jantt-form-label" id="${labelId("end-l")}">End Date &amp; Time</label>
            <div class="jantt-datetime-stack">
              <input type="date" id="jantt-sidebar-end" aria-labelledby="${labelId("end-l")}" class="jantt-input" value="${escapeHtml(endDateInit)}" ${disabledIf(editLocked)} />
              <div class="jantt-time-row">
                <input type="time" id="jantt-sidebar-end-time" aria-label="End time" step="60" class="jantt-input jantt-time-input" value="${escapeHtml(endTimeInit)}" ${disabledIf(editLocked)} />
                ${!editLocked && timeFormat === "12h" ? `<button type="button" class="jantt-time-ampm-pill" id="jantt-sidebar-end-ampm" title="Toggle AM/PM">${endTimeInit && Number(endTimeInit.slice(0, 2)) >= 12 ? "PM" : "AM"}</button>` : ""}
                ${!editLocked ? `<button type="button" class="jantt-time-clear-btn" id="jantt-sidebar-end-clear" title="Clear time (all day)" style="display: ${endTimeInit ? "inline-flex" : "none"};">All day</button>` : ""}
              </div>
              <div class="jantt-time-preview" id="jantt-sidebar-end-preview">${escapeHtml(previewTimeLabel(endTimeInit))}</div>
            </div>
          </div>
        </div>
        <div class="jantt-sidebar-stat-footer">
          <span style="font-size: 11px; color: var(--jantt-text-muted);">Calculated Span:</span>
          <span id="jantt-sidebar-duration" style="font-family: var(--jantt-font-mono); font-weight: 700; color: var(--jantt-accent);">
            ${escapeHtml(durationText(task.start, task.end))}
          </span>
        </div>
      </div>

      <!-- Multi-Dependency Management Section -->
      <div class="jantt-form-group">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <label class="jantt-form-label" id="${labelId("deps-l")}" style="margin: 0;">Prerequisite Dependencies (<span id="jantt-sidebar-dep-count">${depItems.length}</span>)</label>
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
              <option value="">+ Add Prerequisite Dependency...</option>
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
          <label class="jantt-form-label" id="${labelId("assignee-l")}">Assignee / Owner</label>
          <input type="text" id="jantt-sidebar-assignee" aria-labelledby="${labelId("assignee-l")}" class="jantt-input" placeholder="e.g. Sarah Chen" value="${escapeHtml(task.assignee || "")}" ${disabledIf(editLocked)} />
        </div>

        <div class="jantt-form-group">
          <label class="jantt-form-label" id="${labelId("priority-l")}">Priority</label>
          <select id="jantt-sidebar-priority" aria-labelledby="${labelId("priority-l")}" class="jantt-select" ${disabledIf(editLocked)}>
            ${renderOptions(PRIORITY_OPTIONS, initial.priority)}
          </select>
        </div>
      </div>

      <!-- WBS & Estimated Cost -->
      <div class="jantt-form-grid-2">
        <div class="jantt-form-group">
          <label class="jantt-form-label" id="${labelId("wbs-l")}">WBS Code</label>
          <input type="text" id="jantt-sidebar-wbs" aria-labelledby="${labelId("wbs-l")}" class="jantt-input" placeholder="e.g. 1.2" value="${escapeHtml(task.wbs || "")}" ${disabledIf(editLocked)} />
        </div>

        <div class="jantt-form-group">
          <label class="jantt-form-label" id="${labelId("cost-l")}">Estimated Budget / Cost ($)</label>
          <input type="number" id="jantt-sidebar-cost" aria-labelledby="${labelId("cost-l")}" class="jantt-input" placeholder="0" value="${escapeHtml(initial.cost)}" ${disabledIf(editLocked)} />
        </div>
      </div>

      <!-- Status & Progress -->
      <div class="jantt-form-grid-2">
        <div class="jantt-form-group">
          <label class="jantt-form-label" id="${labelId("status-l")}">Status</label>
          <select id="jantt-sidebar-status" aria-labelledby="${labelId("status-l")}" class="jantt-select" ${disabledIf(readOnly)}>
            ${renderOptions(statusOptions, initial.status)}
          </select>
        </div>

        <div class="jantt-form-group">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <label class="jantt-form-label" id="${labelId("progress-l")}" style="margin: 0;">Progress</label>
            <span id="jantt-sidebar-prog-val" style="font-family: var(--jantt-font-mono); font-size: 11px; font-weight: 700; color: var(--jantt-accent);">${initial.progress}%</span>
          </div>
          <input type="range" id="jantt-sidebar-prog-input" aria-labelledby="${labelId("progress-l")}" min="0" max="100" value="${initial.progress}" class="jantt-slider" ${disabledIf(readOnly)} />
        </div>
      </div>

      <!-- Notes Field -->
      <div class="jantt-form-group">
        <label class="jantt-form-label" id="${labelId("notes-l")}">Notes & Description</label>
        <textarea id="jantt-sidebar-notes" aria-labelledby="${labelId("notes-l")}" class="jantt-textarea" rows="3" placeholder="Add task notes or updates..." ${disabledIf(readOnly)}>${escapeHtml(task.notes || "")}</textarea>
      </div>

      <!-- Custom Fields Bag -->
      <div class="jantt-form-group">
        <label class="jantt-form-label">Custom Attributes</label>
        <div id="jantt-sidebar-fields" class="jantt-sidebar-fields-container"></div>
      </div>

      ${
        showTaskNotesSection
          ? `<!-- Linked Task Notes Section -->
      <div class="jantt-sidebar-notes-card" id="jantt-sidebar-task-notes">
        <div class="jantt-sidebar-notes-head">
          <span class="jantt-form-label" style="margin: 0; display: inline-flex; align-items: center; gap: 6px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/></svg>
            Task Notes
          </span>
          <span class="jantt-sidebar-notes-count" id="jantt-sidebar-task-notes-count">${linkedNotes.length}</span>
        </div>
        ${taskNotePreviewHtml}
        <div class="jantt-sidebar-notes-actions">
          ${
            onAddNote
              ? `<button type="button" id="jantt-sidebar-add-note" class="jantt-sidebar-add-note-btn">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  <span>Add Note</span>
                </button>`
              : ""
          }
          ${
            onOpenTaskNotes && linkedNotes.length > 0
              ? `<button type="button" id="jantt-sidebar-manage-notes" class="jantt-btn jantt-btn-secondary" style="font-size: 11.5px; padding: 6px 10px;">
                  Manage Notes (${linkedNotes.length})
                </button>`
              : ""
          }
        </div>
      </div>`
          : ""
      }
    </div>

    <!-- Footer Actions -->
    <div class="jantt-sidebar-footer" style="flex-wrap: wrap;">
      <div id="jantt-sidebar-unsaved" role="alert" style="display: none; width: 100%; margin-bottom: 8px; font-size: 11.5px; color: #f59e0b; align-items: center; gap: 8px;"></div>
      ${
        onDelete && !editLocked
          ? '<button type="button" class="jantt-btn jantt-btn-danger" id="jantt-sidebar-delete">Delete Task</button>'
          : ""
      }
      <div style="display: flex; gap: 8px; margin-left: auto;">
        <button type="button" class="jantt-btn jantt-btn-secondary" id="jantt-sidebar-cancel">${readOnly ? "Close" : "Cancel"}</button>
        ${
          !readOnly
            ? '<button type="button" class="jantt-btn jantt-btn-primary" id="jantt-sidebar-save">Save Changes</button>'
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
  const startTimeInput = q<HTMLInputElement>("#jantt-sidebar-start-time");
  const startAmpmBtn = q<HTMLButtonElement>("#jantt-sidebar-start-ampm");
  const startClearBtn = q<HTMLButtonElement>("#jantt-sidebar-start-clear");
  const startPreviewEl = q<HTMLElement>("#jantt-sidebar-start-preview");
  const endInput = q<HTMLInputElement>("#jantt-sidebar-end");
  const endTimeInput = q<HTMLInputElement>("#jantt-sidebar-end-time");
  const endAmpmBtn = q<HTMLButtonElement>("#jantt-sidebar-end-ampm");
  const endClearBtn = q<HTMLButtonElement>("#jantt-sidebar-end-clear");
  const endPreviewEl = q<HTMLElement>("#jantt-sidebar-end-preview");
  const currentStartValue = () => combineDateTime(startInput?.value || "", startTimeInput?.value || "");
  const currentEndValue = () => combineDateTime(endInput?.value || "", endTimeInput?.value || "");
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
    if (depCount) depCount.textContent = String(depItems.length);

    if (chipsContainer) {
      if (depItems.length === 0) {
        chipsContainer.innerHTML =
          '<span style="font-size: 12px; color: var(--jantt-text-muted); font-style: italic;">None (Independent Task)</span>';
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
              ${kind ? `<span style="font-family: var(--jantt-font-mono); font-size: 10.5px; color: var(--jantt-accent);" title="Dependency type and lag">${escapeHtml(kind)}</span>` : ""}
              ${
                !editLocked
                  ? `<button type="button" data-remove-dep-index="${index}" aria-label="Remove dependency on ${escapeHtml(pLabel)}" style="background: none; border: none; color: var(--jantt-text-dim); cursor: pointer; padding: 0; display: inline-flex; align-items: center; justify-content: center;" title="Remove dependency"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`
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
        '<option value="">+ Add Prerequisite Dependency...</option>' +
        available
          .map((t) => {
            const tLabel = escapeHtml(t.label || t.name || t.id);
            return `<option value="${escapeHtml(t.id)}">${tLabel} (#${escapeHtml(t.id)}) [Ends: ${escapeHtml(t.end)}]</option>`;
          })
          .join("");
    }

    renderConflicts();
  };

  // Flags a start date/time earlier than the scheduler allows, using the scheduler's own rules.
  const renderConflicts = () => {
    if (!conflictBox || !startInput || !endInput) return;
    const curStart = currentStartValue();
    const curEnd = currentEndValue() || curStart;
    const allowed =
      curStart && depItems.length > 0
        ? constrainedStart(
            { ...task, start: curStart, end: curEnd, dependsOn: currentDependsOn() },
            (id) => taskById.get(id),
            resolveProbe,
            knownIds
          )
        : curStart;

    if (!curStart || toEpochMinutes(allowed) <= toEpochMinutes(curStart)) {
      conflictBox.style.display = "none";
      conflictBox.innerHTML = "";
      return;
    }

    const allowedHuman = formatHumanDate(allowed, true, timeFormat);
    const curStartHuman = formatHumanDate(curStart, true, timeFormat);
    conflictBox.style.display = "block";
    conflictBox.innerHTML = `
      <div style="background: rgba(244, 63, 94, 0.12); border-left: 3px solid #F43F5E; padding: 8px 12px; border-radius: 6px; font-size: 11.5px; margin-top: 4px;">
        <div style="color: #F43F5E; font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #F43F5E;"></span>
          Dependency Timing Conflict:
        </div>
        <div style="color: var(--jantt-text-muted);">
          Starts on <strong>${escapeHtml(curStartHuman)}</strong>, but its prerequisites allow <strong>${escapeHtml(allowedHuman)}</strong> at the earliest.
        </div>
        ${
          !editLocked
            ? `<button type="button" id="jantt-sidebar-align-btn" class="jantt-btn jantt-btn-secondary" style="padding: 3px 8px; font-size: 11px; margin-top: 6px;">Align Start to ${escapeHtml(allowedHuman)}</button>`
            : ""
        }
      </div>
    `;

    conflictBox.querySelector("#jantt-sidebar-align-btn")?.addEventListener("click", () => {
      const oldSpanMin = Math.max(toEpochMinutes(curEnd) - toEpochMinutes(curStart), 0);
      startInput.value = getDatePart(allowed);
      if (startTimeInput) startTimeInput.value = getTimePart(allowed);
      const nextEndIso = hasTimeComponent(allowed) || hasTimeComponent(curEnd)
        ? addMinutes(allowed, taskDurationMinutes(curStart, curEnd, Boolean(task.milestone)))
        : addDays(allowed, Math.max(diffDays(curStart, curEnd), 0));
      endInput.value = getDatePart(nextEndIso);
      if (endTimeInput) endTimeInput.value = getTimePart(nextEndIso);
      void oldSpanMin;
      syncTimeUi();
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

  const syncTimeUi = () => {
    const st = startTimeInput?.value || "";
    const et = endTimeInput?.value || "";
    if (startPreviewEl) startPreviewEl.textContent = previewTimeLabel(st);
    if (endPreviewEl) endPreviewEl.textContent = previewTimeLabel(et);
    if (startClearBtn) startClearBtn.style.display = st ? "inline-flex" : "none";
    if (endClearBtn) endClearBtn.style.display = et ? "inline-flex" : "none";
    if (startAmpmBtn) startAmpmBtn.textContent = st && Number(st.slice(0, 2)) >= 12 ? "PM" : "AM";
    if (endAmpmBtn) endAmpmBtn.textContent = et && Number(et.slice(0, 2)) >= 12 ? "PM" : "AM";
  };

  const updateDuration = () => {
    const sVal = currentStartValue();
    const eVal = currentEndValue();
    if (durLabel && sVal && eVal) {
      durLabel.textContent = durationText(sVal, eVal);
    }
    syncTimeUi();
    renderConflicts();
  };

  const clampEndAfterStart = () => {
    const sVal = currentStartValue();
    const eVal = currentEndValue();
    if (sVal && eVal && toEpochMinutes(sVal) > toEpochMinutes(eVal)) {
      if (endInput) endInput.value = startInput?.value || "";
      if (endTimeInput) endTimeInput.value = startTimeInput?.value || "";
    }
    updateDuration();
  };

  const clampStartBeforeEnd = () => {
    const sVal = currentStartValue();
    const eVal = currentEndValue();
    if (sVal && eVal && toEpochMinutes(sVal) > toEpochMinutes(eVal)) {
      if (startInput) startInput.value = endInput?.value || "";
      if (startTimeInput) startTimeInput.value = endTimeInput?.value || "";
    }
    updateDuration();
  };

  const flipAmPm = (input: HTMLInputElement | null, onAfter: () => void) => {
    if (!input) return;
    const raw = input.value || "09:00";
    const [hStr, mStr] = raw.split(":");
    const nextH = ((parseInt(hStr, 10) || 0) + 12) % 24;
    input.value = `${String(nextH).padStart(2, "0")}:${(mStr || "00").padStart(2, "0")}`;
    onAfter();
  };

  startInput?.addEventListener("change", clampEndAfterStart);
  startTimeInput?.addEventListener("change", clampEndAfterStart);
  startTimeInput?.addEventListener("input", syncTimeUi);
  startAmpmBtn?.addEventListener("click", () => flipAmPm(startTimeInput, clampEndAfterStart));
  startClearBtn?.addEventListener("click", () => {
    if (startTimeInput) startTimeInput.value = "";
    clampEndAfterStart();
  });

  endInput?.addEventListener("change", clampStartBeforeEnd);
  endTimeInput?.addEventListener("change", clampStartBeforeEnd);
  endTimeInput?.addEventListener("input", syncTimeUi);
  endAmpmBtn?.addEventListener("click", () => flipAmPm(endTimeInput, clampStartBeforeEnd));
  endClearBtn?.addEventListener("click", () => {
    if (endTimeInput) endTimeInput.value = "";
    clampStartBeforeEnd();
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
    let html = "";
    if (entries.length === 0) {
      html += '<div style="font-size: 12px; color: var(--jantt-text-dim); font-style: italic;">No custom attributes defined.</div>';
    } else {
      entries.forEach(([key, val]) => {
        html += `
          <div class="jantt-sidebar-field-row" style="display: flex; align-items: center; gap: 8px;">
            <span class="jantt-sidebar-field-key" style="font-family: var(--jantt-font-mono); font-size: 11.5px; font-weight: 600; color: var(--jantt-text-muted); min-width: 90px; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(key)}:</span>
            <input type="text" data-field-val-key="${escapeHtml(key)}" aria-label="${escapeHtml(key)}" value="${escapeHtml(val)}" class="jantt-input jantt-input-sm" style="flex-grow: 1;" ${disabledIf(editLocked)} />
            ${!editLocked ? `<button type="button" data-del-field-key="${escapeHtml(key)}" aria-label="Remove attribute ${escapeHtml(key)}" class="jantt-btn jantt-btn-secondary" style="padding: 2px 6px; font-size: 11px; height: 26px; display: inline-flex; align-items: center; justify-content: center;" title="Remove attribute"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` : ""}
          </div>
        `;
      });
    }

    if (!editLocked) {
      html += `
        <div style="display: flex; gap: 6px; align-items: center; margin-top: 6px; padding-top: 8px; border-top: 1px dashed var(--jantt-border-subtle);">
          <input type="text" id="jantt-new-field-key" aria-label="New attribute name" class="jantt-input jantt-input-sm" placeholder="Attribute name (e.g. depth)" style="width: 130px; font-size: 11.5px;" />
          <input type="text" id="jantt-new-field-val" aria-label="New attribute value" class="jantt-input jantt-input-sm" placeholder="Value (e.g. 45m)" style="flex-grow: 1; font-size: 11.5px;" />
          <button type="button" id="jantt-add-field-btn" class="jantt-btn jantt-btn-secondary" style="font-size: 11.5px; white-space: nowrap; height: 28px;">+ Add</button>
        </div>
      `;
    }

    fieldsContainer.innerHTML = html;

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
    const nextStart = currentStartValue();
    const nextEnd = currentEndValue();
    if (nextStart && nextStart !== initial.start) patch.start = nextStart;
    if (nextEnd && nextEnd !== initial.end) patch.end = nextEnd;
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

  const isDirty = () => !readOnly && Object.keys(collectChanges()).length > 0;
  const showUnsavedNotice = (discard: () => void, noticeText = "You have unsaved changes. Save your changes or discard them.") => {
    if (!unsavedNotice) {
      discard();
      return;
    }
    unsavedNotice.style.display = "flex";
    unsavedNotice.innerHTML =
      `<span>${escapeHtml(noticeText)}</span>` +
      '<button type="button" class="jantt-btn jantt-btn-secondary" id="jantt-sidebar-discard" style="padding: 3px 8px; font-size: 11px; margin-left: auto;">Discard</button>';
    const discardBtn = unsavedNotice.querySelector<HTMLButtonElement>("#jantt-sidebar-discard");
    discardBtn?.addEventListener("click", () => discard());
    discardBtn?.focus();
  };

  const navigateToNotes = (action: () => void) => {
    const proceed = () => {
      onClose();
      action();
    };
    if (!isDirty()) {
      proceed();
      return;
    }
    showUnsavedNotice(proceed, "Save or discard task edits before switching to Notes.");
  };

  q("#jantt-sidebar-add-note")?.addEventListener("click", () => {
    if (onAddNote) navigateToNotes(() => onAddNote());
  });
  q("#jantt-sidebar-manage-notes")?.addEventListener("click", () => {
    if (onOpenTaskNotes) navigateToNotes(() => onOpenTaskNotes());
  });
  container.querySelectorAll<HTMLButtonElement>(".jantt-sidebar-note-row").forEach((btn) => {
    btn.addEventListener("click", () => {
      const noteId = btn.dataset.taskNoteId;
      if (onOpenTaskNotes) navigateToNotes(() => onOpenTaskNotes(noteId));
    });
  });

  // Delete Task Handler
  q("#jantt-sidebar-delete")?.addEventListener("click", () => {
    if (confirm(`Are you sure you want to delete task "${task.label || task.id}"?`)) {
      onDelete?.();
    }
  });

  // Save Task Handler: the task as it was opened plus exactly the user's changes.
  q("#jantt-sidebar-save")?.addEventListener("click", () => {
    onSave({ ...original, ...collectChanges() });
  });

  return {
    isDirty,
    showUnsavedNotice
  };
}
