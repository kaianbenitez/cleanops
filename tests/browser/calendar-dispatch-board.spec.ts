import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin-session";

const adminUsername = process.env.BROWSER_ADMIN_USERNAME ?? process.env.BROWSER_HYBRID_USERNAME;
const adminPassword = process.env.BROWSER_ADMIN_PASSWORD ?? process.env.BROWSER_HYBRID_PASSWORD;

// Same real, already-scheduled day used by calendar-move-assign.spec.ts.
const DISPATCH_DAY = "2026-08-18";

test("Board view renders crew lanes with the current calendar controls", async ({ page, context, baseURL }) => {
  test.skip(!adminUsername || !adminPassword, "Set BROWSER_ADMIN_USERNAME/PASSWORD or BROWSER_HYBRID_USERNAME/PASSWORD to run this check.");
  await signInAsAdmin(context, baseURL!, adminUsername!);

  await page.goto(`/calendar?view=staff&day=${DISPATCH_DAY}`);

  await expect(page.getByRole("button", { name: /^board$/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("group", { name: /calendar view/i })).toBeVisible();
  await expect(page.getByRole("group", { name: /board layout/i })).toBeVisible();
  await expect(page.getByText(/application error/i)).toHaveCount(0);
});

test("the compact desktop toolbar keeps tools and its shortcut guide visible", async ({ page, context, baseURL }) => {
  test.skip(!adminUsername || !adminPassword, "Set BROWSER_ADMIN_USERNAME/PASSWORD or BROWSER_HYBRID_USERNAME/PASSWORD to run this check.");
  await signInAsAdmin(context, baseURL!, adminUsername!);
  await page.setViewportSize({ width: 1024, height: 900 });

  await page.goto(`/calendar?view=staff&day=${DISPATCH_DAY}`);
  const shortcuts = page.getByText("Calendar shortcuts");
  const shortcutsTrigger = page.getByText("Shortcuts", { exact: true });
  await expect(shortcutsTrigger).toBeVisible({ timeout: 20_000 });
  await expect(shortcuts).toBeHidden();
  await shortcutsTrigger.click();
  await expect(shortcuts).toBeVisible();

  const popupBox = await shortcuts.locator("..").boundingBox();
  expect(popupBox).not.toBeNull();
  expect(popupBox!.x + popupBox!.width).toBeLessThanOrEqual(1024);
  await expect(page.getByRole("group", { name: /board layout/i })).toBeVisible();
});

test("legacy vertical-board links still open crews as columns", async ({ page, context, baseURL }) => {
  test.skip(!adminUsername || !adminPassword, "Set BROWSER_ADMIN_USERNAME/PASSWORD or BROWSER_HYBRID_USERNAME/PASSWORD to run this check.");
  await signInAsAdmin(context, baseURL!, adminUsername!);

  await page.goto(`/calendar?view=staff_vertical&day=${DISPATCH_DAY}`);
  await expect(page.getByRole("button", { name: "Crews as columns" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Crews as rows" })).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "Crews as rows" }).click();
  await expect(page).toHaveURL(/axis=horizontal/);
});
