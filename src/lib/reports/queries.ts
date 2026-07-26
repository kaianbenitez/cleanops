import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, invoices, jobs } from "@/db/schema";
import { addDaysIso } from "@/lib/dashboard/range";
import { overdueSqlCondition } from "@/lib/invoices/overdue";
import type {
  CustomerHealthCounts,
  ReportOperationsCounts,
  ReportRange,
} from "./types";

const numberValue = (value: unknown) => Number(value ?? 0);

function paidRangeCondition(companyId: string, range: ReportRange) {
  const toExclusiveIso = addDaysIso(range.toIso, 1);

  return and(
    eq(invoices.companyId, companyId),
    eq(invoices.status, "paid"),
    gte(
      invoices.paidAt,
      sql`(${range.fromIso}::date::timestamp AT TIME ZONE ${range.timeZone})`,
    ),
    lt(
      invoices.paidAt,
      sql`(${toExclusiveIso}::date::timestamp AT TIME ZONE ${range.timeZone})`,
    ),
  );
}

export async function getRevenueSeries(
  companyId: string,
  range: ReportRange,
) {
  const day = sql<string>`to_char(${invoices.paidAt} AT TIME ZONE ${range.timeZone}, 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      day,
      amountCents: sql<number>`coalesce(sum(${invoices.amountPaidCents}), 0)`,
    })
    .from(invoices)
    .where(paidRangeCondition(companyId, range))
    .groupBy(sql`1`);

  return rows.map((row) => ({
    day: row.day,
    amountCents: numberValue(row.amountCents),
  }));
}

export async function getCashToCollect(companyId: string) {
  const [totalRow] = await db
    .select({
      count: sql<number>`count(*)`,
      amountCents: sql<number>`coalesce(sum(greatest(${invoices.totalCents} - ${invoices.amountPaidCents}, 0)), 0)`,
    })
    .from(invoices)
    .where(and(eq(invoices.companyId, companyId), overdueSqlCondition()));

  return {
    count: numberValue(totalRow?.count),
    amountCents: numberValue(totalRow?.amountCents),
  };
}

export async function getReportOperationsCounts(
  companyId: string,
  fromIso: string,
  toIso: string,
): Promise<ReportOperationsCounts> {
  const toExclusiveIso = addDaysIso(toIso, 1);
  const [row] = await db
    .select({
      unassigned: sql<number>`count(*) filter (where not exists (select 1 from job_assignments ja where ja.job_id = ${jobs.id}))`,
      missingHours: sql<number>`count(*) filter (where ${jobs.status} = 'completed' and not exists (select 1 from time_entries te where te.job_id = ${jobs.id}))`,
      awaitingInvoicing: sql<number>`count(*) filter (where ${jobs.status} = 'completed' and not exists (select 1 from invoices i where i.job_id = ${jobs.id} and i.company_id = ${companyId}))`,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.companyId, companyId),
        gte(jobs.scheduledDate, fromIso),
        lt(jobs.scheduledDate, toExclusiveIso),
      ),
    );

  return {
    unassigned: numberValue(row?.unassigned),
    missingHours: numberValue(row?.missingHours),
    awaitingInvoicing: numberValue(row?.awaitingInvoicing),
  };
}

export async function getCustomerHealthCounts(
  companyId: string,
): Promise<CustomerHealthCounts> {
  const [row] = await db
    .select({
      missingPaymentMethod: sql<number>`count(*) filter (where ${customers.paymentMethods} is null or cardinality(${customers.paymentMethods}) = 0)`,
      incompleteNotes: sql<number>`count(*) filter (where ${customers.generalNotes} is null or trim(${customers.generalNotes}) = '')`,
    })
    .from(customers)
    .where(
      and(
        eq(customers.companyId, companyId),
        eq(customers.isArchived, false),
      ),
    );

  return {
    missingPaymentMethod: numberValue(row?.missingPaymentMethod),
    incompleteNotes: numberValue(row?.incompleteNotes),
  };
}
