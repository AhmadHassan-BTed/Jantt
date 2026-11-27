// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, useI18n } from "../src/i18n/I18nProvider";
import { tGlobal } from "../src/i18n";

function Probe() {
  const { t, locale, setLocale, locales } = useI18n();
  return (
    <div>
      <span data-testid="label">{t("view.gantt")}</span>
      <span data-testid="locale">{locale}</span>
      <span data-testid="count">{t("toolbar.taskCount", { count: 3 })}</span>
      <span data-testid="options">{locales.map((option) => option.nativeLabel).join("|")}</span>
      <button type="button" onClick={() => setLocale("zh-CN")}>zh</button>
      <button type="button" onClick={() => setLocale("en")}>en</button>
    </div>
  );
}

describe("I18nProvider", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.documentElement.lang = "";
    container.remove();
  });

  it("renders English first and switches to Chinese without a reload", async () => {
    act(() => root.render(<I18nProvider initialLocale="en"><Probe /></I18nProvider>));

    expect(container.querySelector('[data-testid="label"]')!.textContent).toBe("Gantt");
    expect(container.querySelector('[data-testid="count"]')!.textContent).toBe("3 tasks");

    await act(async () => {
      container.querySelectorAll("button")[0].click();
    });
    await act(async () => { await vi.dynamicImportSettled(); });

    expect(container.querySelector('[data-testid="locale"]')!.textContent).toBe("zh-CN");
    expect(container.querySelector('[data-testid="label"]')!.textContent).toBe("甘特图");
    expect(container.querySelector('[data-testid="count"]')!.textContent).toBe("3 个任务");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(localStorage.getItem("jantt_ui_locale")).toBe("zh-CN");
    expect(tGlobal("view.gantt")).toBe("甘特图");

    await act(async () => { container.querySelectorAll("button")[1].click(); });
    expect(container.querySelector('[data-testid="label"]')!.textContent).toBe("Gantt");
    expect(document.documentElement.lang).toBe("en");
    expect(tGlobal("view.gantt")).toBe("Gantt");
  });

  it("keeps working outside a provider with English fallbacks", () => {
    act(() => root.render(<Probe />));
    expect(container.querySelector('[data-testid="label"]')!.textContent).toBe("Gantt");
  });
});
