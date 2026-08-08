import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";

/**
 * JTH is now a saved job duration. Payroll must not depend on a quote, ZIP,
 * service-area setup, or a customer location. New jobs should provide an
 * explicit duration; the caller's safe fallback remains available for legacy
 * job creation paths.
 */
export async function resolveJobTicketMinutes(_params: {
  companyId: string;
  priceCents: number;
  quoteId?: string | null;
  customerId?: string | null;
}): Promise<number | null> {
  void _params;
  return null;
}

/**
 * Compatibility refresh endpoint. It now reports jobs with no saved duration
 * instead of attempting a ZIP/quote-based calculation. Existing durations,
 * including explicit admin overrides, are never overwritten.
 */
export async function refreshJobTicketHours(params: {
  companyId: string;
  startDate?: string;
  endDate?: string;
  completedOnly?: boolean;
  failOnUnresolved?: boolean;
}): Promise<{ updated: number; unresolved: string[] }> {
  const conditions = [eq(jobs.companyId, params.companyId)];
  conditions.push(params.completedOnly ? eq(jobs.status, "completed") : inArray(jobs.status, ["scheduled", "in_progress", "completed"]));
  if (params.startDate) conditions.push(gte(jobs.scheduledDate, params.startDate));
  if (params.endDate) conditions.push(lte(jobs.scheduledDate, params.endDate));

  const rows = await db
    .select({ id: jobs.id, estimatedDurationMinutes: jobs.estimatedDurationMinutes })
    .from(jobs)
    .where(and(...conditions));
  const unresolved = rows.filter((row) => row.estimatedDurationMinutes == null).map((row) => row.id);
  if (params.failOnUnresolved && unresolved.length) {
    throw new Error(`Job Ticket Hours are missing for ${unresolved.length} job${unresolved.length === 1 ? "" : "s"}. Add a saved duration or use the admin JTH override. Job IDs: ${unresolved.join(", ")}`);
  }
  return { updated: 0, unresolved };
}
