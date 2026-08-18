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

test("stopOrdinals numbers a single crew's jobs in start-time order", async () => {
  const { stopOrdinals } = await sharedModule();
  const jobs = [
    job({ id: "a", assignedUserIds: ["u1"], scheduledStartTime: "13:00" }),
    job({ id: "b", assignedUserIds: ["u1"], scheduledStartTime: "09:00" }),
    job({ id: "c", assignedUserIds: ["u1"], scheduledStartTime: "11:00" }),
  ];
  const result = stopOrdinals(jobs);
  assert.equal(result.get("b"), 1);
  assert.equal(result.get("c"), 2);
  assert.equal(result.get("a"), 3);
});

test("stopOrdinals numbers distinct crews independently, each starting at 1", async () => {
  const { stopOrdinals } = await sharedModule();
  const jobs = [
    job({ id: "a", assignedUserIds: ["u1"], scheduledStartTime: "10:00" }),
    job({ id: "b", assignedUserIds: ["u2"], scheduledStartTime: "09:00" }),
    job({ id: "c", assignedUserIds: ["u1"], scheduledStartTime: "14:00" }),
    job({ id: "d", assignedUserIds: ["u2"], scheduledStartTime: "13:00" }),
  ];
  const result = stopOrdinals(jobs);
  assert.equal(result.get("a"), 1);
  assert.equal(result.get("c"), 2);
  assert.equal(result.get("b"), 1);
  assert.equal(result.get("d"), 2);
});

test("stopOrdinals omits jobs with no crew or no start time", async () => {
  const { stopOrdinals } = await sharedModule();
  const jobs = [
    job({ id: "a", assignedUserIds: [], scheduledStartTime: "09:00" }),
    job({ id: "b", assignedUserIds: ["u1"], scheduledStartTime: null }),
    job({ id: "c", assignedUserIds: ["u1"], scheduledStartTime: "09:00" }),
  ];
  const result = stopOrdinals(jobs);
  assert.equal(result.has("a"), false);
  assert.equal(result.has("b"), false);
  assert.equal(result.get("c"), 1);
});

test("ordinalLabel formats standard and 11-13 exception cases", async () => {
  const { ordinalLabel } = await sharedModule();
  assert.equal(ordinalLabel(1), "1st");
  assert.equal(ordinalLabel(2), "2nd");
  assert.equal(ordinalLabel(3), "3rd");
  assert.equal(ordinalLabel(4), "4th");
  assert.equal(ordinalLabel(11), "11th");
  assert.equal(ordinalLabel(12), "12th");
  assert.equal(ordinalLabel(13), "13th");
  assert.equal(ordinalLabel(21), "21st");
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
