import { describe, expect, it } from "vitest";
import { layout } from "../src/layout";
import { DEFAULT_TIMELINE_LABELS, formatTimelineLabel, resolveTimelineLabels } from "../src/timeline-labels";
import type { JanttData } from "../src/types";

const zhLabels = {
  monthsLong: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
  monthsShort: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
  daysShort: ["日", "一", "二", "三", "四", "五", "六"],
  week: "第{week}周",
  quarter: "Q{quarter}",
  monthYear: "{year}年{month}",
  quarterYear: "{year}年{quarter}",
  today: "今天",
  todayTitle: "今天：{date}（点击筛选今天有活动的任务）",
  todayTitleNoDate: "今天（点击筛选今天有活动的任务）"
};

const plan: JanttData = {
  meta: { title: "Localized plan" },
  tasks: [{ id: "a", label: "A", category: "general", start: "2026-09-01", end: "2026-10-15" }]
};

describe("timeline labels", () => {
  it("falls back to English for omitted fields", () => {
    const labels = resolveTimelineLabels({ week: "第{week}周" });
    expect(labels.week).toBe("第{week}周");
    expect(labels.monthsLong).toEqual(DEFAULT_TIMELINE_LABELS.monthsLong);
    expect(resolveTimelineLabels()).toBe(DEFAULT_TIMELINE_LABELS);
  });

  it("fills placeholders without touching unknown ones", () => {
    expect(formatTimelineLabel("第{week}周", { week: 36 })).toBe("第36周");
    expect(formatTimelineLabel("{month} {year}", { month: "Sep" })).toBe("Sep {year}");
  });

  it("localizes the header tiers the layout builds", () => {
    const header = layout(plan, { dayWidth: 20, scale: "week", showToday: false }, zhLabels).header;

    expect(header.months.map((m) => m.label)).toEqual(expect.arrayContaining(["2026年9月", "2026年10月"]));
    expect(header.weeks.length).toBeGreaterThan(0);
    expect(header.weeks.every(week => /^第\d+周$/.test(week.label))).toBe(true);
    // 2026-09-01 is a Tuesday.
    expect(header.days.find((d) => d.dateStr === "2026-09-01")?.dayName).toBe("二");
  });

  it("keeps English when no labels are provided", () => {
    const header = layout(plan, { dayWidth: 20, scale: "week", showToday: false }).header;
    expect(header.months.map((m) => m.label)).toContain("September 2026");
    expect(header.weeks[0].label).toMatch(/^Wk \d+$/);
    expect(header.days.find((d) => d.dateStr === "2026-09-01")?.dayName).toBe("Tu");
  });
});
