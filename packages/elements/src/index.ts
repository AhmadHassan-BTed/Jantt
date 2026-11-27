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
  ViewportOptions,
  renderJantt,
  JanttInstance,
  themeManager,
  validate
} from "@jantt/core";

const TIME_SCALES: readonly string[] = ["day", "week", "month", "quarter", "year"];

/** Validation errors quoted in the jantt-error message for a rejected `data-src` plan. */
const MAX_REPORTED_ERRORS = 3;

/** Observed boolean attributes: present means true (unless "false"), absent means the default. */
const BOOLEAN_ATTRIBUTES = ["show-critical-path", "show-baselines", "auto-cascade", "read-only"] as const;

type BooleanAttribute = (typeof BOOLEAN_ATTRIBUTES)[number];

const warnedThemes = new Set<string>();

/**
 * Maps a `theme` attribute to a theme class. Accepts registered theme ids ("swiss-dark") and
 * class suffixes ("dark" for jantt-theme-dark). Unknown names are still applied as
 * `jantt-theme-<name>` for custom CSS themes, with a one-time warning.
 */
function resolveThemeClassName(theme: string): string {
  const byId = themeManager.getTheme(theme);
  if (byId) return byId.className;
  const className = `jantt-theme-${theme}`;
  if (!themeManager.getAllThemes().some((t) => t.className === className) && !warnedThemes.has(theme)) {
    warnedThemes.add(theme);
    const known = themeManager.getAllThemes().map((t) => t.className.replace(/^jantt-theme-/, ""));
    console.warn(`[<jantt-timeline>] Unknown theme "${theme}". Built-in themes: ${[...new Set(known)].join(", ")}.`);
  }
  return className;
}

/** SSR-safe base class: importing the module where HTMLElement does not exist must not throw. */
const ElementBase: typeof HTMLElement =
  typeof HTMLElement !== "undefined" ? HTMLElement : (class {} as unknown as typeof HTMLElement);

export class JanttTimelineElement extends ElementBase {
  public static readonly observedAttributes = [
    "data",
    "data-src",
    "scale",
    "theme",
    "locale",
    ...BOOLEAN_ATTRIBUTES
  ];

  private _data: JanttData | null = null;
  private _controller: JanttInstance | null = null;
  private _container: HTMLDivElement | null = null;
  /** In-flight `data-src` request; replaced (and aborted) by newer requests. */
  private _request: { url: string; abort: AbortController | null } | null = null;
  /** URL whose response is currently held in `_data`. */
  private _loadedSrc: string | null = null;
  /**
   * Plan the engine emitted most recently: setting it back as `data` needs no update. Cleared
   * whenever other data is set, so returning to it later (e.g. redo) is applied again.
   */
  private _lastEmitted: JanttData | null = null;

  constructor() {
    super();
  }

  public get data(): JanttData | null {
    return this._data;
  }

  public set data(val: JanttData | null) {
    const echo = val !== null && val === this._lastEmitted;
    this._data = val;
    if (echo) return;
    this._lastEmitted = null;
    this.applyChanges();
  }

  public get controller(): JanttInstance | null {
    return this._controller;
  }

  public get locale(): string | null {
    return this.getAttribute("locale");
  }

  public set locale(value: string | null) {
    if (value == null) this.removeAttribute("locale");
    else this.setAttribute("locale", value);
  }

  public connectedCallback(): void {
    this.upgradeProperty("data");
    this.upgradeProperty("locale");

    if (!this._container) {
      this._container = document.createElement("div");
      this._container.className = "jantt-timeline-container";
      this._container.style.width = "100%";
      this._container.style.height = "100%";
      // Override with the --jantt-min-height custom property (e.g. 0 in split panes).
      this._container.style.minHeight = "var(--jantt-min-height, 400px)";
      this.appendChild(this._container);
    }

    // The inline `data` attribute was already parsed by attributeChangedCallback, which runs for
    // every initial attribute before this callback; parsing it again would report errors twice.
    const dataSrc = this.getAttribute("data-src");
    if (dataSrc && dataSrc !== this._loadedSrc && this._request?.url !== dataSrc) {
      void this.loadFromSrc(dataSrc);
    }

    this.applyChanges();
  }

  public disconnectedCallback(): void {
    this.cancelRequest();
    if (this._controller) {
      this._controller.destroy();
      this._controller = null;
    }
  }

  public attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    switch (name) {
      case "data":
        if (newValue !== null) {
          if (this.parseDataAttribute(newValue)) this.applyChanges();
        } else if (!this.hasAttribute("data-src")) {
          this._data = null; // removing the attribute clears the chart
          this.applyChanges();
        }
        return;
      case "data-src":
        // A new value always needs a load; a detached element defers it to connectedCallback, so
        // it never fetches for nothing.
        this._loadedSrc = null;
        if (!newValue) this.cancelRequest();
        else if (this.isConnected) void this.loadFromSrc(newValue);
        return;
      case "scale":
        this.applyChanges({ viewport: { scale: this.readScale() } });
        return;
      case "locale":
        this.applyChanges({ locale: newValue ?? undefined });
        return;
      case "theme":
        this.applyChanges({ themeClassName: this.readThemeClassName() ?? "" });
        return;
      // A removed boolean attribute falls back to the plan's meta, then the engine default.
      case "show-critical-path":
        this.applyChanges({
          viewport: { showCriticalPath: this.readBoolean(name) ?? this._data?.meta?.showCriticalPath ?? false }
        });
        return;
      case "show-baselines":
        this.applyChanges({
          viewport: { showBaselines: this.readBoolean(name) ?? this._data?.meta?.showBaselines ?? true }
        });
        return;
      case "auto-cascade":
        this.applyChanges({ autoCascade: this.readBoolean(name) ?? this._data?.meta?.autoCascade ?? true });
        return;
      case "read-only":
        this.applyChanges({ readOnly: this.readBoolean(name) ?? false });
        return;
    }
  }

  /**
   * Loads plan data from a remote URL. A newer request (or disconnecting the element) aborts the
   * previous one, so a slow stale response can never replace newer data. The response must pass
   * `validate()`; an invalid plan is reported through `jantt-error` and the current chart is kept.
   */
  public async loadFromSrc(url: string): Promise<void> {
    this.cancelRequest();
    const abort = typeof AbortController !== "undefined" ? new AbortController() : null;
    const request = { url, abort };
    this._request = request;
    try {
      const resp = await fetch(url, abort ? { signal: abort.signal } : undefined);
      if (!resp.ok) {
        throw new Error(`HTTP error ${resp.status} fetching plan from ${url}`);
      }
      const json: unknown = await resp.json();
      if (this._request !== request) return;
      const { valid, errors } = validate(json);
      if (!valid) {
        const details = errors
          .slice(0, MAX_REPORTED_ERRORS)
          .map((e) => `${e.path}: ${e.message}`)
          .join("; ");
        const more = errors.length > MAX_REPORTED_ERRORS ? ` (+${errors.length - MAX_REPORTED_ERRORS} more)` : "";
        throw new Error(`Response from ${url} is not a valid Jantt plan. ${details}${more}`);
      }
      this._request = null;
      this._loadedSrc = url;
      this._data = json as JanttData;
      this._lastEmitted = null;
      this.applyChanges();
    } catch (err) {
      if (this._request !== request) return; // superseded or aborted: not an error
      this._request = null;
      this.fail(`Failed to load plan data from ${url}`, err);
    }
  }

  /**
   * Re-renders the timeline, re-applying every attribute.
   */
  public render(): void {
    if (this._controller && this._data) {
      try {
        this._controller.update(this._data, this.buildOptions());
      } catch (err) {
        this.fail("Error updating Jantt chart", err);
      }
    } else {
      this.applyChanges();
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

  /**
   * Brings the engine in line with the element: mounts once there is data and the element is
   * connected, otherwise forwards only `changes` so zoom, scroll and an open task panel survive.
   */
  private applyChanges(changes?: Partial<JanttOptions>): void {
    // Never mount on a detached element: its timers would never be cleaned up.
    if (!this._container || !this.isConnected) return;

    if (!this._data) {
      if (this._controller) {
        this._controller.destroy();
        this._controller = null;
      }
      return;
    }

    if (!this._controller) {
      this.mount();
      return;
    }

    try {
      this._controller.update(this._data, changes);
    } catch (err) {
      this.fail("Error updating Jantt chart", err);
    }
  }

  private mount(): void {
    if (!this._container || !this._data) return;
    try {
      this._controller = renderJantt(this._container, this._data, this.buildOptions());
    } catch (err) {
      this._controller = null;
      this.fail("Error mounting Jantt chart", err);
      return;
    }
    this.emit("jantt-ready", { controller: this._controller });
  }

  private buildOptions(): JanttOptions {
    const viewport: ViewportOptions = {};
    const scale = this.readScale();
    if (scale) viewport.scale = scale;
    const showCriticalPath = this.readBoolean("show-critical-path");
    if (showCriticalPath !== undefined) viewport.showCriticalPath = showCriticalPath;
    const showBaselines = this.readBoolean("show-baselines");
    if (showBaselines !== undefined) viewport.showBaselines = showBaselines;

    return {
      autoCascade: this.readBoolean("auto-cascade"),
      readOnly: this.readBoolean("read-only") ?? false,
      themeClassName: this.readThemeClassName(),
      locale: this.getAttribute("locale") ?? undefined,
      viewport,
      onTaskClick: (task: Task) => this.emit("jantt-task-click", { task }),
      onTaskAdd: (task: Task) => this.emit("jantt-task-add", { task }),
      onTaskDelete: (taskId: string) => this.emit("jantt-task-delete", { taskId }),
      onChange: (draft: JanttData) => {
        this._lastEmitted = draft;
        this.emit("jantt-plan-draft", { data: draft });
      },
      onCommit: (newData: JanttData) => {
        this._lastEmitted = newData;
        this._data = newData;
        this.emit("jantt-plan-change", { data: newData });
      },
      onError: (error: Error) => this.fail("Jantt chart error", error)
    };
  }

  /** Boolean attribute: present means true (any value except "false"), absent means the engine default. */
  private readBoolean(name: BooleanAttribute): boolean | undefined {
    const value = this.getAttribute(name);
    if (value === null) return undefined;
    return value.trim().toLowerCase() !== "false";
  }

  private readScale(): TimeScale | undefined {
    const scale = this.getAttribute("scale");
    if (!scale) return undefined;
    if (TIME_SCALES.includes(scale)) return scale as TimeScale;
    console.warn(`[<jantt-timeline>] Ignoring unknown scale "${scale}". Use one of: ${TIME_SCALES.join(", ")}.`);
    return undefined;
  }

  private readThemeClassName(): string | undefined {
    const theme = this.getAttribute("theme")?.trim();
    return theme ? resolveThemeClassName(theme) : undefined;
  }

  /** Returns true when the attribute held valid JSON (now in `_data`). */
  private parseDataAttribute(value: string): boolean {
    if (!value) return false;
    try {
      this._data = JSON.parse(value);
      this._lastEmitted = null;
      return true;
    } catch (err) {
      this.fail("Failed to parse inline JSON data attribute", err);
      return false;
    }
  }

  /**
   * A property set before the element was defined shadows the class accessor; re-assign it
   * through the setter (the standard custom-element upgrade pattern).
   */
  private upgradeProperty(prop: "data" | "locale"): void {
    if (Object.prototype.hasOwnProperty.call(this, prop)) {
      const value = (this as unknown as Record<string, unknown>)[prop];
      delete (this as unknown as Record<string, unknown>)[prop];
      if (prop === "data") this._data = (value as JanttData | null) ?? null;
      else this.locale = typeof value === "string" ? value : null;
    }
  }

  private cancelRequest(): void {
    this._request?.abort?.abort();
    this._request = null;
  }

  private emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
  }

  private fail(message: string, err: unknown): void {
    console.error(`[<jantt-timeline>] ${message}:`, err);
    this.emit("jantt-error", { error: err });
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
