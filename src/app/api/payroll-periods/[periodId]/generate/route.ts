import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { payrollPeriods } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { generatePayrollForPeriod } from "@/lib/payroll/calculate";

/** POST /api/payroll-periods/[periodId]/generate — (re)computes commission/office-hours
 * for every active employee. Safe to call repeatedly; never overwrites manual fields. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ periodId: string }> }
) {
  const admin = await requireAdmin();
  const { periodId } = await params;

  const [period] = await db
    .select({ id: payrollPeriods.id, status: payrollPeriods.status })
    .from(payrollPeriods)
    .where(and(eq(payrollPeriods.id, periodId), eq(payrollPeriods.companyId, admin.companyId)))
    .limit(1);

  if (!period) {
    return NextResponse.json({ error: "Period not found" }, { status: 404 });
  }

  try {
    const result = await generatePayrollForPeriod(periodId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not regenerate payroll" },
      { status: 400 }
    );
  }
}
