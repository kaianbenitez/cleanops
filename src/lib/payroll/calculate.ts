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
  feedbackRequests,
  invoices,
  payrollJobReviews,
  calendarEvents,
  calendarEventAssignments,
} from "@/db/schema";
import { and, eq, gte, lte, isNotNull, or, sql, inArray, asc } from "drizzle-orm";
import { refreshJobTicketHours } from "./job-ticket-hours";
import { DEFAULT_PAY_TIER_BRACKETS, type PayTierBracket } from "./brackets";
import { isPayrollEligible } from "@/lib/auth/field-staff";

type CalculationLine = {
  jobId: string;
  date: string;
  customerName: string;
  cleaningType: string;
  crewRole?: "lead" | "helper" | "trainer";
  budgetHours: number;
  hoursSpent: number;
  paidHours: number;
  varianceStatus?: "pending" | "approved" | "rejected";
  clientTipCents: number;
  bonusCents: number;
  rateCents: number;
  amountCents: number;
  averageCentsPerHour: number;
  isAppointment?: boolean;
  appointmentTitle?: string;
};

/** Internal-meeting attendance for one employee in a payroll period — the
 * "everyone gets paid an hour" flow from the calendar's appointment panel.
 * Only category="meeting" rows participate in payroll; "reminder"/"training"
 * calendar events never do (see src/db/schema.ts's calendarEvents comment). */
async function getAppointmentMinutesForEmployee(
  companyId: string,
  employeeId: string,
  startDate: string,
  endDate: string
): Promise<{ id: string; title: string; date: string; minutes: number }[]> {
  const rows = await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      date: calendarEvents.scheduledDate,
      durationMinutes: calendarEvents.durationMinutes,
    })
    .from(calendarEvents)
    .innerJoin(calendarEventAssignments, and(
      eq(calendarEventAssignments.eventId, calendarEvents.id),
      eq(calendarEventAssignments.userId, employeeId)
    ))
    .where(
      and(
        eq(calendarEvents.companyId, companyId),
        eq(calendarEvents.category, "meeting"),
        eq(calendarEvents.status, "scheduled"),
        gte(calendarEvents.scheduledDate, startDate),
        lte(calendarEvents.scheduledDate, endDate)
      )
    );
  return rows.map((row) => ({ id: row.id, title: row.title, date: row.date, minutes: row.durationMinutes ?? 60 }));
}

export type PayTier = { minHours: number; maxHours: number | null; rateCents: number };

export function splitTipCents(totalCents: number, index: number, participantCount: number) {
  if (participantCount <= 0 || index < 0 || index >= participantCount) return 0;
  return Math.floor(totalCents / participantCount) + (index < totalCents % participantCount ? 1 : 0);
}

export function paidMinutesForJob(jthMinutes: number, loggedMinutes: number, crewCount: number, review?: { status: "pending" | "approved" | "rejected"; approvedMinutes: number | null }) {
  if (crewCount >= 2 && loggedMinutes > jthMinutes && review?.status === "approved") return { paidMinutes: review.approvedMinutes ?? loggedMinutes, varianceStatus: "approved" as const };
  if (crewCount >= 2 && loggedMinutes > jthMinutes && review?.status === "rejected") return { paidMinutes: jthMinutes, varianceStatus: "rejected" as const };
  if (crewCount >= 2 && loggedMinutes > jthMinutes) return { paidMinutes: jthMinutes, varianceStatus: "pending" as const };
  return { paidMinutes: jthMinutes, varianceStatus: undefined };
}

// The bracket shape and defaults live in ./brackets so the Settings client
// component can import them without pulling in the database.
export { DEFAULT_PAY_TIER_BRACKETS };
export type { PayTierBracket };

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
 * and office hours/pay ((clocked + manual office hours) x rate, for
 * office_hourly employees). Manual fields (including manual office hours,
 * mileage, tips, bonus, training, advance, adjustment) are left untouched on
 * existing lines — this is safe to re-run any time before the period is
 * marked reviewed/exported.
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

  // Commission employees are paid saved Job Ticket Hours, not ZIP/quote
  // derived estimates. Missing duration is a data-quality error, not a reason
  // to guess at payroll.
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
    .where(and(eq(users.companyId, period.companyId), isPayrollEligible, eq(users.isActive, true)));

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
    clientTipsCents?: number;
    trainerBonusCents?: number;
    teamLeadBonusCents?: number;
    mileageMiles?: string;
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

  const uniqueRows = [...new Map(rows.map((row) => [row.jobId, row])).values()];
  const jobIds = uniqueRows.map((row) => row.jobId);
  const assignments = jobIds.length
    ? await db.select({ jobId: jobAssignments.jobId, userId: jobAssignments.userId, role: jobAssignments.role, mileageMiles: jobAssignments.mileageMiles })
        .from(jobAssignments).where(inArray(jobAssignments.jobId, jobIds)).orderBy(asc(jobAssignments.userId))
    : [];
  const assignmentsByJob = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const current = assignmentsByJob.get(assignment.jobId) ?? [];
    current.push(assignment);
    assignmentsByJob.set(assignment.jobId, current);
  }

  const [feedbackTips, invoiceTips] = await Promise.all([
    jobIds.length ? db.select({ jobId: feedbackRequests.jobId, tipCents: feedbackRequests.tipCents }).from(feedbackRequests).where(inArray(feedbackRequests.jobId, jobIds)) : Promise.resolve([]),
    jobIds.length ? db.select({ jobId: invoices.jobId, tipCents: invoices.tipCents }).from(invoices).where(inArray(invoices.jobId, jobIds)) : Promise.resolve([]),
  ]);
  const feedbackTipByJob = new Map(feedbackTips.map((tip) => [tip.jobId, tip.tipCents]));
  const invoiceTipByJob = new Map<string, number>();
  for (const tip of invoiceTips) if (tip.jobId) invoiceTipByJob.set(tip.jobId, (invoiceTipByJob.get(tip.jobId) ?? 0) + tip.tipCents);

  const reviews = jobIds.length
    ? await db.select().from(payrollJobReviews).where(and(eq(payrollJobReviews.payrollPeriodId, period.id), eq(payrollJobReviews.userId, employee.id), inArray(payrollJobReviews.jobId, jobIds)))
    : [];
  const reviewByJob = new Map(reviews.map((review) => [review.jobId, review]));
  const paidMinutesByJob = new Map<string, number>();
  const varianceByJob = new Map<string, "pending" | "approved" | "rejected">();
  for (const row of uniqueRows) {
    const jthMinutes = row.estimatedDurationMinutes ?? 0;
    const loggedMinutes = minutesByJob.get(row.jobId) ?? 0;
    const crew = assignmentsByJob.get(row.jobId) ?? [];
    const existingReview = reviewByJob.get(row.jobId);
    if (crew.length >= 2 && loggedMinutes > jthMinutes) {
      if (!existingReview) {
        await db.insert(payrollJobReviews).values({ payrollPeriodId: period.id, jobId: row.jobId, userId: employee.id, jthMinutes, loggedMinutes, status: "pending" }).onConflictDoNothing();
        const result = paidMinutesForJob(jthMinutes, loggedMinutes, crew.length);
        paidMinutesByJob.set(row.jobId, result.paidMinutes);
        if (result.varianceStatus) varianceByJob.set(row.jobId, result.varianceStatus);
      } else {
        const result = paidMinutesForJob(jthMinutes, loggedMinutes, crew.length, existingReview);
        paidMinutesByJob.set(row.jobId, result.paidMinutes);
        if (result.varianceStatus) varianceByJob.set(row.jobId, result.varianceStatus);
      }
    } else {
      // Short logged time never reduces JTH pay for a multi-cleaner job.
      paidMinutesByJob.set(row.jobId, jthMinutes);
    }
  }

  // Internal meetings (staff appointments) count toward the same weekly
  // tier threshold as job hours — they're time this employee was paid for
  // in the period, same as any other worked hour.
  const appointments = await getAppointmentMinutesForEmployee(period.companyId, employee.id, period.startDate, period.endDate);
  const appointmentMinutes = appointments.reduce((sum, a) => sum + a.minutes, 0);

  // Tier rate depends on TOTAL PAID JTH HOURS, then one resulting rate is
  // applied to every job for this employee in the period.
  const jobMinutes = uniqueRows.reduce((sum, r) => sum + (paidMinutesByJob.get(r.jobId) ?? 0), 0);
  const totalMinutes = jobMinutes + appointmentMinutes;
  const totalHours = totalMinutes / 60;
  const tiers = (employee.payTiers as PayTier[] | null) ?? null;
  const rateCents = resolveTierRateCents(totalHours, tiers, employee.hourlyRateCents ?? 0);

  const appointmentCalculation: CalculationLine[] = appointments.map((appointment) => {
    const budgetHours = appointment.minutes / 60;
    const amountCents = Math.round(budgetHours * rateCents);
    return {
      jobId: appointment.id,
      date: appointment.date,
      customerName: appointment.title,
      cleaningType: "internal_meeting",
      budgetHours,
      hoursSpent: budgetHours,
      rateCents,
      amountCents,
      paidHours: budgetHours,
      clientTipCents: 0,
      bonusCents: 0,
      averageCentsPerHour: rateCents,
      isAppointment: true,
      appointmentTitle: appointment.title,
    };
  });

  const calculation: CalculationLine[] = [...uniqueRows.map((r) => {
    const minutes = r.estimatedDurationMinutes ?? 0;
    const paidMinutes = paidMinutesByJob.get(r.jobId) ?? minutes;
    const hoursSpent = (minutesByJob.get(r.jobId) ?? 0) / 60;
    const budgetHours = paidMinutes / 60;
    const clientTipCents = feedbackTipByJob.get(r.jobId) ?? invoiceTipByJob.get(r.jobId) ?? 0;
    const crew = assignmentsByJob.get(r.jobId) ?? [];
    const employeeIndex = crew.findIndex((assignment) => assignment.userId === employee.id);
    const tipShare = splitTipCents(clientTipCents, employeeIndex, crew.length);
    const trainerBonusCents = r.crewRole === "trainer" && crew.length >= 2 ? 1000 : 0;
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
      paidHours: budgetHours,
      varianceStatus: varianceByJob.get(r.jobId),
      clientTipCents: tipShare,
      bonusCents: trainerBonusCents,
      averageCentsPerHour: budgetHours > 0 ? Math.round(amountCents / budgetHours) : 0,
    };
  }), ...appointmentCalculation];

  const commissionCents = calculation.reduce((sum, c) => sum + c.amountCents, 0);
  const clientTipsCents = calculation.reduce((sum, c) => sum + c.clientTipCents, 0);
  const trainerBonusCents = calculation.reduce((sum, c) => sum + c.bonusCents, 0);
  const mileageMiles = assignments.filter((assignment) => assignment.userId === employee.id && assignment.role === "lead").reduce((sum, assignment) => sum + Number(assignment.mileageMiles), 0);

  await upsertAutomaticFields(period.id, employee.id, {
    jobsCount: uniqueRows.length,
    regularHours: totalHours.toFixed(2),
    commissionCents,
    officeHours: "0",
    officePayCents: 0,
    calculation,
    clientTipsCents,
    trainerBonusCents,
    mileageMiles: mileageMiles.toFixed(2),
    teamLeadBonusCents: 0,
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
  const jobMinutes = uniqueRows.reduce((sum, r) => sum + (r.minutesWorked ?? 0), 0);
  const appointments = await getAppointmentMinutesForEmployee(period.companyId, employee.id, period.startDate, period.endDate);
  const appointmentMinutes = appointments.reduce((sum, a) => sum + a.minutes, 0);
  const totalMinutes = jobMinutes + appointmentMinutes;
  const officeHours = totalMinutes / 60;
  // Manual office hours are deliberately not read here: refreshes recompute
  // only the clocked portion and upsertAutomaticFields preserves the manual
  // payroll-review value already stored on the line.
  const rateCents = employee.hourlyRateCents ?? 0;
  const officePayCents = await getOfficePayCents(period.id, employee.id, officeHours, rateCents);

  const appointmentCalculation: CalculationLine[] = appointments.map((appointment) => {
    const hoursSpent = appointment.minutes / 60;
    const amountCents = Math.round(hoursSpent * rateCents);
    return {
      jobId: appointment.id,
      date: appointment.date,
      customerName: appointment.title,
      cleaningType: "internal_meeting",
      budgetHours: hoursSpent,
      hoursSpent,
      rateCents,
      amountCents,
      paidHours: hoursSpent,
      clientTipCents: 0,
      bonusCents: 0,
      averageCentsPerHour: hoursSpent > 0 ? Math.round(amountCents / hoursSpent) : 0,
      isAppointment: true,
      appointmentTitle: appointment.title,
    };
  });

  const calculation: CalculationLine[] = [...uniqueRows.map((r) => {
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
      paidHours: hoursSpent,
      clientTipCents: 0,
      bonusCents: 0,
      averageCentsPerHour: hoursSpent > 0 ? Math.round(amountCents / hoursSpent) : 0,
    };
  }), ...appointmentCalculation];

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
  let officePayCents = line.officePayCents;
  if (line.officeHours !== "0" || line.manualOfficeHours !== "0") {
    const [employee] = await db
      .select({ hourlyRateCents: users.hourlyRateCents, payType: users.payType })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (employee?.payType === "office_hourly") {
      officePayCents = Math.round((Number(line.officeHours) + Number(line.manualOfficeHours)) * (employee.hourlyRateCents ?? 0));
    }
  }
  const finalCents = calculateFinalCents({ ...line, officePayCents, mileageCents });

  await db.update(payrollLines).set({ mileageCents, officePayCents, finalCents }).where(eq(payrollLines.id, line.id));
}

export function calculateFinalCents(line: {
  commissionCents: number;
  officePayCents: number;
  mileageCents: number;
  tipsPaycheckCents: number;
  tipsCashCents: number;
  clientTipsCents: number;
  bonusCents: number;
  teamLeadBonusCents: number;
  trainerBonusCents: number;
  trainingCents: number;
  adjustmentCents: number;
  payrollAdvanceCents: number;
}) {
  return line.commissionCents + line.officePayCents + line.mileageCents +
    line.tipsPaycheckCents + line.tipsCashCents + line.clientTipsCents + line.bonusCents +
    line.teamLeadBonusCents + line.trainerBonusCents + line.trainingCents +
    line.adjustmentCents - line.payrollAdvanceCents;
}

async function getOfficePayCents(periodId: string, userId: string, clockedHours: number, rateCents: number) {
  const [existing] = await db
    .select({ manualOfficeHours: payrollLines.manualOfficeHours })
    .from(payrollLines)
    .where(and(eq(payrollLines.payrollPeriodId, periodId), eq(payrollLines.userId, userId)))
    .limit(1);
  return Math.round((clockedHours + Number(existing?.manualOfficeHours ?? 0)) * rateCents);
}

/** Fetches all lines for a period, joined with employee info, for the UI/CSV. */
export async function getPayrollLinesForPeriod(periodId: string, companyId?: string) {
  const lines = await db
    .select({
      id: payrollLines.id,
      userId: payrollLines.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      title: users.title,
      gustoEmployeeId: users.gustoEmployeeId,
      payType: users.payType,
      hourlyRateCents: users.hourlyRateCents,
      jobsCount: payrollLines.jobsCount,
      regularHours: payrollLines.regularHours,
      commissionCents: payrollLines.commissionCents,
      officeHours: payrollLines.officeHours,
      manualOfficeHours: payrollLines.manualOfficeHours,
      officePayCents: payrollLines.officePayCents,
      mileageMiles: payrollLines.mileageMiles,
      mileageRateCents: payrollLines.mileageRateCents,
      mileageCents: payrollLines.mileageCents,
      tipsPaycheckCents: payrollLines.tipsPaycheckCents,
      tipsCashCents: payrollLines.tipsCashCents,
      clientTipsCents: payrollLines.clientTipsCents,
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
    .where(companyId
      ? and(eq(payrollLines.payrollPeriodId, periodId), eq(users.companyId, companyId))
      : eq(payrollLines.payrollPeriodId, periodId))
    .orderBy(users.lastName, users.firstName);

  return lines;
}
