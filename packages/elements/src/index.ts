/**
 * Jantt Web Component / Custom Elements Adapter
 *
 * Exposes <jantt-timeline> for universal native browser, PHP, Rails,
 * Django, WordPress, and vanilla JavaScript embedding.
 */

import {
  JanttData,
  JanttOptions,
  TimeScale,
  Task,
  renderJantt,
  JanttInstance
} from "@jantt/core";

export class JanttTimelineElement extends HTMLElement {
  public static readonly observedAttributes = [
    "data",
    "data-src",
    "scale",
    "theme",
    "show-critical-path",
    "show-baselines",
    "auto-cascade"
  ];

  private _data: JanttData | null = null;
  private _controller: JanttInstance | null = null;
  private _container: HTMLDivElement | null = null;

  constructor() {
    super();
  }

  public get data(): JanttData | null {
    return this._data;
  }

  public set data(val: JanttData | null) {
    this._data = val;
    this.render();
  }

  public get controller(): JanttInstance | null {
    return this._controller;
  }

  public connectedCallback(): void {
    if (!this._container) {
      this._container = document.createElement("div");
      this._container.className = "jantt-timeline-container";
      this._container.style.width = "100%";
      this._container.style.height = "100%";
      this._container.style.minHeight = "400px";
      this.appendChild(this._container);
    }

    const dataSrc = this.getAttribute("data-src");
    if (dataSrc) {
      this.loadFromSrc(dataSrc);
      return;
    }

    const dataAttr = this.getAttribute("data");
    if (dataAttr && !this._data) {
      try {
        this._data = JSON.parse(dataAttr);
      } catch (err) {
        console.error("[<jantt-timeline>] Failed to parse inline JSON data attribute:", err);
      }
    }

    if (this._data) {
      this.render();
    }
  }

  public disconnectedCallback(): void {
    if (this._controller && typeof this._controller.destroy === "function") {
      this._controller.destroy();
      this._controller = null;
    }
  }

  public attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    if (name === "data" && newValue) {
      try {
        this._data = JSON.parse(newValue);
        this.render();
      } catch (err) {
        console.error("[<jantt-timeline>] Failed to parse updated JSON data attribute:", err);
      }
    } else if (name === "data-src" && newValue) {
      this.loadFromSrc(newValue);
    } else if (this._data) {
      this.render();
    }
  }

  /**
   * Loads plan data from a remote URL.
   */
  public async loadFromSrc(url: string): Promise<void> {
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`HTTP error ${resp.status} fetching plan from ${url}`);
      }
      const json = await resp.json();
      this._data = json;
      this.render();
    } catch (err) {
      console.error(`[<jantt-timeline>] Failed to load plan data from ${url}:`, err);
      this.dispatchEvent(new CustomEvent("jantt-error", { detail: { error: err } }));
    }
  }

  /**
   * Re-renders the timeline with the current configuration.
   */
  public render(): void {
    if (!this._container || !this._data) return;

    if (this._controller && typeof this._controller.destroy === "function") {
      this._controller.destroy();
      this._controller = null;
    }

    this._container.innerHTML = "";

    const scale = (this.getAttribute("scale") as TimeScale) || undefined;
    const theme = this.getAttribute("theme") || undefined;
    const autoCascade = this.getAttribute("auto-cascade") !== "false";

    const options: JanttOptions = {
      autoCascade,
      themeClassName: theme ? `jantt-theme-${theme}` : undefined,
      viewport: scale ? { scale } : undefined,
      onTaskClick: (task: Task) => {
        this.dispatchEvent(
          new CustomEvent("jantt-task-click", {
            bubbles: true,
            composed: true,
            detail: { task }
          })
        );
      },
      onCommit: (newData: JanttData) => {
        this._data = newData;
        this.dispatchEvent(
          new CustomEvent("jantt-plan-change", {
            bubbles: true,
            composed: true,
            detail: { data: newData }
          })
        );
      }
    };

    try {
      this._controller = renderJantt(this._container, this._data, options);
      this.dispatchEvent(
        new CustomEvent("jantt-ready", {
          bubbles: true,
          composed: true,
          detail: { controller: this._controller }
        })
      );
    } catch (err) {
      console.error("[<jantt-timeline>] Error mounting Jantt chart:", err);
      this.dispatchEvent(new CustomEvent("jantt-error", { detail: { error: err } }));
    }
  }

  /**
   * Sets new plan data programmatically.
   */
  public setData(data: JanttData): void {
    this.data = data;
  }

  /**
   * Returns the current live plan data.
   */
  public getData(): JanttData | null {
    return this._data;
  }

  /**
   * Forces a refresh / redraw.
   */
  public refresh(): void {
    this.render();
  }
}

// Helper to register custom element
export function registerJanttElement(tagName = "jantt-timeline"): void {
  const ce = typeof customElements !== "undefined"
    ? customElements
    : typeof window !== "undefined"
    ? window.customElements
    : undefined;

  if (ce && !ce.get(tagName)) {
    ce.define(tagName, JanttTimelineElement);
  }
}

// Automatically register custom element in browser contexts
registerJanttElement();

export default JanttTimelineElement;
