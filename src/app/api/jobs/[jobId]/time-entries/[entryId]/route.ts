import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, jobs, timeEntries } from "@/db/schema";
import { generatePayrollForPeriod } from "@/lib/payroll/calculate";
import { refreshPayrollPeriodsForDates } from "@/lib/payroll/periods";

const updateTimeSchema = z.object({
  clockIn: z.string().datetime({ offset: true }),
  clockOut: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string; entryId: string }> }
) {
  const admin = await requireAdmin();
  const { jobId, entryId } = await params;
  const parsed = updateTimeSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const clockIn = new Date(parsed.data.clockIn);
  const clockOut = new Date(parsed.data.clockOut);
  const minutesWorked = Math.round((clockOut.getTime() - clockIn.getTime()) / 60000);
  if (minutesWorked <= 0) return NextResponse.json({ error: "Clock-out must be after clock-in" }, { status: 400 });

  const [existing] = await db
    .select({
      id: timeEntries.id,
      jobId: timeEntries.jobId,
      userId: timeEntries.userId,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
      minutesWorked: timeEntries.minutesWorked,
      notes: timeEntries.notes,
      companyId: jobs.companyId,
      scheduledDate: jobs.scheduledDate,
    })
    .from(timeEntries)
    .innerJoin(jobs, eq(timeEntries.jobId, jobs.id))
    .where(and(eq(timeEntries.id, entryId), eq(timeEntries.jobId, jobId), eq(jobs.companyId, admin.companyId)))
    .limit(1);

  if (!existing) return NextResponse.json({ error: "Time entry not found" }, { status: 404 });

  const [updated] = await db
    .update(timeEntries)
    .set({ clockIn, clockOut, minutesWorked, notes: parsed.data.notes ?? null, editedByAdmin: true, recordedByAdmin: true, updatedAt: new Date() })
    .where(eq(timeEntries.id, entryId))
    .returning();

  await db.insert(auditLog).values({
    companyId: admin.companyId,
    userId: admin.id,
    action: "time_entry.updated",
    entityType: "time_entry",
    entityId: entryId,
    before: { clockIn: existing.clockIn, clockOut: existing.clockOut, minutesWorked: existing.minutesWorked, notes: existing.notes },
    after: { clockIn, clockOut, minutesWorked, notes: parsed.data.notes ?? null },
  });

  const periods = await refreshPayrollPeriodsForDates(admin.companyId, [
    existing.scheduledDate,
    existing.clockIn,
    clockIn,
    clockOut,
  ]);
  for (const periodId of periods) await generatePayrollForPeriod(periodId);

  return NextResponse.json({ entry: updated, payrollPeriodsRefreshed: periods });
}
