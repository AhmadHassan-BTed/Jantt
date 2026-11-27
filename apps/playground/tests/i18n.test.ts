// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import en from "../src/i18n/locales/en.json";
import zhCN from "../src/i18n/locales/zh-CN.json";
import {
  LOCALE_STORAGE_KEY,
  browserLocale,
  detectLocale,
  formatLocaleDate,
  getMessages,
  getStoredLocale,
  isLocale,
  preloadLocale,
  storeLocale,
  translate,
  type MessageKey
} from "../src/i18n";

afterEach(() => {
  localStorage.clear();
});

describe("dictionaries", () => {
  it("keeps the Chinese dictionary on the same keys as English", () => {
    const missing = Object.keys(en).filter((key) => !(key in zhCN));
    const extra = Object.keys(zhCN).filter((key) => !(key in en));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it("keeps the same interpolation placeholders across languages", () => {
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");
    const mismatches = (Object.keys(en) as MessageKey[]).filter(
      (key) => placeholders(zhCN[key] ?? "") !== placeholders(en[key])
    );
    expect(mismatches).toEqual([]);
  });
});

describe("translate", () => {
  it("fills placeholders and keeps word order from the locale", () => {
    expect(translate(en, "toolbar.taskCount", { count: 3 })).toBe("3 tasks");
    expect(translate(zhCN, "toolbar.taskCount", { count: 3 })).toBe("3 个任务");
  });

  it("falls back to English for a missing translation", () => {
    expect(translate({}, "toolbar.addTask")).toBe("Add Task");
  });

  it("returns the key when neither dictionary has it", () => {
    expect(translate({}, "nope.missing" as MessageKey)).toBe("nope.missing");
  });

  it("leaves a placeholder untouched when its value is missing", () => {
    expect(translate(en, "toolbar.taskCount")).toBe("{count} tasks");
  });
});

describe("locale preference", () => {
  it("recognises only shipped locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("zh-CN")).toBe(true);
    expect(isLocale("zh-TW")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it("persists the choice per device and restores it", () => {
    storeLocale("zh-CN");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("zh-CN");
    expect(getStoredLocale()).toBe("zh-CN");
    expect(detectLocale()).toBe("zh-CN");
  });

  it("ignores a corrupted stored value", () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "klingon");
    expect(getStoredLocale()).toBeNull();
    expect(detectLocale()).toBe(browserLocale());
  });
});

describe("loading", () => {
  it("loads and caches Chinese on demand", async () => {
    const messages = await preloadLocale("zh-CN");
    expect(messages["toolbar.addTask"]).toBe("新建任务");
    expect(getMessages("zh-CN")).toBe(messages);
    expect(await preloadLocale("zh-CN")).toBe(messages);
  });

  it("keeps English synchronous", async () => {
    expect(getMessages("en")["toolbar.addTask"]).toBe("Add Task");
    expect(await preloadLocale("en")).toBe(getMessages("en"));
  });
});

describe("formatLocaleDate", () => {
  it("formats plan dates in the active locale without timezone drift", () => {
    expect(formatLocaleDate("2026-03-09", "en", { month: "short", day: "numeric", timeZone: "UTC" })).toBe("Mar 9");
    expect(formatLocaleDate("2026-03-09", "zh-CN", { month: "numeric", day: "numeric", timeZone: "UTC" })).toContain("3");
  });

  it("returns invalid input unchanged", () => {
    expect(formatLocaleDate("not-a-date", "en")).toBe("not-a-date");
  });
});
