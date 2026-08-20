import assert from "node:assert/strict";
import test from "node:test";
import { scheduleJobHref } from "@/app/(app)/schedule/schedule-link";

test("scheduleJobHref: today's row links back to My Day, not the job page", () => {
  assert.equal(scheduleJobHref("job-1", "2026-08-20", "2026-08-20"), "/my-day");
});

test("scheduleJobHref: a future-dated row keeps its own job link", () => {
  assert.equal(scheduleJobHref("job-1", "2026-08-21", "2026-08-20"), "/my-day/job-1");
});

// WP-D §9/§15 — the banned-word list applies to every string this package
// introduces, not just workday-state.ts (already covered by WP-A's tests).
const BANNED = /paid|payroll|clocked in|clock out/i;
const WP_D_COPY = [
  "Coming up",
  "Signed in as {First} {Last}",
  "Signed in on this phone",
  "Signed in on this phone · stays signed in until {date}",
  "Stay signed in on this phone",
  "Only use this on a phone that's yours. On a shared phone, sign out when you're done so nobody else can open your day.",
  "Add Shimmer to your Home Screen so it opens like an app and you sign in less often.",
  "Sign out",
];

test("WP-D copy: no introduced string uses banned payroll language", () => {
  for (const line of WP_D_COPY) {
    assert.equal(BANNED.test(line), false, `banned word found in: ${line}`);
  }
});
