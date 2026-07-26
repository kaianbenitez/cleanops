import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { customers, jobAssignments, jobs, users } from "@/db/schema";
import { and, desc, eq, lt, ne } from "drizzle-orm";

/** GET /api/jobs/[jobId]/history — context for a quick-assign decision: the
 * customer's preferred cleaner (if set) and who cleaned for them last time,
 * so an admin assigning from the unassigned queue doesn't have to open the
 * customer record separately. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const admin = await requireAdmin();
  const { jobId } = await params;

  const [job] = await db
    .select({ customerId: jobs.customerId, scheduledDate: jobs.scheduledDate, scheduledStartTime: jobs.scheduledStartTime })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.companyId, admin.companyId)))
    .limit(1);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const [customer] = await db
    .select({
      preferredCleanerId: customers.preferredCleanerId,
      preferredCleanerFirstName: users.firstName,
      preferredCleanerLastName: users.lastName,
    })
    .from(customers)
    .leftJoin(users, eq(users.id, customers.preferredCleanerId))
    .where(and(eq(customers.id, job.customerId), eq(customers.companyId, admin.companyId)))
    .limit(1);

  const preferredCleaner =
    customer?.preferredCleanerId && customer.preferredCleanerFirstName
      ? { id: customer.preferredCleanerId, firstName: customer.preferredCleanerFirstName, lastName: customer.preferredCleanerLastName }
      : null;

  const [previousJob] = await db
    .select({ id: jobs.id, scheduledDate: jobs.scheduledDate, scheduledStartTime: jobs.scheduledStartTime })
    .from(jobs)
    .where(
      and(
        eq(jobs.customerId, job.customerId),
        eq(jobs.companyId, admin.companyId),
        eq(jobs.status, "completed"),
        ne(jobs.id, jobId),
        lt(jobs.scheduledDate, job.scheduledDate)
      )
    )
    .orderBy(desc(jobs.scheduledDate), desc(jobs.scheduledStartTime))
    .limit(1);

  let previousVisit = null;
  if (previousJob) {
    const previousEmployees = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
      .from(jobAssignments)
      .innerJoin(users, eq(users.id, jobAssignments.userId))
      .where(eq(jobAssignments.jobId, previousJob.id));

    previousVisit = {
      scheduledDate: previousJob.scheduledDate,
      scheduledStartTime: previousJob.scheduledStartTime,
      employees: previousEmployees,
    };
  }

  return NextResponse.json({ preferredCleaner, previousVisit });
}
