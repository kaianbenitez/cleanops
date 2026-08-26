/**
 * Builds `CustomerSchedulingProfile` (see `slot-contract.ts`) from a
 * customer's own history — completed visits, who worked them, how long they
 * actually ran, how often they fell through, and how recently/how often
 * they're actually cleaned. Nothing here overrides feasibility; this is the
 * "what has this customer's own history shown us" half of the scheduling
 * assistant, consumed by `rank-slots.ts`.
 *
 * Split the same way `capacity.ts` splits `calculateCapacity` (pure) from
 * `getCapacityForRange` (DB): `buildCustomerSchedulingProfile` takes already
 * -fetched rows (including "today" in the company's own time zone, passed in
 * rather than read from the clock) and is safe to unit test directly;
 * `getCustomerSchedulingProfile` does the fetching and delegates the math.
 */
import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { companies, customers, jobAssignments, jobs, recurringSeries, timeEntries, users } from "@/db/schema";
import { todayInTimeZone } from "@/lib/dashboard/range";
import { minutesToTime, timeToMinutes } from "./wall-clock";
import type { BookingWindowKey, CustomerSchedulingProfile, LastVisit, RegularCrewMember, Weekday } from "./slot-contract";

/** Completed, non-cancelled visits capped at this many, most recent first —
 * far enough back to see a real pattern, recent enough that a customer who
 * changed their routine last year doesn't still anchor the profile. */
const SAMPLE_CAP = 12;
/** Below this many usable time-entry pairs, a median duration is noise, not
 * a signal — so `medianActualMinutes`/`durationDriftFactor` stay null. */
const MIN_DURATION_SAMPLE = 3;
/** A weekday or window only counts as "usual" when it's the sample's unique
 * mode (a real plurality, not a coin-flip tie) and clears both a minimum
 * occurrence count and a minimum share — two visits at 25% of an 8-visit
 * sample isn't a pattern yet. */
const PLURALITY_MIN_COUNT = 2;
const PLURALITY_MIN_SHARE = 0.3;
/** typicalGapDays needs at least 2 gaps (3 visits) to be a measurement
 * rather than a single data point. */
const MIN_VISITS_FOR_GAP = 3;

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Bucket a scheduled start time into the two-window vocabulary the rest of
 * the assistant uses. Kept here (rather than shared with rank-slots.ts) so
 * this pure module and that one stay independently importable without
 * pulling each other's dependencies in. */
export function classifyWindow(startTime: string): BookingWindowKey {
  return timeToMinutes(startTime) < 12 * 60 ? "morning" : "afternoon";
}

/** Whole calendar days since a date-only ("YYYY-MM-DD") string, as a plain
 * integer — pure calendar math, no timezone conversion (the caller is
 * responsible for handing in dates already anchored to the company's own
 * time zone, e.g. via `todayInTimeZone`). */
function toUtcDayNumber(dateISO: string): number {
  const [year, month, day] = dateISO.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round(toUtcDayNumber(toISO) - toUtcDayNumber(fromISO));
}

function addDaysISO(dateISO: string, days: number): string {
  const utcMs = toUtcDayNumber(dateISO) * 86_400_000 + Math.round(days) * 86_400_000;
  return new Date(utcMs).toISOString().slice(0, 10);
}

export type CompletedJobRow = {
  id: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number | null;
  /** This job's recurring-series cadence, when it was generated from one —
   * only read off the most recent completed job, to derive `expectedGapDays`. */
  recurringSeriesFrequency: "weekly" | "biweekly" | "every4weeks" | "monthly" | "custom" | null;
  recurringSeriesIntervalWeeks: number | null;
};

export type JobAssignmentRow = {
  jobId: string;
  userId: string;
  firstName: string;
  lastName: string;
};

export type TimeEntryRow = {
  jobId: string;
  userId: string;
  minutesWorked: number | null;
};

/** One of the customer's own non-future jobs, any status — used only for the
 * cancellation rate, which looks past the completed-only sample. */
export type NonFutureJobRow = { status: string };

export type CustomerStatedFields = {
  preferredCleanerId: string | null;
  /** customers.preferredDay — free text, parsed by weekday name. */
  preferredDay: string | null;
  preferredTimeOfDay: "AM" | "PM" | null;
  /** customers.recurrence — booked cadence, used as the expectedGapDays
   * fallback when the most recent job carries no recurring-series frequency. */
  recurrence: "none" | "weekly" | "biweekly" | "every4weeks" | "monthly" | null;
};

export type BuildCustomerSchedulingProfileInputs = {
  customerId: string;
  /** "Today" in the company's own time zone (YYYY-MM-DD) — passed in rather
   * than read from the clock so this stays pure. Drives `lastVisit.daysAgo`
   * and the non-future cutoff for `cancellationRate`. */
  asOfDate: string;
  /** This customer's completed jobs, any order/length — the function sorts
   * most-recent-first and caps at SAMPLE_CAP itself. */
  completedJobs: CompletedJobRow[];
  /** Assignments for (at least) the jobs in `completedJobs`; rows for other
   * jobs are ignored. */
  jobAssignments: JobAssignmentRow[];
  /** Time entries for (at least) the jobs in `completedJobs`. */
  timeEntries: TimeEntryRow[];
  /** Every non-future job for this customer, regardless of status. */
  nonFutureJobs: NonFutureJobRow[];
  stated: CustomerStatedFields;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Picks the unique mode of `counts` when it clears the plurality bar,
 * returning both the winner and its share of `sampleSize`. A tie for the top
 * spot is not a plurality — returns null — same as too few visits or too
 * thin a share. Shared by both the weekday and window computations below. */
function pluralityWinner<T>(counts: Map<T, number>, sampleSize: number): { winner: T; share: number } | null {
  if (sampleSize === 0 || counts.size === 0) return null;
  let max = -1;
  let winners: T[] = [];
  for (const [key, count] of counts) {
    if (count > max) {
      max = count;
      winners = [key];
    } else if (count === max) {
      winners.push(key);
    }
  }
  if (winners.length !== 1 || max < PLURALITY_MIN_COUNT) return null;
  const share = max / sampleSize;
  return share >= PLURALITY_MIN_SHARE ? { winner: winners[0], share } : null;
}

const WEEKDAY_ALIASES: Record<string, Weekday> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, weds: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

/** Parses common weekday names/abbreviations (and their plurals, e.g. the
 * "Thursdays" people actually type into a free-text field) case-
 * insensitively. Anything else — a blank, "every other week", a typo — comes
 * back null rather than a guess. */
function parseStatedWeekday(raw: string | null): Weekday | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (key in WEEKDAY_ALIASES) return WEEKDAY_ALIASES[key];
  if (key.endsWith("s") && key.slice(0, -1) in WEEKDAY_ALIASES) return WEEKDAY_ALIASES[key.slice(0, -1)];
  return null;
}

/** Days implied by a booked cadence. Shared between recurringSeries.frequency
 * (which also has "custom", needing intervalWeeks) and customers.recurrence
 * (which doesn't). */
function daysForFrequency(frequency: string | null, intervalWeeks: number | null): number | null {
  switch (frequency) {
    case "weekly":
      return 7;
    case "biweekly":
      return 14;
    case "every4weeks":
      return 28;
    case "monthly":
      return 30;
    case "custom":
      return intervalWeeks != null ? intervalWeeks * 7 : null;
    default:
      return null; // "none", null, or an unrecognized value.
  }
}

/** Pure math over already-fetched rows — see the module doc comment. */
export function buildCustomerSchedulingProfile(inputs: BuildCustomerSchedulingProfileInputs): CustomerSchedulingProfile {
  const { customerId, asOfDate, completedJobs, jobAssignments: assignmentRows, timeEntries: entryRows, nonFutureJobs, stated } = inputs;

  const sample = [...completedJobs]
    .sort((a, b) => {
      if (a.scheduledDate !== b.scheduledDate) return a.scheduledDate < b.scheduledDate ? 1 : -1;
      return timeToMinutes(b.scheduledStartTime, 0) - timeToMinutes(a.scheduledStartTime, 0);
    })
    .slice(0, SAMPLE_CAP);

  const sampleSize = sample.length;
  const sampleIds = new Set(sample.map((job) => job.id));
  const mostRecent = sample[0] ?? null;

  // ---- usual weekday ----
  const weekdayCounts = new Map<Weekday, number>();
  for (const job of sample) {
    const day = new Date(`${job.scheduledDate}T00:00:00.000Z`).getUTCDay() as Weekday;
    weekdayCounts.set(day, (weekdayCounts.get(day) ?? 0) + 1);
  }
  const weekdayPlurality = pluralityWinner(weekdayCounts, sampleSize);
  const usualWeekdays: Weekday[] = weekdayPlurality ? [weekdayPlurality.winner] : [];
  const usualWeekdayShare = weekdayPlurality ? weekdayPlurality.share : 0;

  // ---- usual window ----
  // Denominator is jobs that actually have a recorded start time, not the
  // whole sample — a job missing scheduledStartTime can't be classified
  // either way and shouldn't silently drag the share down.
  const windowCounts = new Map<BookingWindowKey, number>();
  let windowSampleSize = 0;
  for (const job of sample) {
    if (!job.scheduledStartTime) continue;
    windowSampleSize += 1;
    const key = classifyWindow(job.scheduledStartTime);
    windowCounts.set(key, (windowCounts.get(key) ?? 0) + 1);
  }
  const windowPlurality = pluralityWinner(windowCounts, windowSampleSize);
  const usualWindow = windowPlurality ? windowPlurality.winner : null;
  const usualWindowShare = windowPlurality ? windowPlurality.share : 0;

  // ---- median start time ----
  const startMinutes = sample.filter((job) => job.scheduledStartTime).map((job) => timeToMinutes(job.scheduledStartTime));
  const medianStartMinutes = median(startMinutes);
  const medianStartTime = medianStartMinutes == null ? null : minutesToTime(medianStartMinutes);

  // ---- regular crew ----
  const sampleAssignments = assignmentRows.filter((row) => sampleIds.has(row.jobId));
  const crewTally = new Map<string, { userId: string; firstName: string; lastName: string; visits: number }>();
  for (const row of sampleAssignments) {
    const existing = crewTally.get(row.userId);
    if (existing) existing.visits += 1;
    else crewTally.set(row.userId, { userId: row.userId, firstName: row.firstName, lastName: row.lastName, visits: 1 });
  }
  const mostRecentJobId = mostRecent?.id ?? null;
  const lastVisitAssignments = sampleAssignments.filter((row) => row.jobId === mostRecentJobId);
  const lastVisitUserIds = new Set(lastVisitAssignments.map((row) => row.userId));
  const regularCrew: RegularCrewMember[] = [...crewTally.values()]
    .sort((a, b) => b.visits - a.visits || `${a.firstName}${a.lastName}`.localeCompare(`${b.firstName}${b.lastName}`))
    .map((entry) => ({ ...entry, workedLastVisit: lastVisitUserIds.has(entry.userId) }));

  // ---- last visit / cadence / next due date ----
  const lastVisit: LastVisit | null = mostRecent
    ? {
        jobId: mostRecent.id,
        date: mostRecent.scheduledDate,
        daysAgo: daysBetween(mostRecent.scheduledDate, asOfDate),
        employees: lastVisitAssignments.map((row) => ({ userId: row.userId, firstName: row.firstName, lastName: row.lastName })),
      }
    : null;

  let typicalGapDays: number | null = null;
  if (sampleSize >= MIN_VISITS_FOR_GAP) {
    const ascending = [...sample].sort((a, b) => (a.scheduledDate < b.scheduledDate ? -1 : a.scheduledDate > b.scheduledDate ? 1 : 0));
    const gaps: number[] = [];
    for (let i = 1; i < ascending.length; i++) gaps.push(daysBetween(ascending[i - 1].scheduledDate, ascending[i].scheduledDate));
    typicalGapDays = median(gaps);
  }

  const expectedGapDays =
    (mostRecent ? daysForFrequency(mostRecent.recurringSeriesFrequency, mostRecent.recurringSeriesIntervalWeeks) : null) ??
    daysForFrequency(stated.recurrence, null);

  const measuredOrExpectedGap = typicalGapDays ?? expectedGapDays; // prefer measured — what they actually do beats what they were sold.
  const nextDueDate = lastVisit && measuredOrExpectedGap != null ? addDaysISO(lastVisit.date, measuredOrExpectedGap) : null;

  // ---- median actual minutes + duration drift ----
  // "Usable" means both a real time-entry total (so we're not diluting the
  // median with a job nobody clocked) and a real estimate to compare it
  // against — durationDriftFactor is a ratio over the *same* jobs on both
  // sides, so a job missing either side is dropped from both.
  const usableDurationJobs = sample
    .map((job) => {
      const entries = entryRows.filter((row) => row.jobId === job.id && row.minutesWorked != null);
      if (entries.length === 0) return null;
      if (job.estimatedDurationMinutes == null || job.estimatedDurationMinutes <= 0) return null;
      const actual = entries.reduce((sum, row) => sum + (row.minutesWorked ?? 0), 0);
      return { actual, estimate: job.estimatedDurationMinutes };
    })
    .filter((value): value is { actual: number; estimate: number } => value !== null);

  let medianActualMinutes: number | null = null;
  let durationDriftFactor: number | null = null;
  if (usableDurationJobs.length >= MIN_DURATION_SAMPLE) {
    medianActualMinutes = median(usableDurationJobs.map((job) => job.actual));
    const medianEstimate = median(usableDurationJobs.map((job) => job.estimate));
    if (medianActualMinutes != null && medianEstimate) {
      // Clamped so one bad time entry can't produce an absurd schedule.
      durationDriftFactor = Math.min(2.0, Math.max(0.5, medianActualMinutes / medianEstimate));
    }
  }

  // ---- cancellation rate ----
  const cancellationRate = nonFutureJobs.length === 0
    ? 0
    : nonFutureJobs.filter((job) => job.status === "cancelled" || job.status === "no_show").length / nonFutureJobs.length;

  return {
    customerId,
    sampleSize,
    lastVisit,
    typicalGapDays,
    expectedGapDays,
    nextDueDate,
    usualWeekdays,
    usualWeekdayShare,
    usualWindow,
    usualWindowShare,
    medianStartTime,
    regularCrew,
    medianActualMinutes,
    durationDriftFactor,
    cancellationRate,
    stated: {
      preferredCleanerId: stated.preferredCleanerId,
      preferredWeekday: parseStatedWeekday(stated.preferredDay),
      preferredWindow: stated.preferredTimeOfDay === "AM" ? "morning" : stated.preferredTimeOfDay === "PM" ? "afternoon" : null,
    },
  };
}

/** DB-backed entry point: fetches this customer's completed-job sample (with
 * each job's recurring-series cadence), the crew who worked it, their time
 * entries, every non-future job (for the cancellation rate), the company's
 * time zone (for "today"), and the hand-set customer fields, then hands them
 * to the pure model above. Company-scoped throughout. */
export async function getCustomerSchedulingProfile({
  companyId,
  customerId,
}: {
  companyId: string;
  customerId: string;
}): Promise<CustomerSchedulingProfile> {
  const [companyRows, customerRows] = await Promise.all([
    db.select({ timezone: companies.timezone }).from(companies).where(eq(companies.id, companyId)).limit(1),
    db
      .select({ preferredCleanerId: customers.preferredCleanerId, preferredDay: customers.preferredDay, preferredTimeOfDay: customers.preferredTimeOfDay, recurrence: customers.recurrence })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.companyId, companyId)))
      .limit(1),
  ]);
  const asOfDate = todayInTimeZone(new Date(), companyRows[0]?.timezone ?? "America/Chicago");

  const [completedJobs, nonFutureJobs] = await Promise.all([
    db
      .select({
        id: jobs.id,
        scheduledDate: jobs.scheduledDate,
        scheduledStartTime: jobs.scheduledStartTime,
        estimatedDurationMinutes: jobs.estimatedDurationMinutes,
        recurringSeriesFrequency: recurringSeries.frequency,
        recurringSeriesIntervalWeeks: recurringSeries.intervalWeeks,
      })
      .from(jobs)
      .leftJoin(recurringSeries, eq(jobs.recurringSeriesId, recurringSeries.id))
      .where(and(eq(jobs.companyId, companyId), eq(jobs.customerId, customerId), eq(jobs.status, "completed")))
      .orderBy(desc(jobs.scheduledDate), desc(jobs.scheduledStartTime))
      .limit(SAMPLE_CAP),
    db
      .select({ status: jobs.status })
      .from(jobs)
      .where(and(eq(jobs.companyId, companyId), eq(jobs.customerId, customerId), lte(jobs.scheduledDate, asOfDate))),
  ]);

  const jobIds = completedJobs.map((job) => job.id);
  const [assignmentRows, entryRows] = jobIds.length
    ? await Promise.all([
        db
          .select({ jobId: jobAssignments.jobId, userId: jobAssignments.userId, firstName: users.firstName, lastName: users.lastName })
          .from(jobAssignments)
          .innerJoin(users, eq(users.id, jobAssignments.userId))
          .where(inArray(jobAssignments.jobId, jobIds)),
        db
          .select({ jobId: timeEntries.jobId, userId: timeEntries.userId, minutesWorked: timeEntries.minutesWorked })
          .from(timeEntries)
          .where(inArray(timeEntries.jobId, jobIds)),
      ])
    : [[], []];

  const customerRow = customerRows[0];

  return buildCustomerSchedulingProfile({
    customerId,
    asOfDate,
    completedJobs,
    jobAssignments: assignmentRows,
    timeEntries: entryRows,
    nonFutureJobs,
    stated: {
      preferredCleanerId: customerRow?.preferredCleanerId ?? null,
      preferredDay: customerRow?.preferredDay ?? null,
      preferredTimeOfDay: (customerRow?.preferredTimeOfDay as "AM" | "PM" | null) ?? null,
      recurrence: (customerRow?.recurrence as CustomerStatedFields["recurrence"]) ?? null,
    },
  });
}
