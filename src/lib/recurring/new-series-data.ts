import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, services } from "@/db/schema";
import { loadAssignableEmployees } from "@/lib/jobs/job-detail";

export type SeriesCustomerOption = { id: string; firstName: string; lastName: string; status: string };
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
  const [customerRows, employeeRows, serviceRows] = await Promise.all([
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
      .from(services)
      .where(and(eq(services.companyId, companyId), eq(services.isActive, true)))
      .orderBy(services.name),
  ]);

  return { customers: customerRows, employees: employeeRows, services: serviceRows };
}
