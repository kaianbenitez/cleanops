/**
 * Pure, testable helpers for job close-out. No React, no fetch, no
 * `Date.now()` — everything here is a function of its arguments, so the
 * receipt it produces is identical on the tenth render and the first.
 *
 * State comes from `@/lib/my-day/workday-state` and nowhere else. The
 * receipt and completion strings below are produced by calling
 * `deriveWorkdayNow` on a single patched stop rather than by formatting the
 * times again here: a second copy of that formatting is exactly how the two
 * screens learned to disagree.
 *
 * See "01_Projects/ServiceSpark/Research/Workday Ledger/WP-C Job
 * Execution.md" (binding) and "02 State Model.md" §3-§5 (binding).
 *
 * Cleaners are paid the job's ticket hours, not their clock time. No string
 * in this module may say "paid", "payroll", "clocked in" or "clock out" —
 * `tests/my-day-close-out.test.ts` asserts it.
 */

import { deriveWorkdayNow, pickCurrentStop, type StopInput } from "@/lib/my-day/workday-state";

/** Exactly what `POST /api/jobs/[jobId]/clock-out` persists and returns. Every
 * value here is server truth; none of it is recomputed on the client. */
export type SavedWork = {
  clockIn: string;
  clockOut: string;
  minutesWorked: number | null;
  jobCompleted: boolean;
};

export type CloseOutRequirement = {
  id: "before" | "after" | "payment";
  label: string;
  done: boolean;
  /** Whether this item blocks saving. Confirmed by Kaian 2026-08-20: photos
   * are NOT mandatory. A camera that won't focus must never be able to lock a
   * cleaner out of recording the work she already did — that would be worse
   * than the ticking receipt this package exists to fix. Photos stay on the
   * list as named, tracked tasks; only payment blocks. */
  required: boolean;
};

export type CloseOutInput = {
  hasBeforePhoto: boolean;
  hasAfterPhoto: boolean;
  /** "" = nothing chosen yet. `not_collected` is a real choice, not a gap. */
  paymentMethod: string;
};

/** Named tasks, never a bare percentage — "67% complete" tells her nothing
 * about what to do next. Order matches the order the work happens in. */
export function closeOutRequirements(input: CloseOutInput): CloseOutRequirement[] {
  return [
    { id: "before", label: "Before photo", done: input.hasBeforePhoto, required: false },
    { id: "after", label: "After photo", done: input.hasAfterPhoto, required: false },
    { id: "payment", label: "Payment", done: input.paymentMethod !== "", required: true },
  ];
}

export function closeOutReady(input: CloseOutInput): boolean {
  return closeOutRequirements(input).every((requirement) => !requirement.required || requirement.done);
}

const BLOCKED_COPY: Record<CloseOutRequirement["id"], string> = {
  before: "Add a before photo before saving your work.",
  after: "Add an after photo before saving your work.",
  payment: "Choose what payment you collected before saving your work.",
};

/** Names the first outstanding blocking item — "something is missing" sends
 * her hunting through the whole form. Null when nothing is blocking, which
 * includes a stop saved with no photos at all. */
export function closeOutBlockedMessage(input: CloseOutInput): string | null {
  const outstanding = closeOutRequirements(input).find((requirement) => requirement.required && !requirement.done);
  return outstanding ? BLOCKED_COPY[outstanding.id] : null;
}

/** Reads the clock-out response. The idempotent response (a duplicate tap
 * after the first one already saved) carries the same three persisted values,
 * so it produces a receipt like any other success — never an error. Returns
 * null only when the body genuinely has no saved entry in it. */
export function savedWorkFromResponse(body: unknown): SavedWork | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.clockIn !== "string" || typeof record.clockOut !== "string") return null;
  return {
    clockIn: record.clockIn,
    clockOut: record.clockOut,
    minutesWorked: typeof record.minutesWorked === "number" ? record.minutesWorked : null,
    jobCompleted: record.jobCompleted === true,
  };
}

/**
 * Folds the server's saved values back into the day's stops so every
 * derivation downstream — the Now region, the primary action, the next stop —
 * sees the world as it now is, without waiting for `router.refresh()` to come
 * back. This is what stops the counter: the stop no longer has an open entry.
 *
 * `completedAt` is set to `clockOut` when the server said the whole job
 * completed because the clock-out route writes `completedAt: clockOut` in the
 * same transaction (`clock-out/route.ts`) — the same instant, not an invented
 * one.
 */
export function applySavedWork(stops: StopInput[], jobId: string, saved: SavedWork): StopInput[] {
  return stops.map((stop) =>
    stop.jobId === jobId
      ? {
          ...stop,
          status: saved.jobCompleted ? "completed" : stop.status,
          completedAt: saved.jobCompleted ? saved.clockOut : stop.completedAt,
          myOpenEntry: null,
          myClosedEntry: {
            clockIn: saved.clockIn,
            clockOut: saved.clockOut,
            minutesWorked: saved.minutesWorked,
          },
          coworkers: saved.jobCompleted ? stop.coworkers.map((coworker) => ({ ...coworker, done: true })) : stop.coworkers,
        }
      : stop
  );
}

export type Receipt = {
  /** `Your work at Amy Kramer is saved · 8:58–11:47 · 2h 49m` */
  receiptLine: string;
  /** `Waiting on Brittney` or `Amy Kramer is marked done · it's on your pay week` */
  completionLine: string;
  jobCompleted: boolean;
};

/**
 * The receipt for one closed-out stop, formatted by `deriveWorkdayNow` — the
 * same function that writes My Day's line 1 — by handing it a day containing
 * only this stop. `todayIso` is the stop's own scheduled date so that
 * re-opening yesterday's saved job still renders its receipt instead of
 * collapsing into "day complete".
 */
export function receiptFor(stop: StopInput, timeZone: string): Receipt | null {
  // An open entry outranks a closed one — `deriveJobState` says so, and a job
  // can carry both (an admin repair, a re-opened stop). Reading only the
  // closed entry here printed a receipt over a stop that was still recording.
  if (!stop.myClosedEntry || stop.myOpenEntry) return null;
  const now = deriveWorkdayNow({ stops: [stop], todayIso: stop.scheduledDate, timeZone });
  return {
    receiptLine: now.recordedLine,
    completionLine: now.workLine,
    jobCompleted: Boolean(stop.completedAt),
  };
}

/** The whole sentence for a crew job that is not finished yet. The first
 * clause is the derivation's own `Waiting on {Coworker}` line. */
export function crewWaitingSentence(completionLine: string): string {
  return `${completionLine}. This stop isn't finished until everyone saves their work.`;
}

/**
 * The stop to offer next, once this one is saved. Uses the shared route
 * ordering (`pickCurrentStop`), so job detail and My Day can never nominate
 * different next stops. Returns null when there is nothing left to start —
 * including when some other stop still has time recording on it, which is the
 * office's problem to unwind, not something to paper over with a travel
 * button.
 */
export function nextStopAfter(stops: StopInput[], jobId: string, todayIso: string): StopInput | null {
  const candidate = pickCurrentStop({ stops, todayIso, timeZone: "UTC" });
  if (!candidate || candidate.jobId === jobId) return null;
  if (candidate.myOpenEntry || candidate.myClosedEntry) return null;
  return candidate;
}

/** State 5 (`wrapping_up`) is the one state the shared derivation cannot
 * reach on its own: its entry condition is "the employee is looking at
 * /my-day/[jobId]", and a pure function of persisted data has no idea which
 * route is on screen. This narrows `job_active` to `wrapping_up` for this
 * stop only, reusing the derivation's own state and copy contract rather
 * than re-deriving anything. */
export function wrappingUp(
  now: ReturnType<typeof deriveWorkdayNow>,
  jobId: string,
  customerName: string
): ReturnType<typeof deriveWorkdayNow> {
  if (now.state !== "job_active" || now.currentStopId !== jobId) return now;
  return { ...now, state: "wrapping_up", workLine: `Wrapping up ${customerName} · time still recording` };
}
