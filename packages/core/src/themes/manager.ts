import { ThemeDefinition } from "./types";
import { swissDarkTheme } from "./swiss-dark";
import { swissLightTheme } from "./swiss-light";
import { cyberEmeraldTheme } from "./cyber-emerald";
import { midnightRoseTheme } from "./midnight-rose";
import { sunsetCrimsonTheme } from "./sunset-crimson";
import { nordicFrostTheme } from "./nordic-frost";

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
    return this.themes.get(id);
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

      // 3. Inject CSS custom properties
      if (theme.vars) {
        Object.entries(theme.vars).forEach(([k, v]) => {
          const varName = k.startsWith("--") ? k : `--jantt-${k}`;
          targetEl!.style.setProperty(varName, v);
        });
      }

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
