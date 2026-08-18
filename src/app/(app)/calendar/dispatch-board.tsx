"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarAppointment, CalendarEmployee, CalendarJob, StaffRosterMember } from "./page";
import AttentionQueue from "./attention-queue";
import { DispatchCrewRow, EmptyWindowTarget } from "./dispatch-crew-row";
import JobDetailPanel from "./job-detail-panel";
import MoveAssignPanel from "./move-assign-panel";
import AppointmentPanel from "./appointment-panel";
import { UndoToast, useUndoToast } from "./undo-toast";
import { commitJobPatch, type JobPatch } from "./drag-commit";
import {
  ARRIVAL_WINDOW_START_MINUTES,
  arrivalWindowFor,
  categorizeForAttention,
  clockLabelFromMinutes,
  formatAppointmentTime,
  jobDuration,
  APPOINTMENT_COLOR,
  APPOINTMENT_COLOR_CANCELLED,
  type ArrivalWindow,
} from "./shared";
import type { EmployeePtoRecord, PtoPeriod } from "@/lib/scheduling/pto";

function crewKey(assignedUserIds: string[]) {
  return [...assignedUserIds].sort().join(",");
}

const WINDOW_LABEL: Record<ArrivalWindow, string> = { morning: "Morning", afternoon: "Afternoon" };

export default function DispatchBoard({
  dayIso,
  todayIso,
  employees,
  savedColumnOrder,
  laneEmployeeId,
  jobs: initialJobs,
  ptoRecords,
  appointments = [],
  staffRoster = [],
}: {
  dayIso: string;
  todayIso: string;
  employees: CalendarEmployee[];
  savedColumnOrder: string[];
  laneEmployeeId?: string;
  jobs: CalendarJob[];
  ptoRecords: EmployeePtoRecord[];
  appointments?: CalendarAppointment[];
  staffRoster?: StaffRosterMember[];
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [syncedJobs, setSyncedJobs] = useState(initialJobs);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [moveAssignState, setMoveAssignState] = useState<{ jobId: string; targetEmployeeId?: string } | null>(null);
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast, showUndo, dismiss } = useUndoToast();

  if (initialJobs !== syncedJobs) {
    setSyncedJobs(initialJobs);
    setJobs(initialJobs);
  }

  function handleMoveAssignSaved(jobId: string, patch: JobPatch, previous: JobPatch) {
    function apply(fields: JobPatch) {
      setJobs((current) =>
        current.map((entry) =>
          entry.id === jobId
            ? {
                ...entry,
                ...(fields.scheduledDate !== undefined ? { scheduledDate: fields.scheduledDate } : {}),
                ...(fields.scheduledStartTime !== undefined ? { scheduledStartTime: fields.scheduledStartTime } : {}),
                ...(fields.employeeIds !== undefined ? { assignedUserIds: fields.employeeIds } : {}),
              }
            : entry,
        ),
      );
    }
    apply(patch);
    router.refresh();
    showUndo("Schedule updated", () =>
      commitJobPatch(jobId, previous, {
        onOptimistic: () => apply(previous),
        onSuccess: () => router.refresh(),
        onError: setError,
      }),
    );
  }

  const rank = new Map(savedColumnOrder.map((id, index) => [id, index]));
  function employeeRank(id: string) {
    return rank.has(id) ? rank.get(id)! : Number.MAX_SAFE_INTEGER;
  }

  const attentionEntries = categorizeForAttention(jobs, ptoRecords, dayIso);
  const attentionJobIds = new Set(attentionEntries.map((entry) => entry.job.id));
  const cancelledJobs = jobs.filter((job) => ["cancelled", "no_show"].includes(job.status));

  const scheduledJobs = jobs.filter(
    (job) => !attentionJobIds.has(job.id) && !cancelledJobs.includes(job) && job.assignedUserIds.length && job.scheduledStartTime,
  );
  const visibleScheduledJobs = laneEmployeeId
    ? scheduledJobs.filter((job) => job.assignedUserIds.includes(laneEmployeeId))
    : scheduledJobs;

  function buildWindow(window: ArrivalWindow) {
    const windowJobs = visibleScheduledJobs.filter((job) => arrivalWindowFor(job.scheduledStartTime) === window);
    const groups = new Map<string, CalendarJob[]>();
    for (const job of windowJobs) {
      const key = crewKey(job.assignedUserIds);
      groups.set(key, [...(groups.get(key) ?? []), job]);
    }
    const rows = [...groups.entries()]
      .map(([key, groupJobs]) => {
        const sortedJobs = [...groupJobs].sort((a, b) => (a.scheduledStartTime ?? "").localeCompare(b.scheduledStartTime ?? ""));
        const crewIds = sortedJobs[0].assignedUserIds;
        const crewEmployees = crewIds
          .map((id) => employees.find((employee) => employee.id === id))
          .filter((employee): employee is CalendarEmployee => Boolean(employee));
        const crewNames = crewEmployees.length
          ? crewEmployees.map((employee) => `${employee.firstName} ${employee.lastName}`)
          : ["Unknown"];
        const ptoNotes = crewEmployees
          .map((employee) => {
            const pto = ptoRecords.find((record) => record.userId === employee.id && record.startDate <= dayIso && record.endDate >= dayIso);
            if (!pto) return null;
            const period: PtoPeriod =
              pto.startDate === pto.endDate ? (pto.startPeriod === pto.endPeriod ? pto.startPeriod : "full") : pto.startDate === dayIso ? pto.startPeriod : pto.endDate === dayIso ? pto.endPeriod : "full";
            return `${employee.firstName}: PTO${period === "full" ? "" : ` ${period}`}`;
          })
          .filter((note): note is string => Boolean(note));
        const elapsedTotal = sortedJobs.reduce((total, job) => total + jobDuration(job) / Math.max(crewIds.length, 1), 0);
        const finishLabel = clockLabelFromMinutes(ARRIVAL_WINDOW_START_MINUTES[window] + elapsedTotal);
        const minRank = Math.min(...crewIds.map(employeeRank));
        return { key, sortedJobs, crewNames, ptoNote: ptoNotes.length ? ptoNotes.join(", ") : null, finishLabel, minRank };
      })
      .sort((a, b) => a.minRank - b.minRank || a.crewNames.length - b.crewNames.length);
    return rows;
  }

  const morningRows = buildWindow("morning");
  const afternoonRows = buildWindow("afternoon");
  const dayAppointments = appointments.filter((appointment) => appointment.scheduledDate === dayIso && !appointment.isAllDay);

  function renderWindow(window: ArrivalWindow, rows: ReturnType<typeof buildWindow>) {
    return (
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--co-faint)]">{WINDOW_LABEL[window]}</h2>
        {rows.length ? (
          <div className="space-y-2">
            {rows.map((row) => (
              <DispatchCrewRow
                key={row.key}
                employees={employees}
                crewNames={row.crewNames}
                ptoNote={row.ptoNote}
                jobs={row.sortedJobs}
                finishLabel={row.finishLabel}
                onOpenDetail={setDetailJobId}
                onMoveAssign={(jobId) => setMoveAssignState({ jobId })}
              />
            ))}
          </div>
        ) : (
          <EmptyWindowTarget label={`No ${window} jobs`} />
        )}
      </section>
    );
  }

  const activeJob = moveAssignState ? jobs.find((entry) => entry.id === moveAssignState.jobId) : undefined;

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="co-card border-[var(--co-danger)]/30 bg-[var(--co-danger)]/10 px-4 py-2 text-sm font-medium text-[var(--co-danger)]">
          {error}
        </p>
      ) : null}

      <AttentionQueue
        entries={attentionEntries}
        cancelledJobs={cancelledJobs}
        employees={employees}
        onSchedule={(jobId) => setMoveAssignState({ jobId })}
      />

      {dayAppointments.length ? (
        <section className="co-card space-y-2 p-4">
          <h2 className="text-sm font-semibold text-[var(--co-ink)]">Internal meetings today</h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {dayAppointments.map((appointment) => (
              <button
                key={appointment.id}
                type="button"
                onClick={() => setEditingAppointmentId(appointment.id)}
                className={`min-h-11 rounded-lg px-3 py-2 text-left text-sm font-semibold ${appointment.status === "cancelled" ? APPOINTMENT_COLOR_CANCELLED : APPOINTMENT_COLOR}`}
              >
                <span className="block truncate">📅 {appointment.title}</span>
                <span className="block truncate text-xs font-normal">{formatAppointmentTime(appointment.startTime, appointment.durationMinutes)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {renderWindow("morning", morningRows)}
      {renderWindow("afternoon", afternoonRows)}

      <UndoToast toast={toast} onDismiss={dismiss} />
      <JobDetailPanel
        jobId={detailJobId}
        employees={employees}
        onClose={() => setDetailJobId(null)}
        onMoveAssign={(jobId) => setMoveAssignState({ jobId })}
      />
      {activeJob ? (
        <MoveAssignPanel
          job={activeJob}
          employees={employees}
          dayJobs={jobs}
          ptoRecords={ptoRecords}
          ptoDayIso={dayIso}
          todayIso={todayIso}
          targetEmployeeId={moveAssignState?.targetEmployeeId}
          onClose={() => setMoveAssignState(null)}
          onSaved={(patch, previous) => handleMoveAssignSaved(activeJob.id, patch, previous)}
        />
      ) : null}
      {editingAppointmentId ? (
        <AppointmentPanel
          mode="edit"
          eventId={editingAppointmentId}
          staffRoster={staffRoster}
          defaultDate={dayIso}
          onClose={() => setEditingAppointmentId(null)}
        />
      ) : null}
    </div>
  );
}
