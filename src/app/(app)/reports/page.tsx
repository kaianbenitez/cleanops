import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { companies, customers, ghlSyncLog, invoices, jobs, jobAssignments, payrollLines, payrollPeriods, quotes, timeEntries, users, webhookEvents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { payrollWeekRangeForDate } from "@/lib/payroll/periods";
import ReportsMotion from "./reports-motion";

type JobRow = {
  id: string;
  status: string;
  type: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
  customerId: string;
  customerFirstName: string;
  customerLastName: string;
  addressLine1: string | null;
  city: string | null;
  zip: string | null;
};

type SyncRow = {
  id: string;
  eventType: string;
  status: "ok" | "failed" | "retrying";
  attempts: number;
  lastAttemptAt: Date | null;
  response: unknown;
  createdAt: Date;
};

type WebhookRow = {
  id: string;
  source: "ghl" | "square";
  signatureValid: boolean;
  payload: unknown;
  processedAt: Date | null;
  error: string | null;
  createdAt: Date;
};

type PayrollRow = {
  id: string;
  userId: string;
  name: string;
  title: string | null;
  payType: string | null;
  jobsCount: number;
  regularHours: number;
  officeHours: number;
  commissionCents: number;
  officePayCents: number;
  mileageMiles: number;
  tipsCents: number;
  bonusCents: number;
  finalCents: number;
  source: "period" | "derived";
};

type SummaryCard = {
  label: string;
  value: string;
  note: string;
  trend?: string;
  tone?: "neutral" | "good" | "warn";
  sparkline?: number[];
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function compactMoney(cents: number) {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return money(cents);
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function addDaysIso(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const result = { year: "", month: "", day: "" };
  parts.forEach((part) => {
    if (part.type === "year" || part.type === "month" || part.type === "day") {
      result[part.type] = part.value;
    }
  });
  return result;
}

function formatDay(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${iso}T12:00:00.000Z`));
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatClock(value: string | null) {
  if (!value) return "—";
  const [hours, minutes] = value.split(":").map((part) => Number(part || 0));
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function sparklinePath(values: number[]) {
  if (values.length === 0) return "";
  const width = 160;
  const height = 56;
  const padding = 4;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  return values
    .map((value, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" L ");
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warn" | "ink";
}) {
  const classes =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "ink"
          ? "border-[var(--co-evergreen)] bg-[var(--co-evergreen)] text-white"
          : "border-[var(--co-line)] bg-white text-[var(--co-muted)]";

  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${classes}`}>{children}</span>;
}

function StatCard({
  label,
  value,
  note,
  trend,
  tone = "neutral",
  sparkline,
}: SummaryCard) {
  const accent = tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-[var(--co-ink)]";

  return (
    <div className="co-card p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--co-muted)]">{label}</p>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <p className={`text-3xl font-semibold tracking-[-0.045em] ${accent}`}>{value}</p>
          <p className="mt-2 text-xs text-[var(--co-muted)]">{note}</p>
          {trend ? <p className="mt-1 text-xs font-medium text-[var(--co-success)]">{trend}</p> : null}
        </div>
        {sparkline?.length ? (
          <svg aria-hidden="true" className="mt-1 h-14 w-24 shrink-0 text-[var(--co-evergreen)]" viewBox="0 0 160 56" fill="none">
            <path d={`M ${sparklinePath(sparkline)} L 156 52 L 4 52 Z`} fill="currentColor" fillOpacity="0.08" />
            <path d={`M ${sparklinePath(sparkline)}`} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </div>
    </div>
  );
}

function SectionPanel({
  id,
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} data-report-reveal className="co-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--co-line-soft)] px-5 py-4 sm:px-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">{title}</h2>
          <p className="mt-1 text-sm text-[var(--co-muted)]">{description}</p>
        </div>
        {action ? <div>{action}</div> : null}
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

function TableShell({
  columns,
  minWidth = 900,
  children,
}: {
  columns: string[];
  minWidth?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <thead className="border-b border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/55 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 first:pl-0 last:pr-0">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--co-line-soft)]">{children}</tbody>
      </table>
    </div>
  );
}

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/my-day");

  const [company, activeEmployees] = await Promise.all([
    db.select({ name: companies.name, timezone: companies.timezone }).from(companies).where(eq(companies.id, user.companyId)).limit(1).then((rows) => rows[0] ?? null),
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        title: users.title,
        payType: users.payType,
        hourlyRateCents: users.hourlyRateCents,
      })
      .from(users)
      .where(and(eq(users.companyId, user.companyId), eq(users.role, "employee"), eq(users.isActive, true)))
      .orderBy(users.firstName),
  ]);

  if (!company) redirect("/login");

  const todayParts = todayInTimezone(company.timezone);
  const todayIso = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  const weekRange = payrollWeekRangeForDate(todayIso);
  const monthStart = `${todayIso.slice(0, 7)}-01`;
  const nextWeekStart = addDaysIso(weekRange.endDate, 1);
  const previousWeekStart = addDaysIso(weekRange.startDate, -7);
  const previousWeekEnd = weekRange.startDate;
  const monthEnd = addDaysIso(monthStart, 32).slice(0, 8) + "01";
  const weekStartDate = new Date(`${weekRange.startDate}T00:00:00.000Z`);
  const weekEndExclusiveDate = new Date(`${nextWeekStart}T00:00:00.000Z`);
  const previousWeekStartDate = new Date(`${previousWeekStart}T00:00:00.000Z`);
  const previousWeekEndDate = new Date(`${previousWeekEnd}T00:00:00.000Z`);
  const monthStartDate = new Date(`${monthStart}T00:00:00.000Z`);
  const monthEndDate = new Date(`${monthEnd}T00:00:00.000Z`);

  const weekJobsQuery = db
    .select({
      id: jobs.id,
      status: jobs.status,
      type: jobs.type,
      scheduledDate: jobs.scheduledDate,
      scheduledStartTime: jobs.scheduledStartTime,
      estimatedDurationMinutes: jobs.estimatedDurationMinutes,
      createdAt: jobs.createdAt,
      updatedAt: jobs.updatedAt,
      customerId: jobs.customerId,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      addressLine1: customers.addressLine1,
      city: customers.city,
      zip: customers.zip,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(and(eq(jobs.companyId, user.companyId), gte(jobs.scheduledDate, weekRange.startDate), lt(jobs.scheduledDate, nextWeekStart)))
    .orderBy(jobs.scheduledDate, jobs.scheduledStartTime, jobs.createdAt);

  const monthJobsQuery = db
    .select({
      id: jobs.id,
      status: jobs.status,
      type: jobs.type,
      scheduledDate: jobs.scheduledDate,
      scheduledStartTime: jobs.scheduledStartTime,
      estimatedDurationMinutes: jobs.estimatedDurationMinutes,
      createdAt: jobs.createdAt,
      updatedAt: jobs.updatedAt,
      customerId: jobs.customerId,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      addressLine1: customers.addressLine1,
      city: customers.city,
      zip: customers.zip,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(and(eq(jobs.companyId, user.companyId), gte(jobs.scheduledDate, monthStart), lt(jobs.scheduledDate, monthEnd)))
    .orderBy(desc(jobs.scheduledDate), jobs.scheduledStartTime, jobs.createdAt);

  const [
    weekPaidInvoices,
    prevWeekPaidInvoices,
    openQuotesRows,
    quotesSentRows,
    quotesAcceptedRows,
    leadsRows,
    recurringRows,
    weekJobsRows,
    monthJobsRows,
    customerRows,
    overdueInvoiceRows,
    ghlSyncRows,
    webhookRows,
    payrollPeriodRows,
  ] = await Promise.all([
    db
      .select({ paidAt: invoices.paidAt, amountPaidCents: invoices.amountPaidCents })
      .from(invoices)
      .where(and(eq(invoices.companyId, user.companyId), eq(invoices.status, "paid"), gte(invoices.paidAt, weekStartDate), lt(invoices.paidAt, weekEndExclusiveDate))),
    db
      .select({ paidAt: invoices.paidAt, amountPaidCents: invoices.amountPaidCents })
      .from(invoices)
      .where(and(eq(invoices.companyId, user.companyId), eq(invoices.status, "paid"), gte(invoices.paidAt, previousWeekStartDate), lt(invoices.paidAt, previousWeekEndDate))),
    db
      .select({
        id: quotes.id,
        status: quotes.status,
        totalCents: quotes.totalCents,
        createdAt: quotes.createdAt,
        sentAt: quotes.sentAt,
        acceptedAt: quotes.acceptedAt,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
      })
      .from(quotes)
      .innerJoin(customers, eq(quotes.customerId, customers.id))
      .where(and(eq(quotes.companyId, user.companyId), inArray(quotes.status, ["draft", "sent", "viewed"])))
      .orderBy(desc(quotes.createdAt))
      .limit(6),
    db
      .select({ id: quotes.id, createdAt: quotes.createdAt })
      .from(quotes)
      .where(and(eq(quotes.companyId, user.companyId), gte(quotes.sentAt, monthStartDate), lt(quotes.sentAt, monthEndDate))),
    db
      .select({ id: quotes.id, createdAt: quotes.createdAt })
      .from(quotes)
      .where(and(eq(quotes.companyId, user.companyId), gte(quotes.acceptedAt, monthStartDate), lt(quotes.acceptedAt, monthEndDate))),
    db
      .select({ id: customers.id, createdAt: customers.createdAt })
      .from(customers)
      .where(and(eq(customers.companyId, user.companyId), eq(customers.status, "lead"), gte(customers.createdAt, monthStartDate), lt(customers.createdAt, monthEndDate))),
    db
      .select({ id: customers.id, createdAt: customers.createdAt, updatedAt: customers.updatedAt, recurrence: customers.recurrence })
      .from(customers)
      .where(and(eq(customers.companyId, user.companyId), eq(customers.status, "client"), gte(customers.updatedAt, monthStartDate), lt(customers.updatedAt, monthEndDate))),
    weekJobsQuery,
    monthJobsQuery,
    db
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        status: customers.status,
        recurrence: customers.recurrence,
        paymentMethods: customers.paymentMethods,
        generalNotes: customers.generalNotes,
      })
      .from(customers)
      .where(eq(customers.companyId, user.companyId))
      .orderBy(customers.firstName),
    db
      .select({
        id: invoices.id,
        customerId: invoices.customerId,
        createdAt: invoices.createdAt,
        totalCents: invoices.totalCents,
        amountPaidCents: invoices.amountPaidCents,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        method: invoices.method,
      })
      .from(invoices)
      .innerJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(eq(invoices.companyId, user.companyId), eq(invoices.status, "sent"), lt(invoices.createdAt, new Date(new Date().getTime() - 14 * 24 * 60 * 60 * 1000))))
      .orderBy(desc(invoices.createdAt))
      .limit(8),
    db
      .select({
        id: ghlSyncLog.id,
        eventType: ghlSyncLog.eventType,
        status: ghlSyncLog.status,
        attempts: ghlSyncLog.attempts,
        lastAttemptAt: ghlSyncLog.lastAttemptAt,
        response: ghlSyncLog.response,
        createdAt: ghlSyncLog.createdAt,
      })
      .from(ghlSyncLog)
      .where(eq(ghlSyncLog.companyId, user.companyId))
      .orderBy(desc(ghlSyncLog.createdAt))
      .limit(8),
    db
      .select({
        id: webhookEvents.id,
        source: webhookEvents.source,
        signatureValid: webhookEvents.signatureValid,
        payload: webhookEvents.payload,
        processedAt: webhookEvents.processedAt,
        error: webhookEvents.error,
        createdAt: webhookEvents.createdAt,
      })
      .from(webhookEvents)
      .orderBy(desc(webhookEvents.createdAt))
      .limit(8),
    db
      .select()
      .from(payrollPeriods)
      .where(and(eq(payrollPeriods.companyId, user.companyId), eq(payrollPeriods.startDate, weekRange.startDate), eq(payrollPeriods.endDate, weekRange.endDate)))
      .limit(1),
  ]);

  const weekJobIds = weekJobsRows.map((row) => row.id);
  const [jobAssignmentRows, timeRows] = await Promise.all([
    weekJobIds.length
      ? db
          .select({
            jobId: jobAssignments.jobId,
            userId: jobAssignments.userId,
            firstName: users.firstName,
            lastName: users.lastName,
          })
          .from(jobAssignments)
          .innerJoin(users, eq(jobAssignments.userId, users.id))
          .where(inArray(jobAssignments.jobId, weekJobIds))
      : Promise.resolve([] as Array<{ jobId: string; userId: string; firstName: string; lastName: string }>),
    weekJobIds.length
      ? db
          .select({
            jobId: timeEntries.jobId,
            userId: timeEntries.userId,
            minutesWorked: timeEntries.minutesWorked,
          })
          .from(timeEntries)
          .where(inArray(timeEntries.jobId, weekJobIds))
      : Promise.resolve([] as Array<{ jobId: string; userId: string; minutesWorked: number | null }>),
  ]);

  const assignmentsByJob = new Map<string, Array<(typeof jobAssignmentRows)[number]>>();
  jobAssignmentRows.forEach((row) => {
    assignmentsByJob.set(row.jobId, [...(assignmentsByJob.get(row.jobId) ?? []), row]);
  });

  const minutesByJob = new Map<string, number>();
  const minutesByUser = new Map<string, number>();
  timeRows.forEach((row) => {
    minutesByJob.set(row.jobId, (minutesByJob.get(row.jobId) ?? 0) + (row.minutesWorked ?? 0));
    minutesByUser.set(row.userId, (minutesByUser.get(row.userId) ?? 0) + (row.minutesWorked ?? 0));
  });

  const weeklyRevenue = weekPaidInvoices.reduce((sum, row) => sum + (row.amountPaidCents ?? 0), 0);
  const previousWeeklyRevenue = prevWeekPaidInvoices.reduce((sum, row) => sum + (row.amountPaidCents ?? 0), 0);
  const revenueTrend = previousWeeklyRevenue > 0 ? (weeklyRevenue - previousWeeklyRevenue) / previousWeeklyRevenue : null;
  const weekDays = Array.from({ length: 7 }, (_, index) => addDaysIso(weekRange.startDate, index));
  const revenueSparkline = weekDays.map((day) =>
    weekPaidInvoices.filter((row) => row.paidAt && new Date(row.paidAt).toISOString().slice(0, 10) === day).reduce((sum, row) => sum + (row.amountPaidCents ?? 0), 0),
  );

  const openQuotesCount = openQuotesRows.length;
  const leadsCount = leadsRows.length;
  const quotesSentCount = quotesSentRows.length;
  const quotesAcceptedCount = quotesAcceptedRows.length;
  const conversionRate = quotesSentCount > 0 ? quotesAcceptedCount / quotesSentCount : 0;
  const recurringConversionsCount = recurringRows.length;
  const completedJobsCount = weekJobsRows.filter((job) => job.status === "completed").length;
  const overdueInvoiceTotal = overdueInvoiceRows.reduce((sum, row) => sum + Math.max((row.totalCents ?? 0) - (row.amountPaidCents ?? 0), 0), 0);
  const overdueInvoiceCount = overdueInvoiceRows.length;
  const todayJobsRows = weekJobsRows.filter((job) => job.scheduledDate === todayIso);
  const monthUnassignedCount = monthJobsRows.filter((job) => job.status !== "cancelled" && job.status !== "no_show" && !(assignmentsByJob.get(job.id)?.length ?? 0)).length;
  const jobsWithoutHoursCount = weekJobsRows.filter((job) => job.status === "completed" && !(minutesByJob.get(job.id) ?? 0)).length;
  const jobsAwaitingInvoicingCount = weekJobsRows.filter((job) => job.status === "completed" && !overdueInvoiceRows.some((invoice) => invoice.customerId === job.customerId)).length;
  const missedTimeEntriesCount = todayJobsRows.filter((job) => !(minutesByJob.get(job.id) ?? 0)).length;

  const customerNoShowById = new Map<string, number>();
  const customerRescheduleById = new Map<string, number>();
  monthJobsRows.forEach((job) => {
    if (job.status === "no_show") customerNoShowById.set(job.customerId, (customerNoShowById.get(job.customerId) ?? 0) + 1);
    if (job.status === "scheduled" && job.updatedAt.getTime() - job.createdAt.getTime() > 60_000) {
      customerRescheduleById.set(job.customerId, (customerRescheduleById.get(job.customerId) ?? 0) + 1);
    }
  });

  const overdueByCustomer = new Map<string, number>();
  overdueInvoiceRows.forEach((row) => {
    if (row.customerId) overdueByCustomer.set(row.customerId, (overdueByCustomer.get(row.customerId) ?? 0) + 1);
  });

  const declinedCardById = new Map<string, number>();
  customerRows.forEach((customer) => {
    const value = customer.paymentMethods?.join(" ").toLowerCase() ?? "";
    if (value.includes("declin") || value.includes("fail") || value.includes("invalid")) {
      declinedCardById.set(customer.id, 1);
    }
  });

  const customerRowsFlagged = customerRows
    .map((customer) => {
      const flags: string[] = [];
      if (!customer.paymentMethods?.length) flags.push("Missing payment method");
      if (declinedCardById.has(customer.id)) flags.push("Declined card");
      if (!customer.generalNotes?.trim()) flags.push("Incomplete notes");
      if ((customerNoShowById.get(customer.id) ?? 0) > 0) flags.push(`${customerNoShowById.get(customer.id)} no-show${customerNoShowById.get(customer.id) === 1 ? "" : "s"}`);
      if ((customerRescheduleById.get(customer.id) ?? 0) > 0) flags.push(`${customerRescheduleById.get(customer.id)} reschedule${customerRescheduleById.get(customer.id) === 1 ? "" : "s"}`);
      if ((overdueByCustomer.get(customer.id) ?? 0) > 0) flags.push(`${overdueByCustomer.get(customer.id)} overdue invoice${overdueByCustomer.get(customer.id) === 1 ? "" : "s"}`);
      return {
        id: customer.id,
        name: `${customer.firstName} ${customer.lastName}`,
        status: customer.status,
        recurrence: customer.recurrence,
        flags,
      };
    })
    .filter((row) => row.flags.length > 0)
    .slice(0, 8);

  const retryingCount = ghlSyncRows.filter((row) => row.status === "retrying").length;
  const failedCount = ghlSyncRows.filter((row) => row.status === "failed").length;
  const webhookIssueCount = webhookRows.filter((row) => row.error || !row.processedAt).length;
  const syncHealthCount = retryingCount + failedCount + webhookIssueCount;

  const payrollPeriod = payrollPeriodRows[0] ?? null;
  let payrollRows: PayrollRow[] = [];

  if (payrollPeriod) {
    const periodRows = await db
      .select({
        id: payrollLines.id,
        userId: payrollLines.userId,
        jobsCount: payrollLines.jobsCount,
        regularHours: payrollLines.regularHours,
        commissionCents: payrollLines.commissionCents,
        officeHours: payrollLines.officeHours,
        officePayCents: payrollLines.officePayCents,
        mileageMiles: payrollLines.mileageMiles,
        tipsPaycheckCents: payrollLines.tipsPaycheckCents,
        tipsCashCents: payrollLines.tipsCashCents,
        bonusCents: payrollLines.bonusCents,
        teamLeadBonusCents: payrollLines.teamLeadBonusCents,
        trainerBonusCents: payrollLines.trainerBonusCents,
        finalCents: payrollLines.finalCents,
        firstName: users.firstName,
        lastName: users.lastName,
        title: users.title,
        payType: users.payType,
      })
      .from(payrollLines)
      .innerJoin(users, eq(payrollLines.userId, users.id))
      .where(eq(payrollLines.payrollPeriodId, payrollPeriod.id))
      .orderBy(users.firstName);

    payrollRows = periodRows.map((row) => ({
      id: row.id,
      userId: row.userId,
      name: `${row.firstName} ${row.lastName}`,
      title: row.title,
      payType: row.payType,
      jobsCount: Number(row.jobsCount ?? 0),
      regularHours: Number(row.regularHours ?? 0),
      officeHours: Number(row.officeHours ?? 0),
      commissionCents: Number(row.commissionCents ?? 0),
      officePayCents: Number(row.officePayCents ?? 0),
      mileageMiles: Number(row.mileageMiles ?? 0),
      tipsCents: Number(row.tipsPaycheckCents ?? 0) + Number(row.tipsCashCents ?? 0),
      bonusCents: Number(row.bonusCents ?? 0) + Number(row.teamLeadBonusCents ?? 0) + Number(row.trainerBonusCents ?? 0),
      finalCents: Number(row.finalCents ?? 0),
      source: "period",
    }));
  } else {
    payrollRows = activeEmployees.map((employee) => {
      const assignedJobs = weekJobsRows.filter((job) => (assignmentsByJob.get(job.id) ?? []).some((assignment) => assignment.userId === employee.id));
      const completedAssignedJobs = assignedJobs.filter((job) => job.status === "completed");
      const rate = Number(employee.hourlyRateCents ?? 0);
      const officeHours = (minutesByUser.get(employee.id) ?? 0) / 60;
      const jobTicketHours = completedAssignedJobs.reduce((sum, job) => sum + Number(job.estimatedDurationMinutes ?? 0) / 60, 0);
      const hours = employee.payType === "office_hourly" ? officeHours : jobTicketHours;
      const finalCents = Math.round(hours * rate);

      return {
        id: employee.id,
        userId: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        title: employee.title,
        payType: employee.payType,
        jobsCount: completedAssignedJobs.length,
        regularHours: Number(jobTicketHours.toFixed(2)),
        officeHours: Number(officeHours.toFixed(2)),
        commissionCents: employee.payType === "office_hourly" ? 0 : finalCents,
        officePayCents: employee.payType === "office_hourly" ? finalCents : 0,
        mileageMiles: 0,
        tipsCents: 0,
        bonusCents: 0,
        finalCents,
        source: "derived",
      };
    });
  }

  const payrollTotals = payrollRows.reduce(
    (acc, row) => {
      acc.jobs += row.jobsCount;
      acc.hours += row.regularHours + row.officeHours;
      acc.mileage += row.mileageMiles;
      acc.tips += row.tipsCents;
      acc.bonus += row.bonusCents;
      acc.pay += row.finalCents;
      return acc;
    },
    { jobs: 0, hours: 0, mileage: 0, tips: 0, bonus: 0, pay: 0 },
  );

  const summaryCards: SummaryCard[] = [
    {
      label: "Weekly revenue",
      value: compactMoney(weeklyRevenue),
      note: `${weekRange.startDate} to ${weekRange.endDate}`,
      trend: revenueTrend === null ? "No previous week data" : `${revenueTrend >= 0 ? "+" : ""}${Math.round(revenueTrend * 100)}% vs last week`,
      tone: revenueTrend !== null && revenueTrend >= 0 ? "good" : "neutral",
      sparkline: revenueSparkline,
    },
    {
      label: "Open quotes",
      value: String(openQuotesCount),
      note: "Draft, sent, and viewed proposals",
      trend: `${quotesAcceptedCount} accepted this month`,
      tone: openQuotesCount ? "warn" : "good",
    },
    {
      label: "Completed jobs",
      value: String(completedJobsCount),
      note: "Finished this week",
      trend: `${todayJobsRows.length} scheduled today`,
      tone: completedJobsCount ? "good" : "neutral",
    },
    {
      label: "Overdue invoices",
      value: String(overdueInvoiceCount),
      note: `Balance due ${money(overdueInvoiceTotal)}`,
      trend: overdueInvoiceCount ? "Needs follow-up" : "No overdue invoices",
      tone: overdueInvoiceCount ? "warn" : "good",
    },
    {
      label: "Quote conversion",
      value: percent(conversionRate),
      note: `${quotesSentCount} sent / ${quotesAcceptedCount} accepted this month`,
      trend: `${recurringConversionsCount} recurring conversions`,
      tone: conversionRate >= 0.5 ? "good" : conversionRate > 0 ? "warn" : "neutral",
    },
    {
      label: "Sync health",
      value: String(syncHealthCount),
      note: `${retryingCount} retrying, ${failedCount} failed, ${webhookIssueCount} webhook issues`,
      trend: "GHL, Square, webhooks",
      tone: syncHealthCount ? "warn" : "good",
    },
  ];

  const missingPaymentCount = customerRows.filter((row) => !row.paymentMethods?.length).length;
  const declinedCardCount = declinedCardById.size;
  const incompleteNotesCount = customerRows.filter((row) => !row.generalNotes?.trim()).length;
  const rescheduleCount = customerRows.filter((row) => (customerRescheduleById.get(row.id) ?? 0) > 0).length;
  const noShowCount = customerRows.filter((row) => (customerNoShowById.get(row.id) ?? 0) > 0).length;

  const navigationButtons = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/quotes", label: "Quotes" },
    { href: "/jobs", label: "Jobs" },
    { href: "/payroll", label: "Payroll" },
    { href: "/sync-issues", label: "Sync issues" },
  ];

  return (
    <ReportsMotion>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="eyebrow">Operations desk</p>
            <h1 className="page-title mt-2">Reports</h1>
            <p className="page-subtitle">A live weekly pulse for sales, operations, labor, customer health, and integration health.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {navigationButtons.map((button) => (
              <Link key={button.href} href={button.href} className="co-button-secondary">
                {button.label}
              </Link>
            ))}
          </div>
        </header>

        <section data-report-reveal className="co-card overflow-hidden">
          <div className="grid gap-0 xl:grid-cols-[1.25fr_0.75fr]">
            <div className="p-6 sm:p-8 xl:p-10">
              <div className="flex flex-wrap items-center gap-3">
                <Pill tone="ink">Live reports</Pill>
                <Pill tone="success">Weekly + monthly</Pill>
                <span className="text-xs text-[var(--co-muted)]">Built from quotes, jobs, invoices, payroll, customers, and sync logs.</span>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {summaryCards.map((card) => (
                  <StatCard key={card.label} {...card} />
                ))}
              </div>
            </div>

            <div className="border-t border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-6 sm:p-8 xl:border-t-0 xl:border-l xl:p-10">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="eyebrow">This week</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">What needs attention first</h2>
                </div>
                <Pill tone={syncHealthCount ? "warn" : "success"}>{syncHealthCount ? "Needs review" : "Healthy"}</Pill>
              </div>

              <div className="mt-5 space-y-3">
                <div className="rounded-[20px] border border-[var(--co-line)] bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--co-muted)]">Revenue</p>
                  <p className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{compactMoney(weeklyRevenue)}</p>
                  <p className="mt-1 text-sm text-[var(--co-muted)]">Paid this week</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { label: "Open quotes", value: openQuotesCount },
                    { label: "Overdue invoices", value: overdueInvoiceCount },
                    { label: "Completed jobs", value: completedJobsCount },
                    { label: "Sync issues", value: syncHealthCount },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[20px] border border-[var(--co-line)] bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--co-muted)]">{item.label}</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link href="#operations" className="co-button-secondary">
                    Review operations
                  </Link>
                  <Link href="#integrations" className="co-button-primary">
                    Review syncs
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <nav className="flex flex-wrap gap-2">
          {[
            ["#executive", "Executive summary"],
            ["#sales", "Sales funnel"],
            ["#operations", "Operations board"],
            ["#labor", "Labor and payroll"],
            ["#customers", "Customer health"],
            ["#integrations", "Integration health"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="co-card px-4 py-2 text-sm font-semibold text-[var(--co-ink)] hover:border-[var(--co-evergreen)]">
              {label}
            </a>
          ))}
        </nav>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <main className="space-y-6">
            <SectionPanel
              id="executive"
              eyebrow="Executive summary"
              title="A one-screen weekly pulse for the owner or GM"
              description="Quick decision-making before the day starts."
              action={<Pill tone="ink">{formatDay(weekRange.startDate, company.timezone)} - {formatDay(weekRange.endDate, company.timezone)}</Pill>}
            >
              <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
                <div className="rounded-[22px] border border-[var(--co-line-soft)] bg-[linear-gradient(180deg,#ffffff,#f8faf6)] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--co-muted)]">Weekly revenue</p>
                      <p className="mt-2 text-4xl font-semibold tracking-[-0.05em]">{compactMoney(weeklyRevenue)}</p>
                      <p className="mt-2 text-sm text-[var(--co-muted)]">
                        {revenueTrend === null ? "No previous week data" : `${revenueTrend >= 0 ? "+" : ""}${Math.round(revenueTrend * 100)}% vs last week`}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-[var(--co-line)] bg-white px-3 py-2 text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Today</p>
                      <p className="mt-1 text-lg font-semibold text-[var(--co-evergreen)]">{compactMoney(revenueSparkline[revenueSparkline.length - 1] ?? 0)}</p>
                    </div>
                  </div>

                  <div className="mt-5 overflow-hidden rounded-[18px] border border-[var(--co-line)] bg-white p-4">
                    <div className="flex items-center justify-between text-xs text-[var(--co-muted)]">
                      <span>Mon</span>
                      <span>Week</span>
                      <span>Sun</span>
                    </div>
                    <div className="mt-3 grid grid-cols-7 gap-2">
                      {revenueSparkline.map((value, index) => {
                        const max = Math.max(...revenueSparkline, 1);
                        const height = Math.max(12, (value / max) * 100);
                        return (
                          <div key={weekDays[index]} className="flex flex-col items-center gap-2">
                            <div className="flex h-28 w-full items-end rounded-[12px] bg-[var(--co-surface-muted)]/50 px-1">
                              <div className="w-full rounded-[10px] bg-[var(--co-evergreen)]/85" style={{ height: `${height}%` }} />
                            </div>
                            <span className="text-[11px] text-[var(--co-muted)]">{formatDay(weekDays[index], company.timezone).slice(0, 3)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    { label: "Open quotes", value: String(openQuotesCount), note: "Current quotes still in play" },
                    { label: "Completed jobs", value: String(completedJobsCount), note: "Finished this week" },
                    { label: "Overdue invoices", value: String(overdueInvoiceCount), note: `${money(overdueInvoiceTotal)} due` },
                    { label: "Sync health", value: String(syncHealthCount), note: `${retryingCount} retrying / ${failedCount} failed` },
                    { label: "Active clients", value: String(customerRows.filter((row) => row.status === "client").length), note: "Recurring clients on file" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[20px] border border-[var(--co-line-soft)] bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--co-muted)]">{item.label}</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{item.value}</p>
                      <p className="mt-1 text-sm text-[var(--co-muted)]">{item.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </SectionPanel>

            <SectionPanel
              id="sales"
              eyebrow="Sales funnel"
              title="How leads turn into booked jobs and recurring clients"
              description="Weekly + monthly. Helps the client see if marketing and quoting are working."
              action={<Pill tone={conversionRate >= 0.5 ? "success" : "warn"}>{percent(conversionRate)} conversion</Pill>}
            >
              <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="space-y-3">
                  {[
                    { label: "Leads", value: leadsCount, helper: "New leads this month", total: Math.max(leadsCount, 1) },
                    { label: "Quotes sent", value: quotesSentCount, helper: "Proposals sent this month", total: Math.max(quotesSentCount, leadsCount, 1) },
                    { label: "Quotes accepted", value: quotesAcceptedCount, helper: "Accepted proposals this month", total: Math.max(quotesSentCount, 1) },
                    { label: "Recurring conversions", value: recurringConversionsCount, helper: "New recurring clients this month", total: Math.max(quotesAcceptedCount, 1) },
                  ].map((stage) => (
                    <div key={stage.label} className="rounded-[18px] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-[var(--co-ink)]">{stage.label}</p>
                          <p className="text-xs text-[var(--co-muted)]">{stage.helper}</p>
                        </div>
                        <p className="text-lg font-semibold tracking-[-0.04em]">{stage.value}</p>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                        <div className="h-full rounded-full bg-[var(--co-evergreen)]" style={{ width: `${Math.max(8, Math.min(100, (stage.value / stage.total) * 100))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-[22px] border border-[var(--co-line-soft)] bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--co-muted)]">Recent quotes</p>
                      <h3 className="mt-1 text-lg font-semibold tracking-[-0.03em]">Open and active proposals</h3>
                    </div>
                    <Link href="/quotes" className="co-button-secondary">
                      View quotes
                    </Link>
                  </div>
                  <div className="mt-4 space-y-3">
                    {openQuotesRows.slice(0, 6).map((quote) => (
                      <div key={quote.id} className="flex items-center justify-between gap-4 rounded-[18px] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 px-4 py-3">
                        <div>
                          <p className="font-semibold text-[var(--co-ink)]">
                            {quote.customerFirstName} {quote.customerLastName}
                          </p>
                          <p className="text-xs text-[var(--co-muted)]">
                            {quote.status} - {formatDate(quote.createdAt)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-[var(--co-evergreen)]">{money(quote.totalCents)}</p>
                          <p className="text-xs text-[var(--co-muted)]">{quote.sentAt ? "sent" : "draft"}</p>
                        </div>
                      </div>
                    ))}
                    {openQuotesRows.length === 0 ? <p className="text-sm text-[var(--co-muted)]">No open quotes right now.</p> : null}
                  </div>
                </div>
              </div>
            </SectionPanel>

            <SectionPanel
              id="operations"
              eyebrow="Operations board"
              title="Whether the schedule is actually getting executed"
              description="Daily. Useful for dispatch, office staff, and the CEO."
              action={<Pill tone={monthUnassignedCount ? "warn" : "success"}>{monthUnassignedCount} unassigned this month</Pill>}
            >
              <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[22px] border border-[var(--co-line-soft)] bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--co-muted)]">Today&apos;s schedule</p>
                      <h3 className="mt-1 text-lg font-semibold tracking-[-0.03em]">{formatDay(todayIso, company.timezone)}</h3>
                    </div>
                    <Pill tone="ink">{todayJobsRows.length} jobs</Pill>
                  </div>

                  <div className="mt-4">
                    <TableShell columns={["Time", "Customer", "Address / ZIP", "Assigned", "Status"]} minWidth={860}>
                      {todayJobsRows.map((job) => {
                        const assignments = assignmentsByJob.get(job.id) ?? [];
                        return (
                          <tr key={job.id} className="hover:bg-[var(--co-surface-muted)]/35">
                            <td className="px-4 py-3 pl-0 text-sm font-semibold text-[var(--co-ink)]">{formatClock(job.scheduledStartTime)}</td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-[var(--co-ink)]">
                                {job.customerFirstName} {job.customerLastName}
                              </div>
                              <div className="text-xs text-[var(--co-muted)]">{job.type.replaceAll("_", " ")}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-[var(--co-ink)]">
                              {job.addressLine1 || "Address not set"}
                              <div className="text-xs text-[var(--co-muted)]">
                                {job.city ? `${job.city}, ` : ""}
                                {job.zip || "ZIP missing"}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-[var(--co-ink)]">
                              {assignments.length ? assignments.map((entry) => entry.firstName).join(", ") : "Unassigned"}
                            </td>
                            <td className="px-4 py-3 pr-0">
                              <Pill tone={job.status === "completed" ? "success" : job.status === "in_progress" ? "warn" : "neutral"}>{job.status}</Pill>
                            </td>
                          </tr>
                        );
                      })}
                      {todayJobsRows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--co-muted)]">
                            No jobs scheduled today.
                          </td>
                        </tr>
                      ) : null}
                    </TableShell>
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    { label: "Unassigned jobs", value: monthUnassignedCount, note: "Current month only" },
                    { label: "Jobs without hours", value: jobsWithoutHoursCount, note: "Completed jobs missing time" },
                    { label: "Jobs awaiting invoicing", value: jobsAwaitingInvoicingCount, note: "Completed jobs without invoice" },
                    { label: "Missed time entries", value: missedTimeEntriesCount, note: "Today's jobs without a clock-in" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[20px] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/30 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-[var(--co-ink)]">{item.label}</p>
                          <p className="mt-1 text-xs text-[var(--co-muted)]">{item.note}</p>
                        </div>
                        <p className="text-3xl font-semibold tracking-[-0.05em] text-[var(--co-evergreen)]">{item.value}</p>
                      </div>
                    </div>
                  ))}

                  <div className="rounded-[22px] border border-[var(--co-line-soft)] bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--co-muted)]">Attention required</p>
                    <div className="mt-4 space-y-2">
                      {[
                        `Unassigned: ${monthUnassignedCount}`,
                        `Missing hours: ${jobsWithoutHoursCount}`,
                        `Awaiting invoicing: ${jobsAwaitingInvoicingCount}`,
                        `Missed time entries: ${missedTimeEntriesCount}`,
                      ].map((text) => (
                        <div key={text} className="flex items-center justify-between rounded-[16px] bg-[var(--co-surface-muted)]/35 px-4 py-3 text-sm">
                          <span className="text-[var(--co-ink)]">{text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </SectionPanel>

            <SectionPanel
              id="labor"
              eyebrow="Labor and payroll"
              title="Connects job time, travel, mileage, commissions, and bonuses"
              description="Weekly + pay period. Makes Friday payroll less painful and easier to audit."
              action={<Pill tone={payrollPeriod ? "success" : "warn"}>{payrollPeriod ? "Pay period ready" : "Live estimate"}</Pill>}
            >
              <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { label: "Hours per employee", value: payrollTotals.hours.toFixed(1), note: "Tracked across the pay period" },
                    { label: "Average pay rate", value: payrollTotals.hours > 0 ? money(Math.round((payrollTotals.pay / payrollTotals.hours) * 100)) : money(0), note: "Blended across the team" },
                    { label: "Mileage", value: `${payrollTotals.mileage.toFixed(1)} mi`, note: "Pay period mileage" },
                    { label: "Tips", value: money(payrollTotals.tips), note: "Paycheck + cash tips" },
                    { label: "Team lead / trainer bonus", value: money(payrollTotals.bonus), note: "Combined bonus bucket" },
                    { label: "Total payout", value: money(payrollTotals.pay), note: payrollPeriod ? "Pulled from payroll period" : "Estimated from live week data" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[18px] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/30 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--co-muted)]">{item.label}</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-[var(--co-ink)]">{item.value}</p>
                      <p className="mt-1 text-xs text-[var(--co-muted)]">{item.note}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-[22px] border border-[var(--co-line-soft)] bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--co-muted)]">Payroll detail</p>
                      <h3 className="mt-1 text-lg font-semibold tracking-[-0.03em]">
                        {weekRange.startDate} - {weekRange.endDate}
                      </h3>
                    </div>
                    <Link href="/payroll" className="co-button-secondary">
                      Open payroll
                    </Link>
                  </div>
                  <div className="mt-4">
                    <TableShell columns={["Employee", "Jobs", "Hours", "Mileage", "Tips", "Bonus", "Total"]} minWidth={760}>
                      {payrollRows.slice(0, 8).map((row) => {
                        const hours = row.regularHours + row.officeHours;
                        return (
                          <tr key={row.id} className="hover:bg-[var(--co-surface-muted)]/35">
                            <td className="px-4 py-3 pl-0">
                              <div className="font-medium text-[var(--co-ink)]">{row.name}</div>
                              <div className="text-xs text-[var(--co-muted)]">{row.title || row.payType || "Employee"}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-[var(--co-ink)]">{row.jobsCount}</td>
                            <td className="px-4 py-3 text-sm text-[var(--co-ink)]">{hours.toFixed(1)}</td>
                            <td className="px-4 py-3 text-sm text-[var(--co-ink)]">{row.mileageMiles.toFixed(1)} mi</td>
                            <td className="px-4 py-3 text-sm text-[var(--co-ink)]">{money(row.tipsCents)}</td>
                            <td className="px-4 py-3 text-sm text-[var(--co-ink)]">{money(row.bonusCents)}</td>
                            <td className="px-4 py-3 pr-0 text-sm font-semibold text-[var(--co-evergreen)]">{money(row.finalCents)}</td>
                          </tr>
                        );
                      })}
                      {payrollRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--co-muted)]">
                            No payroll data available yet.
                          </td>
                        </tr>
                      ) : null}
                    </TableShell>
                  </div>
                </div>
              </div>
            </SectionPanel>
          </main>

          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <SectionPanel
              id="customers"
              eyebrow="Customer health"
              title="Accounts that need attention before they become churn"
              description="Weekly. Great for retention and service quality."
              action={<Pill tone={customerRowsFlagged.length ? "warn" : "success"}>{customerRowsFlagged.length} flags</Pill>}
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {[
                  { label: "Missing payment methods", value: missingPaymentCount },
                  { label: "Declined cards", value: declinedCardCount },
                  { label: "Incomplete notes", value: incompleteNotesCount },
                  { label: "No-show history", value: noShowCount },
                  { label: "Recent reschedules", value: rescheduleCount },
                  { label: "Past due invoices", value: overdueByCustomer.size },
                ].map((item) => (
                  <div key={item.label} className="rounded-[18px] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/30 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--co-muted)]">{item.label}</p>
                    <p className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-[var(--co-ink)]">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                {customerRowsFlagged.map((customer) => (
                  <div key={customer.id} className="rounded-[18px] border border-[var(--co-line-soft)] bg-white px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--co-ink)]">{customer.name}</p>
                        <p className="mt-1 text-xs text-[var(--co-muted)]">
                          {customer.status}
                          {customer.recurrence ? ` - ${customer.recurrence}` : ""}
                        </p>
                      </div>
                      <Pill tone="warn">{customer.flags.length} flags</Pill>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {customer.flags.slice(0, 3).map((flag) => (
                        <span key={flag} className="rounded-full border border-[var(--co-line)] bg-[var(--co-surface-muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--co-muted)]">
                          {flag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {customerRowsFlagged.length === 0 ? <p className="text-sm text-[var(--co-muted)]">No flagged customers right now.</p> : null}
              </div>
            </SectionPanel>

            <SectionPanel
              id="integrations"
              eyebrow="Integration health"
              title="Keeps GHL, Square, and future tools visible and accountable"
              description="Real time + weekly. Stops silent sync problems from turning into business problems."
              action={<Pill tone={syncHealthCount ? "warn" : "success"}>{syncHealthCount} issues</Pill>}
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {[
                  { label: "Failed webhooks", value: webhookIssueCount },
                  { label: "Retry log", value: retryingCount + failedCount },
                  { label: "Workflow enrollment status", value: ghlSyncRows.filter((row) => row.status === "ok").length },
                  { label: "API errors", value: retryingCount + failedCount + webhookIssueCount },
                ].map((item) => (
                  <div key={item.label} className="rounded-[18px] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/30 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--co-muted)]">{item.label}</p>
                    <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[var(--co-ink)]">{String(item.value)}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-[20px] border border-[var(--co-line-soft)] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--co-muted)]">GHL workflow status</p>
                <div className="mt-3 space-y-3">
                  {[
                    "quote.sent",
                    "quote.accepted",
                    "first_clean.scheduled",
                    "first_clean.completed",
                    "customer.became_client",
                    "customer.lost",
                  ].map((eventType) => {
                    const count = ghlSyncRows.filter((row) => row.eventType === eventType && row.status === "ok").length;
                    return (
                      <div key={eventType} className="grid grid-cols-[1fr_auto] items-center gap-3">
                        <div>
                          <p className="text-sm font-medium text-[var(--co-ink)]">{eventType}</p>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--co-surface-muted)]">
                            <div className="h-full rounded-full bg-[var(--co-evergreen)]" style={{ width: `${Math.min(100, count * 18 + 10)}%` }} />
                          </div>
                        </div>
                        <p className="text-sm font-semibold text-[var(--co-evergreen)]">{count}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 rounded-[20px] border border-[var(--co-line-soft)] bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--co-muted)]">Recent sync issues</p>
                    <p className="mt-1 text-sm text-[var(--co-muted)]">GHL failures and retries</p>
                  </div>
                  <Link href="/sync-issues" className="co-button-secondary">
                    Open queue
                  </Link>
                </div>
                <div className="mt-4 space-y-2">
                  {ghlSyncRows
                    .filter((row) => row.status !== "ok")
                    .slice(0, 4)
                    .map((row) => (
                      <div key={row.id} className="rounded-[16px] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-[var(--co-ink)]">{row.eventType}</p>
                            <p className="text-xs text-[var(--co-muted)]">
                              {row.status} - {row.attempts} attempts
                            </p>
                          </div>
                          <Pill tone={row.status === "failed" ? "warn" : "warn"}>{row.status}</Pill>
                        </div>
                        <p className="mt-2 text-xs text-[var(--co-muted)]">
                          {typeof row.response === "string" ? row.response : "Retry scheduled"}
                        </p>
                      </div>
                    ))}
                  {ghlSyncRows.filter((row) => row.status !== "ok").length === 0 ? <p className="text-sm text-[var(--co-muted)]">No retrying syncs right now.</p> : null}
                </div>
              </div>

              <div className="mt-4 rounded-[20px] border border-[var(--co-line-soft)] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--co-muted)]">Raw webhook inbox</p>
                <div className="mt-3 space-y-2">
                  {webhookRows.map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-3 rounded-[16px] bg-[var(--co-surface-muted)]/35 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--co-ink)]">{row.source.toUpperCase()}</p>
                        <p className="text-xs text-[var(--co-muted)]">{formatDateTime(row.createdAt)}</p>
                      </div>
                      <Pill tone={row.error ? "warn" : row.processedAt ? "success" : "warn"}>{row.error ? "error" : row.processedAt ? "processed" : "pending"}</Pill>
                    </div>
                  ))}
                  {webhookRows.length === 0 ? <p className="text-sm text-[var(--co-muted)]">No webhook issues are waiting right now.</p> : null}
                </div>
              </div>
            </SectionPanel>
          </aside>
        </div>
      </div>
    </ReportsMotion>
  );
}
