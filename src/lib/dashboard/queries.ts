import { and, asc, eq, gte, inArray, lt, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, customers, employeePto, ghlSyncLog, invoices, jobAssignments, jobs, quotes, users } from "@/db/schema";
import { overdueSqlCondition } from "@/lib/invoices/overdue";
import type { CashToCollect, CrewCoverage, DashboardRange, ExceptionCounts, PulseMetrics, TodayRun } from "./types";
const n = (value: unknown) => Number(value ?? 0);
export async function getTodaysRun(companyId: string, todayIso: string): Promise<TodayRun> {
  const rows = await db.select({ id: jobs.id, status: jobs.status, type: jobs.type, scheduledStartTime: jobs.scheduledStartTime, firstName: customers.firstName, lastName: customers.lastName, address: customers.addressLine1, city: customers.city }).from(jobs).innerJoin(customers, eq(jobs.customerId, customers.id)).where(and(eq(jobs.companyId, companyId), eq(customers.companyId, companyId), eq(jobs.scheduledDate, todayIso))).orderBy(jobs.scheduledStartTime);
  const assignments = rows.length ? await db.select({ jobId: jobAssignments.jobId, firstName: users.firstName, lastName: users.lastName }).from(jobAssignments).innerJoin(users, eq(jobAssignments.userId, users.id)).innerJoin(jobs, eq(jobAssignments.jobId, jobs.id)).where(and(eq(jobs.companyId, companyId), eq(users.companyId, companyId), inArray(jobAssignments.jobId, rows.map((row) => row.id)))) : [];
  const byJob = new Map<string, string[]>(); assignments.forEach((row) => byJob.set(row.jobId, [...(byJob.get(row.jobId) ?? []), row.firstName + " " + row.lastName]));
  const now = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const jobsView = rows.map((row) => ({ id: row.id, status: row.status, type: row.type, scheduledStartTime: row.scheduledStartTime, customerName: row.firstName + " " + row.lastName, address: [row.address, row.city].filter(Boolean).join(", ") || "Address not set", assignedTo: byJob.get(row.id) ?? [] }));
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
  const from = new Date(range.fromIso + "T00:00:00.000Z"); const to = new Date(range.toIso + "T00:00:00.000Z"); to.setUTCDate(to.getUTCDate() + 1); const previousFrom = new Date(range.prevFromIso + "T00:00:00.000Z"); const previousTo = new Date(range.prevToIso + "T00:00:00.000Z"); previousTo.setUTCDate(previousTo.getUTCDate() + 1);
  const [today, revenue, previous, conversion, collections] = await Promise.all([getTodaysRun(companyId, range.todayIso), db.select({ amount: sql<number>`coalesce(sum(${invoices.amountPaidCents}), 0)`, count: sql<number>`count(*)` }).from(invoices).where(and(eq(invoices.companyId, companyId), eq(invoices.status, "paid"), gte(invoices.paidAt, from), lt(invoices.paidAt, to))), db.select({ amount: sql<number>`coalesce(sum(${invoices.amountPaidCents}), 0)` }).from(invoices).where(and(eq(invoices.companyId, companyId), eq(invoices.status, "paid"), gte(invoices.paidAt, previousFrom), lt(invoices.paidAt, previousTo))), db.select({ sent: sql<number>`count(*) filter (where ${quotes.status} <> 'draft')`, accepted: sql<number>`count(*) filter (where ${quotes.status} = 'accepted')` }).from(quotes).where(and(eq(quotes.companyId, companyId), gte(quotes.createdAt, from), lt(quotes.createdAt, to))), db.select({ count: sql<number>`count(*)`, amount: sql<number>`coalesce(sum(greatest(${invoices.totalCents} - ${invoices.amountPaidCents}, 0)), 0)` }).from(invoices).where(and(eq(invoices.companyId, companyId), overdueSqlCondition()))]);
  return { jobsToday: { scheduled: today.scheduled, completed: today.completed, atRisk: today.atRisk }, revenue: { receivedCents: n(revenue[0]?.amount), previousCents: n(previous[0]?.amount), hasData: n(revenue[0]?.count) > 0 }, conversion: { sent: n(conversion[0]?.sent), accepted: n(conversion[0]?.accepted), hasData: n(conversion[0]?.sent) > 0 }, collections: { overdueCents: n(collections[0]?.amount), overdueCount: n(collections[0]?.count) } };
}

export async function getCashToCollect(companyId: string): Promise<CashToCollect> {
  const [rows, totals] = await Promise.all([
    db.select({ id: invoices.id, customerId: customers.id, firstName: customers.firstName, lastName: customers.lastName, totalCents: invoices.totalCents, amountPaidCents: invoices.amountPaidCents, createdAt: invoices.createdAt }).from(invoices).innerJoin(customers, eq(invoices.customerId, customers.id)).where(and(eq(invoices.companyId, companyId), overdueSqlCondition())).orderBy(asc(invoices.createdAt)).limit(5),
    db.select({ totalCents: sql<number>`coalesce(sum(greatest(${invoices.totalCents} - ${invoices.amountPaidCents}, 0)), 0)` }).from(invoices).where(and(eq(invoices.companyId, companyId), overdueSqlCondition())),
  ]);
  const now = Date.now();
  return { totalCents: n(totals[0]?.totalCents), invoices: rows.map((row) => ({ id: row.id, customerId: row.customerId, customerName: `${row.firstName} ${row.lastName}`, amountDueCents: Math.max(row.totalCents - row.amountPaidCents, 0), daysBeyondGrace: Math.max(0, Math.floor((now - new Date(row.createdAt).getTime()) / 86400000) - 14) })) };
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
    db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(and(eq(users.companyId, companyId), eq(users.role, "employee"), eq(users.isActive, true))).orderBy(users.firstName, users.lastName),
    db.select({ userId: jobAssignments.userId, scheduledDate: jobs.scheduledDate, estimatedDurationMinutes: jobs.estimatedDurationMinutes }).from(jobAssignments).innerJoin(jobs, eq(jobAssignments.jobId, jobs.id)).innerJoin(users, eq(jobAssignments.userId, users.id)).where(and(eq(jobs.companyId, companyId), eq(users.companyId, companyId), eq(users.role, "employee"), eq(users.isActive, true), gte(jobs.scheduledDate, weekStartIso), lte(jobs.scheduledDate, weekEndIso))),
    db.select({ userId: employeePto.userId, startDate: employeePto.startDate, endDate: employeePto.endDate, startPeriod: employeePto.startPeriod, endPeriod: employeePto.endPeriod }).from(employeePto).where(and(eq(employeePto.companyId, companyId), lte(employeePto.startDate, weekEndIso), gte(employeePto.endDate, weekStartIso))),
  ]);
  const hours = new Map<string, number>();
  assignments.forEach((assignment) => hours.set(`${assignment.userId}:${assignment.scheduledDate}`, (hours.get(`${assignment.userId}:${assignment.scheduledDate}`) ?? 0) + (assignment.estimatedDurationMinutes ?? 0) / 60));
  return { days, ptoCount: pto.length, employees: employees.map((employee) => ({ id: employee.id, name: `${employee.firstName} ${employee.lastName}`, hoursByDay: days.map((day) => hours.get(`${employee.id}:${day}`) ?? 0), ptoByDay: days.map((day) => pto.filter((entry) => entry.userId === employee.id && entry.startDate <= day && entry.endDate >= day).map((entry) => ptoPeriodForDate(entry, day)).includes("full") ? "full" : pto.filter((entry) => entry.userId === employee.id && entry.startDate <= day && entry.endDate >= day).map((entry) => ptoPeriodForDate(entry, day))[0] ?? null) })) };
}
