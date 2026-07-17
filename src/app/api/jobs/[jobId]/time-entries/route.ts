import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, jobs, jobAssignments, timeEntries, users } from "@/db/schema";
import { generatePayrollForPeriod } from "@/lib/payroll/calculate";
import { refreshPayrollPeriodsForDates } from "@/lib/payroll/periods";

const recordTimeSchema = z.object({
  userId: z.string().uuid(),
  clockIn: z.string().datetime({ offset: true }),
  clockOut: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const admin = await requireAdmin();
  const { jobId } = await params;
  const parsed = recordTimeSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const clockIn = new Date(parsed.data.clockIn);
  const clockOut = new Date(parsed.data.clockOut);
  const minutesWorked = Math.round((clockOut.getTime() - clockIn.getTime()) / 60000);
  if (minutesWorked <= 0) return NextResponse.json({ error: "Clock-out must be after clock-in" }, { status: 400 });

  const [job] = await db.select({ id: jobs.id, companyId: jobs.companyId, status: jobs.status, scheduledDate: jobs.scheduledDate }).from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.companyId, admin.companyId))).limit(1);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status === "cancelled" || job.status === "no_show") return NextResponse.json({ error: "Cannot record time for this job" }, { status: 400 });

  const [assignment] = await db.select({ userId: jobAssignments.userId }).from(jobAssignments).innerJoin(users, eq(jobAssignments.userId, users.id)).where(and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.userId, parsed.data.userId), eq(users.companyId, admin.companyId))).limit(1);
  if (!assignment) return NextResponse.json({ error: "Employee is not assigned to this job" }, { status: 400 });

  // Treat an accidental repeat submission as an update/retry, not another
  // work record. This is especially important because payroll sums time
  // entries and the admin form can be submitted more than once.
  const [existingEntry] = await db.select().from(timeEntries).where(and(
    eq(timeEntries.jobId, jobId),
    eq(timeEntries.userId, parsed.data.userId),
    eq(timeEntries.clockIn, clockIn),
    eq(timeEntries.clockOut, clockOut)
  )).limit(1);
  const entry = existingEntry ?? (await db.insert(timeEntries).values({ jobId, userId: parsed.data.userId, clockIn, clockOut, minutesWorked, editedByAdmin: true, recordedByAdmin: true, notes: parsed.data.notes ?? null }).returning())[0];
  if (!existingEntry) {
    await db.insert(auditLog).values({
      companyId: admin.companyId,
      userId: admin.id,
      action: "time_entry.created",
      entityType: "time_entry",
      entityId: entry.id,
      before: null,
      after: { clockIn, clockOut, minutesWorked, notes: parsed.data.notes ?? null, employeeId: parsed.data.userId },
    });
  }
  if (job.status === "scheduled") await db.update(jobs).set({ status: "in_progress", updatedAt: new Date() }).where(eq(jobs.id, jobId));
  // Payroll should stay in sync even if the target week hasn't been opened
  // from the payroll screen yet. We refresh any open period that matches the
  // job's service date or the actual clock-in date, and create that weekly
  // period if it doesn't exist yet.
  const periods = await refreshPayrollPeriodsForDates(admin.companyId, [
    job.scheduledDate,
    clockIn,
    clockOut,
  ]);
  for (const periodId of periods) await generatePayrollForPeriod(periodId);
  return NextResponse.json({ entry, payrollPeriodsRefreshed: periods }, { status: 201 });
}
