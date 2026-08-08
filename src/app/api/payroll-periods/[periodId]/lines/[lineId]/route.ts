import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, payrollLines, payrollPeriods, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { recomputeFinalCents } from "@/lib/payroll/calculate";

const manualOfficeHoursSchema = z.number().finite().nonnegative().refine((value) => Number.isInteger(value * 100), "Must use at most two decimal places");
const updateLineSchema = z.object({
  manualOfficeHours: manualOfficeHoursSchema.optional(),
  mileageMiles: z.number().nonnegative().optional(),
  mileageRateCents: z.number().int().nonnegative().optional(),
  tipsPaycheckCents: z.number().int().nonnegative().optional(),
  tipsCashCents: z.number().int().nonnegative().optional(),
  bonusCents: z.number().int().nonnegative().optional(),
  teamLeadBonusCents: z.number().int().nonnegative().optional(),
  trainerBonusCents: z.number().int().nonnegative().optional(),
  gustoNetPayCents: z.number().int().nonnegative().nullable().optional(),
  trainingCents: z.number().int().nonnegative().optional(),
  payrollAdvanceCents: z.number().int().nonnegative().optional(),
  adjustmentCents: z.number().int().optional(),
  adjustmentNote: z.string().optional(),
});

/** PATCH /api/payroll-periods/[periodId]/lines/[lineId] — updates the manual-entry
 * fields on one employee's payroll line (mileage, tips, bonus, training, advance,
 * ad-hoc adjustment). Automatic fields (commission, office hours) are untouched here —
 * only the /generate endpoint recomputes those. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ periodId: string; lineId: string }> }
) {
  const admin = await requireAdmin();
  const { periodId, lineId } = await params;
  const body = await req.json();
  const parsed = updateLineSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [period] = await db
    .select({ id: payrollPeriods.id, status: payrollPeriods.status })
    .from(payrollPeriods)
    .where(and(eq(payrollPeriods.id, periodId), eq(payrollPeriods.companyId, admin.companyId)))
    .limit(1);

  if (!period) {
    return NextResponse.json({ error: "Period not found" }, { status: 404 });
  }

  if (period.status !== "open") {
    return NextResponse.json(
      { error: `This payroll period is marked "${period.status}" and is protected from edits. Reopen it first if changes are needed.` },
      { status: 400 }
    );
  }

  const [line] = await db
    .select({ line: payrollLines, employeeCompanyId: users.companyId })
    .from(payrollLines)
    .innerJoin(users, eq(payrollLines.userId, users.id))
    .where(and(eq(payrollLines.id, lineId), eq(payrollLines.payrollPeriodId, periodId), eq(users.companyId, admin.companyId)))
    .limit(1);

  if (!line) {
    return NextResponse.json({ error: "Line not found" }, { status: 404 });
  }

  const payrollLine = line.line;

  if (parsed.data.manualOfficeHours !== undefined) {
    const [employee] = await db
      .select({ role: users.role, payType: users.payType })
      .from(users)
      .where(eq(users.id, payrollLine.userId))
      .limit(1);
    if (employee?.role !== "admin" || employee.payType !== "office_hourly") {
      return NextResponse.json({ error: "Manual office hours can only be edited for office-hourly admin lines." }, { status: 400 });
    }
  }

  const before = {
    manualOfficeHours: payrollLine.manualOfficeHours,
    mileageMiles: payrollLine.mileageMiles,
    mileageRateCents: payrollLine.mileageRateCents,
    tipsPaycheckCents: payrollLine.tipsPaycheckCents,
    tipsCashCents: payrollLine.tipsCashCents,
    bonusCents: payrollLine.bonusCents,
    teamLeadBonusCents: payrollLine.teamLeadBonusCents,
    trainerBonusCents: payrollLine.trainerBonusCents,
    trainingCents: payrollLine.trainingCents,
    payrollAdvanceCents: payrollLine.payrollAdvanceCents,
    adjustmentCents: payrollLine.adjustmentCents,
    adjustmentNote: payrollLine.adjustmentNote,
  };

  const { mileageMiles, ...rest } = parsed.data;
  const isMileageEdit = mileageMiles !== undefined;
  const leadJobCount = Array.isArray(payrollLine.calculation)
    ? payrollLine.calculation.filter((entry) => entry && typeof entry === "object" && (entry as { crewRole?: string }).crewRole === "lead").length
    : 0;
  if (isMileageEdit && leadJobCount === 0) {
    return NextResponse.json(
      { error: "Mileage can only be edited on a lead / driver payroll row." },
      { status: 400 }
    );
  }

  const fields: Record<string, unknown> = { ...rest };
  if (mileageMiles !== undefined) {
    fields.mileageMiles = mileageMiles.toFixed(2);
  }
  if (parsed.data.manualOfficeHours !== undefined) {
    fields.manualOfficeHours = parsed.data.manualOfficeHours.toFixed(2);
  }

  if (Object.keys(fields).length > 0) {
    await db.update(payrollLines).set(fields).where(eq(payrollLines.id, lineId));
  }

  await recomputeFinalCents(periodId, payrollLine.userId);

  await db.insert(auditLog).values({
    companyId: admin.companyId,
    userId: admin.id,
    action: "payroll_line.updated",
    entityType: "payroll_line",
    entityId: lineId,
    before,
    after: parsed.data,
  });

  return NextResponse.json({ ok: true });
}
