import { and, asc, eq, gte, inArray, lt, lte, ne, sql, type AnyColumn } from "drizzle-orm";
import { db } from "@/db";
import { companies, customers, employeePto, ghlSyncLog, invoices, jobAssignments, jobs, quotes, users } from "@/db/schema";
import { overdueSqlCondition } from "@/lib/invoices/overdue";
import { isFieldEligible } from "@/lib/auth/field-staff";
import type { CashToCollect, CrewCoverage, DashboardRange, ExceptionCounts, OperationsDashboard, PulseMetrics, RevenueSeries, TodayRun } from "./types";
import { addDaysIso } from "./range";
const n = (value: unknown) => Number(value ?? 0);

function dashboardCustomerName(customer: {
  clientType: "residential" | "commercial";
  companyName: string | null;
  firstName: string;
  lastName: string;
}) {
  return customer.clientType === "commercial" && customer.companyName?.trim()
    ? customer.companyName.trim()
    : `${customer.firstName} ${customer.lastName}`;
}

function paidRangeCondition(companyId: string, fromIso: string, toIsoInclusive: string, timeZone: string) {
  const toExclusiveIso = addDaysIso(toIsoInclusive, 1);
  return and(
    eq(invoices.companyId, companyId),
    eq(invoices.status, "paid"),
    gte(invoices.paidAt, sql`(${fromIso}::date::timestamp AT TIME ZONE ${timeZone})`),
    lt(invoices.paidAt, sql`(${toExclusiveIso}::date::timestamp AT TIME ZONE ${timeZone})`),
  );
}

function timestampRangeCondition(column: AnyColumn, fromIso: string, toIsoInclusive: string, timeZone: string) {
  const toExclusiveIso = addDaysIso(toIsoInclusive, 1);
  return and(
    gte(column, sql`(${fromIso}::date::timestamp AT TIME ZONE ${timeZone})`),
    lt(column, sql`(${toExclusiveIso}::date::timestamp AT TIME ZONE ${timeZone})`),
  );
}

export async function getOperationsDashboard(companyId: string, range: DashboardRange, revenueTargetCents: number | null): Promise<OperationsDashboard> {
  const weekEndIso = range.toIso;
  const weekStartIso = addDaysIso(weekEndIso, -6);
  const weeklyDates = Array.from({ length: 7 }, (_, index) => addDaysIso(weekStartIso, index));
  const paidDay = sql<string>`to_char(${invoices.paidAt} AT TIME ZONE ${range.timeZone}, 'YYYY-MM-DD')`;
  const bookedQuote = sql`exists (select 1 from jobs where jobs.company_id = ${companyId} and jobs.quote_id = ${quotes.id})`;
  const [clientRows, quoteRows, previousQuoteRows, weeklyRevenueRows, agingRows] = await Promise.all([
    db.select({
      total: sql<number>`count(*) filter (where ${customers.isArchived} = false)`,
      active: sql<number>`count(*) filter (where ${customers.isArchived} = false and ${customers.recurrence} is not null and ${customers.recurrence} <> 'none')`,
      gained: sql<number>`count(*) filter (where ${customers.isArchived} = false and ${timestampRangeCondition(customers.createdAt, range.fromIso, range.toIso, range.timeZone)})`,
      lost: sql<number>`count(*) filter (where ${customers.isArchived} = true and ${timestampRangeCondition(customers.archivedAt, range.fromIso, range.toIso, range.timeZone)})`,
      newLeads: sql<number>`count(*) filter (where ${customers.status} = 'lead' and ${timestampRangeCondition(customers.createdAt, range.fromIso, range.toIso, range.timeZone)})`,
    }).from(customers).where(eq(customers.companyId, companyId)),
    db.select({
      sent: sql<number>`count(*) filter (where ${quotes.status} <> 'draft' and ${timestampRangeCondition(quotes.createdAt, range.fromIso, range.toIso, range.timeZone)})`,
      accepted: sql<number>`count(*) filter (where ${quotes.status} = 'accepted' and ${timestampRangeCondition(quotes.acceptedAt, range.fromIso, range.toIso, range.timeZone)})`,
      booked: sql<number>`count(*) filter (where ${quotes.status} = 'accepted' and ${bookedQuote} and ${timestampRangeCondition(quotes.acceptedAt, range.fromIso, range.toIso, range.timeZone)})`,
    }).from(quotes).where(eq(quotes.companyId, companyId)),
    db.select({
      sent: sql<number>`count(*) filter (where ${quotes.status} <> 'draft' and ${timestampRangeCondition(quotes.createdAt, range.prevFromIso, range.prevToIso, range.timeZone)})`,
      accepted: sql<number>`count(*) filter (where ${quotes.status} = 'accepted' and ${timestampRangeCondition(quotes.acceptedAt, range.prevFromIso, range.prevToIso, range.timeZone)})`,
    }).from(quotes).where(eq(quotes.companyId, companyId)),
    db.select({ day: paidDay, amount: sql<number>`coalesce(sum(${invoices.amountPaidCents}), 0)` }).from(invoices).where(paidRangeCondition(companyId, weekStartIso, weekEndIso, range.timeZone)).groupBy(sql`1`),
    db.select({ count: sql<number>`count(*)` }).from(quotes).where(and(eq(quotes.companyId, companyId), eq(quotes.status, "sent"), lte(quotes.sentAt, sql`now() - interval '7 days'`))),
  ]);
  const revenueByDay = new Map(weeklyRevenueRows.map((row) => [row.day, n(row.amount)]));
  const amountsCents = weeklyDates.map((date) => revenueByDay.get(date) ?? 0);
  const weeklyRevenueTargetCents = revenueTargetCents === null ? null : weeklyDates.reduce((total, date) => total + revenueTargetCents / daysInMonth(date), 0);
  return {
    clients: { total: n(clientRows[0]?.total), active: n(clientRows[0]?.active), gained: n(clientRows[0]?.gained), lost: n(clientRows[0]?.lost), newLeads: n(clientRows[0]?.newLeads) },
    quotes: { sent: n(quoteRows[0]?.sent), accepted: n(quoteRows[0]?.accepted), booked: n(quoteRows[0]?.booked), aging: n(agingRows[0]?.count), previousSent: n(previousQuoteRows[0]?.sent), previousAccepted: n(previousQuoteRows[0]?.accepted) },
    weeklyRevenue: { dates: weeklyDates, amountsCents, totalCents: amountsCents.reduce((total, amount) => total + amount, 0) },
    weeklyRevenueTargetCents,
  };
}
export async function getTodaysRun(companyId: string, todayIso: string): Promise<TodayRun> {
  const rows = await db.select({ id: jobs.id, status: jobs.status, type: jobs.type, scheduledStartTime: jobs.scheduledStartTime, clientType: customers.clientType, companyName: customers.companyName, firstName: customers.firstName, lastName: customers.lastName, address: customers.addressLine1, city: customers.city }).from(jobs).innerJoin(customers, eq(jobs.customerId, customers.id)).where(and(eq(jobs.companyId, companyId), eq(customers.companyId, companyId), eq(jobs.scheduledDate, todayIso))).orderBy(jobs.scheduledStartTime);
  const assignments = rows.length ? await db.select({ jobId: jobAssignments.jobId, firstName: users.firstName, lastName: users.lastName }).from(jobAssignments).innerJoin(users, eq(jobAssignments.userId, users.id)).innerJoin(jobs, eq(jobAssignments.jobId, jobs.id)).where(and(eq(jobs.companyId, companyId), eq(users.companyId, companyId), inArray(jobAssignments.jobId, rows.map((row) => row.id)))) : [];
  const byJob = new Map<string, string[]>(); assignments.forEach((row) => byJob.set(row.jobId, [...(byJob.get(row.jobId) ?? []), row.firstName + " " + row.lastName]));
  const now = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const jobsView = rows.map((row) => ({ id: row.id, status: row.status, type: row.type, scheduledStartTime: row.scheduledStartTime, customerName: dashboardCustomerName(row), address: [row.address, row.city].filter(Boolean).join(", ") || "Address not set", assignedTo: byJob.get(row.id) ?? [] }));
  return { jobs: jobsView, scheduled: rows.filter((row) => row.status === "scheduled").length, completed: rows.filter((row) => row.status === "completed").length, atRisk: jobsView.filter((job) => job.assignedTo.length === 0 || (job.status === "scheduled" && Boolean(job.scheduledStartTime && job.scheduledStartTime.slice(0, 5) < now))).length };
}
export async function getExceptionCounts(companyId: string, todayIso: string): Promise<ExceptionCounts> {
  const [jobRows, customerRows, syncRows, companyRows] = await Promise.all([
    db.select({ unassigned: sql<number>`count(*) filter (where not exists (select 1 from job_assignments ja where ja.job_id = ${jobs.id}))`, missingHours: sql<number>`count(*) filter (where ${jobs.status} = 'completed' and not exists (select 1 from time_entries te where te.job_id = ${jobs.id}))`, awaitingInvoice: sql<number>`count(*) filter (where ${jobs.status} = 'completed' and not exists (select 1 from invoices i where i.job_id = ${jobs.id} and i.company_id = ${companyId}))` }).from(jobs).where(and(eq(jobs.companyId, companyId), eq(jobs.scheduledDate, todayIso))),
    db.select({ paymentMethod: sql<number>`count(*) filter (where ${customers.isArchived} = false and (${customers.paymentMethods} is null or cardinality(${customers.paymentMethods}) = 0))`, incompleteNotes: sql<number>`count(*) filter (where ${customers.isArchived} = false and (${customers.addressLine1} is null or ${customers.addressLine1} = '' or ${customers.generalNotes} is null or trim(${customers.generalNotes}) = '' or ${customers.gateCodeOrKeyNotes} is null or trim(${customers.gateCodeOrKeyNotes}) = ''))` }).from(customers).where(eq(customers.companyId, companyId)),
    db.select({ count: sql<number>`count(*)` }).from(ghlSyncLog).where(and(eq(ghlSyncLog.companyId, companyId), ne(ghlSyncLog.status, "ok"))),
    db.select({ settings: companies.settings }).from(companies).where(eq(companies.id, companyId)).limit(1),
  ]);
  const inventory = Array.isArray((companyRows[0]?.settings as { inventory?: unknown } | undefined)?.inventory) ? (companyRows[0]!.settings as { inventory: Array<{ onHand: number; reorderAt: number }> }).inventory : [];
  return { unassigned: n(jobRows[0]?.unassigned), missingHours: n(jobRows[0]?.missingHours), awaitingInvoice: n(jobRows[0]?.awaitingInvoice), paymentMethod: n(customerRows[0]?.paymentMethod), incompleteNotes: n(customerRows[0]?.incompleteNotes), sync: n(syncRows[0]?.count), lowSupplies: inventory.filter((item) => item.onHand <= item.reorderAt).length };
}
export async function getPulseMetrics(companyId: string, range: DashboardRange): Promise<PulseMetrics> {
  const [today, revenue, previous, conversion, collections] = await Promise.all([getTodaysRun(companyId, range.todayIso), db.select({ amount: sql<number>`coalesce(sum(${invoices.amountPaidCents}), 0)`, count: sql<number>`count(*)` }).from(invoices).where(paidRangeCondition(companyId, range.fromIso, range.toIso, range.timeZone)), db.select({ amount: sql<number>`coalesce(sum(${invoices.amountPaidCents}), 0)` }).from(invoices).where(paidRangeCondition(companyId, range.prevFromIso, range.prevToIso, range.timeZone)), db.select({ sent: sql<number>`count(*) filter (where ${quotes.status} <> 'draft' and ${timestampRangeCondition(quotes.createdAt, range.fromIso, range.toIso, range.timeZone)})`, accepted: sql<number>`count(*) filter (where ${quotes.status} = 'accepted' and ${timestampRangeCondition(quotes.acceptedAt, range.fromIso, range.toIso, range.timeZone)})` }).from(quotes).where(eq(quotes.companyId, companyId)), db.select({ count: sql<number>`count(*)`, amount: sql<number>`coalesce(sum(greatest(${invoices.totalCents} - ${invoices.amountPaidCents}, 0)), 0)` }).from(invoices).where(and(eq(invoices.companyId, companyId), overdueSqlCondition()))]);
  return { jobsToday: { scheduled: today.scheduled, completed: today.completed, atRisk: today.atRisk }, revenue: { receivedCents: n(revenue[0]?.amount), previousCents: n(previous[0]?.amount), hasData: n(revenue[0]?.count) > 0 }, conversion: { sent: n(conversion[0]?.sent), accepted: n(conversion[0]?.accepted), hasData: n(conversion[0]?.sent) > 0 }, collections: { overdueCents: n(collections[0]?.amount), overdueCount: n(collections[0]?.count) } };
}

function daysInMonth(isoDate: string) {
  const [year, month] = isoDate.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export async function getRevenueSeries(companyId: string, range: DashboardRange, targetCents: number | null | undefined): Promise<RevenueSeries> {
  const dates = Array.from({ length: Math.round((new Date(`${range.toIso}T00:00:00.000Z`).getTime() - new Date(`${range.fromIso}T00:00:00.000Z`).getTime()) / 86400000) + 1 }, (_, index) => addDaysIso(range.fromIso, index));
  const bucket = sql<string>`to_char(${invoices.paidAt} AT TIME ZONE ${range.timeZone}, 'YYYY-MM-DD')`;
  const [currentRows, priorRows] = await Promise.all([
    db.select({ day: bucket, amount: sql<number>`coalesce(sum(${invoices.amountPaidCents}), 0)` }).from(invoices).where(paidRangeCondition(companyId, range.fromIso, range.toIso, range.timeZone)).groupBy(sql`1`),
    db.select({ day: bucket, amount: sql<number>`coalesce(sum(${invoices.amountPaidCents}), 0)` }).from(invoices).where(paidRangeCondition(companyId, range.prevFromIso, range.prevToIso, range.timeZone)).groupBy(sql`1`),
  ]);
  const currentByDay = new Map(currentRows.map((row) => [row.day, n(row.amount)]));
  const priorByDay = new Map(priorRows.map((row) => [row.day, n(row.amount)]));
  const actualCents = dates.map((date) => currentByDay.get(date) ?? 0);
  const priorDates = dates.map((_, index) => addDaysIso(range.prevFromIso, index));
  const priorCents = priorDates.map((date) => priorByDay.get(date) ?? 0);
  const target = typeof targetCents === "number" ? dates.map((date) => targetCents / daysInMonth(date)) : null;
  return { dates, actualCents, priorCents, targetCents: target, actualTotalCents: actualCents.reduce((sum, amount) => sum + amount, 0), priorTotalCents: priorCents.reduce((sum, amount) => sum + amount, 0), targetTotalCents: target?.reduce((sum, amount) => sum + amount, 0) ?? null };
}

export async function getCashToCollect(companyId: string): Promise<CashToCollect> {
  const [rows, totals] = await Promise.all([
    db.select({ id: invoices.id, customerId: customers.id, clientType: customers.clientType, companyName: customers.companyName, firstName: customers.firstName, lastName: customers.lastName, totalCents: invoices.totalCents, amountPaidCents: invoices.amountPaidCents, createdAt: invoices.createdAt }).from(invoices).innerJoin(customers, eq(invoices.customerId, customers.id)).where(and(eq(invoices.companyId, companyId), overdueSqlCondition())).orderBy(asc(invoices.createdAt)).limit(5),
    db.select({ totalCents: sql<number>`coalesce(sum(greatest(${invoices.totalCents} - ${invoices.amountPaidCents}, 0)), 0)` }).from(invoices).where(and(eq(invoices.companyId, companyId), overdueSqlCondition())),
  ]);
  const now = Date.now();
  return { totalCents: n(totals[0]?.totalCents), invoices: rows.map((row) => ({ id: row.id, customerId: row.customerId, customerName: dashboardCustomerName(row), amountDueCents: Math.max(row.totalCents - row.amountPaidCents, 0), daysBeyondGrace: Math.max(0, Math.floor((now - new Date(row.createdAt).getTime()) / 86400000) - 14) })) };
}

function isoWeekdays(weekStartIso: string) {
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(`${weekStartIso}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function ptoPeriodForDate(pto: { startDate: string; endDate: string; startPeriod: "full" | "morning" | "afternoon"; endPeriod: "full" | "morning" | "afternoon" }, date: string) {
  if (pto.startDate === pto.endDate) return pto.startPeriod === pto.endPeriod ? pto.startPeriod : "full";
  if (date === pto.startDate) return pto.startPeriod;
  if (date === pto.endDate) return pto.endPeriod;
  return "full";
}

export async function getCrewCoverage(companyId: string, weekStartIso: string): Promise<CrewCoverage> {
  const days = isoWeekdays(weekStartIso);
  const weekEndIso = days[days.length - 1]!;
  const [employees, assignments, pto] = await Promise.all([
    db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(and(eq(users.companyId, companyId), isFieldEligible, eq(users.isActive, true))).orderBy(users.firstName, users.lastName),
    db.select({ userId: jobAssignments.userId, scheduledDate: jobs.scheduledDate, estimatedDurationMinutes: jobs.estimatedDurationMinutes }).from(jobAssignments).innerJoin(jobs, eq(jobAssignments.jobId, jobs.id)).innerJoin(users, eq(jobAssignments.userId, users.id)).where(and(eq(jobs.companyId, companyId), eq(users.companyId, companyId), isFieldEligible, eq(users.isActive, true), gte(jobs.scheduledDate, weekStartIso), lte(jobs.scheduledDate, weekEndIso))),
    db.select({ userId: employeePto.userId, startDate: employeePto.startDate, endDate: employeePto.endDate, startPeriod: employeePto.startPeriod, endPeriod: employeePto.endPeriod }).from(employeePto).where(and(eq(employeePto.companyId, companyId), lte(employeePto.startDate, weekEndIso), gte(employeePto.endDate, weekStartIso))),
  ]);
  const hours = new Map<string, number>();
  assignments.forEach((assignment) => hours.set(`${assignment.userId}:${assignment.scheduledDate}`, (hours.get(`${assignment.userId}:${assignment.scheduledDate}`) ?? 0) + (assignment.estimatedDurationMinutes ?? 0) / 60));
  return { days, ptoCount: pto.length, employees: employees.map((employee) => ({ id: employee.id, name: `${employee.firstName} ${employee.lastName}`, hoursByDay: days.map((day) => hours.get(`${employee.id}:${day}`) ?? 0), ptoByDay: days.map((day) => pto.filter((entry) => entry.userId === employee.id && entry.startDate <= day && entry.endDate >= day).map((entry) => ptoPeriodForDate(entry, day)).includes("full") ? "full" : pto.filter((entry) => entry.userId === employee.id && entry.startDate <= day && entry.endDate >= day).map((entry) => ptoPeriodForDate(entry, day))[0] ?? null) })) };
}
