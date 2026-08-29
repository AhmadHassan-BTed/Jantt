import { JanttMeta, TimeScale, LinkRoutingStyle } from "../types";

export interface ToolbarProps {
  meta?: JanttMeta;
  taskCount: number;
  currentScale: TimeScale;
  currentRouting: LinkRoutingStyle;
  showCritical: boolean;
  criticalCount: number;
  searchQuery: string;
  onScaleChange: (scale: TimeScale) => void;
  onRoutingChange: (routing: LinkRoutingStyle) => void;
  onCriticalToggle: () => void;
  onSearchChange: (query: string) => void;
}

/**
 * Renders the top toolbar containing title, badge, zoom scale switcher, link routing switcher,
 * critical path toggle, and search box.
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
  scaleGroup.title = "Timeline Zoom Scale";
  (["day", "week", "month", "quarter", "year"] as TimeScale[]).forEach((s) => {
    const btn = document.createElement("button");
    btn.className = `jantt-scale-btn ${s === props.currentScale ? "is-active" : ""}`;
    btn.textContent = s;
    btn.addEventListener("click", () => props.onScaleChange(s));
    scaleGroup.appendChild(btn);
  });
  controls.appendChild(scaleGroup);

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
