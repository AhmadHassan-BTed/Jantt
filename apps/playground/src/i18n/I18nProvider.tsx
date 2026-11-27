import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  LOCALES,
  detectLocale,
  formatLocaleDate,
  getMessages,
  isLocale,
  preloadLocale,
  setActiveLocale,
  storeLocale,
  translate,
  type Locale,
  type MessageKey,
  type MessageParams
} from "./index";

export interface I18nContextValue {
  /** Active interface language. */
  locale: Locale;
  /** Locales offered in Settings. */
  locales: typeof LOCALES;
  /** Switches language immediately and remembers it on this device. */
  setLocale: (locale: Locale) => void;
  /** Looks up `key` and fills `{placeholder}` values. Falls back to English. */
  t: (key: MessageKey, params?: MessageParams) => string;
  /** Locale-aware date formatting (UTC, so plan dates never shift by timezone). */
  formatDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
}

/** English-only fallback: keeps components usable in tests or outside the provider. */
const fallbackValue: I18nContextValue = {
  locale: "en",
  locales: LOCALES,
  setLocale: () => undefined,
  t: (key, params) => translate(getMessages("en"), key, params),
  formatDate: (value, options) => formatLocaleDate(value, "en", options)
};

const I18nContext = createContext<I18nContextValue>(fallbackValue);

export interface I18nProviderProps {
  children: React.ReactNode;
  /** Overrides detection; used by tests. */
  initialLocale?: Locale;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ children, initialLocale }) => {
  const [requestedLocale, setRequestedLocale] = useState(() => initialLocale ?? detectLocale());
  const [locale, setLocaleState] = useState(() =>
    getMessages(requestedLocale) === getMessages("en") ? "en" : requestedLocale
  );

  // Publish the new locale only after its messages are ready.
  useEffect(() => {
    if (requestedLocale === locale) return;
    let active = true;
    void preloadLocale(requestedLocale).then(() => {
      if (active) setLocaleState(requestedLocale);
    }).catch(() => {
      if (active) setRequestedLocale(locale);
    });
    return () => {
      active = false;
    };
  }, [locale, requestedLocale]);

  useLayoutEffect(() => {
    setActiveLocale(locale);
    document.documentElement.lang = locale;
    document.title = translate(getMessages(locale), "app.documentTitle");
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    storeLocale(next);
    setRequestedLocale(next);
  }, []);

  const t = useCallback(
    (key: MessageKey, params?: MessageParams) => translate(getMessages(locale), key, params),
    [locale]
  );

  const formatDate = useCallback(
    (value: string | Date, options?: Intl.DateTimeFormatOptions) => formatLocaleDate(value, locale, options),
    [locale]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, locales: LOCALES, setLocale, t, formatDate }),
    [locale, setLocale, t, formatDate]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
