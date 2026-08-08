import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, jobs, customers, jobAssignments, users, services } from "@/db/schema";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { findPtoConflicts, ptoConflictMessage } from "@/lib/scheduling/pto";
import { resolveJobTicketMinutes } from "@/lib/payroll/job-ticket-hours";

const createJobSchema = z.object({
  customerId: z.string().uuid(),
  type: z.enum(["first_clean", "recurring", "one_time", "deep_clean", "move_out"]),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduledStartTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  estimatedDurationMinutes: z.number().int().positive().optional(),
  priceCents: z.number().int().nonnegative(),
  employeeIds: z.array(z.string().uuid()).optional(),
  trainerId: z.string().uuid().nullable().optional(),
  // A custom "main" service-catalog preset the job was created from, and any
  // "add_on" presets selected alongside it. Both optional — a job can still
  // just use one of the four built-in types with no catalog preset at all.
  serviceId: z.string().uuid().optional(),
  addOnIds: z.array(z.string().uuid()).optional(),
});

/** GET /api/jobs?start=YYYY-MM-DD&end=YYYY-MM-DD — jobs for the calendar view. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json({ error: "start and end query params are required" }, { status: 400 });
  }

  const rows = await db
    .select({
      id: jobs.id,
      type: jobs.type,
      status: jobs.status,
      scheduledDate: jobs.scheduledDate,
      scheduledStartTime: jobs.scheduledStartTime,
      priceCents: jobs.priceCents,
      customerId: jobs.customerId,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(and(eq(jobs.companyId, admin.companyId), gte(jobs.scheduledDate, start), lte(jobs.scheduledDate, end)))
    .orderBy(jobs.scheduledDate, jobs.scheduledStartTime);

  const jobIds = rows.map((r) => r.id);
  const assignments = jobIds.length
    ? await db
        .select({
          jobId: jobAssignments.jobId,
          userId: jobAssignments.userId,
          firstName: users.firstName,
          lastName: users.lastName,
          role: jobAssignments.role,
        })
        .from(jobAssignments)
        .innerJoin(users, eq(jobAssignments.userId, users.id))
        .where(inArray(jobAssignments.jobId, jobIds))
    : [];

  const assignmentsByJob = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const list = assignmentsByJob.get(a.jobId) ?? [];
    list.push(a);
    assignmentsByJob.set(a.jobId, list);
  }

  const result = rows.map((r) => ({
    ...r,
    assignments: assignmentsByJob.get(r.id) ?? [],
  }));

  return NextResponse.json({ jobs: result });
}

/** POST /api/jobs — create a one-off (non-recurring) job. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json();
  const parsed = createJobSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  if (data.trainerId && !data.employeeIds?.includes(data.trainerId)) {
    return NextResponse.json({ error: "Trainer must be one of the assigned employees." }, { status: 400 });
  }

  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, data.customerId), eq(customers.companyId, admin.companyId)))
    .limit(1);

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  if (data.serviceId || data.addOnIds?.length) {
    const catalogIds = [...(data.serviceId ? [data.serviceId] : []), ...(data.addOnIds ?? [])];
    const catalogRows = await db
      .select({ id: services.id, category: services.category })
      .from(services)
      .where(and(inArray(services.id, catalogIds), eq(services.companyId, admin.companyId)));
    const catalogById = new Map(catalogRows.map((row) => [row.id, row]));

    if (data.serviceId && catalogById.get(data.serviceId)?.category !== "main") {
      return NextResponse.json({ error: "Service preset not found" }, { status: 400 });
    }
    if (data.addOnIds?.some((id) => catalogById.get(id)?.category !== "add_on")) {
      return NextResponse.json({ error: "One or more add-ons were not found" }, { status: 400 });
    }
  }

  if (data.employeeIds && data.employeeIds.length > 0) {
    const validUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, data.employeeIds), eq(users.companyId, admin.companyId)));
    if (validUsers.length !== data.employeeIds.length) {
      return NextResponse.json({ error: "One or more assigned employees were not found" }, { status: 400 });
    }

    const conflicts = await findPtoConflicts({
      companyId: admin.companyId,
      employeeIds: data.employeeIds,
      scheduledDate: data.scheduledDate,
      scheduledStartTime: data.scheduledStartTime ?? "09:00:00",
    });
    if (conflicts.length > 0) {
      return NextResponse.json({ error: ptoConflictMessage(conflicts), conflicts }, { status: 409 });
    }
  }

  // JTH is explicit job data. Keep a safe legacy fallback for callers that do
  // not provide a duration; payroll never derives it from ZIP or quote data.
  const estimatedDurationMinutes =
    data.estimatedDurationMinutes ??
    (await resolveJobTicketMinutes({
      companyId: admin.companyId,
      priceCents: data.priceCents,
      customerId: data.customerId,
    })) ??
    120;

  const [job] = await db
    .insert(jobs)
    .values({
      companyId: admin.companyId,
      customerId: data.customerId,
      type: data.type,
      status: "scheduled",
      scheduledDate: data.scheduledDate,
      scheduledStartTime: data.scheduledStartTime ?? "09:00:00",
      estimatedDurationMinutes,
      priceCents: data.priceCents,
      serviceId: data.serviceId,
      addOnIds: data.addOnIds ?? [],
    })
    .returning();

  if (data.employeeIds && data.employeeIds.length > 0) {
    await db.insert(jobAssignments).values(
      data.employeeIds.map((userId, i) => ({
        jobId: job.id,
        userId,
        role: i === 0 ? ("lead" as const) : userId === data.trainerId ? ("trainer" as const) : ("helper" as const),
      }))
    );
  }

  await db.insert(auditLog).values({
    companyId: admin.companyId,
    userId: admin.id,
    action: "job.created",
    entityType: "job",
    entityId: job.id,
    before: null,
    after: { customerId: data.customerId, type: data.type, scheduledDate: data.scheduledDate, employeeIds: data.employeeIds ?? [] },
  });

  return NextResponse.json({ job }, { status: 201 });
}
