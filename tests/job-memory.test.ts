import assert from "node:assert/strict";
import test from "node:test";

// job-memory.ts imports "@/db", which throws at import time without
// DATABASE_URL — same reason tests/capacity.test.ts sets this before its
// dynamic import. buildCustomerSchedulingProfile itself never touches the DB.
async function jobMemoryModule() {
  process.env.DATABASE_URL ??= "postgres://user:password@localhost:5432/cleanops";
  return import("@/lib/scheduling/job-memory");
}

type Frequency = "weekly" | "biweekly" | "every4weeks" | "monthly" | "custom" | null;
type CompletedJobRow = {
  id: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number | null;
  recurringSeriesFrequency: Frequency;
  recurringSeriesIntervalWeeks: number | null;
};
type JobAssignmentRow = { jobId: string; userId: string; firstName: string; lastName: string };
type TimeEntryRow = { jobId: string; userId: string; minutesWorked: number | null };
type Stated = { preferredCleanerId: string | null; preferredDay: string | null; preferredTimeOfDay: "AM" | "PM" | null; recurrence: "none" | "weekly" | "biweekly" | "every4weeks" | "monthly" | null };

function completedJob(overrides: Partial<CompletedJobRow> & { id: string; scheduledDate: string }): CompletedJobRow {
  return {
    scheduledStartTime: null,
    estimatedDurationMinutes: 120,
    recurringSeriesFrequency: null,
    recurringSeriesIntervalWeeks: null,
    ...overrides,
  };
}

function baseInputs(overrides: Partial<{
  customerId: string;
  asOfDate: string;
  completedJobs: CompletedJobRow[];
  jobAssignments: JobAssignmentRow[];
  timeEntries: TimeEntryRow[];
  nonFutureJobs: Array<{ status: string }>;
  stated: Stated;
}> = {}) {
  return {
    customerId: "cust-1",
    asOfDate: "2026-08-14",
    completedJobs: [] as CompletedJobRow[],
    jobAssignments: [] as JobAssignmentRow[],
    timeEntries: [] as TimeEntryRow[],
    nonFutureJobs: [] as Array<{ status: string }>,
    stated: { preferredCleanerId: null, preferredDay: null, preferredTimeOfDay: null, recurrence: null },
    ...overrides,
  };
}

test("a customer with zero completed jobs gets a valid, all-empty profile without throwing", async () => {
  const { buildCustomerSchedulingProfile } = await jobMemoryModule();
  const profile = buildCustomerSchedulingProfile(baseInputs());
  assert.deepEqual(profile, {
    customerId: "cust-1",
    sampleSize: 0,
    lastVisit: null,
    typicalGapDays: null,
    expectedGapDays: null,
    nextDueDate: null,
    usualWeekdays: [],
    usualWeekdayShare: 0,
    usualWindow: null,
    usualWindowShare: 0,
    medianStartTime: null,
    regularCrew: [],
    medianActualMinutes: null,
    durationDriftFactor: null,
    cancellationRate: 0,
    stated: { preferredCleanerId: null, preferredWeekday: null, preferredWindow: null },
  });
});

// 2026-05-04 and 2026-05-11 are Mondays (weekday 1); 2026-06-04 through
// 2026-07-09 are Thursdays (weekday 4), 07-09 being the most recent.
const MONDAYS = ["2026-05-04", "2026-05-11"];
const THURSDAYS = ["2026-06-04", "2026-06-11", "2026-06-18", "2026-06-25", "2026-07-02", "2026-07-09"];

function regularCustomerJobs(): CompletedJobRow[] {
  return [
    ...MONDAYS.map((date, index) => completedJob({ id: `mon-${index}`, scheduledDate: date, scheduledStartTime: "13:00:00" })),
    ...THURSDAYS.map((date, index) => completedJob({ id: `thu-${index}`, scheduledDate: date, scheduledStartTime: "09:00:00" })),
  ];
}

test("a clear Thursday-morning regular is detected with the right share, median time, and crew", async () => {
  const { buildCustomerSchedulingProfile } = await jobMemoryModule();
  const completedJobs = regularCustomerJobs();
  const jobAssignments: JobAssignmentRow[] = [
    ...completedJobs.map((job) => ({ jobId: job.id, userId: "maria", firstName: "Maria", lastName: "G" })),
    ...MONDAYS.map((_, index) => ({ jobId: `mon-${index}`, userId: "alex", firstName: "Alex", lastName: "H" })),
  ];

  const profile = buildCustomerSchedulingProfile(baseInputs({ completedJobs, jobAssignments, nonFutureJobs: completedJobs.map(() => ({ status: "completed" })) }));

  assert.equal(profile.sampleSize, 8);
  assert.deepEqual(profile.usualWeekdays, [4]);
  assert.equal(profile.usualWeekdayShare, 0.75);
  assert.equal(profile.usualWindow, "morning");
  assert.equal(profile.usualWindowShare, 0.75);
  assert.equal(profile.medianStartTime, "09:00:00");
  assert.equal(profile.cancellationRate, 0);

  assert.equal(profile.regularCrew.length, 2);
  assert.equal(profile.regularCrew[0].userId, "maria");
  assert.equal(profile.regularCrew[0].visits, 8);
  assert.equal(profile.regularCrew[0].workedLastVisit, true); // 07-09 (most recent) is a Thursday Maria worked.
  assert.equal(profile.regularCrew[1].userId, "alex");
  assert.equal(profile.regularCrew[1].visits, 2);
  assert.equal(profile.regularCrew[1].workedLastVisit, false);
});

test("an even weekday split produces no usual day (a tie is not a plurality)", async () => {
  const { buildCustomerSchedulingProfile } = await jobMemoryModule();
  // 4 Mondays + 4 Thursdays: tied at 4 each, so neither is a unique mode.
  const completedJobs: CompletedJobRow[] = [
    ...["2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27"].map((date, index) => completedJob({ id: `mon-${index}`, scheduledDate: date, scheduledStartTime: "13:00:00" })),
    ...THURSDAYS.slice(0, 4).map((date, index) => completedJob({ id: `thu-${index}`, scheduledDate: date, scheduledStartTime: "09:00:00" })),
  ];

  const profile = buildCustomerSchedulingProfile(baseInputs({ completedJobs }));

  assert.equal(profile.sampleSize, 8);
  assert.deepEqual(profile.usualWeekdays, []);
  assert.equal(profile.usualWeekdayShare, 0);
});

function driftInputs(actualPerJob: number, estimatePerJob: number) {
  const completedJobs: CompletedJobRow[] = [0, 1, 2].map((index) =>
    completedJob({ id: `job-${index}`, scheduledDate: `2026-0${index + 1}-10`, scheduledStartTime: "09:00:00", estimatedDurationMinutes: estimatePerJob })
  );
  const timeEntries: TimeEntryRow[] = completedJobs.map((job) => ({ jobId: job.id, userId: "maria", minutesWorked: actualPerJob }));
  return baseInputs({ completedJobs, timeEntries });
}

test("duration drift factor clamps at the upper bound (2.0)", async () => {
  const { buildCustomerSchedulingProfile } = await jobMemoryModule();
  const profile = buildCustomerSchedulingProfile(driftInputs(400, 100)); // raw factor 4.0
  assert.equal(profile.medianActualMinutes, 400);
  assert.equal(profile.durationDriftFactor, 2.0);
});

test("duration drift factor clamps at the lower bound (0.5)", async () => {
  const { buildCustomerSchedulingProfile } = await jobMemoryModule();
  const profile = buildCustomerSchedulingProfile(driftInputs(20, 100)); // raw factor 0.2
  assert.equal(profile.medianActualMinutes, 20);
  assert.equal(profile.durationDriftFactor, 0.5);
});

test("fewer than 3 usable duration jobs leaves medianActualMinutes and durationDriftFactor null", async () => {
  const { buildCustomerSchedulingProfile } = await jobMemoryModule();
  const completedJobs: CompletedJobRow[] = [
    completedJob({ id: "job-0", scheduledDate: "2026-01-10", scheduledStartTime: "09:00:00" }),
    completedJob({ id: "job-1", scheduledDate: "2026-01-17", scheduledStartTime: "09:00:00" }),
  ];
  const timeEntries: TimeEntryRow[] = completedJobs.map((job) => ({ jobId: job.id, userId: "maria", minutesWorked: 130 }));
  const profile = buildCustomerSchedulingProfile(baseInputs({ completedJobs, timeEntries }));
  assert.equal(profile.medianActualMinutes, null);
  assert.equal(profile.durationDriftFactor, null);
});

test("cancellation rate covers all non-future jobs, not just the completed sample", async () => {
  const { buildCustomerSchedulingProfile } = await jobMemoryModule();
  const nonFutureJobs = [{ status: "completed" }, { status: "completed" }, { status: "cancelled" }, { status: "no_show" }];
  const profile = buildCustomerSchedulingProfile(baseInputs({ nonFutureJobs }));
  assert.equal(profile.cancellationRate, 0.5);
});

test("stated preferences parse free-text weekdays and the AM/PM enum", async () => {
  const { buildCustomerSchedulingProfile } = await jobMemoryModule();
  const profile = buildCustomerSchedulingProfile(
    baseInputs({ stated: { preferredCleanerId: "maria", preferredDay: "Thursdays", preferredTimeOfDay: "AM", recurrence: null } })
  );
  assert.deepEqual(profile.stated, { preferredCleanerId: "maria", preferredWeekday: 4, preferredWindow: "morning" });

  const unparseable = buildCustomerSchedulingProfile(baseInputs({ stated: { preferredCleanerId: null, preferredDay: "whenever works", preferredTimeOfDay: null, recurrence: null } }));
  assert.equal(unparseable.stated.preferredWeekday, null);
});

// ---- Requirement 1: recency and cadence ----

test("lastVisit reports the most recent completed job, its crew, and daysAgo against the company-local asOfDate", async () => {
  const { buildCustomerSchedulingProfile } = await jobMemoryModule();
  const completedJobs = [completedJob({ id: "job-1", scheduledDate: "2026-08-10" })];
  const jobAssignments: JobAssignmentRow[] = [{ jobId: "job-1", userId: "maria", firstName: "Maria", lastName: "G" }];
  const profile = buildCustomerSchedulingProfile(baseInputs({ asOfDate: "2026-08-14", completedJobs, jobAssignments }));

  assert.deepEqual(profile.lastVisit, {
    jobId: "job-1",
    date: "2026-08-10",
    daysAgo: 4,
    employees: [{ userId: "maria", firstName: "Maria", lastName: "G" }],
  });
});

test("typicalGapDays needs at least 3 visits (2 gaps) to measure, else null", async () => {
  const { buildCustomerSchedulingProfile } = await jobMemoryModule();
  const twoVisits = [completedJob({ id: "a", scheduledDate: "2026-07-01" }), completedJob({ id: "b", scheduledDate: "2026-07-31" })];
  const twoProfile = buildCustomerSchedulingProfile(baseInputs({ completedJobs: twoVisits }));
  assert.equal(twoProfile.typicalGapDays, null);

  // Add a third visit 30 days after the second — two 30-day gaps, median 30.
  const threeVisits = [...twoVisits, completedJob({ id: "c", scheduledDate: "2026-08-30" })];
  const threeProfile = buildCustomerSchedulingProfile(baseInputs({ completedJobs: threeVisits }));
  assert.equal(threeProfile.typicalGapDays, 30);
});

test("nextDueDate prefers the measured gap over the booked cadence — what they actually do beats what they were sold", async () => {
  const { buildCustomerSchedulingProfile } = await jobMemoryModule();
  // Three visits ten days apart (measured cadence 10), but the most recent
  // job belongs to a "monthly" (30-day) recurring series.
  const completedJobs = [
    completedJob({ id: "a", scheduledDate: "2026-07-01" }),
    completedJob({ id: "b", scheduledDate: "2026-07-11" }),
    completedJob({ id: "c", scheduledDate: "2026-07-21", recurringSeriesFrequency: "monthly" }),
  ];
  const profile = buildCustomerSchedulingProfile(baseInputs({ completedJobs }));
  assert.equal(profile.typicalGapDays, 10);
  assert.equal(profile.expectedGapDays, 30);
  assert.equal(profile.nextDueDate, "2026-07-31"); // last visit (07-21) + measured 10 days, not booked 30.
});

test("nextDueDate falls back to the booked cadence when there's no measured gap yet", async () => {
  const { buildCustomerSchedulingProfile } = await jobMemoryModule();
  const completedJobs = [completedJob({ id: "a", scheduledDate: "2026-07-01", recurringSeriesFrequency: "weekly" })];
  const profile = buildCustomerSchedulingProfile(baseInputs({ completedJobs }));
  assert.equal(profile.typicalGapDays, null);
  assert.equal(profile.expectedGapDays, 7);
  assert.equal(profile.nextDueDate, "2026-07-08");
});

test("expectedGapDays maps every4weeks and custom (intervalWeeks x 7) from the most recent job's series", async () => {
  const { buildCustomerSchedulingProfile } = await jobMemoryModule();

  const every4 = buildCustomerSchedulingProfile(baseInputs({ completedJobs: [completedJob({ id: "a", scheduledDate: "2026-07-01", recurringSeriesFrequency: "every4weeks" })] }));
  assert.equal(every4.expectedGapDays, 28);

  const custom = buildCustomerSchedulingProfile(baseInputs({ completedJobs: [completedJob({ id: "a", scheduledDate: "2026-07-01", recurringSeriesFrequency: "custom", recurringSeriesIntervalWeeks: 5 })] }));
  assert.equal(custom.expectedGapDays, 35);
});

test("expectedGapDays falls back to customers.recurrence when the most recent job has no series, and 'none' yields null", async () => {
  const { buildCustomerSchedulingProfile } = await jobMemoryModule();
  const completedJobs = [completedJob({ id: "a", scheduledDate: "2026-07-01" })]; // no recurringSeriesFrequency

  const biweekly = buildCustomerSchedulingProfile(baseInputs({ completedJobs, stated: { preferredCleanerId: null, preferredDay: null, preferredTimeOfDay: null, recurrence: "biweekly" } }));
  assert.equal(biweekly.expectedGapDays, 14);

  const none = buildCustomerSchedulingProfile(baseInputs({ completedJobs, stated: { preferredCleanerId: null, preferredDay: null, preferredTimeOfDay: null, recurrence: "none" } }));
  assert.equal(none.expectedGapDays, null);
  assert.equal(none.nextDueDate, null); // no measured gap (only 1 visit) and no expected gap either.
});
