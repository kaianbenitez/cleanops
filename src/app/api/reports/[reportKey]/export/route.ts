import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, reportExports } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current-user";
import { resolveRange } from "@/lib/dashboard/range";
import {
  getAccountsReceivableReport,
  getJobsReport,
  getPayrollReport,
  getSalesReport,
  getTipsReport,
  type ReportKey,
} from "@/lib/reports/queries";

const reportKeys = new Set<ReportKey>([
  "payroll",
  "tips",
  "accounts-receivable",
  "jobs",
  "sales",
]);

function escapeCsv(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows: (string | number | null | undefined)[][]) {
  return rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportKey: string }> },
) {
  const admin = await requireAdmin();
  const { reportKey } = await params;
  if (!reportKeys.has(reportKey as ReportKey))
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  const key = reportKey as ReportKey;
  const search = request.nextUrl.searchParams;
  const [company] = await db
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, admin.companyId))
    .limit(1);
  if (!company)
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  const range = resolveRange(
    {
      preset: search.get("preset") ?? undefined,
      from: search.get("from") ?? undefined,
      to: search.get("to") ?? undefined,
    },
    company.timezone,
  );
  const area = search.get("area") || undefined;
  let output: string;
  if (key === "payroll") {
    const rows = await getPayrollReport(admin.companyId, range);
    output = csv([
      [
        "Employee",
        "Pay period start",
        "Pay period end",
        "Regular hours",
        "Office hours",
        "Paycheck tips",
        "Cash tips",
        "Gross pay",
      ],
      ...rows.map((row) => [
        row.employeeName,
        row.periodStart,
        row.periodEnd,
        row.regularHours,
        row.officeHours,
        row.tipsPaycheckCents / 100,
        row.tipsCashCents / 100,
        row.grossPayCents / 100,
      ]),
    ]);
  } else if (key === "tips") {
    const rows = await getTipsReport(admin.companyId, range);
    output = csv([
      [
        "Employee",
        "Pay period start",
        "Pay period end",
        "Paycheck tips",
        "Cash tips",
        "Total tips",
      ],
      ...rows.map((row) => [
        row.employeeName,
        row.periodStart,
        row.periodEnd,
        row.paycheckTipsCents / 100,
        row.cashTipsCents / 100,
        (row.paycheckTipsCents + row.cashTipsCents) / 100,
      ]),
    ]);
  } else if (key === "accounts-receivable") {
    const rows = await getAccountsReceivableReport(
      admin.companyId,
      range,
      area,
    );
    output = csv([
      [
        "Customer",
        "Area",
        "Invoice date",
        "Invoice total",
        "Amount paid",
        "Outstanding",
        "Aging bucket",
        "Overdue",
      ],
      ...rows.map((row) => [
        row.customerName,
        row.area,
        row.invoiceCreatedAt.toISOString(),
        row.totalCents / 100,
        row.amountPaidCents / 100,
        row.outstandingCents / 100,
        row.agingBucket,
        row.overdue ? "Yes" : "No",
      ]),
    ]);
  } else if (key === "jobs") {
    const rows = await getJobsReport(admin.companyId, range, area);
    output = csv([
      [
        "Customer",
        "Area",
        "Scheduled date",
        "Status",
        "Completed at",
        "Estimated duration minutes",
      ],
      ...rows.map((row) => [
        row.customerName,
        row.area,
        row.scheduledDate,
        row.status,
        row.completedAt?.toISOString(),
        row.estimatedDurationMinutes,
      ]),
    ]);
  } else {
    const rows = await getSalesReport(admin.companyId, range, area);
    output = csv([
      ["Type", "Customer", "Area", "Date"],
      ...rows.map((row) => [
        row.type,
        row.customerName,
        row.area,
        row.eventDate instanceof Date
          ? row.eventDate.toISOString()
          : row.eventDate,
      ]),
    ]);
  }
  await db.insert(reportExports).values({
    companyId: admin.companyId,
    reportKey: key,
    exportedByUserId: admin.id,
  });
  return new NextResponse(output, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${key}_${range.fromIso}_to_${range.toIso}.csv"`,
    },
  });
}
