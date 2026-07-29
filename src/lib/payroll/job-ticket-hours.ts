import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { jobs, quotes, serviceLocations } from "@/db/schema";
import { estimateDurationMinutesFromPrice } from "@/lib/pricing/calculate";

/** Rebuilds Job Ticket Hours from amount due and the linked quote's rate.
 *
 * Payroll always pays the JTH stored on the job multiplied by each employee's
 * own hourly rate. An employee's service area is a scheduling/pricing detail,
 * not a payroll input, so unquoted/manual jobs retain their stored JTH.
 */
export async function refreshJobTicketHours(params: {
  companyId: string;
  startDate?: string;
  endDate?: string;
  completedOnly?: boolean;
  failOnUnresolved?: boolean;
}): Promise<{ updated: number; unresolved: string[] }> {
  const conditions = [eq(jobs.companyId, params.companyId)];
  if (params.completedOnly) conditions.push(eq(jobs.status, "completed"));
  else conditions.push(inArray(jobs.status, ["scheduled", "in_progress", "completed"]));
  if (params.startDate) conditions.push(gte(jobs.scheduledDate, params.startDate));
  if (params.endDate) conditions.push(lte(jobs.scheduledDate, params.endDate));
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
    .where(and(...conditions));

  if (!rows.length) return { updated: 0, unresolved: [] };

  const updates: Array<{ id: string; minutes: number }> = [];
  const unresolved: string[] = [];
  for (const row of rows) {
    if (row.quoteHourlyRateCents) {
      const minutes = estimateDurationMinutesFromPrice(row.priceCents, row.quoteHourlyRateCents);
      if (minutes !== row.currentMinutes) updates.push({ id: row.id, minutes });
    } else if (row.currentMinutes === null) {
      unresolved.push(row.id);
    }
  }
  if (params.failOnUnresolved && unresolved.length) {
    throw new Error(`Cannot calculate Job Ticket Hours for ${unresolved.length} completed job${unresolved.length === 1 ? "" : "s"}. Add Job Ticket Hours or link the job to a quote. Job IDs: ${unresolved.join(", ")}`);
  }

  await db.transaction(async (tx) => {
    for (const update of updates) {
      await tx.update(jobs).set({ estimatedDurationMinutes: update.minutes }).where(eq(jobs.id, update.id));
    }
  });
  return { updated: updates.length, unresolved };
}
