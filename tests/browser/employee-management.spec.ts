import { expect, test } from "@playwright/test";

const adminUsername = process.env.BROWSER_ADMIN_USERNAME;
const adminPassword = process.env.BROWSER_ADMIN_PASSWORD;

test("admin employee profile exposes password, archive, and delete controls", async ({ page }) => {
  test.skip(!adminUsername || !adminPassword, "Set BROWSER_ADMIN_USERNAME and BROWSER_ADMIN_PASSWORD for the authenticated employee-management check.");

  await page.goto("/login");
  await page.getByLabel("Username").fill(adminUsername!);
  await page.getByLabel("Password").fill(adminPassword!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard|\/employees/);

  await page.goto("/employees");
  const employeeLink = page.getByRole("link", { name: /view profile/i }).first();
  await expect(employeeLink).toBeVisible();
  await employeeLink.click();

  // The employee profile is a client component that fetches on mount, so the
  // admin controls appear well after navigation — the 5s default is not enough.
  await expect(page.getByRole("heading", { name: /account access/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /change password/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /delete permanently/i })).toBeVisible();
  // The archive toggle lives in the profile header, labelled just "Archive" /
  // "Restore" — not inside the Account access card, whose "Archive employee"
  // text is a description rather than the control.
  await expect(page.getByRole("button", { name: /^(archive|restore)$/i }).first()).toBeVisible();
});
