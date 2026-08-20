import Link from "next/link";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { CalendarDays, ChevronRight, MapPin } from "lucide-react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { companies, customerLocations, customers, jobs, jobAssignments, timeEntries } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasFieldAccess } from "@/lib/auth/field-staff";
import { dateLabel, formatEstimatedTime, jobAddress, jobTypeLabel, timeLabel } from "@/lib/my-day/job-format";
import { deriveWorkdayNow, type StopInput } from "@/lib/my-day/workday-state";
import { scheduleJobHref } from "./schedule-link";

function todayInTimezone(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce(
      (parts, part) => {
        if (part.type === "year" || part.type === "month" || part.type === "day") parts[part.type] = part.value;
        return parts;
      },
      { year: "", month: "", day: "" } as Record<"year" | "month" | "day", string>
    );
}

export default async function SchedulePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasFieldAccess(user)) redirect("/calendar");

  const company = await db
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, user.companyId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  if (!company) redirect("/login");

  const todayParts = todayInTimezone(company.timezone);
  const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  const scheduledJobs = await db
    .select({
      jobId: jobs.id,
      role: jobAssignments.role,
      scheduledDate: jobs.scheduledDate,
      scheduledStartTime: jobs.scheduledStartTime,
      estimatedDurationMinutes: jobs.estimatedDurationMinutes,
      type: jobs.type,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      addressLine1: customerLocations.addressLine1,
      city: customerLocations.city,
      state: customerLocations.state,
      zip: customerLocations.zip,
    })
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .leftJoin(customerLocations, and(eq(customerLocations.customerId, customers.id), eq(customerLocations.isPrimary, true), eq(customerLocations.isActive, true)))
    .where(and(eq(jobAssignments.userId, user.id), eq(jobs.companyId, user.companyId), gte(jobs.scheduledDate, today), isNull(jobs.completedAt)))
    .orderBy(jobs.scheduledDate, jobs.scheduledStartTime);

  const jobsByDate = Map.groupBy(scheduledJobs, (job) => job.scheduledDate);

  // Read-only "something is recording" banner: at most one open time entry
  // per employee (Invariant 3), so a single row is enough to derive the
  // current work line. Coworker/other-stop fields are unused by every state
  // this open entry can be in (traveling/arrived/job_active/stale_entry), so
  // they're safe placeholders here.
  const openEntry = await db
    .select({
      jobId: jobs.id,
      scheduledDate: jobs.scheduledDate,
      scheduledStartTime: jobs.scheduledStartTime,
      status: jobs.status,
      completedAt: jobs.completedAt,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      travelStartedAt: jobAssignments.travelStartedAt,
      arrivedAt: jobAssignments.arrivedAt,
      workStartedAt: jobAssignments.workStartedAt,
      clockIn: timeEntries.clockIn,
    })
    .from(timeEntries)
    .innerJoin(jobs, eq(timeEntries.jobId, jobs.id))
    .innerJoin(jobAssignments, and(eq(jobAssignments.jobId, jobs.id), eq(jobAssignments.userId, user.id)))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(and(eq(timeEntries.userId, user.id), isNull(timeEntries.clockOut)))
    .orderBy(desc(timeEntries.clockIn))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  let workLine: string | null = null;
  if (openEntry) {
    const stop: StopInput = {
      jobId: openEntry.jobId,
      customerFirstName: openEntry.customerFirstName,
      customerLastName: openEntry.customerLastName,
      scheduledDate: openEntry.scheduledDate,
      scheduledStartTime: openEntry.scheduledStartTime,
      status: openEntry.status,
      completedAt: openEntry.completedAt ? openEntry.completedAt.toISOString() : null,
      travelStartedAt: openEntry.travelStartedAt ? openEntry.travelStartedAt.toISOString() : null,
      arrivedAt: openEntry.arrivedAt ? openEntry.arrivedAt.toISOString() : null,
      workStartedAt: openEntry.workStartedAt ? openEntry.workStartedAt.toISOString() : null,
      myOpenEntry: { clockIn: openEntry.clockIn.toISOString() },
      myClosedEntry: null,
      coworkers: [],
    };
    workLine = deriveWorkdayNow({ stops: [stop], todayIso: today, timeZone: company.timezone }).workLine;
  }

  return (
    <div className="mx-auto max-w-[680px] space-y-4 pb-10">
      {workLine ? (
        <Link
          href="/my-day"
          className="co-card flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-[var(--co-ink)] transition hover:bg-[var(--co-surface-muted)] sm:px-5"
        >
          <span className="truncate">{workLine} · Back to My Day</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--co-faint)]" aria-hidden />
        </Link>
      ) : null}

      <section className="co-card overflow-hidden">
        <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--co-accent-tint)] text-[var(--co-accent-text)]">
            <CalendarDays className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="eyebrow">Your route</p>
            <h1 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[var(--co-ink)]">Coming up</h1>
            <p className="mt-1 text-sm text-[var(--co-muted)]">Your assigned jobs, grouped by day.</p>
          </div>
        </div>
        <div className="border-t border-[var(--co-line-soft)] px-4 py-2.5 text-xs font-medium text-[var(--co-muted)] sm:px-5">
          {scheduledJobs.length} upcoming {scheduledJobs.length === 1 ? "job" : "jobs"}
        </div>
      </section>

      {scheduledJobs.length === 0 ? (
        <section className="co-card flex flex-col items-center px-5 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--co-surface-muted)]">
            <CalendarDays className="h-6 w-6 text-[var(--co-muted)]" aria-hidden />
          </div>
          <h2 className="mt-4 text-base font-semibold text-[var(--co-ink)]">No upcoming jobs</h2>
          <p className="mt-1 max-w-sm text-sm text-[var(--co-muted)]">New assignments will appear here as soon as they are scheduled.</p>
        </section>
      ) : (
        Array.from(jobsByDate, ([scheduledDate, dayJobs]) => (
          <section key={scheduledDate} className="co-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--co-line-soft)] px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold text-[var(--co-ink)]">{scheduledDate === today ? "Today" : dateLabel(scheduledDate, company.timezone)}</h2>
              <span className="rounded-full bg-[var(--co-surface-muted)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">
                {dayJobs.length} {dayJobs.length === 1 ? "job" : "jobs"}
              </span>
            </div>
            <div className="divide-y divide-[var(--co-line-soft)]">
              {dayJobs.map((job) => {
                const address = jobAddress(job);
                const duration = job.estimatedDurationMinutes ? `Est. ${formatEstimatedTime(job.estimatedDurationMinutes)}` : null;
                return (
                  <Link
                    key={job.jobId}
                    href={scheduleJobHref(job.jobId, job.scheduledDate, today)}
                    className="flex min-h-24 items-center gap-3 px-4 py-3 transition hover:bg-[var(--co-surface-muted)] sm:px-5"
                  >
                    <div className="w-[62px] shrink-0 text-sm font-semibold tabular-nums text-[var(--co-accent-text)]">{timeLabel(job.scheduledStartTime)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[var(--co-ink)]">{job.customerFirstName} {job.customerLastName}</p>
                      <p className="mt-1 truncate text-xs text-[var(--co-muted)]">{jobTypeLabel(job.type)}{duration ? ` · ${duration}` : ""}</p>
                      <p className="mt-1 flex items-center gap-1 truncate text-xs text-[var(--co-muted)]"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />{address || "Address not set"}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-[var(--co-faint)]" aria-hidden />
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
