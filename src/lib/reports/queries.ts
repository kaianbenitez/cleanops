import {
  and,
  asc,
  desc,
  eq,
  gte,
  lt,
  or,
  sql,
  type AnyColumn,
} from "drizzle-orm";
import { db } from "@/db";
import {
  customers,
  invoices,
  jobs,
  payrollLines,
  payrollPeriods,
  quotes,
  recurringSeries,
  reportExports,
  users,
} from "@/db/schema";
import { addDaysIso } from "@/lib/dashboard/range";
import { overdueSqlCondition } from "@/lib/invoices/overdue";

export type ReportsRange = {
  fromIso: string;
  toIso: string;
  timeZone: string;
};

export type ReportKey =
  "payroll" | "tips" | "accounts-receivable" | "jobs" | "sales";

const numberValue = (value: unknown) => Number(value ?? 0);

function timestampRange(column: AnyColumn, range: ReportsRange) {
  const toExclusiveIso = addDaysIso(range.toIso, 1);
  return and(
    gte(
      column,
      sql`(${range.fromIso}::date::timestamp AT TIME ZONE ${range.timeZone})`,
    ),
    lt(
      column,
      sql`(${toExclusiveIso}::date::timestamp AT TIME ZONE ${range.timeZone})`,
    ),
  );
}

export async function getPayrollReport(companyId: string, range: ReportsRange) {
  const rows = await db
    .select({
      employeeName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
      periodStart: payrollPeriods.startDate,
      periodEnd: payrollPeriods.endDate,
      regularHours: payrollLines.regularHours,
      officeHours: payrollLines.officeHours,
      tipsPaycheckCents: payrollLines.tipsPaycheckCents,
      tipsCashCents: payrollLines.tipsCashCents,
      grossPayCents: payrollLines.finalCents,
    })
    .from(payrollLines)
    .innerJoin(
      payrollPeriods,
      eq(payrollLines.payrollPeriodId, payrollPeriods.id),
    )
    .innerJoin(users, eq(payrollLines.userId, users.id))
    .where(
      and(
        eq(payrollPeriods.companyId, companyId),
        eq(users.companyId, companyId),
        lt(payrollPeriods.startDate, addDaysIso(range.toIso, 1)),
        gte(payrollPeriods.endDate, range.fromIso),
      ),
    )
    .orderBy(
      desc(payrollPeriods.endDate),
      asc(users.lastName),
      asc(users.firstName),
    );
  return rows.map((row) => ({
    ...row,
    regularHours: numberValue(row.regularHours),
    officeHours: numberValue(row.officeHours),
  }));
}

export async function getTipsReport(companyId: string, range: ReportsRange) {
  const rows = await db
    .select({
      employeeName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
      periodStart: payrollPeriods.startDate,
      periodEnd: payrollPeriods.endDate,
      paycheckTipsCents: sql<number>`coalesce(sum(${payrollLines.tipsPaycheckCents}), 0)`,
      cashTipsCents: sql<number>`coalesce(sum(${payrollLines.tipsCashCents}), 0)`,
    })
    .from(payrollLines)
    .innerJoin(
      payrollPeriods,
      eq(payrollLines.payrollPeriodId, payrollPeriods.id),
    )
    .innerJoin(users, eq(payrollLines.userId, users.id))
    .where(
      and(
        eq(payrollPeriods.companyId, companyId),
        eq(users.companyId, companyId),
        lt(payrollPeriods.startDate, addDaysIso(range.toIso, 1)),
        gte(payrollPeriods.endDate, range.fromIso),
      ),
    )
    .groupBy(
      users.firstName,
      users.lastName,
      payrollPeriods.startDate,
      payrollPeriods.endDate,
    )
    .orderBy(
      desc(payrollPeriods.endDate),
      asc(users.lastName),
      asc(users.firstName),
    );
  return rows.map((row) => ({
    ...row,
    paycheckTipsCents: numberValue(row.paycheckTipsCents),
    cashTipsCents: numberValue(row.cashTipsCents),
  }));
}

export async function getAccountsReceivableReport(
  companyId: string,
  range: ReportsRange,
  area?: string,
) {
  const rows = await db
    .select({
      customerName: sql<string>`coalesce(nullif(${customers.companyName}, ''), concat(${customers.firstName}, ' ', ${customers.lastName}))`,
      area: customers.city,
      invoiceCreatedAt: invoices.createdAt,
      totalCents: invoices.totalCents,
      amountPaidCents: invoices.amountPaidCents,
      outstandingCents: sql<number>`greatest(${invoices.totalCents} - ${invoices.amountPaidCents}, 0)`,
      overdue: sql<boolean>`case when ${overdueSqlCondition()} then true else false end`,
      agingBucket: sql<string>`case when now() - ${invoices.createdAt} < interval '31 days' then '0-30 days' when now() - ${invoices.createdAt} < interval '61 days' then '31-60 days' else '61-90+ days' end`,
    })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(
      and(
        eq(invoices.companyId, companyId),
        eq(customers.companyId, companyId),
        eq(invoices.status, "sent"),
        timestampRange(invoices.createdAt, range),
        area ? eq(customers.city, area) : undefined,
      ),
    )
    .orderBy(desc(invoices.createdAt));
  return rows.map((row) => ({
    ...row,
    outstandingCents: numberValue(row.outstandingCents),
  }));
}

export async function getAccountsReceivableSummary(
  companyId: string,
  range: ReportsRange,
  area?: string,
) {
  const [row] = await db
    .select({
      totalOutstandingCents: sql<number>`coalesce(sum(greatest(${invoices.totalCents} - ${invoices.amountPaidCents}, 0)), 0)`,
    })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(
      and(
        eq(invoices.companyId, companyId),
        eq(customers.companyId, companyId),
        eq(invoices.status, "sent"),
        timestampRange(invoices.createdAt, range),
        area ? eq(customers.city, area) : undefined,
      ),
    );
  return numberValue(row?.totalOutstandingCents);
}

export async function getJobsReport(
  companyId: string,
  range: ReportsRange,
  area?: string,
) {
  const toExclusiveIso = addDaysIso(range.toIso, 1);
  const selectedRangeCondition = or(
    and(eq(jobs.status, "completed"), timestampRange(jobs.completedAt, range)),
    and(
      sql`${jobs.status} <> 'completed'`,
      gte(jobs.scheduledDate, range.fromIso),
      lt(jobs.scheduledDate, toExclusiveIso),
    ),
  );
  const rows = await db
    .select({
      customerName: sql<string>`coalesce(nullif(${customers.companyName}, ''), concat(${customers.firstName}, ' ', ${customers.lastName}))`,
      area: customers.city,
      status: jobs.status,
      scheduledDate: jobs.scheduledDate,
      completedAt: jobs.completedAt,
      estimatedDurationMinutes: jobs.estimatedDurationMinutes,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(
      and(
        eq(jobs.companyId, companyId),
        eq(customers.companyId, companyId),
        selectedRangeCondition,
        area ? eq(customers.city, area) : undefined,
      ),
    )
    .orderBy(desc(jobs.scheduledDate));
  return rows;
}

export async function getJobsReportSummary(
  companyId: string,
  range: ReportsRange,
  area?: string,
) {
  const toExclusiveIso = addDaysIso(range.toIso, 1);
  const [row] = await db
    .select({
      completed: sql<number>`count(*) filter (where ${jobs.status} = 'completed')`,
      scheduled: sql<number>`count(*) filter (where ${jobs.status} = 'scheduled')`,
      cancelled: sql<number>`count(*) filter (where ${jobs.status} = 'cancelled')`,
      estimatedMinutes: sql<number>`coalesce(sum(${jobs.estimatedDurationMinutes}), 0)`,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(
      and(
        eq(jobs.companyId, companyId),
        eq(customers.companyId, companyId),
        or(
          and(
            eq(jobs.status, "completed"),
            timestampRange(jobs.completedAt, range),
          ),
          and(
            sql`${jobs.status} <> 'completed'`,
            gte(jobs.scheduledDate, range.fromIso),
            lt(jobs.scheduledDate, toExclusiveIso),
          ),
        ),
        area ? eq(customers.city, area) : undefined,
      ),
    );
  return {
    completed: numberValue(row?.completed),
    scheduled: numberValue(row?.scheduled),
    cancelled: numberValue(row?.cancelled),
    estimatedMinutes: numberValue(row?.estimatedMinutes),
  };
}

export async function getSalesReport(
  companyId: string,
  range: ReportsRange,
  area?: string,
) {
  const customerName = sql<string>`coalesce(nullif(${customers.companyName}, ''), concat(${customers.firstName}, ' ', ${customers.lastName}))`;
  const [
    newLeads,
    quotesSent,
    quotesAccepted,
    acquiredRecurring,
    lostRecurring,
  ] = await Promise.all([
    db
      .select({
        type: sql<"New lead">`'New lead'`,
        customerName,
        area: customers.city,
        eventDate: customers.createdAt,
      })
      .from(customers)
      .where(
        and(
          eq(customers.companyId, companyId),
          timestampRange(customers.createdAt, range),
          area ? eq(customers.city, area) : undefined,
        ),
      ),
    db
      .select({
        type: sql<"Quote sent">`'Quote sent'`,
        customerName,
        area: customers.city,
        eventDate: quotes.sentAt,
      })
      .from(quotes)
      .innerJoin(customers, eq(quotes.customerId, customers.id))
      .where(
        and(
          eq(quotes.companyId, companyId),
          eq(customers.companyId, companyId),
          timestampRange(quotes.sentAt, range),
          area ? eq(customers.city, area) : undefined,
        ),
      ),
    db
      .select({
        type: sql<"Quote accepted">`'Quote accepted'`,
        customerName,
        area: customers.city,
        eventDate: quotes.acceptedAt,
      })
      .from(quotes)
      .innerJoin(customers, eq(quotes.customerId, customers.id))
      .where(
        and(
          eq(quotes.companyId, companyId),
          eq(customers.companyId, companyId),
          timestampRange(quotes.acceptedAt, range),
          area ? eq(customers.city, area) : undefined,
        ),
      ),
    db
      .select({
        type: sql<"Acquired recurring">`'Acquired recurring'`,
        customerName,
        area: customers.city,
        eventDate: recurringSeries.startDate,
      })
      .from(recurringSeries)
      .innerJoin(customers, eq(recurringSeries.customerId, customers.id))
      .where(
        and(
          eq(recurringSeries.companyId, companyId),
          eq(customers.companyId, companyId),
          gte(recurringSeries.startDate, range.fromIso),
          lt(recurringSeries.startDate, addDaysIso(range.toIso, 1)),
          area ? eq(customers.city, area) : undefined,
        ),
      ),
    db
      .select({
        type: sql<"Lost recurring">`'Lost recurring'`,
        customerName,
        area: customers.city,
        eventDate: recurringSeries.endDate,
      })
      .from(recurringSeries)
      .innerJoin(customers, eq(recurringSeries.customerId, customers.id))
      .where(
        and(
          eq(recurringSeries.companyId, companyId),
          eq(customers.companyId, companyId),
          gte(recurringSeries.endDate, range.fromIso),
          lt(recurringSeries.endDate, addDaysIso(range.toIso, 1)),
          area ? eq(customers.city, area) : undefined,
        ),
      ),
  ]);
  return [
    ...newLeads,
    ...quotesSent,
    ...quotesAccepted,
    ...acquiredRecurring,
    ...lostRecurring,
  ].sort(
    (a, b) =>
      new Date(b.eventDate ?? 0).getTime() -
      new Date(a.eventDate ?? 0).getTime(),
  );
}

export async function getSalesReportSummary(
  companyId: string,
  range: ReportsRange,
  area?: string,
) {
  const [
    newLeads,
    quotesSent,
    quotesAccepted,
    acquiredRecurring,
    lostRecurring,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(
        and(
          eq(customers.companyId, companyId),
          timestampRange(customers.createdAt, range),
          area ? eq(customers.city, area) : undefined,
        ),
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(quotes)
      .innerJoin(customers, eq(quotes.customerId, customers.id))
      .where(
        and(
          eq(quotes.companyId, companyId),
          eq(customers.companyId, companyId),
          timestampRange(quotes.sentAt, range),
          area ? eq(customers.city, area) : undefined,
        ),
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(quotes)
      .innerJoin(customers, eq(quotes.customerId, customers.id))
      .where(
        and(
          eq(quotes.companyId, companyId),
          eq(customers.companyId, companyId),
          timestampRange(quotes.acceptedAt, range),
          area ? eq(customers.city, area) : undefined,
        ),
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(recurringSeries)
      .innerJoin(customers, eq(recurringSeries.customerId, customers.id))
      .where(
        and(
          eq(recurringSeries.companyId, companyId),
          eq(customers.companyId, companyId),
          gte(recurringSeries.startDate, range.fromIso),
          lt(recurringSeries.startDate, addDaysIso(range.toIso, 1)),
          area ? eq(customers.city, area) : undefined,
        ),
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(recurringSeries)
      .innerJoin(customers, eq(recurringSeries.customerId, customers.id))
      .where(
        and(
          eq(recurringSeries.companyId, companyId),
          eq(customers.companyId, companyId),
          gte(recurringSeries.endDate, range.fromIso),
          lt(recurringSeries.endDate, addDaysIso(range.toIso, 1)),
          area ? eq(customers.city, area) : undefined,
        ),
      ),
  ]);
  return {
    newLeads: numberValue(newLeads[0]?.count),
    quotesSent: numberValue(quotesSent[0]?.count),
    quotesAccepted: numberValue(quotesAccepted[0]?.count),
    acquiredRecurring: numberValue(acquiredRecurring[0]?.count),
    lostRecurring: numberValue(lostRecurring[0]?.count),
  };
}

export async function getLastExports(companyId: string) {
  const rows = await db
    .select({
      reportKey: reportExports.reportKey,
      exportedAt: sql<Date | string>`max(${reportExports.exportedAt})`,
    })
    .from(reportExports)
    .where(eq(reportExports.companyId, companyId))
    .groupBy(reportExports.reportKey);
  return Object.fromEntries(
    rows.map((row) => [row.reportKey, new Date(row.exportedAt)]),
  ) as Partial<Record<ReportKey, Date>>;
}
