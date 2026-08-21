import { test, expect } from "@playwright/test";

test("login page hydrates the reason message from the query string", async ({ page }) => {
  await page.goto("/login?reason=expired");
  await expect(page.getByRole("status")).toHaveText(
    "Your sign-in expired. Sign in again to get back to your day — nothing you recorded was lost."
  );
});

test("login page hydrates a different reason", async ({ page }) => {
  await page.goto("/login?reason=signed_out");
  await expect(page.getByRole("status")).toHaveText("You signed out. Sign in when you're ready.");
});

test("login page falls back to the generic message for a bogus reason", async ({ page }) => {
  await page.goto("/login?reason=not-a-real-reason");
  await expect(page.getByRole("status")).toHaveText("Sign in to see your day.");
});

test("login page shows the generic message with no reason at all", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("status")).toHaveText("Sign in to see your day.");
});

test("a bad login attempt keeps the typed username in the field", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("someone");
  await page.getByLabel("Password").fill("definitely-wrong-password");
  await page.getByRole("button", { name: /Sign in/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Username")).toHaveValue("someone");
});
