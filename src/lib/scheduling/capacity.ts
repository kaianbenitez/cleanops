import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { companies, jobs, users } from "@/db/schema";
import { isFieldEligible } from "@/lib/auth/field-staff";
import { listEmployeePto, ptoHoursForDate, type EmployeePtoRecord } from "@/lib/scheduling/pto";

export const DEFAULT_WORKDAY_HOURS = 8;
export const DEFAULT_JOB_DURATION_MINUTES = 120;
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

// Jobs that never happened don't consume crew time — same set the calendar's
// own revenue-eligibility filter excludes (src/app/(app)/calendar/page.tsx).
const NON_COMMITTED_STATUSES = new Set(["cancelled", "no_show"]);

export type DayCapacity = {
  date: string;
  availableHours: number;
  committedHours: number;
  freeHours: number;
  staffCount: number;
  hasIncompleteEstimates: boolean;
};

export type JobForCapacity = {
  scheduledDate: string;
  estimatedDurationMinutes: number | null;
  status: string;
};

export type CapacityInputs = {
  dates: string[];
  staffCount: number;
  jobs: JobForCapacity[];
  ptoRecords: EmployeePtoRecord[];
  workdayHours: number;
  defaultJobDurationMinutes: number;
  workingDays: number[];
  holidays: string[];
};

function utcDayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

/**
 * Pure capacity model — no DB access, safe to unit test directly.
 *
 * `estimatedDurationMinutes` is total labor hours for the job (a.k.a. "Job
 * Ticket Hours" — see the payTypeEnum doc comment in src/db/schema.ts),
 * computed at quote conversion as priceCents / hourlyRateCents. That's crew-
 * size-independent by construction, so summing it across a day's jobs already
 * gives total labor-hours committed — no per-assignment multiplication needed.
 */
export function calculateCapacity(inputs: CapacityInputs): DayCapacity[] {
  const { dates, staffCount, jobs: jobRows, ptoRecords, workdayHours, defaultJobDurationMinutes, workingDays, holidays } = inputs;

  return dates.map((date) => {
    const isWorkingDay = workingDays.includes(utcDayOfWeek(date)) && !holidays.includes(date);

    let committedMinutes = 0;
    let hasIncompleteEstimates = false;
    for (const job of jobRows) {
      if (job.scheduledDate !== date || NON_COMMITTED_STATUSES.has(job.status)) continue;
      if (job.estimatedDurationMinutes == null) {
        hasIncompleteEstimates = true;
        committedMinutes += defaultJobDurationMinutes;
      } else {
        committedMinutes += job.estimatedDurationMinutes;
      }
    }
    const committedHours = committedMinutes / 60;

    const ptoHoursToday = ptoRecords
      .filter((pto) => pto.startDate <= date && date <= pto.endDate)
      .reduce((sum, pto) => sum + ptoHoursForDate(pto, date, workdayHours), 0);

    const availableHours = isWorkingDay ? Math.max(0, staffCount * workdayHours - ptoHoursToday) : 0;
    const freeHours = availableHours - committedHours;

    return { date, availableHours, committedHours, freeHours, staffCount, hasIncompleteEstimates };
  });
}

function eachDateISO(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function parseHolidays(settings: Record<string, unknown> | null): string[] {
  const raw = settings?.holidays;
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) : [];
}

function parseWorkingDays(settings: Record<string, unknown> | null): number[] {
  const raw = settings?.workingDays;
  const configured = Array.isArray(raw)
    ? [...new Set(raw.filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6))]
    : [];
  return configured.length ? configured : DEFAULT_WORKING_DAYS;
}

function parsePositiveNumber(settings: Record<string, unknown> | null, key: string, fallback: number): number {
  const value = settings?.[key];
  return typeof value === "number" && value > 0 ? value : fallback;
}

/** DB-backed entry point: fetches company settings, active field staff, jobs
 * in range, and PTO in range, then hands them to the pure model above. */
export async function getCapacityForRange({
  companyId,
  startDate,
  endDate,
}: {
  companyId: string;
  startDate: string;
  endDate: string;
}): Promise<DayCapacity[]> {
  const dates = eachDateISO(startDate, endDate);

  const [company] = await db.select({ settings: companies.settings }).from(companies).where(eq(companies.id, companyId)).limit(1);
  const settings = (company?.settings as Record<string, unknown> | null) ?? {};
  const workdayHours = parsePositiveNumber(settings, "workdayHoursPerCleaner", DEFAULT_WORKDAY_HOURS);
  const defaultJobDurationMinutes = parsePositiveNumber(settings, "defaultJobDurationMinutes", DEFAULT_JOB_DURATION_MINUTES);
  const workingDays = parseWorkingDays(settings);
  const holidays = parseHolidays(settings);

  const staff = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.companyId, companyId), isFieldEligible, eq(users.isActive, true)));

  const jobRows = await db
    .select({ scheduledDate: jobs.scheduledDate, estimatedDurationMinutes: jobs.estimatedDurationMinutes, status: jobs.status })
    .from(jobs)
    .where(and(eq(jobs.companyId, companyId), gte(jobs.scheduledDate, startDate), lte(jobs.scheduledDate, endDate)));

  const staffIds = new Set(staff.map((row) => row.id));
  const ptoRecords = (await listEmployeePto({ companyId, startDate, endDate })).filter((pto) => staffIds.has(pto.userId));

  return calculateCapacity({
    dates,
    staffCount: staff.length,
    jobs: jobRows,
    ptoRecords,
    workdayHours,
    defaultJobDurationMinutes,
    workingDays,
    holidays,
  });
}
