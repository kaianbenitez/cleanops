import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, jobAssignments, jobs, users } from "@/db/schema";
import { formatTime } from "@/lib/format";
import { isFieldEligible } from "@/lib/auth/field-staff";
import TechnicianRoutePreview, { type TechnicianRoute } from "./technician-route-preview";

export default async function TechnicianRoutes({ companyId, todayIso }: { companyId: string; todayIso: string }) {
  const [employees, rows] = await Promise.all([
    db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(and(eq(users.companyId, companyId), isFieldEligible, eq(users.isActive, true))).orderBy(users.firstName),
    db.select({ userId: users.id, jobId: jobs.id, firstName: customers.firstName, lastName: customers.lastName, address: customers.addressLine1, city: customers.city, zip: customers.zip, time: jobs.scheduledStartTime }).from(jobs).innerJoin(customers, eq(jobs.customerId, customers.id)).innerJoin(jobAssignments, eq(jobAssignments.jobId, jobs.id)).innerJoin(users, eq(jobAssignments.userId, users.id)).where(and(eq(jobs.companyId, companyId), eq(customers.companyId, companyId), eq(users.companyId, companyId), eq(jobs.scheduledDate, todayIso))).orderBy(jobs.scheduledStartTime),
  ]);
  const routes: TechnicianRoute[] = employees.map((employee) => ({ employeeId: employee.id, employeeName: employee.firstName + " " + employee.lastName, jobs: rows.filter((row) => row.userId === employee.id).map((row) => ({ id: row.jobId, firstName: row.firstName, lastName: row.lastName, address: row.address || "Address not set", city: row.city || "", zip: row.zip || "", time: formatTime(row.time, "Time not set") })) }));
  return <TechnicianRoutePreview routes={routes} />;
}
