import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, customers, jobs, jobAssignments, timeEntries } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { generatePayrollForPeriod } from "@/lib/payroll/calculate";
import { refreshPayrollPeriodsForDates } from "@/lib/payroll/periods";
import { notifyAdmins } from "@/lib/notifications/create";

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
  const [job] = await db
    .select({ scheduledDate: jobs.scheduledDate, customerId: jobs.customerId, customerFirstName: customers.firstName, customerLastName: customers.lastName })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (job) {
    const refreshedPeriods = await refreshPayrollPeriodsForDates(user.companyId, [job.scheduledDate, now]);
    for (const periodId of refreshedPeriods) await generatePayrollForPeriod(periodId);
    await notifyAdmins({
      companyId: user.companyId,
      type: "job.on_the_way",
      title: `${user.firstName} is on the way`,
      body: `${job.customerFirstName} ${job.customerLastName}`,
      href: `/jobs/${jobId}`,
      customerId: job.customerId,
    });
  }

  return NextResponse.json({ ok: true });
}

/** Undo the current cleaner's clock-in before any work has been completed. */
export async function DELETE(
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

  const result = await db.transaction(async (tx) => {
    const [openEntry] = await tx
      .select({ id: timeEntries.id, clockIn: timeEntries.clockIn })
      .from(timeEntries)
      .where(and(eq(timeEntries.jobId, jobId), eq(timeEntries.userId, user.id), isNull(timeEntries.clockOut)))
      .limit(1);
    if (!openEntry) return null;

    await tx.delete(timeEntries).where(eq(timeEntries.id, openEntry.id));

    const remainingEntries = await tx
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(eq(timeEntries.jobId, jobId))
      .limit(1);
    await tx.update(jobs).set({ status: remainingEntries.length ? "in_progress" : "scheduled" }).where(eq(jobs.id, jobId));

    return openEntry;
  });

  if (!result) {
    return NextResponse.json({ error: "No open time entry for this job" }, { status: 400 });
  }

  await db.insert(auditLog).values({
    companyId: user.companyId,
    userId: user.id,
    action: "job.clock_in_undone",
    entityType: "job",
    entityId: jobId,
    before: { clockIn: result.clockIn.toISOString() },
    after: null,
  });

  const [job] = await db.select({ scheduledDate: jobs.scheduledDate }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (job) {
    const refreshedPeriods = await refreshPayrollPeriodsForDates(user.companyId, [job.scheduledDate, result.clockIn]);
    for (const periodId of refreshedPeriods) await generatePayrollForPeriod(periodId);
  }

  return NextResponse.json({ ok: true });
}
