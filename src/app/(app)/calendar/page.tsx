import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, eq, gte, ilike, inArray, isNull, lte, notExists, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, customers, jobAssignments, jobStatusEnum, jobTypeEnum, jobs, recurrenceEnum, recurringSeries, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { addDays, formatDayLabel, startOfWeek, toISODate } from "@/lib/scheduling/dates";
import { todayInTimeZone } from "@/lib/dashboard/range";
import FilterBar from "./filter-bar";
import StaffBoard from "./staff-board";
import WeekBoard from "./week-board";
import MonthBoard from "./month-board";
import DatePicker from "./date-picker";
import CalendarStateSync from "./state-sync";
import WeekendOrphanBanner from "./weekend-orphan-banner";

const CALENDAR_STATE_COOKIE = "co_calendar_state";

function readCalendarStateCookie(raw: string | undefined): Partial<Record<"view" | "day" | "week" | "month", string>> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (!parsed || typeof parsed !== "object") return {};
    const result: Partial<Record<"view" | "day" | "week" | "month", string>> = {};
    if (parsed.view === "week" || parsed.view === "month" || parsed.view === "staff") result.view = parsed.view;
    if (typeof parsed.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.day)) result.day = parsed.day;
    if (typeof parsed.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.week)) result.week = parsed.week;
    if (typeof parsed.month === "string" && /^\d{4}-\d{2}$/.test(parsed.month)) result.month = parsed.month;
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
};

export type CalendarEmployee = { id: string; firstName: string; lastName: string };

export type CalendarJob = {
  id: string;
  type: string;
  status: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number | null;
  priceCents: number;
  recurringSeriesId: string | null;
  recurrenceFrequency: string | null;
  customerFirstName: string;
  customerLastName: string;
  companyName: string | null;
  clientType: string;
  customerZip: string | null;
  customerCity: string | null;
  customerAddress: string | null;
  assignedUserIds: string[];
};


function query(params: SearchParams) {
  const result = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value && result.set(key, value));
  const text = result.toString();
  return text ? `?${text}` : "";
}

function monthBounds(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return { start, end };
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/my-day");

  const sp = await searchParams;
  const cookieStore = await cookies();
  const savedState = readCalendarStateCookie(cookieStore.get(CALENDAR_STATE_COOKIE)?.value);
  const effectiveView = sp.view ?? savedState.view;
  const view = effectiveView === "week" || effectiveView === "month" ? effectiveView : "staff";
  const [company] = await db
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, admin.companyId))
    .limit(1);
  if (!company) redirect("/login");

  const todayIso = todayInTimeZone(new Date(), company.timezone);
  const today = new Date(`${todayIso}T00:00:00.000Z`);
  const effectiveDay = sp.day ?? savedState.day;
  const dayAnchor = effectiveDay ? new Date(`${effectiveDay}T00:00:00.000Z`) : today;
  const effectiveWeek = sp.week ?? savedState.week;
  const weekStart = startOfWeek(effectiveWeek ? new Date(`${effectiveWeek}T00:00:00.000Z`) : today);
  const weekDays = Array.from({ length: 5 }, (_, index) => addDays(weekStart, index));
  const effectiveMonth = sp.month ?? savedState.month;
  const monthAnchor = effectiveMonth ? new Date(`${effectiveMonth}-01T00:00:00.000Z`) : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const month = monthBounds(monthAnchor);
  const days = view === "staff" ? [dayAnchor] : view === "month" ? [] : weekDays;
  const start = view === "month" ? toISODate(month.start) : toISODate(days[0]);
  const end = view === "month" ? toISODate(month.end) : toISODate(days[days.length - 1]);

  const employeesQuery = db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(and(eq(users.companyId, admin.companyId), eq(users.role, "employee"), eq(users.isActive, true)))
    .orderBy(users.firstName);

  const conditions = [eq(jobs.companyId, admin.companyId), gte(jobs.scheduledDate, start), lte(jobs.scheduledDate, end)];
  if (sp.type && (jobTypeEnum as readonly string[]).includes(sp.type)) conditions.push(eq(jobs.type, sp.type as typeof jobs.type.enumValues[number]));
  if (sp.status && (jobStatusEnum as readonly string[]).includes(sp.status)) conditions.push(eq(jobs.status, sp.status as typeof jobs.status.enumValues[number]));
  if (sp.zip) conditions.push(ilike(customers.zip, `${sp.zip}%`));
  if (sp.recurrence === "none") conditions.push(isNull(recurringSeries.id));
  if (sp.recurrence && sp.recurrence !== "none" && (recurrenceEnum as readonly string[]).includes(sp.recurrence)) conditions.push(eq(recurringSeries.frequency, sp.recurrence as typeof recurringSeries.frequency.enumValues[number]));

  const base = db
    .select({
      id: jobs.id,
      type: jobs.type,
      status: jobs.status,
      scheduledDate: jobs.scheduledDate,
      scheduledStartTime: jobs.scheduledStartTime,
      estimatedDurationMinutes: jobs.estimatedDurationMinutes,
      priceCents: jobs.priceCents,
      recurringSeriesId: jobs.recurringSeriesId,
      recurrenceFrequency: recurringSeries.frequency,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      companyName: customers.companyName,
      clientType: customers.clientType,
      customerZip: customers.zip,
      customerCity: customers.city,
      customerAddress: customers.addressLine1,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .leftJoin(recurringSeries, eq(jobs.recurringSeriesId, recurringSeries.id));

  const rowsQuery = sp.employeeId
    ? base.innerJoin(jobAssignments, and(eq(jobAssignments.jobId, jobs.id), eq(jobAssignments.userId, sp.employeeId))).where(and(...conditions)).orderBy(jobs.scheduledDate, jobs.scheduledStartTime)
    : base.where(and(...conditions)).orderBy(jobs.scheduledDate, jobs.scheduledStartTime);

  const unassignedRowsQuery = view === "staff"
    ? base
      .where(and(
        ...conditions,
        notExists(
          db.select({ jobId: jobAssignments.jobId })
            .from(jobAssignments)
            .where(eq(jobAssignments.jobId, jobs.id))
        )
      ))
      .orderBy(jobs.scheduledDate, jobs.scheduledStartTime)
    : Promise.resolve([]);

  // Month and week deliberately omit weekends. Keep any imported weekend work
  // visible so a dispatcher can still reach it from the Staff view.
  const weekendRowsQuery = db
    .select({ count: sql<number>`count(*)`, firstDate: sql<string | null>`min(${jobs.scheduledDate})` })
    .from(jobs)
    .where(and(eq(jobs.companyId, admin.companyId), sql`extract(dow from ${jobs.scheduledDate}) in (0, 6)`));

  const [employees, rows, unassignedRows, [weekendOrphans]] = (await Promise.all([employeesQuery, rowsQuery, unassignedRowsQuery, weekendRowsQuery])) as [CalendarEmployee[], Omit<CalendarJob, "assignedUserIds">[], Omit<CalendarJob, "assignedUserIds">[], { count: number; firstDate: string | null }[]];

  const assignments = rows.length
    ? await db.select({ jobId: jobAssignments.jobId, userId: users.id }).from(jobAssignments).innerJoin(users, eq(jobAssignments.userId, users.id)).where(inArray(jobAssignments.jobId, rows.map((row) => row.id)))
    : [];
  const byJob = new Map<string, string[]>();
  assignments.forEach((assignment) => byJob.set(assignment.jobId, [...(byJob.get(assignment.jobId) ?? []), assignment.userId]));
  const jobsWithAssignments: CalendarJob[] = rows.map((row) => ({ ...row, assignedUserIds: byJob.get(row.id) ?? [] }));
  const displayedJobs = sp.assignment === "unassigned" ? jobsWithAssignments.filter((job) => !job.assignedUserIds.length) : jobsWithAssignments;

  const filterParams: SearchParams = { view: sp.view, week: sp.week, day: sp.day, month: sp.month, employeeId: sp.employeeId, type: sp.type, recurrence: sp.recurrence, status: sp.status, zip: sp.zip, assignment: sp.assignment };
  const previousDate = view === "month" ? new Date(Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth() - 1, 1)) : view === "staff" ? addDays(dayAnchor, -1) : addDays(weekStart, -7);
  const nextDate = view === "month" ? new Date(Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth() + 1, 1)) : view === "staff" ? addDays(dayAnchor, 1) : addDays(weekStart, 7);
  const prev = query({ ...filterParams, ...(view === "month" ? { month: toISODate(previousDate).slice(0, 7) } : view === "staff" ? { day: toISODate(previousDate) } : { week: toISODate(previousDate) }) });
  const next = query({ ...filterParams, ...(view === "month" ? { month: toISODate(nextDate).slice(0, 7) } : view === "staff" ? { day: toISODate(nextDate) } : { week: toISODate(nextDate) }) });
  const todayQuery = query({ ...filterParams, ...(view === "month" ? { month: todayIso.slice(0, 7) } : view === "staff" ? { day: todayIso } : { week: toISODate(startOfWeek(today)) }) });

  const currentDate = view === "month" ? monthAnchor : view === "staff" ? dayAnchor : weekStart;
  const dateLabel = view === "month" ? monthAnchor.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : view === "staff" ? formatDayLabel(dayAnchor) : `${weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} to ${weekDays[weekDays.length - 1].toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  const stateAnchor = view === "month" ? toISODate(monthAnchor).slice(0, 7) : view === "staff" ? toISODate(dayAnchor) : toISODate(weekStart);
  return (
    <div className="-mx-3 -mt-4 min-h-[calc(100dvh-64px)] bg-[var(--co-bg)] sm:-mx-4 lg:-mx-5 xl:-mx-6 lg:-mt-5">
      <CalendarStateSync view={view} anchor={stateAnchor} />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--co-line-soft)] bg-[var(--co-surface)] px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-center gap-2"><DatePicker view={view} value={currentDate} label={dateLabel} /><Link href={`/calendar${prev}`} className="co-button-secondary" aria-label="Previous period">Previous</Link><Link href={`/calendar${todayQuery}`} className="co-button-secondary">Today</Link><Link href={`/calendar${next}`} className="co-button-secondary" aria-label="Next period">Next</Link></div>
      </header>

      <FilterBar employees={employees} />

      <main className="p-3 sm:p-4 lg:p-5">
        {weekendOrphans?.count && weekendOrphans.firstDate ? <WeekendOrphanBanner count={weekendOrphans.count} firstDate={weekendOrphans.firstDate} /> : null}
        {view === "week" ? <WeekBoard days={weekDays.map((day) => ({ iso: toISODate(day), label: formatDayLabel(day), dayNum: day.getDate(), isToday: toISODate(day) === todayIso }))} employees={employees} jobs={displayedJobs} /> : null}
        {view === "staff" ? <StaffBoard dayIso={toISODate(dayAnchor)} dayLabel={formatDayLabel(dayAnchor)} employees={employees} laneEmployeeId={sp.employeeId} jobs={displayedJobs} unassignedJobs={unassignedRows.map((row) => ({ ...row, assignedUserIds: [] }))} /> : null}
        {view === "month" ? <MonthBoard month={monthAnchor} jobs={displayedJobs} /> : null}
      </main>
    </div>
  );
}
