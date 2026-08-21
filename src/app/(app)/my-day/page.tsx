import { and, desc, eq, gt, gte, inArray, isNull, lt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { companies, customerLocations, customers, jobs, jobAssignments, recurringSeries, roomTypes, timeEntries, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasFieldAccess } from "@/lib/auth/field-staff";
import { payrollWeekRangeForDate } from "@/lib/payroll/periods";
import { rotationalTaskForDate } from "@/lib/scheduling/rotational-tasks";
import {
  buildLedger,
  deriveJobState,
  deriveWorkdayNow,
  primaryActionFor,
  type StopInput,
  type WorkdayInput,
} from "@/lib/my-day/workday-state";
import MyDayClient from "./my-day-client";

const HARD_FLOOR_ROOM_NAMES = new Set(["Master Bathroom", "Full Bathroom", "Half Bathroom", "Kitchen Large", "Kitchen Medium", "Kitchen Small", "Laundry Room", "Hallway"]);

function equipmentForStop(
  customer: { homeDetails: unknown; mopHeadCount: number | null; ragCount: number | null; vacuumCount: number | null },
  roomTypeNameById: Map<string, string>
) {
  const roomCounts = customer.homeDetails && typeof customer.homeDetails === "object" && !Array.isArray(customer.homeDetails)
    ? (customer.homeDetails as { roomCounts?: unknown }).roomCounts
    : null;
  if (!roomCounts || typeof roomCounts !== "object" || Array.isArray(roomCounts) || Object.keys(roomCounts).length === 0) {
    return { mopHeadCount: customer.mopHeadCount, ragCount: customer.ragCount, vacuumCount: customer.vacuumCount, mopHeadEstimate: null };
  }
  const hardFloorRooms = Object.entries(roomCounts as Record<string, unknown>).reduce((sum, [roomTypeId, count]) =>
    sum + (HARD_FLOOR_ROOM_NAMES.has(roomTypeNameById.get(roomTypeId) ?? "") ? Number(count) || 0 : 0), 0);
  return { mopHeadCount: customer.mopHeadCount, ragCount: customer.ragCount, vacuumCount: customer.vacuumCount, mopHeadEstimate: Math.round(hardFloorRooms + 3) };
}

function addDaysISO(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The UTC instant for local midnight of `dateIso` in `timeZone`. Used only
 * for the weekly-hours range below — `time_entries.clock_in` is an absolute
 * instant, so a range built from bare UTC midnight (D9) puts hours recorded
 * near midnight company time into the wrong pay week. */
export function startOfDayInstant(dateIso: string, timeZone: string): Date {
  const utcGuess = new Date(`${dateIso}T00:00:00.000Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(utcGuess)
    .reduce(
      (acc, part) => {
        if (part.type !== "literal") acc[part.type] = part.value;
        return acc;
      },
      {} as Record<string, string>
    );
  const wallClockAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  const offsetMs = wallClockAsUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs);
}

function todayInTimezone(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" })
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
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00.000Z`));
}

/** Display fields for one stop. Deliberately excludes every price column —
 * employees must never receive price data, including in payloads they never
 * render (state model, Invariant 5). */
const stopColumns = {
  role: jobAssignments.role,
  mileageMiles: jobAssignments.mileageMiles,
  travelStartedAt: jobAssignments.travelStartedAt,
  arrivedAt: jobAssignments.arrivedAt,
  workStartedAt: jobAssignments.workStartedAt,
  jobId: jobs.id,
  customerId: customers.id,
  status: jobs.status,
  completedAt: jobs.completedAt,
  scheduledDate: jobs.scheduledDate,
  recurrenceStartDate: recurringSeries.startDate,
  recurrenceFrequency: recurringSeries.frequency,
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
  preferredDays: customers.preferredDays,
  preferredTimeOfDay: customers.preferredTimeOfDay,
  subdivision: customers.subdivision,
  petNotes: customers.petNotes,
  doNotClean: customers.doNotClean,
} as const;

export default async function MyDayPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasFieldAccess(user)) redirect("/dashboard");

  const company = await db
    .select({ name: companies.name, timezone: companies.timezone, settings: companies.settings })
    .from(companies)
    .where(eq(companies.id, user.companyId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  if (!company) redirect("/login");

  const branding = ((company.settings as { branding?: { phone?: string | null } } | null)?.branding ?? null) as { phone?: string | null } | null;
  const officePhone = branding?.phone ?? null;

  const today = todayInTimezone(company.timezone);
  const todayIso = `${today.year}-${today.month}-${today.day}`;
  const period = payrollWeekRangeForDate(new Date());

  // Today's route. Completed stops are deliberately NOT filtered out any more:
  // a stop this employee finished while a coworker is still working keeps
  // `jobs.completed_at` null, and excluding it used to let it reappear as an
  // untouched stop offering travel to a house she had just finished.
  // `deriveJobState` classifies each stop instead.
  const todayRows = await db
    .select({ ...stopColumns, homeDetails: customers.homeDetails, mopHeadCount: customers.mopHeadCount, ragCount: customers.ragCount, vacuumCount: customers.vacuumCount })
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .leftJoin(recurringSeries, eq(jobs.recurringSeriesId, recurringSeries.id))
    .leftJoin(customerLocations, and(eq(customerLocations.customerId, customers.id), eq(customerLocations.isPrimary, true), eq(customerLocations.isActive, true)))
    .where(and(eq(jobAssignments.userId, user.id), eq(jobs.companyId, user.companyId), eq(jobs.scheduledDate, todayIso)))
    .orderBy(jobs.scheduledStartTime);

  const companyRoomTypes = await db.select({ id: roomTypes.id, name: roomTypes.name }).from(roomTypes).where(eq(roomTypes.companyId, user.companyId));
  const roomTypeNameById = new Map(companyRoomTypes.map((roomType) => [roomType.id, roomType.name]));

  // An entry left open on an earlier day. Surfaced as its own stop so it is
  // classified `stale_entry` rather than masquerading as today's current stop
  // with a counter reading nineteen hours.
  const staleRow = await db
    .select(stopColumns)
    .from(timeEntries)
    .innerJoin(jobs, eq(timeEntries.jobId, jobs.id))
    .innerJoin(jobAssignments, and(eq(jobAssignments.jobId, jobs.id), eq(jobAssignments.userId, user.id)))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .leftJoin(recurringSeries, eq(jobs.recurringSeriesId, recurringSeries.id))
    .leftJoin(customerLocations, and(eq(customerLocations.customerId, customers.id), eq(customerLocations.isPrimary, true), eq(customerLocations.isActive, true)))
    .where(and(eq(timeEntries.userId, user.id), isNull(timeEntries.clockOut), lt(jobs.scheduledDate, todayIso)))
    .orderBy(desc(timeEntries.clockIn))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  const stopRows = [
    ...todayRows,
    ...(staleRow ? [{ ...staleRow, homeDetails: null, mopHeadCount: null, ragCount: null, vacuumCount: null }] : []),
  ];
  const stopJobIds = stopRows.map((row) => row.jobId);

  const myEntries = stopJobIds.length
    ? await db
        .select({ jobId: timeEntries.jobId, clockIn: timeEntries.clockIn, clockOut: timeEntries.clockOut, minutesWorked: timeEntries.minutesWorked })
        .from(timeEntries)
        .where(and(eq(timeEntries.userId, user.id), inArray(timeEntries.jobId, stopJobIds)))
        .orderBy(desc(timeEntries.clockIn))
    : [];

  const crewRows = stopJobIds.length
    ? await db
        .select({ jobId: jobAssignments.jobId, userId: jobAssignments.userId, firstName: users.firstName })
        .from(jobAssignments)
        .innerJoin(users, eq(jobAssignments.userId, users.id))
        .where(inArray(jobAssignments.jobId, stopJobIds))
    : [];

  const crewEntries = stopJobIds.length
    ? await db
        .select({ jobId: timeEntries.jobId, userId: timeEntries.userId, clockOut: timeEntries.clockOut })
        .from(timeEntries)
        .where(inArray(timeEntries.jobId, stopJobIds))
    : [];

  const closedByJobUser = new Set(crewEntries.filter((entry) => entry.clockOut).map((entry) => `${entry.jobId}|${entry.userId}`));

  const openEntryByJob = new Map<string, { clockIn: string }>();
  const closedEntryByJob = new Map<string, { clockIn: string; clockOut: string; minutesWorked: number | null }>();
  for (const entry of myEntries) {
    if (!entry.clockOut) {
      if (!openEntryByJob.has(entry.jobId)) openEntryByJob.set(entry.jobId, { clockIn: entry.clockIn.toISOString() });
    } else if (!closedEntryByJob.has(entry.jobId)) {
      closedEntryByJob.set(entry.jobId, { clockIn: entry.clockIn.toISOString(), clockOut: entry.clockOut.toISOString(), minutesWorked: entry.minutesWorked });
    }
  }

  const coworkersFor = (jobId: string) =>
    crewRows
      .filter((crew) => crew.jobId === jobId && crew.userId !== user.id)
      .map((crew) => ({ firstName: crew.firstName, done: closedByJobUser.has(`${crew.jobId}|${crew.userId}`) }));

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
    coworkers: coworkersFor(row.jobId),
  }));

  const workdayInput: WorkdayInput = { stops, todayIso, timeZone: company.timezone };
  const workdayNow = deriveWorkdayNow(workdayInput);
  const primaryAction = primaryActionFor(workdayInput);
  const ledger = buildLedger(workdayInput);

  const stopCards = stopRows.map((row) => {
    const { homeDetails, mopHeadCount, ragCount, vacuumCount, recurrenceStartDate, ...rest } = row;
    void homeDetails;
    return {
      ...rest,
      ...equipmentForStop({ homeDetails, mopHeadCount, ragCount, vacuumCount }, roomTypeNameById),
      rotationalTaskReminder: rotationalTaskForDate(recurrenceStartDate, row.scheduledDate),
      workState: deriveJobState(stops.find((stop) => stop.jobId === row.jobId)!, todayIso),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      travelStartedAt: row.travelStartedAt ? row.travelStartedAt.toISOString() : null,
      arrivedAt: row.arrivedAt ? row.arrivedAt.toISOString() : null,
      workStartedAt: row.workStartedAt ? row.workStartedAt.toISOString() : null,
      myClosedEntry: closedEntryByJob.get(row.jobId) ?? null,
      coworkers: coworkersFor(row.jobId),
    };
  });

  const upcomingRows = await db
    .select(stopColumns)
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .leftJoin(recurringSeries, eq(jobs.recurringSeriesId, recurringSeries.id))
    .leftJoin(customerLocations, and(eq(customerLocations.customerId, customers.id), eq(customerLocations.isPrimary, true), eq(customerLocations.isActive, true)))
    .where(and(eq(jobAssignments.userId, user.id), eq(jobs.companyId, user.companyId), gt(jobs.scheduledDate, todayIso)))
    .orderBy(jobs.scheduledDate, jobs.scheduledStartTime)
    .limit(5);

  const upcomingJobs = upcomingRows.map(({ recurrenceStartDate, completedAt, travelStartedAt, arrivedAt, workStartedAt, ...rest }) => {
    void completedAt;
    void travelStartedAt;
    void arrivedAt;
    void workStartedAt;
    return { ...rest, rotationalTaskReminder: rotationalTaskForDate(recurrenceStartDate, rest.scheduledDate) };
  });

  const weeklyMinutes = await db
    .select({ minutesWorked: timeEntries.minutesWorked })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, user.id),
        gte(timeEntries.clockIn, startOfDayInstant(period.startDate, company.timezone)),
        lt(timeEntries.clockIn, startOfDayInstant(addDaysISO(period.endDate, 1), company.timezone))
      )
    )
    .then((rows) => rows.reduce((sum, row) => sum + Number(row.minutesWorked ?? 0), 0));

  return (
    <MyDayClient
      employeeName={`${user.firstName} ${user.lastName}`}
      officePhone={officePhone}
      companyTimezone={company.timezone}
      weeklyHours={Math.round((weeklyMinutes / 60) * 100) / 100}
      workdayNow={workdayNow}
      primaryAction={primaryAction}
      ledger={ledger}
      stops={stopCards}
      upcomingJobs={upcomingJobs}
      dayLabel={formatDayLabel(todayIso, company.timezone)}
      currentYear={new Date().getFullYear()}
      isAdmin={user.role === "admin"}
    />
  );
}
