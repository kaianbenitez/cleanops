import { and, desc, eq, gt, gte, isNull, isNotNull, lt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { companies, customerLocations, customers, jobs, jobAssignments, timeEntries } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { payrollWeekRangeForDate } from "@/lib/payroll/periods";
import MyDayClient from "./my-day-client";

type JobCard = {
  jobId: string;
  customerId: string;
  role: "lead" | "helper";
  status: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  type: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  customerFirstName: string;
  customerLastName: string;
  customerPhone: string | null;
  accessInstructions: string | null;
  keyNumber: string | null;
  garageCode: string | null;
  gateCode: string | null;
  alarmCode: string | null;
  vacuumLocation: string | null;
  mopHeadsNeeded: string | null;
  trashBags: string | null;
  generalNotes: string | null;
  preferredDays: string[] | null;
  preferredTimeOfDay: string | null;
  subdivision: string | null;
};

type TimeEntryCard = {
  id: string;
  jobId: string;
  clockIn: string;
  clockOut: string | null;
  minutesWorked: number | null;
  notes: string | null;
  scheduledDate: string;
  scheduledStartTime: string | null;
  type: string;
  status: string;
  customerFirstName: string;
  customerLastName: string;
};

function addDaysISO(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayInTimezone(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce(
      (acc, part) => {
        if (part.type === "year" || part.type === "month" || part.type === "day") acc[part.type] = part.value;
        return acc;
      },
      { year: "", month: "", day: "" } as Record<"year" | "month" | "day", string>
    );
}

function formatDayLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

export default async function MyDayPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const company = await db.select({ name: companies.name, timezone: companies.timezone, settings: companies.settings }).from(companies).where(eq(companies.id, user.companyId)).limit(1).then((rows) => rows[0] ?? null);
  if (!company) redirect("/login");
  const branding = ((company.settings as { branding?: { logoUrl?: string | null; phone?: string | null; brandColor?: string | null } } | null)?.branding ?? null) as {
    logoUrl?: string | null;
    phone?: string | null;
    brandColor?: string | null;
  } | null;
  const officePhone = branding?.phone ?? null;

  const today = todayInTimezone(company.timezone);
  const todayIso = `${today.year}-${today.month}-${today.day}`;
  const period = payrollWeekRangeForDate(new Date());

  const todayJobs = await db
    .select({
      role: jobAssignments.role,
      jobId: jobs.id,
      customerId: customers.id,
      status: jobs.status,
      scheduledDate: jobs.scheduledDate,
      scheduledStartTime: jobs.scheduledStartTime,
      type: jobs.type,
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
      preferredDays: customers.preferredDays,
      preferredTimeOfDay: customers.preferredTimeOfDay,
      subdivision: customers.subdivision,
    })
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .leftJoin(customerLocations, and(eq(customerLocations.customerId, customers.id), eq(customerLocations.isPrimary, true), eq(customerLocations.isActive, true)))
    .where(and(eq(jobAssignments.userId, user.id), eq(jobs.companyId, user.companyId), eq(jobs.scheduledDate, todayIso), isNull(jobs.completedAt)))
    .orderBy(jobs.scheduledStartTime);

  const upcomingJobs = await db
    .select({
      role: jobAssignments.role,
      jobId: jobs.id,
      customerId: customers.id,
      status: jobs.status,
      scheduledDate: jobs.scheduledDate,
      scheduledStartTime: jobs.scheduledStartTime,
      type: jobs.type,
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
      preferredDays: customers.preferredDays,
      preferredTimeOfDay: customers.preferredTimeOfDay,
      subdivision: customers.subdivision,
    })
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .leftJoin(customerLocations, and(eq(customerLocations.customerId, customers.id), eq(customerLocations.isPrimary, true), eq(customerLocations.isActive, true)))
    .where(and(eq(jobAssignments.userId, user.id), eq(jobs.companyId, user.companyId), gt(jobs.scheduledDate, todayIso)))
    .orderBy(jobs.scheduledDate, jobs.scheduledStartTime)
    .limit(5);

  const completedJobs = await db
    .select({
      role: jobAssignments.role,
      jobId: jobs.id,
      customerId: customers.id,
      status: jobs.status,
      scheduledDate: jobs.scheduledDate,
      scheduledStartTime: jobs.scheduledStartTime,
      type: jobs.type,
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
      preferredDays: customers.preferredDays,
      preferredTimeOfDay: customers.preferredTimeOfDay,
      subdivision: customers.subdivision,
    })
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .leftJoin(customerLocations, and(eq(customerLocations.customerId, customers.id), eq(customerLocations.isPrimary, true), eq(customerLocations.isActive, true)))
    .where(and(eq(jobAssignments.userId, user.id), eq(jobs.companyId, user.companyId), eq(jobs.scheduledDate, todayIso), isNotNull(jobs.completedAt)))
    .orderBy(desc(jobs.completedAt))
    .limit(10);

  const currentJob = todayJobs[0] ?? upcomingJobs[0] ?? null;

  const openEntry = await db
    .select({
      role: jobAssignments.role,
      id: timeEntries.id,
      jobId: timeEntries.jobId,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
      minutesWorked: timeEntries.minutesWorked,
      notes: timeEntries.notes,
      scheduledDate: jobs.scheduledDate,
      scheduledStartTime: jobs.scheduledStartTime,
      type: jobs.type,
      status: jobs.status,
      customerId: customers.id,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerPhone: customers.phone,
      addressLine1: customerLocations.addressLine1,
      city: customerLocations.city,
      state: customerLocations.state,
      zip: customerLocations.zip,
      accessInstructions: customerLocations.accessInstructions,
      keyNumber: customerLocations.keyNumber,
      garageCode: customerLocations.garageCode,
      gateCode: customerLocations.gateCode,
      alarmCode: customerLocations.alarmCode,
      vacuumLocation: customerLocations.vacuumLocation,
      mopHeadsNeeded: customerLocations.mopHeadsNeeded,
      trashBags: customerLocations.trashBags,
      generalNotes: customers.generalNotes,
      preferredDays: customers.preferredDays,
      preferredTimeOfDay: customers.preferredTimeOfDay,
      subdivision: customers.subdivision,
    })
    .from(timeEntries)
    .innerJoin(jobs, eq(timeEntries.jobId, jobs.id))
    .innerJoin(jobAssignments, and(eq(jobAssignments.jobId, jobs.id), eq(jobAssignments.userId, user.id)))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .leftJoin(customerLocations, and(eq(customerLocations.customerId, customers.id), eq(customerLocations.isPrimary, true), eq(customerLocations.isActive, true)))
    .where(and(eq(timeEntries.userId, user.id), isNull(timeEntries.clockOut)))
    .orderBy(desc(timeEntries.clockIn))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  const recentTimeEntries = await db
    .select({
      role: jobAssignments.role,
      id: timeEntries.id,
      jobId: timeEntries.jobId,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
      minutesWorked: timeEntries.minutesWorked,
      notes: timeEntries.notes,
      scheduledDate: jobs.scheduledDate,
      scheduledStartTime: jobs.scheduledStartTime,
      type: jobs.type,
      status: jobs.status,
      customerId: customers.id,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerPhone: customers.phone,
      addressLine1: customerLocations.addressLine1,
      city: customerLocations.city,
      state: customerLocations.state,
      zip: customerLocations.zip,
      accessInstructions: customerLocations.accessInstructions,
      keyNumber: customerLocations.keyNumber,
      garageCode: customerLocations.garageCode,
      gateCode: customerLocations.gateCode,
      alarmCode: customerLocations.alarmCode,
      vacuumLocation: customerLocations.vacuumLocation,
      mopHeadsNeeded: customerLocations.mopHeadsNeeded,
      trashBags: customerLocations.trashBags,
      generalNotes: customers.generalNotes,
      preferredDays: customers.preferredDays,
      preferredTimeOfDay: customers.preferredTimeOfDay,
      subdivision: customers.subdivision,
    })
    .from(timeEntries)
    .innerJoin(jobs, eq(timeEntries.jobId, jobs.id))
    .innerJoin(jobAssignments, and(eq(jobAssignments.jobId, jobs.id), eq(jobAssignments.userId, user.id)))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .leftJoin(customerLocations, and(eq(customerLocations.customerId, customers.id), eq(customerLocations.isPrimary, true), eq(customerLocations.isActive, true)))
    .where(eq(timeEntries.userId, user.id))
    .orderBy(desc(timeEntries.clockIn))
    .limit(6);

  const weeklyMinutes = await db
    .select({
      minutesWorked: timeEntries.minutesWorked,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, user.id),
        gte(timeEntries.clockIn, new Date(`${period.startDate}T00:00:00.000Z`)),
        lt(timeEntries.clockIn, new Date(`${addDaysISO(period.endDate, 1)}T00:00:00.000Z`))
      )
    )
    .orderBy(desc(timeEntries.clockIn))
    .then((rows) => rows.reduce((sum, row) => sum + Number(row.minutesWorked ?? 0), 0));

  const hoursThisPeriod = Math.round((weeklyMinutes / 60) * 100) / 100;
  const currentPeriodLabel = `${period.startDate} to ${period.endDate}`;

  const currentJobData: JobCard | null = openEntry
    ? {
        jobId: openEntry.jobId,
        customerId: openEntry.customerId,
        role: openEntry.role,
        status: openEntry.status,
        scheduledDate: openEntry.scheduledDate,
        scheduledStartTime: openEntry.scheduledStartTime,
        type: openEntry.type,
        addressLine1: openEntry.addressLine1,
        city: openEntry.city,
        state: openEntry.state,
        zip: openEntry.zip,
        customerFirstName: openEntry.customerFirstName,
        customerLastName: openEntry.customerLastName,
        customerPhone: openEntry.customerPhone,
        accessInstructions: openEntry.accessInstructions,
        keyNumber: openEntry.keyNumber,
        garageCode: openEntry.garageCode,
        gateCode: openEntry.gateCode,
        alarmCode: openEntry.alarmCode,
        vacuumLocation: openEntry.vacuumLocation,
        mopHeadsNeeded: openEntry.mopHeadsNeeded,
        trashBags: openEntry.trashBags,
        generalNotes: openEntry.generalNotes,
        preferredDays: openEntry.preferredDays,
        preferredTimeOfDay: openEntry.preferredTimeOfDay,
        subdivision: openEntry.subdivision,
      }
    : currentJob
      ? {
          jobId: currentJob.jobId,
          customerId: currentJob.customerId,
          role: currentJob.role,
          status: currentJob.status,
          scheduledDate: currentJob.scheduledDate,
          scheduledStartTime: currentJob.scheduledStartTime,
          type: currentJob.type,
          addressLine1: currentJob.addressLine1,
          city: currentJob.city,
          state: currentJob.state,
          zip: currentJob.zip,
          customerFirstName: currentJob.customerFirstName,
          customerLastName: currentJob.customerLastName,
          customerPhone: currentJob.customerPhone,
          accessInstructions: currentJob.accessInstructions,
          keyNumber: currentJob.keyNumber,
          garageCode: currentJob.garageCode,
          gateCode: currentJob.gateCode,
          alarmCode: currentJob.alarmCode,
          vacuumLocation: currentJob.vacuumLocation,
          mopHeadsNeeded: currentJob.mopHeadsNeeded,
          trashBags: currentJob.trashBags,
          generalNotes: currentJob.generalNotes,
          preferredDays: currentJob.preferredDays,
          preferredTimeOfDay: currentJob.preferredTimeOfDay,
          subdivision: currentJob.subdivision,
        }
      : null;

  return (
    <MyDayClient
      employeeName={`${user.firstName} ${user.lastName}`}
      employeeTitle={user.title ?? "Employee"}
      companyName={company.name}
      companyLogoUrl={branding?.logoUrl ?? null}
      officePhone={officePhone}
      companyTimezone={company.timezone}
      weeklyHours={hoursThisPeriod}
      currentJob={currentJobData}
      openEntry={openEntry ? { ...openEntry, clockIn: openEntry.clockIn.toISOString(), clockOut: openEntry.clockOut ? openEntry.clockOut.toISOString() : null } : null}
      todayJobs={todayJobs.map((job) => ({ ...job }))}
      upcomingJobs={upcomingJobs.map((job) => ({ ...job }))}
      completedJobs={completedJobs.map((job) => ({ ...job }))}
      currentYear={new Date().getFullYear()}
      dayLabel={formatDayLabel(todayIso, company.timezone)}
    />
  );
}
