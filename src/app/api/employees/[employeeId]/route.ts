import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, customers, users, jobs, jobAssignments, timeEntries, payrollLines, payrollPeriods } from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { buildPayTiers, getPayTierBrackets } from "@/lib/payroll/calculate";

const updateEmployeeSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().optional(),
  title: z.string().trim().optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  hiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  payType: z.enum(["commission_jth", "office_hourly"]).optional(),
  hourlyRateCents: z.number().int().nonnegative().optional(),
  // One rate per this company's configured pay-tier bracket (Settings →
  // Payroll Tiers) — length varies per company, validated against the
  // company's actual bracket count below. commission_jth employees only.
  tierRatesCents: z.array(z.number().int().nonnegative()).min(1).optional(),
  gustoEmployeeId: z.string().trim().optional(),
  isActive: z.boolean().optional(),
});

/** GET /api/employees/[employeeId] — full profile plus lifetime stats (jobs
 * completed, hours worked, and this-month's payroll total). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const admin = await requireAdmin();
  const { employeeId } = await params;

  const [employee] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, employeeId), eq(users.companyId, admin.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const [jobsCompletedResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
    .where(and(eq(jobAssignments.userId, employeeId), eq(jobs.status, "completed")));

  let hoursWorked = 0;
  if (employee.payType === "commission_jth") {
    const [row] = await db
      .select({ totalMinutes: sql<number>`coalesce(sum(${jobs.estimatedDurationMinutes}), 0)` })
      .from(jobAssignments)
      .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
      .where(and(eq(jobAssignments.userId, employeeId), eq(jobs.status, "completed")));
    hoursWorked = (row?.totalMinutes ?? 0) / 60;
  } else {
    const [row] = await db
      .select({ totalMinutes: sql<number>`coalesce(sum(${timeEntries.minutesWorked}), 0)` })
      .from(timeEntries)
      .where(eq(timeEntries.userId, employeeId));
    hoursWorked = (row?.totalMinutes ?? 0) / 60;
  }

  const now = new Date();
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const [thisMonthPay] = await db
    .select({ total: sql<number>`coalesce(sum(${payrollLines.finalCents}), 0)` })
    .from(payrollLines)
    .innerJoin(payrollPeriods, eq(payrollLines.payrollPeriodId, payrollPeriods.id))
    .where(and(eq(payrollLines.userId, employeeId), sql`${payrollPeriods.startDate} >= ${monthStart}::date`));

  const upcomingJobs = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      type: jobs.type,
      scheduledDate: jobs.scheduledDate,
      scheduledStartTime: jobs.scheduledStartTime,
      estimatedDurationMinutes: jobs.estimatedDurationMinutes,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      addressLine1: customers.addressLine1,
      city: customers.city,
      state: customers.state,
    })
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(and(eq(jobAssignments.userId, employeeId), inArray(jobs.status, ["scheduled", "in_progress"])))
    .orderBy(jobs.scheduledDate, jobs.scheduledStartTime)
    .limit(6);

  const recentJobs = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      type: jobs.type,
      scheduledDate: jobs.scheduledDate,
      scheduledStartTime: jobs.scheduledStartTime,
      completedAt: jobs.completedAt,
      estimatedDurationMinutes: jobs.estimatedDurationMinutes,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      addressLine1: customers.addressLine1,
      city: customers.city,
      state: customers.state,
    })
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(and(eq(jobAssignments.userId, employeeId), inArray(jobs.status, ["completed", "cancelled", "no_show"])))
    .orderBy(desc(jobs.completedAt), desc(jobs.scheduledDate))
    .limit(6);

  const recentTimeEntries = await db
    .select({
      id: timeEntries.id,
      jobId: timeEntries.jobId,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
      minutesWorked: timeEntries.minutesWorked,
      editedByAdmin: timeEntries.editedByAdmin,
      recordedByAdmin: timeEntries.recordedByAdmin,
      notes: timeEntries.notes,
      scheduledDate: jobs.scheduledDate,
      type: jobs.type,
      status: jobs.status,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
    })
    .from(timeEntries)
    .innerJoin(jobs, eq(timeEntries.jobId, jobs.id))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(eq(timeEntries.userId, employeeId))
    .orderBy(desc(timeEntries.clockIn))
    .limit(8);

  const payTierBrackets = await getPayTierBrackets(admin.companyId);

  return NextResponse.json({
    employee,
    stats: {
      jobsCompleted: jobsCompletedResult?.count ?? 0,
      hoursWorked: Math.round(hoursWorked * 100) / 100,
      thisMonthPayCents: thisMonthPay?.total ?? 0,
    },
    upcomingJobs,
    recentJobs,
    recentTimeEntries,
    payTierBrackets,
  });
}

/** PATCH /api/employees/[employeeId] — update profile/pay fields, or deactivate. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const admin = await requireAdmin();
  const { employeeId } = await params;
  const body = await req.json();
  const parsed = updateEmployeeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, employeeId), eq(users.companyId, admin.companyId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const { tierRatesCents, ...rest } = parsed.data;
  const fields: Record<string, unknown> = { ...rest };
  if (tierRatesCents) {
    const brackets = await getPayTierBrackets(admin.companyId);
    if (tierRatesCents.length !== brackets.length) {
      return NextResponse.json(
        { error: `Expected ${brackets.length} tier rate(s) for this company's pay-tier brackets, got ${tierRatesCents.length}.` },
        { status: 400 }
      );
    }
    fields.payTiers = buildPayTiers(brackets, tierRatesCents);
  }

  if (Object.keys(fields).length > 0) {
    await db.update(users).set(fields).where(eq(users.id, employeeId));

    await db.insert(auditLog).values({
      companyId: admin.companyId,
      userId: admin.id,
      action: "employee.updated",
      entityType: "employee",
      entityId: employeeId,
      before: JSON.parse(JSON.stringify(existing)),
      after: JSON.parse(JSON.stringify({ ...existing, ...fields })),
    });
  }

  return NextResponse.json({ ok: true });
}
