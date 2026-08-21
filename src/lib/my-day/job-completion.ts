/**
 * The single shared rule for "is this job actually finished". Pure — no
 * `@/db` import — so both clock-out routes can call the identical logic
 * instead of maintaining their own copies that can drift apart.
 *
 * See "01_Projects/ServiceSpark/Research/Workday Ledger/01 Root Cause
 * Report.md" D6 and "02 State Model.md" Invariant 4 (binding): a job is
 * complete only when there is no open time entry for it AND every assigned
 * employee has a closed entry. A job with zero assignees is never complete
 * by this rule — completion is something assignees finish, not something
 * that happens by default.
 */

export type AssignmentRef = { userId: string };
export type EntryCompletionRef = { userId: string; clockOut: unknown };

/** `clockOut` is only ever tested for null/non-null here, so callers can
 * pass a `Date | null`, an ISO string, or a Drizzle result column as-is. */
export function isJobFullyComplete(assignments: AssignmentRef[], entries: EntryCompletionRef[]): boolean {
  const hasOpenEntries = entries.some((entry) => !entry.clockOut);
  const completedUserIds = new Set(entries.filter((entry) => entry.clockOut).map((entry) => entry.userId));
  const allAssignedEmployeesFinished =
    assignments.length > 0 && assignments.every((assignment) => completedUserIds.has(assignment.userId));
  return !hasOpenEntries && allAssignedEmployeesFinished;
}
