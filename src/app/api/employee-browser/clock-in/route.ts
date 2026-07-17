import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, jobs, jobAssignments, timeEntries, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current-user";
import { generatePayrollForPeriod } from "@/lib/payroll/calculate";
import { refreshPayrollPeriodsForDates } from "@/lib/payroll/periods";
import { z } from "zod";

const schema = z.object({
  employeeId: z.string().uuid(),
  jobId: z.string().uuid(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const now = new Date();
  const { employeeId, jobId, notes } = parsed.data;

  const [employee] = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, isActive: users.isActive })
    .from(users)
    .where(and(eq(users.id, employeeId), eq(users.companyId, admin.companyId), eq(users.role, "employee")))
    .limit(1);

  if (!employee || !employee.isActive) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const [job] = await db
    .select({
      id: jobs.id,
      companyId: jobs.companyId,
      status: jobs.status,
      scheduledDate: jobs.scheduledDate,
    })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.companyId, admin.companyId)))
    .limit(1);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const [assignment] = await db
    .select({ jobId: jobAssignments.jobId })
    .from(jobAssignments)
    .where(and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.userId, employeeId)))
    .limit(1);

  if (!assignment) {
    return NextResponse.json({ error: "Employee is not assigned to this job" }, { status: 400 });
  }

  const [sameJobOpen] = await db
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.jobId, jobId), eq(timeEntries.userId, employeeId), isNull(timeEntries.clockOut)))
    .limit(1);

  if (sameJobOpen) {
    return NextResponse.json({ entry: sameJobOpen, idempotent: true });
  }

  const [otherOpen] = await db
    .select({ jobId: timeEntries.jobId, clockIn: timeEntries.clockIn })
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, employeeId), isNull(timeEntries.clockOut), ne(timeEntries.jobId, jobId)))
    .orderBy(timeEntries.clockIn)
    .limit(1);

  if (otherOpen) {
    return NextResponse.json(
      {
        error: "This employee already has an open time entry on another job. Clock that job out first.",
        openJobId: otherOpen.jobId,
      },
      { status: 409 }
    );
  }

  const [entry] = await db
    .insert(timeEntries)
    .values({
      jobId,
      userId: employeeId,
      clockIn: now,
      clockOut: null,
      minutesWorked: null,
      editedByAdmin: true,
      recordedByAdmin: true,
      notes: notes ?? null,
    })
    .returning();

  await db.insert(auditLog).values({
    companyId: admin.companyId,
    userId: admin.id,
    action: "time_entry.created",
    entityType: "time_entry",
    entityId: entry.id,
    before: null,
    after: {
      jobId,
      employeeId,
      clockIn: now.toISOString(),
      clockOut: null,
      notes: notes ?? null,
    },
  });

  if (job.status === "scheduled") {
    await db.update(jobs).set({ status: "in_progress", updatedAt: new Date() }).where(eq(jobs.id, jobId));
  }

  const refreshedPeriods = await refreshPayrollPeriodsForDates(admin.companyId, [job.scheduledDate, now]);
  for (const periodId of refreshedPeriods) {
    await generatePayrollForPeriod(periodId);
  }

  return NextResponse.json({ entry, payrollPeriodsRefreshed: refreshedPeriods }, { status: 201 });
}
