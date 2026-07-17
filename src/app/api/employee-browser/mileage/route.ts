import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, payrollLines, payrollPeriods, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current-user";
import { generatePayrollForPeriod, recomputeFinalCents } from "@/lib/payroll/calculate";
import { getOrCreatePayrollPeriodForDate } from "@/lib/payroll/periods";

const schema = z.object({
  employeeId: z.string().uuid(),
  mileageMiles: z.number().nonnegative(),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { employeeId, mileageMiles, note } = parsed.data;

  const [employee] = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, isActive: users.isActive })
    .from(users)
    .where(and(eq(users.id, employeeId), eq(users.companyId, admin.companyId), eq(users.role, "employee")))
    .limit(1);

  if (!employee || !employee.isActive) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const period = await getOrCreatePayrollPeriodForDate(admin.companyId, new Date());
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
    companyId: admin.companyId,
    userId: admin.id,
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
