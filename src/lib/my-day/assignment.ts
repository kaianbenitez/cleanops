import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { companies, jobAssignments, jobs } from "@/db/schema";
import { todayInTimeZone } from "@/lib/dashboard/range";

/** Mirrors the `todayJobs` filters in `my-day/page.tsx` — same shape, existence-only. */
export async function hasAssignmentToday(userId: string, companyId: string): Promise<boolean> {
  const company = await db.select({ timezone: companies.timezone }).from(companies).where(eq(companies.id, companyId)).limit(1).then((rows) => rows[0] ?? null);
  if (!company) return false;

  const todayIso = todayInTimeZone(new Date(), company.timezone);

  const assignment = await db
    .select({ jobId: jobs.id })
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
    .where(and(eq(jobAssignments.userId, userId), eq(jobs.companyId, companyId), eq(jobs.scheduledDate, todayIso), isNull(jobs.completedAt)))
    .limit(1);

  return assignment.length > 0;
}
