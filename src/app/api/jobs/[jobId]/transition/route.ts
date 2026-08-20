import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull, ne } from "drizzle-orm";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, companies, customers, jobAssignments, jobs, timeEntries } from "@/db/schema";
import { generatePayrollForPeriod } from "@/lib/payroll/calculate";
import { refreshPayrollPeriodsForDates } from "@/lib/payroll/periods";
import { notifyAdmins } from "@/lib/notifications/create";
import { deriveJobState, type StopInput } from "@/lib/my-day/workday-state";
import { todayInTimeZone } from "@/lib/dashboard/range";

// The single idempotent endpoint that records every workday transition. See
// "01_Projects/ServiceSpark/Research/Workday Ledger/02 State Model.md" §4-§5
// and "WP-A State Authority.md" §8.2 (both binding) for the contract this
// implements. Recorded time (time_entries) still only ever starts on the
// "traveling" transition — travelStartedAt and the time_entries row are
// written in the same transaction so they can never disagree (Invariant 1).

const transitionSchema = z.object({
  to: z.enum(["traveling", "arrived", "working"]),
  clientRequestId: z.string().uuid(),
});

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const user = await requireUser();
  const { jobId } = await params;

  const rawBody = await req.json().catch(() => ({}));
  const parsed = transitionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { to } = parsed.data;

  const [assignment] = await db
    .select()
    .from(jobAssignments)
    .where(and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.userId, user.id)))
    .limit(1);

  if (!assignment) {
    return NextResponse.json({ error: "Not assigned to this job" }, { status: 403 });
  }

  const [job] = await db
    .select({
      status: jobs.status,
      scheduledDate: jobs.scheduledDate,
      completedAt: jobs.completedAt,
      customerId: jobs.customerId,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      companyTimezone: companies.timezone,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.id, jobId))
    .limit(1);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const [openEntry] = await db
    .select({ clockIn: timeEntries.clockIn })
    .from(timeEntries)
    .where(and(eq(timeEntries.jobId, jobId), eq(timeEntries.userId, user.id), isNull(timeEntries.clockOut)))
    .limit(1);

  /** The persisted snapshot as of the top of this request — used for the
   * idempotent/out-of-order responses, which never mutate anything. */
  function baseState() {
    return {
      travelStartedAt: isoOrNull(assignment.travelStartedAt),
      arrivedAt: isoOrNull(assignment.arrivedAt),
      workStartedAt: isoOrNull(assignment.workStartedAt),
      clockIn: openEntry ? openEntry.clockIn.toISOString() : null,
      jobStatus: job.status,
    };
  }

  /** Reuses the same derivation My Day and job execution both call, so a 409
   * here never disagrees with what the UI would show. */
  function currentStateOf() {
    const stopInput: StopInput = {
      jobId,
      customerFirstName: job.customerFirstName,
      customerLastName: job.customerLastName,
      scheduledDate: job.scheduledDate,
      scheduledStartTime: null,
      status: job.status,
      completedAt: isoOrNull(job.completedAt),
      travelStartedAt: isoOrNull(assignment.travelStartedAt),
      arrivedAt: isoOrNull(assignment.arrivedAt),
      workStartedAt: isoOrNull(assignment.workStartedAt),
      myOpenEntry: openEntry ? { clockIn: openEntry.clockIn.toISOString() } : null,
      myClosedEntry: null,
      coworkers: [],
    };
    return deriveJobState(stopInput, todayInTimeZone(new Date(), job.companyTimezone));
  }

  // Idempotent — the target timestamp is already set. Never 400.
  if (
    (to === "traveling" && assignment.travelStartedAt) ||
    (to === "arrived" && assignment.arrivedAt) ||
    (to === "working" && assignment.workStartedAt)
  ) {
    return NextResponse.json({ idempotent: true, state: currentStateOf(), ...baseState() });
  }

  // Out of order.
  if (to === "arrived" && !assignment.travelStartedAt) {
    return NextResponse.json(
      { error: "Travel hasn't started for this stop yet", currentState: currentStateOf() },
      { status: 409 }
    );
  }
  if (to === "working" && !assignment.arrivedAt) {
    return NextResponse.json(
      { error: "Arrival hasn't been recorded for this stop yet", currentState: currentStateOf() },
      { status: 409 }
    );
  }

  const now = new Date();

  if (to === "traveling") {
    const outcome = await db.transaction(async (tx) => {
      // Invariant 3: at most one open entry across all jobs for this employee.
      const [otherOpen] = await tx
        .select({ jobId: timeEntries.jobId, clockIn: timeEntries.clockIn })
        .from(timeEntries)
        .where(and(eq(timeEntries.userId, user.id), isNull(timeEntries.clockOut), ne(timeEntries.jobId, jobId)))
        .orderBy(timeEntries.clockIn)
        .limit(1);

      if (otherOpen) {
        const [otherJob] = await tx
          .select({ customerFirstName: customers.firstName, customerLastName: customers.lastName })
          .from(jobs)
          .innerJoin(customers, eq(jobs.customerId, customers.id))
          .where(eq(jobs.id, otherOpen.jobId))
          .limit(1);
        return {
          ok: false as const,
          openJobId: otherOpen.jobId,
          otherName: otherJob ? `${otherJob.customerFirstName} ${otherJob.customerLastName}` : "another job",
        };
      }

      // Invariant 1: travelStartedAt and the time_entries row share one
      // transaction and one timestamp.
      await tx.update(jobAssignments).set({ travelStartedAt: now }).where(eq(jobAssignments.id, assignment.id));
      await tx.insert(timeEntries).values({ jobId, userId: user.id, clockIn: now });
      await tx.update(jobs).set({ status: "in_progress" }).where(eq(jobs.id, jobId));
      return { ok: true as const };
    });

    if (!outcome.ok) {
      return NextResponse.json(
        { error: `You're still recording time at ${outcome.otherName}. Wrap that up first.`, openJobId: outcome.openJobId },
        { status: 409 }
      );
    }

    await db.insert(auditLog).values({
      companyId: user.companyId,
      userId: user.id,
      action: "job.travel_started",
      entityType: "job",
      entityId: jobId,
      before: null,
      after: { travelStartedAt: now.toISOString() },
    });

    // Same side effects the clock-in route ran on this transition previously
    // — moved here, not dropped: keep the open payroll period's line in sync
    // the moment travel starts, and tell admins she's on the way.
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

    return NextResponse.json({
      travelStartedAt: now.toISOString(),
      arrivedAt: null,
      workStartedAt: null,
      clockIn: now.toISOString(),
      jobStatus: "in_progress",
    });
  }

  if (to === "arrived") {
    await db.update(jobAssignments).set({ arrivedAt: now }).where(eq(jobAssignments.id, assignment.id));
    await db.insert(auditLog).values({
      companyId: user.companyId,
      userId: user.id,
      action: "job.arrived",
      entityType: "job",
      entityId: jobId,
      before: null,
      after: { arrivedAt: now.toISOString() },
    });
    return NextResponse.json({ ...baseState(), arrivedAt: now.toISOString() });
  }

  // to === "working"
  await db.update(jobAssignments).set({ workStartedAt: now }).where(eq(jobAssignments.id, assignment.id));
  await db.insert(auditLog).values({
    companyId: user.companyId,
    userId: user.id,
    action: "job.work_started",
    entityType: "job",
    entityId: jobId,
    before: null,
    after: { workStartedAt: now.toISOString() },
  });
  return NextResponse.json({ ...baseState(), workStartedAt: now.toISOString() });
}
