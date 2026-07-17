import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { payrollPeriods } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getPayrollLinesForPeriod } from "@/lib/payroll/calculate";

const updatePeriodSchema = z.object({
  status: z.enum(["open", "reviewed", "exported"]),
});

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

  return NextResponse.json({ period, lines });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ periodId: string }> }
) {
  const admin = await requireAdmin();
  const { periodId } = await params;
  const body = await req.json();
  const parsed = updatePeriodSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: payrollPeriods.id })
    .from(payrollPeriods)
    .where(and(eq(payrollPeriods.id, periodId), eq(payrollPeriods.companyId, admin.companyId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Period not found" }, { status: 404 });
  }

  await db
    .update(payrollPeriods)
    .set({
      status: parsed.data.status,
      exportedAt: parsed.data.status === "exported" ? new Date() : undefined,
    })
    .where(eq(payrollPeriods.id, periodId));

  return NextResponse.json({ ok: true });
}
