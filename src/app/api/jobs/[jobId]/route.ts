import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, jobs, jobAssignments, customers, timeEntries, users } from "@/db/schema";
import { and, eq, inArray, desc } from "drizzle-orm";
import { syncToGhl } from "@/lib/ghl/sync";
import { findPtoConflicts, ptoConflictMessage } from "@/lib/scheduling/pto";

const updateJobSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scheduledStartTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  priceCents: z.number().int().nonnegative().optional(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled", "no_show"]).optional(),
  employeeIds: z.array(z.string().uuid()).optional(),
  completionNotes: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const admin = await requireAdmin();
  const { jobId } = await params;

  const [job] = await db
    .select({
      id: jobs.id,
      type: jobs.type,
      status: jobs.status,
      scheduledDate: jobs.scheduledDate,
      scheduledStartTime: jobs.scheduledStartTime,
      estimatedDurationMinutes: jobs.estimatedDurationMinutes,
      priceCents: jobs.priceCents,
      completionNotes: jobs.completionNotes,
      customerId: jobs.customerId,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerEmail: customers.email,
      customerPhone: customers.phone,
      customerNotes: customers.generalNotes,
      addressLine1: customers.addressLine1,
      city: customers.city,
      state: customers.state,
      zip: customers.zip,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(and(eq(jobs.id, jobId), eq(jobs.companyId, admin.companyId)))
    .limit(1);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const assignments = await db
    .select()
    .from(jobAssignments)
    .where(eq(jobAssignments.jobId, jobId));

  const entries = await db
    .select({ id: timeEntries.id, userId: timeEntries.userId, firstName: users.firstName, lastName: users.lastName, clockIn: timeEntries.clockIn, clockOut: timeEntries.clockOut, minutesWorked: timeEntries.minutesWorked, recordedByAdmin: timeEntries.recordedByAdmin, notes: timeEntries.notes })
    .from(timeEntries)
    .innerJoin(users, eq(timeEntries.userId, users.id))
    .where(eq(timeEntries.jobId, jobId));

  const entryIds = entries.map((entry) => entry.id);
  const timeEntryAuditLogs = entryIds.length === 0 ? [] : await db
    .select({
      id: auditLog.id,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      action: auditLog.action,
      before: auditLog.before,
      after: auditLog.after,
      createdAt: auditLog.createdAt,
      editorFirstName: users.firstName,
      editorLastName: users.lastName,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(and(eq(auditLog.companyId, admin.companyId), eq(auditLog.entityType, "time_entry"), inArray(auditLog.entityId, entryIds)))
    .orderBy(desc(auditLog.createdAt));

  const jobAuditLogs = await db
    .select({
      id: auditLog.id,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      action: auditLog.action,
      before: auditLog.before,
      after: auditLog.after,
      createdAt: auditLog.createdAt,
      editorFirstName: users.firstName,
      editorLastName: users.lastName,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(and(eq(auditLog.companyId, admin.companyId), eq(auditLog.entityType, "job"), eq(auditLog.entityId, jobId)))
    .orderBy(desc(auditLog.createdAt));

  return NextResponse.json({ job, assignments, timeEntries: entries, timeEntryAuditLogs, jobAuditLogs });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const admin = await requireAdmin();
  const { jobId } = await params;
  const body = await req.json();
  const parsed = updateJobSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: jobs.id, type: jobs.type, status: jobs.status, customerId: jobs.customerId, scheduledDate: jobs.scheduledDate, scheduledStartTime: jobs.scheduledStartTime, priceCents: jobs.priceCents, completionNotes: jobs.completionNotes })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.companyId, admin.companyId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const { employeeIds, ...jobFields } = parsed.data;
  const currentAssignments = await db
    .select({ userId: jobAssignments.userId, role: jobAssignments.role })
    .from(jobAssignments)
    .where(eq(jobAssignments.jobId, jobId));
  const beforeAssignments = employeeIds ? currentAssignments : [];
  const effectiveEmployeeIds = employeeIds ?? currentAssignments.map((assignment) => assignment.userId);

  if (employeeIds && employeeIds.length > 0) {
    const validUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, employeeIds), eq(users.companyId, admin.companyId)));
    if (validUsers.length !== employeeIds.length) {
      return NextResponse.json({ error: "One or more assigned employees were not found" }, { status: 400 });
    }
  }

  if (effectiveEmployeeIds.length > 0 && (employeeIds || jobFields.scheduledDate || jobFields.scheduledStartTime)) {
    const conflicts = await findPtoConflicts({
      companyId: admin.companyId,
      employeeIds: effectiveEmployeeIds,
      scheduledDate: jobFields.scheduledDate ?? existing.scheduledDate,
      scheduledStartTime: jobFields.scheduledStartTime ?? existing.scheduledStartTime,
    });
    if (conflicts.length > 0) {
      return NextResponse.json({ error: ptoConflictMessage(conflicts), conflicts }, { status: 409 });
    }
  }

  if (Object.keys(jobFields).length > 0) {
    try {
      await db.update(jobs).set(jobFields).where(eq(jobs.id, jobId));
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && err.code === "23505") {
        return NextResponse.json({ error: "This recurring series already has a job scheduled on that date." }, { status: 409 });
      }
      throw err;
    }
    await db.insert(auditLog).values({
      companyId: admin.companyId,
      userId: admin.id,
      action: "job.updated",
      entityType: "job",
      entityId: jobId,
      before: { status: existing.status, scheduledDate: existing.scheduledDate, scheduledStartTime: existing.scheduledStartTime, priceCents: existing.priceCents, completionNotes: existing.completionNotes },
      after: jobFields,
    });
  }

  // PLAN.md §6: "Job completed (first_clean)" -> tag first-clean-done, which
  // triggers the GHL post-clean workflow (recurring pitch + review ask).
  if (jobFields.status === "completed" && existing.status !== "completed" && existing.type === "first_clean") {
    await syncToGhl(admin.companyId, { type: "first_clean.completed", customerId: existing.customerId });
  }

  if (employeeIds) {
    await db.delete(jobAssignments).where(eq(jobAssignments.jobId, jobId));
    if (employeeIds.length > 0) {
      await db.insert(jobAssignments).values(
        employeeIds.map((userId, i) => ({
          jobId,
          userId,
          role: i === 0 ? ("lead" as const) : ("helper" as const),
        }))
      );
    }
    await db.insert(auditLog).values({
      companyId: admin.companyId,
      userId: admin.id,
      action: "job.assignments_updated",
      entityType: "job",
      entityId: jobId,
      before: beforeAssignments,
      after: employeeIds,
    });
  }

  return NextResponse.json({ ok: true });
}
