import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, payrollJobReviews, payrollPeriods } from "@/db/schema";
import { and, eq, count } from "drizzle-orm";
import { getPayrollLinesForPeriod } from "@/lib/payroll/calculate";
import { buildGustoCsv, validateGustoExport } from "@/lib/payroll/gusto-csv";

/** GET /api/payroll-periods/[periodId]/export — downloads the Gusto-import-ready CSV. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ periodId: string }> }
) {
  const admin = await requireAdmin();
  const { periodId } = await params;

  const [period] = await db
    .select()
    .from(payrollPeriods)
    .where(and(eq(payrollPeriods.id, periodId), eq(payrollPeriods.companyId, admin.companyId)))
    .limit(1);

  if (!period) {
    return NextResponse.json({ error: "Period not found" }, { status: 404 });
  }

  if (period.status !== "reviewed" && period.status !== "exported") {
    return NextResponse.json({ error: "Approve the payroll period before exporting." }, { status: 400 });
  }

  const [pending] = await db.select({ count: count() }).from(payrollJobReviews)
    .where(and(eq(payrollJobReviews.payrollPeriodId, periodId), eq(payrollJobReviews.status, "pending")));
  if (Number(pending?.count ?? 0) > 0) {
    return NextResponse.json({ error: "Payroll has unresolved logged-time overages.", blockers: [{ reason: "Resolve all pending overage approvals before export." }] }, { status: 400 });
  }

  const lines = await getPayrollLinesForPeriod(periodId, admin.companyId);
  const readiness = validateGustoExport(lines);
  if (!readiness.ok) {
    return NextResponse.json({ error: "Payroll is not ready for Gusto export.", blockers: readiness.blockers }, { status: 400 });
  }
  const csv = buildGustoCsv(lines);

  if (period.status === "reviewed") {
    await db.update(payrollPeriods).set({ status: "exported", exportedAt: new Date() }).where(eq(payrollPeriods.id, periodId));
    await db.insert(auditLog).values({
      companyId: admin.companyId,
      userId: admin.id,
      action: "payroll_period.exported",
      entityType: "payroll_period",
      entityId: periodId,
      before: { status: period.status, exportedAt: period.exportedAt },
      after: { status: "exported" },
    });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="payroll_${period.startDate}_to_${period.endDate}.csv"`,
    },
  });
}
