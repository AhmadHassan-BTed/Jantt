import { expect, test, type Page } from "@playwright/test";

test.use({ locale: "en-US" });

async function expectNoPageOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
}

test.beforeEach(async ({ context, baseURL }) => {
  await context.route(/^https?:/, route =>
    new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
});

test("changes language in phone settings and edits the same task in Chinese", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open tools and settings menu" }).click();
  const language = page.locator("#mobile-language-select");
  await expect(language).toHaveValue("en");
  await language.selectOption("zh-CN");
  const menu = page.getByRole("dialog", { name: "工具与设置" });
  await expect(menu.getByLabel("语言", { exact: true })).toHaveValue("zh-CN");
  await expectNoPageOverflow(page);
  await menu.getByRole("button", { name: "关闭菜单" }).click();

  const title = "检查发布日期 Release dates";
  await page.getByRole("button", { name: "快速新建", exact: true }).click();
  await page.getByRole("group", { name: "新建", exact: true }).getByRole("button", { name: "任务", exact: true }).click();
  const capture = page.getByRole("dialog", { name: "新建任务" });
  await capture.getByLabel("标题", { exact: true }).fill(title);
  await capture.getByRole("button", { name: "创建任务" }).click();

  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("button", { name: "任务", exact: true }).click();
  await page.getByRole("button", { name: `打开 ${title} 的详情`, exact: true }).first().click();
  const details = page.getByRole("dialog", { name: `任务详情：${title}` });
  const status = details.getByLabel("状态", { exact: true });
  await status.selectOption({ label: "已完成" });
  await expect(status).toHaveValue("completed");
  await details.getByRole("button", { name: "保存更改" }).click();
  await expect(details).toHaveCount(0);
  await expectNoPageOverflow(page);

  // Mirror the Android wrapper's launch referrer and URL on the local preview origin.
  await page.addInitScript(() => {
    Object.defineProperty(document, "referrer", { value: "android-app://io.github.ahmadhassan_bted.jantt" });
  });
  await page.goto("/?source=twa");
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-surface", "twa-android");
  await expect(root).toHaveAttribute("lang", "zh-CN");
  await expect(nav).toBeVisible();
  await nav.getByRole("button", { name: "看板", exact: true }).click();
  await page.getByRole("button", { name: /^完成 \d+$/ }).click();
  await expect(page.getByRole("combobox", { name: `${title} 的状态` })).toHaveValue("completed");
  await expectNoPageOverflow(page);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByRole("navigation", { name: "视图导航" })).toBeVisible();
  await expectNoPageOverflow(page);
});

test("draws localized headers in the mobile Canvas renderer", async ({ page }) => {
  await page.addInitScript(() => {
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (/^\d{4}年\d{1,2}月$|^第[1-4]季度$/.test(text)) this.canvas.dataset.localizedHeader = text;
      return maxWidth === undefined ? fillText.call(this, text, x, y) : fillText.call(this, text, x, y, maxWidth);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open tools and settings menu" }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("zh-CN");
  const menu = page.getByRole("dialog", { name: "工具与设置" });
  await menu.getByText("视图与渲染器", { exact: true }).click();
  await menu.getByRole("button", { name: "画布", exact: true }).click();
  const canvas = page.locator("canvas[role=img]").first();
  await expect(canvas).toHaveAttribute("data-localized-header", /^\d{4}年\d{1,2}月$|^第[1-4]季度$/);
  await expectNoPageOverflow(page);
});

test.describe("desktop settings", () => {
  test.use({ isMobile: false, hasTouch: false, viewport: { width: 1024, height: 768 } });

  test("shows Chinese syntax and schema guidance in the JSON editor", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Choose a theme/ }).click();
    await page.getByRole("button", { name: "简体中文", exact: true }).click();
    await expect(page).toHaveTitle("Jantt - 免费 AI 甘特图与项目时间轴");
    await page.goto("/?url=old-plan");
    await expect(page.getByText(/已停止支持打开其他地址托管的计划链接/)).toBeVisible();

    const toggle = page.getByRole("banner").locator('button[aria-controls="editor-pane"]');
    if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
    const editor = page.locator("#json-editor-textarea");
    const diagnostics = page.locator("#diagnostics-panel");
    await editor.fill("{");
    await expect(diagnostics).toContainText("JSON 语法错误");

    await editor.fill(JSON.stringify({ tasks: [{ id: "A", start: "2026-09-01", end: "2026-09-02" }] }));
    await expect(diagnostics).toContainText("请为此任务添加 'category' 字符串。");
    await diagnostics.getByText("技术详情", { exact: true }).click();
    await expect(diagnostics.getByText(/missing a required 'category'/)).toBeVisible();
  });

  test("loads Chinese on demand and switches the timeline back to English", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", request => {
      if (/\/zh-CN-[^/]+\.js$/.test(new URL(request.url()).pathname)) requested.push(request.url());
    });
    await page.goto("/");
    const header = page.locator(".jantt-label-header");
    await expect(header).toContainText("Task & Category");
    expect(requested).toEqual([]);

    await page.getByRole("button", { name: /Choose a theme/ }).click();
    await page.getByRole("group", { name: "Interface language" }).getByRole("button", { name: "简体中文" }).click();
    await expect(header).toContainText("任务与分类");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    expect(requested).toHaveLength(1);
    await expectNoPageOverflow(page);

    await page.keyboard.press("Escape");
    await page.locator('.jantt-label-row[aria-label^="打开任务详情："]').first().click();
    const details = page.getByRole("dialog", { name: /^任务详情：/ });
    await expect(details.getByLabel("状态", { exact: true })).toBeVisible();
    await details.getByRole("button", { name: "取消", exact: true }).click();
    await expect(details).toHaveCount(0);
    await page.getByRole("button", { name: /选择主题/ }).click();
    await page.getByRole("group", { name: "界面语言" }).getByRole("button", { name: "English" }).click();
    await expect(header).toContainText("Task & Category");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});
