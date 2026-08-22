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
