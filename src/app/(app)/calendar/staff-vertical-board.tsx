"use client";

import { useState } from "react";
import type { CalendarAppointment, CalendarEmployee, CalendarJob, StaffRosterMember } from "./page";
import ClientHomeSymbols from "./client-home-symbols";
import JobDetailPanel from "./job-detail-panel";
import JobCard from "./job-card";
import AppointmentPanel from "./appointment-panel";
import { APPOINTMENT_COLOR, APPOINTMENT_COLOR_CANCELLED, displayCustomer, employeeCardStyle, employeeColor, formatAppointmentTime, minutesFromTime } from "./shared";
import { cleanNoteText } from "@/lib/format";

const START = 9 * 60;
const TOTAL = 9 * 60;

export default function StaffVerticalBoard({ employees, jobs: initialJobs, queueOpen, unassignedJobs, appointments = [], staffRoster = [] }: { employees: CalendarEmployee[]; jobs: CalendarJob[]; queueOpen: boolean; unassignedJobs: CalendarJob[]; appointments?: CalendarAppointment[]; staffRoster?: StaffRosterMember[] }) {
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const active = employees.filter((employee) => employee.isActive);
  const jobs = initialJobs.map((job) => ({
    ...job,
    customerNotes: cleanNoteText(job.customerNotes),
    gateCodeOrKeyNotes: cleanNoteText(job.gateCodeOrKeyNotes),
    petNotes: cleanNoteText(job.petNotes),
  }));
  return <>
    {queueOpen && unassignedJobs.length ? (
      <section className="mb-3 border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-amber-950">Unassigned jobs</h2>
          <span className="text-xs font-medium text-amber-800">Needs assignment</span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {unassignedJobs.map((job) => (
            <JobCard key={job.id} job={job} employees={employees} onOpen={setDetailJobId} />
          ))}
        </div>
      </section>
    ) : null}
    <section className="overflow-hidden border border-[var(--co-line)] bg-[var(--co-surface)]"><div className="flex items-center justify-between border-b border-[var(--co-line-soft)] px-4 py-3"><div><h2 className="text-base font-semibold">Staff Vertical</h2><p className="mt-0.5 text-xs text-[var(--co-muted)]">Each cleaner is a row. Time runs left to right.</p></div><span className="text-xs font-medium text-[var(--co-muted)]">Scroll horizontally for the full day</span></div><div className="overflow-x-auto"><div className="min-w-[980px]"><div className="grid border-b border-[var(--co-line-soft)]" style={{ gridTemplateColumns: "170px 1fr" }}><div className="bg-[var(--co-surface-muted)] px-3 py-2 text-xs font-semibold">Cleaner</div><div className="grid bg-[var(--co-surface-muted)] text-xs font-semibold text-[var(--co-muted)]" style={{ gridTemplateColumns: "repeat(9, minmax(90px, 1fr))" }}>{Array.from({ length: 9 }, (_, index) => <span key={index} className="border-l border-[var(--co-line-soft)] px-2 py-2">{index + 9}:00</span>)}</div></div>{active.map((employee) => { const assigned = jobs.filter((job) => job.assignedUserIds.includes(employee.id)); const attending = appointments.filter((appointment) => !appointment.isAllDay && appointment.attendeeUserIds.includes(employee.id)); return <div key={employee.id} className="grid min-h-20 border-b border-[var(--co-line-soft)]" style={{ gridTemplateColumns: "170px 1fr" }}><div className="flex items-center gap-2 bg-[var(--co-surface-muted)]/60 px-3 text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: employee.calendarColor ?? employeeColor(employee.id) }} />{employee.firstName} {employee.lastName}</div><div className="relative bg-[var(--co-surface)]" style={{ backgroundImage: "linear-gradient(to right, var(--co-line-soft) 1px, transparent 1px)", backgroundSize: "11.111% 100%" }}>{attending.map((appointment) => { const start = Math.max(0, Math.min(TOTAL, minutesFromTime(appointment.startTime) - START)); const duration = Math.max(30, appointment.durationMinutes ?? 60); return <button key={appointment.id} type="button" onClick={() => setEditingAppointmentId(appointment.id)} className={`absolute top-2 bottom-2 z-10 overflow-hidden rounded-md px-2 py-1 text-left text-xs font-semibold hover:brightness-95 ${appointment.status === "cancelled" ? APPOINTMENT_COLOR_CANCELLED : APPOINTMENT_COLOR}`} style={{ left: `${(start / TOTAL) * 100}%`, width: `${Math.min(100 - (start / TOTAL) * 100, (duration / TOTAL) * 100)}%` }}><p className="truncate">📅 {appointment.title}</p><p className="truncate text-[10px] font-normal">{formatAppointmentTime(appointment.startTime, appointment.durationMinutes)}</p></button>; })}{assigned.map((job) => { const start = Math.max(0, Math.min(TOTAL, minutesFromTime(job.scheduledStartTime) - START)); const duration = Math.max(45, job.estimatedDurationMinutes ?? 75); return <button key={job.id} type="button" onClick={() => setDetailJobId(job.id)} className="absolute top-2 bottom-2 overflow-hidden rounded-md border px-2 py-1 text-left text-xs font-semibold text-[var(--co-ink)] hover:brightness-95" style={{ left: `${(start / TOTAL) * 100}%`, width: `${Math.min(100 - (start / TOTAL) * 100, (duration / TOTAL) * 100)}%`, ...employeeCardStyle(employee.calendarColor ?? employee.id) }}><p className="truncate">{job.scheduledStartTime?.slice(0, 5) ?? "No time"} · {displayCustomer(job)}</p><ClientHomeSymbols className="mt-0.5" roomCounts={job.roomCounts} gateCodeOrKeyNotes={job.gateCodeOrKeyNotes} petNotes={job.petNotes} />{job.customerNotes ? <p className="mt-0.5 truncate text-[10px] font-normal text-[var(--co-muted)]">{job.customerNotes}</p> : null}</button>; })}</div></div>; })}</div></div></section><JobDetailPanel jobId={detailJobId} employees={employees} onClose={() => setDetailJobId(null)} />{editingAppointmentId ? <AppointmentPanel mode="edit" eventId={editingAppointmentId} staffRoster={staffRoster} defaultDate={appointments.find((appointment) => appointment.id === editingAppointmentId)?.scheduledDate ?? ""} onClose={() => setEditingAppointmentId(null)} /> : null}
  </>;
}
