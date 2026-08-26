import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import {
  calendarEventAssignments,
  calendarEvents,
  companies,
  customers,
  employeePto,
  employeeServiceLocations,
  jobAssignments,
  jobs,
  jobTypeEnum,
  quotes,
  recurringSeries,
  serviceLocations,
  users,
} from "@/db/schema";
import { isFieldEligible } from "@/lib/auth/field-staff";
import { getSchedulingRecommendations, parseSchedulingSettings, type SchedulingRecommendation } from "@/lib/scheduling/recommendations";
import { DEFAULT_JOB_DURATION_MINUTES } from "@/lib/scheduling/capacity";
import { getCustomerSchedulingProfile } from "@/lib/scheduling/job-memory";
import { rankSlots, haversineMiles, type GeoPoint, type ProximityStop } from "@/lib/scheduling/rank-slots";
import { resolvePermittedServiceAreaNames } from "@/lib/pricing/service-area-zips";
import { LONG_DRIVE_MILES, type NearbyJob, type SlotResponse } from "@/lib/scheduling/slot-contract";

const MAX_RANGE_DAYS = 60;
const MAX_SLOTS_RETURNED = 6;
const MAX_NEARBY_JOBS = 8;
/** Real, committed stops — mirrors capacity.ts's NON_COMMITTED_STATUSES.
 * A cancelled/no-show visit isn't a batching opportunity or a driving cost. */
const NON_STOP_STATUSES = new Set(["cancelled", "no_show"]);

function toCoordinates(row: { geocodedLatitude: string | null; geocodedLongitude: string | null } | null | undefined): GeoPoint | null {
  if (!row || row.geocodedLatitude == null || row.geocodedLongitude == null) return null;
  const latitude = Number(row.geocodedLatitude);
  const longitude = Number(row.geocodedLongitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

// The shipped SlotRequest type (slot-contract.ts) only declares jobId /
// customerId / startDate / endDate / preferredWindow, but its own doc
// comment says the customerId form is "customerId + totalJthMinutes" — the
// type is missing the fields that form actually needs (an estimate, a
// service type, and a branch, none of which exist on a customer row or can
// be inferred without a job/quote to read them from). Per the brief, that's
// flagged in the report rather than edited here; this route accepts those
// three as additional optional fields, required only on the customerId path.
const requestSchema = z
  .object({
    jobId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    preferredWindow: z.enum(["morning", "afternoon"]).nullable().optional(),
    totalJthMinutes: z.number().int().min(15).max(2400).optional(),
    serviceType: z.enum(jobTypeEnum).optional(),
    serviceLocationId: z.string().uuid().optional(),
  })
  .refine((data) => Boolean(data.jobId) !== Boolean(data.customerId), {
    message: "Provide either a job to reschedule or a customer to place a job for — not both, not neither.",
  });

function datesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** POST /api/scheduling/slots — the ranked half of the scheduling assistant.
 * Finds every feasible slot in range (getSchedulingRecommendations, unedited
 * hard-constraint engine), then orders and annotates them against the
 * customer's own history (job-memory.ts + rank-slots.ts). Admin-only and
 * company-scoped throughout; a job or customer outside the admin's company
 * 404s rather than leaking whether it exists. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;

  if (input.endDate < input.startDate) {
    return NextResponse.json({ error: "End date must be on or after start date." }, { status: 400 });
  }
  const rangeDays = datesBetween(input.startDate, input.endDate).length;
  if (rangeDays > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `That's a ${rangeDays}-day window — narrow it to ${MAX_RANGE_DAYS} days or fewer and try again.` }, { status: 400 });
  }

  // ---- resolve customerId / serviceLocationId / serviceType / totalJthMinutes ----
  let customerId: string;
  let serviceLocationId: string;
  let serviceType: string;
  let totalJthMinutes: number;
  let excludeJobId: string | null = null;
  // Fetched once per branch below, then reused for the proximity target
  // (geocoded coordinates) and the nearbyJobs customer name.
  let customerRow: { id: string; firstName: string; lastName: string; addressLine1: string | null; city: string | null; zip: string | null; geocodedLatitude: string | null; geocodedLongitude: string | null } | undefined;

  const customerColumns = {
    id: customers.id,
    firstName: customers.firstName,
    lastName: customers.lastName,
    addressLine1: customers.addressLine1,
    city: customers.city,
    zip: customers.zip,
    geocodedLatitude: customers.geocodedLatitude,
    geocodedLongitude: customers.geocodedLongitude,
  };

  if (input.jobId) {
    const [job] = await db
      .select({
        id: jobs.id,
        customerId: jobs.customerId,
        type: jobs.type,
        estimatedDurationMinutes: jobs.estimatedDurationMinutes,
        quoteId: jobs.quoteId,
        recurringSeriesId: jobs.recurringSeriesId,
      })
      .from(jobs)
      .where(and(eq(jobs.id, input.jobId), eq(jobs.companyId, admin.companyId)))
      .limit(1);
    if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

    excludeJobId = job.id;
    customerId = job.customerId;
    serviceType = job.type;
    totalJthMinutes = job.estimatedDurationMinutes ?? DEFAULT_JOB_DURATION_MINUTES;

    [customerRow] = await db.select(customerColumns).from(customers).where(and(eq(customers.id, customerId), eq(customers.companyId, admin.companyId))).limit(1);

    let resolvedLocationId: string | null = null;
    if (job.quoteId) {
      const [quoteRow] = await db.select({ serviceLocationId: quotes.serviceLocationId }).from(quotes).where(and(eq(quotes.id, job.quoteId), eq(quotes.companyId, admin.companyId))).limit(1);
      resolvedLocationId = quoteRow?.serviceLocationId ?? null;
    }
    if (!resolvedLocationId && job.recurringSeriesId) {
      const [seriesRow] = await db.select({ serviceLocationId: recurringSeries.serviceLocationId }).from(recurringSeries).where(and(eq(recurringSeries.id, job.recurringSeriesId), eq(recurringSeries.companyId, admin.companyId))).limit(1);
      resolvedLocationId = seriesRow?.serviceLocationId ?? null;
    }
    if (!resolvedLocationId) {
      const branchNames = customerRow ? resolvePermittedServiceAreaNames({ city: customerRow.city, zip: customerRow.zip }) : [];
      if (branchNames.length === 1) {
        const [branch] = await db.select({ id: serviceLocations.id }).from(serviceLocations).where(and(eq(serviceLocations.companyId, admin.companyId), eq(serviceLocations.name, branchNames[0]))).limit(1);
        resolvedLocationId = branch?.id ?? null;
      }
    }
    if (!resolvedLocationId) {
      return NextResponse.json({ error: "This job has no service branch on file. Set one on its quote, or set a service branch directly, before using the scheduling assistant." }, { status: 400 });
    }
    serviceLocationId = resolvedLocationId;
  } else {
    if (!input.totalJthMinutes || !input.serviceType || !input.serviceLocationId) {
      return NextResponse.json({ error: "Placing a new job needs an estimate, a service type, and a service branch." }, { status: 400 });
    }
    [customerRow] = await db.select(customerColumns).from(customers).where(and(eq(customers.id, input.customerId!), eq(customers.companyId, admin.companyId))).limit(1);
    if (!customerRow) return NextResponse.json({ error: "Customer not found." }, { status: 404 });

    const [branchRow] = await db.select({ id: serviceLocations.id }).from(serviceLocations).where(and(eq(serviceLocations.id, input.serviceLocationId), eq(serviceLocations.companyId, admin.companyId))).limit(1);
    if (!branchRow) return NextResponse.json({ error: "Service branch not found." }, { status: 404 });

    customerId = customerRow.id;
    serviceLocationId = input.serviceLocationId;
    serviceType = input.serviceType;
    totalJthMinutes = input.totalJthMinutes;
  }

  // ---- customer history (drives ranking, and corrects the duration below) ----
  const profile = await getCustomerSchedulingProfile({ companyId: admin.companyId, customerId });

  // Correct the duration BEFORE calling getSchedulingRecommendations, not
  // after — applying durationDriftFactor changes how long the job takes,
  // which changes feasibility (crew size, wall-clock finish time, workday
  // cutoff). rank-slots.ts reports the correction by inverting this same
  // factor, so it doesn't need the pre-correction number passed back in.
  const correctedTotalJthMinutes = profile.durationDriftFactor != null ? Math.round(totalJthMinutes * profile.durationDriftFactor) : totalJthMinutes;

  const preferredWindow = input.preferredWindow !== undefined ? input.preferredWindow : profile.usualWindow;

  // ---- scheduling inputs (same shape as POST /api/scheduling/recommendations) ----
  const [company, staff, eligibility, pto, jobRows, jobAssignmentRows, eventRows, eventAssignmentRows, geoJobRows] = await Promise.all([
    db.select({ settings: companies.settings }).from(companies).where(eq(companies.id, admin.companyId)).limit(1),
    db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role, isActive: users.isActive, isFieldStaff: users.isFieldStaff }).from(users).where(and(eq(users.companyId, admin.companyId), eq(users.isActive, true), isFieldEligible)),
    db.select({ userId: employeeServiceLocations.userId, serviceLocationId: employeeServiceLocations.serviceLocationId }).from(employeeServiceLocations).where(eq(employeeServiceLocations.companyId, admin.companyId)),
    db.select().from(employeePto).where(and(eq(employeePto.companyId, admin.companyId), lte(employeePto.startDate, input.endDate), gte(employeePto.endDate, input.startDate))),
    db
      .select({ id: jobs.id, scheduledDate: jobs.scheduledDate, scheduledStartTime: jobs.scheduledStartTime, estimatedDurationMinutes: jobs.estimatedDurationMinutes, status: jobs.status })
      .from(jobs)
      .where(and(eq(jobs.companyId, admin.companyId), gte(jobs.scheduledDate, input.startDate), lte(jobs.scheduledDate, input.endDate), ...(excludeJobId ? [ne(jobs.id, excludeJobId)] : []))),
    db
      .select({ jobId: jobAssignments.jobId, userId: jobAssignments.userId })
      .from(jobAssignments)
      .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
      .where(and(eq(jobs.companyId, admin.companyId), gte(jobs.scheduledDate, input.startDate), lte(jobs.scheduledDate, input.endDate), ...(excludeJobId ? [ne(jobs.id, excludeJobId)] : []))),
    db.select().from(calendarEvents).where(and(eq(calendarEvents.companyId, admin.companyId), gte(calendarEvents.scheduledDate, input.startDate), lte(calendarEvents.scheduledDate, input.endDate))),
    db
      .select({ eventId: calendarEventAssignments.eventId, userId: calendarEventAssignments.userId })
      .from(calendarEventAssignments)
      .innerJoin(calendarEvents, eq(calendarEventAssignments.eventId, calendarEvents.id))
      .where(and(eq(calendarEvents.companyId, admin.companyId), gte(calendarEvents.scheduledDate, input.startDate), lte(calendarEvents.scheduledDate, input.endDate))),
    // Every other job in range, with its customer's geocoded coordinates —
    // drives both per-slot proximity (crew's other stops that day) and the
    // nearbyJobs batching list. Straight-line only; see rank-slots.ts.
    db
      .select({
        id: jobs.id,
        scheduledDate: jobs.scheduledDate,
        scheduledStartTime: jobs.scheduledStartTime,
        status: jobs.status,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        addressLine1: customers.addressLine1,
        city: customers.city,
        geocodedLatitude: customers.geocodedLatitude,
        geocodedLongitude: customers.geocodedLongitude,
      })
      .from(jobs)
      .innerJoin(customers, eq(jobs.customerId, customers.id))
      .where(and(eq(jobs.companyId, admin.companyId), gte(jobs.scheduledDate, input.startDate), lte(jobs.scheduledDate, input.endDate), ...(excludeJobId ? [ne(jobs.id, excludeJobId)] : []))),
  ]);

  const settings = parseSchedulingSettings((company[0]?.settings as Record<string, unknown> | null) ?? {});
  const idsByUser = new Map<string, string[]>();
  eligibility.forEach((row) => idsByUser.set(row.userId, [...(idsByUser.get(row.userId) ?? []), row.serviceLocationId]));
  const assignmentsByJob = new Map<string, string[]>();
  jobAssignmentRows.forEach((row) => assignmentsByJob.set(row.jobId, [...(assignmentsByJob.get(row.jobId) ?? []), row.userId]));
  const assignmentsByEvent = new Map<string, string[]>();
  eventAssignmentRows.forEach((row) => assignmentsByEvent.set(row.eventId, [...(assignmentsByEvent.get(row.eventId) ?? []), row.userId]));

  const employees = staff.map((employee) => ({
    ...employee,
    isFieldStaff: employee.role === "employee" || employee.isFieldStaff,
    serviceLocationIds: idsByUser.get(employee.id) ?? [],
  }));
  const employeesAtBranch = employees.filter((employee) => employee.isFieldStaff && employee.serviceLocationIds.includes(serviceLocationId));

  const jobsForEngine = jobRows.map((job) => ({ ...job, assignedUserIds: assignmentsByJob.get(job.id) ?? [] }));
  const calendarEventsForEngine = eventRows.map((event) => ({ ...event, attendeeUserIds: assignmentsByEvent.get(event.id) ?? [] }));

  // ---- proximity: this address's coordinates, other stops that day, nearby batching candidates ----
  const targetCoordinates = toCoordinates(customerRow ?? null);
  const employeeNameById = new Map(staff.map((employee) => [employee.id, `${employee.firstName} ${employee.lastName}`]));
  const realStopRows = geoJobRows.filter((row) => !NON_STOP_STATUSES.has(row.status));

  const stopsByDate = new Map<string, ProximityStop[]>();
  for (const row of realStopRows) {
    const stop: ProximityStop = {
      jobId: row.id,
      customerName: `${row.customerFirstName} ${row.customerLastName}`.trim(),
      employeeIds: assignmentsByJob.get(row.id) ?? [],
      latitude: row.geocodedLatitude != null ? Number(row.geocodedLatitude) : null,
      longitude: row.geocodedLongitude != null ? Number(row.geocodedLongitude) : null,
    };
    const list = stopsByDate.get(row.scheduledDate) ?? [];
    list.push(stop);
    stopsByDate.set(row.scheduledDate, list);
  }

  // Nearest first, unassigned first — those are the real batching
  // opportunity (a job already staffed doesn't need this crew). Empty
  // whenever this address has no cached coordinates: never a fabricated
  // zero, and never a distance sentence the UI can't back.
  const nearbyJobs: NearbyJob[] = !targetCoordinates
    ? []
    : realStopRows
        .flatMap((row) => {
          const coords = toCoordinates(row);
          if (!coords) return [];
          const miles = haversineMiles(targetCoordinates, coords);
          if (miles > LONG_DRIVE_MILES) return [];
          const assignedIds = assignmentsByJob.get(row.id) ?? [];
          const assignedNames = assignedIds.map((id) => employeeNameById.get(id) ?? "Assigned");
          return [
            {
              jobId: row.id,
              customerName: `${row.customerFirstName} ${row.customerLastName}`.trim(),
              addressLine1: row.addressLine1,
              city: row.city,
              scheduledDate: row.scheduledDate,
              scheduledStartTime: row.scheduledStartTime,
              status: row.status,
              miles: Math.round(miles * 10) / 10,
              assignedNames,
            } satisfies NearbyJob,
          ];
        })
        .sort((a, b) => (a.assignedNames.length === 0 ? 0 : 1) - (b.assignedNames.length === 0 ? 0 : 1) || a.miles - b.miles)
        .slice(0, MAX_NEARBY_JOBS);

  // getSchedulingRecommendations deliberately returns at most 3 results per
  // call (one complete recommendation per date/window, sliced to 3 across
  // the whole call) — a UI convenience for its one existing caller, but too
  // few candidates to rank against 6+ days of real availability. Rather than
  // widening the date range passed to a single call (the slice is over the
  // combined date+window list, so a wider range does not raise the ceiling
  // above 3), this calls the unedited engine once per date in range and
  // concatenates the results — each single-day call is always under the
  // per-call cap (at most a few booking windows configured), so nothing is
  // silently dropped.
  const recommendations: SchedulingRecommendation[] = [];
  for (const date of datesBetween(input.startDate, input.endDate)) {
    recommendations.push(
      ...getSchedulingRecommendations({
        startDate: date,
        endDate: date,
        serviceLocationId,
        serviceType,
        totalJthMinutes: correctedTotalJthMinutes,
        preferredWindow,
        employees,
        pto,
        jobs: jobsForEngine,
        calendarEvents: calendarEventsForEngine,
        settings,
      })
    );
  }

  const rankedAll = rankSlots(recommendations, profile, { targetCoordinates, stopsByDate });
  const slots = rankedAll.slice(0, MAX_SLOTS_RETURNED);

  let emptyReason: SlotResponse["emptyReason"];
  if (slots.length === 0) {
    const hasWorkingDay = datesBetween(input.startDate, input.endDate).some((date) => {
      const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
      return settings.workingDays.includes(weekday) && !settings.holidays.includes(date);
    });
    if (!hasWorkingDay) emptyReason = "no_working_days";
    else if (employeesAtBranch.length === 0) emptyReason = "no_eligible_staff";
    else emptyReason = "fully_booked";
  }

  const response: SlotResponse = { slots, profile, nearbyJobs, ...(emptyReason ? { emptyReason } : {}) };
  return NextResponse.json(response);
}
