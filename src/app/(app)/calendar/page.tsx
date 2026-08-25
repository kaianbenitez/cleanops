import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  and,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notExists,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  calendarEventAssignments,
  calendarEvents,
  companies,
  customers,
  jobAssignments,
  jobStatusEnum,
  jobTypeEnum,
  jobs,
  recurrenceEnum,
  recurringSeries,
  roomTypes,
  services,
  timeEntries,
  users,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isFieldEligible } from "@/lib/auth/field-staff";
import {
  addDays,
  formatDayLabel,
  startOfWeek,
  toISODate,
} from "@/lib/scheduling/dates";
import { todayInTimeZone } from "@/lib/dashboard/range";
import { listEmployeePto } from "@/lib/scheduling/pto";
import { DEFAULT_WORKDAY_HOURS } from "@/lib/scheduling/capacity";
import Board from "./board";
import WeekBoard from "./week-board";
import MonthBoard from "./month-board";
import TodayListBoard from "./today-list-board";
import CalendarToolbar from "./calendar-toolbar";
import DayLedger from "./day-ledger";
import CalendarStateSync from "./state-sync";
import WeekendOrphanBanner from "./weekend-orphan-banner";
import { aggregateCalendarAttention, DEFAULT_WORKDAY_END_MINUTES, DEFAULT_WORKDAY_START_MINUTES, deriveCalendarReadiness, deriveJobReadiness, employeeColorAt } from "./shared";
import { rotationalTaskForDate } from "@/lib/scheduling/rotational-tasks";

const CALENDAR_STATE_COOKIE = "co_calendar_state";

function readCalendarStateCookie(
  raw: string | undefined,
): Partial<Record<"view" | "axis" | "day" | "week" | "month", string>> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (!parsed || typeof parsed !== "object") return {};
    const result: Partial<
      Record<"view" | "axis" | "day" | "week" | "month", string>
    > = {};
    if (
      parsed.view === "week" ||
      parsed.view === "month" ||
      parsed.view === "board" ||
      // Legacy values from before the Board merge — still accepted so the
      // cookie and old bookmarks survive. Resolved to board+axis below.
      parsed.view === "staff" ||
      parsed.view === "staff_vertical" ||
      parsed.view === "list"
    )
      result.view = parsed.view;
    if (parsed.axis === "vertical" || parsed.axis === "horizontal")
      result.axis = parsed.axis;
    if (
      typeof parsed.day === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(parsed.day)
    )
      result.day = parsed.day;
    if (
      typeof parsed.week === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(parsed.week)
    )
      result.week = parsed.week;
    if (typeof parsed.month === "string" && /^\d{4}-\d{2}$/.test(parsed.month))
      result.month = parsed.month;
    return result;
  } catch {
    return {};
  }
}

type SearchParams = {
  view?: string;
  axis?: string;
  week?: string;
  day?: string;
  month?: string;
  employeeId?: string;
  type?: string;
  recurrence?: string;
  status?: string;
  zip?: string;
  assignment?: string;
  queue?: string;
  attention?: string;
};

export type CalendarEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  hiredDate: string | null;
  isActive: boolean;
  role: string;
  calendarColor?: string;
};

export type CalendarJob = {
  id: string;
  type: string;
  status: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number | null;
  priceCents: number;
  discountCents: number;
  customerId: string;
  recurringSeriesId: string | null;
  recurrenceFrequency: string | null;
  recurrenceStartDate: string | null;
  serviceId: string | null;
  addOnIds: string[];
  customerFirstName: string;
  customerLastName: string;
  companyName: string | null;
  clientType: string;
  customerZip: string | null;
  customerCity: string | null;
  customerState: string | null;
  customerAddress: string | null;
  customerHomeDetails: Record<string, unknown>;
  roomCounts: { name: string; count: number }[];
  customerNotes: string | null;
  gateCodeOrKeyNotes: string | null;
  doNotClean: string | null;
  petNotes: string | null;
  assignedUserIds: string[];
  rotationalTaskReminder: ReturnType<typeof rotationalTaskForDate>;
};

export type CalendarDaySummary = {
  scheduledDate: string;
  jobs: number;
  unassigned: number;
  needsReview: number;
  needsTime: number;
  ready: number;
};

export type CalendarReadiness = ReturnType<typeof deriveJobReadiness>;

export type CalendarAppointment = {
  id: string;
  title: string;
  note: string | null;
  scheduledDate: string;
  startTime: string | null;
  durationMinutes: number | null;
  isAllDay: boolean;
  category: string;
  status: string;
  attendeeUserIds: string[];
};

export type StaffRosterMember = {
  id: string;
  firstName: string;
  lastName: string;
};

function query(params: SearchParams) {
  const result = new URLSearchParams();
  Object.entries(params).forEach(
    ([key, value]) => value && result.set(key, value),
  );
  const text = result.toString();
  return text ? `?${text}` : "";
}

function monthBounds(date: Date) {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
  );
  const end = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  );
  return { start, end };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/my-day");

  const sp = await searchParams;
  const cookieStore = await cookies();
  const savedState = readCalendarStateCookie(
    cookieStore.get(CALENDAR_STATE_COOKIE)?.value,
  );
  // Canonical view is "board" (crews-as-columns/rows merged behind an axis
  // toggle); "staff" and "staff_vertical" are accepted legacy aliases so the
  // cookie and old bookmarks keep resolving. Axis defaults to "vertical",
  // the old VerticalBoard's geometry, matching the pre-merge default view.
  const effectiveView = sp.view ?? savedState.view;
  const effectiveAxis = sp.axis ?? savedState.axis;
  let view: "board" | "week" | "month" | "list";
  let axis: "vertical" | "horizontal";
  if (effectiveView === "staff") {
    view = "board";
    axis = "vertical";
  } else if (effectiveView === "staff_vertical") {
    view = "board";
    axis = "vertical";
  } else if (
    effectiveView === "week" ||
    effectiveView === "month" ||
    effectiveView === "list" ||
    effectiveView === "board"
  ) {
    view = effectiveView;
    axis = effectiveAxis === "horizontal" ? "horizontal" : "vertical";
  } else {
    view = "board";
    axis = "vertical";
  }
  const [company] = await db
    .select({ timezone: companies.timezone, settings: companies.settings })
    .from(companies)
    .where(eq(companies.id, admin.companyId))
    .limit(1);
  if (!company) redirect("/login");
  const holidays = Array.isArray(
    (company.settings as { holidays?: unknown } | null)?.holidays,
  )
    ? (company.settings as { holidays: unknown[] }).holidays.filter(
        (value): value is string =>
          typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value),
      )
    : [];
  const configuredWorkingDays = Array.isArray(
    (company.settings as { workingDays?: unknown } | null)?.workingDays,
  )
    ? [
        ...new Set(
          (company.settings as { workingDays: unknown[] }).workingDays.filter(
            (value): value is number =>
              typeof value === "number" &&
              Number.isInteger(value) &&
              value >= 0 &&
              value <= 6,
          ),
        ),
      ].sort()
    : [];
  const workingDays = configuredWorkingDays.length
    ? configuredWorkingDays
    : [1, 2, 3, 4, 5];
  // Same defensive-parse-with-default pattern as workingDays/holidays above.
  // No migration: workdayStartMinutes/workdayEndMinutes are new keys in the
  // free-form settings jsonb, not a schema change (see settings/route.ts).
  const rawWorkdayStart = (
    company.settings as { workdayStartMinutes?: unknown } | null
  )?.workdayStartMinutes;
  const rawWorkdayEnd = (
    company.settings as { workdayEndMinutes?: unknown } | null
  )?.workdayEndMinutes;
  const workdayStartMinutes =
    typeof rawWorkdayStart === "number" &&
    Number.isInteger(rawWorkdayStart) &&
    rawWorkdayStart >= 0 &&
    rawWorkdayStart <= 1439
      ? rawWorkdayStart
      : DEFAULT_WORKDAY_START_MINUTES;
  const workdayEndMinutes =
    typeof rawWorkdayEnd === "number" &&
    Number.isInteger(rawWorkdayEnd) &&
    rawWorkdayEnd > workdayStartMinutes &&
    rawWorkdayEnd <= 1439
      ? rawWorkdayEnd
      : DEFAULT_WORKDAY_END_MINUTES;
  // Per-cleaner contracted day, used by the Board's capacity meter (caps
  // "used / available" at this even when the working window is longer).
  const rawWorkdayHours = (
    company.settings as { workdayHoursPerCleaner?: unknown } | null
  )?.workdayHoursPerCleaner;
  const workdayHoursPerCleaner =
    typeof rawWorkdayHours === "number" && rawWorkdayHours > 0
      ? rawWorkdayHours
      : DEFAULT_WORKDAY_HOURS;
  const workdayMinutesPerCleaner = workdayHoursPerCleaner * 60;

  const todayIso = todayInTimeZone(new Date(), company.timezone);
  const today = new Date(`${todayIso}T00:00:00.000Z`);
  const effectiveDay = sp.day ?? savedState.day;
  const dayAnchor = effectiveDay
    ? new Date(`${effectiveDay}T00:00:00.000Z`)
    : today;
  const effectiveWeek = sp.week ?? savedState.week;
  const weekStart = startOfWeek(
    effectiveWeek ? new Date(`${effectiveWeek}T00:00:00.000Z`) : today,
  );
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
  ).filter((day) => workingDays.includes(day.getUTCDay()));
  const effectiveMonth = sp.month ?? savedState.month;
  const monthAnchor = effectiveMonth
    ? new Date(`${effectiveMonth}-01T00:00:00.000Z`)
    : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const month = monthBounds(monthAnchor);
  const days =
    view === "board" || view === "list"
      ? [dayAnchor]
      : view === "month"
        ? []
        : weekDays;
  const start = view === "month" ? toISODate(month.start) : toISODate(days[0]);
  const end =
    view === "month" ? toISODate(month.end) : toISODate(days[days.length - 1]);

  // Includes inactive/force-deleted employees so a job's crew still resolves
  // a name (and an "Inactive" badge) for someone no longer on the active
  // roster. Components that offer employees as *new* assignment targets
  // (Staff board lanes, technician pickers) filter this down to active-only
  // themselves rather than this query excluding inactive people outright.
  const employeesQuery = db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      hiredDate: users.hiredDate,
      isActive: users.isActive,
      role: users.role,
    })
    .from(users)
    .where(
      and(
        eq(users.companyId, admin.companyId),
        isFieldEligible,
      ),
    )
    .orderBy(users.hiredDate, users.firstName, users.lastName);

  const conditions = [
    eq(jobs.companyId, admin.companyId),
    gte(jobs.scheduledDate, start),
    lte(jobs.scheduledDate, end),
  ];
  if (sp.type && (jobTypeEnum as readonly string[]).includes(sp.type))
    conditions.push(
      eq(jobs.type, sp.type as (typeof jobs.type.enumValues)[number]),
    );
  if (sp.status && (jobStatusEnum as readonly string[]).includes(sp.status))
    conditions.push(
      eq(jobs.status, sp.status as (typeof jobs.status.enumValues)[number]),
    );
  else conditions.push(ne(jobs.status, "cancelled"));
  if (sp.zip) conditions.push(ilike(customers.zip, `${sp.zip}%`));
  if (sp.recurrence === "none") conditions.push(isNull(recurringSeries.id));
  if (sp.recurrence === "recurring")
    conditions.push(isNotNull(recurringSeries.id));
  if (
    sp.recurrence &&
    sp.recurrence !== "none" &&
    sp.recurrence !== "recurring" &&
    (recurrenceEnum as readonly string[]).includes(sp.recurrence)
  )
    conditions.push(
      eq(
        recurringSeries.frequency,
        sp.recurrence as (typeof recurringSeries.frequency.enumValues)[number],
      ),
    );

  // A fresh builder per call — drizzle's query builder mutates in place, so a
  // shared instance reused across multiple `.where()`/`.innerJoin()` call
  // sites (as this was) silently corrupts every query holding a reference to
  // it. rowsQuery and unassignedRowsQuery both used to chain off one shared
  // `base`, so whichever query ran last "won" and its where-clause quietly
  // became every other query's where-clause too — the staff board's job list
  // ended up filtered down to unassigned-only jobs, so anything assigned
  // (old or newly dragged onto a column) vanished from the day entirely.
  const buildBaseQuery = () =>
    db
      .select({
        id: jobs.id,
        type: jobs.type,
        status: jobs.status,
        scheduledDate: jobs.scheduledDate,
        scheduledStartTime: jobs.scheduledStartTime,
        estimatedDurationMinutes: jobs.estimatedDurationMinutes,
        priceCents: jobs.priceCents,
        discountCents: jobs.discountCents,
        customerId: jobs.customerId,
        recurringSeriesId: jobs.recurringSeriesId,
        recurrenceFrequency: recurringSeries.frequency,
        recurrenceStartDate: recurringSeries.startDate,
        serviceId: jobs.serviceId,
        addOnIds: jobs.addOnIds,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        companyName: customers.companyName,
        clientType: customers.clientType,
        customerZip: customers.zip,
        customerCity: customers.city,
        customerState: customers.state,
        customerAddress: customers.addressLine1,
        customerHomeDetails: customers.homeDetails,
        customerNotes: customers.generalNotes,
        gateCodeOrKeyNotes: customers.gateCodeOrKeyNotes,
        doNotClean: customers.doNotClean,
        petNotes: customers.petNotes,
      })
      .from(jobs)
      .innerJoin(customers, eq(jobs.customerId, customers.id))
      .leftJoin(recurringSeries, eq(jobs.recurringSeriesId, recurringSeries.id));

  const rowsQuery =
    sp.employeeId
        ? buildBaseQuery()
            .innerJoin(
              jobAssignments,
              and(
                eq(jobAssignments.jobId, jobs.id),
                eq(jobAssignments.userId, sp.employeeId),
              ),
            )
            .where(and(...conditions))
            .orderBy(jobs.scheduledDate, jobs.scheduledStartTime)
        : buildBaseQuery()
            .where(and(...conditions))
            .orderBy(jobs.scheduledDate, jobs.scheduledStartTime);

  // `queue=unassigned` (set by the old filter-bar.tsx toggle, now removed —
  // see filter-bar.tsx) and `assignment=unassigned` (set by
  // calendar-filters-panel.tsx's Assignment select) used to be two params
  // for the same concept. `assignment` is the one that actually filters rows
  // below, so it's the one that survives; a legacy `queue=unassigned` link
  // is normalized onto it here rather than filtered on separately, and
  // filterParams below propagates the normalized value forward so
  // prev/next/today links upgrade the URL instead of re-emitting `queue`.
  const effectiveAssignment =
    sp.assignment ?? (sp.queue === "unassigned" ? "unassigned" : undefined);

  const monthConditions =
    effectiveAssignment === "unassigned"
      ? [
          ...conditions,
          notExists(
            db
              .select({ jobId: jobAssignments.jobId })
              .from(jobAssignments)
              .where(eq(jobAssignments.jobId, jobs.id)),
          ),
        ]
      : conditions;
  const buildMonthSummary = () =>
    db
      .select({
        scheduledDate: jobs.scheduledDate,
        jobs: sql<number>`count(*)`,
        unassigned: sql<number>`count(*) filter (where not exists (select 1 from ${jobAssignments} where ${jobAssignments.jobId} = ${jobs.id}))`,
        needsReview: sql<number>`count(*) filter (where ${jobs.status} = 'no_show')`,
        needsTime: sql<number>`count(*) filter (where ${jobs.scheduledStartTime} is null)`,
        ready: sql<number>`count(*) filter (where ${jobs.scheduledStartTime} is not null and exists (select 1 from ${jobAssignments} where ${jobAssignments.jobId} = ${jobs.id}) and ${jobs.status} not in ('cancelled', 'no_show'))`,
      })
      .from(jobs)
      .innerJoin(customers, eq(jobs.customerId, customers.id))
      .leftJoin(recurringSeries, eq(jobs.recurringSeriesId, recurringSeries.id));
  const monthRowsQuery =
    view === "month"
      ? sp.employeeId
        ? buildMonthSummary()
            .innerJoin(
              jobAssignments,
              and(
                eq(jobAssignments.jobId, jobs.id),
                eq(jobAssignments.userId, sp.employeeId),
              ),
            )
            .where(and(...monthConditions))
            .groupBy(jobs.scheduledDate)
            .orderBy(jobs.scheduledDate)
        : buildMonthSummary()
            .where(and(...monthConditions))
            .groupBy(jobs.scheduledDate)
            .orderBy(jobs.scheduledDate)
      : Promise.resolve([]);

  // Month and week deliberately omit weekends. Keep any imported weekend work
  // visible so a dispatcher can still reach it from the Staff view. Bounded to
  // today-forward: past weekend jobs are already done and don't need dispatch
  // attention, and the lower bound lets this use the (companyId, scheduledDate)
  // index instead of scanning every weekend job the company has ever had.
  const weekendRowsQuery = db
    .select({
      count: sql<number>`count(*)`,
      firstDate: sql<string | null>`min(${jobs.scheduledDate})`,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.companyId, admin.companyId),
        gte(jobs.scheduledDate, todayIso),
        ne(jobs.status, "cancelled"),
        sql`extract(dow from ${jobs.scheduledDate}) in (0, 6)`,
      ),
    );

  // Needed by both the board's PTO lane rendering (board only) and the
  // Needs-attention count (board, list, week — see attentionCount below).
  // Month is deliberately excluded: it never fetches full job rows (see
  // rowsQuery above), so there is nothing here for PTO to categorize against
  // and fetching it would be a pure-waste query.
  const ptoRowsQuery =
    view === "board" || view === "list" || view === "week" || view === "month"
      ? listEmployeePto({
          companyId: admin.companyId,
          startDate: start,
          endDate: end,
        })
      : Promise.resolve([]);

  // Internal appointments (staff meetings) — additive to the jobs data
  // above, same date bounds, no join against customers/jobs at all.
  const appointmentEventsQuery = db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.companyId, admin.companyId),
        gte(calendarEvents.scheduledDate, start),
        lte(calendarEvents.scheduledDate, end),
      ),
    )
    .orderBy(calendarEvents.scheduledDate, calendarEvents.startTime);

  // Calendar appointments are part of the field schedule, so their attendee
  // picker should use the same field-staff roster as jobs. This keeps office
  // staff out while retaining admins who are explicitly marked as hybrid /
  // field staff (for example, Brittney).
  const staffRosterQuery = db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(and(eq(users.companyId, admin.companyId), eq(users.isActive, true), isFieldEligible))
    .orderBy(users.firstName, users.lastName);

  const [
    employees,
    rows,
    [weekendOrphans],
    ptoRows,
    monthRows,
    appointmentEvents,
    staffRoster,
  ] = (await Promise.all([
    employeesQuery,
    rowsQuery,
    weekendRowsQuery,
    ptoRowsQuery,
    monthRowsQuery,
    appointmentEventsQuery,
    staffRosterQuery,
  ])) as [
    CalendarEmployee[],
    Omit<CalendarJob, "assignedUserIds">[],
    { count: number; firstDate: string | null }[],
    Awaited<ReturnType<typeof listEmployeePto>>,
    CalendarDaySummary[],
    (typeof calendarEvents.$inferSelect)[],
    StaffRosterMember[],
  ];

  const appointmentEventIds = appointmentEvents.map((event) => event.id);
  const appointmentAssignments = appointmentEventIds.length
    ? await db
        .select({ eventId: calendarEventAssignments.eventId, userId: calendarEventAssignments.userId })
        .from(calendarEventAssignments)
        .where(inArray(calendarEventAssignments.eventId, appointmentEventIds))
    : [];
  const attendeesByEvent = new Map<string, string[]>();
  appointmentAssignments.forEach((assignment) =>
    attendeesByEvent.set(assignment.eventId, [
      ...(attendeesByEvent.get(assignment.eventId) ?? []),
      assignment.userId,
    ]),
  );
  const appointments: CalendarAppointment[] = appointmentEvents.map((event) => ({
    id: event.id,
    title: event.title,
    note: event.note,
    scheduledDate: event.scheduledDate,
    startTime: event.startTime,
    durationMinutes: event.durationMinutes,
    isAllDay: event.isAllDay,
    category: event.category,
    status: event.status,
    attendeeUserIds: attendeesByEvent.get(event.id) ?? [],
  }));
  const appointmentCountByDate = new Map<string, number>();
  appointments
    .filter((appointment) => appointment.status !== "cancelled")
    .forEach((appointment) =>
      appointmentCountByDate.set(
        appointment.scheduledDate,
        (appointmentCountByDate.get(appointment.scheduledDate) ?? 0) + 1,
      ),
    );

  const assignments = rows.length
    ? await db
        .select({ jobId: jobAssignments.jobId, userId: users.id })
        .from(jobAssignments)
        .innerJoin(users, eq(jobAssignments.userId, users.id))
        .where(
          inArray(
            jobAssignments.jobId,
            rows.map((row) => row.id),
          ),
        )
    : [];
  const configuredRoomTypes = await db
    .select({ id: roomTypes.id, name: roomTypes.name })
    .from(roomTypes)
    .where(eq(roomTypes.companyId, admin.companyId))
    .orderBy(roomTypes.sortOrder);
  const roomTypeNameById = new Map(
    configuredRoomTypes.map((roomType) => [roomType.id, roomType.name]),
  );
  const clockEntries =
    view === "list" && rows.length
      ? await db
          .select({
            id: timeEntries.id,
            jobId: timeEntries.jobId,
            userId: timeEntries.userId,
            clockIn: timeEntries.clockIn,
            clockOut: timeEntries.clockOut,
            minutesWorked: timeEntries.minutesWorked,
          })
          .from(timeEntries)
          .where(
            inArray(
              timeEntries.jobId,
              rows.map((row) => row.id),
            ),
          )
      : [];
  const byJob = new Map<string, string[]>();
  employees.forEach((employee, index) => {
    employee.calendarColor = employeeColorAt(index);
  });
  assignments.forEach((assignment) =>
    byJob.set(assignment.jobId, [
      ...(byJob.get(assignment.jobId) ?? []),
      assignment.userId,
    ]),
  );
  const jobsWithAssignments: CalendarJob[] = rows.map((row) => {
    const storedRoomCounts = row.customerHomeDetails.roomCounts;
    const roomCountById =
      storedRoomCounts && typeof storedRoomCounts === "object"
        ? (storedRoomCounts as Record<string, unknown>)
        : {};
    const roomCounts = Object.entries(roomCountById)
      .map(([roomTypeId, count]) => ({
        name: roomTypeNameById.get(roomTypeId),
        count: Number(count),
      }))
      .filter(
        (room): room is { name: string; count: number } =>
          Boolean(room.name) && Number.isFinite(room.count) && room.count > 0,
      );
    return {
      ...row,
      roomCounts,
      assignedUserIds: byJob.get(row.id) ?? [],
      rotationalTaskReminder: rotationalTaskForDate(row.recurrenceStartDate, row.scheduledDate),
    };
  });
  const displayedJobs =
    effectiveAssignment === "unassigned"
      ? jobsWithAssignments.filter((job) => !job.assignedUserIds.length)
      : jobsWithAssignments;

  // Only the List view renders a friendly service name — resolve custom
  // catalog presets (services.category = "main"/"add_on") to their names in
  // one batched query rather than joining services into every calendar view.
  const catalogIds =
    view === "list"
      ? [
          ...new Set(
            displayedJobs.flatMap((job) => [
              ...(job.serviceId ? [job.serviceId] : []),
              ...job.addOnIds,
            ]),
          ),
        ]
      : [];
  const catalogRows = catalogIds.length
    ? await db
        .select({ id: services.id, name: services.name })
        .from(services)
        .where(
          and(
            inArray(services.id, catalogIds),
            eq(services.companyId, admin.companyId),
          ),
        )
    : [];
  const catalogNameById = new Map(
    catalogRows.map((row) => [row.id, row.name]),
  );
  const listJobs = displayedJobs.map((job) => ({
    ...job,
    serviceName: job.serviceId
      ? (catalogNameById.get(job.serviceId) ?? null)
      : null,
    addOnNames: job.addOnIds
      .map((id) => catalogNameById.get(id))
      .filter((name): name is string => !!name),
  }));

  // One shared readiness decision feeds every server-derived view. The Board
  // runs the same pure helper against its optimistic job set after edits.
  const activeJobs = jobsWithAssignments.filter(
    (job) =>
      !["cancelled", "completed", "no_show"].includes(job.status) &&
      (effectiveAssignment !== "unassigned" || job.assignedUserIds.length === 0),
  );
  const readinessByJobId = deriveCalendarReadiness(activeJobs, ptoRows, {
    workdayMinutes: workdayMinutesPerCleaner,
    windowStart: workdayStartMinutes,
    windowEnd: workdayEndMinutes,
  });
  const monthReadinessByDate = new Map<string, Record<string, number>>();
  for (const job of activeJobs) {
    const state = readinessByJobId.get(job.id)?.primary;
    if (!state) continue;
    const counts = monthReadinessByDate.get(job.scheduledDate) ?? {};
    counts[state] = (counts[state] ?? 0) + 1;
    monthReadinessByDate.set(job.scheduledDate, counts);
  }

  const filterParams: SearchParams = {
    view: sp.view,
    axis: sp.axis,
    week: sp.week,
    day: sp.day,
    month: sp.month,
    employeeId: sp.employeeId,
    type: sp.type,
    recurrence: sp.recurrence,
    status: sp.status,
    zip: sp.zip,
    assignment: effectiveAssignment,
  };
  const previousDate =
    view === "month"
      ? new Date(
          Date.UTC(
            monthAnchor.getUTCFullYear(),
            monthAnchor.getUTCMonth() - 1,
            1,
          ),
        )
      : view === "board" || view === "list"
        ? addDays(dayAnchor, -1)
        : addDays(weekStart, -7);
  const nextDate =
    view === "month"
      ? new Date(
          Date.UTC(
            monthAnchor.getUTCFullYear(),
            monthAnchor.getUTCMonth() + 1,
            1,
          ),
        )
      : view === "board" || view === "list"
        ? addDays(dayAnchor, 1)
        : addDays(weekStart, 7);
  const prev = query({
    ...filterParams,
    ...(view === "month"
      ? { month: toISODate(previousDate).slice(0, 7) }
      : view === "board" || view === "list"
        ? { day: toISODate(previousDate) }
        : { week: toISODate(previousDate) }),
  });
  const next = query({
    ...filterParams,
    ...(view === "month"
      ? { month: toISODate(nextDate).slice(0, 7) }
      : view === "board" || view === "list"
        ? { day: toISODate(nextDate) }
        : { week: toISODate(nextDate) }),
  });
  const todayQuery = query({
    ...filterParams,
    ...(view === "month"
      ? { month: todayIso.slice(0, 7) }
      : view === "board" || view === "list"
        ? { day: todayIso }
        : { week: toISODate(startOfWeek(today)) }),
  });

  const currentDate =
    view === "month"
      ? monthAnchor
      : view === "board" || view === "list"
        ? dayAnchor
        : weekStart;
  const dateLabel =
    view === "month"
      ? monthAnchor.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        })
      : view === "board" || view === "list"
        ? formatDayLabel(dayAnchor)
        : `${weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} to ${weekDays[weekDays.length - 1].toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  const stateAnchor =
    view === "month"
      ? toISODate(monthAnchor).slice(0, 7)
      : view === "board" || view === "list"
        ? toISODate(dayAnchor)
        : toISODate(weekStart);
  // Keep the toolbar count and the Board rail on the same categorization. An
  // entry is an issue; a job can contribute more than one issue, so retain
  // both totals and the first affected date for Month navigation.
  const attentionEntries =
    view === "board" || view === "list"
      ? aggregateCalendarAttention(displayedJobs, ptoRows, toISODate(dayAnchor), { workdayMinutes: workdayMinutesPerCleaner, windowStart: workdayStartMinutes, windowEnd: workdayEndMinutes })
      : view === "week"
        ? weekDays.flatMap((day) => {
            const dayIso = toISODate(day);
            return aggregateCalendarAttention(
              displayedJobs.filter((job) => job.scheduledDate === dayIso),
              ptoRows,
              dayIso,
              { workdayMinutes: workdayMinutesPerCleaner, windowStart: workdayStartMinutes, windowEnd: workdayEndMinutes },
            );
          })
        : view === "month"
          ? [...new Set(displayedJobs.map((job) => job.scheduledDate))]
              .sort()
              .flatMap((dayIso) =>
                aggregateCalendarAttention(
                  displayedJobs.filter((job) => job.scheduledDate === dayIso),
                  ptoRows,
                  dayIso,
                  { workdayMinutes: workdayMinutesPerCleaner, windowStart: workdayStartMinutes, windowEnd: workdayEndMinutes },
                ),
              )
          : [];
  const attentionCount = attentionEntries.length;
  const attentionJobCount = new Set(attentionEntries.map((entry) => entry.job.id)).size;
  const attentionDateIso = attentionEntries
    .map((entry) => entry.job.scheduledDate)
    .sort()[0];
  const attentionIssuesByDate = Object.fromEntries(
    attentionEntries.reduce((counts, entry) => {
      counts.set(entry.job.scheduledDate, (counts.get(entry.job.scheduledDate) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()),
  );
  // Derived from displayedJobs (not jobsWithAssignments) so every active
  // filter chip — including "Jobs without a crew" (assignment=unassigned),
  // which only narrows displayedJobs — actually moves these figures. The
  // chips now sit right beside this summary in day-ledger.tsx, so the two
  // must describe the same filtered set.
  const dailySummaryJobs = displayedJobs.filter(
    (job) => job.scheduledDate === toISODate(dayAnchor) && !["cancelled", "no_show"].includes(job.status),
  );
  const activeEmployees = employees.filter((employee) => employee.isActive && employee.role === "employee");
  const activeEmployeeIds = new Set(activeEmployees.map((employee) => employee.id));
  const dailySummary = {
    workingEmployees: new Set(dailySummaryJobs.flatMap((job) => job.assignedUserIds).filter((id) => activeEmployeeIds.has(id))).size,
    recurringClients: new Set(dailySummaryJobs.filter((job) => job.recurringSeriesId).map((job) => job.customerId)).size,
    revenueCents: dailySummaryJobs.reduce((sum, job) => sum + job.priceCents, 0),
    discountCents: dailySummaryJobs.reduce((sum, job) => sum + job.discountCents, 0),
  };
  return (
    <div className="-mx-3 -mt-4 min-h-[calc(100dvh-64px)] overflow-x-hidden bg-[var(--co-bg)] sm:-mx-4 lg:-mx-5 xl:-mx-6 lg:-mt-5">
      <CalendarStateSync view={view} axis={axis} anchor={stateAnchor} />
      <section className="co-card mx-3 mt-3 overflow-visible sm:mx-4 lg:mx-5">
      <header className="border-b border-[var(--co-line-soft)] bg-[var(--co-surface)] px-3 py-3 sm:px-4 lg:px-5 lg:py-3.5">
        <CalendarToolbar
          view={view}
          axis={axis}
          currentDate={currentDate}
          dateLabel={dateLabel}
          focusDayIso={toISODate(dayAnchor)}
          prevHref={`/calendar${prev}`}
          nextHref={`/calendar${next}`}
          todayHref={`/calendar${todayQuery}`}
          employees={employees}
          attentionCount={attentionCount}
          attentionJobCount={attentionJobCount}
          attentionDateIso={attentionDateIso}
        />
      </header>
      </section>

      <main className="space-y-3 p-3 sm:space-y-4 sm:p-4 lg:p-5">
        {weekendOrphans?.count && weekendOrphans.firstDate ? (
          <WeekendOrphanBanner
            count={weekendOrphans.count}
            firstDate={weekendOrphans.firstDate}
          />
        ) : null}
        {view === "week" ? (
          <WeekBoard
            days={weekDays.map((day) => ({
              iso: toISODate(day),
              label: formatDayLabel(day),
              dayNum: day.getDate(),
              isToday: toISODate(day) === todayIso,
              isHoliday: holidays.includes(toISODate(day)),
            }))}
            employees={employees}
            activeEmployeeCount={activeEmployees.length}
            workdayMinutesPerCleaner={workdayMinutesPerCleaner}
            jobs={displayedJobs}
            readinessByJobId={readinessByJobId}
            appointments={appointments}
            staffRoster={staffRoster}
          />
        ) : null}
        {view === "board" ? (
          <>
            <div className="md:hidden" aria-label="Mobile schedule view">
              <TodayListBoard
                dayLabel={formatDayLabel(dayAnchor)}
                isToday={toISODate(dayAnchor) === todayIso}
                employees={employees}
                jobs={listJobs}
                readinessByJobId={readinessByJobId}
                timeEntries={clockEntries.map((entry) => ({
                  ...entry,
                  clockIn: entry.clockIn.toISOString(),
                  clockOut: entry.clockOut ? entry.clockOut.toISOString() : null,
                }))}
                appointments={appointments.filter((appointment) => appointment.scheduledDate === toISODate(dayAnchor))}
                staffRoster={staffRoster}
              />
            </div>
            <div className="hidden md:block">
              <Board
                axis={axis}
                dayIso={toISODate(dayAnchor)}
                todayIso={todayIso}
                dayLabel={formatDayLabel(dayAnchor)}
                timezone={company.timezone}
                employees={employees}
                savedColumnOrder={Array.isArray(
                  (company.settings as { staffColumnOrder?: unknown } | null)
                    ?.staffColumnOrder,
                )
                  ? ((company.settings as { staffColumnOrder: unknown[] })
                      .staffColumnOrder.filter(
                        (id): id is string => typeof id === "string",
                      ))
                  : []}
                laneEmployeeId={sp.employeeId}
                initialAttentionRailOpen={sp.attention === "1"}
                jobs={displayedJobs}
                ptoRecords={ptoRows}
                appointments={appointments}
                staffRoster={staffRoster}
                workdayStartMinutes={workdayStartMinutes}
                workdayEndMinutes={workdayEndMinutes}
                workdayMinutesPerCleaner={workdayMinutesPerCleaner}
                cancellationPolicy={
                  typeof (company.settings as { cancellationPolicy?: unknown } | null)?.cancellationPolicy === "string"
                    ? (company.settings as { cancellationPolicy: string }).cancellationPolicy
                    : undefined
                }
              />
            </div>
          </>
        ) : null}
        {view === "month" ? (
          <MonthBoard
            month={monthAnchor}
            summaries={monthRows}
            holidays={holidays}
            workingDays={workingDays}
            boardAxis={axis}
            appointmentCountByDate={Object.fromEntries(appointmentCountByDate)}
            readinessByDate={monthReadinessByDate}
            attentionIssuesByDate={attentionIssuesByDate}
          />
        ) : null}
        {view === "list" ? (
          <TodayListBoard
            dayLabel={formatDayLabel(dayAnchor)}
            isToday={toISODate(dayAnchor) === todayIso}
            employees={employees}
            jobs={listJobs}
            readinessByJobId={readinessByJobId}
            timeEntries={clockEntries.map((entry) => ({
              ...entry,
              clockIn: entry.clockIn.toISOString(),
              clockOut: entry.clockOut ? entry.clockOut.toISOString() : null,
            }))}
            appointments={appointments.filter((appointment) => appointment.scheduledDate === toISODate(dayAnchor))}
            staffRoster={staffRoster}
          />
        ) : null}
        {view === "board" || view === "list" ? (
          <DayLedger
            employees={employees}
            totalEmployees={activeEmployees.length}
            {...dailySummary}
          />
        ) : null}
      </main>
    </div>
  );
}
