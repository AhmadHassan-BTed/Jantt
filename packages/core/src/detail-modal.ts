import { Task, Category, CategoriesMap } from "./types";
import { diffDays } from "./date-math";

export interface DetailModalOptions {
  task: Task;
  categories: CategoriesMap;
  onSave: (updatedTask: Task) => void;
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

/**
 * Creates and mounts an accessible, interactive detail modal dialog.
 */
export function createDetailModal(options: DetailModalOptions): { close: () => void } {
  const { task, categories, onSave, onClose, customRenderer } = options;

  const backdrop = document.createElement("div");
  backdrop.className = "jantt-modal-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-label", `Task details: ${task.label || task.name || task.id}`);

  const card = document.createElement("div");
  card.className = "jantt-modal-card";
  backdrop.appendChild(card);

  let currentTask: Task = {
    ...task,
    fields: task.fields ? { ...task.fields } : {}
  };

  const close = () => {
    document.removeEventListener("keydown", onKeyDown);
    if (backdrop.parentNode) {
      backdrop.parentNode.removeChild(backdrop);
    }
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };

  document.addEventListener("keydown", onKeyDown);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  if (customRenderer) {
    customRenderer(currentTask, card, {
      updateTask: (patch) => {
        currentTask = { ...currentTask, ...patch };
        onSave(currentTask);
      },
      close
    });
  } else {
    renderDefaultModalContent(card, currentTask, categories, (updated) => {
      onSave(updated);
      close();
    }, close);
  }

  document.body.appendChild(backdrop);

  // Focus primary button or first input for a11y
  setTimeout(() => {
    const focusable = card.querySelector<HTMLElement>("button, input, select, textarea");
    focusable?.focus();
  }, 50);

  return { close };
}

function renderDefaultModalContent(
  container: HTMLElement,
  task: Task,
  categories: CategoriesMap,
  onSave: (task: Task) => void,
  onClose: () => void
) {
  const cat: Category = categories[task.category] || {
    label: task.category,
    color: "#3B82F6"
  };

  const duration = diffDays(task.start, task.end);

  container.innerHTML = `
    <div class="jantt-modal-header">
      <div>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${cat.color};"></span>
          <span style="font-size: 12px; font-weight: 600; color: ${cat.color}; text-transform: uppercase; letter-spacing: 0.05em;">
            ${escapeHtml(cat.label)}
          </span>
          ${task.locked ? '<span style="font-size: 11px; color: var(--jantt-text-dim); background: var(--jantt-border); padding: 2px 6px; border-radius: 4px;">🔒 Locked</span>' : ""}
          ${task.urgent ? '<span style="font-size: 11px; color: #EF4444; background: rgba(239, 68, 68, 0.15); padding: 2px 6px; border-radius: 4px; font-weight: 600;">⚡ Urgent</span>' : ""}
        </div>
        <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: var(--jantt-text);">
          ${escapeHtml(task.label || task.name || task.id)}
        </h2>
        <div style="font-size: 12px; color: var(--jantt-text-muted); margin-top: 2px; font-family: var(--jantt-font-mono);">
          ID: ${escapeHtml(task.id)}
        </div>
      </div>
      <button class="jantt-modal-close-btn" style="background: transparent; border: none; font-size: 20px; color: var(--jantt-text-muted); cursor: pointer; padding: 4px 8px; border-radius: 6px;">✕</button>
    </div>

    <div class="jantt-modal-body">
      <!-- Dates & Duration Block -->
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; background: var(--jantt-bg); padding: 12px; border-radius: 8px; border: 1px solid var(--jantt-border-subtle);">
        <div>
          <label style="font-size: 11px; color: var(--jantt-text-dim); text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 2px;">Start Date</label>
          <input type="date" id="jantt-edit-start" value="${task.start}" ${task.locked ? "disabled" : ""} style="width: 100%; background: var(--jantt-surface); border: 1px solid var(--jantt-border); border-radius: 6px; color: var(--jantt-text); padding: 4px 8px; font-size: 12px;" />
        </div>
        <div>
          <label style="font-size: 11px; color: var(--jantt-text-dim); text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 2px;">End Date</label>
          <input type="date" id="jantt-edit-end" value="${task.end}" ${task.locked ? "disabled" : ""} style="width: 100%; background: var(--jantt-surface); border: 1px solid var(--jantt-border); border-radius: 6px; color: var(--jantt-text); padding: 4px 8px; font-size: 12px;" />
        </div>
        <div>
          <label style="font-size: 11px; color: var(--jantt-text-dim); text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 2px;">Duration</label>
          <div style="font-size: 13px; font-weight: 600; color: var(--jantt-accent); padding: 4px 0;">${duration} day${duration === 1 ? "" : "s"}</div>
        </div>
      </div>

      <!-- Status & Progress -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div>
          <label style="font-size: 12px; font-weight: 600; color: var(--jantt-text-muted); display: block; margin-bottom: 4px;">Status</label>
          <select id="jantt-edit-status" style="width: 100%; background: var(--jantt-bg); border: 1px solid var(--jantt-border); border-radius: 6px; color: var(--jantt-text); padding: 6px 10px; font-size: 13px;">
            <option value="not-started" ${task.status === "not-started" ? "selected" : ""}>Not Started</option>
            <option value="in-progress" ${task.status === "in-progress" ? "selected" : ""}>In Progress</option>
            <option value="submitted" ${task.status === "submitted" ? "selected" : ""}>Submitted</option>
            <option value="completed" ${task.status === "completed" ? "selected" : ""}>Completed</option>
            <option value="blocked" ${task.status === "blocked" ? "selected" : ""}>Blocked</option>
          </select>
        </div>
        <div>
          <label style="font-size: 12px; font-weight: 600; color: var(--jantt-text-muted); display: block; margin-bottom: 4px;">
            Progress (<span id="jantt-progress-val">${Math.round((task.progress || 0) * 100)}%</span>)
          </label>
          <input type="range" id="jantt-edit-progress" min="0" max="100" value="${Math.round((task.progress || 0) * 100)}" style="width: 100%; accent-color: var(--jantt-accent); margin-top: 6px;" />
        </div>
      </div>

      <!-- Notes Field -->
      <div>
        <label style="font-size: 12px; font-weight: 600; color: var(--jantt-text-muted); display: block; margin-bottom: 4px;">Notes</label>
        <textarea id="jantt-edit-notes" rows="3" placeholder="Add notes or status updates..." style="width: 100%; box-sizing: border-box; background: var(--jantt-bg); border: 1px solid var(--jantt-border); border-radius: 8px; color: var(--jantt-text); padding: 8px 12px; font-size: 13px; resize: vertical;">${escapeHtml(task.notes || "")}</textarea>
      </div>

      <!-- Domain Specific Fields Bag -->
      <div id="jantt-fields-bag-section">
        <label style="font-size: 12px; font-weight: 600; color: var(--jantt-text-muted); display: block; margin-bottom: 6px;">Custom Attributes</label>
        <div id="jantt-fields-bag" style="background: var(--jantt-bg); border: 1px solid var(--jantt-border-subtle); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
          ${renderFieldsBagHtml(task.fields)}
        </div>
      </div>
    </div>

    <div class="jantt-modal-footer">
      <button class="jantt-btn jantt-btn-secondary" id="jantt-modal-cancel">Cancel</button>
      <button class="jantt-btn jantt-btn-primary" id="jantt-modal-save">Save Changes</button>
    </div>
  `;

  // Event bindings
  container.querySelector(".jantt-modal-close-btn")?.addEventListener("click", onClose);
  container.querySelector("#jantt-modal-cancel")?.addEventListener("click", onClose);

  const progressInput = container.querySelector<HTMLInputElement>("#jantt-edit-progress");
  const progressVal = container.querySelector<HTMLElement>("#jantt-progress-val");
  progressInput?.addEventListener("input", () => {
    if (progressVal) progressVal.textContent = `${progressInput.value}%`;
  });

  const saveBtn = container.querySelector("#jantt-modal-save");
  saveBtn?.addEventListener("click", () => {
    const start = (container.querySelector("#jantt-edit-start") as HTMLInputElement)?.value || task.start;
    const end = (container.querySelector("#jantt-edit-end") as HTMLInputElement)?.value || task.end;
    const status = (container.querySelector("#jantt-edit-status") as HTMLSelectElement)?.value || task.status;
    const progressNum = progressInput ? parseInt(progressInput.value, 10) / 100 : task.progress;
    const notes = (container.querySelector("#jantt-edit-notes") as HTMLTextAreaElement)?.value || "";

    // Collect custom fields
    const updatedFields: Record<string, unknown> = { ...(task.fields || {}) };
    container.querySelectorAll<HTMLInputElement>("[data-field-key]").forEach((input) => {
      const k = input.dataset.fieldKey!;
      updatedFields[k] = input.value;
    });

    const updatedTask: Task = {
      ...task,
      start,
      end,
      status,
      progress: progressNum,
      notes,
      fields: updatedFields
    };

    onSave(updatedTask);
  });
}

function renderFieldsBagHtml(fields?: Record<string, unknown>): string {
  if (!fields || Object.keys(fields).length === 0) {
    return '<div style="font-size: 12px; color: var(--jantt-text-dim); font-style: italic;">No custom fields defined for this task.</div>';
  }

  return Object.entries(fields)
    .map(([key, val]) => {
      const valStr = typeof val === "object" ? JSON.stringify(val) : String(val ?? "");
      const isUrl = typeof val === "string" && (val.startsWith("http://") || val.startsWith("https://"));
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px;">
          <span style="font-family: var(--jantt-font-mono); color: var(--jantt-text-muted); font-weight: 500; min-width: 90px;">${escapeHtml(key)}:</span>
          <div style="flex-grow: 1; display: flex; align-items: center; gap: 6px;">
            <input type="text" data-field-key="${escapeHtml(key)}" value="${escapeHtml(valStr)}" style="flex-grow: 1; background: var(--jantt-surface); border: 1px solid var(--jantt-border); border-radius: 4px; color: var(--jantt-text); padding: 3px 8px; font-size: 12px;" />
            ${isUrl ? `<a href="${escapeHtml(val as string)}" target="_blank" rel="noopener noreferrer" style="color: var(--jantt-accent); text-decoration: none; font-size: 13px;">🔗</a>` : ""}
          </div>
        </div>
      `;
    })
    .join("");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
