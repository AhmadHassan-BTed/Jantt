import { JanttMeta, TimeScale, LinkRoutingStyle, RowHeightMode } from "../types";
import { escapeHtml } from "../utils";
import {
  DAY_WIDTH_MIN,
  DAY_WIDTH_MAX,
  MIN_ROW_HEIGHT,
  MAX_ROW_HEIGHT
} from "../constants";

export interface ToolbarProps {
  meta?: JanttMeta;
  taskCount: number;
  currentScale: TimeScale;
  currentRouting: LinkRoutingStyle;
  rowHeightMode: RowHeightMode;
  rowHeight: number;
  showCritical: boolean;
  showBaselines?: boolean;
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
  onBaselinesToggle?: () => void;
  onAutoCascadeToggle: () => void;
  onAddTask?: () => void;
  onSearchChange: (query: string) => void;
  onClearDateFilter?: () => void;
}

/**
 * Renders the top chart toolbar organized into 3 intuitive zones:
 * - Left Zone: Schedule Title and Task count badge.
 * - Center Zone: Unified Zoom strip (slider + presets), Critical Path toggle, Active date filter pill.
 * - Right Zone: Search input, Add Task primary button, and Settings gear popover trigger.
 */
export function renderToolbar(props: ToolbarProps): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "jantt-toolbar";

  // ─────────────────────────────────────────────────────────────────────────────
  // ZONE 1: LEFT (Schedule Title & Task Count)
  // ─────────────────────────────────────────────────────────────────────────────
  const leftZone = document.createElement("div");
  leftZone.className = "jantt-toolbar-left";

  const titleBlock = document.createElement("div");
  titleBlock.className = "jantt-title-block";
  const title = escapeHtml(props.meta?.title || "Project Schedule");
  titleBlock.innerHTML = `
    <span class="jantt-title">${title}</span>
    <span class="jantt-badge">${props.taskCount} tasks</span>
  `;
  leftZone.appendChild(titleBlock);
  toolbar.appendChild(leftZone);

  // ─────────────────────────────────────────────────────────────────────────────
  // ZONE 2: CENTER (Unified Zoom Strip, Critical Path, Date Filter Badge)
  // ─────────────────────────────────────────────────────────────────────────────
  const centerZone = document.createElement("div");
  centerZone.className = "jantt-toolbar-center";

  // 2a. Unified Zoom Strip (Continuous Slider + Preset Buttons)
  const zoomStrip = document.createElement("div");
  zoomStrip.className = "jantt-zoom-strip";
  zoomStrip.title = "Timeline Zoom (or Ctrl + Scroll on chart)";

  // Continuous slider element
  zoomStrip.innerHTML = `
    <button type="button" class="jantt-zoom-btn is-zoom-out" aria-label="Zoom out" title="Zoom out (−)">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>
    <input type="range" class="jantt-zoom-slider" min="${DAY_WIDTH_MIN}" max="${DAY_WIDTH_MAX}" step="0.5" value="${props.dayWidth}" />
    <button type="button" class="jantt-zoom-btn is-zoom-in" aria-label="Zoom in" title="Zoom in (+)">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>
    <span class="jantt-zoom-label">${Math.round(props.dayWidth)}px</span>
    <span class="jantt-zoom-strip-divider"></span>
    <div class="jantt-scale-group"></div>
  `;

  const zoomSlider = zoomStrip.querySelector<HTMLInputElement>(".jantt-zoom-slider")!;
  const zoomOutBtn = zoomStrip.querySelector<HTMLButtonElement>(".is-zoom-out")!;
  const zoomInBtn = zoomStrip.querySelector<HTMLButtonElement>(".is-zoom-in")!;
  const scaleGroup = zoomStrip.querySelector<HTMLDivElement>(".jantt-scale-group")!;

  zoomSlider.addEventListener("input", (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(val) && val > 0) {
      props.onDayWidthChange(val);
    }
  });

  zoomOutBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    props.onDayWidthChange(Math.max(DAY_WIDTH_MIN, Math.round((props.dayWidth / 1.25) * 10) / 10));
  });

  zoomInBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    props.onDayWidthChange(Math.min(DAY_WIDTH_MAX, Math.round((props.dayWidth * 1.25) * 10) / 10));
  });

  (["day", "week", "month", "quarter", "year"] as TimeScale[]).forEach((s) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `jantt-scale-btn ${s === props.currentScale ? "is-active" : ""}`;
    btn.textContent = s;
    btn.title = `Switch to ${s} scale view`;
    btn.addEventListener("click", () => props.onScaleChange(s));
    scaleGroup.appendChild(btn);
  });

  centerZone.appendChild(zoomStrip);

  // 2b. Critical Path Toggle Button
  const critBtn = document.createElement("button");
  critBtn.type = "button";
  critBtn.className = `jantt-critical-btn ${props.showCritical ? "is-active" : ""}`;
  critBtn.title = "Highlight the critical chain of dependent tasks controlling project duration";
  critBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
    </svg>
    <span>Critical Path (${props.criticalCount})</span>
  `;
  critBtn.addEventListener("click", () => props.onCriticalToggle());
  centerZone.appendChild(critBtn);

  // 2c. Active Date Filter Badge
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
    centerZone.appendChild(dateFilterBadge);
  }

  toolbar.appendChild(centerZone);

  // ─────────────────────────────────────────────────────────────────────────────
  // ZONE 3: RIGHT (Search Box, Add Task Button, Settings Popover Trigger)
  // ─────────────────────────────────────────────────────────────────────────────
  const rightZone = document.createElement("div");
  rightZone.className = "jantt-toolbar-right";

  // 3a. Search Input Box
  const searchBox = document.createElement("div");
  searchBox.className = "jantt-search-box";
  searchBox.innerHTML = `
    <span class="jantt-search-icon">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
    </span>
    <input type="text" class="jantt-search-input" placeholder="Search tasks..." value="${escapeHtml(props.searchQuery)}" />
  `;
  const sInput = searchBox.querySelector<HTMLInputElement>(".jantt-search-input")!;
  sInput.addEventListener("input", (e) => {
    props.onSearchChange((e.target as HTMLInputElement).value);
  });
  rightZone.appendChild(searchBox);

  // 3b. Add Task Primary Button
  if (props.onAddTask) {
    const addBtn = document.createElement("button");
    addBtn.type = "button";
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
    rightZone.appendChild(addBtn);
  }

  // 3c. Settings Trigger Button & Popover
  const settingsWrap = document.createElement("div");
  settingsWrap.className = "jantt-settings-wrap";

  const settingsBtn = document.createElement("button");
  settingsBtn.type = "button";
  settingsBtn.className = "jantt-settings-btn";
  settingsBtn.title = "Chart & Layout Settings (Row height, link routing, auto-cascade, baselines)";
  settingsBtn.setAttribute("aria-label", "Chart Settings");
  settingsBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
    <span>Settings</span>
  `;
  settingsWrap.appendChild(settingsBtn);

  // Settings Popover Panel
  const popover = renderSettingsPopover(props);
  settingsWrap.appendChild(popover);

  const togglePopover = (open?: boolean) => {
    const isOpen = open !== undefined ? open : !popover.classList.contains("is-open");
    popover.classList.toggle("is-open", isOpen);
    settingsBtn.classList.toggle("is-active", isOpen);
  };

  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePopover();
  });

  const onDocClick = (e: MouseEvent) => {
    if (!settingsWrap.contains(e.target as Node)) {
      togglePopover(false);
    }
  };

  const onDocKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && popover.classList.contains("is-open")) {
      togglePopover(false);
    }
  };

  document.addEventListener("pointerdown", onDocClick);
  document.addEventListener("keydown", onDocKeydown);

  rightZone.appendChild(settingsWrap);
  toolbar.appendChild(rightZone);

  return toolbar;
}

/**
 * Builds the floating Chart Settings Popover.
 * Provides intuitive controls for:
 * 1. Canvas & Row Height (Slider + presets + Fit-to-screen mode)
 * 2. Dependency Link Routing Style (90° Orthogonal, Curved, Direct)
 * 3. Engine Auto-Cascade Rule
 * 4. Baseline Comparisons
 */
function renderSettingsPopover(props: ToolbarProps): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "jantt-settings-popover";

  panel.innerHTML = `
    <div class="jantt-settings-header">
      <div class="jantt-settings-title">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
        <span>Chart Settings</span>
      </div>
      <button type="button" class="jantt-settings-close-btn" aria-label="Close settings">✕</button>
    </div>

    <!-- Section 1: Canvas & Row Height -->
    <div class="jantt-settings-section">
      <div class="jantt-settings-section-title">Canvas &amp; Row Height</div>
      
      <div class="jantt-settings-row">
        <label class="jantt-settings-label">Display Mode</label>
        <div class="jantt-scale-group jantt-rowheight-mode-group">
          <button type="button" class="jantt-scale-btn ${props.rowHeightMode === "custom" ? "is-active" : ""}" data-mode="custom">Custom</button>
          <button type="button" class="jantt-scale-btn ${props.rowHeightMode === "fit" ? "is-active" : ""}" data-mode="fit" title="Fit Mode: Dynamically scale row heights so all tasks fit inside the screen">Fit Canvas</button>
        </div>
      </div>

      <div class="jantt-settings-row jantt-rowheight-slider-row" style="${props.rowHeightMode === "fit" ? "opacity: 0.45; pointer-events: none;" : ""}">
        <div class="jantt-settings-slider-header">
          <label class="jantt-settings-label">Row Height</label>
          <span class="jantt-settings-val-badge">${props.rowHeight}px</span>
        </div>
        <div class="jantt-settings-slider-wrap">
          <input type="range" class="jantt-settings-slider jantt-rowheight-slider" min="${MIN_ROW_HEIGHT}" max="${MAX_ROW_HEIGHT}" step="2" value="${props.rowHeight}" />
        </div>
        <div class="jantt-settings-presets">
          <button type="button" class="jantt-preset-btn ${props.rowHeight === 32 ? "is-active" : ""}" data-val="32">Compact (32px)</button>
          <button type="button" class="jantt-preset-btn ${props.rowHeight === 46 ? "is-active" : ""}" data-val="46">Default (46px)</button>
          <button type="button" class="jantt-preset-btn ${props.rowHeight === 64 ? "is-active" : ""}" data-val="64">Spacious (64px)</button>
        </div>
      </div>
    </div>

    <div class="jantt-settings-divider"></div>

    <!-- Section 2: Dependencies & Routing -->
    <div class="jantt-settings-section">
      <div class="jantt-settings-section-title">Dependencies &amp; Connectors</div>
      <div class="jantt-settings-row">
        <label class="jantt-settings-label">Line Routing</label>
        <div class="jantt-scale-group jantt-routing-group">
          <button type="button" class="jantt-scale-btn ${props.currentRouting === "orthogonal" ? "is-active" : ""}" data-routing="orthogonal">90° Turn</button>
          <button type="button" class="jantt-scale-btn ${props.currentRouting === "curved" ? "is-active" : ""}" data-routing="curved">Curved</button>
          <button type="button" class="jantt-scale-btn ${props.currentRouting === "direct" ? "is-active" : ""}" data-routing="direct">Direct</button>
        </div>
      </div>
    </div>

    <div class="jantt-settings-divider"></div>

    <!-- Section 3: Engine & Rules -->
    <div class="jantt-settings-section">
      <div class="jantt-settings-section-title">Scheduling Engine</div>

      <!-- Auto-Cascade Toggle -->
      <div class="jantt-settings-switch-row">
        <div class="jantt-settings-switch-info">
          <span class="jantt-settings-switch-label">Auto-Cascade Tasks</span>
          <span class="jantt-settings-switch-sub">Downstream tasks shift automatically when predecessor moves</span>
        </div>
        <button type="button" class="jantt-toggle-switch ${props.autoCascade ? "is-active" : ""}" role="switch" aria-checked="${props.autoCascade}" data-switch="auto-cascade">
          <span class="jantt-toggle-thumb"></span>
        </button>
      </div>

      <!-- Baselines Toggle -->
      <div class="jantt-settings-switch-row">
        <div class="jantt-settings-switch-info">
          <span class="jantt-settings-switch-label">Show Baselines</span>
          <span class="jantt-settings-switch-sub">Display original planned schedule bars beneath active tasks</span>
        </div>
        <button type="button" class="jantt-toggle-switch ${props.showBaselines ? "is-active" : ""}" role="switch" aria-checked="${Boolean(props.showBaselines)}" data-switch="baselines">
          <span class="jantt-toggle-thumb"></span>
        </button>
      </div>
    </div>
  `;

  // Prevent popover clicks from bubbling to document listener
  panel.addEventListener("pointerdown", (e) => e.stopPropagation());

  // Close button
  const closeBtn = panel.querySelector<HTMLButtonElement>(".jantt-settings-close-btn")!;
  closeBtn.addEventListener("click", () => {
    panel.classList.remove("is-open");
    panel.parentElement?.querySelector<HTMLButtonElement>(".jantt-settings-btn")?.classList.remove("is-active");
  });

  // Mode buttons (Custom vs Fit)
  const modeBtns = panel.querySelectorAll<HTMLButtonElement>(".jantt-rowheight-mode-group .jantt-scale-btn");
  modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode as RowHeightMode;
      props.onRowHeightModeChange(mode);
    });
  });

  // Row height slider & value badge
  const rowSlider = panel.querySelector<HTMLInputElement>(".jantt-rowheight-slider");
  const valBadge = panel.querySelector<HTMLElement>(".jantt-settings-val-badge");
  if (rowSlider && valBadge) {
    rowSlider.addEventListener("input", (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      if (!isNaN(val)) {
        valBadge.textContent = `${val}px`;
        props.onRowHeightChange(val);
      }
    });
  }

  // Row height presets
  const presetBtns = panel.querySelectorAll<HTMLButtonElement>(".jantt-preset-btn");
  presetBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = parseInt(btn.dataset.val || "46", 10);
      props.onRowHeightChange(val);
    });
  });

  // Link routing buttons
  const routingBtns = panel.querySelectorAll<HTMLButtonElement>(".jantt-routing-group .jantt-scale-btn");
  routingBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const routing = btn.dataset.routing as LinkRoutingStyle;
      props.onRoutingChange(routing);
    });
  });

  // Auto-cascade switch
  const cascadeSwitch = panel.querySelector<HTMLButtonElement>('[data-switch="auto-cascade"]');
  cascadeSwitch?.addEventListener("click", () => {
    props.onAutoCascadeToggle();
  });

  // Baselines switch
  const baselinesSwitch = panel.querySelector<HTMLButtonElement>('[data-switch="baselines"]');
  baselinesSwitch?.addEventListener("click", () => {
    props.onBaselinesToggle?.();
  });

  return panel;
}
