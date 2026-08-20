import assert from "node:assert/strict";
import test from "node:test";
import {
  applySavedWork,
  closeOutBlockedMessage,
  closeOutReady,
  closeOutRequirements,
  crewWaitingSentence,
  nextStopAfter,
  receiptFor,
  savedWorkFromResponse,
  wrappingUp,
} from "@/app/(app)/my-day/[jobId]/close-out";
import { deriveWorkdayNow, type StopInput } from "@/lib/my-day/workday-state";

const TZ = "America/Chicago";
const TODAY = "2026-08-20";

// 8:58 AM and 11:47 AM in America/Chicago (CDT, UTC-5) on 2026-08-20.
const CLOCK_IN = "2026-08-20T13:58:00.000Z";
const CLOCK_OUT = "2026-08-20T16:47:00.000Z";

function stop(overrides: Partial<StopInput> = {}): StopInput {
  return {
    jobId: "kramer",
    customerFirstName: "Amy",
    customerLastName: "Kramer",
    scheduledDate: TODAY,
    scheduledStartTime: "09:00:00",
    status: "in_progress",
    completedAt: null,
    travelStartedAt: "2026-08-20T13:58:00.000Z",
    arrivedAt: "2026-08-20T14:18:00.000Z",
    workStartedAt: "2026-08-20T14:21:00.000Z",
    myOpenEntry: null,
    myClosedEntry: null,
    coworkers: [],
    ...overrides,
  };
}

const savedStop = (overrides: Partial<StopInput> = {}) =>
  stop({ myClosedEntry: { clockIn: CLOCK_IN, clockOut: CLOCK_OUT, minutesWorked: 169 }, ...overrides });

test("close-out is blocked until a payment answer is given", () => {
  assert.equal(closeOutReady({ hasBeforePhoto: false, hasAfterPhoto: false, paymentMethod: "" }), false);
  assert.equal(closeOutReady({ hasBeforePhoto: true, hasAfterPhoto: true, paymentMethod: "" }), false);
  assert.equal(closeOutReady({ hasBeforePhoto: true, hasAfterPhoto: true, paymentMethod: "cash" }), true);
});

test("photos never block saving: a camera that won't cooperate cannot cost her the record of her work", () => {
  // Confirmed by Kaian 2026-08-20 — photos are tracked, not mandatory.
  assert.equal(closeOutReady({ hasBeforePhoto: false, hasAfterPhoto: false, paymentMethod: "cash" }), true);
  assert.equal(closeOutBlockedMessage({ hasBeforePhoto: false, hasAfterPhoto: false, paymentMethod: "cash" }), null);
  assert.deepEqual(
    closeOutRequirements({ hasBeforePhoto: false, hasAfterPhoto: false, paymentMethod: "" }).map((requirement) => `${requirement.label}:${requirement.required}`),
    ["Before photo:false", "After photo:false", "Payment:true"]
  );
});

test("'nothing collected on-site' is a real answer, not a missing one", () => {
  assert.equal(closeOutReady({ hasBeforePhoto: true, hasAfterPhoto: true, paymentMethod: "not_collected" }), true);
  assert.equal(closeOutBlockedMessage({ hasBeforePhoto: true, hasAfterPhoto: true, paymentMethod: "not_collected" }), null);
});

test("the outstanding item is named, and progress is named tasks rather than a percentage", () => {
  assert.equal(
    closeOutBlockedMessage({ hasBeforePhoto: true, hasAfterPhoto: false, paymentMethod: "" }),
    "Choose what payment you collected before saving your work."
  );
  assert.deepEqual(
    closeOutRequirements({ hasBeforePhoto: true, hasAfterPhoto: false, paymentMethod: "" }).map((requirement) => `${requirement.label}:${requirement.done}`),
    ["Before photo:true", "After photo:false", "Payment:false"]
  );
});

test("the receipt prints the server's persisted values and does not move when the clock does", () => {
  const realNow = Date.now;
  try {
    Date.now = () => Date.parse("2026-08-20T16:47:30.000Z");
    const first = receiptFor(savedStop(), TZ);
    Date.now = () => Date.parse("2026-08-20T16:48:30.000Z");
    const second = receiptFor(savedStop(), TZ);
    assert.equal(first?.receiptLine, "Your work at Amy Kramer is saved · 8:58–11:47 · 2h 49m");
    assert.equal(first?.receiptLine, second?.receiptLine);
  } finally {
    Date.now = realNow;
  }
});

test("the receipt is formatted in company time, not the runtime's timezone", () => {
  // The same instants read 8:58-11:47 in company time and 1:58-4:47 in UTC.
  // Getting this backwards is the D10 bug: every displayed time off by hours.
  assert.equal(receiptFor(savedStop(), TZ)?.receiptLine, "Your work at Amy Kramer is saved · 8:58–11:47 · 2h 49m");
  assert.equal(receiptFor(savedStop(), "UTC")?.receiptLine, "Your work at Amy Kramer is saved · 1:58–4:47 · 2h 49m");
});

test("an unfinished crew job names the coworker and never claims the job is done", () => {
  const receipt = receiptFor(savedStop({ coworkers: [{ firstName: "Brittney", done: false }] }), TZ);
  assert.equal(receipt?.jobCompleted, false);
  assert.equal(receipt?.completionLine, "Waiting on Brittney");
  assert.equal(crewWaitingSentence(receipt!.completionLine), "Waiting on Brittney. This stop isn't finished until everyone saves their work.");
  assert.doesNotMatch(receipt!.receiptLine + receipt!.completionLine, /paid|complete/i);
});

test("only the server's jobCompleted turns the receipt into a marked-done job", () => {
  const saved = { clockIn: CLOCK_IN, clockOut: CLOCK_OUT, minutesWorked: 169, jobCompleted: true };
  const [patched] = applySavedWork([stop({ myOpenEntry: { clockIn: CLOCK_IN }, coworkers: [{ firstName: "Brittney", done: true }] })], "kramer", saved);
  const receipt = receiptFor(patched, TZ);
  assert.equal(receipt?.jobCompleted, true);
  assert.equal(receipt?.completionLine, "Amy Kramer is marked done · it's on your pay week");
  assert.doesNotMatch(receipt!.completionLine, /paid/i);
});

test("saving stops the counter: the patched stop has no open entry left", () => {
  const stops = [stop({ myOpenEntry: { clockIn: CLOCK_IN } })];
  const before = deriveWorkdayNow({ stops, todayIso: TODAY, timeZone: TZ });
  assert.equal(before.recordingSince, CLOCK_IN);

  const after = deriveWorkdayNow({
    stops: applySavedWork(stops, "kramer", { clockIn: CLOCK_IN, clockOut: CLOCK_OUT, minutesWorked: 169, jobCompleted: false }),
    todayIso: TODAY,
    timeZone: TZ,
  });
  assert.equal(after.recordingSince, null);
  assert.equal(after.recordedLine, "Your work at Amy Kramer is saved · 8:58–11:47 · 2h 49m");
});

test("a duplicate tap answers with a receipt, not an error", () => {
  const saved = savedWorkFromResponse({ ok: true, idempotent: true, clockIn: CLOCK_IN, clockOut: CLOCK_OUT, minutesWorked: 169, jobCompleted: false });
  assert.deepEqual(saved, { clockIn: CLOCK_IN, clockOut: CLOCK_OUT, minutesWorked: 169, jobCompleted: false });
  const [patched] = applySavedWork([stop({ myOpenEntry: { clockIn: CLOCK_IN } })], "kramer", saved!);
  assert.equal(receiptFor(patched, TZ)?.receiptLine, "Your work at Amy Kramer is saved · 8:58–11:47 · 2h 49m");
});

test("a response with no saved entry in it is not mistaken for a receipt", () => {
  assert.equal(savedWorkFromResponse({ error: "No open time entry for this job" }), null);
  assert.equal(savedWorkFromResponse(null), null);
});

test("the next stop is the earliest untouched one, and never a stop already under way", () => {
  const stops = [
    savedStop(),
    stop({ jobId: "bell", customerFirstName: "Dana", customerLastName: "Bell", scheduledStartTime: "12:30:00", status: "scheduled", travelStartedAt: null, arrivedAt: null, workStartedAt: null }),
  ];
  assert.equal(nextStopAfter(stops, "kramer", TODAY)?.customerFirstName, "Dana");
  assert.equal(nextStopAfter([savedStop()], "kramer", TODAY), null);
  assert.equal(
    nextStopAfter([savedStop(), stop({ jobId: "bell", travelStartedAt: null, myOpenEntry: { clockIn: CLOCK_IN } })], "kramer", TODAY),
    null
  );
});

test("job detail narrows an active job to wrapping up, and leaves every other state alone", () => {
  const active = deriveWorkdayNow({ stops: [stop({ myOpenEntry: { clockIn: CLOCK_IN } })], todayIso: TODAY, timeZone: TZ });
  assert.equal(active.state, "job_active");

  const wrapped = wrappingUp(active, "kramer", "Amy Kramer");
  assert.equal(wrapped.state, "wrapping_up");
  assert.equal(wrapped.workLine, "Wrapping up Amy Kramer · time still recording");
  assert.equal(wrapped.recordedLine, active.recordedLine);

  const travelling = deriveWorkdayNow({
    stops: [stop({ myOpenEntry: { clockIn: CLOCK_IN }, arrivedAt: null, workStartedAt: null })],
    todayIso: TODAY,
    timeZone: TZ,
  });
  assert.deepEqual(wrappingUp(travelling, "kramer", "Amy Kramer"), travelling);
  assert.deepEqual(wrappingUp(active, "someone-elses-job", "Amy Kramer"), active);
});

test("nothing this module can put on screen says paid, payroll, clocked in, or clock out", () => {
  const strings = [
    closeOutRequirements({ hasBeforePhoto: false, hasAfterPhoto: false, paymentMethod: "" }).map((requirement) => requirement.label).join(" "),
    closeOutBlockedMessage({ hasBeforePhoto: false, hasAfterPhoto: false, paymentMethod: "" }) ?? "",
    closeOutBlockedMessage({ hasBeforePhoto: true, hasAfterPhoto: false, paymentMethod: "" }) ?? "",
    closeOutBlockedMessage({ hasBeforePhoto: true, hasAfterPhoto: true, paymentMethod: "" }) ?? "",
    receiptFor(savedStop({ coworkers: [{ firstName: "Brittney", done: false }] }), TZ)!.receiptLine,
    crewWaitingSentence(receiptFor(savedStop({ coworkers: [{ firstName: "Brittney", done: false }] }), TZ)!.completionLine),
    receiptFor(savedStop({ completedAt: CLOCK_OUT }), TZ)!.completionLine,
    wrappingUp(deriveWorkdayNow({ stops: [stop({ myOpenEntry: { clockIn: CLOCK_IN } })], todayIso: TODAY, timeZone: TZ }), "kramer", "Amy Kramer").workLine,
  ].join(" | ");

  assert.doesNotMatch(strings, /paid|payroll|clocked in|clock out/i);
});
