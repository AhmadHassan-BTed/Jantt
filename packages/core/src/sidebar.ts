import { Task, Category, CategoriesMap } from "./types";
import { diffDays } from "./date-math";

export interface TaskSidebarOptions {
  task: Task;
  allTasks?: Task[];
  categories: CategoriesMap;
  container?: HTMLElement;
  readOnly?: boolean;
  onSave: (updatedTask: Task) => void;
  onDelete?: (taskId: string) => void;
  onClose: () => void;
  customRenderer?: (
    task: Task,
    container: HTMLElement,
    api: {
      updateTask: (patch: Partial<Task>) => void;
      close: () => void;
    }
  ) => void;
}

export interface TaskSidebarInstance {
  close: () => void;
  element: HTMLElement;
}

/**
 * Creates and mounts a slide-out Task Details Sidebar / Drawer.
 * Can be mounted as an overlay inside the chart container or into any external DOM element.
 */
export function createTaskSidebar(options: TaskSidebarOptions): TaskSidebarInstance {
  const {
    task,
    allTasks = [],
    categories,
    container,
    readOnly = false,
    onSave,
    onDelete,
    onClose,
    customRenderer
  } = options;

  let currentTask: Task = {
    ...task,
    fields: task.fields ? { ...task.fields } : {}
  };

  const isCustomContainer = Boolean(container);

  // Wrapper element
  const backdrop = document.createElement("div");
  backdrop.className = isCustomContainer ? "jantt-sidebar-embedded-wrap" : "jantt-sidebar-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-label", `Task details: ${task.label || task.name || task.id}`);

  const sidebarEl = document.createElement("aside");
  sidebarEl.className = "jantt-sidebar-drawer";
  backdrop.appendChild(sidebarEl);

  const close = () => {
    document.removeEventListener("keydown", onKeyDown);
    sidebarEl.classList.add("is-closing");
    setTimeout(() => {
      if (backdrop.parentNode) {
        backdrop.parentNode.removeChild(backdrop);
      }
      onClose();
    }, 180);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };

  document.addEventListener("keydown", onKeyDown);

  if (!isCustomContainer) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
  }

  if (customRenderer) {
    customRenderer(currentTask, sidebarEl, {
      updateTask: (patch) => {
        currentTask = { ...currentTask, ...patch };
        onSave(currentTask);
      },
      close
    });
  } else {
    renderDefaultSidebarContent(
      sidebarEl,
      currentTask,
      allTasks,
      categories,
      readOnly,
      (updated) => {
        onSave(updated);
        close();
      },
      onDelete
        ? () => {
            onDelete(task.id);
            close();
          }
        : undefined,
      close
    );
  }

  const mountTarget = container || document.body;
  mountTarget.appendChild(backdrop);

  // Focus for accessibility
  setTimeout(() => {
    const focusable = sidebarEl.querySelector<HTMLElement>("button, input, select, textarea");
    focusable?.focus();
  }, 40);

  return { close, element: backdrop };
}

function renderDefaultSidebarContent(
  container: HTMLElement,
  task: Task,
  allTasks: Task[],
  categories: CategoriesMap,
  readOnly: boolean,
  onSave: (task: Task) => void,
  onDelete?: () => void,
  onClose?: () => void
) {
  const cat: Category = categories[task.category] || {
    label: task.category || "General",
    color: "#38BDF8"
  };

  const initialDuration = Math.max(diffDays(task.start, task.end), task.milestone ? 0 : 1);
  const initialProgress = Math.round((task.progress || 0) * 100);

  // Generate prerequisite options excluding current task to prevent self-cycles
  const depOptions = allTasks
    .filter((t) => t.id !== task.id)
    .map((t) => {
      const isSel = t.id === task.dependsOn;
      const tLabel = escapeHtml(t.label || t.name || t.id);
      return `<option value="${escapeHtml(t.id)}" ${isSel ? "selected" : ""}>${tLabel} (#${escapeHtml(t.id)})</option>`;
    })
    .join("");

  container.innerHTML = `
    <!-- Header -->
    <div class="jantt-sidebar-header">
      <div class="jantt-sidebar-header-info">
        <div class="jantt-sidebar-tags">
          <span class="jantt-hover-category-pill" style="background: ${cat.color}20; color: ${cat.color}; border: 1px solid ${cat.color}50;">
            <span class="jantt-hover-dot" style="background: ${cat.color};"></span>
            ${escapeHtml(cat.label)}
          </span>
          <span class="jantt-hover-id-badge">#${escapeHtml(task.id)}</span>
          ${task.locked ? '<span class="jantt-hover-type-pill is-locked">Locked</span>' : ""}
          ${task.urgent ? '<span class="jantt-hover-type-pill is-urgent">Urgent</span>' : ""}
        </div>
        <h2 class="jantt-sidebar-title">${escapeHtml(task.label || task.name || task.id)}</h2>
      </div>
      <button class="jantt-sidebar-close-btn" title="Close Sidebar (Esc)">✕</button>
    </div>

    <!-- Body Content -->
    <div class="jantt-sidebar-body">
      <!-- Title & Label Field -->
      <div class="jantt-form-group">
        <label class="jantt-form-label">Task Name / Label</label>
        <input type="text" id="jantt-sidebar-label" class="jantt-input" value="${escapeHtml(task.label || task.name || task.id)}" ${readOnly || task.locked ? "disabled" : ""} />
      </div>

      <!-- Category Selector -->
      <div class="jantt-form-group">
        <label class="jantt-form-label">Category</label>
        <select id="jantt-sidebar-category" class="jantt-select" ${readOnly || task.locked ? "disabled" : ""}>
          ${Object.entries(categories)
            .map(
              ([key, c]) => `
            <option value="${escapeHtml(key)}" ${key === task.category ? "selected" : ""}>
              ${escapeHtml(c.label || key)}
            </option>
          `
            )
            .join("")}
        </select>
      </div>

      <!-- Schedule Card (Start, End, Dynamic Duration) -->
      <div class="jantt-sidebar-card">
        <div class="jantt-form-grid-2">
          <div class="jantt-form-group">
            <label class="jantt-form-label">Start Date</label>
            <input type="date" id="jantt-sidebar-start" class="jantt-input" value="${task.start}" ${readOnly || task.locked ? "disabled" : ""} />
          </div>
          <div class="jantt-form-group">
            <label class="jantt-form-label">End Date</label>
            <input type="date" id="jantt-sidebar-end" class="jantt-input" value="${task.end}" ${readOnly || task.locked ? "disabled" : ""} />
          </div>
        </div>
        <div class="jantt-sidebar-stat-footer">
          <span style="font-size: 11px; color: var(--jantt-text-muted);">Calculated Span:</span>
          <span id="jantt-sidebar-duration" style="font-family: var(--jantt-font-mono); font-weight: 700; color: var(--jantt-accent);">
            ${initialDuration} day${initialDuration === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <!-- Status & Progress -->
      <div class="jantt-form-grid-2">
        <div class="jantt-form-group">
          <label class="jantt-form-label">Status</label>
          <select id="jantt-sidebar-status" class="jantt-select" ${readOnly ? "disabled" : ""}>
            <option value="not-started" ${task.status === "not-started" ? "selected" : ""}>Not Started</option>
            <option value="in-progress" ${task.status === "in-progress" ? "selected" : ""}>In Progress</option>
            <option value="submitted" ${task.status === "submitted" ? "selected" : ""}>Submitted</option>
            <option value="completed" ${task.status === "completed" ? "selected" : ""}>Completed</option>
            <option value="blocked" ${task.status === "blocked" ? "selected" : ""}>Blocked</option>
          </select>
        </div>

        <div class="jantt-form-group">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <label class="jantt-form-label" style="margin: 0;">Progress</label>
            <span id="jantt-sidebar-prog-val" style="font-family: var(--jantt-font-mono); font-size: 11px; font-weight: 700; color: var(--jantt-accent);">${initialProgress}%</span>
          </div>
          <input type="range" id="jantt-sidebar-prog-input" min="0" max="100" value="${initialProgress}" class="jantt-slider" ${readOnly ? "disabled" : ""} />
        </div>
      </div>

      <!-- Dependency Prerequisite Selector -->
      <div class="jantt-form-group">
        <label class="jantt-form-label">Depends On (Prerequisite)</label>
        <select id="jantt-sidebar-dep" class="jantt-select" ${readOnly || task.locked ? "disabled" : ""}>
          <option value="">-- None (Independent Task) --</option>
          ${depOptions}
        </select>
      </div>

      <!-- Notes Field -->
      <div class="jantt-form-group">
        <label class="jantt-form-label">Notes & Description</label>
        <textarea id="jantt-sidebar-notes" class="jantt-textarea" rows="3" placeholder="Add task notes or updates..." ${readOnly ? "disabled" : ""}>${escapeHtml(task.notes || "")}</textarea>
      </div>

      <!-- Custom Fields Bag -->
      <div class="jantt-form-group">
        <label class="jantt-form-label">Custom Attributes</label>
        <div id="jantt-sidebar-fields" class="jantt-sidebar-fields-container">
          ${renderCustomFieldsHtml(task.fields, readOnly)}
        </div>
      </div>
    </div>

    <!-- Footer Actions -->
    <div class="jantt-sidebar-footer">
      ${
        onDelete && !readOnly
          ? '<button class="jantt-btn jantt-btn-danger" id="jantt-sidebar-delete">Delete Task</button>'
          : ""
      }
      <div style="display: flex; gap: 8px; margin-left: auto;">
        <button class="jantt-btn jantt-btn-secondary" id="jantt-sidebar-cancel">Cancel</button>
        ${
          !readOnly
            ? '<button class="jantt-btn jantt-btn-primary" id="jantt-sidebar-save">Save Changes</button>'
            : ""
        }
      </div>
    </div>
  `;

  // Bind close and cancel handlers
  container.querySelector(".jantt-sidebar-close-btn")?.addEventListener("click", () => onClose?.());
  container.querySelector("#jantt-sidebar-cancel")?.addEventListener("click", () => onClose?.());

  // Dynamic duration calculation when dates change
  const startInput = container.querySelector<HTMLInputElement>("#jantt-sidebar-start");
  const endInput = container.querySelector<HTMLInputElement>("#jantt-sidebar-end");
  const durLabel = container.querySelector<HTMLElement>("#jantt-sidebar-duration");

  const updateDuration = () => {
    if (!startInput || !endInput || !durLabel) return;
    const s = startInput.value;
    const e = endInput.value;
    if (s && e) {
      const days = Math.max(diffDays(s, e), 0);
      durLabel.textContent = `${days} day${days === 1 ? "" : "s"}`;
    }
  };

  startInput?.addEventListener("change", updateDuration);
  endInput?.addEventListener("change", updateDuration);

  // Progress slider feedback
  const progInput = container.querySelector<HTMLInputElement>("#jantt-sidebar-prog-input");
  const progVal = container.querySelector<HTMLElement>("#jantt-sidebar-prog-val");
  progInput?.addEventListener("input", () => {
    if (progVal) progVal.textContent = `${progInput.value}%`;
  });

  // Delete Task Handler
  const deleteBtn = container.querySelector("#jantt-sidebar-delete");
  deleteBtn?.addEventListener("click", () => {
    if (confirm(`Are you sure you want to delete task "${task.label || task.id}"?`)) {
      onDelete?.();
    }
  });

  // Save Task Handler
  const saveBtn = container.querySelector("#jantt-sidebar-save");
  saveBtn?.addEventListener("click", () => {
    const label = (container.querySelector("#jantt-sidebar-label") as HTMLInputElement)?.value || task.label;
    const category = (container.querySelector("#jantt-sidebar-category") as HTMLSelectElement)?.value || task.category;
    const start = startInput?.value || task.start;
    const end = endInput?.value || task.end;
    const status = (container.querySelector("#jantt-sidebar-status") as HTMLSelectElement)?.value || task.status;
    const depVal = (container.querySelector("#jantt-sidebar-dep") as HTMLSelectElement)?.value || null;
    const notes = (container.querySelector("#jantt-sidebar-notes") as HTMLTextAreaElement)?.value || "";
    const progress = progInput ? parseInt(progInput.value, 10) / 100 : task.progress;

    // Collect custom fields
    const updatedFields: Record<string, unknown> = { ...(task.fields || {}) };
    container.querySelectorAll<HTMLInputElement>("[data-field-key]").forEach((input) => {
      const k = input.dataset.fieldKey!;
      updatedFields[k] = input.value;
    });

    const updatedTask: Task = {
      ...task,
      label,
      name: label,
      category,
      start,
      end,
      status,
      dependsOn: depVal || null,
      progress,
      notes,
      fields: updatedFields
    };

    onSave(updatedTask);
  });
}

function renderCustomFieldsHtml(fields?: Record<string, unknown>, readOnly = false): string {
  if (!fields || Object.keys(fields).length === 0) {
    return '<div style="font-size: 12px; color: var(--jantt-text-dim); font-style: italic;">No custom attributes defined.</div>';
  }

  return Object.entries(fields)
    .map(([key, val]) => {
      const valStr = typeof val === "object" ? JSON.stringify(val) : String(val ?? "");
      return `
        <div class="jantt-sidebar-field-row">
          <span class="jantt-sidebar-field-key">${escapeHtml(key)}:</span>
          <input type="text" data-field-key="${escapeHtml(key)}" value="${escapeHtml(valStr)}" class="jantt-input jantt-input-sm" ${readOnly ? "disabled" : ""} />
        </div>
      `;
    })
    .join("");
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
