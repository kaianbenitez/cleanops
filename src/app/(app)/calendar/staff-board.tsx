"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarEmployee, CalendarJob } from "./page";
import { commitJobPatch } from "./drag-commit";
import { UndoToast, useUndoToast } from "./undo-toast";
import JobCard from "./job-card";
import { assignDayLanes, employeeColor, formatEstimatedTime } from "./shared";
import UnassignedPanel from "./unassigned-panel";
import JobDetailPanel from "./job-detail-panel";
import type { EmployeePtoRecord, PtoPeriod } from "@/lib/scheduling/pto";

const START = 9 * 60;
const HOURS = 10;
const TOTAL = HOURS * 60;
const HOUR_HEIGHT = 104;
const RETAINED_STATUSES = ["cancelled", "no_show"];

function customerName(job: CalendarJob) {
  return job.companyName || `${job.customerFirstName} ${job.customerLastName}`;
}

function statusLabel(status: string) {
  return status === "cancelled"
    ? "Cancelled / on hold"
    : status === "no_show"
      ? "No show"
      : status === "in_progress"
        ? "In progress"
        : "Scheduled";
}

function ptoPeriodForDay(pto: EmployeePtoRecord, dayIso: string): PtoPeriod {
  if (pto.startDate === pto.endDate)
    return pto.startPeriod === pto.endPeriod ? pto.startPeriod : "full";
  if (pto.startDate === dayIso) return pto.startPeriod;
  if (pto.endDate === dayIso) return pto.endPeriod;
  return "full";
}

function ptoStyle(period: PtoPeriod) {
  if (period === "morning") return { top: "0%", height: "37.5%" };
  if (period === "afternoon") return { top: "37.5%", height: "62.5%" };
  return { top: "0%", height: "100%" };
}

function minutesFromDragEvent(event: { clientY: number; currentTarget: HTMLElement }) {
  const rect = event.currentTarget.getBoundingClientRect();
  const rawMinutes = START + ((event.clientY - rect.top) / rect.height) * TOTAL;
  const snappedMinutes = Math.round(rawMinutes / 15) * 15;
  return Math.min(Math.max(snappedMinutes, START), START + TOTAL);
}

function clockLabelFromMinutes(totalMinutes: number) {
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const hour12 = ((hour24 + 11) % 12) + 1;
  const suffix = hour24 < 12 ? "AM" : "PM";
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export default function StaffBoard({
  dayIso,
  dayLabel,
  employees,
  savedColumnOrder,
  laneEmployeeId,
  jobs: initialJobs,
  unassignedJobs,
  ptoRecords,
  isHoliday,
}: {
  dayIso: string;
  dayLabel: string;
  employees: CalendarEmployee[];
  savedColumnOrder: string[];
  laneEmployeeId?: string;
  jobs: CalendarJob[];
  unassignedJobs: CalendarJob[];
  ptoRecords: EmployeePtoRecord[];
  isHoliday: boolean;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [syncedJobs, setSyncedJobs] = useState(initialJobs);
  const [dragOver, setDragOver] = useState<{
    employeeId: string;
    minutes: number;
  } | null>(null);
  const [columnOrder, setColumnOrder] = useState(savedColumnOrder);
  const [draggedEmployeeId, setDraggedEmployeeId] = useState<string | null>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [resizing, setResizing] = useState<{
    jobId: string;
    startY: number;
    initialDuration: number;
    previewDuration: number;
  } | null>(null);
  const { toast, showUndo, dismiss } = useUndoToast();
  // Lanes are assignment targets, so only active employees get a column —
  // an inactive/force-deleted employee's past jobs still render (via
  // JobCard, which receives the full `employees` list below), just not as
  // a lane you can drop new work onto.
  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.isActive),
    [employees],
  );
  const sortedEmployees = useMemo(
    () => {
      const byTenure = [...activeEmployees].sort((left, right) => {
        if (left.hiredDate && right.hiredDate)
          return left.hiredDate.localeCompare(right.hiredDate) || left.firstName.localeCompare(right.firstName);
        if (left.hiredDate) return -1;
        if (right.hiredDate) return 1;
        return left.firstName.localeCompare(right.firstName);
      });
      if (laneEmployeeId)
        return byTenure.filter((employee) => employee.id === laneEmployeeId);
      const rank = new Map(columnOrder.map((id, index) => [id, index]));
      return byTenure.sort((left, right) =>
        (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      );
    },
    [activeEmployees, columnOrder, laneEmployeeId],
  );

  async function saveColumnOrder(nextOrder: string[]) {
    setColumnOrder(nextOrder);
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffColumnOrder: nextOrder }),
    });
    if (!response.ok) {
      setColumnOrder(savedColumnOrder);
      setError("Could not save the staff column order. Please try again.");
    }
  }

  function moveEmployeeColumn(targetEmployeeId: string) {
    if (!draggedEmployeeId || draggedEmployeeId === targetEmployeeId) return;
    const nextOrder = sortedEmployees.map((employee) => employee.id);
    const from = nextOrder.indexOf(draggedEmployeeId);
    const to = nextOrder.indexOf(targetEmployeeId);
    if (from < 0 || to < 0) return;
    nextOrder.splice(from, 1);
    nextOrder.splice(to, 0, draggedEmployeeId);
    void saveColumnOrder(nextOrder);
  }

  function resetColumnsToTenure() {
    void saveColumnOrder([]);
  }
  const activeUnassignedJobs = useMemo(
    () =>
      unassignedJobs.filter(
        (job) =>
          !RETAINED_STATUSES.includes(job.status) && job.status !== "completed",
      ),
    [unassignedJobs],
  );
  const retainedUnassignedJobs = useMemo(
    () =>
      unassignedJobs.filter((job) => RETAINED_STATUSES.includes(job.status)),
    [unassignedJobs],
  );
  const visibleActiveJobs = queueExpanded
    ? activeUnassignedJobs
    : activeUnassignedJobs.slice(0, 4);
  const visibleRetainedJobs = queueExpanded
    ? retainedUnassignedJobs
    : retainedUnassignedJobs.slice(0, 2);
  const hasMoreQueueJobs =
    activeUnassignedJobs.length > visibleActiveJobs.length ||
    retainedUnassignedJobs.length > visibleRetainedJobs.length;
  const timedJobs = jobs.filter((job) => job.scheduledStartTime);
  const unscheduledJobs = jobs.filter((job) => !job.scheduledStartTime);
  const ptoByEmployee = useMemo(() => {
    const periods = new Map<string, PtoPeriod>();
    for (const pto of ptoRecords) {
      const next = ptoPeriodForDay(pto, dayIso);
      const current = periods.get(pto.userId);
      periods.set(pto.userId, current && current !== next ? "full" : next);
    }
    return periods;
  }, [dayIso, ptoRecords]);

  if (initialJobs !== syncedJobs) {
    setSyncedJobs(initialJobs);
    setJobs(initialJobs);
  }

  function dropOnEmployee(
    event: React.DragEvent<HTMLDivElement>,
    employeeId: string,
  ) {
    event.preventDefault();
    setDragOver(null);
    const jobId = event.dataTransfer.getData("text/plain");
    const job = jobs.find((entry) => entry.id === jobId);
    if (!job || ["completed", "cancelled", "no_show"].includes(job.status))
      return;

    const previousEmployees = job.assignedUserIds;
    const nextEmployees = Array.from(
      new Set([...previousEmployees, employeeId]),
    );
    const isExistingLane = previousEmployees.includes(employeeId);
    const previousTime = job.scheduledStartTime;
    const clampedMinutes = minutesFromDragEvent(event);
    const nextTime = `${String(Math.floor(clampedMinutes / 60)).padStart(2, "0")}:${String(clampedMinutes % 60).padStart(2, "0")}`;

    if (
      JSON.stringify(previousEmployees) === JSON.stringify(nextEmployees) &&
      previousTime === nextTime
    )
      return;
    setJobs((current) =>
      current.map((entry) =>
        entry.id === job.id
          ? {
              ...entry,
              assignedUserIds: nextEmployees,
              scheduledStartTime: nextTime,
            }
          : entry,
      ),
    );
    commitJobPatch(
      job.id,
      { employeeIds: nextEmployees, scheduledStartTime: nextTime ?? null },
      {
        onOptimistic: () => undefined,
        onSuccess: () => {
          router.refresh();
          showUndo(
            isExistingLane
              ? "Job time updated"
              : "Technician added to the crew",
            () =>
              commitJobPatch(
                job.id,
                {
                  employeeIds: previousEmployees,
                  scheduledStartTime: previousTime ?? null,
                },
                {
                  onOptimistic: () =>
                    setJobs((current) =>
                      current.map((entry) =>
                        entry.id === job.id
                          ? {
                              ...entry,
                              assignedUserIds: previousEmployees,
                              scheduledStartTime: previousTime,
                            }
                          : entry,
                      ),
                    ),
                  onSuccess: () => router.refresh(),
                  onError: setError,
                },
              ),
          );
        },
        onWarning: setWarning,
        onError: (message) => {
          setError(message);
          setJobs((current) =>
            current.map((entry) =>
              entry.id === job.id
                ? {
                    ...entry,
                    assignedUserIds: previousEmployees,
                    scheduledStartTime: previousTime,
                  }
                : entry,
            ),
          );
        },
      },
    );
  }

  function addTechnician(jobId: string, employeeId: string) {
    const job = jobs.find((entry) => entry.id === jobId);
    if (
      !job ||
      !employeeId ||
      ["completed", "cancelled", "no_show"].includes(job.status)
    )
      return;
    if (job.assignedUserIds.includes(employeeId)) {
      setWarning("That technician is already assigned to this job.");
      return;
    }
    if (!employees.find((candidate) => candidate.id === employeeId)?.isActive) {
      setWarning("That technician is inactive and can't be assigned to new jobs.");
      return;
    }
    const previousEmployees = job.assignedUserIds;
    const nextEmployees = [...previousEmployees, employeeId];
    setJobs((current) =>
      current.map((entry) =>
        entry.id === job.id
          ? { ...entry, assignedUserIds: nextEmployees }
          : entry,
      ),
    );
    commitJobPatch(
      job.id,
      { employeeIds: nextEmployees },
      {
        onOptimistic: () => undefined,
        onSuccess: () => {
          router.refresh();
          showUndo("Technician added to the crew", () =>
            commitJobPatch(
              job.id,
              { employeeIds: previousEmployees },
              {
                onOptimistic: () =>
                  setJobs((current) =>
                    current.map((entry) =>
                      entry.id === job.id
                        ? { ...entry, assignedUserIds: previousEmployees }
                        : entry,
                    ),
                  ),
                onSuccess: () => router.refresh(),
                onError: setError,
              },
            ),
          );
        },
        onWarning: setWarning,
        onError: (message) => {
          setError(message);
          setJobs((current) =>
            current.map((entry) =>
              entry.id === job.id
                ? { ...entry, assignedUserIds: previousEmployees }
                : entry,
            ),
          );
        },
      },
    );
  }

  function removeTechnician(jobId: string, employeeId: string) {
    const job = jobs.find((entry) => entry.id === jobId);
    if (!job || !employeeId || !job.assignedUserIds.includes(employeeId)) {
      setWarning("That technician is not assigned to this job.");
      return;
    }
    const previousEmployees = job.assignedUserIds;
    const nextEmployees = previousEmployees.filter((id) => id !== employeeId);
    setJobs((current) =>
      current.map((entry) =>
        entry.id === job.id
          ? { ...entry, assignedUserIds: nextEmployees }
          : entry,
      ),
    );
    commitJobPatch(
      job.id,
      { employeeIds: nextEmployees },
      {
        onOptimistic: () => undefined,
        onSuccess: () => {
          router.refresh();
          showUndo("Technician removed from the crew", () =>
            commitJobPatch(
              job.id,
              { employeeIds: previousEmployees },
              {
                onOptimistic: () =>
                  setJobs((current) =>
                    current.map((entry) =>
                      entry.id === job.id
                        ? { ...entry, assignedUserIds: previousEmployees }
                        : entry,
                    ),
                  ),
                onSuccess: () => router.refresh(),
                onError: setError,
              },
            ),
          );
        },
        onError: (message) => {
          setError(message);
          setJobs((current) =>
            current.map((entry) =>
              entry.id === job.id
                ? { ...entry, assignedUserIds: previousEmployees }
                : entry,
            ),
          );
        },
      },
    );
  }

  function startMinutesOf(job: CalendarJob) {
    const [hour, minute] = (job.scheduledStartTime ?? "09:00")
      .slice(0, 5)
      .split(":")
      .map(Number);
    return hour * 60 + minute;
  }

  function jobStyle(
    job: CalendarJob,
    lane: number,
    laneCount: number,
    durationOverride?: number,
  ) {
    const top = Math.max(
      0,
      Math.min(((startMinutesOf(job) - START) / TOTAL) * 100, 94),
    );
    const height = Math.max(
      ((durationOverride ?? job.estimatedDurationMinutes ?? 75) / TOTAL) * 100,
      8,
    );
    const width = 100 / laneCount;
    return {
      top: `${top}%`,
      height: `${height}%`,
      left: `calc(${lane * width}% + 0.25rem)`,
      width: `calc(${width}% - 0.5rem)`,
    };
  }

  function startResize(
    event: React.PointerEvent<HTMLDivElement>,
    job: CalendarJob,
  ) {
    if (["completed", "cancelled", "no_show"].includes(job.status)) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing({
      jobId: job.id,
      startY: event.clientY,
      initialDuration: job.estimatedDurationMinutes ?? 75,
      previewDuration: job.estimatedDurationMinutes ?? 75,
    });
  }

  function onResizeMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!resizing || resizing.jobId !== event.currentTarget.dataset.jobId)
      return;
    const job = jobs.find((entry) => entry.id === resizing.jobId);
    if (!job) return;
    const deltaMinutes =
      ((event.clientY - resizing.startY) / (HOUR_HEIGHT * HOURS)) * TOTAL;
    const rawDuration = resizing.initialDuration + deltaMinutes;
    const snapped = Math.round(rawDuration / 15) * 15;
    const maxDuration = Math.max(START + TOTAL - startMinutesOf(job), 15);
    const clamped = Math.min(Math.max(snapped, 15), maxDuration);
    setResizing((current) =>
      current ? { ...current, previewDuration: clamped } : current,
    );
  }

  function endResize() {
    if (!resizing) return;
    const { jobId, initialDuration, previewDuration } = resizing;
    setResizing(null);
    if (previewDuration === initialDuration) return;
    setJobs((current) =>
      current.map((entry) =>
        entry.id === jobId
          ? { ...entry, estimatedDurationMinutes: previewDuration }
          : entry,
      ),
    );
    commitJobPatch(
      jobId,
      { estimatedDurationMinutes: previewDuration },
      {
        onOptimistic: () => undefined,
        onSuccess: () => {
          router.refresh();
          showUndo("Job duration updated", () =>
            commitJobPatch(
              jobId,
              { estimatedDurationMinutes: initialDuration },
              {
                onOptimistic: () =>
                  setJobs((current) =>
                    current.map((entry) =>
                      entry.id === jobId
                        ? { ...entry, estimatedDurationMinutes: initialDuration }
                        : entry,
                    ),
                  ),
                onSuccess: () => router.refresh(),
                onError: setError,
              },
            ),
          );
        },
        onWarning: setWarning,
        onError: (message) => {
          setError(message);
          setJobs((current) =>
            current.map((entry) =>
              entry.id === jobId
                ? { ...entry, estimatedDurationMinutes: initialDuration }
                : entry,
            ),
          );
        },
      },
    );
  }

  function scrollBoardWhileDragging(event: React.DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("text/plain")) return;
    const board = boardScrollRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const edgeSize = 80;
    const scrollStep = 28;
    if (event.clientX < rect.left + edgeSize) board.scrollLeft -= scrollStep;
    if (event.clientX > rect.right - edgeSize) board.scrollLeft += scrollStep;
  }

  function queueCard(job: CalendarJob, retained = false) {
    return (
      <button
        key={job.id}
        type="button"
        draggable={!retained}
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", job.id);
          event.dataTransfer.effectAllowed = "move";
        }}
        data-testid="unassigned-job-card"
        onClick={() => setOpenJobId(job.id)}
        aria-label={`Assign a cleaner for ${customerName(job)}`}
        className={`block w-full rounded-lg border p-2.5 text-left transition hover:bg-[var(--co-accent-tint)] ${retained ? "border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]" : "border-dashed border-[var(--co-line)]"}`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-xs font-semibold">{customerName(job)}</p>
          <span
            className={`shrink-0 text-[10px] font-semibold ${retained ? "text-[var(--co-muted)]" : "text-[var(--co-evergreen)]"}`}
          >
            {formatEstimatedTime(job.estimatedDurationMinutes)}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-[var(--co-muted)]">
          {job.scheduledStartTime?.slice(0, 5) ?? "No time"} ·{" "}
          {job.customerCity ?? "No city"}, {job.customerZip ?? "No ZIP"}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
          <span className="text-[var(--co-faint)]">
            {job.clientType === "commercial" ? "Commercial" : "Residential"}
          </span>
          <span
            className={retained ? "text-[var(--co-muted)]" : "text-amber-700"}
          >
            {statusLabel(job.status)}
          </span>
        </div>
      </button>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0 overflow-hidden border border-[var(--co-line)] bg-[var(--co-surface)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--co-line-soft)] px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">
              Staff Daily — {dayLabel}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--co-muted)]">
              Employees are ordered by tenure. Drag a column header to set a
              custom order. Scroll sideways to see every cleaner; drag jobs
              between columns to assign the team.
            </p>
            {isHoliday ? (
              <p className="mt-1 text-xs font-semibold text-amber-800">
                Holiday — dispatch capacity is closed.
              </p>
            ) : null}
          </div>
          <span className="text-xs font-medium text-[var(--co-muted)]">
            {jobs.length} jobs
          </span>
          {!laneEmployeeId ? (
            <button
              type="button"
              onClick={resetColumnsToTenure}
              className="co-button-secondary text-xs"
            >
              Sort by tenure
            </button>
          ) : null}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            addTechnician(selectedJobId, selectedEmployeeId);
          }}
          className="flex flex-wrap items-center gap-2 border-b border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-4 py-2.5"
        >
          <span className="text-xs font-semibold text-[var(--co-ink)]">
            Assign by touch or keyboard
          </span>
          <select
            value={selectedJobId}
            onChange={(event) => setSelectedJobId(event.target.value)}
            aria-label="Select job to assign"
            className="co-input min-w-44 flex-1 py-1.5 text-xs"
          >
            <option value="">Choose a job</option>
            {jobs
              .filter(
                (job) =>
                  !["completed", "cancelled", "no_show"].includes(job.status),
              )
              .map((job) => (
                <option key={job.id} value={job.id}>
                  {customerName(job)} ·{" "}
                  {job.scheduledStartTime?.slice(0, 5) ?? "No time"}
                </option>
              ))}
          </select>
          <select
            value={selectedEmployeeId}
            onChange={(event) => setSelectedEmployeeId(event.target.value)}
            aria-label="Select technician to add"
            className="co-input min-w-40 flex-1 py-1.5 text-xs"
          >
            <option value="">Choose a technician</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.firstName} {employee.lastName}
                {employee.isActive ? "" : " (Inactive)"}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!selectedJobId || !selectedEmployeeId}
            className="co-button-secondary py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add technician
          </button>
          <button
            type="button"
            onClick={() => removeTechnician(selectedJobId, selectedEmployeeId)}
            disabled={!selectedJobId || !selectedEmployeeId}
            className="co-button-secondary py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            Remove technician
          </button>
        </form>
        {unscheduledJobs.length ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold text-amber-900">
              No time scheduled ({unscheduledJobs.length})
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {unscheduledJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  employees={employees}
                  draggable
                  onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", job.id);
          event.dataTransfer.effectAllowed = "move";
        }}
                  onOpen={setDetailJobId}
                />
              ))}
            </div>
          </div>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700"
          >
            {error}
          </p>
        ) : null}
        {warning ? (
          <p
            role="status"
            className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900"
          >
            Scheduling warning: {warning}
          </p>
        ) : null}
        <div ref={boardScrollRef} onDragOver={scrollBoardWhileDragging} className="max-h-[calc(100dvh-13rem)] overflow-auto overscroll-contain [scrollbar-gutter:stable]">
          <div
            style={{
              minWidth: `${120 + Math.max(sortedEmployees.length, 1) * 180}px`,
            }}
          >
            <div
              className="sticky top-0 z-30 grid divide-x divide-[var(--co-line-soft)] border-b border-[var(--co-line-soft)] shadow-sm"
              style={{
                gridTemplateColumns: `120px repeat(${Math.max(sortedEmployees.length, 1)}, minmax(180px, 1fr))`,
              }}
            >
              <div className="bg-[var(--co-surface-muted)] px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-faint)]">
                Time
              </div>
              {sortedEmployees.map((employee) => (
                <div
                  key={employee.id}
                  draggable={!laneEmployeeId}
                  onDragStart={(event) => {
                    setDraggedEmployeeId(employee.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("application/x-cleanops-employee-column", employee.id);
                  }}
                  onDragOver={(event) => {
                    if (!draggedEmployeeId) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    moveEmployeeColumn(employee.id);
                    setDraggedEmployeeId(null);
                  }}
                  onDragEnd={() => setDraggedEmployeeId(null)}
                  aria-label={`Drag ${employee.firstName} ${employee.lastName}'s column to reorder`}
                  className={`bg-[var(--co-surface-muted)] px-2 py-3 text-center ${laneEmployeeId ? "" : "cursor-grab active:cursor-grabbing"}`}
                  style={{ borderTop: `3px solid ${employee.calendarColor ?? employeeColor(employee.id)}` }}
                >
                  <p className="flex items-center justify-center gap-1.5 truncate text-xs font-semibold">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: employee.calendarColor ?? employeeColor(employee.id) }}
                    />
                    {employee.firstName} {employee.lastName.slice(0, 1)}.
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--co-faint)]">
                    {
                      jobs.filter((job) =>
                        job.assignedUserIds.includes(employee.id),
                      ).length
                    }{" "}
                    jobs
                  </p>
                </div>
              ))}
              {sortedEmployees.length === 0 ? (
                <div className="bg-[var(--co-surface-muted)] px-3 py-3 text-xs text-[var(--co-muted)]">
                  No active technicians
                </div>
              ) : null}
            </div>
            <div
              className="grid divide-x divide-[var(--co-line-soft)]"
              style={{
                gridTemplateColumns: `120px repeat(${Math.max(sortedEmployees.length, 1)}, minmax(180px, 1fr))`,
              }}
            >
              <div
                className="relative bg-[var(--co-surface-muted)]"
                style={{ minHeight: `${HOUR_HEIGHT * HOURS}px` }}
              >
                {Array.from({ length: HOURS + 1 }, (_, index) => (
                  <span
                    key={index}
                    className="absolute right-3 text-[11px] font-medium text-[var(--co-muted)]"
                    style={{ top: `${index * HOUR_HEIGHT - 7}px` }}
                  >
                    {index === HOURS
                      ? `${index + 9 > 12 ? index - 3 : index + 9} PM`
                      : `${index + 9 > 12 ? index - 3 : index + 9}:00 ${index + 9 >= 12 ? "PM" : "AM"}`}
                  </span>
                ))}
              </div>
              {sortedEmployees.map((employee) => {
                const employeeJobs = timedJobs
                  .filter((job) => job.assignedUserIds.includes(employee.id))
                  .sort((a, b) =>
                    (a.scheduledStartTime ?? "99").localeCompare(
                      b.scheduledStartTime ?? "99",
                    ),
                  );
                const lanes = assignDayLanes(employeeJobs);
                const ptoPeriod = ptoByEmployee.get(employee.id);
                return (
                  <div
                    key={employee.id}
                    className={`relative border-t border-[var(--co-line-soft)] ${dragOver?.employeeId === employee.id ? "bg-[var(--co-accent-tint)]" : "bg-[var(--co-surface)]"}`}
                    style={{ minHeight: `${HOUR_HEIGHT * HOURS}px` }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOver({
                        employeeId: employee.id,
                        minutes: minutesFromDragEvent(event),
                      });
                    }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(event) => dropOnEmployee(event, employee.id)}
                  >
                    {Array.from({ length: 8 }, (_, index) => (
                      <div
                        key={index}
                        className="absolute inset-x-0 border-t border-[var(--co-line-soft)]"
                        style={{ top: `${index * HOUR_HEIGHT}px` }}
                      />
                    ))}
                    {ptoPeriod ? (
                      <div
                        className="pointer-events-none absolute inset-x-0 z-20 border-y border-amber-300 bg-amber-100/70 px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-900"
                        style={ptoStyle(ptoPeriod)}
                      >
                        PTO{ptoPeriod === "full" ? "" : ` - ${ptoPeriod}`}
                      </div>
                    ) : null}
                    {employeeJobs.map((job) => {
                      const placement = lanes.get(job.id);
                      if (!placement || placement.hidden) return null;
                      const isResizingThis = resizing?.jobId === job.id;
                      const isLocked = [
                        "completed",
                        "cancelled",
                        "no_show",
                      ].includes(job.status);
                      return (
                        <div
                          key={job.id}
                          className={`group absolute ${isResizingThis ? "z-30" : "z-10"}`}
                          style={jobStyle(
                            job,
                            placement.lane,
                            placement.laneCount,
                            isResizingThis ? resizing.previewDuration : undefined,
                          )}
                        >
                          <JobCard
                            job={job}
                            employees={employees}
                            draggable
                            onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", job.id);
          event.dataTransfer.effectAllowed = "move";
        }}
                            onOpen={setDetailJobId}
                          />
                          {placement.overflowCount > 0 ? (
                            <span className="absolute bottom-1 right-1 rounded bg-[var(--co-ink)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              +{placement.overflowCount} overlapping
                            </span>
                          ) : null}
                          {!isLocked ? (
                            <div
                              role="presentation"
                              aria-label="Drag to extend job duration"
                              data-job-id={job.id}
                              onPointerDown={(event) => startResize(event, job)}
                              onPointerMove={onResizeMove}
                              onPointerUp={endResize}
                              onPointerCancel={endResize}
                              className={`absolute inset-x-0 bottom-0 z-20 flex h-3 cursor-ns-resize touch-none items-end justify-center pb-0.5 transition-opacity ${isResizingThis ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                            >
                              <span className="h-1 w-8 rounded-full bg-[var(--co-ink)]/40" />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    {dragOver?.employeeId === employee.id ? (
                      <div
                        className="pointer-events-none absolute inset-x-2 z-20 -translate-y-1/2 rounded-lg border border-dashed border-[var(--co-evergreen)] bg-white/90 p-2 text-center text-xs font-semibold text-[var(--co-evergreen)]"
                        style={{
                          top: `${Math.max(0, Math.min(((dragOver.minutes - START) / TOTAL) * 100, 100))}%`,
                        }}
                      >
                        Drop at {clockLabelFromMinutes(dragOver.minutes)}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {sortedEmployees.length === 0 ? (
                <div
                  className="flex items-start justify-center bg-[var(--co-surface)] px-4 py-10 text-center text-sm text-[var(--co-muted)]"
                  style={{ minHeight: `${HOUR_HEIGHT * HOURS}px` }}
                >
                  Create or activate a technician to use the dispatch board.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
      <aside className="space-y-4 lg:sticky lg:top-5 lg:max-h-[calc(100dvh-2.5rem)] lg:self-start lg:overflow-y-auto lg:pb-5">
        <section className="border border-[var(--co-line)] bg-[var(--co-surface)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Unassigned queue</h3>
              <p className="mt-0.5 text-[11px] text-[var(--co-muted)]">
                {dayLabel}
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeUnassignedJobs.length ? "bg-rose-100 text-rose-700" : "bg-[var(--co-surface-muted)] text-[var(--co-muted)]"}`}
            >
              {activeUnassignedJobs.length} to assign
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {activeUnassignedJobs.length ? (
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                Needs assignment
              </p>
            ) : null}
            {visibleActiveJobs.map((job) => queueCard(job))}
            {!activeUnassignedJobs.length ? (
              <p className="rounded-lg bg-[var(--co-accent-tint)] px-3 py-3 text-center text-xs text-[var(--co-evergreen)]">
                No jobs need assignment for this day.
              </p>
            ) : null}
            {retainedUnassignedJobs.length ? (
              <div className="pt-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">
                    On hold / cancelled
                  </p>
                  <span className="text-[10px] text-[var(--co-muted)]">
                    {retainedUnassignedJobs.length}
                  </span>
                </div>
                <div className="mt-2 space-y-2">
                  {visibleRetainedJobs.map((job) => queueCard(job, true))}
                </div>
              </div>
            ) : null}
            {unassignedJobs.length === 0 ? (
              <p className="py-2 text-center text-xs text-[var(--co-muted)]">
                No unassigned jobs for this day.
              </p>
            ) : null}
          </div>
          {unassignedJobs.length > 0 ? (
            <button
              data-testid="view-all-unassigned"
              data-day={dayIso}
              type="button"
              onClick={() => setQueueExpanded((expanded) => !expanded)}
              className="mt-3 block w-full border-t border-[var(--co-line-soft)] pt-3 text-center text-xs font-semibold text-[var(--co-evergreen)] hover:underline"
            >
              {queueExpanded
                ? "Show less"
                : `View all unassigned (${unassignedJobs.length})`}
            </button>
          ) : null}
          {unassignedJobs.length > 0 && !queueExpanded && hasMoreQueueJobs ? (
            <p className="mt-2 text-center text-[10px] text-[var(--co-muted)]">
              Open a job to review its details or assign cleaners.
            </p>
          ) : null}
        </section>
      </aside>
      <UndoToast toast={toast} onDismiss={dismiss} />
      <UnassignedPanel
        jobId={openJobId}
        employees={employees}
        onClose={() => setOpenJobId(null)}
      />
      <JobDetailPanel
        jobId={detailJobId}
        employees={employees}
        onClose={() => setDetailJobId(null)}
      />
    </div>
  );
}
