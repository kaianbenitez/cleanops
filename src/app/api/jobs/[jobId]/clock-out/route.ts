import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, customers, jobPaymentMethodEnum, jobs, jobAssignments, timeEntries } from "@/db/schema";
import { and, eq, isNull, desc } from "drizzle-orm";
import { syncToGhl } from "@/lib/ghl/sync";
import { generatePayrollForPeriod } from "@/lib/payroll/calculate";
import { refreshPayrollPeriodsForDates } from "@/lib/payroll/periods";
import { notifyAdmins } from "@/lib/notifications/create";
import { paymentMethodLabel } from "@/lib/my-day/job-format";
import { ensureFeedbackRequest } from "@/lib/feedback/ensure-feedback-request";

const closeOutSchema = z.object({
  paymentMethodCollected: z.enum(jobPaymentMethodEnum).optional(),
  checkNumberCollected: z.string().trim().max(100).optional(),
  cleanerNotes: z.string().trim().max(2000).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const user = await requireUser();
  const { jobId } = await params;
  const rawBody = await req.json().catch(() => ({}));
  const parsed = closeOutSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { paymentMethodCollected, checkNumberCollected, cleanerNotes } = parsed.data;

  const [openEntry] = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.jobId, jobId),
        eq(timeEntries.userId, user.id),
        isNull(timeEntries.clockOut)
      )
    )
    .orderBy(desc(timeEntries.clockIn))
    .limit(1);

  if (!openEntry) {
    return NextResponse.json({ error: "No open time entry for this job" }, { status: 400 });
  }

  const clockOut = new Date();
  const minutesWorked = Math.round(
    (clockOut.getTime() - new Date(openEntry.clockIn).getTime()) / 60000
  );

  const [job] = await db
    .select({ type: jobs.type, status: jobs.status, customerId: jobs.customerId, scheduledDate: jobs.scheduledDate, customerFirstName: customers.firstName, customerLastName: customers.lastName })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(eq(jobs.id, jobId))
    .limit(1);

  const completion = await db.transaction(async (tx) => {
    await tx
      .update(timeEntries)
      .set({ clockOut, minutesWorked })
      .where(eq(timeEntries.id, openEntry.id));

    const assigned = await tx
      .select({ userId: jobAssignments.userId })
      .from(jobAssignments)
      .where(eq(jobAssignments.jobId, jobId));
    const entries = await tx
      .select({ userId: timeEntries.userId, clockOut: timeEntries.clockOut })
      .from(timeEntries)
      .where(eq(timeEntries.jobId, jobId));
    const hasOpenEntries = entries.some((entry) => !entry.clockOut);
    const completedUsers = new Set(entries.filter((entry) => entry.clockOut).map((entry) => entry.userId));
    const allAssignedEmployeesFinished = assigned.length > 0 && assigned.every((assignment) => completedUsers.has(assignment.userId));
    const shouldComplete = !hasOpenEntries && allAssignedEmployeesFinished;
    await tx.update(jobs).set({
      ...(shouldComplete ? { status: "completed" as const, completedAt: clockOut } : { status: "in_progress" as const }),
      ...(paymentMethodCollected !== undefined ? { paymentMethodCollected } : {}),
      ...(paymentMethodCollected === "check" && checkNumberCollected ? { checkNumberCollected } : {}),
      ...(cleanerNotes ? { cleanerNotes } : {}),
    }).where(eq(jobs.id, jobId));
    return shouldComplete;
  });
  await db.insert(auditLog).values({
    companyId: user.companyId,
    userId: user.id,
    action: completion ? "job.completed" : "job.clocked_out",
    entityType: "job",
    entityId: jobId,
    before: null,
    after: {
      clockOut: clockOut.toISOString(),
      minutesWorked,
      ...(paymentMethodCollected !== undefined ? { paymentMethodCollected } : {}),
      ...(paymentMethodCollected === "check" && checkNumberCollected ? { checkNumberCollected } : {}),
      ...(cleanerNotes ? { cleanerNotes } : {}),
    },
  });

  // PLAN.md §6: "Job completed (first_clean)" -> tag first-clean-done.
  if (completion && job && job.status !== "completed" && job.type === "first_clean") {
    await syncToGhl(user.companyId, { type: "first_clean.completed", customerId: job.customerId });
  }

  if (job) {
    const customerName = `${job.customerFirstName} ${job.customerLastName}`;
    if (completion) {
      await ensureFeedbackRequest({ companyId: user.companyId, jobId, origin: req.url });
      await notifyAdmins({ companyId: user.companyId, type: "job.completed", title: `Job completed by ${user.firstName} ${user.lastName}`, body: customerName, href: `/jobs/${jobId}`, customerId: job.customerId });
    }
    if (cleanerNotes) {
      await notifyAdmins({ companyId: user.companyId, type: "job.note_added", title: "Note added from the field", body: `${customerName} — ${cleanerNotes}`, href: `/jobs/${jobId}`, customerId: job.customerId });
    }
    if (paymentMethodCollected && paymentMethodCollected !== "not_collected") {
      await notifyAdmins({ companyId: user.companyId, type: "job.payment_method_added", title: `Payment collected (${paymentMethodLabel(paymentMethodCollected)})`, body: customerName, href: `/jobs/${jobId}`, customerId: job.customerId });
    }
  }

  // Keep the open period's line in sync the moment a real clock-out happens,
  // same as the admin manual-entry path — otherwise payroll stays stale
  // until an admin happens to reload the Payroll page.
  if (job) {
    const refreshedPeriods = await refreshPayrollPeriodsForDates(user.companyId, [job.scheduledDate, openEntry.clockIn, clockOut]);
    for (const periodId of refreshedPeriods) await generatePayrollForPeriod(periodId);
  }

  return NextResponse.json({ ok: true, minutesWorked, jobCompleted: completion });
}
