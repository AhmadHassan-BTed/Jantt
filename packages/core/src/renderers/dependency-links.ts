import { DependencyLine } from "../types";

export interface DependencyLinksProps {
  dependencies: DependencyLine[];
  canvasWidth: number;
  canvasHeight: number;
  showCritical: boolean;
  onLinkDelete?: (fromTaskId: string, toTaskId: string) => void;
}

export interface DependencyLinksResult {
  svg: SVGSVGElement;
  previewWireSvg: SVGPathElement;
  depPathElements: Map<string, SVGPathElement>;
}

let linkInstanceCounter = 0;

/**
 * Renders the SVG overlay containing 90-degree orthogonal dependency lines and arrow markers.
 */
export function renderDependencyLinks(props: DependencyLinksProps): DependencyLinksResult {
  const instanceId = ++linkInstanceCounter;
  const arrowId = `jantt-arrow-${instanceId}`;
  const arrowActiveId = `jantt-arrow-active-${instanceId}`;
  const arrowCriticalId = `jantt-arrow-critical-${instanceId}`;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
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

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = `
    <marker id="${arrowId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 1 2 L 8 5 L 1 8 z" fill="var(--jantt-dep-line)" />
    </marker>
    <marker id="${arrowActiveId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 1 2 L 8 5 L 1 8 z" fill="var(--jantt-dep-line-active)" />
    </marker>
    <marker id="${arrowCriticalId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 1 2 L 8 5 L 1 8 z" fill="var(--jantt-critical)" />
    </marker>
  `;
  svg.appendChild(defs);

  // Live interactive preview wire
  const previewWireSvg = document.createElementNS("http://www.w3.org/2000/svg", "path");
  previewWireSvg.setAttribute("class", "jantt-link-preview-line");
  svg.appendChild(previewWireSvg);

  const depPathElements = new Map<string, SVGPathElement>();

  props.dependencies.forEach((dep) => {
    const isCrit = props.showCritical && dep.isCritical;
    const normalMarker = isCrit ? `url(#${arrowCriticalId})` : `url(#${arrowId})`;
    const activeMarker = `url(#${arrowActiveId})`;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", dep.path);
    path.setAttribute("class", `jantt-dep-path ${isCrit ? "is-critical" : ""}`);
    path.setAttribute("marker-end", normalMarker);
    path.setAttribute("data-from", dep.fromTaskId);
    path.setAttribute("data-to", dep.toTaskId);
    path.dataset.normalMarker = normalMarker;
    path.dataset.activeMarker = activeMarker;
    path.setAttribute(
      "title",
      `Dependency: ${dep.fromTaskId} → ${dep.toTaskId} (Click to remove link)`
    );

    // Click to delete dependency link
    path.addEventListener("click", (e) => {
      e.stopPropagation();
      props.onLinkDelete?.(dep.fromTaskId, dep.toTaskId);
    });

    svg.appendChild(path);

    // Hit-testing path overlay with 12px stroke for effortless clicking
    const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hitPath.setAttribute("d", dep.path);
    hitPath.setAttribute("stroke", "transparent");
    hitPath.setAttribute("stroke-width", "12");
    hitPath.setAttribute("fill", "none");
    hitPath.style.cursor = "pointer";
    hitPath.setAttribute(
      "title",
      `Dependency: ${dep.fromTaskId} → ${dep.toTaskId} (Click to remove link)`
    );
    hitPath.addEventListener("click", (e) => {
      e.stopPropagation();
      props.onLinkDelete?.(dep.fromTaskId, dep.toTaskId);
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

    depPathElements.set(`${dep.fromTaskId}->${dep.toTaskId}`, path);
  });

  return { svg, previewWireSvg, depPathElements };
}
