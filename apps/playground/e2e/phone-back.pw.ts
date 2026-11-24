import { expect, test } from "@playwright/test";

test("Back protects edits in quick capture and task details", async ({ page, context, baseURL }) => {
  await context.route(/^https?:/, route =>
    new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Quick capture" }).tap();
  await page.getByRole("button", { name: "Task", exact: true }).tap();
  const capture = page.getByRole("dialog", { name: "New task" });
  const title = "Inspect on the phone";
  const titleInput = capture.getByLabel("Title", { exact: true });
  await titleInput.fill(title);
  await titleInput.blur();
  await page.goBack();
  await expect(page.getByRole("alertdialog", { name: "Discard this task?" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(titleInput).toHaveValue(title);
  await capture.getByRole("button", { name: "Create task" }).tap();

  await page.getByRole("button", { name: "Find tasks and commands" }).tap();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("combobox").fill(title);
  await palette.getByRole("option", { name: new RegExp(title) }).tap();
  const drawer = page.getByRole("dialog", { name: `Task details: ${title}` });
  const label = drawer.locator("#jantt-sidebar-label");
  const edited = `${title} tomorrow`;
  await label.fill(edited);
  await label.blur();
  const workspaceUrl = page.url();
  await page.goBack();
  await expect(drawer.getByRole("button", { name: "Discard", exact: true })).toBeVisible();
  await expect(label).toHaveValue(edited);
  await drawer.getByRole("button", { name: "Save Changes" }).tap();
  await expect(drawer).toHaveCount(0);
  await expect(page).toHaveURL(workspaceUrl);
  await page.getByRole("button", { name: "Find tasks and commands" }).tap();
  await palette.getByRole("combobox").fill(edited);
  await expect(palette.getByRole("option", { name: new RegExp(edited) })).toBeVisible();
});
