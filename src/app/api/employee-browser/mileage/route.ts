import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, payrollLines, payrollPeriods, users } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { generatePayrollForPeriod, recomputeFinalCents } from "@/lib/payroll/calculate";
import { getOrCreatePayrollPeriodForDate } from "@/lib/payroll/periods";

const schema = z.object({
  employeeId: z.string().uuid(),
  mileageMiles: z.number().nonnegative(),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  const actingUser = await requireUser();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { employeeId, mileageMiles, note } = parsed.data;

  // Employees may only update their own mileage; admins may update anyone in their company.
  if (actingUser.role !== "admin" && actingUser.id !== employeeId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [employee] = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, isActive: users.isActive })
    .from(users)
    .where(and(eq(users.id, employeeId), eq(users.companyId, actingUser.companyId), eq(users.role, "employee")))
    .limit(1);

  if (!employee || !employee.isActive) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const period = await getOrCreatePayrollPeriodForDate(actingUser.companyId, new Date());
  await generatePayrollForPeriod(period.id);

  const [line] = await db
    .select()
    .from(payrollLines)
    .where(and(eq(payrollLines.payrollPeriodId, period.id), eq(payrollLines.userId, employeeId)))
    .limit(1);

  if (!line) {
    return NextResponse.json({ error: "Payroll line not found for this period" }, { status: 404 });
  }

  const before = {
    mileageMiles: line.mileageMiles,
    mileageRateCents: line.mileageRateCents,
    mileageCents: line.mileageCents,
    finalCents: line.finalCents,
  };

  await db.update(payrollLines).set({ mileageMiles: mileageMiles.toFixed(2) }).where(eq(payrollLines.id, line.id));
  await recomputeFinalCents(period.id, employeeId);

  await db.insert(auditLog).values({
    companyId: actingUser.companyId,
    userId: actingUser.id,
    action: "payroll_line.updated",
    entityType: "payroll_line",
    entityId: line.id,
    before,
    after: {
      mileageMiles,
      note: note ?? null,
    },
  });

  return NextResponse.json({ ok: true, payrollPeriodId: period.id });
}
