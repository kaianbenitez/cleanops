import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, payrollJobReviews, payrollPeriods } from "@/db/schema";
import { and, eq, count } from "drizzle-orm";
import { getPayrollLinesForPeriod } from "@/lib/payroll/calculate";
import { validateGustoExport } from "@/lib/payroll/gusto-csv";

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

  const lines = await getPayrollLinesForPeriod(periodId, admin.companyId);
  const jobReviews = await db
    .select({ id: payrollJobReviews.id, jobId: payrollJobReviews.jobId, userId: payrollJobReviews.userId, jthMinutes: payrollJobReviews.jthMinutes, loggedMinutes: payrollJobReviews.loggedMinutes, approvedMinutes: payrollJobReviews.approvedMinutes, status: payrollJobReviews.status, note: payrollJobReviews.note })
    .from(payrollJobReviews)
    .where(eq(payrollJobReviews.payrollPeriodId, periodId));

  return NextResponse.json({ period, lines, jobReviews, exportReadiness: validateGustoExport(lines) });
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

  const [current] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, periodId)).limit(1);
  if (!current || parsed.data.status === current.status) return NextResponse.json({ ok: true });
  const allowed = current.status === "open"
    ? parsed.data.status === "reviewed"
    : parsed.data.status === "open";
  if (!allowed) {
    return NextResponse.json({ error: `Invalid payroll transition: ${current.status} → ${parsed.data.status}. Exported status is set only after a valid export.` }, { status: 400 });
  }

  if (parsed.data.status === "reviewed") {
    const [pending] = await db
      .select({ count: count() })
      .from(payrollJobReviews)
      .where(and(eq(payrollJobReviews.payrollPeriodId, periodId), eq(payrollJobReviews.status, "pending")));
    if (Number(pending?.count ?? 0) > 0) {
      return NextResponse.json({ error: "Resolve all pending logged-time overages before approving payroll." }, { status: 400 });
    }
  }

  await db
    .update(payrollPeriods)
    .set({
      status: parsed.data.status,
      exportedAt: parsed.data.status === "open" ? null : undefined,
    })
    .where(eq(payrollPeriods.id, periodId));

  await db.insert(auditLog).values({
    companyId: admin.companyId,
    userId: admin.id,
    action: "payroll_period.status_changed",
    entityType: "payroll_period",
    entityId: periodId,
    before: { status: current.status },
    after: { status: parsed.data.status },
  });

  return NextResponse.json({ ok: true });
}
