import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNotNull,
  lt,
  or,
  sql,
  type AnyColumn,
} from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  customers,
  feedbackRequests,
  invoices,
  jobs,
  payrollLines,
  payrollPeriods,
  quotes,
  recurringSeries,
  reportExports,
  users,
  jobAssignments,
} from "@/db/schema";
import { addDaysIso } from "@/lib/dashboard/range";
import { overdueSqlCondition } from "@/lib/invoices/overdue";

export type ReportsRange = {
  fromIso: string;
  toIso: string;
  timeZone: string;
};

export type ReportKey =
  "payroll" | "tips" | "accounts-receivable" | "jobs" | "sales" | "quality" | "skips-bumps";

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

export async function getQualityReport(companyId: string, range: ReportsRange) {
  const toExclusiveIso = addDaysIso(range.toIso, 1);
  const rows = await db
    .select({
      jobId: jobs.id,
      serviceDate: jobs.scheduledDate,
      employeeId: users.id,
      employeeName: sql<string>`nullif(concat(${users.firstName}, ' ', ${users.lastName}), ' ')`,
      submittedAt: feedbackRequests.submittedAt,
      customerName: sql<string>`concat(${customers.firstName}, ' ', ${customers.lastName})`,
      rating: feedbackRequests.qualityRating,
      comment: feedbackRequests.qualityComment,
      tipCents: feedbackRequests.tipCents,
      feedbackStatus: feedbackRequests.status,
      feedbackExpiresAt: feedbackRequests.expiresAt,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .leftJoin(feedbackRequests, eq(feedbackRequests.jobId, jobs.id))
    .leftJoin(jobAssignments, eq(jobAssignments.jobId, jobs.id))
    .leftJoin(users, eq(jobAssignments.userId, users.id))
    .where(and(
      eq(jobs.companyId, companyId),
      eq(jobs.status, "completed"),
      gte(jobs.scheduledDate, range.fromIso),
      lt(jobs.scheduledDate, toExclusiveIso),
    ))
    .orderBy(desc(jobs.scheduledDate), asc(users.lastName), asc(users.firstName), asc(customers.lastName), asc(customers.firstName));

  const statusFor = (row: typeof rows[number]) => {
    if (row.feedbackStatus === "submitted") return "responded" as const;
    if (row.feedbackStatus === "sent" && row.feedbackExpiresAt && row.feedbackExpiresAt < new Date()) return "expired" as const;
    if (row.feedbackStatus === "sent") return "awaiting_response" as const;
    return "not_sent" as const;
  };
  const entries = rows.map((row) => ({ ...row, feedbackStatus: statusFor(row) }));
  const jobsById = new Map<string, (typeof entries)[number]>();
  for (const row of entries) jobsById.set(row.jobId, row);
  const summaryMap = new Map<string, { employeeName: string; completedJobs: number; responses: number; fiveStars: number; totalRating: number; jobIds: Set<string> }>();
  for (const row of entries) {
    if (!row.employeeId || !row.employeeName) continue;
    const current = summaryMap.get(row.employeeId) ?? { employeeName: row.employeeName, completedJobs: 0, responses: 0, fiveStars: 0, totalRating: 0, jobIds: new Set<string>() };
    if (!current.jobIds.has(row.jobId)) {
      current.jobIds.add(row.jobId);
      current.completedJobs += 1;
    }
    if (row.rating != null) {
      current.responses += 1;
      current.fiveStars += row.rating === 5 ? 1 : 0;
      current.totalRating += row.rating;
    }
    summaryMap.set(row.employeeId, current);
  }
  const summaries = [...summaryMap.values()].map((row) => ({
    employeeName: row.employeeName,
    completedJobs: row.completedJobs,
    responses: row.responses,
    fiveStars: row.fiveStars,
    totalRating: row.totalRating,
    averageRating: row.responses ? Math.round((row.totalRating / row.responses) * 100) / 100 : 0,
    responseRate: row.completedJobs ? Math.round((row.responses / row.completedJobs) * 100) : 0,
  }));
  return {
    entries,
    summaries,
    totalCompletedJobs: jobsById.size,
    totalResponses: [...jobsById.values()].filter((row) => row.rating != null).length,
    fiveStarTotal: [...jobsById.values()].filter((row) => row.rating === 5).length,
  };
}

export async function getEmployeeQualityReport(
  companyId: string,
  employeeId: string,
  range: ReportsRange,
) {
  const toExclusiveIso = addDaysIso(range.toIso, 1);
  const rows = await db
    .select({
      jobId: jobs.id,
      serviceDate: jobs.scheduledDate,
      customerName: sql<string>`concat(${customers.firstName}, ' ', ${customers.lastName})`,
      rating: feedbackRequests.qualityRating,
      comment: feedbackRequests.qualityComment,
      tags: feedbackRequests.qualityTags,
      feedbackStatus: feedbackRequests.status,
      feedbackExpiresAt: feedbackRequests.expiresAt,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .innerJoin(
      jobAssignments,
      and(eq(jobAssignments.jobId, jobs.id), eq(jobAssignments.userId, employeeId)),
    )
    .leftJoin(feedbackRequests, eq(feedbackRequests.jobId, jobs.id))
    .where(and(
      eq(jobs.companyId, companyId),
      eq(jobs.status, "completed"),
      gte(jobs.scheduledDate, range.fromIso),
      lt(jobs.scheduledDate, toExclusiveIso),
    ))
    .orderBy(desc(jobs.scheduledDate), asc(customers.lastName), asc(customers.firstName));

  const statusFor = (row: (typeof rows)[number]) => {
    if (row.feedbackStatus === "submitted") return "responded" as const;
    if (row.feedbackStatus === "sent" && row.feedbackExpiresAt && row.feedbackExpiresAt < new Date()) return "expired" as const;
    if (row.feedbackStatus === "sent") return "awaiting_response" as const;
    return "not_sent" as const;
  };
  const entries = rows.map((row) => ({ ...row, feedbackStatus: statusFor(row) }));
  const responses = entries.filter((row) => row.rating != null);
  const totalRating = responses.reduce((sum, row) => sum + (row.rating ?? 0), 0);

  return {
    entries,
    completedJobs: entries.length,
    responses: responses.length,
    fiveStars: responses.filter((row) => row.rating === 5).length,
    averageRating: responses.length ? Math.round((totalRating / responses.length) * 100) / 100 : 0,
    responseRate: entries.length ? Math.round((responses.length / entries.length) * 100) : 0,
  };
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

// A "skip" is a recurring occurrence the customer cancels without moving it
// (recurringSeriesId is set — a one-off job cancellation isn't a "skip" of a
// recurring pattern). A "bump" is any job whose scheduledDate was edited
// after creation, from the job detail screen or a calendar drag. Both are
// derived from job.updated audit_log rows rather than a dedicated column,
// since every job PATCH already writes a before/after snapshot there.
function skipsBumpsCondition(companyId: string, range: ReportsRange, area?: string) {
  return and(
    eq(auditLog.companyId, companyId),
    eq(auditLog.entityType, "job"),
    eq(auditLog.action, "job.updated"),
    eq(customers.companyId, companyId),
    timestampRange(auditLog.createdAt, range),
    area ? eq(customers.city, area) : undefined,
    or(
      and(
        sql`${auditLog.after} ->> 'status' = 'cancelled'`,
        sql`coalesce(${auditLog.before} ->> 'status', '') <> 'cancelled'`,
        isNotNull(jobs.recurringSeriesId),
      ),
      sql`${auditLog.after} ->> 'scheduledDate' is not null and ${auditLog.after} ->> 'scheduledDate' is distinct from ${auditLog.before} ->> 'scheduledDate'`,
    ),
  );
}

export async function getSkipsBumpsReport(
  companyId: string,
  range: ReportsRange,
  area?: string,
) {
  const rows = await db
    .select({
      eventType: sql<"skip" | "bump">`case when ${auditLog.after} ->> 'status' = 'cancelled' then 'skip' else 'bump' end`,
      eventDate: auditLog.createdAt,
      customerName: sql<string>`coalesce(nullif(${customers.companyName}, ''), concat(${customers.firstName}, ' ', ${customers.lastName}))`,
      area: customers.city,
      cancellationReason: sql<string | null>`${auditLog.after} ->> 'cancellationReason'`,
      fromDate: sql<string | null>`${auditLog.before} ->> 'scheduledDate'`,
      toDate: sql<string | null>`${auditLog.after} ->> 'scheduledDate'`,
    })
    .from(auditLog)
    .innerJoin(jobs, eq(auditLog.entityId, jobs.id))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(skipsBumpsCondition(companyId, range, area))
    .orderBy(desc(auditLog.createdAt));
  return rows;
}

export async function getSkipsBumpsSummary(
  companyId: string,
  range: ReportsRange,
  area?: string,
) {
  const [row] = await db
    .select({
      skips: sql<number>`count(*) filter (where ${auditLog.after} ->> 'status' = 'cancelled')`,
      bumps: sql<number>`count(*) filter (where coalesce(${auditLog.after} ->> 'status', '') <> 'cancelled')`,
    })
    .from(auditLog)
    .innerJoin(jobs, eq(auditLog.entityId, jobs.id))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(skipsBumpsCondition(companyId, range, area));
  return {
    skips: numberValue(row?.skips),
    bumps: numberValue(row?.bumps),
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
