import { db } from "@/db";
import {
  payrollPeriods,
  payrollLines,
  users,
  jobs,
  jobAssignments,
  timeEntries,
  customers,
  companies,
} from "@/db/schema";
import { and, eq, gte, lte, isNotNull, or, sql } from "drizzle-orm";
import { refreshJobTicketHours } from "./job-ticket-hours";

type CalculationLine = {
  jobId: string;
  date: string;
  customerName: string;
  cleaningType: string;
  crewRole?: "lead" | "helper";
  budgetHours: number;
  hoursSpent: number;
  rateCents: number;
  amountCents: number;
  averageCentsPerHour: number;
};

export type PayTier = { minHours: number; maxHours: number | null; rateCents: number };
export type PayTierBracket = { minHours: number; maxHours: number | null; label: string };

/** Default hour brackets — Simply Maid's original 4-bracket structure
 * (confirmed with the user 2026-07-14). Every company gets this as a
 * starting point, but the bracket count and cutoffs are configurable per
 * company via companies.settings.payTierBrackets (Settings → Payroll
 * Tiers) — different businesses use different commission structures, so
 * this must not be hardcoded company-wide. */
export const DEFAULT_PAY_TIER_BRACKETS: PayTierBracket[] = [
  { minHours: 0, maxHours: 25.99, label: "Under 26 hrs" },
  { minHours: 26, maxHours: 29.99, label: "26–29.99 hrs" },
  { minHours: 30, maxHours: 33.99, label: "30–33.99 hrs" },
  { minHours: 34, maxHours: null, label: "34+ hrs" },
];

/** Reads this company's configured pay-tier brackets, falling back to the
 * default 4-bracket structure if the company hasn't customized them. */
export async function getPayTierBrackets(companyId: string): Promise<PayTierBracket[]> {
  const [company] = await db.select({ settings: companies.settings }).from(companies).where(eq(companies.id, companyId)).limit(1);
  const settings = (company?.settings as { payTierBrackets?: PayTierBracket[] } | null) ?? {};
  return settings.payTierBrackets && settings.payTierBrackets.length > 0 ? settings.payTierBrackets : DEFAULT_PAY_TIER_BRACKETS;
}

/** Builds a full PayTier[] schedule by zipping this company's bracket
 * definitions with one rate per bracket. rateCentsByBracket must be the
 * same length as brackets. */
export function buildPayTiers(brackets: PayTierBracket[], rateCentsByBracket: number[]): PayTier[] {
  return brackets.map((bracket, i) => ({
    minHours: bracket.minHours,
    maxHours: bracket.maxHours,
    rateCents: rateCentsByBracket[i] ?? 0,
  }));
}

/**
 * Picks the rate for a given total-weekly-hours figure from a per-employee
 * tier schedule. Falls back to `fallbackRateCents` if no tiers are configured
 * or none match (shouldn't happen with a well-formed schedule that has an
 * open-ended top tier, but better than silently paying $0).
 */
export function resolveTierRateCents(
  totalHours: number,
  tiers: PayTier[] | null | undefined,
  fallbackRateCents: number
): number {
  if (!tiers || tiers.length === 0) return fallbackRateCents;

  const sorted = [...tiers].sort((a, b) => a.minHours - b.minHours);
  for (const tier of sorted) {
    const withinMin = totalHours >= tier.minHours;
    const withinMax = tier.maxHours === null || totalHours <= tier.maxHours;
    if (withinMin && withinMax) return tier.rateCents;
  }

  // Above every tier's max (schedule didn't have an open-ended top tier) —
  // use the highest tier's rate rather than falling back to $0.
  return sorted[sorted.length - 1]?.rateCents ?? fallbackRateCents;
}

/**
 * (Re)computes the automatic portion of every employee's payroll line for a
 * period: commission (Job Ticket Hours x rate, for commission_jth employees)
 * and office hours/pay (actual clocked time x rate, for office_hourly
 * employees). Manual fields (mileage, tips, bonus, training, advance,
 * adjustment) are left untouched on existing lines — this is safe to re-run
 * any time before the period is marked reviewed/exported.
 */
export async function generatePayrollForPeriod(periodId: string): Promise<{
  linesUpdated: number;
}> {
  const [period] = await db
    .select()
    .from(payrollPeriods)
    .where(eq(payrollPeriods.id, periodId))
    .limit(1);

  if (!period) {
    throw new Error("Payroll period not found");
  }

  // Reviewed/exported periods are finalized — the admin has signed off (or
  // already exported to Gusto) and nothing should silently recompute their
  // numbers after that. This is the single chokepoint every caller (the
  // manual Generate/Refresh button, and the auto-refresh-after-time-entry-
  // edit paths) goes through, so guarding here protects all of them even if
  // a future caller forgets to pre-filter by status itself.
  if (period.status !== "open") {
    throw new Error(
      `This payroll period is marked "${period.status}" and is protected from automatic recalculation. Reopen it first if changes are needed.`
    );
  }

  // Commission employees are paid Job Ticket Hours, not clocked time. Refresh
  // the completed jobs first so payroll and the jobs screen share the same
  // amount-due-based estimate. Cancelled/no-show work is excluded at source.
  await refreshJobTicketHours({
    companyId: period.companyId,
    startDate: period.startDate,
    endDate: period.endDate,
    completedOnly: true,
    failOnUnresolved: true,
  });

  const [company] = await db
    .select({ settings: companies.settings })
    .from(companies)
    .where(eq(companies.id, period.companyId))
    .limit(1);
  const companySettings = (company?.settings as Record<string, unknown> | null) ?? {};
  const mileageRateCents =
    typeof companySettings.mileageRateCents === "number" ? companySettings.mileageRateCents : 35;

  const activeEmployees = await db
    .select()
    .from(users)
    .where(and(eq(users.companyId, period.companyId), eq(users.role, "employee"), eq(users.isActive, true)));

  let linesUpdated = 0;

  for (const employee of activeEmployees) {
    if (employee.payType === "commission_jth") {
      linesUpdated += await generateCommissionLine(period, employee, mileageRateCents);
    } else if (employee.payType === "office_hourly") {
      linesUpdated += await generateOfficeHourlyLine(period, employee, mileageRateCents);
    }
  }

  return { linesUpdated };
}

async function upsertAutomaticFields(
  periodId: string,
  userId: string,
  fields: {
    jobsCount: number;
    regularHours: string;
    commissionCents: number;
    officeHours: string;
    officePayCents: number;
    calculation: unknown;
  },
  mileageRateCents: number
): Promise<void> {
  const [existing] = await db
    .select({ id: payrollLines.id })
    .from(payrollLines)
    .where(and(eq(payrollLines.payrollPeriodId, periodId), eq(payrollLines.userId, userId)))
    .limit(1);

  if (existing) {
    await db.update(payrollLines).set(fields).where(eq(payrollLines.id, existing.id));
  } else {
    // mileageRateCents is only set here, at line-creation time — the
    // company's current default. Once a line exists, its rate is locked in
    // (editable per-line via the payroll UI) and never silently overwritten
    // by a later company-default change.
    await db.insert(payrollLines).values({
      payrollPeriodId: periodId,
      userId,
      mileageRateCents,
      ...fields,
    });
  }

  await recomputeFinalCents(periodId, userId);
}

async function generateCommissionLine(
  period: typeof payrollPeriods.$inferSelect,
  employee: typeof users.$inferSelect,
  mileageRateCents: number
): Promise<number> {
  const rows = await db
    .select({
      jobId: jobs.id,
      date: jobs.scheduledDate,
      cleaningType: jobs.type,
      crewRole: jobAssignments.role,
      estimatedDurationMinutes: jobs.estimatedDurationMinutes,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      minutesWorked: timeEntries.minutesWorked,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
    })
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .leftJoin(timeEntries, and(
      eq(timeEntries.jobId, jobs.id),
      eq(timeEntries.userId, employee.id),
      gte(sql`(${timeEntries.clockIn} AT TIME ZONE 'UTC')::date`, period.startDate),
      lte(sql`(${timeEntries.clockIn} AT TIME ZONE 'UTC')::date`, period.endDate)
    ))
    .where(
      and(
        eq(jobAssignments.userId, employee.id),
        eq(jobs.companyId, period.companyId),
        eq(jobs.status, "completed"),
        or(
          and(gte(jobs.scheduledDate, period.startDate), lte(jobs.scheduledDate, period.endDate)),
          isNotNull(timeEntries.id)
        )
      )
    );

  const minutesByJob = new Map<string, number>();
  const seenTimeEntries = new Set<string>();
  for (const row of rows) {
    const entryKey = row.clockIn && row.clockOut
      ? `${row.jobId}|${row.clockIn.toISOString()}|${row.clockOut.toISOString()}`
      : null;
    if (entryKey && seenTimeEntries.has(entryKey)) continue;
    if (entryKey) seenTimeEntries.add(entryKey);
    minutesByJob.set(row.jobId, (minutesByJob.get(row.jobId) ?? 0) + (row.minutesWorked ?? 0));
  }

  // Tier rate depends on TOTAL weekly hours, so compute that total first,
  // then apply the single resulting rate to every job that week — confirmed
  // against a real example: one flat rate was used across all of that
  // employee's jobs, not a graduated/marginal rate per bracket.
  const uniqueRows = [...new Map(rows.map((row) => [row.jobId, row])).values()];
  const totalMinutes = uniqueRows.reduce((sum, r) => sum + (r.estimatedDurationMinutes ?? 0), 0);
  const totalHours = totalMinutes / 60;
  const tiers = (employee.payTiers as PayTier[] | null) ?? null;
  const rateCents = resolveTierRateCents(totalHours, tiers, employee.hourlyRateCents ?? 0);

  const calculation: CalculationLine[] = uniqueRows.map((r) => {
    const minutes = r.estimatedDurationMinutes ?? 0;
    const hoursSpent = (minutesByJob.get(r.jobId) ?? 0) / 60;
    const budgetHours = minutes / 60;
    const amountCents = Math.round(budgetHours * rateCents);
    return {
      jobId: r.jobId,
      date: r.date,
      customerName: `${r.customerFirstName} ${r.customerLastName}`,
      cleaningType: r.cleaningType,
      crewRole: r.crewRole ?? undefined,
      budgetHours,
      hoursSpent,
      rateCents,
      amountCents,
      averageCentsPerHour: budgetHours > 0 ? Math.round(amountCents / budgetHours) : 0,
    };
  });

  const commissionCents = calculation.reduce((sum, c) => sum + c.amountCents, 0);

  await upsertAutomaticFields(period.id, employee.id, {
    jobsCount: calculation.length,
    regularHours: totalHours.toFixed(2),
    commissionCents,
    officeHours: "0",
    officePayCents: 0,
    calculation,
  }, mileageRateCents);

  return 1;
}

async function generateOfficeHourlyLine(
  period: typeof payrollPeriods.$inferSelect,
  employee: typeof users.$inferSelect,
  mileageRateCents: number
): Promise<number> {
  const rows = await db
    .select({
      minutesWorked: timeEntries.minutesWorked,
      jobId: timeEntries.jobId,
      date: jobs.scheduledDate,
      cleaningType: jobs.type,
      crewRole: jobAssignments.role,
      estimatedDurationMinutes: jobs.estimatedDurationMinutes,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
    })
    .from(timeEntries)
    .innerJoin(jobs, eq(timeEntries.jobId, jobs.id))
    .innerJoin(jobAssignments, and(eq(jobAssignments.jobId, jobs.id), eq(jobAssignments.userId, employee.id)))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(
      and(
        eq(timeEntries.userId, employee.id),
        eq(jobs.companyId, period.companyId),
        gte(sql`(${timeEntries.clockIn} AT TIME ZONE 'UTC')::date`, period.startDate),
        lte(sql`(${timeEntries.clockIn} AT TIME ZONE 'UTC')::date`, period.endDate)
      )
    );

  const seenTimeEntries = new Set<string>();
  const uniqueRows = rows.filter((row) => {
    const entryKey = row.clockIn && row.clockOut
      ? `${row.jobId}|${row.clockIn.toISOString()}|${row.clockOut.toISOString()}`
      : null;
    if (!entryKey) return true;
    if (seenTimeEntries.has(entryKey)) return false;
    seenTimeEntries.add(entryKey);
    return true;
  });
  const totalMinutes = uniqueRows.reduce((sum, r) => sum + (r.minutesWorked ?? 0), 0);
  const officeHours = totalMinutes / 60;
  const rateCents = employee.hourlyRateCents ?? 0;
  const officePayCents = Math.round(officeHours * rateCents);

  const calculation: CalculationLine[] = uniqueRows.map((r) => {
    const hoursSpent = (r.minutesWorked ?? 0) / 60;
    const amountCents = Math.round(hoursSpent * rateCents);
    return {
      jobId: r.jobId,
      date: r.date,
      customerName: `${r.customerFirstName} ${r.customerLastName}`,
      cleaningType: r.cleaningType,
      crewRole: r.crewRole ?? undefined,
      budgetHours: (r.estimatedDurationMinutes ?? 0) / 60,
      hoursSpent,
      rateCents,
      amountCents,
      averageCentsPerHour: hoursSpent > 0 ? Math.round(amountCents / hoursSpent) : 0,
    };
  });

  await upsertAutomaticFields(period.id, employee.id, {
    jobsCount: rows.length,
    regularHours: "0",
    commissionCents: 0,
    officeHours: officeHours.toFixed(2),
    officePayCents,
    calculation,
  }, mileageRateCents);

  return 1;
}

/** Recomputes mileageCents from mileageMiles x mileageRateCents, and finalCents
 * from every component. Call after any field (automatic or manual) changes. */
export async function recomputeFinalCents(periodId: string, userId: string): Promise<void> {
  const [line] = await db
    .select()
    .from(payrollLines)
    .where(and(eq(payrollLines.payrollPeriodId, periodId), eq(payrollLines.userId, userId)))
    .limit(1);

  if (!line) return;

  const mileageCents = Math.round(parseFloat(line.mileageMiles) * line.mileageRateCents);
  const finalCents =
    line.commissionCents +
    line.officePayCents +
    mileageCents +
    line.tipsPaycheckCents +
    line.tipsCashCents +
    line.bonusCents +
    line.teamLeadBonusCents +
    line.trainerBonusCents +
    line.trainingCents +
    line.adjustmentCents -
    line.payrollAdvanceCents;

  await db.update(payrollLines).set({ mileageCents, finalCents }).where(eq(payrollLines.id, line.id));
}

/** Fetches all lines for a period, joined with employee info, for the UI/CSV. */
export async function getPayrollLinesForPeriod(periodId: string) {
  const lines = await db
    .select({
      id: payrollLines.id,
      userId: payrollLines.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      title: users.title,
      gustoEmployeeId: users.gustoEmployeeId,
      payType: users.payType,
      hourlyRateCents: users.hourlyRateCents,
      jobsCount: payrollLines.jobsCount,
      regularHours: payrollLines.regularHours,
      commissionCents: payrollLines.commissionCents,
      officeHours: payrollLines.officeHours,
      officePayCents: payrollLines.officePayCents,
      mileageMiles: payrollLines.mileageMiles,
      mileageRateCents: payrollLines.mileageRateCents,
      mileageCents: payrollLines.mileageCents,
      tipsPaycheckCents: payrollLines.tipsPaycheckCents,
    tipsCashCents: payrollLines.tipsCashCents,
    bonusCents: payrollLines.bonusCents,
      teamLeadBonusCents: payrollLines.teamLeadBonusCents,
      trainerBonusCents: payrollLines.trainerBonusCents,
      trainingCents: payrollLines.trainingCents,
    payrollAdvanceCents: payrollLines.payrollAdvanceCents,
      gustoNetPayCents: payrollLines.gustoNetPayCents,
      adjustmentCents: payrollLines.adjustmentCents,
      adjustmentNote: payrollLines.adjustmentNote,
      finalCents: payrollLines.finalCents,
      calculation: payrollLines.calculation,
    })
    .from(payrollLines)
    .innerJoin(users, eq(payrollLines.userId, users.id))
    .where(eq(payrollLines.payrollPeriodId, periodId))
    .orderBy(users.lastName, users.firstName);

  return lines;
}
