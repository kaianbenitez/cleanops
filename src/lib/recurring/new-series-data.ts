import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, quotes, services } from "@/db/schema";
import { loadAssignableEmployees } from "@/lib/jobs/job-detail";

export type SeriesCustomerOption = { id: string; firstName: string; lastName: string; status: string; lastQuotePriceCents: number | null };
export type SeriesEmployeeOption = { id: string; firstName: string; lastName: string };
export type SeriesServiceOption = { id: string; name: string; defaultPriceCents: number };

export type NewSeriesOptions = {
  customers: SeriesCustomerOption[];
  employees: SeriesEmployeeOption[];
  services: SeriesServiceOption[];
};

/**
 * Everything the "new recurring series" form needs to render, in one
 * company-scoped read.
 *
 * This replaces three client-side fetches fired on mount (`/api/customers`,
 * `/api/employees`, `/api/services`), which meant the form painted empty
 * pickers and only became usable a round-trip later. Those routes still exist
 * and are unchanged — other screens fetch them — so keep the column lists here
 * matching theirs, since the option types are shared with those callers'
 * expectations.
 */
export async function loadNewSeriesOptions(companyId: string): Promise<NewSeriesOptions> {
  const [customerRows, employeeRows, serviceRows, quoteRows] = await Promise.all([
    db
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        status: customers.status,
      })
      .from(customers)
      .where(eq(customers.companyId, companyId))
      .orderBy(customers.lastName, customers.firstName),
    loadAssignableEmployees(companyId),
    db
      .select({
        id: services.id,
        name: services.name,
        defaultPriceCents: services.defaultPriceCents,
      })
      // "add_on" catalog entries aren't meaningful as a whole-series price
      // prefill, and can have a null (variable) price — main presets always
      // require a price (enforced on create), so this filter also satisfies
      // the non-null SeriesServiceOption type below.
      .from(services)
      .where(and(eq(services.companyId, companyId), eq(services.isActive, true), eq(services.category, "main")))
      .orderBy(services.name),
    // Newest first per company; reduced below to each customer's single most
    // recent quote so the form can prefill a series price from it.
    db
      .select({ customerId: quotes.customerId, totalCents: quotes.totalCents, createdAt: quotes.createdAt })
      .from(quotes)
      .where(eq(quotes.companyId, companyId))
      .orderBy(desc(quotes.createdAt)),
  ]);

  const lastQuotePriceByCustomerId = new Map<string, number>();
  for (const quote of quoteRows) {
    if (!lastQuotePriceByCustomerId.has(quote.customerId)) lastQuotePriceByCustomerId.set(quote.customerId, quote.totalCents);
  }

  return {
    customers: customerRows.map((row) => ({ ...row, lastQuotePriceCents: lastQuotePriceByCustomerId.get(row.id) ?? null })),
    employees: employeeRows,
    services: serviceRows.map((row) => ({ ...row, defaultPriceCents: row.defaultPriceCents ?? 0 })),
  };
}
