import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { companies, customerLocations, customers, jobs, jobAssignments, timeEntries } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import JobExecutionClient from "./job-execution-client";

export default async function JobExecutionPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const company = await db
    .select({ timezone: companies.timezone, settings: companies.settings })
    .from(companies)
    .where(eq(companies.id, user.companyId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  if (!company) redirect("/login");

  const branding = ((company.settings as { branding?: { phone?: string | null } } | null)?.branding ?? null) as { phone?: string | null } | null;

  const job = await db
    .select({
      jobId: jobs.id,
      customerId: customers.id,
      role: jobAssignments.role,
      status: jobs.status,
      scheduledDate: jobs.scheduledDate,
      scheduledStartTime: jobs.scheduledStartTime,
      type: jobs.type,
      estimatedDurationMinutes: jobs.estimatedDurationMinutes,
      addressLine1: customerLocations.addressLine1,
      city: customerLocations.city,
      state: customerLocations.state,
      zip: customerLocations.zip,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerPhone: customers.phone,
      accessInstructions: customerLocations.accessInstructions,
      keyNumber: customerLocations.keyNumber,
      garageCode: customerLocations.garageCode,
      gateCode: customerLocations.gateCode,
      alarmCode: customerLocations.alarmCode,
      vacuumLocation: customerLocations.vacuumLocation,
      mopHeadsNeeded: customerLocations.mopHeadsNeeded,
      trashBags: customerLocations.trashBags,
      generalNotes: customers.generalNotes,
      doNotClean: customers.doNotClean,
      petNotes: customers.petNotes,
      importantToCustomer: customers.importantToCustomer,
      preferredDays: customers.preferredDays,
      preferredTimeOfDay: customers.preferredTimeOfDay,
      subdivision: customers.subdivision,
    })
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .leftJoin(customerLocations, and(eq(customerLocations.customerId, customers.id), eq(customerLocations.isPrimary, true), eq(customerLocations.isActive, true)))
    .where(and(eq(jobs.id, jobId), eq(jobAssignments.userId, user.id), eq(jobs.companyId, user.companyId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!job) redirect("/my-day");

  const timeEntry = await db
    .select({ clockIn: timeEntries.clockIn, clockOut: timeEntries.clockOut })
    .from(timeEntries)
    .where(and(eq(timeEntries.jobId, jobId), eq(timeEntries.userId, user.id)))
    .orderBy(desc(timeEntries.clockIn))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  return (
    <JobExecutionClient
      job={job}
      timeEntry={timeEntry ? { clockIn: timeEntry.clockIn.toISOString(), clockOut: timeEntry.clockOut ? timeEntry.clockOut.toISOString() : null } : null}
      officePhone={branding?.phone ?? null}
      companyTimezone={company.timezone}
    />
  );
}
