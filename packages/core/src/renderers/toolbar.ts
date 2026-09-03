import { JanttMeta, TimeScale, LinkRoutingStyle, RowHeightMode } from "../types";

export interface ToolbarProps {
  meta?: JanttMeta;
  taskCount: number;
  currentScale: TimeScale;
  currentRouting: LinkRoutingStyle;
  rowHeightMode: RowHeightMode;
  rowHeight: number;
  showCritical: boolean;
  criticalCount: number;
  searchQuery: string;
  autoCascade: boolean;
  selectedDate?: string | null;
  dayWidth: number;
  onDayWidthChange: (dayWidth: number) => void;
  onScaleChange: (scale: TimeScale) => void;
  onRoutingChange: (routing: LinkRoutingStyle) => void;
  onRowHeightModeChange: (mode: RowHeightMode) => void;
  onRowHeightChange: (height: number) => void;
  onCriticalToggle: () => void;
  onAutoCascadeToggle: () => void;
  onAddTask?: () => void;
  onSearchChange: (query: string) => void;
  onClearDateFilter?: () => void;
}

/**
 * Renders the top toolbar containing title, badge, zoom scale switcher, row height mode switcher,
 * link routing switcher, auto-cascade / strict lock switcher, critical path toggle, and search box.
 */
export function renderToolbar(props: ToolbarProps): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "jantt-toolbar";

  // 1. Title Block
  const titleBlock = document.createElement("div");
  titleBlock.className = "jantt-title-block";
  const title = escapeHtml(props.meta?.title || "Project Schedule");
  titleBlock.innerHTML = `
    <span class="jantt-title">${title}</span>
    <span class="jantt-badge">${props.taskCount} tasks</span>
  `;
  toolbar.appendChild(titleBlock);

  // 2. Controls Section
  const controls = document.createElement("div");
  controls.className = "jantt-toolbar-controls";

  // Scale Segmented Control (Presets)
  const scaleGroup = document.createElement("div");
  scaleGroup.className = "jantt-scale-group";
  scaleGroup.title = "Timeline Zoom Presets";
  (["day", "week", "month", "quarter", "year"] as TimeScale[]).forEach((s) => {
    const btn = document.createElement("button");
    btn.className = `jantt-scale-btn ${s === props.currentScale ? "is-active" : ""}`;
    btn.textContent = s;
    btn.addEventListener("click", () => props.onScaleChange(s));
    scaleGroup.appendChild(btn);
  });
  controls.appendChild(scaleGroup);

  // Continuous Zoom Slider Control
  const zoomSliderWrap = document.createElement("div");
  zoomSliderWrap.className = "jantt-zoom-slider-wrap";
  zoomSliderWrap.title = "Timeline Zoom (or Ctrl + Scroll on chart)";
  zoomSliderWrap.innerHTML = `
    <button type="button" class="jantt-zoom-btn is-zoom-out" aria-label="Zoom out" title="Zoom out (−)">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>
    <input type="range" class="jantt-zoom-slider" min="1.2" max="75" step="0.5" value="${props.dayWidth}" />
    <button type="button" class="jantt-zoom-btn is-zoom-in" aria-label="Zoom in" title="Zoom in (+)">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>
    <span class="jantt-zoom-label">${Math.round(props.dayWidth)}px</span>
  `;

  const zoomSlider = zoomSliderWrap.querySelector<HTMLInputElement>(".jantt-zoom-slider")!;
  const zoomOutBtn = zoomSliderWrap.querySelector<HTMLButtonElement>(".is-zoom-out")!;
  const zoomInBtn = zoomSliderWrap.querySelector<HTMLButtonElement>(".is-zoom-in")!;

  zoomSlider.addEventListener("input", (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(val) && val > 0) {
      props.onDayWidthChange(val);
    }
  });

  zoomOutBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    props.onDayWidthChange(Math.max(1.2, Math.round((props.dayWidth / 1.25) * 10) / 10));
  });

  zoomInBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    props.onDayWidthChange(Math.min(75, Math.round((props.dayWidth * 1.25) * 10) / 10));
  });

  controls.appendChild(zoomSliderWrap);

  // Row Height: Fit Mode vs Custom px Control
  const rowHeightGroup = document.createElement("div");
  rowHeightGroup.className = "jantt-scale-group jantt-rowheight-group";
  rowHeightGroup.title = "Row Height Display Mode";

  const customBtn = document.createElement("button");
  customBtn.className = `jantt-scale-btn ${props.rowHeightMode === "custom" ? "is-active" : ""}`;
  customBtn.textContent = "Custom";
  customBtn.addEventListener("click", () => props.onRowHeightModeChange("custom"));
  rowHeightGroup.appendChild(customBtn);

  const fitBtn = document.createElement("button");
  fitBtn.className = `jantt-scale-btn ${props.rowHeightMode === "fit" ? "is-active" : ""}`;
  fitBtn.title = "Fit Mode: Dynamically scale row heights so all tasks fit inside the screen without vertical scrolling";
  fitBtn.textContent = "Fit Canvas";
  fitBtn.addEventListener("click", () => props.onRowHeightModeChange("fit"));
  rowHeightGroup.appendChild(fitBtn);
  controls.appendChild(rowHeightGroup);

  // Numeric input & steppers for custom row height
  if (props.rowHeightMode === "custom") {
    const heightInputBox = document.createElement("div");
    heightInputBox.className = "jantt-rowheight-input-wrap";
    heightInputBox.title = "Custom Row Height (24px - 140px)";
    heightInputBox.innerHTML = `
      <button type="button" class="jantt-rowheight-btn is-minus" title="Decrease row height (-2px)">-</button>
      <input type="number" min="24" max="140" step="2" class="jantt-rowheight-input" value="${props.rowHeight}" />
      <span class="jantt-rowheight-unit">px</span>
      <button type="button" class="jantt-rowheight-btn is-plus" title="Increase row height (+2px)">+</button>
    `;
    const numInput = heightInputBox.querySelector<HTMLInputElement>(".jantt-rowheight-input")!;
    const minusBtn = heightInputBox.querySelector<HTMLButtonElement>(".is-minus")!;
    const plusBtn = heightInputBox.querySelector<HTMLButtonElement>(".is-plus")!;

    const applyVal = (newVal: number) => {
      const clamped = Math.max(24, Math.min(140, newVal));
      props.onRowHeightChange(clamped);
      requestAnimationFrame(() => {
        const reInput = toolbar.parentElement?.querySelector<HTMLInputElement>(".jantt-rowheight-input");
        if (reInput && document.activeElement?.classList.contains("jantt-rowheight-input")) {
          reInput.focus();
        }
      });
    };

    minusBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      applyVal(props.rowHeight - 2);
    });

    plusBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      applyVal(props.rowHeight + 2);
    });

    numInput.addEventListener("input", (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      if (!isNaN(val) && val >= 24 && val <= 140) {
        applyVal(val);
      }
    });

    numInput.addEventListener("change", (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      if (!isNaN(val)) {
        applyVal(val);
      }
    });

    numInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const val = parseInt((e.target as HTMLInputElement).value, 10);
        if (!isNaN(val)) {
          applyVal(val);
        }
      }
    });

    controls.appendChild(heightInputBox);
  }

  // Auto-Cascade / Lock Limits Toggle Button
  const cascadeBtn = document.createElement("button");
  cascadeBtn.className = `jantt-scale-btn ${props.autoCascade ? "is-active" : ""}`;
  cascadeBtn.title = props.autoCascade
    ? "Auto-Adjust ON: Downstream tasks automatically cascade and adjust (Click to lock limits)"
    : "Strict Limits: Schedule is locked against cascading (Click to auto-adjust)";
  cascadeBtn.innerHTML = props.autoCascade
    ? `<span style="display:inline-flex;align-items:center;gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg> Auto-Cascade</span>`
    : `<span style="display:inline-flex;align-items:center;gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Limits Locked</span>`;
  cascadeBtn.addEventListener("click", () => props.onAutoCascadeToggle());
  controls.appendChild(cascadeBtn);

  // Link Routing Style Segmented Control
  const routingGroup = document.createElement("div");
  routingGroup.className = "jantt-scale-group jantt-routing-group";
  routingGroup.title = "Dependency Line Routing Style";
  const routingOptions: { id: LinkRoutingStyle; label: string }[] = [
    { id: "orthogonal", label: "90° Turn" },
    { id: "curved", label: "Curved" },
    { id: "direct", label: "Direct" }
  ];
  routingOptions.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = `jantt-scale-btn ${opt.id === props.currentRouting ? "is-active" : ""}`;
    btn.textContent = opt.label;
    btn.addEventListener("click", () => props.onRoutingChange(opt.id));
    routingGroup.appendChild(btn);
  });
  controls.appendChild(routingGroup);

  // Critical Path Button
  const critBtn = document.createElement("button");
  critBtn.className = `jantt-critical-btn ${props.showCritical ? "is-active" : ""}`;
  critBtn.innerHTML = `<span>Critical Path (${props.criticalCount})</span>`;
  critBtn.addEventListener("click", () => props.onCriticalToggle());
  controls.appendChild(critBtn);

  // New Task Action Button
  if (props.onAddTask) {
    const addBtn = document.createElement("button");
    addBtn.className = "jantt-add-task-btn";
    addBtn.title = "Add a new task to this schedule";
    addBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      <span>Add Task</span>
    `;
    addBtn.addEventListener("click", () => props.onAddTask?.());
    controls.appendChild(addBtn);
  }

  // Search Box
  const searchBox = document.createElement("div");
  searchBox.className = "jantt-search-box";
  searchBox.innerHTML = `
    <span style="font-size: 11px; opacity: 0.7; font-weight: bold;">Filter:</span>
    <input type="text" class="jantt-search-input" placeholder="Search tasks..." value="${escapeHtml(props.searchQuery)}" />
  `;
  const sInput = searchBox.querySelector<HTMLInputElement>(".jantt-search-input")!;
  sInput.addEventListener("input", (e) => {
    props.onSearchChange((e.target as HTMLInputElement).value);
  });
  controls.appendChild(searchBox);

  // Active Date Filter Badge
  if (props.selectedDate) {
    const dateFilterBadge = document.createElement("div");
    dateFilterBadge.className = "jantt-date-filter-badge";
    dateFilterBadge.title = `Filtered to ${props.selectedDate} — click to clear filter`;
    dateFilterBadge.innerHTML = `
      <span class="jantt-date-filter-icon">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </span>
      <span class="jantt-date-filter-text">${escapeHtml(props.selectedDate)}</span>
      <button type="button" class="jantt-date-filter-clear" aria-label="Clear date filter" title="Clear filter">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;
    dateFilterBadge.addEventListener("click", () => props.onClearDateFilter?.());
    controls.appendChild(dateFilterBadge);
  }

  toolbar.appendChild(controls);
  return toolbar;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
