import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin-session";

// Live-session coverage for Hybrid Employee Access Plan.md's H7 checklist.
// The two decision-logic bullets (hybrid vs. office-only vs. plain-employee
// outcomes, and the cookie/UA/job-today precedence) are covered without any
// live infra by tests/hybrid-access.test.ts — hasFieldAccess's role="employee"
// case there proves plain employees are unaffected, since that's the same
// !hasFieldAccess(user) condition every H2 guard runs. This file only checks
// what actually requires a real authenticated request: that the route guards
// let the right accounts through. "/my-day for a hybrid returns only her own
// assignments" is not separately re-asserted here — my-day/page.tsx's queries
// are already scoped eq(jobAssignments.userId, user.id) with no admin
// "see all" branch (confirmed by inspection in the plan doc), and reproducing
// that guarantee at the browser layer would need a second seeded employee's
// job in the live DB.
const adminUsername = process.env.BROWSER_ADMIN_USERNAME;
const adminPassword = process.env.BROWSER_ADMIN_PASSWORD;
const hybridUsername = process.env.BROWSER_HYBRID_USERNAME;
const hybridPassword = process.env.BROWSER_HYBRID_PASSWORD;

test.describe("hybrid admin + field-staff access", () => {
  test("office-only admin is still bounced off /my-day", async ({ page, context, baseURL }) => {
    test.skip(
      !adminUsername || !adminPassword,
      "Set BROWSER_ADMIN_USERNAME and BROWSER_ADMIN_PASSWORD (see TESTING.md). Assumes that account is not field staff — if it is, this test will need BROWSER_ADMIN_USERNAME repointed at an office-only account."
    );
    await signInAsAdmin(context, baseURL!, adminUsername!);
    await page.goto("/my-day");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("hybrid admin (role=admin, isFieldStaff=true) can load /my-day", async ({ page, context, baseURL }) => {
    test.skip(
      !hybridUsername || !hybridPassword,
      "Set BROWSER_HYBRID_USERNAME and BROWSER_HYBRID_PASSWORD for an admin account with isFieldStaff=true (see TESTING.md)."
    );
    await signInAsAdmin(context, baseURL!, hybridUsername!);
    await page.goto("/my-day");
    await expect(page).toHaveURL(/\/my-day/);
    await expect(page.getByRole("heading", { name: /today.?s jobs/i })).toBeVisible({ timeout: 20_000 });
  });
});
