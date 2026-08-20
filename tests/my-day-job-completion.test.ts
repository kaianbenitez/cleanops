import assert from "node:assert/strict";
import test from "node:test";
import { isJobFullyComplete } from "@/lib/my-day/job-completion";

// D6 / Invariant 4 ("02 State Model.md" §3): completion requires no open
// entries AND every assignee has a closed entry. The pre-fix admin route
// computed completion as `!stillOpen` only — confirmed against the exact
// scenario below to return `true` (the bug) before this module existed.

test("D6 regression: a coworker who never clocked in at all must not read as complete", () => {
  // Worker A closed her entry. Worker B is assigned but has no time_entries
  // row whatsoever — never clocked in. The old admin-route formula only
  // checked "is anything still open", and an entry that was never created
  // can't be open, so it wrongly reported the job complete.
  const assigned = [{ userId: "worker-a" }, { userId: "worker-b" }];
  const entries = [{ userId: "worker-a", clockOut: new Date("2026-08-20T15:00:00Z") }];
  assert.equal(isJobFullyComplete(assigned, entries), false);
});

test("D6: the office closing worker A while worker B is still mid-shift must not complete the job", () => {
  const assigned = [{ userId: "worker-a" }, { userId: "worker-b" }];
  const entries = [
    { userId: "worker-a", clockOut: new Date("2026-08-20T15:00:00Z") },
    { userId: "worker-b", clockOut: null },
  ];
  assert.equal(isJobFullyComplete(assigned, entries), false);
});

test("complete only once every assignee has a closed entry and nothing is still open", () => {
  const assigned = [{ userId: "worker-a" }, { userId: "worker-b" }];
  const entries = [
    { userId: "worker-a", clockOut: new Date("2026-08-20T15:00:00Z") },
    { userId: "worker-b", clockOut: new Date("2026-08-20T15:10:00Z") },
  ];
  assert.equal(isJobFullyComplete(assigned, entries), true);
});

test("a solo job completes on that one assignee's closed entry", () => {
  const assigned = [{ userId: "worker-a" }];
  const entries = [{ userId: "worker-a", clockOut: new Date("2026-08-20T15:00:00Z") }];
  assert.equal(isJobFullyComplete(assigned, entries), true);
});

test("a job with no assignees at all is never complete by this rule", () => {
  assert.equal(isJobFullyComplete([], []), false);
});

test("an unassigned stray entry (admin repair, wrong job) does not count toward completion", () => {
  const assigned = [{ userId: "worker-a" }];
  const entries = [
    { userId: "worker-a", clockOut: new Date("2026-08-20T15:00:00Z") },
    { userId: "someone-not-assigned", clockOut: null },
  ];
  // An open entry for anyone, assigned or not, still blocks completion —
  // "no open entries" is a whole-job fact, not scoped to assignees.
  assert.equal(isJobFullyComplete(assigned, entries), false);
});

test("accepts ISO string clockOut values, not just Date objects", () => {
  const assigned = [{ userId: "worker-a" }];
  const entries = [{ userId: "worker-a", clockOut: "2026-08-20T15:00:00.000Z" }];
  assert.equal(isJobFullyComplete(assigned, entries), true);
});
