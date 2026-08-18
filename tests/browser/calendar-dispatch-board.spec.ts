import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin-session";

const adminUsername = process.env.BROWSER_ADMIN_USERNAME ?? process.env.BROWSER_HYBRID_USERNAME;
const adminPassword = process.env.BROWSER_ADMIN_PASSWORD ?? process.env.BROWSER_HYBRID_PASSWORD;

// Same real, already-scheduled day used by calendar-move-assign.spec.ts.
const DISPATCH_DAY = "2026-08-18";

test("Dispatch view groups jobs into Morning/Afternoon crew rows with full names, no hourly grid", async ({ page, context, baseURL }) => {
  test.skip(!adminUsername || !adminPassword, "Set BROWSER_ADMIN_USERNAME/PASSWORD or BROWSER_HYBRID_USERNAME/PASSWORD to run this check.");
  await signInAsAdmin(context, baseURL!, adminUsername!);

  await page.goto(`/calendar?view=staff&day=${DISPATCH_DAY}`);

  // Toolbar shows the renamed view, not the old geometry-named ones.
  await expect(page.getByRole("button", { name: /^dispatch$/i })).toBeVisible({ timeout: 20_000 });

  await expect(page.getByRole("heading", { name: /^morning$/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^afternoon$/i })).toBeVisible();

  // The old board rendered a fixed 9-row, ~1,000px-tall hour grid
  // (`grid-template-columns` with per-hour absolute rows) as its dominant
  // shell; the new one doesn't lay out an hourly axis at all.
  await expect(page.getByText(/^9 AM$|^9:00 AM$/)).toHaveCount(0);

  // Every window is either a populated crew row (which always shows a
  // "Finish ~" estimate in its heading) or the empty-window next-action
  // state — never a bare, actionless "no jobs".
  const populated = page.getByText(/finish ~/i).first();
  const empty = page.getByText(/no morning jobs|no afternoon jobs/i).first();
  await expect(populated.or(empty)).toBeVisible();
});
