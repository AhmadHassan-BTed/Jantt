import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const destinations = ["Timeline", "Board", "Tasks", "Project health", "Notes"];
const surfaces = [".planning-timeline", ".kanban-outer-wrap", ".tasks-view-container", ".summary-view-container", ".notes-view-container"];

async function checkAccessibility(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([]);
}

test.beforeEach(async ({ context, baseURL }) => {
  // This suite exercises an unsigned local workspace, including when third-party services are unavailable.
  await context.route(/^https?:/, route =>
    new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
});

for (const theme of ["swiss-dark", "swiss-light"]) {
  test(`${theme} phone navigation and settings`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(id => localStorage.setItem("jantt_saved_theme", id), theme);
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main View Navigation" });
    for (const [index, name] of destinations.entries()) {
      const tab = nav.getByRole("button", { name: name === "Notes" ? /\bNotes$/ : name, exact: true });
      await tab.tap();
      await expect(tab).toHaveAttribute("aria-current", "page");
      const box = await tab.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
      await expect(page.locator(surfaces[index])).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
      await checkAccessibility(page);
    }
    await page.getByRole("button", { name: "Open tools and settings menu" }).tap();
    const menu = page.getByRole("dialog", { name: "Tools & Settings" });
    await expect(menu.getByLabel("Theme", { exact: true })).toHaveValue(theme);
    await menu.getByText("Plans and files", { exact: true }).tap();
    await expect(menu.getByRole("button", { name: "Manage Plans" })).toBeVisible();
    await checkAccessibility(page);
    await menu.getByRole("button", { name: "Close menu" }).tap();
    await expect(menu).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("theme picker updates the phone workspace and browser chrome together", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open tools and settings menu" }).tap();
  const themePicker = page.getByLabel("Theme", { exact: true });
  const options = await themePicker.locator("option").evaluateAll(nodes => nodes.map(node => node.value));
  for (const id of options) {
    await themePicker.selectOption(id);
    await expect(page.locator("html")).toHaveAttribute("data-theme", id);
    await expect.poll(() => page.evaluate(() => {
      const app = document.querySelector(".playground-app")!;
      const background = getComputedStyle(app).getPropertyValue("--jantt-bg").trim().toLowerCase();
      const chrome = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content.toLowerCase();
      return background === chrome;
    })).toBe(true);
    if (id === "swiss-dark") await expect(page.locator(".mobile-navbar")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  }
});

test("capture, search and open task details", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Quick capture" }).tap();
  await page.getByRole("button", { name: "Task", exact: true }).tap();
  const capture = page.getByRole("dialog", { name: "New task" });
  const title = "Confirm release dates";
  await capture.getByLabel("Title", { exact: true }).fill(title);
  await capture.getByRole("button", { name: "Create task" }).tap();
  await page.getByRole("button", { name: "Find tasks and commands" }).tap();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("combobox").fill(title);
  await palette.getByRole("option", { name: new RegExp(title) }).tap();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Changes" })).toBeInViewport();
});

test("phone filters and chart options retain their selections", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Filters", exact: true }).tap();
  const filters = page.getByRole("dialog", { name: "Filters" });
  await filters.getByRole("button", { name: "Today", exact: true }).tap();
  await expect(filters.getByRole("button", { name: "Today", exact: true })).toHaveAttribute("aria-pressed", "true");
  await filters.getByRole("button", { name: "Close filters" }).tap();
  await page.getByRole("button", { name: "Chart settings" }).tap();
  const options = page.getByRole("dialog", { name: "Chart settings" });
  const baseline = options.getByRole("switch", { name: /baseline/i });
  const wasChecked = await baseline.isChecked();
  await baseline.tap();
  await expect(baseline).toHaveAttribute("aria-checked", String(!wasChecked));
  await options.getByRole("button", { name: "Curved", exact: true }).tap();
  await expect(options.getByRole("button", { name: "Curved", exact: true })).toHaveAttribute("aria-pressed", "true");
  await options.getByRole("button", { name: /close/i }).tap();
  await page.getByRole("button", { name: "Chart settings" }).tap();
  await expect(options.getByRole("switch", { name: /baseline/i })).toHaveAttribute("aria-checked", String(!wasChecked));
});
