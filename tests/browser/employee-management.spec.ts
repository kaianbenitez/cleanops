import { expect, test } from "@playwright/test";

const adminEmail = process.env.BROWSER_ADMIN_EMAIL;
const adminPassword = process.env.BROWSER_ADMIN_PASSWORD;

test("admin employee profile exposes password, archive, and delete controls", async ({ page }) => {
  test.skip(!adminEmail || !adminPassword, "Set BROWSER_ADMIN_EMAIL and BROWSER_ADMIN_PASSWORD for the authenticated employee-management check.");

  await page.goto("/login");
  await page.getByLabel("Email address").fill(adminEmail!);
  await page.getByLabel("Password").fill(adminPassword!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard|\/employees/);

  await page.goto("/employees");
  const employeeLink = page.getByRole("link", { name: /view details/i }).first();
  await expect(employeeLink).toBeVisible();
  await employeeLink.click();

  await expect(page.getByRole("heading", { name: /account access/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /change password/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /delete permanently/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /archive employee|restore employee/i }).first()).toBeVisible();
});
