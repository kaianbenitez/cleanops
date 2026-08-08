import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, payrollJobReviews, payrollPeriods } from "@/db/schema";
import { generatePayrollForPeriod } from "@/lib/payroll/calculate";

const schema = z.object({
  status: z.enum(["approved", "rejected"]),
  approvedMinutes: z.number().int().positive().optional(),
  note: z.string().trim().max(1000).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ periodId: string; reviewId: string }> }
) {
  const admin = await requireAdmin();
  const { periodId, reviewId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [period] = await db
    .select({ id: payrollPeriods.id, status: payrollPeriods.status })
    .from(payrollPeriods)
    .where(and(eq(payrollPeriods.id, periodId), eq(payrollPeriods.companyId, admin.companyId)))
    .limit(1);
  if (!period) return NextResponse.json({ error: "Period not found" }, { status: 404 });
  if (period.status !== "open") return NextResponse.json({ error: "Reopen the payroll period before reviewing time variances." }, { status: 400 });

  const [review] = await db
    .select()
    .from(payrollJobReviews)
    .where(and(eq(payrollJobReviews.id, reviewId), eq(payrollJobReviews.payrollPeriodId, periodId)))
    .limit(1);
  if (!review) return NextResponse.json({ error: "Payroll time review not found" }, { status: 404 });

  const approvedMinutes = parsed.data.status === "approved"
    ? parsed.data.approvedMinutes ?? review.loggedMinutes
    : null;
  if (approvedMinutes !== null && approvedMinutes < review.jthMinutes) {
    return NextResponse.json({ error: "Approved minutes cannot be less than JTH minutes." }, { status: 400 });
  }

  await db.update(payrollJobReviews).set({
    status: parsed.data.status,
    approvedMinutes,
    reviewedBy: admin.id,
    reviewedAt: new Date(),
    note: parsed.data.note ?? null,
  }).where(eq(payrollJobReviews.id, reviewId));

  await db.insert(auditLog).values({
    companyId: admin.companyId,
    userId: admin.id,
    action: "payroll_job_review.decided",
    entityType: "payroll_job_review",
    entityId: reviewId,
    before: { status: review.status, approvedMinutes: review.approvedMinutes },
    after: { status: parsed.data.status, approvedMinutes, note: parsed.data.note ?? null },
  });

  await generatePayrollForPeriod(periodId);
  return NextResponse.json({ ok: true });
}
