import assert from "node:assert/strict";
import test from "node:test";

async function capacityModule() {
  process.env.DATABASE_URL ??= "postgres://user:password@localhost:5432/cleanops";
  return import("@/lib/scheduling/capacity");
}

// 2026-08-17 is a Monday (working day). 2026-08-16 is a Sunday (not, under
// the default Mon-Fri working-days config used below).
const MONDAY = "2026-08-17";
const SUNDAY = "2026-08-16";

const baseInputs = {
  dates: [MONDAY],
  staffCount: 2,
  jobs: [] as { scheduledDate: string; estimatedDurationMinutes: number | null; status: string }[],
  ptoRecords: [] as Array<{ id: string; userId: string; startDate: string; endDate: string; startPeriod: "full" | "morning" | "afternoon"; endPeriod: "full" | "morning" | "afternoon"; note: string | null }>,
  workdayHours: 8,
  defaultJobDurationMinutes: 120,
  workingDays: [1, 2, 3, 4, 5],
  holidays: [] as string[],
};

test("a day with no jobs and no staff is fully free", async () => {
  const { calculateCapacity } = await capacityModule();
  const [day] = calculateCapacity(baseInputs);
  assert.deepEqual(day, {
    date: MONDAY,
    availableHours: 16,
    committedHours: 0,
    freeHours: 16,
    staffCount: 2,
    hasIncompleteEstimates: false,
  });
});

test("no staff means zero available hours even with no jobs", async () => {
  const { calculateCapacity } = await capacityModule();
  const [day] = calculateCapacity({ ...baseInputs, staffCount: 0 });
  assert.equal(day.availableHours, 0);
  assert.equal(day.freeHours, 0);
});

test("all staff on full-day PTO zeroes available hours", async () => {
  const { calculateCapacity } = await capacityModule();
  const [day] = calculateCapacity({
    ...baseInputs,
    ptoRecords: [
      { id: "1", userId: "a", startDate: MONDAY, endDate: MONDAY, startPeriod: "full", endPeriod: "full", note: null },
      { id: "2", userId: "b", startDate: MONDAY, endDate: MONDAY, startPeriod: "full", endPeriod: "full", note: null },
    ],
  });
  assert.equal(day.availableHours, 0);
});

test("half-day PTO only deducts half a workday", async () => {
  const { calculateCapacity } = await capacityModule();
  const [day] = calculateCapacity({
    ...baseInputs,
    ptoRecords: [{ id: "1", userId: "a", startDate: MONDAY, endDate: MONDAY, startPeriod: "morning", endPeriod: "morning", note: null }],
  });
  // 2 staff * 8h - 4h (one staffer's morning off) = 12h
  assert.equal(day.availableHours, 12);
});

test("jobs with no estimate fall back to the default and flag the day", async () => {
  const { calculateCapacity } = await capacityModule();
  const [day] = calculateCapacity({
    ...baseInputs,
    jobs: [{ scheduledDate: MONDAY, estimatedDurationMinutes: null, status: "scheduled" }],
  });
  assert.equal(day.committedHours, 2); // 120min default
  assert.equal(day.hasIncompleteEstimates, true);
  assert.equal(day.freeHours, 14);
});

test("cancelled and no-show jobs don't count as committed", async () => {
  const { calculateCapacity } = await capacityModule();
  const [day] = calculateCapacity({
    ...baseInputs,
    jobs: [
      { scheduledDate: MONDAY, estimatedDurationMinutes: 240, status: "cancelled" },
      { scheduledDate: MONDAY, estimatedDurationMinutes: 240, status: "no_show" },
      { scheduledDate: MONDAY, estimatedDurationMinutes: 60, status: "scheduled" },
    ],
  });
  assert.equal(day.committedHours, 1);
  assert.equal(day.hasIncompleteEstimates, false);
});

test("a non-working day (and a holiday) has zero available hours but committed jobs still show as over-committed", async () => {
  const { calculateCapacity } = await capacityModule();
  const [sunday] = calculateCapacity({ ...baseInputs, dates: [SUNDAY], jobs: [{ scheduledDate: SUNDAY, estimatedDurationMinutes: 60, status: "scheduled" }] });
  assert.equal(sunday.availableHours, 0);
  assert.equal(sunday.freeHours, -1);

  const [holiday] = calculateCapacity({ ...baseInputs, holidays: [MONDAY] });
  assert.equal(holiday.availableHours, 0);
});

test("committed hours sum across jobs regardless of crew size on any one job", async () => {
  const { calculateCapacity } = await capacityModule();
  const [day] = calculateCapacity({
    ...baseInputs,
    staffCount: 3,
    jobs: [
      { scheduledDate: MONDAY, estimatedDurationMinutes: 360, status: "scheduled" },
      { scheduledDate: MONDAY, estimatedDurationMinutes: 90, status: "in_progress" },
    ],
  });
  assert.equal(day.committedHours, 7.5);
  assert.equal(day.availableHours, 24);
  assert.equal(day.freeHours, 16.5);
});
