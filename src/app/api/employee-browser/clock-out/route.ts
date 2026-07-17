import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, jobs, timeEntries, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current-user";
import { generatePayrollForPeriod } from "@/lib/payroll/calculate";
import { refreshPayrollPeriodsForDates } from "@/lib/payroll/periods";
import { z } from "zod";

const schema = z.object({
  employeeId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
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
    .select({ id: users.id, isActive: users.isActive })
    .from(users)
    .where(and(eq(users.id, employeeId), eq(users.companyId, admin.companyId), eq(users.role, "employee")))
    .limit(1);

  if (!employee || !employee.isActive) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const query = db
    .select({
      id: timeEntries.id,
      jobId: timeEntries.jobId,
      clockIn: timeEntries.clockIn,
      notes: timeEntries.notes,
    })
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, employeeId), isNull(timeEntries.clockOut), ...(jobId ? [eq(timeEntries.jobId, jobId)] : [])))
    .orderBy(desc(timeEntries.clockIn))
    .limit(1);

  const [entry] = await query;

  if (!entry) {
    return NextResponse.json({ error: "No open time entry found for this employee" }, { status: 404 });
  }

  const minutesWorked = Math.round((now.getTime() - new Date(entry.clockIn).getTime()) / 60000);
  if (minutesWorked <= 0) {
    return NextResponse.json({ error: "Clock-out must be after clock-in" }, { status: 400 });
  }

  await db
    .update(timeEntries)
    .set({
      clockOut: now,
      minutesWorked,
      editedByAdmin: true,
      recordedByAdmin: true,
      notes: notes ?? entry.notes ?? null,
    })
    .where(eq(timeEntries.id, entry.id));

  await db.insert(auditLog).values({
    companyId: admin.companyId,
    userId: admin.id,
    action: "time_entry.closed",
    entityType: "time_entry",
    entityId: entry.id,
    before: {
      clockIn: entry.clockIn,
      clockOut: null,
      notes: entry.notes,
    },
    after: {
      clockIn: entry.clockIn,
      clockOut: now.toISOString(),
      minutesWorked,
      notes: notes ?? entry.notes ?? null,
    },
  });

  const [job] = await db
    .select({
      id: jobs.id,
      scheduledDate: jobs.scheduledDate,
      status: jobs.status,
    })
    .from(jobs)
    .where(and(eq(jobs.id, entry.jobId), eq(jobs.companyId, admin.companyId)))
    .limit(1);

  if (job) {
    const [stillOpen] = await db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(and(eq(timeEntries.jobId, job.id), isNull(timeEntries.clockOut)))
      .limit(1);

    if (!stillOpen && job.status !== "cancelled" && job.status !== "no_show") {
      await db.update(jobs).set({ status: "completed", completedAt: now, updatedAt: now }).where(eq(jobs.id, job.id));
    }

    const refreshedPeriods = await refreshPayrollPeriodsForDates(admin.companyId, [job.scheduledDate, entry.clockIn, now]);
    for (const periodId of refreshedPeriods) {
      await generatePayrollForPeriod(periodId);
    }
  }

  return NextResponse.json({ ok: true, entryId: entry.id }, { status: 200 });
}
