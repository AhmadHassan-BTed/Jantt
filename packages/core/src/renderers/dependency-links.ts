import { DependencyLine } from "../types";

export interface DependencyLinksProps {
  dependencies: DependencyLine[];
  canvasWidth: number;
  canvasHeight: number;
  showCritical: boolean;
  /**
   * Called after the user confirms removing a link. When omitted (read-only charts) links are
   * purely visual: no hit area, no pointer cursor and no removal affordance.
   */
  onLinkDelete?: (fromTaskId: string, toTaskId: string) => void;
  /** Display names used in link tooltips/accessible names (falls back to task IDs). */
  taskLabels?: Map<string, string>;
}

export interface DependencyLinksResult {
  svg: SVGSVGElement;
  previewWireSvg: SVGPathElement;
  depPathElements: Map<string, SVGPathElement>;
}

const SVG_NS = "http://www.w3.org/2000/svg";

let linkInstanceCounter = 0;

/**
 * Shows a small "Remove link" confirmation chip at the click point inside `host` (the canvas).
 * It is dismissed by Escape, any pointer press outside it, or the next re-render of the canvas.
 */
function showRemoveLinkChip(host: HTMLElement, e: MouseEvent, description: string, onConfirm: () => void): void {
  host.querySelector(".jantt-link-remove-chip")?.remove();

  const rect = host.getBoundingClientRect();
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "jantt-link-remove-chip";
  chip.title = `Remove dependency: ${description}`;
  chip.setAttribute("aria-label", `Remove dependency: ${description}`);
  chip.innerHTML = `
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
    <span>Remove link</span>
  `;
  chip.style.left = `${e.clientX - rect.left}px`;
  chip.style.top = `${e.clientY - rect.top}px`;
  // Open below the click point when there is no room above it (under the sticky timeline header)
  const header = host.parentElement?.querySelector<HTMLElement>(".jantt-timeline-header");
  const roomAbove = e.clientY - (header ? header.getBoundingClientRect().bottom : rect.top);
  chip.classList.toggle("is-below", roomAbove < 44);

  const dismiss = () => {
    chip.remove();
    document.removeEventListener("pointerdown", onOutsidePointer, true);
    document.removeEventListener("keydown", onKey, true);
  };
  const onOutsidePointer = (ev: PointerEvent) => {
    if (!chip.contains(ev.target as Node)) dismiss();
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") dismiss();
  };

  // Keep the canvas from starting a pan/marquee underneath the chip.
  chip.addEventListener("pointerdown", (ev) => ev.stopPropagation());
  chip.addEventListener("click", (ev) => {
    ev.stopPropagation();
    dismiss();
    onConfirm();
  });

  host.appendChild(chip);
  document.addEventListener("pointerdown", onOutsidePointer, true);
  document.addEventListener("keydown", onKey, true);
  chip.focus({ preventScroll: true });
}

function createArrowMarker(id: string, fill: string): SVGMarkerElement {
  const marker = document.createElementNS(SVG_NS, "marker");
  const attrs: Record<string, string> = {
    id,
    viewBox: "0 0 10 10",
    refX: "8",
    refY: "5",
    markerWidth: "6",
    markerHeight: "6",
    orient: "auto-start-reverse"
  };
  Object.entries(attrs).forEach(([name, value]) => marker.setAttribute(name, value));
  const head = document.createElementNS(SVG_NS, "path");
  head.setAttribute("d", "M 1 2 L 8 5 L 1 8 z");
  head.setAttribute("fill", fill);
  marker.appendChild(head);
  return marker;
}

/**
 * Renders the SVG overlay containing 90-degree orthogonal dependency lines and arrow markers.
 * Critical links are appended last so they paint above regular links (SVG has no z-index).
 */
export function renderDependencyLinks(props: DependencyLinksProps): DependencyLinksResult {
  const instanceId = ++linkInstanceCounter;
  const arrowId = `jantt-arrow-${instanceId}`;
  const arrowActiveId = `jantt-arrow-active-${instanceId}`;
  const arrowCriticalId = `jantt-arrow-critical-${instanceId}`;
  const editable = typeof props.onLinkDelete === "function";

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "jantt-svg-overlay");
  svg.style.position = "absolute";
  svg.style.top = "0";
  svg.style.left = "0";
  svg.style.width = `${props.canvasWidth}px`;
  svg.style.height = `${props.canvasHeight}px`;
  svg.setAttribute("width", String(props.canvasWidth));
  svg.setAttribute("height", String(props.canvasHeight));
  svg.setAttribute("viewBox", `0 0 ${props.canvasWidth} ${props.canvasHeight}`);
  svg.dataset.arrowId = arrowId;
  svg.dataset.arrowActiveId = arrowActiveId;
  svg.dataset.arrowCriticalId = arrowCriticalId;

  const defs = document.createElementNS(SVG_NS, "defs");
  defs.append(
    createArrowMarker(arrowId, "var(--jantt-dep-line)"),
    createArrowMarker(arrowActiveId, "var(--jantt-dep-line-active)"),
    createArrowMarker(arrowCriticalId, "var(--jantt-critical)")
  );
  svg.appendChild(defs);

  // Live interactive preview wire
  const previewWireSvg = document.createElementNS(SVG_NS, "path");
  previewWireSvg.setAttribute("class", "jantt-link-preview-line");
  svg.appendChild(previewWireSvg);

  const depPathElements = new Map<string, SVGPathElement>();
  const labelOf = (id: string) => props.taskLabels?.get(id) || id;

  const renderLink = (dep: DependencyLine, isCrit: boolean) => {
    const normalMarker = isCrit ? `url(#${arrowCriticalId})` : `url(#${arrowId})`;
    const activeMarker = `url(#${arrowActiveId})`;
    const typeSuffix = dep.type && dep.type !== "FS" ? ` (${dep.type})` : "";
    const description = `${labelOf(dep.fromTaskId)} → ${labelOf(dep.toTaskId)}${typeSuffix}`;

    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", dep.path);
    path.setAttribute("class", `jantt-dep-path ${isCrit ? "is-critical" : ""}`.trim());
    path.setAttribute("marker-end", normalMarker);
    path.setAttribute("data-from", dep.fromTaskId);
    path.setAttribute("data-to", dep.toTaskId);
    path.dataset.normalMarker = normalMarker;
    path.dataset.activeMarker = activeMarker;
    svg.appendChild(path);
    depPathElements.set(`${dep.fromTaskId}->${dep.toTaskId}`, path);

    if (!editable) return;

    // Wide transparent stroke on top of the visible wire for comfortable hovering/clicking
    const hitPath = document.createElementNS(SVG_NS, "path");
    hitPath.setAttribute("d", dep.path);
    hitPath.setAttribute("class", "jantt-dep-hit");
    hitPath.setAttribute("data-from", dep.fromTaskId);
    hitPath.setAttribute("data-to", dep.toTaskId);
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = `Dependency: ${description} (click to remove)`;
    hitPath.appendChild(title);

    hitPath.addEventListener("pointerdown", (e) => {
      // A link press is not a canvas pan/marquee gesture
      e.stopPropagation();
    });
    hitPath.addEventListener("click", (e) => {
      e.stopPropagation();
      const host = svg.parentElement;
      if (!host) return;
      showRemoveLinkChip(host, e, description, () => props.onLinkDelete?.(dep.fromTaskId, dep.toTaskId));
    });
    hitPath.addEventListener("mouseenter", () => {
      path.classList.add("is-active");
      path.setAttribute("marker-end", activeMarker);
    });
    hitPath.addEventListener("mouseleave", () => {
      path.classList.remove("is-active");
      path.setAttribute("marker-end", normalMarker);
    });
    svg.appendChild(hitPath);
  };

  const critical: DependencyLine[] = [];
  props.dependencies.forEach((dep) => {
    if (props.showCritical && dep.isCritical) {
      critical.push(dep);
    } else {
      renderLink(dep, false);
    }
  });
  critical.forEach((dep) => renderLink(dep, true));

  return { svg, previewWireSvg, depPathElements };
}
