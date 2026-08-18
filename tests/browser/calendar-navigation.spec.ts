import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin-session";

const adminUsername = process.env.BROWSER_ADMIN_USERNAME ?? process.env.BROWSER_HYBRID_USERNAME;
const adminPassword = process.env.BROWSER_ADMIN_PASSWORD ?? process.env.BROWSER_HYBRID_PASSWORD;
const DISPATCH_DAY = "2026-08-18";

test("navigating among Dispatch, Capacity, Month, and More views preserves the date and never errors", async ({ page, context, baseURL }) => {
  test.skip(!adminUsername || !adminPassword, "Set BROWSER_ADMIN_USERNAME/PASSWORD or BROWSER_HYBRID_USERNAME/PASSWORD to run this check.");
  await signInAsAdmin(context, baseURL!, adminUsername!);

  await page.goto(`/calendar?view=staff&day=${DISPATCH_DAY}`);
  await expect(page.getByRole("button", { name: /^dispatch$/i })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /^capacity$/i }).click();
  await expect(page).toHaveURL(/view=week/);
  await expect(page.getByRole("button", { name: /^capacity$/i })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /^month$/i }).click();
  await expect(page).toHaveURL(/view=month/);
  await expect(page.getByRole("button", { name: /^month$/i })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /more views/i }).click();
  await page.getByRole("menuitemradio", { name: /^day list$/i }).click();
  await expect(page).toHaveURL(new RegExp(`view=list&day=${DISPATCH_DAY}`));

  await page.getByRole("button", { name: /day list/i }).click();
  await page.getByRole("menuitemradio", { name: /^vertical timeline$/i }).click();
  await expect(page).toHaveURL(new RegExp(`view=staff_vertical&day=${DISPATCH_DAY}`));

  // Back to Dispatch directly — the date param round-trips through every
  // view above without ever resetting to today.
  await page.goto(`/calendar?view=staff&day=${DISPATCH_DAY}`);
  await expect(page.getByRole("button", { name: /^dispatch$/i })).toHaveAttribute("aria-pressed", "true");

  // No client-side error boundary / Next.js error overlay on any of these views.
  await expect(page.getByText(/application error/i)).toHaveCount(0);
});
