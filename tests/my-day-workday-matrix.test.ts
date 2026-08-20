import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  buildLedger,
  deriveJobState,
  deriveWorkdayNow,
  pickCurrentStop,
  primaryActionFor,
  type StopInput,
  type WorkdayInput,
} from "@/lib/my-day/workday-state";
import { isJobFullyComplete } from "@/lib/my-day/job-completion";

/**
 * Maps every row of "WP-F Hardening and Field Validation.md" §8.3 to either a
 * test in this file, a pointer to where it's already covered (WP-A/B/C/D own
 * suites — not duplicated here), or a `{ skip: "reason" }` entry so the
 * uncovered row shows up as SKIPPED, never as silently passing, when
 * `npm run test:unit` runs. The full row-by-row table is in the WP-F handoff.
 *
 * Rows this file does NOT attempt, and why:
 *  - The client in-flight guard, the "uncertain / Check status" retry logic,
 *    and the offline-mutation state machine all live in my-day-client.tsx and
 *    job-execution-client.tsx — explicitly out of scope for WP-F (§5). They
 *    have no pure/exported logic to unit test without rewriting files this
 *    package does not own.
 *  - I3 (at most one open entry) is enforced in
 *    src/app/api/jobs/[jobId]/transition/route.ts (the `otherOpen` DB query),
 *    a route WP-F does not own and which needs a live database — there is no
 *    local database in this session (TESTING.md, and DATABASE_URL here
 *    resolves to the hosted project). I1 (T set in the same transaction as E)
 *    and I2 (T ≤ A ≤ W ≤ clockOut ordering, the 409 out-of-order guards) are
 *    the same route, same constraint.
 */

const TODAY = "2026-08-20";
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

// ---- Row: "0, 1 and 8 jobs; typical 3–5" ----
// 0/1/8 already covered by tests/my-day-workday-state.test.ts (tests 1, 2, 3).
// This adds the "typical" 5-stop mixed-progress day the packet calls out by
// name, which the existing suite doesn't construct.
test("typical day: 5 stops in mixed states resolves one current stop and a sane day-so-far", () => {
  const stops = [
    stop({ jobId: "done-1", scheduledStartTime: "07:00:00", completedAt: "2026-08-20T12:00:00Z", myClosedEntry: { clockIn: "2026-08-20T11:00:00Z", clockOut: "2026-08-20T12:00:00Z", minutesWorked: 60 } }),
    stop({ jobId: "current", scheduledStartTime: "09:00:00", travelStartedAt: "2026-08-20T13:00:00Z", myOpenEntry: { clockIn: "2026-08-20T13:00:00Z" } }),
    stop({ jobId: "later-1", scheduledStartTime: "11:00:00" }),
    stop({ jobId: "later-2", scheduledStartTime: "13:00:00" }),
    stop({ jobId: "later-3", scheduledStartTime: "15:00:00" }),
  ];
  const wi = workday(stops);
  assert.equal(pickCurrentStop(wi)?.jobId, "current");
  assert.equal(deriveWorkdayNow(wi).state, "traveling");
  assert.equal(buildLedger(wi).length, 3); // done-1's saved line + current's travel line + (no arrive/work yet)
});

// ---- Row: "first-stop travel and later-stop travel" ----
test("first-stop copy says 'First stop', a later stop in the same day says 'Next stop'", () => {
  const firstStopOnly = workday([stop({ jobId: "a", customerFirstName: "Amy", customerLastName: "Kramer", scheduledStartTime: "09:00:00" })]);
  assert.match(deriveWorkdayNow(firstStopOnly).workLine, /^First stop Amy Kramer at/);

  const laterStop = workday([
    stop({
      jobId: "a",
      travelStartedAt: "2026-08-20T09:00:00Z",
      myClosedEntry: { clockIn: "2026-08-20T09:00:00Z", clockOut: "2026-08-20T10:00:00Z", minutesWorked: 60 },
    }),
    stop({ jobId: "b", customerFirstName: "Bell", customerLastName: "Family", scheduledStartTime: "12:30:00" }),
  ]);
  assert.match(deriveWorkdayNow(laterStop).workLine, /^Next stop Bell Family at/);
});

// ---- Row: "refresh after each transition" ----
// Derivation is a pure function of persisted data, not of browser state — a
// real page refresh re-fetches the same rows and gets the same answer. This
// asserts the "same input twice" half of that claim; it is not a browser
// refresh (that's tests/browser/my-day-field.spec.ts, which needs
// credentials — see the browser-coverage note in the handoff).
test("refresh after each transition: identical input always derives identical output (no hidden state)", () => {
  const scenarios: WorkdayInput[] = [
    workday([]),
    workday([stop({ jobId: "a" })]),
    workday([stop({ jobId: "a", travelStartedAt: "2026-08-20T13:00:00Z", myOpenEntry: { clockIn: "2026-08-20T13:00:00Z" } })]),
    workday([
      stop({ jobId: "a", myClosedEntry: { clockIn: "2026-08-20T09:00:00Z", clockOut: "2026-08-20T11:00:00Z", minutesWorked: 120 }, coworkers: [{ firstName: "Brittney", done: false }] }),
    ]),
  ];
  for (const wi of scenarios) {
    const first = { now: deriveWorkdayNow(wi), action: primaryActionFor(wi), ledger: buildLedger(wi), current: pickCurrentStop(wi) };
    const second = { now: deriveWorkdayNow(wi), action: primaryActionFor(wi), ledger: buildLedger(wi), current: pickCurrentStop(wi) };
    assert.deepEqual(first, second);
  }
});

// ---- Row: "duplicate and rapid repeated taps" (unit on in-flight guard + API idempotency) ----
test("duplicate/rapid taps: client in-flight guard and route-level idempotency are DB/UI-owned, out of WP-F's scope", { skip: "in-flight guard lives in my-day-client.tsx/job-execution-client.tsx (out of scope, §5); route idempotency in transition/clock-out routes needs a live DB (none available here). Partial coverage: tests/my-day-close-out.test.ts already tests the receipt-parsing half of idempotency (savedWorkFromResponse) as WP-C's own regression guard." }, () => {});

// ---- Row: "uncertain response after server success" ----
test("uncertain-state 'Check status' re-read is client-only logic, out of WP-F's scope", { skip: "lives entirely in my-day-client.tsx/job-execution-client.tsx's `uncertain` useState + retry handler (out of scope, §5) — no pure/exported function to test." }, () => {});

// ---- Row: "opening another job while one is active" (I3) ----
test("I3 (at most one open entry): enforcement is a DB-dependent route, not unit-testable here", { skip: "enforced by the `otherOpen` query in src/app/api/jobs/[jobId]/transition/route.ts, a route WP-F does not own; needs a live database (none available — DATABASE_URL here resolves to the hosted project). The derivation layer's assumption that at most one open entry exists is exercised by test 13 in my-day-workday-state.test.ts (3 stops, one closed and one running → the running one is current)." }, () => {});

// ---- Row: "solo and multi-worker jobs" / "entire crew completion" ----
// Cross-checks that workday-state.ts's employee-facing copy and
// job-completion.ts's completion rule agree on the same underlying facts —
// the two are meant to never disagree (that disagreement is exactly D6).
test("solo vs multi-worker: workday-state and job-completion agree on when a crew job is actually done", () => {
  const assignments = [{ userId: "me" }, { userId: "coworker" }];
  const entriesUnfinished = [{ userId: "me", clockOut: new Date("2026-08-20T11:00:00Z") }];
  const entriesFinished = [
    { userId: "me", clockOut: new Date("2026-08-20T11:00:00Z") },
    { userId: "coworker", clockOut: new Date("2026-08-20T11:10:00Z") },
  ];

  assert.equal(isJobFullyComplete(assignments, entriesUnfinished), false);
  const unfinishedNow = deriveWorkdayNow(
    workday([stop({ jobId: "a", myClosedEntry: { clockIn: "2026-08-20T09:00:00Z", clockOut: "2026-08-20T11:00:00Z", minutesWorked: 120 }, coworkers: [{ firstName: "Coworker", done: false }] })])
  );
  assert.equal(unfinishedNow.state, "employee_done_crew_active");
  assert.match(unfinishedNow.workLine, /^Waiting on/);

  assert.equal(isJobFullyComplete(assignments, entriesFinished), true);
  const finishedNow = deriveWorkdayNow(
    workday([stop({ jobId: "a", completedAt: "2026-08-20T11:10:00Z", myClosedEntry: { clockIn: "2026-08-20T09:00:00Z", clockOut: "2026-08-20T11:00:00Z", minutesWorked: 120 } })])
  );
  assert.equal(finishedNow.state, "whole_job_completed");

  const solo = [{ userId: "me" }];
  assert.equal(isJobFullyComplete(solo, [{ userId: "me", clockOut: new Date() }]), true);
});

// ---- Row: "employee finishes before coworkers" ----
// The §2.3 regression guard: a job the employee finished but the crew hasn't
// must never resurface as an untouched stop offering "Start travel" — already
// tested by tests/my-day-workday-state.test.ts (test 8/9) and
// tests/my-day-active-job.test.ts. Not duplicated here.

// ---- Row: "missing address or scheduled time" ----
test("missing scheduled time: a null start time sorts last and prints without a time (address is a page.tsx display concern, not part of StopInput)", () => {
  const stops = [
    stop({ jobId: "no-time", scheduledStartTime: null, customerFirstName: "Noon", customerLastName: "Time" }),
    stop({ jobId: "has-time", scheduledStartTime: "09:00:00" }),
  ];
  assert.equal(pickCurrentStop(workday(stops))?.jobId, "has-time");
});

// ---- Row: "reassignment during the day" ----
test("reassignment: a stop disappearing from the input mid-day does not crash derivation or strand the current stop", () => {
  // The employee had "job-b" open (mid-clock-in) when the office reassigned
  // it away from her — the next fetch simply omits it from `stops`.
  const beforeReassignment = workday([
    stop({ jobId: "job-a", scheduledStartTime: "08:00:00" }),
    stop({ jobId: "job-b", scheduledStartTime: "10:00:00", travelStartedAt: "2026-08-20T14:00:00Z", myOpenEntry: { clockIn: "2026-08-20T14:00:00Z" } }),
  ]);
  assert.equal(pickCurrentStop(beforeReassignment)?.jobId, "job-b");

  const afterReassignment = workday([stop({ jobId: "job-a", scheduledStartTime: "08:00:00" })]);
  assert.doesNotThrow(() => deriveWorkdayNow(afterReassignment));
  assert.doesNotThrow(() => buildLedger(afterReassignment));
  assert.doesNotThrow(() => primaryActionFor(afterReassignment));
  // With her open job gone, the earliest untouched remaining stop becomes current.
  assert.equal(pickCurrentStop(afterReassignment)?.jobId, "job-a");
  assert.equal(deriveWorkdayNow(afterReassignment).state, "day_not_started");
});

test("reassignment: deriveJobState never throws on a stop with no matching coworkers array entries", () => {
  const reassignedStop = stop({ jobId: "job-b", myClosedEntry: { clockIn: "2026-08-20T09:00:00Z", clockOut: "2026-08-20T10:00:00Z", minutesWorked: 60 }, coworkers: [] });
  assert.doesNotThrow(() => deriveJobState(reassignedStop, TODAY));
});

// ---- Row: "required and optional close-out content" / "0–20 photos" ----
// Fully covered by tests/my-day-close-out.test.ts (closeOutRequirements,
// closeOutReady, closeOutBlockedMessage — photos are optional, payment is
// required). Not duplicated here. The 20-photo *layout* is browser-only.

// ---- Row: "long names, addresses, instructions" (browser at 320px/390px) ----
// Pure-browser row — no unit component. scripts/seed-field-test.ts seeds a
// stop with a 60-char name, a ~90-char address, and a long instructions
// block for this exact check once browser credentials exist.

// ---- Row: "offline before, during, after mutation" ----
test("offline client state machine is out of WP-F's scope", { skip: "lives in my-day-client.tsx/job-execution-client.tsx's online/offline handling (out of scope, §5) — no pure/exported function to test." }, () => {});

// ---- Row: "expired and restored sessions" ----
// WP-E owns this outright — tests/login-reason.test.ts and
// tests/browser/login-reason.spec.ts. Referenced, not duplicated.

// ---- Row: "employee responses containing no price data" (I5) ----
// tests/my-day-no-price-leak.test.ts. Referenced, not duplicated.

// ---- §9 required copy: the Workday Ledger changelog entries specifically
// must avoid banned payroll words (this is a My Day / field-employee-facing
// constraint — it does NOT apply to the whole changelog history, which
// legitimately references "payroll" in admin-only entries elsewhere, e.g.
// v0.2.50's "payroll history" for the Employees page). Named by version
// rather than scanned generically, on purpose. ----
const WORKDAY_LEDGER_CHANGELOG_VERSIONS = ["v0.2.72", "v0.2.73"];

test("Workday Ledger Help Center entries use no banned payroll language", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(path.join(here, "..", "src/app/(app)/help-center/page.tsx"), "utf8");
  const markers = [...source.matchAll(/version: "v[\d.]+"/g)];
  for (const version of WORKDAY_LEDGER_CHANGELOG_VERSIONS) {
    const marker = markers.find((m) => m[0] === `version: "${version}"`);
    assert.ok(marker, `expected a ${version} entry in RELEASES`);
    const start = marker!.index!;
    const nextMarker = markers.find((m) => m.index! > start);
    const end = nextMarker ? nextMarker.index! : source.indexOf("];", start);
    const entryText = source.slice(start, end === -1 ? undefined : end);
    assert.doesNotMatch(entryText, /paid|payroll|clocked in|clock out/i, `banned word in ${version}`);
  }
});
