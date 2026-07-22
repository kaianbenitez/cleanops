import { expect, test } from "@playwright/test";

test.describe("CleanOps browser smoke tests", () => {
  test("login page renders the operations entry point", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("protected pages redirect signed-out users to login", async ({ page }) => {
    for (const path of ["/dashboard", "/jobs", "/my-day", "/settings/ghl"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
    }
  });

  test("public proposal handles an invalid link safely", async ({ page }) => {
    await page.goto("/quote/not-a-real-token");
    await expect(page.getByText(/proposal link is invalid or has expired/i)).toBeVisible({ timeout: 12_000 });
  });
});
