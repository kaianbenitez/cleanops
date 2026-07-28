import { db } from "@/db";
import { recurringSeries, jobs, jobAssignments } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/** How far ahead to keep recurring jobs generated — at least 3 months. */
const GENERATION_WINDOW_DAYS = 92; // 13 weeks

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function addMonths(d: Date, months: number): Date {
  const copy = new Date(d);
  const day = copy.getUTCDate();
  copy.setUTCMonth(copy.getUTCMonth() + months);
  // Clamp for months with fewer days (e.g. Jan 31 + 1mo -> Feb 28/29).
  if (copy.getUTCDate() !== day) {
    copy.setUTCDate(0);
  }
  return copy;
}

/** Parses a `date` column string ("YYYY-MM-DD") into a UTC midnight Date. */
function parseDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/**
 * Computes every occurrence date for a series between `from` and `to`
 * (inclusive), respecting frequency and (for non-monthly frequencies)
 * day_of_week alignment.
 */
export function computeOccurrences(
  series: {
    frequency: string;
    dayOfWeek: number | null;
    startDate: string;
    endDate: string | null;
  },
  from: Date,
  to: Date
): string[] {
  const seriesStart = parseDateOnly(series.startDate);
  const seriesEnd = series.endDate ? parseDateOnly(series.endDate) : null;
  const windowStart = seriesStart > from ? seriesStart : from;
  const windowEnd = seriesEnd && seriesEnd < to ? seriesEnd : to;

  if (windowStart > windowEnd) return [];

  const dates: string[] = [];

  if (series.frequency === "monthly") {
    // Each occurrence is computed as seriesStart + n months (n = 0, 1, 2, ...),
    // never chained off a previous *clamped* occurrence — otherwise a start
    // date of the 31st permanently drifts to the 28th after hitting February.
    let n = 0;
    while (addMonths(seriesStart, n) < windowStart) {
      n++;
    }
    let occurrence = addMonths(seriesStart, n);
    while (occurrence <= windowEnd) {
      dates.push(toISODate(occurrence));
      n++;
      occurrence = addMonths(seriesStart, n);
    }
    return dates;
  }

  const intervalDays = series.frequency === "weekly" ? 7 : series.frequency === "biweekly" ? 14 : 28;
  const dayOfWeek = series.dayOfWeek ?? seriesStart.getUTCDay();

  // Find the first occurrence on/after seriesStart matching dayOfWeek.
  let anchor = seriesStart;
  while (anchor.getUTCDay() !== dayOfWeek) {
    anchor = addDays(anchor, 1);
  }

  // Advance by intervalDays until we're at/after windowStart.
  let occurrence = anchor;
  while (occurrence < windowStart) {
    occurrence = addDays(occurrence, intervalDays);
  }

  while (occurrence <= windowEnd) {
    dates.push(toISODate(occurrence));
    occurrence = addDays(occurrence, intervalDays);
  }

  return dates;
}

/**
 * Generates `jobs` rows for one active recurring series, from today through
 * the generation window. Idempotent: relies on the unique
 * (recurring_series_id, scheduled_date) index — existing dates are skipped.
 */
export async function generateJobsForSeries(
  seriesId: string,
  opts: { windowDays?: number } = {}
): Promise<{ created: number; skipped: number }> {
  const [series] = await db
    .select()
    .from(recurringSeries)
    .where(eq(recurringSeries.id, seriesId))
    .limit(1);

  if (!series || !series.isActive) {
    return { created: 0, skipped: 0 };
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const windowEnd = addDays(today, opts.windowDays ?? GENERATION_WINDOW_DAYS);

  const occurrenceDates = computeOccurrences(series, today, windowEnd);
  if (occurrenceDates.length === 0) return { created: 0, skipped: 0 };

  let created = 0;
  let skipped = 0;

  for (const date of occurrenceDates) {
    const inserted = await db
      .insert(jobs)
      .values({
        companyId: series.companyId,
        customerId: series.customerId,
        recurringSeriesId: series.id,
        type: "recurring",
        status: "scheduled",
        scheduledDate: date,
        scheduledStartTime: "09:00:00",
        estimatedDurationMinutes: series.estimatedDurationMinutes ?? 120,
        priceCents: series.priceCents,
      })
      .onConflictDoNothing({
        target: [jobs.recurringSeriesId, jobs.scheduledDate],
      })
      .returning({ id: jobs.id });

    if (inserted.length === 0) {
      skipped++;
      continue;
    }

    created++;
    const employeeIds = (series.defaultEmployeeIds as string[]) ?? [];
    if (employeeIds.length > 0) {
      await db.insert(jobAssignments).values(
        employeeIds.map((userId, i) => ({
          jobId: inserted[0].id,
          userId,
          role: i === 0 ? ("lead" as const) : ("helper" as const),
        }))
      );
    }
  }

  return { created, skipped };
}

/** Runs generation for every active series in a company (or all companies if omitted). */
export async function generateJobsForAllActiveSeries(companyId?: string): Promise<{
  seriesProcessed: number;
  jobsCreated: number;
}> {
  const activeSeries = await db
    .select({ id: recurringSeries.id })
    .from(recurringSeries)
    .where(
      companyId
        ? and(eq(recurringSeries.isActive, true), eq(recurringSeries.companyId, companyId))
        : eq(recurringSeries.isActive, true)
    );

  let jobsCreated = 0;
  for (const s of activeSeries) {
    const result = await generateJobsForSeries(s.id);
    jobsCreated += result.created;
  }

  return { seriesProcessed: activeSeries.length, jobsCreated };
}
