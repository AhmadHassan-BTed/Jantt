// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { JanttData, JanttInstance } from "@jantt/core";
import { Jantt } from "../src/Jantt";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Jantt locale", () => {
  it("updates the language, preserves the instance and zoom, and honors custom labels", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const plan: JanttData = {
      tasks: [{ id: "task", label: "Project task", category: "work", start: "2026-11-01", end: "2026-11-05" }]
    };
    const onInstance = vi.fn<(value: JanttInstance | null) => void>();
    const onCommit = vi.fn();
    const render = (locale: string) => root.render(
      <Jantt data={plan} locale={locale} labels={{ daysColumn: "D" }} onInstance={onInstance} onCommit={onCommit} />
    );

    try {
      await act(async () => render("zh-CN"));
      expect(host.querySelector(".jantt-label-header")?.textContent).toContain("任务与分类");
      expect(host.querySelector(".jantt-label-header")?.textContent).toContain("D");
      expect(host.querySelector(".jantt-settings-btn")?.getAttribute("aria-label")).toBe("图表设置");
      const instance = onInstance.mock.calls[0][0]!;
      instance.setDayWidth(20);
      const zoom = instance.getDayWidth();
      host.querySelector<HTMLElement>(".jantt-label-row[data-row-id='task']")!.click();
      expect(document.querySelector("#jantt-sidebar-save")?.textContent).toBe("保存更改");
      document.querySelector<HTMLButtonElement>("#jantt-sidebar-cancel")!.click();

      await act(async () => render("en"));
      expect(host.querySelector(".jantt-label-header")?.textContent).toContain("Task & Category");
      expect(host.querySelector(".jantt-settings-btn")?.getAttribute("aria-label")).toBe("Chart Settings");
      expect(instance.getDayWidth()).toBe(zoom);
      expect(instance.getData().tasks[0].label).toBe("Project task");
      expect(onInstance).toHaveBeenCalledTimes(1);
      expect(onCommit).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
