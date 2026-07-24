import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { jobAssignments, jobs, quotes, serviceLocations, users } from "@/db/schema";
import { estimateDurationMinutesFromPrice } from "@/lib/pricing/calculate";

/** Rebuilds completed jobs' Job Ticket Hours from amount due ÷ service-area rate.
 * A linked quote is authoritative; legacy/manual jobs fall back to a team whose
 * assigned employees share one service area. Ambiguous jobs are never guessed. */
export async function refreshCompletedJobTicketHours(params: {
  companyId: string;
  startDate: string;
  endDate: string;
}): Promise<{ updated: number }> {
  const rows = await db
    .select({
      id: jobs.id,
      priceCents: jobs.priceCents,
      currentMinutes: jobs.estimatedDurationMinutes,
      quoteHourlyRateCents: serviceLocations.hourlyRateCents,
    })
    .from(jobs)
    .leftJoin(quotes, eq(jobs.quoteId, quotes.id))
    .leftJoin(serviceLocations, and(eq(quotes.serviceLocationId, serviceLocations.id), eq(serviceLocations.companyId, params.companyId)))
    .where(and(eq(jobs.companyId, params.companyId), eq(jobs.status, "completed"), gte(jobs.scheduledDate, params.startDate), lte(jobs.scheduledDate, params.endDate)));

  if (!rows.length) return { updated: 0 };

  const jobIds = rows.map((row) => row.id);
  const assignments = await db
    .select({ jobId: jobAssignments.jobId, serviceLocationId: users.serviceLocationId })
    .from(jobAssignments)
    .innerJoin(users, eq(jobAssignments.userId, users.id))
    .where(and(inArray(jobAssignments.jobId, jobIds), eq(users.companyId, params.companyId)));
  const areaIds = [...new Set(assignments.map((assignment) => assignment.serviceLocationId).filter((id): id is string => Boolean(id)))];
  const areas = areaIds.length
    ? await db.select({ id: serviceLocations.id, hourlyRateCents: serviceLocations.hourlyRateCents }).from(serviceLocations).where(and(eq(serviceLocations.companyId, params.companyId), inArray(serviceLocations.id, areaIds)))
    : [];
  const rateByArea = new Map(areas.map((area) => [area.id, area.hourlyRateCents]));
  const areasByJob = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    if (!assignment.serviceLocationId) continue;
    const jobAreas = areasByJob.get(assignment.jobId) ?? new Set<string>();
    jobAreas.add(assignment.serviceLocationId);
    areasByJob.set(assignment.jobId, jobAreas);
  }

  const updates: Array<{ id: string; minutes: number }> = [];
  const unresolved: string[] = [];
  for (const row of rows) {
    const teamAreas = [...(areasByJob.get(row.id) ?? new Set<string>())];
    const fallbackRate = teamAreas.length === 1 ? rateByArea.get(teamAreas[0]) : undefined;
    const rate = row.quoteHourlyRateCents ?? fallbackRate;
    if (!rate) {
      unresolved.push(row.id);
      continue;
    }
    const minutes = estimateDurationMinutesFromPrice(row.priceCents, rate);
    if (minutes !== row.currentMinutes) updates.push({ id: row.id, minutes });
  }

  if (unresolved.length) {
    throw new Error(`Cannot calculate Job Ticket Hours for ${unresolved.length} completed job${unresolved.length === 1 ? "" : "s"}. Link it to a quote or assign employees from one service area. Job IDs: ${unresolved.join(", ")}`);
  }

  await db.transaction(async (tx) => {
    for (const update of updates) {
      await tx.update(jobs).set({ estimatedDurationMinutes: update.minutes }).where(eq(jobs.id, update.id));
    }
  });
  return { updated: updates.length };
}
