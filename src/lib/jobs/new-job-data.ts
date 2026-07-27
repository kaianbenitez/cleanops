import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, services } from "@/db/schema";
import { loadAssignableEmployees } from "@/lib/jobs/job-detail";

export type NewJobCustomerOption = { id: string; firstName: string; lastName: string; status: string };
export type NewJobEmployeeOption = { id: string; firstName: string; lastName: string };
export type NewJobServiceOption = { id: string; name: string; defaultPriceCents: number };

export type NewJobOptions = {
  customers: NewJobCustomerOption[];
  employees: NewJobEmployeeOption[];
  services: NewJobServiceOption[];
};

/**
 * Everything the "new job" form needs to render, in one company-scoped read.
 *
 * Mirrors `loadNewSeriesOptions` — replaces three client-side fetches fired on
 * mount (`/api/customers`, `/api/employees`, `/api/services`), which meant the
 * form painted empty pickers and only became usable a round-trip later.
 */
export async function loadNewJobOptions(companyId: string): Promise<NewJobOptions> {
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
