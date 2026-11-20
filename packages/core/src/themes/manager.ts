import { ThemeDefinition } from "./types";
import { swissDarkTheme } from "./swiss-dark";
import { swissLightTheme } from "./swiss-light";
import { cyberEmeraldTheme } from "./cyber-emerald";
import { midnightRoseTheme } from "./midnight-rose";
import { sunsetCrimsonTheme } from "./sunset-crimson";
import { nordicFrostTheme } from "./nordic-frost";
import { beenieTheme } from "./beenie";

/** CSS custom properties last written to each element by {@link applyThemeVariables}. */
const appliedThemeVars = new WeakMap<HTMLElement, string[]>();

/**
 * Writes a theme's CSS custom properties inline on `el` (keys may omit the `--jantt-` prefix) and
 * removes any property a previous call set that the new map lacks, so switching themes never
 * leaves stale tokens behind (e.g. a 14px bar radius surviving a switch away from Pink Beenie).
 * Passing no map clears everything previously applied.
 */
export function applyThemeVariables(el: HTMLElement, vars?: Record<string, string> | null): void {
  const next: string[] = [];
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      const varName = k.startsWith("--") ? k : `--jantt-${k}`;
      el.style.setProperty(varName, String(v));
      next.push(varName);
    });
  }
  const previous = appliedThemeVars.get(el);
  if (previous) {
    const keep = new Set(next);
    previous.forEach((name) => {
      if (!keep.has(name)) el.style.removeProperty(name);
    });
  }
  appliedThemeVars.set(el, next);
}

/**
 * Enterprise Theme Manager for Jantt.
 * Manages theme registrations, style token routing, and whole-software theme application.
 */
export class ThemeManager {
  private themes: Map<string, ThemeDefinition> = new Map();
  private currentThemeId: string = "swiss-dark";

  constructor() {
    // Register standard out-of-the-box themes
    this.registerTheme(swissDarkTheme);
    this.registerTheme(swissLightTheme);
    this.registerTheme(cyberEmeraldTheme);
    this.registerTheme(midnightRoseTheme);
    this.registerTheme(sunsetCrimsonTheme);
    this.registerTheme(nordicFrostTheme);
    this.registerTheme(beenieTheme);
  }

  /**
   * Register a new theme definition or overwrite an existing one.
   */
  public registerTheme(theme: ThemeDefinition): void {
    if (!theme || !theme.id) {
      throw new Error("ThemeDefinition must contain a unique 'id'.");
    }
    this.themes.set(theme.id, { ...theme });
  }

  /**
   * Retrieve a theme definition by its ID.
   */
  public getTheme(id: string): ThemeDefinition | undefined {
    if (id === "noir") return this.themes.get("noir") || this.themes.get("swiss-dark");
    if (id === "swiss-dark") return this.themes.get("swiss-dark") || this.themes.get("noir");
    return this.themes.get(id);
  }

  /**
   * Finds the registered theme whose `className` appears in `classNames`
   * (a single class or a space-separated list, e.g. a chart's `themeClassName`).
   */
  public getThemeByClassName(classNames: string | undefined | null): ThemeDefinition | undefined {
    if (!classNames) return undefined;
    const wanted = new Set(classNames.split(/\s+/).filter(Boolean));
    for (const theme of this.themes.values()) {
      if (theme.className && wanted.has(theme.className)) return theme;
    }
    return undefined;
  }

  /**
   * Get all registered theme definitions.
   */
  public getAllThemes(): ThemeDefinition[] {
    return Array.from(this.themes.values());
  }

  /**
   * Get list of all registered theme IDs.
   */
  public getThemeIds(): string[] {
    return Array.from(this.themes.keys());
  }

  /**
   * Get currently active theme ID.
   */
  public getCurrentThemeId(): string {
    return this.currentThemeId;
  }

  /**
   * Applies the specified theme to a DOM element, container, or document root.
   * Seamlessly injects all CSS variables and updates theme class names.
   *
   * @param target - DOM element or CSS selector string (e.g. document.body, "#app", ".jantt-container")
   * @param themeIdOrDef - Theme identifier string or ThemeDefinition object
   * @returns The applied ThemeDefinition
   */
  public applyTheme(
    target: HTMLElement | Document | string,
    themeIdOrDef: string | ThemeDefinition
  ): ThemeDefinition {
    let theme: ThemeDefinition | undefined;

    if (typeof themeIdOrDef === "string") {
      theme = this.getTheme(themeIdOrDef);
      if (!theme) {
        console.warn(`[Jantt ThemeManager] Theme '${themeIdOrDef}' not found. Falling back to 'swiss-dark'.`);
        theme = this.getTheme("swiss-dark") || swissDarkTheme;
      }
    } else {
      theme = themeIdOrDef;
      this.registerTheme(theme);
    }

    let targetEl: HTMLElement | null = null;
    if (typeof target === "string") {
      targetEl = document.querySelector<HTMLElement>(target);
    } else if (target instanceof Document) {
      targetEl = target.documentElement;
    } else if (target instanceof HTMLElement) {
      targetEl = target;
    }

    if (targetEl) {
      // 1. Remove all known theme classes
      for (const t of this.themes.values()) {
        if (t.className) {
          targetEl.classList.remove(t.className);
        }
      }

      // 2. Add current theme class
      if (theme.className) {
        targetEl.classList.add(theme.className);
      }

      // 3. Inject CSS custom properties (dropping tokens left over from the previous theme)
      applyThemeVariables(targetEl, theme.vars);

      // 4. Update data-theme attribute
      targetEl.setAttribute("data-theme", theme.id);
    }

    this.currentThemeId = theme.id;
    return theme;
  }

  /**
   * Helper to derive a customized theme extending an existing base theme.
   */
  public createCustomTheme(
    baseId: string,
    overrides: Partial<ThemeDefinition> & { id: string; label: string }
  ): ThemeDefinition {
    const base = this.getTheme(baseId) || swissDarkTheme;
    const custom: ThemeDefinition = {
      ...base,
      ...overrides,
      vars: {
        ...base.vars,
        ...(overrides.vars || {})
      }
    };
    this.registerTheme(custom);
    return custom;
  }
}

/** Global default ThemeManager instance */
export const themeManager = new ThemeManager();

/** Standalone convenience helper functions */
export const getTheme = (id: string) => themeManager.getTheme(id);
export const getAllThemes = () => themeManager.getAllThemes();
export const applyTheme = (target: HTMLElement | Document | string, themeIdOrDef: string | ThemeDefinition) =>
  themeManager.applyTheme(target, themeIdOrDef);
export const registerTheme = (theme: ThemeDefinition) => themeManager.registerTheme(theme);
