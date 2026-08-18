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
import FilterBar from "./filter-bar";
import DispatchBoard from "./dispatch-board";
import StaffVerticalBoard from "./staff-vertical-board";
import WeekBoard from "./week-board";
import MonthBoard from "./month-board";
import TodayListBoard from "./today-list-board";
import CalendarToolbar from "./calendar-toolbar";
import CalendarStateSync from "./state-sync";
import WeekendOrphanBanner from "./weekend-orphan-banner";
import { categorizeForAttention, employeeColorAt } from "./shared";
import { rotationalTaskForDate } from "@/lib/scheduling/rotational-tasks";

const CALENDAR_STATE_COOKIE = "co_calendar_state";

function readCalendarStateCookie(
  raw: string | undefined,
): Partial<Record<"view" | "day" | "week" | "month", string>> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (!parsed || typeof parsed !== "object") return {};
    const result: Partial<Record<"view" | "day" | "week" | "month", string>> =
      {};
    if (
      parsed.view === "week" ||
      parsed.view === "month" ||
      parsed.view === "staff" ||
      parsed.view === "staff_vertical" ||
      parsed.view === "list"
    )
      result.view = parsed.view;
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
};

export type CalendarEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  hiredDate: string | null;
  isActive: boolean;
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
};

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
  const effectiveView = sp.view ?? savedState.view;
  const view =
    effectiveView === "week" ||
    effectiveView === "month" ||
    effectiveView === "list"
      || effectiveView === "staff_vertical"
      ? effectiveView
      : "staff";
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
    view === "staff" || view === "staff_vertical" || view === "list"
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
    view === "month"
      ? Promise.resolve([])
      : sp.employeeId
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

  const monthConditions =
    sp.assignment === "unassigned"
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

  const unassignedRowsQuery =
    view === "staff" || view === "staff_vertical"
      ? buildBaseQuery()
          .where(
            and(
              ...conditions,
              notExists(
                db
                  .select({ jobId: jobAssignments.jobId })
                  .from(jobAssignments)
                  .where(eq(jobAssignments.jobId, jobs.id)),
              ),
            ),
          )
          .orderBy(jobs.scheduledDate, jobs.scheduledStartTime)
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
        sql`extract(dow from ${jobs.scheduledDate}) in (0, 6)`,
      ),
    );

  const ptoRowsQuery =
    view === "staff" || view === "staff_vertical"
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

  // Full active staff (field + office) — the attendee picker for a meeting
  // must include office/admin staff, unlike the field-eligible-only
  // `employeesQuery` above.
  const staffRosterQuery = db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(and(eq(users.companyId, admin.companyId), eq(users.isActive, true)))
    .orderBy(users.firstName, users.lastName);

  const [
    employees,
    rows,
    unassignedRows,
    [weekendOrphans],
    ptoRows,
    monthRows,
    appointmentEvents,
    staffRoster,
  ] = (await Promise.all([
    employeesQuery,
    rowsQuery,
    unassignedRowsQuery,
    weekendRowsQuery,
    ptoRowsQuery,
    monthRowsQuery,
    appointmentEventsQuery,
    staffRosterQuery,
  ])) as [
    CalendarEmployee[],
    Omit<CalendarJob, "assignedUserIds">[],
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
    sp.assignment === "unassigned"
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

  const filterParams: SearchParams = {
    view: sp.view,
    week: sp.week,
    day: sp.day,
    month: sp.month,
    employeeId: sp.employeeId,
    type: sp.type,
    recurrence: sp.recurrence,
    status: sp.status,
    zip: sp.zip,
    assignment: sp.assignment,
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
      : view === "staff" || view === "staff_vertical" || view === "list"
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
      : view === "staff" || view === "staff_vertical" || view === "list"
        ? addDays(dayAnchor, 1)
        : addDays(weekStart, 7);
  const prev = query({
    ...filterParams,
    ...(view === "month"
      ? { month: toISODate(previousDate).slice(0, 7) }
      : view === "staff" || view === "staff_vertical" || view === "list"
        ? { day: toISODate(previousDate) }
        : { week: toISODate(previousDate) }),
  });
  const next = query({
    ...filterParams,
    ...(view === "month"
      ? { month: toISODate(nextDate).slice(0, 7) }
      : view === "staff" || view === "staff_vertical" || view === "list"
        ? { day: toISODate(nextDate) }
        : { week: toISODate(nextDate) }),
  });
  const todayQuery = query({
    ...filterParams,
    ...(view === "month"
      ? { month: todayIso.slice(0, 7) }
      : view === "staff" || view === "staff_vertical" || view === "list"
        ? { day: todayIso }
        : { week: toISODate(startOfWeek(today)) }),
  });

  const currentDate =
    view === "month"
      ? monthAnchor
      : view === "staff" || view === "staff_vertical" || view === "list"
        ? dayAnchor
        : weekStart;
  const dateLabel =
    view === "month"
      ? monthAnchor.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        })
      : view === "staff" || view === "staff_vertical" || view === "list"
        ? formatDayLabel(dayAnchor)
        : `${weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} to ${weekDays[weekDays.length - 1].toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  const stateAnchor =
    view === "month"
      ? toISODate(monthAnchor).slice(0, 7)
      : view === "staff" || view === "staff_vertical" || view === "list"
        ? toISODate(dayAnchor)
        : toISODate(weekStart);
  const totalJobs =
    view === "month"
      ? monthRows
          .filter((summary) =>
            workingDays.includes(
              new Date(`${summary.scheduledDate}T00:00:00.000Z`).getUTCDay(),
            ),
          )
          .reduce((total, summary) => total + Number(summary.jobs), 0)
      : displayedJobs.length;
  // Same categorization dispatch-board.tsx uses for the Needs-attention
  // strip, so the toolbar's count and the strip's contents never drift.
  // Only computed for the views that fetch ptoRows for this date range.
  const attentionCount =
    view === "staff" || view === "staff_vertical"
      ? categorizeForAttention(jobsWithAssignments, ptoRows, toISODate(dayAnchor)).length
      : 0;
  return (
    <div className="-mx-3 -mt-4 min-h-[calc(100dvh-64px)] bg-[var(--co-bg)] sm:-mx-4 lg:-mx-5 xl:-mx-6 lg:-mt-5">
      <CalendarStateSync view={view} anchor={stateAnchor} />
      <section className="co-card mx-3 mt-3 overflow-hidden sm:mx-4 lg:mx-5">
      <header className="overflow-x-auto border-b border-[var(--co-line-soft)] bg-[var(--co-surface)] px-4 py-3 lg:px-5">
        <CalendarToolbar
          view={view}
          currentDate={currentDate}
          dateLabel={dateLabel}
          focusDayIso={toISODate(dayAnchor)}
          prevHref={`/calendar${prev}`}
          nextHref={`/calendar${next}`}
          todayHref={`/calendar${todayQuery}`}
          staffRoster={staffRoster}
          appointmentDefaultDate={stateAnchor.length === 10 ? stateAnchor : toISODate(dayAnchor)}
        />
      </header>

      <FilterBar
        employees={employees}
        totalJobs={totalJobs}
        unassignedJobs={attentionCount}
      />
      </section>

      <main className="p-3 sm:p-4 lg:p-5">
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
            jobs={displayedJobs}
            appointments={appointments}
            staffRoster={staffRoster}
          />
        ) : null}
        {view === "staff" ? (
          <DispatchBoard
            dayIso={toISODate(dayAnchor)}
            todayIso={todayIso}
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
            jobs={displayedJobs}
            ptoRecords={ptoRows}
            appointments={appointments}
            staffRoster={staffRoster}
          />
        ) : null}
        {view === "staff_vertical" ? (
          <StaffVerticalBoard
            dayIso={toISODate(dayAnchor)}
            todayIso={todayIso}
            employees={employees}
            jobs={displayedJobs}
            queueOpen={sp.queue === "unassigned" || sp.assignment === "unassigned"}
            unassignedJobs={unassignedRows.map((row) => ({ ...row, assignedUserIds: [] }))}
            ptoRecords={ptoRows}
            appointments={appointments}
            staffRoster={staffRoster}
          />
        ) : null}
        {view === "month" ? (
          <MonthBoard
            month={monthAnchor}
            summaries={monthRows}
            holidays={holidays}
            workingDays={workingDays}
            appointmentCountByDate={Object.fromEntries(appointmentCountByDate)}
          />
        ) : null}
        {view === "list" ? (
          <TodayListBoard
            dayLabel={formatDayLabel(dayAnchor)}
            isToday={toISODate(dayAnchor) === todayIso}
            employees={employees}
            jobs={listJobs}
            timeEntries={clockEntries.map((entry) => ({
              ...entry,
              clockIn: entry.clockIn.toISOString(),
              clockOut: entry.clockOut ? entry.clockOut.toISOString() : null,
            }))}
            appointments={appointments.filter((appointment) => appointment.scheduledDate === toISODate(dayAnchor))}
            staffRoster={staffRoster}
          />
        ) : null}
      </main>
    </div>
  );
}
