import { Task, Category, CategoriesMap } from "./types";
import { diffDays } from "./date-math";

export interface DetailModalOptions {
  task: Task;
  categories: CategoriesMap;
  theme?: Record<string, string>;
  themeClassName?: string;
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
  const { task, categories, theme, themeClassName, onSave, onClose, customRenderer } = options;

  const backdrop = document.createElement("div");
  backdrop.className = `jantt-modal-backdrop ${themeClassName || ""}`.trim();
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-label", `Task details: ${task.label || task.name || task.id}`);

  const card = document.createElement("div");
  card.className = `jantt-modal-card ${themeClassName || ""}`.trim();
  backdrop.appendChild(card);

  // Apply custom theme CSS variables if supplied
  if (theme) {
    Object.entries(theme).forEach(([k, v]) => {
      const varName = k.startsWith("--") ? k : `--jantt-${k}`;
      backdrop.style.setProperty(varName, v);
      card.style.setProperty(varName, v);
    });
  }

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
          ${task.locked ? '<span style="font-size: 11px; color: var(--jantt-text-dim); background: var(--jantt-border); padding: 2px 6px; border-radius: 4px;">Locked</span>' : ""}
          ${task.urgent ? '<span style="font-size: 11px; color: #EF4444; background: rgba(239, 68, 68, 0.15); padding: 2px 6px; border-radius: 4px; font-weight: 600;">Urgent</span>' : ""}
        </div>
        <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: var(--jantt-text);">
          ${escapeHtml(task.label || task.name || task.id)}
        </h2>
        <div style="font-size: 12px; color: var(--jantt-text-muted); margin-top: 2px; font-family: var(--jantt-font-mono);">
          ID: ${escapeHtml(task.id)}
        </div>
      <button class="jantt-modal-close-btn" style="background: transparent; border: none; color: var(--jantt-text-muted); cursor: pointer; padding: 4px 8px; border-radius: 6px; display: flex; align-items: center; justify-content: center;" title="Close Modal (Esc)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
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
        <div id="jantt-fields-bag" style="background: var(--jantt-bg); border: 1px solid var(--jantt-border-subtle); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px;"></div>
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

  // Active custom attributes state & dynamic GUI adder
  let currentFields: Record<string, string> = {};
  if (task.fields) {
    Object.entries(task.fields).forEach(([k, v]) => {
      currentFields[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
    });
  }

  const renderFieldsSection = () => {
    const fieldsContainer = container.querySelector<HTMLElement>("#jantt-fields-bag");
    if (!fieldsContainer) return;

    const entries = Object.entries(currentFields);
    let html = "";
    if (entries.length === 0) {
      html += '<div style="font-size: 12px; color: var(--jantt-text-dim); font-style: italic;">No custom attributes defined.</div>';
    } else {
      entries.forEach(([key, val]) => {
        const isUrl = typeof val === "string" && (val.startsWith("http://") || val.startsWith("https://"));
        html += `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px;">
            <span style="font-family: var(--jantt-font-mono); color: var(--jantt-text-muted); font-weight: 500; min-width: 90px; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(key)}:</span>
            <div style="flex-grow: 1; display: flex; align-items: center; gap: 6px;">
              <input type="text" data-field-val-key="${escapeHtml(key)}" value="${escapeHtml(val)}" style="flex-grow: 1; background: var(--jantt-surface); border: 1px solid var(--jantt-border); border-radius: 4px; color: var(--jantt-text); padding: 3px 8px; font-size: 12px;" />
              ${isUrl ? `<a href="${escapeHtml(val)}" target="_blank" rel="noopener noreferrer" style="color: var(--jantt-accent); text-decoration: underline; font-size: 11.5px;">Open</a>` : ""}
              <button type="button" data-del-field-key="${escapeHtml(key)}" class="jantt-btn jantt-btn-secondary" style="padding: 2px 6px; font-size: 11px; height: 26px; display: inline-flex; align-items: center; justify-content: center;" title="Remove attribute">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
        `;
      });
    }

    html += `
      <div style="display: flex; gap: 6px; align-items: center; margin-top: 6px; padding-top: 8px; border-top: 1px dashed var(--jantt-border-subtle);">
        <input type="text" id="jantt-modal-new-field-key" placeholder="Attribute name (e.g. depth)" style="width: 130px; background: var(--jantt-surface); border: 1px solid var(--jantt-border); border-radius: 4px; color: var(--jantt-text); padding: 3px 8px; font-size: 12px;" />
        <input type="text" id="jantt-modal-new-field-val" placeholder="Value (e.g. 45m)" style="flex-grow: 1; background: var(--jantt-surface); border: 1px solid var(--jantt-border); border-radius: 4px; color: var(--jantt-text); padding: 3px 8px; font-size: 12px;" />
        <button type="button" id="jantt-modal-add-field-btn" class="jantt-btn jantt-btn-secondary" style="font-size: 11.5px; white-space: nowrap; height: 26px;">+ Add</button>
      </div>
    `;

    fieldsContainer.innerHTML = html;

    // Attach remove event listeners
    fieldsContainer.querySelectorAll<HTMLButtonElement>("[data-del-field-key]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const k = btn.dataset.delFieldKey!;
        delete currentFields[k];
        renderFieldsSection();
      });
    });

    // Attach input value listeners
    fieldsContainer.querySelectorAll<HTMLInputElement>("[data-field-val-key]").forEach((inp) => {
      inp.addEventListener("input", () => {
        const k = inp.dataset.fieldValKey!;
        currentFields[k] = inp.value;
      });
    });

    // Attach add button & enter key handler
    const addBtn = fieldsContainer.querySelector<HTMLButtonElement>("#jantt-modal-add-field-btn");
    const keyInput = fieldsContainer.querySelector<HTMLInputElement>("#jantt-modal-new-field-key");
    const valInput = fieldsContainer.querySelector<HTMLInputElement>("#jantt-modal-new-field-val");

    const handleAdd = () => {
      const k = keyInput?.value.trim();
      const v = valInput?.value.trim() || "";
      if (k) {
        currentFields[k] = v;
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
        if (valInput) valInput.focus();
      }
    });
  };

  renderFieldsSection();

  const saveBtn = container.querySelector("#jantt-modal-save");
  saveBtn?.addEventListener("click", () => {
    const start = (container.querySelector("#jantt-edit-start") as HTMLInputElement)?.value || task.start;
    const end = (container.querySelector("#jantt-edit-end") as HTMLInputElement)?.value || task.end;
    const status = (container.querySelector("#jantt-edit-status") as HTMLSelectElement)?.value || task.status;
    const progressNum = progressInput ? parseInt(progressInput.value, 10) / 100 : task.progress;
    const notes = (container.querySelector("#jantt-edit-notes") as HTMLTextAreaElement)?.value || "";

    // Collect custom fields
    const updatedFields: Record<string, unknown> = { ...currentFields };

    const updatedTask: Task = {
      ...task,
      start,
      end,
      status,
      progress: progressNum,
      notes,
      fields: Object.keys(updatedFields).length > 0 ? updatedFields : undefined
    };

    onSave(updatedTask);
  });
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
