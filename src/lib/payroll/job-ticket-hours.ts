import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { customers, jobs, quotes, serviceLocations } from "@/db/schema";
import { estimateDurationMinutesFromPrice } from "@/lib/pricing/calculate";
import { resolveServiceAreaNameForZip } from "@/lib/pricing/service-area-zips";

/** Resolves the ÷-rate for one job/series: a linked quote's service-area rate
 * is authoritative; otherwise the branch is derived from the customer's zip
 * (see `service-area-zips.ts`) and its rate is read live from
 * `service_locations.hourlyRateCents`. Returns null (never guesses) when
 * neither resolves — no quote and no zip match. */
async function resolveHourlyRateCents(params: {
  companyId: string;
  quoteId?: string | null;
  customerId?: string | null;
}): Promise<number | null> {
  if (params.quoteId) {
    const [quoteRow] = await db
      .select({ hourlyRateCents: serviceLocations.hourlyRateCents })
      .from(quotes)
      .innerJoin(serviceLocations, eq(quotes.serviceLocationId, serviceLocations.id))
      .where(and(eq(quotes.id, params.quoteId), eq(quotes.companyId, params.companyId), eq(serviceLocations.companyId, params.companyId)))
      .limit(1);
    if (quoteRow?.hourlyRateCents) return quoteRow.hourlyRateCents;
  }
  if (params.customerId) {
    const [customer] = await db
      .select({ zip: customers.zip })
      .from(customers)
      .where(and(eq(customers.id, params.customerId), eq(customers.companyId, params.companyId)))
      .limit(1);
    const areaName = resolveServiceAreaNameForZip(customer?.zip);
    if (areaName) {
      const [area] = await db
        .select({ hourlyRateCents: serviceLocations.hourlyRateCents })
        .from(serviceLocations)
        .where(and(eq(serviceLocations.companyId, params.companyId), eq(serviceLocations.name, areaName)))
        .limit(1);
      return area?.hourlyRateCents ?? null;
    }
  }
  return null;
}

/** Single-job/single-series Job Ticket Hours calc, for use at job-creation and
 * price-edit time so duration is right immediately instead of waiting on the
 * next bulk `refreshJobTicketHours` pass. Returns null when unresolved —
 * callers keep whatever duration they already had rather than guessing. */
export async function resolveJobTicketMinutes(params: {
  companyId: string;
  priceCents: number;
  quoteId?: string | null;
  customerId?: string | null;
}): Promise<number | null> {
  const rate = await resolveHourlyRateCents(params);
  if (!rate) return null;
  return estimateDurationMinutesFromPrice(params.priceCents, rate);
}

/** Rebuilds Job Ticket Hours from amount due ÷ branch rate. A linked quote's
 * service area is authoritative; otherwise the branch is derived from the
 * customer's zip. Rates are read live from `service_locations`, so a Settings
 * change is picked up immediately. Jobs with no quote and an unmapped/missing
 * zip are never guessed. */
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
      jthManualOverride: jobs.jthManualOverride,
      quoteHourlyRateCents: serviceLocations.hourlyRateCents,
      customerZip: customers.zip,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .leftJoin(quotes, eq(jobs.quoteId, quotes.id))
    .leftJoin(serviceLocations, and(eq(quotes.serviceLocationId, serviceLocations.id), eq(serviceLocations.companyId, params.companyId)))
    .where(and(...conditions));

  if (!rows.length) return { updated: 0, unresolved: [] };

  // A manually set per-occurrence JTH is already resolved. Never derive it
  // again from price/rate, and do not report it as unresolved.
  const autoManagedRows = rows.filter((row) => !row.jthManualOverride);
  const areaNames = [...new Set(autoManagedRows.map((row) => resolveServiceAreaNameForZip(row.customerZip)).filter((name): name is string => Boolean(name)))];
  const areas = areaNames.length
    ? await db
        .select({ name: serviceLocations.name, hourlyRateCents: serviceLocations.hourlyRateCents })
        .from(serviceLocations)
        .where(and(eq(serviceLocations.companyId, params.companyId), inArray(serviceLocations.name, areaNames)))
    : [];
  const rateByAreaName = new Map(areas.map((area) => [area.name, area.hourlyRateCents]));

  const updates: Array<{ id: string; minutes: number }> = [];
  const unresolved: string[] = [];
  for (const row of autoManagedRows) {
    const areaName = resolveServiceAreaNameForZip(row.customerZip);
    const zipRate = areaName ? rateByAreaName.get(areaName) : undefined;
    const rate = row.quoteHourlyRateCents ?? zipRate;
    if (!rate) {
      unresolved.push(row.id);
      continue;
    }
    const minutes = estimateDurationMinutesFromPrice(row.priceCents, rate);
    if (minutes !== row.currentMinutes) updates.push({ id: row.id, minutes });
  }

  if (params.failOnUnresolved && unresolved.length) {
    throw new Error(`Cannot calculate Job Ticket Hours for ${unresolved.length} completed job${unresolved.length === 1 ? "" : "s"}. Link it to a quote or add a zip that matches a service area. Job IDs: ${unresolved.join(", ")}`);
  }

  await db.transaction(async (tx) => {
    for (const update of updates) {
      await tx.update(jobs).set({ estimatedDurationMinutes: update.minutes }).where(eq(jobs.id, update.id));
    }
  });
  return { updated: updates.length, unresolved };
}
