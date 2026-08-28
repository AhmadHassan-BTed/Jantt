import { JanttMeta, TimeScale } from "../types";

export interface ToolbarProps {
  meta?: JanttMeta;
  taskCount: number;
  currentScale: TimeScale;
  showCritical: boolean;
  criticalCount: number;
  searchQuery: string;
  onScaleChange: (scale: TimeScale) => void;
  onCriticalToggle: () => void;
  onSearchChange: (query: string) => void;
}

/**
 * Renders the top toolbar containing title, badge, zoom scale switcher, critical path toggle, and search box.
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

  // Scale Segmented Control
  const scaleGroup = document.createElement("div");
  scaleGroup.className = "jantt-scale-group";
  (["day", "week", "month", "quarter", "year"] as TimeScale[]).forEach((s) => {
    const btn = document.createElement("button");
    btn.className = `jantt-scale-btn ${s === props.currentScale ? "is-active" : ""}`;
    btn.textContent = s;
    btn.addEventListener("click", () => props.onScaleChange(s));
    scaleGroup.appendChild(btn);
  });
  controls.appendChild(scaleGroup);

  // Critical Path Button
  const critBtn = document.createElement("button");
  critBtn.className = `jantt-critical-btn ${props.showCritical ? "is-active" : ""}`;
  critBtn.innerHTML = `<span>⚡</span><span>Critical Path (${props.criticalCount})</span>`;
  critBtn.addEventListener("click", () => props.onCriticalToggle());
  controls.appendChild(critBtn);

  // Search Box
  const searchBox = document.createElement("div");
  searchBox.className = "jantt-search-box";
  searchBox.innerHTML = `
    <span style="font-size: 11px; opacity: 0.6;">🔍</span>
    <input type="text" class="jantt-search-input" placeholder="Search tasks..." value="${escapeHtml(props.searchQuery)}" />
  `;
  const sInput = searchBox.querySelector<HTMLInputElement>(".jantt-search-input")!;
  sInput.addEventListener("input", (e) => {
    props.onSearchChange((e.target as HTMLInputElement).value);
  });
  controls.appendChild(searchBox);

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
