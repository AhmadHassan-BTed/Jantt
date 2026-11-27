import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "allow", locale: "en-US" });

test("a first visit installs the offline workspace and retains a task created offline", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe("activated");

  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  const shell = await page.reload({ waitUntil: "domcontentloaded" });
  expect(shell?.fromServiceWorker()).toBe(true);
  const loadedFonts = await page.evaluate(async () => {
    const fonts = ["600 14px Inter", '600 24px "Space Grotesk"', '400 12px "JetBrains Mono"'];
    return Promise.all(fonts.map(async font => (await document.fonts.load(font)).some(face => face.status === "loaded")));
  });
  expect(loadedFonts).toEqual([true, true, true]);

  const title = "Offline site inspection";
  await page.getByRole("button", { name: "Quick capture" }).tap();
  await page.getByRole("button", { name: "Task", exact: true }).tap();
  const capture = page.getByRole("dialog", { name: "New task" });
  await capture.getByLabel("Title", { exact: true }).fill(title);
  await capture.getByRole("button", { name: "Create task" }).tap();
  await expect(capture).toHaveCount(0);

  const restoredShell = await page.reload({ waitUntil: "domcontentloaded" });
  expect(restoredShell?.fromServiceWorker()).toBe(true);
  const navigation = page.getByRole("navigation", { name: "Main View Navigation" });
  await navigation.getByRole("button", { name: "Tasks", exact: true }).tap();
  const tasks = page.locator(".tasks-view-container");
  await expect(tasks.getByText(title, { exact: true })).toBeVisible();
});

test("a cold Chinese language chunk can load from the installed shell while offline", async ({ page, context }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe("activated");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Open tools and settings menu" }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("zh-CN");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});
