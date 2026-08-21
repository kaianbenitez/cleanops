import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLedger,
  deriveWorkdayNow,
  pickCurrentStop,
  primaryActionFor,
  type StopInput,
  type WorkdayInput,
} from "@/lib/my-day/workday-state";

const TODAY = "2026-08-20";
// Fixed for every test below (unless a test overrides it explicitly) so
// assertions can pin exact copy instead of a loose regex — the whole point
// of threading the zone through explicitly.
const DEFAULT_TZ = "America/New_York";

function stop(overrides: Partial<StopInput> & { jobId: string }): StopInput {
  return {
    customerFirstName: "Kramer",
    customerLastName: "Family",
    scheduledDate: TODAY,
    scheduledStartTime: "09:00:00",
    status: "scheduled",
    completedAt: null,
    travelStartedAt: null,
    arrivedAt: null,
    workStartedAt: null,
    myOpenEntry: null,
    myClosedEntry: null,
    coworkers: [],
    ...overrides,
  };
}

function workday(stops: StopInput[], timeZone: string = DEFAULT_TZ): WorkdayInput {
  return { stops, todayIso: TODAY, timeZone };
}

test("1. zero stops → day complete, empty ledger, no action", () => {
  const wi = workday([]);
  assert.equal(deriveWorkdayNow(wi).state, "day_complete");
  assert.deepEqual(buildLedger(wi), []);
  assert.equal(primaryActionFor(wi).id, "none");
});

test("2. one untouched stop → day not started, action start travel", () => {
  const wi = workday([stop({ jobId: "a" })]);
  assert.equal(deriveWorkdayNow(wi).state, "day_not_started");
  assert.equal(primaryActionFor(wi).id, "start_travel");
});

test("3. eight untouched stops → current stop is the earliest by scheduled start time", () => {
  const times = ["13:00:00", "09:00:00", "11:00:00", "10:00:00", "15:00:00", "08:00:00", "14:00:00", "12:00:00"];
  const stops = times.map((t, i) => stop({ jobId: `job-${i}`, scheduledStartTime: t }));
  assert.equal(pickCurrentStop(workday(stops))?.jobId, "job-5"); // 08:00:00
});

test("4. a null scheduled start time sorts last, not first", () => {
  const stops = [
    stop({ jobId: "no-time", scheduledStartTime: null }),
    stop({ jobId: "early", scheduledStartTime: "09:00:00" }),
  ];
  assert.equal(pickCurrentStop(workday(stops))?.jobId, "early");
});

test("5. travel started, not arrived → traveling, action arrived, recorded line names since", () => {
  const wi = workday([
    stop({ jobId: "a", travelStartedAt: "2026-08-20T13:00:00.000Z", myOpenEntry: { clockIn: "2026-08-20T13:00:00.000Z" } }),
  ]);
  const now = deriveWorkdayNow(wi);
  assert.equal(now.state, "traveling");
  assert.match(now.recordedLine, /since/);
  assert.equal(primaryActionFor(wi).id, "arrived");
});

test("6. arrived, not working → arrived, action start work", () => {
  const wi = workday([
    stop({
      jobId: "a",
      travelStartedAt: "2026-08-20T13:00:00.000Z",
      arrivedAt: "2026-08-20T13:18:00.000Z",
      myOpenEntry: { clockIn: "2026-08-20T13:00:00.000Z" },
    }),
  ]);
  assert.equal(deriveWorkdayNow(wi).state, "arrived");
  assert.equal(primaryActionFor(wi).id, "start_work");
});

test("7. working → job active, action wrap up", () => {
  const wi = workday([
    stop({
      jobId: "a",
      travelStartedAt: "2026-08-20T13:00:00.000Z",
      arrivedAt: "2026-08-20T13:18:00.000Z",
      workStartedAt: "2026-08-20T13:21:00.000Z",
      myOpenEntry: { clockIn: "2026-08-20T13:00:00.000Z" },
    }),
  ]);
  assert.equal(deriveWorkdayNow(wi).state, "job_active");
  assert.equal(primaryActionFor(wi).id, "wrap_up");
});

test("8/9. closed entry with a coworker still working → employee done, crew active; never resurfaces as a fresh stop", () => {
  const closedStop = stop({
    jobId: "a",
    travelStartedAt: "2026-08-20T12:58:00.000Z",
    arrivedAt: "2026-08-20T13:18:00.000Z",
    workStartedAt: "2026-08-20T13:21:00.000Z",
    myClosedEntry: { clockIn: "2026-08-20T12:58:00.000Z", clockOut: "2026-08-20T15:47:00.000Z", minutesWorked: 169 },
    coworkers: [{ firstName: "Brittney", done: false }],
  });
  const wi = workday([closedStop]);
  const now = deriveWorkdayNow(wi);
  assert.equal(now.state, "employee_done_crew_active");
  assert.match(now.workLine, /Brittney/);

  // Regression guard for the worst surviving defect: a stop she already
  // finished must never come back as an untouched route stop offering to
  // start travel again.
  assert.equal(pickCurrentStop(wi), null);
  assert.notEqual(primaryActionFor(wi).id, "start_travel");
});

test("10. closed entry with the job marked complete → whole job completed, pay-week copy", () => {
  const wi = workday([
    stop({
      jobId: "a",
      travelStartedAt: "2026-08-20T12:58:00.000Z",
      arrivedAt: "2026-08-20T13:18:00.000Z",
      workStartedAt: "2026-08-20T13:21:00.000Z",
      completedAt: "2026-08-20T15:47:00.000Z",
      myClosedEntry: { clockIn: "2026-08-20T12:58:00.000Z", clockOut: "2026-08-20T15:47:00.000Z", minutesWorked: 169 },
    }),
  ]);
  const now = deriveWorkdayNow(wi);
  assert.equal(now.state, "whole_job_completed");
  assert.match(now.workLine, /it's on your pay week/);
});

test("11. every stop closed and completed → day complete", () => {
  const closed = (jobId: string, start: string, end: string) =>
    stop({
      jobId,
      travelStartedAt: start,
      arrivedAt: start,
      workStartedAt: start,
      completedAt: end,
      myClosedEntry: { clockIn: start, clockOut: end, minutesWorked: 120 },
    });
  const wi = workday([
    closed("a", "2026-08-20T09:00:00.000Z", "2026-08-20T11:00:00.000Z"),
    closed("b", "2026-08-20T11:30:00.000Z", "2026-08-20T13:30:00.000Z"),
  ]);
  assert.equal(deriveWorkdayNow(wi).state, "day_complete");
});

test("12. an open entry dated yesterday surfaces as stale, not offered as today's fresh stop", () => {
  const wi = workday([
    stop({
      jobId: "a",
      scheduledDate: "2026-08-19",
      travelStartedAt: "2026-08-19T13:00:00.000Z",
      myOpenEntry: { clockIn: "2026-08-19T13:00:00.000Z" },
    }),
  ]);
  const now = deriveWorkdayNow(wi);
  assert.equal(now.state, "stale_entry");
  assert.notEqual(primaryActionFor(wi).id, "start_travel");
});

test("12b. a stale entry's recorded line names the prior weekday, never claims a fresh today start", () => {
  const wi = workday([
    stop({
      jobId: "a",
      scheduledDate: "2026-08-19", // a Wednesday
      travelStartedAt: "2026-08-19T13:00:00.000Z",
      myOpenEntry: { clockIn: "2026-08-19T13:00:00.000Z" },
    }),
  ]);
  const now = deriveWorkdayNow(wi);
  assert.equal(now.recordedLine, "Still recording from Wed at Kramer Family, since 9:00 AM");
  assert.doesNotMatch(now.recordedLine, /^Recording your time/);
});

test("timestamps render in the caller's timeZone, not the runtime's — the same instant is 8:58 AM in New York and 12:58 PM in UTC", () => {
  const clockIn = "2026-08-20T12:58:00.000Z"; // Jaelie's 8:58 AM Eastern clock-in
  const stops = [stop({ jobId: "a", travelStartedAt: clockIn, myOpenEntry: { clockIn } })];

  const ny = deriveWorkdayNow(workday(stops, "America/New_York"));
  assert.equal(ny.recordedLine, "Recording your time on Kramer Family · since 8:58 AM");

  const utc = deriveWorkdayNow(workday(stops, "UTC"));
  assert.equal(utc.recordedLine, "Recording your time on Kramer Family · since 12:58 PM");
});

test("13. 3 stops, one closed and one running → current stop is the running one, not stop index 0", () => {
  const wi = workday([
    stop({
      jobId: "closed",
      scheduledStartTime: "08:00:00",
      travelStartedAt: "2026-08-20T08:00:00.000Z",
      myClosedEntry: { clockIn: "2026-08-20T08:00:00.000Z", clockOut: "2026-08-20T09:00:00.000Z", minutesWorked: 60 },
    }),
    stop({
      jobId: "running",
      scheduledStartTime: "10:00:00",
      travelStartedAt: "2026-08-20T10:00:00.000Z",
      myOpenEntry: { clockIn: "2026-08-20T10:00:00.000Z" },
    }),
    stop({ jobId: "untouched", scheduledStartTime: "13:00:00" }),
  ]);
  assert.equal(pickCurrentStop(wi)?.jobId, "running");
});

test("14. the ledger sorts ascending and omits events with no source timestamp", () => {
  const wi = workday([
    stop({
      jobId: "a",
      travelStartedAt: "2026-08-20T13:00:00.000Z",
      arrivedAt: "2026-08-20T13:18:00.000Z",
      workStartedAt: null,
      myOpenEntry: { clockIn: "2026-08-20T13:00:00.000Z" },
    }),
    stop({
      jobId: "b",
      travelStartedAt: "2026-08-20T09:00:00.000Z",
      arrivedAt: "2026-08-20T09:18:00.000Z",
      workStartedAt: "2026-08-20T09:21:00.000Z",
      completedAt: "2026-08-20T11:00:00.000Z",
      myClosedEntry: { clockIn: "2026-08-20T09:00:00.000Z", clockOut: "2026-08-20T11:00:00.000Z", minutesWorked: 120 },
    }),
  ]);
  const ledger = buildLedger(wi);
  const timestamps = ledger.map((event) => event.at);
  const sorted = [...timestamps].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  assert.deepEqual(timestamps, sorted);
  assert.equal(
    ledger.some((event) => event.jobId === "a" && event.kind === "work"),
    false,
  );
  // job a: travel + arrive = 2 events (no work-started, no entry, no completion).
  // job b: travel + arrive + work + saved + completed = 5 events.
  assert.equal(ledger.length, 7);
});

test("15. no string returned by any exported function ever says paid, payroll, or clock", () => {
  const forbidden = /paid|payroll|clock/i;

  const scenarios: WorkdayInput[] = [
    workday([]), // day_complete, zero stops
    workday([stop({ jobId: "a" })]), // day_not_started
    workday([
      stop({ jobId: "a", travelStartedAt: "2026-08-20T13:00:00.000Z", myOpenEntry: { clockIn: "2026-08-20T13:00:00.000Z" } }),
    ]), // traveling
    workday([
      stop({
        jobId: "a",
        travelStartedAt: "2026-08-20T13:00:00.000Z",
        arrivedAt: "2026-08-20T13:18:00.000Z",
        myOpenEntry: { clockIn: "2026-08-20T13:00:00.000Z" },
      }),
    ]), // arrived
    workday([
      stop({
        jobId: "a",
        travelStartedAt: "2026-08-20T13:00:00.000Z",
        arrivedAt: "2026-08-20T13:18:00.000Z",
        workStartedAt: "2026-08-20T13:21:00.000Z",
        myOpenEntry: { clockIn: "2026-08-20T13:00:00.000Z" },
      }),
    ]), // job_active
    workday([
      stop({
        jobId: "a",
        myClosedEntry: { clockIn: "2026-08-20T09:00:00.000Z", clockOut: "2026-08-20T11:00:00.000Z", minutesWorked: 120 },
        coworkers: [{ firstName: "Brittney", done: false }],
      }),
    ]), // employee_done_crew_active
    workday([
      stop({
        jobId: "a",
        completedAt: "2026-08-20T11:00:00.000Z",
        myClosedEntry: { clockIn: "2026-08-20T09:00:00.000Z", clockOut: "2026-08-20T11:00:00.000Z", minutesWorked: 120 },
      }),
    ]), // whole_job_completed
    workday([
      stop({
        jobId: "a",
        travelStartedAt: "2026-08-20T09:00:00.000Z",
        myClosedEntry: { clockIn: "2026-08-20T09:00:00.000Z", clockOut: "2026-08-20T10:00:00.000Z", minutesWorked: 60 },
      }),
      stop({ jobId: "b" }),
    ]), // between_jobs
    workday([
      stop({
        jobId: "a",
        travelStartedAt: "2026-08-20T08:00:00.000Z",
        arrivedAt: "2026-08-20T08:18:00.000Z",
        workStartedAt: "2026-08-20T08:21:00.000Z",
        completedAt: "2026-08-20T10:00:00.000Z",
        myClosedEntry: { clockIn: "2026-08-20T08:00:00.000Z", clockOut: "2026-08-20T10:00:00.000Z", minutesWorked: 120 },
      }),
      stop({
        jobId: "b",
        travelStartedAt: "2026-08-20T10:30:00.000Z",
        arrivedAt: "2026-08-20T10:48:00.000Z",
        workStartedAt: "2026-08-20T10:51:00.000Z",
        completedAt: "2026-08-20T12:00:00.000Z",
        myClosedEntry: { clockIn: "2026-08-20T10:30:00.000Z", clockOut: "2026-08-20T12:00:00.000Z", minutesWorked: 90 },
      }),
    ]), // day_complete, every stop closed
    workday([
      stop({
        jobId: "a",
        scheduledDate: "2026-08-19",
        travelStartedAt: "2026-08-19T13:00:00.000Z",
        myOpenEntry: { clockIn: "2026-08-19T13:00:00.000Z" },
      }),
    ]), // stale_entry
  ];

  for (const scenario of scenarios) {
    const now = deriveWorkdayNow(scenario);
    assert.doesNotMatch(now.recordedLine, forbidden, `recordedLine: "${now.recordedLine}"`);
    assert.doesNotMatch(now.workLine, forbidden, `workLine: "${now.workLine}"`);

    const action = primaryActionFor(scenario);
    assert.doesNotMatch(action.label, forbidden, `action label: "${action.label}"`);

    for (const event of buildLedger(scenario)) {
      assert.doesNotMatch(event.text, forbidden, `ledger event: "${event.text}"`);
    }
  }
});
