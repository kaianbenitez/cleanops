import assert from "node:assert/strict";
import test from "node:test";
import { startOfDayInstant } from "@/app/(app)/my-day/page";

// D9 ("01 Root Cause Report.md"): the weekly-hours range was built with bare
// `T00:00:00.000Z`, so near-midnight company-time clock-ins landed in the
// wrong pay week. `startOfDayInstant` replaces that — these tests assert the
// real boundary it produces, not a re-implementation of the algorithm.

test("D9: America/Chicago midnight is 05:00 UTC in August (CDT, UTC-5), not the old bare UTC midnight", () => {
  const boundary = startOfDayInstant("2026-08-17", "America/Chicago");
  assert.equal(boundary.toISOString(), "2026-08-17T05:00:00.000Z");
  // the pre-fix bug: `new Date("2026-08-17T00:00:00.000Z")` — five hours early
  assert.notEqual(boundary.toISOString(), "2026-08-17T00:00:00.000Z");
});

test("D9: a clock-in at 11:58pm Sunday company time stays in the prior week, not the new one", () => {
  const weekStart = startOfDayInstant("2026-08-17", "America/Chicago"); // Monday 00:00 local
  const sundayNightClockIn = new Date("2026-08-17T04:58:00.000Z"); // 11:58pm Sunday CDT
  assert.ok(sundayNightClockIn < weekStart, "a near-midnight Sunday clock-in must fall before Monday's boundary");

  // Under the pre-fix bare-UTC boundary this same instant was wrongly on the
  // new-week side of midnight.
  const oldBuggyBoundary = new Date("2026-08-17T00:00:00.000Z");
  assert.ok(sundayNightClockIn >= oldBuggyBoundary, "reproduces D9: the old boundary put this instant in the wrong week");
});

test("D9: a clock-in at 12:02am Monday company time lands in the new week", () => {
  const weekStart = startOfDayInstant("2026-08-17", "America/Chicago");
  const mondayMorningClockIn = new Date("2026-08-17T05:02:00.000Z"); // 12:02am Monday CDT
  assert.ok(mondayMorningClockIn >= weekStart);
});

test("D9: UTC company timezone reduces to the old bare-midnight behaviour (no regression for UTC companies)", () => {
  const boundary = startOfDayInstant("2026-08-17", "UTC");
  assert.equal(boundary.toISOString(), "2026-08-17T00:00:00.000Z");
});

test("D9: the end-of-week boundary is exactly seven days after the start, in the same timezone", () => {
  const start = startOfDayInstant("2026-08-17", "America/Chicago");
  const end = startOfDayInstant("2026-08-24", "America/Chicago");
  assert.equal(end.getTime() - start.getTime(), 7 * 24 * 60 * 60 * 1000);
});
