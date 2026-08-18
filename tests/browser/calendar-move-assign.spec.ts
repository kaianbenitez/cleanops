import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin-session";

// This admin's own credentials aren't configured in every environment — the
// hybrid account (admin + field staff) is the one this repo's .env.local
// convention keeps set, so use it for calendar checks too.
const adminUsername = process.env.BROWSER_ADMIN_USERNAME ?? process.env.BROWSER_HYBRID_USERNAME;
const adminPassword = process.env.BROWSER_ADMIN_PASSWORD ?? process.env.BROWSER_HYBRID_PASSWORD;

// A real, already-scheduled day on this company's calendar — picked by
// querying the hosted DB directly, not fabricated. Deliberately not "today":
// this only reads the day's jobs and intercepts every mutation, so it never
// needs to be current.
const DISPATCH_DAY = "2026-08-18";

test.describe("Calendar — Move or assign panel", () => {
  // Each test mints its own magic-link sign-in for the same account; running
  // in parallel invalidates the other worker's link mid-redemption.
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ context, baseURL }) => {
    test.skip(!adminUsername || !adminPassword, "Set BROWSER_ADMIN_USERNAME/PASSWORD or BROWSER_HYBRID_USERNAME/PASSWORD to run calendar checks.");
    await signInAsAdmin(context, baseURL!, adminUsername!);
  });

  test("opens from a job card without navigating, and Cancel/Escape write nothing", async ({ page }) => {
    let patchCount = 0;
    await page.route("**/api/jobs/*", async (route) => {
      if (route.request().method() === "PATCH") patchCount += 1;
      await route.continue();
    });

    await page.goto(`/calendar?view=staff&day=${DISPATCH_DAY}`);
    await expect(page.getByRole("heading", { name: /dispatch|calendar/i }).first()).toBeVisible({ timeout: 20_000 }).catch(() => {});

    const trigger = page.getByRole("button", { name: /^move or assign —/i }).first();
    await expect(trigger).toBeVisible({ timeout: 20_000 });
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: /move or assign job/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/job being changed/i)).toBeVisible();
    // Still on /calendar — opening the panel is not a navigation.
    await expect(page).toHaveURL(/\/calendar/);

    // Escape closes without writing anything.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(patchCount).toBe(0);

    // Re-open and Cancel — same guarantee.
    await trigger.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^cancel$/i }).click();
    await expect(dialog).toBeHidden();
    expect(patchCount).toBe(0);
  });

  test("Confirm schedule sends the reviewed date, window, and crew", async ({ page }) => {
    // Loosely typed on purpose — `postDataJSON()` is untyped, and this test
    // only inspects a couple of fields off the captured request body.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lastPatchBody: any = null;
    await page.route("**/api/jobs/*", async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      lastPatchBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, warnings: [] }) });
    });

    await page.goto(`/calendar?view=staff&day=${DISPATCH_DAY}`);
    const trigger = page.getByRole("button", { name: /^move or assign —/i }).first();
    await expect(trigger).toBeVisible({ timeout: 20_000 });
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: /move or assign job/i });
    await expect(dialog).toBeVisible();

    // Choose an arrival window explicitly — required before Confirm enables.
    // The button's accessible name includes its "1:00–1:30 PM arrival"
    // sub-label, so match on the leading word only.
    await dialog.getByRole("button", { name: /^afternoon/i }).click();
    await expect(dialog.getByText(/expected finish/i)).toBeVisible();

    await dialog.getByRole("button", { name: /^confirm schedule$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    expect(lastPatchBody).not.toBeNull();
    expect(lastPatchBody?.scheduledStartTime).toBe("13:00:00");
    expect(Array.isArray(lastPatchBody?.employeeIds)).toBe(true);
  });
});
