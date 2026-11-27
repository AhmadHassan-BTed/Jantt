import en from "./locales/en.json";

/** Locales offered in Settings. */
export const LOCALES = [
  { id: "en", nativeLabel: "English" },
  { id: "zh-CN", nativeLabel: "简体中文" }
] as const;

export type Locale = (typeof LOCALES)[number]["id"];

/** Every message key is derived from the English dictionary, so missing keys fail at compile time. */
export type MessageKey = keyof typeof en;
export type MessageParams = Record<string, string | number>;
export type Messages = Record<string, string>;

const enMessages = en as Messages;
const messageCache = new Map<Locale, Messages>([["en", enMessages]]);

export const LOCALE_STORAGE_KEY = "jantt_ui_locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.some((locale) => locale.id === value);
}

/** The language of the browser, mapped onto the locales we ship. */
export function browserLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of tags) {
    const normalized = String(tag || "").toLowerCase();
    if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
    if (normalized.startsWith("en")) return "en";
  }
  return "en";
}

export function getStoredLocale(): Locale | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private mode / storage disabled: the choice still applies for this session.
  }
}

/**
 * Saved preference first, then the browser language, then English. The preference is personal:
 * it lives on this device and never travels with a shared plan.
 */
export function detectLocale(): Locale {
  return getStoredLocale() ?? browserLocale();
}

/** Translated messages for a locale, or English until its chunk has loaded. */
export function getMessages(locale: Locale): Messages {
  return messageCache.get(locale) ?? enMessages;
}

/**
 * Locale the app is currently showing. React components use `useI18n`; services, hooks and other
 * non-component modules call `tGlobal` so their messages follow the same choice.
 */
let activeLocale: Locale | null = null;

export function setActiveLocale(locale: Locale): void {
  activeLocale = locale;
}

export function getActiveLocale(): Locale {
  return activeLocale ?? detectLocale();
}

/** Translation for non-React modules, resolved against the active (or detected) locale. */
export function tGlobal(key: MessageKey, params?: MessageParams): string {
  return translate(getMessages(getActiveLocale()), key, params);
}

/** Loads a locale once and caches it. English is always available synchronously. */
export async function preloadLocale(locale: Locale): Promise<Messages> {
  const cached = messageCache.get(locale);
  if (cached) return cached;
  if (locale !== "zh-CN") return enMessages;
  const { default: messages } = await import("./locales/zh-CN.json");
  messageCache.set(locale, messages);
  return messages;
}

/** Warms the saved/browser locale before the first render so the app never flashes another language. */
export async function bootstrapI18n(): Promise<void> {
  try {
    await preloadLocale(detectLocale());
  } catch {
    // A failed chunk keeps the English fallback; the app still starts.
  }
}

/**
 * Resolves `key` in `messages`, falling back to English and finally to the key itself.
 * `{name}` placeholders are replaced from `params`; unknown placeholders stay untouched.
 */
export function translate(messages: Messages, key: MessageKey, params?: MessageParams): string {
  const template = messages[key] ?? enMessages[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = Object.prototype.hasOwnProperty.call(params, name) ? params[name] : undefined;
    return value === undefined ? match : String(value);
  });
}

/** Locale-aware date formatting; invalid input is returned unchanged. */
export function formatLocaleDate(
  value: string | Date,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" }
): string {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "";
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options }).format(date);
}
