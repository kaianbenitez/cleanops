import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { payrollPeriods } from "@/db/schema";

function addDaysISO(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function payrollWeekRangeForDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  date.setUTCHours(0, 0, 0, 0);
  const startDate = date.toISOString().slice(0, 10);
  return {
    startDate,
    endDate: addDaysISO(startDate, 6),
  };
}

export function payrollPayDate(startDate: string) {
  return addDaysISO(startDate, 11);
}

export function isMondayToSundayPeriod(startDate: string, endDate: string) {
  const range = payrollWeekRangeForDate(startDate);
  return range.startDate === startDate && range.endDate === endDate;
}

export async function getOrCreatePayrollPeriodForDate(companyId: string, value: string | Date) {
  const { startDate, endDate } = payrollWeekRangeForDate(value);

  const [existing] = await db
    .select()
    .from(payrollPeriods)
    .where(and(eq(payrollPeriods.companyId, companyId), eq(payrollPeriods.startDate, startDate), eq(payrollPeriods.endDate, endDate)))
    .limit(1);

  if (existing) return existing;

  const [period] = await db.insert(payrollPeriods).values({ companyId, startDate, endDate }).returning();
  return period;
}

export async function refreshPayrollPeriodsForDates(companyId: string, dates: Array<string | Date>) {
  const seenDates = new Set<string>();
  const seenPeriods = new Set<string>();
  const refreshed: string[] = [];

  for (const value of dates) {
    const key = typeof value === "string" ? value : value.toISOString();
    if (seenDates.has(key)) continue;
    seenDates.add(key);

    const period = await getOrCreatePayrollPeriodForDate(companyId, value);
    if (period?.status === "open" && !seenPeriods.has(period.id)) {
      seenPeriods.add(period.id);
      refreshed.push(period.id);
    }
  }

  return refreshed;
}
