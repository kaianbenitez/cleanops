import assert from "node:assert/strict";
import test from "node:test";

async function sharedModule() {
  return import("@/app/(app)/calendar/shared");
}

const DAY = "2026-08-18";

function job(overrides: Partial<{ id: string; status: string; assignedUserIds: string[]; scheduledStartTime: string | null }>) {
  return {
    id: "job-1",
    status: "scheduled",
    assignedUserIds: [] as string[],
    scheduledStartTime: null as string | null,
    ...overrides,
  };
}

test("arrivalWindowFor groups pre-noon as morning and noon-or-later as afternoon", async () => {
  const { arrivalWindowFor } = await sharedModule();
  assert.equal(arrivalWindowFor(null), null);
  assert.equal(arrivalWindowFor(undefined), null);
  assert.equal(arrivalWindowFor("09:00:00"), "morning");
  assert.equal(arrivalWindowFor("11:59:00"), "morning");
  assert.equal(arrivalWindowFor("12:00:00"), "afternoon");
  assert.equal(arrivalWindowFor("13:30:00"), "afternoon");
});

test("clockLabelFromMinutes formats standard clock boundaries", async () => {
  const { clockLabelFromMinutes } = await sharedModule();
  assert.equal(clockLabelFromMinutes(0), "12:00 AM");
  assert.equal(clockLabelFromMinutes(9 * 60), "9:00 AM");
  assert.equal(clockLabelFromMinutes(12 * 60), "12:00 PM");
  assert.equal(clockLabelFromMinutes(13 * 60 + 30), "1:30 PM");
});

test("categorizeForAttention puts an unassigned job in the unassigned bucket", async () => {
  const { categorizeForAttention } = await sharedModule();
  const entries = categorizeForAttention([job({ id: "a", assignedUserIds: [] })], [], DAY);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].category, "unassigned");
});

test("categorizeForAttention puts an assigned-but-untimed job in the no-time bucket", async () => {
  const { categorizeForAttention } = await sharedModule();
  const entries = categorizeForAttention([job({ id: "a", assignedUserIds: ["emp-1"], scheduledStartTime: null })], [], DAY);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].category, "no-time");
});

test("categorizeForAttention flags a PTO conflict for a fully scheduled job", async () => {
  const { categorizeForAttention } = await sharedModule();
  const entries = categorizeForAttention(
    [job({ id: "a", assignedUserIds: ["emp-1"], scheduledStartTime: "09:00:00" })],
    [{ userId: "emp-1", startDate: DAY, endDate: DAY }],
    DAY,
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0].category, "conflict");
});

test("categorizeForAttention excludes a fully scheduled job with no conflict", async () => {
  const { categorizeForAttention } = await sharedModule();
  const entries = categorizeForAttention(
    [job({ id: "a", assignedUserIds: ["emp-1"], scheduledStartTime: "09:00:00" })],
    [{ userId: "emp-1", startDate: "2026-08-19", endDate: "2026-08-19" }],
    DAY,
  );
  assert.equal(entries.length, 0);
});

test("categorizeForAttention excludes cancelled, no-show, and completed jobs regardless of crew/time", async () => {
  const { categorizeForAttention } = await sharedModule();
  const entries = categorizeForAttention(
    [
      job({ id: "cancelled", status: "cancelled", assignedUserIds: [] }),
      job({ id: "no-show", status: "no_show", assignedUserIds: [] }),
      job({ id: "completed", status: "completed", assignedUserIds: [] }),
    ],
    [],
    DAY,
  );
  assert.equal(entries.length, 0);
});
