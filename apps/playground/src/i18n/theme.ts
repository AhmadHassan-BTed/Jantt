import type { ThemeDefinition } from "@jantt/core";
import type { MessageKey } from "./index";

const DESCRIPTION_KEYS: Partial<Record<string, MessageKey>> = {
  "swiss-dark": "appearance.themeDescription.swiss-dark",
  "swiss-light": "appearance.themeDescription.swiss-light",
  "sunset-crimson": "appearance.themeDescription.sunset-crimson",
  "beenie": "appearance.themeDescription.beenie",
  "nordic-frost": "appearance.themeDescription.nordic-frost",
  "midnight-rose": "appearance.themeDescription.midnight-rose",
  "cyber-emerald": "appearance.themeDescription.cyber-emerald"
};

export function themeDescription(theme: ThemeDefinition, t: (key: MessageKey) => string): string {
  const key = DESCRIPTION_KEYS[theme.id];
  return key ? t(key) : theme.description;
}
