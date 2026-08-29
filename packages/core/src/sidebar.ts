import { Task, Category, CategoriesMap } from "./types";
import { diffDays, addDays } from "./date-math";
import { getTaskDependencies } from "./resolver";

export interface TaskSidebarOptions {
  task: Task;
  allTasks?: Task[];
  categories: CategoriesMap;
  container?: HTMLElement;
  theme?: Record<string, string>;
  themeClassName?: string;
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
  backdrop.className = isCustomContainer
    ? `jantt-sidebar-embedded-wrap ${themeClassName || ""}`
    : `jantt-sidebar-backdrop ${themeClassName || ""}`;
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-label", `Task details: ${task.label || task.name || task.id}`);

  const sidebarEl = document.createElement("aside");
  sidebarEl.className = `jantt-sidebar-drawer ${themeClassName || ""}`;
  backdrop.appendChild(sidebarEl);

  // Apply custom theme CSS variables if provided
  if (theme) {
    Object.entries(theme).forEach(([k, v]) => {
      const varName = k.startsWith("--") ? k : `--jantt-${k}`;
      backdrop.style.setProperty(varName, v);
      sidebarEl.style.setProperty(varName, v);
    });
  }

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
        currentTask = updated;
        onSave(updated);
        close();
      },
      () => {
        if (onDelete) {
          onDelete(currentTask.id);
          close();
        }
      },
      close
    );
  }

  const mountTarget = container || document.body;
  mountTarget.appendChild(backdrop);

  return {
    close,
    element: sidebarEl
  };
}

/**
 * Renders the full task inspector with multi-dependency management and conflict detection.
 */
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

  // Active dependencies state
  let currentDeps: string[] = getTaskDependencies(task);

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
          ${task.milestone ? '<span class="jantt-hover-type-pill is-milestone">Milestone</span>' : ""}
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

      <!-- Multi-Dependency Management Section -->
      <div class="jantt-form-group">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <label class="jantt-form-label" style="margin: 0;">Prerequisite Dependencies (${currentDeps.length})</label>
        </div>
        <div id="jantt-sidebar-deps-container" style="display: flex; flex-direction: column; gap: 8px;">
          <!-- Active Dependency Chips -->
          <div id="jantt-sidebar-dep-chips" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>

          <!-- Add Dependency Dropdown -->
          ${
            !readOnly && !task.locked
              ? `
          <div style="display: flex; gap: 6px; align-items: center;">
            <select id="jantt-sidebar-add-dep-select" class="jantt-select" style="font-size: 12px;">
              <option value="">+ Add Prerequisite Dependency...</option>
            </select>
          </div>
          `
              : ""
          }

          <!-- Timing Conflict Alert Area -->
          <div id="jantt-sidebar-dep-conflict-box" style="display: none;"></div>
        </div>
      </div>

      <!-- Assignee & Priority -->
      <div class="jantt-form-grid-2">
        <div class="jantt-form-group">
          <label class="jantt-form-label">Assignee / Owner</label>
          <input type="text" id="jantt-sidebar-assignee" class="jantt-input" placeholder="e.g. Sarah Chen" value="${escapeHtml(task.assignee || "")}" ${readOnly || task.locked ? "disabled" : ""} />
        </div>

        <div class="jantt-form-group">
          <label class="jantt-form-label">Priority</label>
          <select id="jantt-sidebar-priority" class="jantt-select" ${readOnly || task.locked ? "disabled" : ""}>
            <option value="low" ${task.priority === "low" ? "selected" : ""}>Low</option>
            <option value="medium" ${!task.priority || task.priority === "medium" ? "selected" : ""}>Medium</option>
            <option value="high" ${task.priority === "high" ? "selected" : ""}>High</option>
            <option value="urgent" ${task.priority === "urgent" || task.urgent ? "selected" : ""}>Urgent (Critical)</option>
          </select>
        </div>
      </div>

      <!-- WBS & Estimated Cost -->
      <div class="jantt-form-grid-2">
        <div class="jantt-form-group">
          <label class="jantt-form-label">WBS Code</label>
          <input type="text" id="jantt-sidebar-wbs" class="jantt-input" placeholder="e.g. 1.2" value="${escapeHtml(task.wbs || "")}" ${readOnly || task.locked ? "disabled" : ""} />
        </div>

        <div class="jantt-form-group">
          <label class="jantt-form-label">Estimated Budget / Cost ($)</label>
          <input type="number" id="jantt-sidebar-cost" class="jantt-input" placeholder="0" value="${task.estimatedCost ?? ""}" ${readOnly || task.locked ? "disabled" : ""} />
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
  const conflictBox = container.querySelector<HTMLElement>("#jantt-sidebar-dep-conflict-box");

  const checkConflictsAndRenderDeps = () => {
    const chipsContainer = container.querySelector<HTMLElement>("#jantt-sidebar-dep-chips");
    const addSelect = container.querySelector<HTMLSelectElement>("#jantt-sidebar-add-dep-select");

    if (chipsContainer) {
      if (currentDeps.length === 0) {
        chipsContainer.innerHTML =
          '<span style="font-size: 12px; color: var(--jantt-text-muted); font-style: italic;">None (Independent Task)</span>';
      } else {
        chipsContainer.innerHTML = currentDeps
          .map((depId) => {
            const prereq = allTasks.find((t) => t.id === depId);
            const pLabel = prereq ? prereq.label || prereq.name || prereq.id : depId;
            return `
            <span class="jantt-badge" style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; font-size: 11.5px; background: var(--jantt-surface-solid); border: 1px solid var(--jantt-border);">
              <span>${escapeHtml(pLabel)} (#${escapeHtml(depId)})</span>
              ${
                !readOnly && !task.locked
                  ? `<button type="button" data-remove-dep="${escapeHtml(depId)}" style="background: none; border: none; color: var(--jantt-text-dim); cursor: pointer; font-size: 12px; padding: 0;" title="Remove dependency">✕</button>`
                  : ""
              }
            </span>
          `;
          })
          .join("");

        // Attach remove buttons
        chipsContainer.querySelectorAll<HTMLButtonElement>("[data-remove-dep]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const targetDep = btn.dataset.removeDep!;
            currentDeps = currentDeps.filter((d) => d !== targetDep);
            checkConflictsAndRenderDeps();
          });
        });
      }
    }

    // Refresh add dropdown options
    if (addSelect) {
      const available = allTasks.filter((t) => t.id !== task.id && !currentDeps.includes(t.id));
      addSelect.innerHTML =
        '<option value="">+ Add Prerequisite Dependency...</option>' +
        available
          .map((t) => {
            const tLabel = escapeHtml(t.label || t.name || t.id);
            return `<option value="${escapeHtml(t.id)}">${tLabel} (#${escapeHtml(t.id)}) [Ends: ${t.end}]</option>`;
          })
          .join("");
    }

    // Check for start-date timing conflicts with any prerequisite
    if (conflictBox && startInput) {
      const curStart = startInput.value;
      const conflicts: { depId: string; prereqEnd: string; prereqLabel: string }[] = [];

      currentDeps.forEach((depId) => {
        const prereq = allTasks.find((t) => t.id === depId);
        if (prereq && prereq.end && curStart) {
          if (diffDays(prereq.end, curStart) > 0) {
            conflicts.push({
              depId,
              prereqEnd: prereq.end,
              prereqLabel: prereq.label || prereq.name || prereq.id
            });
          }
        }
      });

      if (conflicts.length > 0) {
        conflictBox.style.display = "block";
        const latestEnd = conflicts.reduce((max, c) => (diffDays(max, c.prereqEnd) > 0 ? c.prereqEnd : max), conflicts[0].prereqEnd);
        conflictBox.innerHTML = `
          <div style="background: rgba(244, 63, 94, 0.12); border-left: 3px solid #F43F5E; padding: 8px 12px; border-radius: 6px; font-size: 11.5px; margin-top: 4px;">
            <div style="color: #F43F5E; font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
              <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #F43F5E;"></span>
              Dependency Timing Conflict:
            </div>
            <div style="color: var(--jantt-text-muted);">
              Starts on <strong>${curStart}</strong> before prerequisite finish (${latestEnd}).
            </div>
            ${
              !readOnly && !task.locked
                ? `<button type="button" id="jantt-sidebar-align-btn" class="jantt-btn jantt-btn-secondary" style="padding: 3px 8px; font-size: 11px; margin-top: 6px;">Align Start Date to ${latestEnd}</button>`
                : ""
            }
          </div>
        `;

        conflictBox.querySelector("#jantt-sidebar-align-btn")?.addEventListener("click", () => {
          if (startInput && endInput) {
            const oldSpan = Math.max(diffDays(startInput.value, endInput.value), 0);
            startInput.value = latestEnd;
            endInput.value = addDays(latestEnd, oldSpan);
            updateDuration();
            checkConflictsAndRenderDeps();
          }
        });
      } else {
        conflictBox.style.display = "none";
        conflictBox.innerHTML = "";
      }
    }
  };

  // Add dependency dropdown change
  const addSelect = container.querySelector<HTMLSelectElement>("#jantt-sidebar-add-dep-select");
  addSelect?.addEventListener("change", (e) => {
    const val = (e.target as HTMLSelectElement).value;
    if (val && !currentDeps.includes(val)) {
      currentDeps.push(val);
      checkConflictsAndRenderDeps();
    }
  });

  const updateDuration = () => {
    if (!startInput || !endInput || !durLabel) return;
    const s = startInput.value;
    const e = endInput.value;
    if (s && e) {
      const days = Math.max(diffDays(s, e), 0);
      durLabel.textContent = `${days} day${days === 1 ? "" : "s"}`;
    }
    checkConflictsAndRenderDeps();
  };

  startInput?.addEventListener("change", updateDuration);
  endInput?.addEventListener("change", updateDuration);

  // Initialize dependencies UI
  checkConflictsAndRenderDeps();

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
    const assignee = (container.querySelector("#jantt-sidebar-assignee") as HTMLInputElement)?.value || undefined;
    const priority = (container.querySelector("#jantt-sidebar-priority") as HTMLSelectElement)?.value || undefined;
    const wbs = (container.querySelector("#jantt-sidebar-wbs") as HTMLInputElement)?.value || undefined;
    const costVal = (container.querySelector("#jantt-sidebar-cost") as HTMLInputElement)?.value;
    const estimatedCost = costVal && costVal.trim() !== "" ? parseFloat(costVal) : undefined;
    const notes = (container.querySelector("#jantt-sidebar-notes") as HTMLTextAreaElement)?.value || "";
    const progress = progInput ? parseInt(progInput.value, 10) / 100 : task.progress;

    // Collect custom fields
    const updatedFields: Record<string, unknown> = { ...(task.fields || {}) };
    container.querySelectorAll<HTMLInputElement>("[data-field-key]").forEach((input) => {
      const k = input.dataset.fieldKey!;
      updatedFields[k] = input.value;
    });

    const finalDependsOn: string | string[] | null =
      currentDeps.length === 0 ? null : currentDeps.length === 1 ? currentDeps[0] : currentDeps;

    const updatedTask: Task = {
      ...task,
      label,
      name: label,
      category,
      start,
      end,
      status,
      assignee,
      priority,
      wbs,
      estimatedCost,
      dependsOn: finalDependsOn,
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
