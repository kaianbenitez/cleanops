import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { payrollPeriods } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getPayrollLinesForPeriod } from "@/lib/payroll/calculate";
import { buildGustoCsv } from "@/lib/payroll/gusto-csv";

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

  const lines = await getPayrollLinesForPeriod(periodId);
  const csv = buildGustoCsv(lines);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="payroll_${period.startDate}_to_${period.endDate}.csv"`,
    },
  });
}
