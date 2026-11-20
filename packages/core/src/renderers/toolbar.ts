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
  /** View-only charts show the Auto-Cascade rule but cannot change it. */
  readOnly?: boolean;
  selectedDate?: string | null;
  showDateFilterBadge?: boolean;
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
  isSettingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
  onOpenAutoSave?: () => void;
  onImportJson?: () => void;
  onExportJson?: () => void;
  onExportCsv?: () => void;
}

type ToolbarPropsRef = { current: ToolbarProps };

let popoverIdCounter = 0;

/** Reflects the Auto-Cascade state, and whether it may be changed (not in read-only charts), on its switch. */
function syncCascadeSwitch(scope: ParentNode, props: ToolbarProps): void {
  const btn = scope.querySelector<HTMLButtonElement>('[data-switch="auto-cascade"]');
  const row = scope.querySelector<HTMLElement>('[data-action="toggle-cascade"]');
  if (!btn || !row) return;
  const locked = Boolean(props.readOnly);
  btn.classList.toggle("is-active", props.autoCascade);
  btn.setAttribute("aria-checked", String(props.autoCascade));
  btn.setAttribute("aria-disabled", String(locked));
  row.classList.toggle("is-disabled", locked);
  row.title = locked
    ? "View only: the scheduling rule cannot be changed"
    : "Click to toggle auto-cascading dependencies";
}

/** Identifies which Data & Persistence actions are available, to rebuild that section on change. */
function dataActionsKey(props: ToolbarProps): string {
  return [props.onOpenAutoSave, props.onImportJson, props.onExportJson, props.onExportCsv]
    .map((cb) => (cb ? "1" : "0"))
    .join("");
}

function createAddTaskButton(propsRef: ToolbarPropsRef): HTMLButtonElement {
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "jantt-add-task-btn";
  addBtn.title = "Add a new task to this schedule";
  addBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
    <span>Add Task</span>
  `;
  addBtn.addEventListener("click", () => propsRef.current.onAddTask?.());
  return addBtn;
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

  const propsRef: ToolbarPropsRef = { current: props };
  (toolbar as any).__propsRef = propsRef;
  (toolbar as any).__dataActionsKey = dataActionsKey(props);

  // ─────────────────────────────────────────────────────────────────────────────
  // ZONE 1: LEFT (Task Count Badge & Primary Add Task Action)
  // ─────────────────────────────────────────────────────────────────────────────
  const leftZone = document.createElement("div");
  leftZone.className = "jantt-toolbar-left";

  const titleBlock = document.createElement("div");
  titleBlock.className = "jantt-title-block";
  const title = escapeHtml(props.meta?.title || "Project Schedule");
  titleBlock.innerHTML = `
    <span class="jantt-badge">${props.taskCount} tasks</span>
    <span class="jantt-title" style="display: none;">${title}</span>
  `;
  leftZone.appendChild(titleBlock);

  // Add Task primary action right on the left zone next to task count
  if (props.onAddTask) {
    leftZone.appendChild(createAddTaskButton(propsRef));
  }

  toolbar.appendChild(leftZone);

  // ─────────────────────────────────────────────────────────────────────────────
  // ZONE 2: CENTER (Scale Presets, Row Density Presets, Active Date Filter Badge)
  // ─────────────────────────────────────────────────────────────────────────────
  const centerZone = document.createElement("div");
  centerZone.className = "jantt-toolbar-center";

  // 2a. Timeline Scale Presets Group
  const scaleGroup = document.createElement("div");
  scaleGroup.className = "jantt-scale-group jantt-time-scale-group";
  scaleGroup.title = "Timeline Scale Presets (Day / Week / Month / Quarter / Year)";

  (["day", "week", "month", "quarter", "year"] as TimeScale[]).forEach((s) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `jantt-scale-btn ${s === props.currentScale ? "is-active" : ""}`;
    btn.textContent = s;
    btn.title = `Switch to ${s} scale view`;
    btn.setAttribute("aria-pressed", String(s === props.currentScale));
    btn.addEventListener("click", () => propsRef.current.onScaleChange(s));
    scaleGroup.appendChild(btn);
  });
  centerZone.appendChild(scaleGroup);

  // 2b. Row Density Presets Group
  const densityGroup = document.createElement("div");
  densityGroup.className = "jantt-scale-group jantt-density-group";
  densityGroup.title = "Task Row Density (Compact / Default / Spacious / Fit)";
  densityGroup.innerHTML = `
    <button type="button" class="jantt-scale-btn ${props.rowHeightMode === "custom" && props.rowHeight === 32 ? "is-active" : ""}" data-val="32" title="Compact rows (32px)">Compact</button>
    <button type="button" class="jantt-scale-btn ${props.rowHeightMode === "custom" && props.rowHeight === 46 ? "is-active" : ""}" data-val="46" title="Default rows (46px)">Default</button>
    <button type="button" class="jantt-scale-btn ${props.rowHeightMode === "custom" && props.rowHeight === 64 ? "is-active" : ""}" data-val="64" title="Spacious rows (64px)">Spacious</button>
    <button type="button" class="jantt-scale-btn ${props.rowHeightMode === "fit" ? "is-active" : ""}" data-mode="fit" title="Fit mode: dynamically scale row heights so all tasks fit without scrolling">Fit</button>
  `;

  densityGroup.querySelectorAll<HTMLButtonElement>(".jantt-scale-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const mode = btn.dataset.mode;
      if (mode === "fit") {
        propsRef.current.onRowHeightModeChange("fit");
      } else {
        const val = parseInt(btn.dataset.val || "46", 10);
        propsRef.current.onRowHeightChange(val);
      }
    });
  });
  centerZone.appendChild(densityGroup);

  // 2c. Active Date Filter Badge (Conditional)
  if (props.selectedDate && props.showDateFilterBadge !== false) {
    const dateFilterBadge = document.createElement("div");
    dateFilterBadge.className = "jantt-date-filter-badge";
    dateFilterBadge.title = `Filtered to ${props.selectedDate} - click to clear filter`;
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
    dateFilterBadge.addEventListener("click", () => propsRef.current.onClearDateFilter?.());
    centerZone.appendChild(dateFilterBadge);
  }

  toolbar.appendChild(centerZone);

  // ─────────────────────────────────────────────────────────────────────────────
  // ZONE 3: RIGHT (Critical Path, Search Input Box, Settings Popover Trigger)
  // ─────────────────────────────────────────────────────────────────────────────
  const rightZone = document.createElement("div");
  rightZone.className = "jantt-toolbar-right";

  // 3a. Critical Path Toggle Button
  const critBtn = document.createElement("button");
  critBtn.type = "button";
  critBtn.className = `jantt-critical-btn ${props.showCritical ? "is-active" : ""}`;
  critBtn.title = "Highlight the critical chain of dependent tasks controlling project duration";
  critBtn.setAttribute("aria-pressed", String(props.showCritical));
  critBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
    </svg>
    <span>Critical Path (${props.criticalCount})</span>
  `;
  critBtn.addEventListener("click", () => propsRef.current.onCriticalToggle());
  rightZone.appendChild(critBtn);

  // 3b. Search Input Box
  const searchBox = document.createElement("div");
  searchBox.className = "jantt-search-box";
  searchBox.innerHTML = `
    <span class="jantt-search-icon">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
    </span>
    <input type="text" class="jantt-search-input" placeholder="Search tasks..." aria-label="Search tasks" value="${escapeHtml(props.searchQuery)}" />
  `;
  const sInput = searchBox.querySelector<HTMLInputElement>(".jantt-search-input")!;
  sInput.addEventListener("input", (e) => {
    propsRef.current.onSearchChange((e.target as HTMLInputElement).value);
  });
  rightZone.appendChild(searchBox);

  // 3c. Settings Trigger Button & Popover
  const settingsWrap = document.createElement("div");
  settingsWrap.className = "jantt-settings-wrap";

  const popoverId = `jantt-settings-popover-${++popoverIdCounter}`;
  const settingsBtn = document.createElement("button");
  settingsBtn.type = "button";
  settingsBtn.className = "jantt-settings-btn";
  settingsBtn.title = "Chart Settings (Link routing, auto-cascade engine, baselines)";
  settingsBtn.setAttribute("aria-label", "Chart Settings");
  settingsBtn.setAttribute("aria-haspopup", "dialog");
  settingsBtn.setAttribute("aria-controls", popoverId);
  settingsBtn.setAttribute("aria-expanded", "false");
  settingsBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
    <span>Settings</span>
  `;
  settingsWrap.appendChild(settingsBtn);

  // Settings Popover Panel
  const popover = renderSettingsPopover(propsRef, () => togglePopover(false, true));
  popover.id = popoverId;
  settingsWrap.appendChild(popover);

  const onDocClick = (e: MouseEvent) => {
    if (!settingsWrap.isConnected) {
      document.removeEventListener("pointerdown", onDocClick);
      document.removeEventListener("keydown", onDocKeydown);
      return;
    }
    if (!settingsWrap.contains(e.target as Node)) {
      togglePopover(false);
    }
  };

  const onDocKeydown = (e: KeyboardEvent) => {
    if (!settingsWrap.isConnected) {
      document.removeEventListener("pointerdown", onDocClick);
      document.removeEventListener("keydown", onDocKeydown);
      return;
    }
    if (e.key === "Escape" && popover.classList.contains("is-open")) {
      togglePopover(false, true);
    }
  };

  /**
   * Places the panel directly under its trigger and fits it inside the chart and the viewport:
   * the chart root clips overflow, so the panel never flips above the toolbar; instead its height
   * is capped to the space below (it scrolls internally) and it is left-aligned when right-aligning
   * would push it past the chart's left edge. Phones get a bottom sheet from CSS instead.
   */
  const positionPopover = () => {
    const root = toolbar.closest<HTMLElement>(".jantt-container");
    const triggerRect = settingsWrap.getBoundingClientRect();
    const rootRect = root?.getBoundingClientRect();
    const bottomLimit = Math.min(window.innerHeight, rootRect && rootRect.height > 0 ? rootRect.bottom : window.innerHeight);
    const available = Math.floor(bottomLimit - triggerRect.bottom - 16);
    popover.style.setProperty("--jantt-popover-max-h", `${Math.max(160, available)}px`);
    const leftLimit = (rootRect ? rootRect.left : 0) + 8;
    const width = popover.offsetWidth || 310;
    popover.classList.toggle("is-align-left", triggerRect.width > 0 && triggerRect.right - width < leftLimit);
  };

  const togglePopover = (open?: boolean, restoreFocus = false) => {
    const wasOpen = popover.classList.contains("is-open");
    const isOpen = open !== undefined ? open : !wasOpen;
    if (isOpen) positionPopover();
    popover.classList.toggle("is-open", isOpen);
    settingsBtn.classList.toggle("is-active", isOpen);
    settingsBtn.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) {
      document.addEventListener("pointerdown", onDocClick);
      document.addEventListener("keydown", onDocKeydown);
      if (!wasOpen) popover.focus({ preventScroll: true });
    } else {
      document.removeEventListener("pointerdown", onDocClick);
      document.removeEventListener("keydown", onDocKeydown);
      if (wasOpen && restoreFocus) settingsBtn.focus({ preventScroll: true });
    }
    propsRef.current.onSettingsOpenChange?.(isOpen);
  };

  if (props.isSettingsOpen) {
    popover.classList.add("is-open");
    settingsBtn.classList.add("is-active");
    settingsBtn.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", onDocClick);
    document.addEventListener("keydown", onDocKeydown);
  }

  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePopover();
  });

  rightZone.appendChild(settingsWrap);
  toolbar.appendChild(rightZone);

  // Attach teardown handler for when toolbar DOM is unmounted or replaced
  (toolbar as any).__cleanup = () => {
    document.removeEventListener("pointerdown", onDocClick);
    document.removeEventListener("keydown", onDocKeydown);
  };

  return toolbar;
}

/**
 * Updates an existing toolbar DOM element in-place to avoid destroying input elements
 * or active slider drag sessions.
 */
export function updateToolbar(toolbar: HTMLElement, nextProps: ToolbarProps): void {
  const propsRef = (toolbar as any).__propsRef as { current: ToolbarProps } | undefined;
  if (propsRef) {
    propsRef.current = nextProps;
  }

  // 1. Left Zone
  const titleSpan = toolbar.querySelector<HTMLSpanElement>(".jantt-title");
  if (titleSpan) titleSpan.textContent = nextProps.meta?.title || "Project Schedule";
  const badgeSpan = toolbar.querySelector<HTMLSpanElement>(".jantt-badge");
  if (badgeSpan) badgeSpan.textContent = `${nextProps.taskCount} tasks`;

  // 2. Center Zone
  // 2a. Zoom Slider & Presets
  const zoomSlider = toolbar.querySelector<HTMLInputElement>(".jantt-zoom-slider");
  if (zoomSlider && document.activeElement !== zoomSlider) {
    zoomSlider.value = String(nextProps.dayWidth);
  }
  const zoomLabel = toolbar.querySelector<HTMLSpanElement>(".jantt-zoom-label");
  if (zoomLabel) zoomLabel.textContent = `${Math.round(nextProps.dayWidth)}px`;

  toolbar.querySelectorAll<HTMLButtonElement>(".jantt-time-scale-group .jantt-scale-btn, .jantt-zoom-strip .jantt-scale-btn").forEach((btn) => {
    const isActive = btn.textContent === nextProps.currentScale;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", String(isActive));
  });

  // 2b. Row Height Slider & Presets
  const rhSlider = toolbar.querySelector<HTMLInputElement>(".jantt-rowheight-slider");
  if (rhSlider) {
    if (document.activeElement !== rhSlider) {
      rhSlider.value = String(nextProps.rowHeight);
    }
    rhSlider.disabled = nextProps.rowHeightMode === "fit";
    rhSlider.style.opacity = nextProps.rowHeightMode === "fit" ? "0.45" : "1";
    rhSlider.style.pointerEvents = nextProps.rowHeightMode === "fit" ? "none" : "auto";
  }
  const rhLabel = toolbar.querySelector<HTMLSpanElement>(".jantt-rowheight-label");
  if (rhLabel) {
    rhLabel.textContent = nextProps.rowHeightMode === "fit" ? "Fit" : `${nextProps.rowHeight}px`;
  }

  toolbar.querySelectorAll<HTMLButtonElement>(".jantt-density-group .jantt-scale-btn, .jantt-rowheight-strip .jantt-scale-btn").forEach((btn) => {
    const isFit = btn.dataset.mode === "fit";
    const val = parseInt(btn.dataset.val || "0", 10);
    const isActive = isFit ? nextProps.rowHeightMode === "fit" : (nextProps.rowHeightMode === "custom" && nextProps.rowHeight === val);
    btn.classList.toggle("is-active", isActive);
  });

  // 2c. Critical Path Button
  const critBtn = toolbar.querySelector<HTMLButtonElement>(".jantt-critical-btn");
  if (critBtn) {
    critBtn.classList.toggle("is-active", nextProps.showCritical);
    critBtn.setAttribute("aria-pressed", String(nextProps.showCritical));
    const span = critBtn.querySelector("span");
    if (span) span.textContent = `Critical Path (${nextProps.criticalCount})`;
  }

  // 2d. Date Filter Badge
  const centerZone = toolbar.querySelector<HTMLElement>(".jantt-toolbar-center");
  let dateFilterBadge = toolbar.querySelector<HTMLElement>(".jantt-date-filter-badge");
  const shouldShowBadge = Boolean(nextProps.selectedDate && nextProps.showDateFilterBadge !== false);
  if (shouldShowBadge) {
    if (!dateFilterBadge && centerZone) {
      dateFilterBadge = document.createElement("div");
      dateFilterBadge.className = "jantt-date-filter-badge";
      dateFilterBadge.title = `Filtered to ${nextProps.selectedDate} - click to clear filter`;
      dateFilterBadge.innerHTML = `
        <span class="jantt-date-filter-icon">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </span>
        <span class="jantt-date-filter-text">${escapeHtml(nextProps.selectedDate!)}</span>
        <button type="button" class="jantt-date-filter-clear" aria-label="Clear date filter" title="Clear filter">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;
      dateFilterBadge.addEventListener("click", () => propsRef?.current.onClearDateFilter?.());
      centerZone.appendChild(dateFilterBadge);
    } else if (dateFilterBadge) {
      dateFilterBadge.title = `Filtered to ${nextProps.selectedDate} - click to clear filter`;
      const txt = dateFilterBadge.querySelector<HTMLSpanElement>(".jantt-date-filter-text");
      if (txt) txt.textContent = nextProps.selectedDate!;
    }
  } else if (dateFilterBadge) {
    dateFilterBadge.remove();
  }

  // 3. Right Zone: Search Input
  const sInput = toolbar.querySelector<HTMLInputElement>(".jantt-search-input");
  if (sInput && document.activeElement !== sInput) {
    sInput.value = nextProps.searchQuery;
  }

  // 3b. Add Task button follows the current permissions (e.g. a viewer/editor role switch)
  const addBtn = toolbar.querySelector<HTMLButtonElement>(".jantt-add-task-btn");
  if (nextProps.onAddTask && !addBtn && propsRef) {
    const settingsWrap = toolbar.querySelector<HTMLElement>(".jantt-settings-wrap");
    settingsWrap?.parentElement?.insertBefore(createAddTaskButton(propsRef), settingsWrap);
  } else if (!nextProps.onAddTask && addBtn) {
    addBtn.remove();
  }

  // 4. Settings Popover internal states
  toolbar.querySelectorAll<HTMLButtonElement>(".jantt-routing-group .jantt-scale-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.routing === nextProps.currentRouting);
  });

  syncCascadeSwitch(toolbar, nextProps);

  const baselinesBtn = toolbar.querySelector<HTMLButtonElement>('[data-switch="baselines"]');
  if (baselinesBtn) {
    baselinesBtn.classList.toggle("is-active", Boolean(nextProps.showBaselines));
    baselinesBtn.setAttribute("aria-checked", String(Boolean(nextProps.showBaselines)));
  }

  const popover = toolbar.querySelector<HTMLElement>(".jantt-settings-popover");
  const settingsBtn = toolbar.querySelector<HTMLButtonElement>(".jantt-settings-btn");
  if (popover && settingsBtn && nextProps.isSettingsOpen !== undefined) {
    popover.classList.toggle("is-open", nextProps.isSettingsOpen);
    settingsBtn.classList.toggle("is-active", nextProps.isSettingsOpen);
    settingsBtn.setAttribute("aria-expanded", String(nextProps.isSettingsOpen));
  }

  // 5. Data & Persistence actions follow the callbacks currently provided
  const nextDataKey = dataActionsKey(nextProps);
  if (popover && propsRef && (toolbar as any).__dataActionsKey !== nextDataKey) {
    (toolbar as any).__dataActionsKey = nextDataKey;
    popover.querySelector(".jantt-settings-data-section")?.remove();
    const closeBtn = popover.querySelector<HTMLButtonElement>(".jantt-settings-close-btn");
    const section = renderDataSection(propsRef, () => closeBtn?.click());
    if (section) popover.appendChild(section);
  }
}

/**
 * Builds the optional "Data & Persistence" section (divider included), or null when no data
 * callbacks are provided.
 */
function renderDataSection(propsRef: ToolbarPropsRef, onClose: () => void): HTMLElement | null {
  const props = propsRef.current;
  if (!props.onOpenAutoSave && !props.onImportJson && !props.onExportJson && !props.onExportCsv) {
    return null;
  }

  const section = document.createElement("div");
  section.className = "jantt-settings-data-section";
  section.innerHTML = `
    <div class="jantt-settings-divider"></div>
    <div class="jantt-settings-section">
      <div class="jantt-settings-section-title">Data &amp; Persistence</div>
      ${props.onOpenAutoSave ? `
        <button type="button" class="jantt-settings-action-btn" data-action="open-autosave" title="Configure auto-save cadence and browser storage">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          <span>Auto-Save &amp; Storage Settings</span>
        </button>
      ` : ""}
      <div class="jantt-settings-action-grid">
        ${props.onImportJson ? `
          <button type="button" class="jantt-settings-action-btn" data-action="import-json" title="Upload and load a Jantt JSON file">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span>Import JSON</span>
          </button>
        ` : ""}
        ${props.onExportJson ? `
          <button type="button" class="jantt-settings-action-btn" data-action="export-json" title="Download project schedule as JSON">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Export JSON</span>
          </button>
        ` : ""}
        ${props.onExportCsv ? `
          <button type="button" class="jantt-settings-action-btn" data-action="export-csv" title="Download tasks as spreadsheet CSV">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            <span>Export CSV</span>
          </button>
        ` : ""}
      </div>
    </div>
  `;

  const bindAction = (action: string, run: () => void) => {
    section.querySelector<HTMLElement>(`[data-action="${action}"]`)?.addEventListener("click", (e) => {
      e.stopPropagation();
      onClose();
      run();
    });
  };
  bindAction("open-autosave", () => propsRef.current.onOpenAutoSave?.());
  bindAction("import-json", () => propsRef.current.onImportJson?.());
  bindAction("export-json", () => propsRef.current.onExportJson?.());
  bindAction("export-csv", () => propsRef.current.onExportCsv?.());

  return section;
}

/**
 * Builds the floating Chart Settings Popover.
 * Provides intuitive controls for:
 * 1. Dependency Link Routing Style (90° Orthogonal, Curved, Direct)
 * 2. Engine Auto-Cascade Rule
 * 3. Baseline Comparisons
 */
function renderSettingsPopover(propsRef: ToolbarPropsRef, onClose: () => void): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "jantt-settings-popover";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Chart Settings");
  panel.tabIndex = -1;

  const props = propsRef.current;

  panel.innerHTML = `
    <div class="jantt-settings-header">
      <div class="jantt-settings-title">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
        <span>Chart Settings</span>
      </div>
      <button type="button" class="jantt-settings-close-btn" aria-label="Close settings">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- Section 0: Timeline Zoom & Row Sizing -->
    <div class="jantt-settings-section">
      <div class="jantt-settings-section-title">Timeline Zoom &amp; Row Sizing</div>
      <div class="jantt-settings-row">
        <label class="jantt-settings-label">Day Width</label>
        <div class="jantt-settings-slider-wrap">
          <button type="button" class="jantt-zoom-btn is-zoom-out" aria-label="Zoom out" title="Zoom out (−)">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <input type="range" class="jantt-zoom-slider" min="${DAY_WIDTH_MIN}" max="${DAY_WIDTH_MAX}" step="0.1" value="${props.dayWidth}" aria-label="Timeline zoom (pixels per day)" />
          <button type="button" class="jantt-zoom-btn is-zoom-in" aria-label="Zoom in" title="Zoom in (+)">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <span class="jantt-zoom-label">${Math.round(props.dayWidth)}px</span>
        </div>
      </div>
      <div class="jantt-settings-row">
        <label class="jantt-settings-label">Row Height</label>
        <div class="jantt-settings-slider-wrap">
          <input type="range" class="jantt-rowheight-slider" min="${MIN_ROW_HEIGHT}" max="${MAX_ROW_HEIGHT}" step="2" value="${props.rowHeight}" title="Drag to adjust task row height (${props.rowHeight}px)" aria-label="Task row height (pixels)" ${props.rowHeightMode === "fit" ? "disabled style='opacity: 0.45; pointer-events: none;'" : ""} />
          <span class="jantt-rowheight-label">${props.rowHeightMode === "fit" ? "Fit" : `${props.rowHeight}px`}</span>
        </div>
      </div>
    </div>

    <div class="jantt-settings-divider"></div>

    <!-- Section 1: Dependencies & Routing -->
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

    <!-- Section 2: Engine & Rules -->
    <div class="jantt-settings-section">
      <div class="jantt-settings-section-title">Scheduling Engine</div>

      <!-- Auto-Cascade Toggle -->
      <div class="jantt-settings-switch-row" data-action="toggle-cascade" title="Click to toggle auto-cascading dependencies">
        <div class="jantt-settings-switch-info">
          <span class="jantt-settings-switch-label">Auto-Cascade Tasks</span>
          <span class="jantt-settings-switch-sub">Downstream tasks shift automatically when predecessor moves</span>
        </div>
        <button type="button" class="jantt-toggle-switch ${props.autoCascade ? "is-active" : ""}" role="switch" aria-checked="${props.autoCascade}" data-switch="auto-cascade" aria-label="Toggle Auto-Cascade">
          <span class="jantt-toggle-thumb"></span>
        </button>
      </div>

      <!-- Baselines Toggle -->
      <div class="jantt-settings-switch-row" data-action="toggle-baselines" title="Click to toggle baseline comparison bars">
        <div class="jantt-settings-switch-info">
          <span class="jantt-settings-switch-label">Show Baselines</span>
          <span class="jantt-settings-switch-sub">Display original planned schedule bars beneath active tasks</span>
        </div>
        <button type="button" class="jantt-toggle-switch ${props.showBaselines ? "is-active" : ""}" role="switch" aria-checked="${Boolean(props.showBaselines)}" data-switch="baselines" aria-label="Toggle Baselines">
          <span class="jantt-toggle-thumb"></span>
        </button>
      </div>
    </div>

  `;

  const dataSection = renderDataSection(propsRef, onClose);
  if (dataSection) panel.appendChild(dataSection);

  // Prevent popover clicks from bubbling to document listener
  panel.addEventListener("pointerdown", (e) => e.stopPropagation());
  panel.addEventListener("click", (e) => e.stopPropagation());

  // Close button
  const closeBtn = panel.querySelector<HTMLButtonElement>(".jantt-settings-close-btn")!;
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClose();
  });

  // Zoom & Row Sizing continuous sliders inside Settings Popover
  const zoomSlider = panel.querySelector<HTMLInputElement>(".jantt-zoom-slider");
  const zoomOutBtn = panel.querySelector<HTMLButtonElement>(".is-zoom-out");
  const zoomInBtn = panel.querySelector<HTMLButtonElement>(".is-zoom-in");
  const zoomLabel = panel.querySelector<HTMLSpanElement>(".jantt-zoom-label");

  zoomSlider?.addEventListener("input", (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(val) && val > 0) {
      if (zoomLabel) zoomLabel.textContent = `${Math.round(val)}px`;
      propsRef.current.onDayWidthChange(val);
    }
  });

  zoomOutBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    propsRef.current.onDayWidthChange(Math.max(DAY_WIDTH_MIN, Math.round((propsRef.current.dayWidth / 1.25) * 10) / 10));
  });

  zoomInBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    propsRef.current.onDayWidthChange(Math.min(DAY_WIDTH_MAX, Math.round((propsRef.current.dayWidth * 1.25) * 10) / 10));
  });

  const rhSlider = panel.querySelector<HTMLInputElement>(".jantt-rowheight-slider");
  const rhLabel = panel.querySelector<HTMLSpanElement>(".jantt-rowheight-label");
  rhSlider?.addEventListener("input", (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(val)) {
      if (rhLabel) rhLabel.textContent = `${val}px`;
      propsRef.current.onRowHeightChange(val);
    }
  });

  // Link routing buttons
  const routingBtns = panel.querySelectorAll<HTMLButtonElement>(".jantt-routing-group .jantt-scale-btn");
  routingBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const routing = btn.dataset.routing as LinkRoutingStyle;
      propsRef.current.onRoutingChange(routing);
    });
  });

  // Auto-cascade switch & row toggle (inert in read-only charts)
  syncCascadeSwitch(panel, props);
  const cascadeRow = panel.querySelector<HTMLElement>('[data-action="toggle-cascade"]');
  cascadeRow?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (propsRef.current.readOnly) return;
    propsRef.current.onAutoCascadeToggle();
  });

  // Baselines switch & row toggle
  const baselinesRow = panel.querySelector<HTMLElement>('[data-action="toggle-baselines"]');
  baselinesRow?.addEventListener("click", (e) => {
    e.stopPropagation();
    propsRef.current.onBaselinesToggle?.();
  });

  return panel;
}
