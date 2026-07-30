import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, jobPaymentMethodEnum, jobs, jobAssignments, users } from "@/db/schema";
import { and, eq, inArray, ne } from "drizzle-orm";
import { syncToGhl } from "@/lib/ghl/sync";
import { loadJobDetail } from "@/lib/jobs/job-detail";
import { findPtoConflicts, ptoConflictMessage } from "@/lib/scheduling/pto";
import { resolveJobTicketMinutes } from "@/lib/payroll/job-ticket-hours";

const updateJobSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scheduledStartTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  priceCents: z.number().int().nonnegative().optional(),
  estimatedDurationMinutes: z.number().int().min(15).max(600).optional(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled", "no_show"]).optional(),
  cancellationReason: z.string().trim().min(1).max(1000).optional(),
  employeeIds: z.array(z.string().uuid()).optional(),
  completionNotes: z.string().optional(),
  paymentMethodCollected: z.enum(jobPaymentMethodEnum).nullable().optional(),
  cleanerNotes: z.string().optional(),
});

/** Shared with the `/jobs/[jobId]` server component via `loadJobDetail` — the
 * calendar's job panel still fetches this endpoint, so the two must not drift. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const admin = await requireAdmin();
  const { jobId } = await params;

  const detail = await loadJobDetail(jobId, admin.companyId);

  if (!detail) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
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
    .select({ id: jobs.id, type: jobs.type, status: jobs.status, customerId: jobs.customerId, quoteId: jobs.quoteId, scheduledDate: jobs.scheduledDate, scheduledStartTime: jobs.scheduledStartTime, estimatedDurationMinutes: jobs.estimatedDurationMinutes, priceCents: jobs.priceCents, completionNotes: jobs.completionNotes, paymentMethodCollected: jobs.paymentMethodCollected, cleanerNotes: jobs.cleanerNotes, cancellationReason: jobs.cancellationReason })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.companyId, admin.companyId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const { employeeIds, ...jobFields } = parsed.data;
  if (jobFields.status === "cancelled" && existing.status !== "cancelled" && !jobFields.cancellationReason) {
    return NextResponse.json({ error: "Enter a cancellation reason before cancelling this job." }, { status: 400 });
  }
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

  // A price edit re-derives Job Ticket Hours (amount due ÷ the customer's
  // branch rate) so duration stays accurate to what's actually being charged.
  // Skipped whenever the caller sets estimatedDurationMinutes itself in the
  // same request — the calendar's resize handle is a deliberate manual
  // override and must not be clobbered by this.
  if (jobFields.priceCents !== undefined && jobFields.estimatedDurationMinutes === undefined) {
    const resolvedMinutes = await resolveJobTicketMinutes({
      companyId: admin.companyId,
      priceCents: jobFields.priceCents,
      quoteId: existing.quoteId,
      customerId: existing.customerId,
    });
    if (resolvedMinutes != null) jobFields.estimatedDurationMinutes = resolvedMinutes;
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
      before: { status: existing.status, scheduledDate: existing.scheduledDate, scheduledStartTime: existing.scheduledStartTime, priceCents: existing.priceCents, completionNotes: existing.completionNotes, paymentMethodCollected: existing.paymentMethodCollected, cleanerNotes: existing.cleanerNotes, cancellationReason: existing.cancellationReason },
      after: jobFields,
    });
  }

  // PLAN.md §6: "Job completed (first_clean)" -> tag first-clean-done, which
  // triggers the GHL post-clean workflow (recurring pitch + review ask).
  if (jobFields.status === "completed" && existing.status !== "completed" && existing.type === "first_clean") {
    await syncToGhl(admin.companyId, { type: "first_clean.completed", customerId: existing.customerId });
  }

  if (employeeIds) {
    await db.transaction(async (tx) => {
      await tx.delete(jobAssignments).where(eq(jobAssignments.jobId, jobId));
      if (employeeIds.length > 0) {
        await tx.insert(jobAssignments).values(
          employeeIds.map((userId, i) => ({
            jobId,
            userId,
            role: i === 0 ? ("lead" as const) : ("helper" as const),
          }))
        );
      }
      await tx.insert(auditLog).values({
        companyId: admin.companyId,
        userId: admin.id,
        action: "job.assignments_updated",
        entityType: "job",
        entityId: jobId,
        before: beforeAssignments,
        after: employeeIds,
      });
    });
  }

  const scheduledDate = jobFields.scheduledDate ?? existing.scheduledDate;
  const scheduledStartTime = jobFields.scheduledStartTime ?? existing.scheduledStartTime;
  const warnings: string[] = [];
  if (effectiveEmployeeIds.length > 0 && (employeeIds || jobFields.scheduledDate || jobFields.scheduledStartTime || jobFields.estimatedDurationMinutes)) {
    const overlappingJobs = await db
      .select({
        userId: jobAssignments.userId,
        firstName: users.firstName,
        lastName: users.lastName,
        scheduledStartTime: jobs.scheduledStartTime,
        estimatedDurationMinutes: jobs.estimatedDurationMinutes,
      })
      .from(jobAssignments)
      .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
      .innerJoin(users, eq(jobAssignments.userId, users.id))
      .where(and(
        eq(jobs.companyId, admin.companyId),
        inArray(jobAssignments.userId, effectiveEmployeeIds),
        eq(jobs.scheduledDate, scheduledDate),
        inArray(jobs.status, ["scheduled", "in_progress"]),
        ne(jobs.id, jobId),
      ));
    const duration = jobFields.estimatedDurationMinutes ?? existing.estimatedDurationMinutes ?? 75;
    const overlappingEmployees = new Set<string>();
    for (const other of overlappingJobs) {
      const targetStart = scheduledStartTime ? Number(scheduledStartTime.slice(0, 2)) * 60 + Number(scheduledStartTime.slice(3, 5)) : 9 * 60;
      const otherStart = other.scheduledStartTime ? Number(other.scheduledStartTime.slice(0, 2)) * 60 + Number(other.scheduledStartTime.slice(3, 5)) : 9 * 60;
      const otherDuration = other.estimatedDurationMinutes ?? 75;
      if (targetStart < otherStart + otherDuration && otherStart < targetStart + duration) {
        overlappingEmployees.add(`${other.firstName} ${other.lastName}`);
      }
    }
    if (overlappingEmployees.size) warnings.push(`${[...overlappingEmployees].join(", ")} ${overlappingEmployees.size === 1 ? "has" : "have"} another job at this time.`);
  }

  return NextResponse.json({ ok: true, warnings });
}
