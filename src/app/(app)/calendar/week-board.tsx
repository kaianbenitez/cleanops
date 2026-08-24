"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { CalendarDays } from "lucide-react";
import type { CalendarAppointment, CalendarEmployee, CalendarJob, StaffRosterMember } from "./page";
import JobCard from "./job-card";
import { APPOINTMENT_COLOR, APPOINTMENT_COLOR_CANCELLED, employeeColor, formatAppointmentTime } from "./shared";
import type { CalendarReadiness } from "./page";
import JobDetailPanel from "./job-detail-panel";
import AppointmentPanel from "./appointment-panel";

type DayMeta = {
  iso: string;
  label: string;
  dayNum: number;
  isToday: boolean;
  isHoliday: boolean;
};

function customerName(job: CalendarJob) {
  return (
    job.companyName?.trim() ||
    `${job.customerFirstName} ${job.customerLastName}`
  );
}
function teamName(ids: string[], employees: CalendarEmployee[]) {
  if (!ids.length) return "Crew not assigned";
  return `${ids.map((id) => employees.find((employee) => employee.id === id)?.firstName ?? "Technician").join(" + ")} team`;
}

function formatLaborMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export default function WeekBoard({
  days,
  employees,
  activeEmployeeCount,
  workdayMinutesPerCleaner,
  jobs,
  readinessByJobId,
  appointments = [],
  staffRoster = [],
}: {
  days: DayMeta[];
  employees: CalendarEmployee[];
  activeEmployeeCount: number;
  workdayMinutesPerCleaner: number;
  jobs: CalendarJob[];
  readinessByJobId: Map<string, CalendarReadiness>;
  appointments?: CalendarAppointment[];
  staffRoster?: StaffRosterMember[];
}) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const byDateAppointments = useMemo(
    () =>
      new Map(
        days.map((day) => [
          day.iso,
          appointments
            .filter((appointment) => appointment.scheduledDate === day.iso)
            .sort((a, b) => (a.startTime ?? "99").localeCompare(b.startTime ?? "99")),
        ]),
      ),
    [days, appointments],
  );
  const byDate = useMemo(
    () =>
      new Map(
        days.map((day) => [
          day.iso,
          jobs
            .filter((job) => job.scheduledDate === day.iso)
            .sort((a, b) =>
              (a.scheduledStartTime ?? "99").localeCompare(
                b.scheduledStartTime ?? "99",
              ),
            ),
        ]),
      ),
    [days, jobs],
  );
  const visibleCount = 10;
  const availableMinutes = activeEmployeeCount * workdayMinutesPerCleaner;

  return (
    <section className="overflow-hidden border border-[var(--co-line)] bg-[var(--co-surface)]">
      <div className="border-b border-[var(--co-line-soft)] px-4 py-3">
        <h2 className="type-admin-title font-semibold">Weekly labor overview</h2>
        <p className="type-admin-meta mt-0.5 text-[var(--co-muted)]">
          Compare scheduled labor with available labor by day. Open Board for
          exact placement and assignment.
        </p>
      </div>
      <div className="overflow-x-auto">
        <div
          className="grid grid-cols-1 divide-y divide-[var(--co-line-soft)] lg:min-w-[calc(var(--week-columns)*200px)] lg:divide-x lg:divide-y-0 lg:[grid-template-columns:repeat(var(--week-columns),minmax(200px,1fr))]"
          style={{ "--week-columns": days.length } as CSSProperties}
        >
          {days.map((day) => {
            const dayJobs = byDate.get(day.iso) ?? [];
            const scheduledMinutes = dayJobs.reduce(
              (total, job) => total + (job.estimatedDurationMinutes ?? 75),
              0,
            );
            const capacity = day.isHoliday
              ? 0
              : availableMinutes > 0
                ? Math.round((scheduledMinutes / availableMinutes) * 100)
                : scheduledMinutes > 0
                  ? 100
                  : 0;
            const tone =
              capacity > 100
                ? "co-badge-danger"
                : capacity >= 90
                  ? "co-badge-warning"
                  : "bg-[var(--co-accent-tint)] text-[var(--co-accent-text)]";
            const grouped = new Map<string, CalendarJob[]>();
            dayJobs.forEach((job) => {
              const key = job.assignedUserIds.join("|") || "unassigned";
              grouped.set(key, [...(grouped.get(key) ?? []), job]);
            });
            const visible = dayJobs.slice(0, visibleCount);
            const overflow = dayJobs.slice(visibleCount);
            return (
              <div
                key={day.iso}
                className={
                  day.isToday
                    ? "bg-[var(--co-accent-tint)]/35"
                    : "bg-[var(--co-surface)]"
                }
              >
                <div className="border-b border-[var(--co-line-soft)] px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--co-faint)]">
                        {day.label.slice(0, 3)}
                      </p>
                      <p className="mt-0.5 text-lg font-semibold tabular-nums">
                        {day.dayNum}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--co-muted)]">
                        {dayJobs.length} scheduled jobs
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-bold tabular-nums ${tone}`}
                    >
                      {day.isHoliday ? "Closed" : `${formatLaborMinutes(scheduledMinutes)} scheduled`}
                    </span>
                    {!day.isHoliday ? <span className="text-[12px] font-medium tabular-nums text-[var(--co-muted)]">of {formatLaborMinutes(availableMinutes)} available</span> : null}
                    </div>
                  </div>
                  {day.isHoliday ? (
                    <p className="mt-3 text-xs font-medium text-[var(--co-warning)]">
                      Holiday — no labor capacity
                    </p>
                  ) : (
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--co-line-soft)]">
                      <div
                        className={`h-full ${capacity > 100 ? "bg-[var(--co-danger)]" : capacity >= 90 ? "bg-[var(--co-warning)]" : "bg-[var(--co-accent-fill)]"}`}
                        style={{ width: `${Math.min(capacity, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="space-y-3 p-2.5">
                  {(byDateAppointments.get(day.iso) ?? []).length ? (
                    <div className="space-y-1.5">
                      {(byDateAppointments.get(day.iso) ?? []).map((appointment) => (
                        <button
                          key={appointment.id}
                          type="button"
                          onClick={() => setEditingAppointmentId(appointment.id)}
                          className={`flex min-h-11 w-full items-center gap-1.5 rounded-md px-2 py-2 text-left text-[12px] font-semibold ${appointment.status === "cancelled" ? APPOINTMENT_COLOR_CANCELLED : APPOINTMENT_COLOR}`}
                        >
                          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
                          <span className="truncate">{formatAppointmentTime(appointment.startTime, appointment.durationMinutes)} · {appointment.title}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {Array.from(grouped.entries()).map(([key, group]) => {
                    const visibleGroup = group.filter((job) =>
                      visible.includes(job),
                    );
                    if (!visibleGroup.length) return null;
                    return (
                      <div key={key}>
                        <p className="mb-1.5 flex items-center gap-1.5 truncate text-[12px] font-semibold text-[var(--co-ink)]">
                          <span className="flex shrink-0 items-center gap-0.5">
                            {group[0].assignedUserIds.length ? (
                              group[0].assignedUserIds.map((id) => (
                                <span
                                  key={id}
                                  className="h-1.5 w-1.5 rounded-full"
                                  style={{ background: employees.find((employee) => employee.id === id)?.calendarColor ?? employeeColor(id) }}
                                />
                              ))
                            ) : (
                              <span className="h-1.5 w-1.5 rounded-full bg-[var(--co-accent-fill)]" />
                            )}
                          </span>
                          {teamName(group[0].assignedUserIds, employees)}
                        </p>
                        <div className="space-y-1.5">
                          {visibleGroup.map((job) => (
                            <JobCard
                              key={job.id}
                              job={{ ...job, readiness: readinessByJobId.get(job.id) }}
                              employees={employees}
                              onOpen={setDetailJobId}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {overflow.length ? (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDate(
                          expandedDate === day.iso ? null : day.iso,
                        )
                      }
                      className="min-h-11 w-full rounded-lg border border-dashed border-[var(--co-line)] px-3 py-2 text-left text-xs font-semibold text-[var(--co-accent-text)] hover:bg-[var(--co-accent-tint)]"
                    >
                      +{overflow.length} more jobs
                    </button>
                  ) : null}
                  {expandedDate === day.iso ? (
                    <div className="space-y-1 rounded-lg border border-[var(--co-line)] bg-[var(--co-surface)] p-2 shadow-[0_8px_20px_rgba(18,24,19,0.12)]">
                      {overflow.map((job) => (
                        <button
                          key={job.id}
                          type="button"
                          onClick={() => setDetailJobId(job.id)}
                          className="flex min-h-11 w-full items-center justify-between gap-2 border-b border-[var(--co-line-soft)] py-2 text-left text-xs last:border-0 hover:bg-[var(--co-surface-muted)] focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--co-focus-ring)]"
                        >
                          <span className="truncate font-medium">
                            {job.scheduledStartTime?.slice(0, 5) ?? "No time"} -{" "}
                            {customerName(job)}
                          </span>
                          <span className="shrink-0 text-[var(--co-muted)]">
                            {job.customerCity ?? "No city"} -{" "}
                            {job.customerZip ?? "No ZIP"}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {dayJobs.length === 0 ? (
                    <p className="py-8 text-center text-xs text-[var(--co-faint)]">
                      No jobs scheduled
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <JobDetailPanel
        jobId={detailJobId}
        employees={employees}
        onClose={() => setDetailJobId(null)}
      />
      {editingAppointmentId ? (
        <AppointmentPanel
          mode="edit"
          eventId={editingAppointmentId}
          staffRoster={staffRoster}
          defaultDate={days[0]?.iso ?? ""}
          onClose={() => setEditingAppointmentId(null)}
        />
      ) : null}
    </section>
  );
}
