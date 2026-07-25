import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, jobs, jobAssignments, timeEntries } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { generatePayrollForPeriod } from "@/lib/payroll/calculate";
import { refreshPayrollPeriodsForDates } from "@/lib/payroll/periods";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const user = await requireUser();
  const { jobId } = await params;

  const [assignment] = await db
    .select()
    .from(jobAssignments)
    .where(and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.userId, user.id)))
    .limit(1);

  if (!assignment) {
    return NextResponse.json({ error: "Not assigned to this job" }, { status: 403 });
  }

  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [openEntry] = await tx
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(and(eq(timeEntries.jobId, jobId), eq(timeEntries.userId, user.id), isNull(timeEntries.clockOut)))
      .limit(1);
    if (openEntry) return false;
    await tx.update(jobs).set({ status: "in_progress" }).where(eq(jobs.id, jobId));
    await tx.insert(timeEntries).values({
      jobId,
      userId: user.id,
      clockIn: now,
    });
    return true;
  });

  if (!result) {
    return NextResponse.json({ error: "You already have an open time entry for this job" }, { status: 400 });
  }
  await db.insert(auditLog).values({ companyId: user.companyId, userId: user.id, action: "job.clocked_in", entityType: "job", entityId: jobId, before: null, after: { clockIn: now.toISOString() } });

  // Keep the open period's line in sync (jobsCount/hours) the moment a real
  // clock-in happens, same as the admin manual-entry path — otherwise payroll
  // stays stale until an admin happens to reload the Payroll page.
  const [job] = await db.select({ scheduledDate: jobs.scheduledDate }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (job) {
    const refreshedPeriods = await refreshPayrollPeriodsForDates(user.companyId, [job.scheduledDate, now]);
    for (const periodId of refreshedPeriods) await generatePayrollForPeriod(periodId);
  }

  return NextResponse.json({ ok: true });
}
