import assert from "node:assert/strict";
import test from "node:test";
import { recurringFrequencyLabel } from "@/lib/my-day/job-format";

test("formats each supported subscription cadence for My Day", () => {
  assert.equal(recurringFrequencyLabel("weekly"), "Weekly");
  assert.equal(recurringFrequencyLabel("biweekly"), "Bi-weekly");
  assert.equal(recurringFrequencyLabel("every4weeks"), "Every 4 weeks");
  assert.equal(recurringFrequencyLabel("monthly"), "Monthly");
  assert.equal(recurringFrequencyLabel("custom"), "Custom recurring");
});

test("does not fabricate a subscription cadence when none is attached", () => {
  assert.equal(recurringFrequencyLabel(null), null);
  assert.equal(recurringFrequencyLabel("unknown"), null);
});
