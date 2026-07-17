import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, jobs, customers, jobAssignments, users } from "@/db/schema";
import { and, eq, gte, lte, inArray } from "drizzle-orm";

const createJobSchema = z.object({
  customerId: z.string().uuid(),
  type: z.enum(["first_clean", "recurring", "one_time", "deep_clean", "move_out"]),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduledStartTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  estimatedDurationMinutes: z.number().int().positive().optional(),
  priceCents: z.number().int().nonnegative(),
  employeeIds: z.array(z.string().uuid()).optional(),
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

  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, data.customerId), eq(customers.companyId, admin.companyId)))
    .limit(1);

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  if (data.employeeIds && data.employeeIds.length > 0) {
    const validUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, data.employeeIds), eq(users.companyId, admin.companyId)));
    if (validUsers.length !== data.employeeIds.length) {
      return NextResponse.json({ error: "One or more assigned employees were not found" }, { status: 400 });
    }
  }

  const [job] = await db
    .insert(jobs)
    .values({
      companyId: admin.companyId,
      customerId: data.customerId,
      type: data.type,
      status: "scheduled",
      scheduledDate: data.scheduledDate,
      scheduledStartTime: data.scheduledStartTime ?? "09:00:00",
      estimatedDurationMinutes: data.estimatedDurationMinutes ?? 120,
      priceCents: data.priceCents,
    })
    .returning();

  if (data.employeeIds && data.employeeIds.length > 0) {
    await db.insert(jobAssignments).values(
      data.employeeIds.map((userId, i) => ({
        jobId: job.id,
        userId,
        role: i === 0 ? ("lead" as const) : ("helper" as const),
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
