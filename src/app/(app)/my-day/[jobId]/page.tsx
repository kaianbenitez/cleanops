import { and, desc, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { companies, customerLocations, customers, jobs, jobAssignments, timeEntries, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasFieldAccess } from "@/lib/auth/field-staff";
import { todayInTimeZone } from "@/lib/dashboard/range";
import type { StopInput } from "@/lib/my-day/workday-state";
import JobExecutionClient from "./job-execution-client";

export default async function JobExecutionPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasFieldAccess(user)) redirect("/dashboard");

  const company = await db
    .select({ timezone: companies.timezone, settings: companies.settings })
    .from(companies)
    .where(eq(companies.id, user.companyId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  if (!company) redirect("/login");

  const branding = ((company.settings as { branding?: { phone?: string | null } } | null)?.branding ?? null) as { phone?: string | null } | null;
  const todayIso = todayInTimeZone(new Date(), company.timezone);

  // Invariant 5 (state model §3): no employee query selects jobs.priceCents or
  // jobs.discountCents — not even into a payload that is never rendered.
  const job = await db
    .select({
      jobId: jobs.id,
      customerId: customers.id,
      role: jobAssignments.role,
      status: jobs.status,
      completedAt: jobs.completedAt,
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

  // Any job this employee still has time recording on, whatever day it was
  // scheduled. My Day surfaces a left-running entry from an earlier day as its
  // own stop; without the same row here, job detail would report "Not
  // recording time" while My Day reported the opposite — the two screens
  // disagreeing about one employee at one moment.
  const openEntryJobIds = await db
    .select({ jobId: timeEntries.jobId })
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, user.id), isNull(timeEntries.clockOut)))
    .then((rows) => rows.map((row) => row.jobId));

  // Today's whole route, plus this stop (which may not be today's — an old job
  // can always be re-opened), plus anything still recording. The Now region on
  // this page is derived from the same day-wide input My Day uses, so walking
  // between the two screens never changes what the app claims is happening
  // right now.
  const stopRows = await db
    .select({
      jobId: jobs.id,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      scheduledDate: jobs.scheduledDate,
      scheduledStartTime: jobs.scheduledStartTime,
      status: jobs.status,
      completedAt: jobs.completedAt,
      travelStartedAt: jobAssignments.travelStartedAt,
      arrivedAt: jobAssignments.arrivedAt,
      workStartedAt: jobAssignments.workStartedAt,
    })
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(
      and(
        eq(jobAssignments.userId, user.id),
        eq(jobs.companyId, user.companyId),
        or(
          eq(jobs.scheduledDate, todayIso),
          eq(jobs.id, jobId),
          ...(openEntryJobIds.length ? [inArray(jobs.id, openEntryJobIds)] : [])
        )
      )
    );

  const stopJobIds = stopRows.map((row) => row.jobId);

  // Open and closed entries are read separately and deliberately: the receipt
  // must print the closed entry the server persisted, never a live
  // recomputation against a ticking clock (packet §6).
  const myOpenEntries = await db
    .select({ jobId: timeEntries.jobId, clockIn: timeEntries.clockIn })
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, user.id), inArray(timeEntries.jobId, stopJobIds), isNull(timeEntries.clockOut)))
    .orderBy(desc(timeEntries.clockIn));

  const myClosedEntries = await db
    .select({ jobId: timeEntries.jobId, clockIn: timeEntries.clockIn, clockOut: timeEntries.clockOut, minutesWorked: timeEntries.minutesWorked })
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, user.id), inArray(timeEntries.jobId, stopJobIds), isNotNull(timeEntries.clockOut)))
    .orderBy(desc(timeEntries.clockOut));

  const openEntryByJob = new Map<string, { clockIn: string }>();
  for (const entry of myOpenEntries) {
    if (!openEntryByJob.has(entry.jobId)) openEntryByJob.set(entry.jobId, { clockIn: entry.clockIn.toISOString() });
  }
  const closedEntryByJob = new Map<string, { clockIn: string; clockOut: string; minutesWorked: number | null }>();
  for (const entry of myClosedEntries) {
    if (!closedEntryByJob.has(entry.jobId)) {
      closedEntryByJob.set(entry.jobId, { clockIn: entry.clockIn.toISOString(), clockOut: entry.clockOut!.toISOString(), minutesWorked: entry.minutesWorked });
    }
  }

  // Other employees assigned to these stops — a job only flips to "completed"
  // once every assignee has closed an entry, so we surface who is still out
  // instead of letting one finisher's screen imply the whole job is done.
  const crewRows = await db
    .select({ jobId: jobAssignments.jobId, userId: jobAssignments.userId, firstName: users.firstName, lastName: users.lastName })
    .from(jobAssignments)
    .innerJoin(users, eq(jobAssignments.userId, users.id))
    .where(and(inArray(jobAssignments.jobId, stopJobIds), ne(jobAssignments.userId, user.id)));

  const crewDone = crewRows.length
    ? await db
        .select({ jobId: timeEntries.jobId, userId: timeEntries.userId })
        .from(timeEntries)
        .where(and(inArray(timeEntries.jobId, stopJobIds), isNotNull(timeEntries.clockOut), inArray(timeEntries.userId, crewRows.map((crew) => crew.userId))))
        .then((rows) => new Set(rows.map((row) => `${row.jobId}|${row.userId}`)))
    : new Set<string>();

  const crewFor = (rowJobId: string) => crewRows.filter((crew) => crew.jobId === rowJobId).map((crew) => ({ ...crew, done: crewDone.has(`${crew.jobId}|${crew.userId}`) }));

  const stops: StopInput[] = stopRows.map((row) => ({
    jobId: row.jobId,
    customerFirstName: row.customerFirstName,
    customerLastName: row.customerLastName,
    scheduledDate: row.scheduledDate,
    scheduledStartTime: row.scheduledStartTime,
    status: row.status,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    travelStartedAt: row.travelStartedAt ? row.travelStartedAt.toISOString() : null,
    arrivedAt: row.arrivedAt ? row.arrivedAt.toISOString() : null,
    workStartedAt: row.workStartedAt ? row.workStartedAt.toISOString() : null,
    myOpenEntry: openEntryByJob.get(row.jobId) ?? null,
    myClosedEntry: closedEntryByJob.get(row.jobId) ?? null,
    coworkers: crewFor(row.jobId).map((crew) => ({ firstName: crew.firstName, done: crew.done })),
  }));

  const coworkers = crewFor(jobId).map((crew) => ({ firstName: crew.firstName, lastName: crew.lastName, done: crew.done }));

  return (
    <JobExecutionClient
      job={{ ...job, completedAt: job.completedAt ? job.completedAt.toISOString() : null }}
      stops={stops}
      todayIso={todayIso}
      officePhone={branding?.phone ?? null}
      companyTimezone={company.timezone}
      coworkers={coworkers}
    />
  );
}
