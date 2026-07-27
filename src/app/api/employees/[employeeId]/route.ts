import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, customers, users, jobs, jobAssignments, timeEntries, payrollLines, payrollPeriods, serviceLocations } from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPayTiers, getPayTierBrackets } from "@/lib/payroll/calculate";

const updateEmployeeSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  contactEmail: z.string().trim().optional(),
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
  serviceLocationId: z.string().uuid().optional().nullable(),
});

const passwordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters."),
  confirmPassword: z.string().min(8, "Please confirm the password."),
}).refine((value) => value.password === value.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

/** GET /api/employees/[employeeId] — full profile plus lifetime stats (jobs
 * completed, hours worked, and this-month's payroll total). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const admin = await requireAdmin();
  const { employeeId } = await params;

  const [employeeRow] = await db
    .select({ employee: users, serviceLocationName: serviceLocations.name })
    .from(users)
    .leftJoin(serviceLocations, eq(users.serviceLocationId, serviceLocations.id))
    .where(and(eq(users.id, employeeId), eq(users.companyId, admin.companyId)))
    .limit(1);

  if (!employeeRow) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const employee = { ...employeeRow.employee, serviceLocationName: employeeRow.serviceLocationName };
  if (employee.profilePhotoUrl) {
    const { data } = await createAdminClient().storage.from("employee-photos").createSignedUrl(employee.profilePhotoUrl, 60 * 60);
    employee.profilePhotoUrl = data?.signedUrl ?? null;
  }

  const [jobsCompletedResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
    .where(and(eq(jobAssignments.userId, employeeId), eq(jobs.status, "completed")));

  const completionRows = await db
    .select({ status: jobs.status, count: sql<number>`count(*)` })
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
    .where(and(eq(jobAssignments.userId, employeeId), inArray(jobs.status, ["completed", "cancelled", "no_show"])))
    .groupBy(jobs.status);
  const completionCounts = Object.fromEntries(completionRows.map((row) => [row.status, Number(row.count)]));
  const completionTotal = (completionCounts.completed ?? 0) + (completionCounts.cancelled ?? 0) + (completionCounts.no_show ?? 0);
  const completionRate = completionTotal > 0 ? (completionCounts.completed ?? 0) / completionTotal : null;

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

  const companyCompletedCounts = await db
    .select({ userId: jobAssignments.userId, count: sql<number>`count(*)` })
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
    .innerJoin(users, eq(jobAssignments.userId, users.id))
    .where(and(eq(users.companyId, admin.companyId), eq(users.isActive, true), eq(jobs.status, "completed")))
    .groupBy(jobAssignments.userId)
    .orderBy(desc(sql`count(*)`));
  const teamSize = companyCompletedCounts.length;
  const rankIndex = companyCompletedCounts.findIndex((row) => row.userId === employeeId);
  const teamRank = rankIndex === -1 ? null : rankIndex + 1;

  const weekStart = new Date();
  const day = weekStart.getUTCDay();
  weekStart.setUTCDate(weekStart.getUTCDate() + (day === 0 ? -6 : 1 - day));
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekStartISO = weekStart.toISOString().slice(0, 10);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const weekEndISO = weekEnd.toISOString().slice(0, 10);

  const weekJobs = await db
    .select({ scheduledDate: jobs.scheduledDate, count: sql<number>`count(*)` })
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
    .where(and(
      eq(jobAssignments.userId, employeeId),
      inArray(jobs.status, ["scheduled", "in_progress", "completed"]),
      sql`${jobs.scheduledDate} >= ${weekStartISO}::date`,
      sql`${jobs.scheduledDate} <= ${weekEndISO}::date`,
    ))
    .groupBy(jobs.scheduledDate);
  const jobCountByDate = new Map(weekJobs.map((row) => [row.scheduledDate, Number(row.count)]));
  const weeklySchedule = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setUTCDate(date.getUTCDate() + i);
    const iso = date.toISOString().slice(0, 10);
    return { date: iso, jobCount: jobCountByDate.get(iso) ?? 0 };
  });

  return NextResponse.json({
    employee,
    stats: {
      jobsCompleted: jobsCompletedResult?.count ?? 0,
      hoursWorked: Math.round(hoursWorked * 100) / 100,
      thisMonthPayCents: thisMonthPay?.total ?? 0,
      completionRate,
      teamRank,
      teamSize,
    },
    upcomingJobs,
    recentJobs,
    recentTimeEntries,
    payTierBrackets,
    weeklySchedule,
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

  if (fields.serviceLocationId) {
    const [location] = await db
      .select({ id: serviceLocations.id })
      .from(serviceLocations)
      .where(and(eq(serviceLocations.id, fields.serviceLocationId as string), eq(serviceLocations.companyId, admin.companyId)))
      .limit(1);
    if (!location) {
      return NextResponse.json({ error: "That service location was not found for this company." }, { status: 400 });
    }
  }

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

    const action =
      Object.keys(fields).length === 1 && fields.isActive === false
        ? "employee.archived"
        : Object.keys(fields).length === 1 && fields.isActive === true
          ? "employee.restored"
          : "employee.updated";

    await db.insert(auditLog).values({
      companyId: admin.companyId,
      userId: admin.id,
      action,
      entityType: "employee",
      entityId: employeeId,
      before: JSON.parse(JSON.stringify(existing)),
      after: JSON.parse(JSON.stringify({ ...existing, ...fields })),
    });
  }

  return NextResponse.json({ ok: true });
}

/** POST /api/employees/[employeeId]/password â€” lets an admin set a new password
 * for any user in their company (employee or admin), without ever returning or
 * recording the password itself. This is CleanOps's only account-recovery path:
 * login emails are synthetic (`<username>@cleanops.local`, see
 * src/lib/auth/username.ts) with no SMTP configured, so a self-service
 * "email me a reset link" flow can't deliver mail. Admin accounts have no
 * profile page of their own; the Settings â†’ Administrators panel drives this
 * endpoint directly for those. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const admin = await requireAdmin();
  const { employeeId } = await params;
  const parsed = passwordSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid password." }, { status: 400 });
  }

  const [employee] = await db
    .select({ id: users.id, role: users.role, companyId: users.companyId })
    .from(users)
    .where(and(eq(users.id, employeeId), eq(users.companyId, admin.companyId)))
    .limit(1);

  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const { error } = await createAdminClient().auth.admin.updateUserById(employeeId, {
    password: parsed.data.password,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await db.insert(auditLog).values({
    companyId: admin.companyId,
    userId: admin.id,
    action: "employee.password_changed",
    entityType: "employee",
    entityId: employeeId,
    before: null,
    after: { method: "admin_set_password" },
  });

  return NextResponse.json({ ok: true });
}

/** DELETE /api/employees/[employeeId] â€” permanently removes only an
 * employee with no operational or audit history. Historical employees should
 * be archived with PATCH { isActive: false } instead. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const admin = await requireAdmin();
  const { employeeId } = await params;

  const [employee] = await db
    .select({ id: users.id, role: users.role, companyId: users.companyId })
    .from(users)
    .where(and(eq(users.id, employeeId), eq(users.companyId, admin.companyId)))
    .limit(1);

  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  if (employee.role !== "employee") return NextResponse.json({ error: "Only employees can be deleted here." }, { status: 400 });
  if (employee.id === admin.id) return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });

  const [assignmentCount, timeEntryCount, payrollLineCount, auditCount, preferredCleanerCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(jobAssignments).where(eq(jobAssignments.userId, employeeId)),
    db.select({ count: sql<number>`count(*)` }).from(timeEntries).where(eq(timeEntries.userId, employeeId)),
    db.select({ count: sql<number>`count(*)` }).from(payrollLines).where(eq(payrollLines.userId, employeeId)),
    db.select({ count: sql<number>`count(*)` }).from(auditLog).where(eq(auditLog.userId, employeeId)),
    db.select({ count: sql<number>`count(*)` }).from(customers).where(eq(customers.preferredCleanerId, employeeId)),
  ]);

  const linkedRecords = {
    jobAssignments: Number(assignmentCount[0]?.count ?? 0),
    timeEntries: Number(timeEntryCount[0]?.count ?? 0),
    payrollLines: Number(payrollLineCount[0]?.count ?? 0),
    auditEntries: Number(auditCount[0]?.count ?? 0),
    preferredByCustomers: Number(preferredCleanerCount[0]?.count ?? 0),
  };

  if (Object.values(linkedRecords).some((count) => count > 0)) {
    return NextResponse.json(
      { error: "This employee has history in CleanOps. Archive the employee instead of permanently deleting them.", linkedRecords },
      { status: 409 }
    );
  }

  await db.delete(users).where(eq(users.id, employeeId));
  const { error } = await createAdminClient().auth.admin.deleteUser(employeeId);
  if (error) {
    return NextResponse.json({ error: `Profile deleted, but auth cleanup failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
