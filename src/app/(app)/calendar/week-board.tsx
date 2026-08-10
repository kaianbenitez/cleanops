"use client";

import { useMemo, useState } from "react";
import type { CalendarAppointment, CalendarEmployee, CalendarJob, StaffRosterMember } from "./page";
import JobCard from "./job-card";
import { APPOINTMENT_COLOR, APPOINTMENT_COLOR_CANCELLED, employeeColor, formatAppointmentTime } from "./shared";
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
  if (!ids.length) return "Unassigned";
  return `${ids.map((id) => employees.find((employee) => employee.id === id)?.firstName ?? "Technician").join(" + ")} team`;
}

export default function WeekBoard({
  days,
  employees,
  jobs,
  appointments = [],
  staffRoster = [],
}: {
  days: DayMeta[];
  employees: CalendarEmployee[];
  jobs: CalendarJob[];
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
  const availableMinutes = Math.max(employees.length, 1) * 8 * 60;

  return (
    <section className="overflow-hidden border border-[var(--co-line)] bg-[var(--co-surface)]">
      <div className="border-b border-[var(--co-line-soft)] px-4 py-3">
        <h2 className="text-base font-semibold">Weekly capacity</h2>
        <p className="mt-0.5 text-xs text-[var(--co-muted)]">
          Review team workload by day. Open Staff for exact placement and
          assignment.
        </p>
      </div>
      <div className="overflow-x-auto">
        <div
          className="grid divide-x divide-[var(--co-line-soft)]"
          style={{
            gridTemplateColumns: `repeat(${days.length}, minmax(200px, 1fr))`,
          }}
        >
          {days.map((day) => {
            const dayJobs = byDate.get(day.iso) ?? [];
            const scheduledMinutes = dayJobs.reduce(
              (total, job) => total + (job.estimatedDurationMinutes ?? 75),
              0,
            );
            const capacity = day.isHoliday
              ? 0
              : Math.round((scheduledMinutes / availableMinutes) * 100);
            const tone =
              capacity > 100
                ? "bg-rose-50 text-rose-700"
                : capacity >= 90
                  ? "bg-amber-50 text-amber-700"
                  : "bg-[var(--co-accent-tint)] text-[var(--co-evergreen)]";
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
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-faint)]">
                        {day.label.slice(0, 3)}
                      </p>
                      <p className="mt-0.5 text-lg font-semibold tabular-nums">
                        {day.dayNum}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--co-muted)]">
                        {dayJobs.length} jobs today
                      </p>
                    </div>
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-bold tabular-nums ${tone}`}
                    >
                      {day.isHoliday ? "Closed" : `${Math.min(capacity, 999)}%`}
                    </span>
                  </div>
                  {day.isHoliday ? (
                    <p className="mt-3 text-xs font-medium text-amber-800">
                      Holiday — no dispatch capacity
                    </p>
                  ) : (
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--co-line-soft)]">
                      <div
                        className={`h-full ${capacity > 100 ? "bg-rose-600" : capacity >= 90 ? "bg-amber-500" : "bg-[var(--co-evergreen)]"}`}
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
                          className={`flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] font-semibold ${appointment.status === "cancelled" ? APPOINTMENT_COLOR_CANCELLED : APPOINTMENT_COLOR}`}
                        >
                          <span aria-hidden>📅</span>
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
                        <p className="mb-1.5 flex items-center gap-1.5 truncate text-[11px] font-semibold text-[var(--co-ink)]">
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
                              <span className="h-1.5 w-1.5 rounded-full bg-[var(--co-evergreen)]" />
                            )}
                          </span>
                          {teamName(group[0].assignedUserIds, employees)}
                        </p>
                        <div className="space-y-1.5">
                          {visibleGroup.map((job) => (
                            <JobCard
                              key={job.id}
                              job={job}
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
                      className="w-full rounded-lg border border-dashed border-[var(--co-line)] px-3 py-2 text-left text-xs font-semibold text-[var(--co-evergreen)] hover:bg-[var(--co-accent-tint)]"
                    >
                      +{overflow.length} more jobs
                    </button>
                  ) : null}
                  {expandedDate === day.iso ? (
                    <div className="space-y-1 rounded-lg border border-[var(--co-line)] bg-white p-2 shadow-[0_8px_20px_rgba(18,24,19,0.12)]">
                      {overflow.map((job) => (
                        <div
                          key={job.id}
                          className="flex items-center justify-between gap-2 border-b border-[var(--co-line-soft)] py-2 text-xs last:border-0"
                        >
                          <span className="truncate font-medium">
                            {job.scheduledStartTime?.slice(0, 5) ?? "No time"} -{" "}
                            {customerName(job)}
                          </span>
                          <span className="shrink-0 text-[var(--co-muted)]">
                            {job.customerCity ?? "No city"} -{" "}
                            {job.customerZip ?? "No ZIP"}
                          </span>
                        </div>
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
