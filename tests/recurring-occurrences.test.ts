import assert from "node:assert/strict";
import test from "node:test";
import { computeOccurrences } from "@/lib/scheduling/generate-jobs";

test("custom recurring series uses the configured number of weeks", () => {
  const dates = computeOccurrences(
    { frequency: "custom", intervalWeeks: 3, dayOfWeek: 1, startDate: "2026-08-17", endDate: null },
    new Date("2026-08-17T00:00:00.000Z"),
    new Date("2026-09-30T00:00:00.000Z"),
  );

  assert.deepEqual(dates, ["2026-08-17", "2026-09-07", "2026-09-28"]);
});

test("custom interval preserves five- and six-week cadences", () => {
  const fiveWeeks = computeOccurrences(
    { frequency: "custom", intervalWeeks: 5, dayOfWeek: 1, startDate: "2026-08-17", endDate: null },
    new Date("2026-08-17T00:00:00.000Z"),
    new Date("2026-12-31T00:00:00.000Z"),
  );
  const sixWeeks = computeOccurrences(
    { frequency: "custom", intervalWeeks: 6, dayOfWeek: 1, startDate: "2026-08-17", endDate: null },
    new Date("2026-08-17T00:00:00.000Z"),
    new Date("2026-12-31T00:00:00.000Z"),
  );

  assert.deepEqual(fiveWeeks.slice(0, 3), ["2026-08-17", "2026-09-21", "2026-10-26"]);
  assert.deepEqual(sixWeeks.slice(0, 3), ["2026-08-17", "2026-09-28", "2026-11-09"]);
});
