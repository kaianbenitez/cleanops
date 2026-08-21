/**
 * The single shared source of employee workday state. Every function here is
 * a pure function of its arguments — no `@/db` import, no `fetch`, no
 * `Date.now()` inside derivation — so My Day and job execution can call the
 * same code and never disagree about what state a stop is in.
 *
 * See "01_Projects/ServiceSpark/Research/Workday Ledger/02 State Model.md"
 * (binding, §3–§5) and "WP-A State Authority.md" (binding, all sections) for
 * the model this implements.
 *
 * Cleaners are paid the job's ticket hours, not their clock time (see the
 * state model doc, §1.1). The timer here is *recorded time*, never "paid" or
 * "payroll" time — that word must never appear in any string this module
 * returns.
 */

import { timeLabel, timestampLabel } from "@/lib/my-day/job-format";

export type WorkState =
  | "day_not_started"
  | "traveling"
  | "arrived"
  | "job_active"
  | "wrapping_up"
  | "employee_done_crew_active"
  | "whole_job_completed"
  | "between_jobs"
  | "day_complete"
  | "stale_entry";

export type StopInput = {
  jobId: string;
  customerFirstName: string;
  customerLastName: string;
  scheduledDate: string; // ISO date, company timezone
  scheduledStartTime: string | null; // "HH:MM:SS" or null
  status: string;
  completedAt: string | null;
  travelStartedAt: string | null;
  arrivedAt: string | null;
  workStartedAt: string | null;
  myOpenEntry: { clockIn: string } | null;
  myClosedEntry: { clockIn: string; clockOut: string; minutesWorked: number | null } | null;
  coworkers: Array<{ firstName: string; done: boolean }>;
};

/** Derivation is deliberately NOT a function of wall-clock time: every state
 * comes from persisted timestamps plus the company-timezone calendar date.
 * The live elapsed counter is the caller's job, computed on the client from
 * `WorkdayNow.recordingSince`. */
export type WorkdayInput = { stops: StopInput[]; todayIso: string; timeZone: string };

export type WorkdayNow = {
  state: WorkState;
  recordedLine: string; // line 1 — never contains the word "paid"
  workLine: string; // line 2
  currentStopId: string | null;
  recordingSince: string | null; // ISO, for the live timer
};

export type PrimaryAction = {
  id: "start_travel" | "arrived" | "start_work" | "wrap_up" | "back_to_my_day" | "review_day" | "none";
  label: string;
  jobId: string | null;
  transitionTo: "traveling" | "arrived" | "working" | null; // null = navigate only
};

export type LedgerEvent = {
  at: string;
  jobId: string;
  text: string;
  kind: "travel" | "arrive" | "work" | "saved" | "completed";
};

function fullName(stop: Pick<StopInput, "customerFirstName" | "customerLastName">): string {
  return `${stop.customerFirstName} ${stop.customerLastName}`;
}

/** "8h 14m" / "2h" / "49m" — never "0h 0m". */
function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours > 0 && remainder > 0) return `${hours}h ${remainder}m`;
  if (hours > 0) return `${hours}h`;
  return `${remainder}m`;
}

/** Strips the " AM"/" PM" suffix `timeLabel`/`timestampLabel` add, for the
 * receipt's "8:58–11:47" range, which reads as a single time-of-day span. */
function stripPeriod(label: string): string {
  return label.replace(/\s?[AP]M$/i, "");
}

/** The weekday name for an ISO calendar date ("Tue"), formatted in UTC so a
 * bare "YYYY-MM-DD" — already a company-timezone calendar date — is never
 * shifted by the runtime's own local timezone. */
function weekdayLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(new Date(`${isoDate}T00:00:00Z`));
}

function receiptLine(name: string, entry: { clockIn: string; clockOut: string; minutesWorked: number | null }, timeZone: string): string {
  const range = `${stripPeriod(timestampLabel(entry.clockIn, timeZone))}–${stripPeriod(timestampLabel(entry.clockOut, timeZone))}`;
  const duration = formatDuration(entry.minutesWorked ?? 0);
  return `Your work at ${name} is saved · ${range} · ${duration}`;
}

/** nulls sort last — an unscheduled stop never jumps the queue. */
function compareStartTime(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The state of one stop, from its own persisted fields only. Does not know
 * about other stops in the day, so it cannot distinguish "day_not_started"
 * from "between_jobs" (that's a whole-day judgment — see `deriveWorkdayNow`)
 * and it never returns "wrapping_up" (that depends on which route the
 * employee is on, which this package does not touch).
 */
export function deriveJobState(stop: StopInput, todayIso: string): WorkState {
  if (stop.myOpenEntry) {
    if (stop.scheduledDate < todayIso) return "stale_entry";
    if (stop.workStartedAt) return "job_active";
    if (stop.arrivedAt) return "arrived";
    return "traveling";
  }
  if (stop.myClosedEntry) {
    return stop.completedAt ? "whole_job_completed" : "employee_done_crew_active";
  }
  return "day_not_started";
}

/**
 * `02 State Model.md` §5, exactly: the job with an open entry wins outright
 * (Invariant 3 guarantees there is at most one, and this holds even when
 * that entry is stale — a dangling entry from a prior day is still the one
 * thing standing between her and the rest of the day). Otherwise the
 * earliest untouched stop scheduled today, nulls-last by start time.
 * Otherwise none. A stop with a closed entry is never current, whether or
 * not the whole job completed — `selectedJobId` is deleted as a concept.
 */
export function pickCurrentStop(input: WorkdayInput): StopInput | null {
  const openStop = input.stops.find((stop) => stop.myOpenEntry);
  if (openStop) return openStop;

  const untouchedToday = input.stops
    .filter((stop) => stop.scheduledDate === input.todayIso && stop.travelStartedAt === null)
    .sort((a, b) => compareStartTime(a.scheduledStartTime, b.scheduledStartTime));

  return untouchedToday[0] ?? null;
}

function buildNowForStop(stop: StopInput, jobState: WorkState, timeZone: string): WorkdayNow {
  const name = fullName(stop);

  if (jobState === "traveling" || jobState === "arrived" || jobState === "job_active" || jobState === "stale_entry" || jobState === "wrapping_up") {
    const clockIn = stop.myOpenEntry?.clockIn ?? null;
    const recordedLine = clockIn
      ? jobState === "stale_entry"
        ? `Still recording from ${weekdayLabel(stop.scheduledDate)} at ${name}, since ${timestampLabel(clockIn, timeZone)}`
        : `Recording your time on ${name} · since ${timestampLabel(clockIn, timeZone)}`
      : "Not recording time";
    let workLine: string;
    if (jobState === "stale_entry") workLine = "This looks like it was left running";
    else if (jobState === "arrived") workLine = `At ${name} · arrived ${timestampLabel(stop.arrivedAt, timeZone)}`;
    else if (jobState === "job_active" || jobState === "wrapping_up") workLine = `Cleaning ${name} · started ${timestampLabel(stop.workStartedAt, timeZone)}`;
    else workLine = `Traveling to ${name} · started ${timestampLabel(stop.travelStartedAt, timeZone)}`;
    return {
      state: jobState,
      recordedLine,
      workLine,
      currentStopId: stop.jobId,
      recordingSince: clockIn,
    };
  }

  if (jobState === "employee_done_crew_active") {
    const waitingOn = stop.coworkers.find((coworker) => !coworker.done);
    return {
      state: jobState,
      recordedLine: stop.myClosedEntry ? receiptLine(name, stop.myClosedEntry, timeZone) : "Not recording time",
      workLine: waitingOn ? `Waiting on ${waitingOn.firstName}` : "Waiting on your crew",
      currentStopId: stop.jobId,
      recordingSince: null,
    };
  }

  if (jobState === "whole_job_completed") {
    return {
      state: jobState,
      recordedLine: stop.myClosedEntry ? receiptLine(name, stop.myClosedEntry, timeZone) : "Not recording time",
      workLine: `${name} is marked done · it's on your pay week`,
      currentStopId: stop.jobId,
      recordingSince: null,
    };
  }

  // day_not_started / between_jobs
  return {
    state: jobState,
    recordedLine: "Not recording time",
    workLine: `${jobState === "between_jobs" ? "Next" : "First"} stop ${name} at ${timeLabel(stop.scheduledStartTime)}`,
    currentStopId: stop.jobId,
    recordingSince: null,
  };
}

/**
 * The two-line "Now" card, derived fresh from persisted data every time.
 * When nothing is open or untouched today, checks for a stop this employee
 * finished but that isn't resolved yet (crew still working it, or just
 * completed) before falling back to "day_complete" — otherwise a solo
 * cleaner's finished-but-not-yet-completed job would vanish into a generic
 * "day complete" the instant she stopped being the current stop.
 */
export function deriveWorkdayNow(input: WorkdayInput): WorkdayNow {
  const { stops, todayIso } = input;
  const todayStops = stops.filter((stop) => stop.scheduledDate === todayIso);

  const currentStop = pickCurrentStop(input);
  if (currentStop) {
    let jobState = deriveJobState(currentStop, todayIso);
    if (jobState === "day_not_started") {
      const hasProgressElsewhere = todayStops.some(
        (stop) => stop.jobId !== currentStop.jobId && (stop.travelStartedAt !== null || stop.myClosedEntry !== null),
      );
      if (hasProgressElsewhere) jobState = "between_jobs";
    }
    return buildNowForStop(currentStop, jobState, input.timeZone);
  }

  const crewWaiting = todayStops.find((stop) => stop.myClosedEntry && !stop.completedAt);
  if (crewWaiting) {
    return buildNowForStop(crewWaiting, "employee_done_crew_active", input.timeZone);
  }

  if (todayStops.length === 1 && todayStops[0].myClosedEntry && todayStops[0].completedAt) {
    return buildNowForStop(todayStops[0], "whole_job_completed", input.timeZone);
  }

  const recordedMinutes = todayStops.reduce((sum, stop) => sum + (stop.myClosedEntry?.minutesWorked ?? 0), 0);
  return {
    state: "day_complete",
    recordedLine: recordedMinutes > 0 ? `Nothing recording · ${formatDuration(recordedMinutes)} recorded today` : "Not recording time",
    // "Day complete · 0 stops" claims she finished a day she never had.
    workLine:
      todayStops.length === 0
        ? "No stops scheduled today"
        : `Day complete · ${todayStops.length} stop${todayStops.length === 1 ? "" : "s"}`,
    currentStopId: null,
    recordingSince: null,
  };
}

/** Exactly one action, ever. */
export function primaryActionFor(input: WorkdayInput): PrimaryAction {
  const now = deriveWorkdayNow(input);
  const stop = now.currentStopId ? input.stops.find((s) => s.jobId === now.currentStopId) ?? null : null;

  switch (now.state) {
    case "day_not_started":
    case "between_jobs":
      return { id: "start_travel", label: `Start travel to ${stop ? fullName(stop) : ""}`, jobId: now.currentStopId, transitionTo: "traveling" };
    case "traveling":
      return { id: "arrived", label: "I've arrived", jobId: now.currentStopId, transitionTo: "arrived" };
    case "arrived":
      return { id: "start_work", label: "Start cleaning", jobId: now.currentStopId, transitionTo: "working" };
    case "job_active":
    case "wrapping_up":
      return { id: "wrap_up", label: `Wrap up ${stop ? fullName(stop) : ""}`, jobId: now.currentStopId, transitionTo: null };
    case "employee_done_crew_active":
    case "whole_job_completed":
      return { id: "back_to_my_day", label: "Back to My Day", jobId: null, transitionTo: null };
    case "day_complete":
      return input.stops.length === 0
        ? { id: "none", label: "", jobId: null, transitionTo: null }
        : { id: "review_day", label: "Review today", jobId: null, transitionTo: null };
    case "stale_entry":
    default:
      return { id: "none", label: "", jobId: null, transitionTo: null };
  }
}

/** Every persisted transition today, for this employee, ordered ascending.
 * Only events whose source timestamp is non-null are emitted — an admin's
 * repaired closed entry with all three transition columns still null still
 * produces a "saved" line, nothing more. */
export function buildLedger(input: WorkdayInput): LedgerEvent[] {
  const events: LedgerEvent[] = [];

  for (const stop of input.stops) {
    const name = fullName(stop);
    if (stop.travelStartedAt) {
      events.push({ at: stop.travelStartedAt, jobId: stop.jobId, text: `Started travel to ${name}`, kind: "travel" });
    }
    if (stop.arrivedAt) {
      events.push({ at: stop.arrivedAt, jobId: stop.jobId, text: `Arrived at ${name}`, kind: "arrive" });
    }
    if (stop.workStartedAt) {
      events.push({ at: stop.workStartedAt, jobId: stop.jobId, text: `Started cleaning ${name}`, kind: "work" });
    }
    if (stop.myClosedEntry) {
      events.push({ at: stop.myClosedEntry.clockOut, jobId: stop.jobId, text: `Your work at ${name} was saved`, kind: "saved" });
    }
    if (stop.completedAt) {
      events.push({ at: stop.completedAt, jobId: stop.jobId, text: `${name} marked done`, kind: "completed" });
    }
  }

  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
