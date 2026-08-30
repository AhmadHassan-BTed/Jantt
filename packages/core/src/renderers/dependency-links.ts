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

/**
 * Renders the SVG overlay containing 90-degree orthogonal dependency lines and arrow markers.
 */
export function renderDependencyLinks(props: DependencyLinksProps): DependencyLinksResult {
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

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = `
    <marker id="jantt-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 1 2 L 8 5 L 1 8 z" fill="var(--jantt-dep-line)" />
    </marker>
    <marker id="jantt-arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 1 2 L 8 5 L 1 8 z" fill="var(--jantt-dep-line-active)" />
    </marker>
    <marker id="jantt-arrow-critical" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
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
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", dep.path);
    const isCrit = props.showCritical && dep.isCritical;
    path.setAttribute("class", `jantt-dep-path ${isCrit ? "is-critical" : ""}`);
    path.setAttribute("marker-end", isCrit ? "url(#jantt-arrow-critical)" : "url(#jantt-arrow)");
    path.setAttribute("data-from", dep.fromTaskId);
    path.setAttribute("data-to", dep.toTaskId);
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
    depPathElements.set(`${dep.fromTaskId}->${dep.toTaskId}`, path);
  });

  return { svg, previewWireSvg, depPathElements };
}
