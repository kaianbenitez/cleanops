"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock3,
  KeyRound,
  PawPrint,
  Repeat,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { CalendarAppointment, CalendarEmployee, CalendarJob, StaffRosterMember } from "./page";
import { commitJobPatch } from "./drag-commit";
import { UndoToast, useUndoToast } from "./undo-toast";
import JobDetailPanel from "./job-detail-panel";
import AppointmentPanel from "./appointment-panel";
import {
  APPOINTMENT_COLOR,
  APPOINTMENT_COLOR_CANCELLED,
  assignDayLanes,
  capacityForCrew,
  categorizeForAttention,
  clockLabelFromMinutes,
  DEFAULT_WORKDAY_END_MINUTES,
  DEFAULT_WORKDAY_START_MINUTES,
  displayCustomer,
  employeeColor,
  formatAppointmentTime,
  hasArrivalTime,
  isPlainClick,
  jobDuration,
  jobsOverlap,
  jobWallClockDuration,
  minuteOfDayInTimeZone,
  minutesFromTime,
  ordinalLabel,
  stopOrdinals,
  TYPE_LABELS,
} from "./shared";
import type { EmployeePtoRecord, PtoPeriod } from "@/lib/scheduling/pto";
import { minutesToTime } from "@/lib/scheduling/wall-clock";
import { cleanNoteText } from "@/lib/format";

// ---------------------------------------------------------------------------
// Geometry — every number here is lifted from the approved prototype
// (calendar-board-prototype.html) and the Calendar Board replication spec.
// Do not round or retune. Driven by workdayStartMinutes/workdayEndMinutes,
// not a hardcoded window.
// ---------------------------------------------------------------------------
const HOUR_HEIGHT = 64; // --hour-h, vertical axis
const HOUR_WIDTH = 118; // --hour-w, horizontal axis
const LANE_HEIGHT_BASE = 78; // --lane-h, horizontal axis base row height
const LANE_HEADER_WIDTH = 206; // horizontal axis lane header column width
const TIME_GUTTER_WIDTH = 58; // vertical axis time gutter column width
const CREW_COLUMN_MIN_WIDTH = 174; // vertical axis crew column minmax floor
const COMPACT_HEIGHT_VERTICAL = 60; // below this, drop the 3rd card line
const COMPACT_HEIGHT_HORIZONTAL = 58;
const PLACEMENT_SNAP_MINUTES = 15;
const RETAINED_STATUSES = ["cancelled", "no_show"];
const LOCKED_STATUSES = ["completed", "cancelled", "no_show"];

type Verdict = { state: "blocked" | "warn" | "ok"; message: string };

function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (!hours) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function ptoPeriodForDay(pto: EmployeePtoRecord, dayIso: string): PtoPeriod {
  if (pto.startDate === pto.endDate)
    return pto.startPeriod === pto.endPeriod ? pto.startPeriod : "full";
  if (pto.startDate === dayIso) return pto.startPeriod;
  if (pto.endDate === dayIso) return pto.endPeriod;
  return "full";
}

/** Half-day PTO splits at noon — the same convention `pto.ts`'s own
 * `jobPeriod()` uses to classify a job as morning/afternoon. */
function ptoIntervalForPeriod(period: PtoPeriod, windowStart: number, windowEnd: number): { from: number; to: number } {
  const noon = 12 * 60;
  if (period === "morning") return { from: windowStart, to: Math.min(noon, windowEnd) };
  if (period === "afternoon") return { from: Math.max(noon, windowStart), to: windowEnd };
  return { from: windowStart, to: windowEnd };
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The three placement verdicts, priority order first-match-wins, exact copy
 * from the replication spec. `duration` is the job's own raw duration (it
 * becomes a single-employee assignment on commit); `otherJobs` are the
 * lane's existing jobs at their wall-clock (elapsed, crew-shared) duration —
 * overlap is a real-time question, capacity is a labor-hours question. */
function evaluatePlacement({
  ptoInterval,
  otherJobs,
  start,
  duration,
  windowEnd,
  capacity,
}: {
  ptoInterval: { from: number; to: number } | null;
  otherJobs: CalendarJob[];
  start: number;
  duration: number;
  windowEnd: number;
  capacity: { usedMinutes: number; availableMinutes: number };
}): Verdict {
  if (ptoInterval && start < ptoInterval.to && ptoInterval.from < start + duration) {
    return { state: "blocked", message: "On leave" };
  }
  const startTime = minutesToTime(start);
  const hit = otherJobs.find((job) =>
    jobsOverlap({ scheduledStartTime: startTime }, duration, job, jobWallClockDuration(job)),
  );
  if (hit) {
    return {
      state: "warn",
      message: `Overlaps ${clockLabelFromMinutes(minutesFromTime(hit.scheduledStartTime))} ${displayCustomer(hit)}`,
    };
  }
  if (start + duration > windowEnd) {
    return { state: "warn", message: `Runs past ${clockLabelFromMinutes(windowEnd)}` };
  }
  if (capacity.availableMinutes > 0 && capacity.usedMinutes + duration > capacity.availableMinutes) {
    return { state: "warn", message: `Over ${formatDuration(capacity.availableMinutes)} day` };
  }
  return { state: "ok", message: `Place at ${clockLabelFromMinutes(start)}` };
}

function verdictClasses(state: Verdict["state"]) {
  if (state === "blocked")
    return "bg-[color-mix(in_srgb,var(--co-faint)_9%,transparent)] shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--co-faint)_34%,transparent)] cursor-not-allowed";
  if (state === "warn")
    return "bg-[color-mix(in_srgb,var(--co-warning)_9%,transparent)] shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--co-warning)_52%,transparent)]";
  return "bg-[color-mix(in_srgb,var(--co-accent-fill)_7%,transparent)] shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--co-accent-fill)_46%,transparent)]";
}

function verdictNoteClasses(state: Verdict["state"]) {
  if (state === "blocked") return "bg-[var(--co-surface-muted-2)] text-[var(--co-muted)] border border-[var(--co-line)]";
  if (state === "warn") return "bg-[var(--co-warning)] text-white";
  return "bg-[var(--co-accent-fill)] text-white";
}

function VerdictIcon({ state, className }: { state: Verdict["state"]; className?: string }) {
  if (state === "blocked") return <Ban className={className} aria-hidden strokeWidth={1.75} />;
  if (state === "warn") return <TriangleAlert className={className} aria-hidden strokeWidth={1.75} />;
  return <CheckCircle2 className={className} aria-hidden strokeWidth={1.75} />;
}

function JobMarks({ job, warn }: { job: CalendarJob; warn: boolean }) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-[3px]">
      {warn ? <TriangleAlert className="h-[11px] w-[11px] text-[var(--co-warning)]" aria-hidden strokeWidth={1.75} /> : null}
      {job.recurringSeriesId ? <Repeat className="h-[11px] w-[11px] text-[var(--co-faint)]" aria-hidden strokeWidth={1.75} /> : null}
      {job.petNotes ? <PawPrint className="h-[11px] w-[11px] text-[var(--co-faint)]" aria-hidden strokeWidth={1.75} /> : null}
      {job.gateCodeOrKeyNotes ? <KeyRound className="h-[11px] w-[11px] text-[var(--co-faint)]" aria-hidden strokeWidth={1.75} /> : null}
      {job.doNotClean ? <Ban className="h-[11px] w-[11px] text-[var(--co-faint)]" aria-hidden strokeWidth={1.75} /> : null}
    </span>
  );
}

function CapacityMeter({ usedMinutes, availableMinutes, isOver, onLeave }: { usedMinutes: number; availableMinutes: number; isOver: boolean; onLeave: boolean }) {
  const percent = availableMinutes ? Math.min((usedMinutes / availableMinutes) * 100, 100) : 100;
  const fillColor = isOver ? "var(--co-warning)" : onLeave ? "var(--co-faint)" : "var(--co-accent-fill)";
  return (
    <div className="mt-1.5 flex items-center gap-[7px]">
      <div className="h-1 min-w-[26px] flex-1 overflow-hidden rounded-full bg-[var(--co-surface-muted-2)]">
        <div
          className="h-full rounded-full"
          style={{ width: `${percent}%`, background: fillColor, transition: "width 550ms cubic-bezier(.16,1,.3,1)" }}
        />
      </div>
      <span className={`whitespace-nowrap text-[10.5px] font-bold ${isOver ? "text-[var(--co-warning)]" : "text-[var(--co-faint)]"}`}>
        {formatDuration(usedMinutes)} / {availableMinutes ? formatDuration(availableMinutes) : "off"}
      </span>
    </div>
  );
}

export default function Board({
  axis,
  dayIso,
  todayIso,
  dayLabel,
  timezone,
  employees,
  savedColumnOrder,
  laneEmployeeId,
  jobs: initialJobs,
  ptoRecords,
  appointments = [],
  staffRoster = [],
  workdayStartMinutes,
  workdayEndMinutes,
  workdayMinutesPerCleaner,
}: {
  axis: "vertical" | "horizontal";
  dayIso: string;
  todayIso: string;
  dayLabel: string;
  /** IANA zone the company operates in — the now-line reads the clock in
   * this zone, not the viewer's own. */
  timezone: string;
  employees: CalendarEmployee[];
  savedColumnOrder: string[];
  laneEmployeeId?: string;
  jobs: CalendarJob[];
  ptoRecords: EmployeePtoRecord[];
  appointments?: CalendarAppointment[];
  staffRoster?: StaffRosterMember[];
  workdayStartMinutes?: number;
  workdayEndMinutes?: number;
  workdayMinutesPerCleaner?: number;
}) {
  const router = useRouter();
  const windowStart = workdayStartMinutes ?? DEFAULT_WORKDAY_START_MINUTES;
  const windowEnd = workdayEndMinutes ?? DEFAULT_WORKDAY_END_MINUTES;
  const windowMinutes = windowEnd - windowStart;
  const hours = Math.max(1, Math.round(windowMinutes / 60));
  const workdayMinutes = workdayMinutesPerCleaner ?? 8 * 60;

  const [jobs, setJobs] = useState(initialJobs);
  const [syncedJobs, setSyncedJobs] = useState(initialJobs);
  if (initialJobs !== syncedJobs) {
    setSyncedJobs(initialJobs);
    setJobs(initialJobs);
  }
  const cleanedJobs = useMemo(
    () =>
      jobs.map((job) => ({
        ...job,
        customerNotes: cleanNoteText(job.customerNotes),
        gateCodeOrKeyNotes: cleanNoteText(job.gateCodeOrKeyNotes),
        petNotes: cleanNoteText(job.petNotes),
      })),
    [jobs],
  );

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<{ employeeId: string; minutes: number } | null>(null);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [dragOverEmployeeId, setDragOverEmployeeId] = useState<string | null>(null);
  // Duration-resize (vertical axis only, carried over from the pre-merge
  // vertical board — dragging a job card's bottom edge to change its
  // estimated duration). Not part of the prototype; kept so the merge
  // doesn't quietly drop an existing feature.
  const [resizing, setResizing] = useState<{ jobId: string; startY: number; initialDuration: number; previewDuration: number } | null>(null);
  const [columnOrder, setColumnOrder] = useState(savedColumnOrder);
  const [draggedEmployeeId, setDraggedEmployeeId] = useState<string | null>(null);
  // Attention-rail drop affordance for the lane->rail unassign gesture below.
  const [railDropActive, setRailDropActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const { toast, showUndo, dismiss } = useUndoToast();

  const gridScrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const railCardRefs = useRef(new Map<string, HTMLElement>());
  const jobCardRefs = useRef(new Map<string, HTMLElement>());
  const pendingFlyRef = useRef<{ jobId: string; from: DOMRect; color: string; label: string } | null>(null);
  const isFirstAxisRender = useRef(true);

  const selectedJob = selectedJobId ? cleanedJobs.find((job) => job.id === selectedJobId) ?? null : null;

  const employeesById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);

  const activeEmployees = useMemo(() => employees.filter((employee) => employee.isActive), [employees]);
  const sortedEmployees = useMemo(() => {
    const byTenure = [...activeEmployees].sort((left, right) => {
      if (left.hiredDate && right.hiredDate)
        return left.hiredDate.localeCompare(right.hiredDate) || left.firstName.localeCompare(right.firstName);
      if (left.hiredDate) return -1;
      if (right.hiredDate) return 1;
      return left.firstName.localeCompare(right.firstName);
    });
    if (laneEmployeeId) return byTenure.filter((employee) => employee.id === laneEmployeeId);
    if (axis !== "vertical") return byTenure;
    const rank = new Map(columnOrder.map((id, index) => [id, index]));
    return byTenure.sort((left, right) => (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER));
  }, [activeEmployees, axis, columnOrder, laneEmployeeId]);

  async function saveColumnOrder(nextOrder: string[]) {
    setColumnOrder(nextOrder);
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffColumnOrder: nextOrder }),
    });
    if (!response.ok) {
      setColumnOrder(savedColumnOrder);
      setError("Could not save the crew column order. Please try again.");
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

  // Per-employee derived data: this crew's timed+assigned jobs, their lane
  // packing (via the existing assignDayLanes — no second algorithm), PTO
  // interval for the day, and capacity.
  const ptoByEmployee = useMemo(() => {
    const periods = new Map<string, PtoPeriod>();
    const notes = new Map<string, string>();
    for (const pto of ptoRecords) {
      const next = ptoPeriodForDay(pto, dayIso);
      const current = periods.get(pto.userId);
      periods.set(pto.userId, current && current !== next ? "full" : next);
      if (pto.note && !notes.has(pto.userId)) notes.set(pto.userId, pto.note);
    }
    const intervals = new Map<string, { from: number; to: number }>();
    for (const [employeeId, period] of periods) intervals.set(employeeId, ptoIntervalForPeriod(period, windowStart, windowEnd));
    return { periods, notes, intervals };
  }, [dayIso, ptoRecords, windowStart, windowEnd]);

  const laneData = useMemo(() => {
    const map = new Map<
      string,
      {
        jobs: CalendarJob[];
        lanes: Map<string, { lane: number; laneCount: number; hidden: boolean; overflowCount: number }>;
        maxLanes: number;
        capacity: { usedMinutes: number; availableMinutes: number; isOver: boolean };
      }
    >();
    for (const employee of sortedEmployees) {
      const employeeJobs = cleanedJobs
        .filter((job) => job.assignedUserIds.includes(employee.id) && hasArrivalTime(job))
        .sort((a, b) => (a.scheduledStartTime ?? "").localeCompare(b.scheduledStartTime ?? ""));
      const lanes = assignDayLanes(employeeJobs, Math.max(employeeJobs.length, 1));
      const maxLanes = employeeJobs.length ? Math.max(...employeeJobs.map((job) => lanes.get(job.id)?.laneCount ?? 1)) : 1;
      const capacity = capacityForCrew({
        jobs: cleanedJobs.filter((job) => job.assignedUserIds.includes(employee.id)),
        pto: ptoByEmployee.intervals.get(employee.id) ?? null,
        workdayMinutes,
        windowStart,
        windowEnd,
      });
      map.set(employee.id, { jobs: employeeJobs, lanes, maxLanes, capacity });
    }
    return map;
  }, [sortedEmployees, cleanedJobs, ptoByEmployee, workdayMinutes, windowStart, windowEnd]);

  // Double-booked detection — jobsOverlap() is currently exported and used
  // by nothing; this is the one place that ports the prototype's
  // conflictsIn() using it.
  const doubleBookedJobIds = useMemo(() => {
    const ids = new Set<string>();
    for (const employee of activeEmployees) {
      const list = cleanedJobs.filter(
        (job) =>
          job.assignedUserIds.includes(employee.id) &&
          hasArrivalTime(job) &&
          !RETAINED_STATUSES.includes(job.status) &&
          job.status !== "completed",
      );
      for (let i = 0; i < list.length; i += 1) {
        for (let k = i + 1; k < list.length; k += 1) {
          if (jobsOverlap(list[i], jobWallClockDuration(list[i]), list[k], jobWallClockDuration(list[k]))) {
            ids.add(list[i].id);
            ids.add(list[k].id);
          }
        }
      }
    }
    return ids;
  }, [activeEmployees, cleanedJobs]);

  const attentionEntries = useMemo(() => categorizeForAttention(cleanedJobs, ptoRecords, dayIso), [cleanedJobs, ptoRecords, dayIso]);
  const noCrewJobs = attentionEntries.filter((entry) => entry.category === "unassigned").map((entry) => entry.job);
  const noTimeJobs = attentionEntries.filter((entry) => entry.category === "no-time").map((entry) => entry.job);
  const overLeaveJobs = attentionEntries.filter((entry) => entry.category === "conflict").map((entry) => entry.job);
  const overLeaveJobIds = useMemo(() => new Set(overLeaveJobs.map((job) => job.id)), [overLeaveJobs]);
  const doubleBookedJobs = cleanedJobs.filter((job) => doubleBookedJobIds.has(job.id));
  const attentionTotal = noCrewJobs.length + noTimeJobs.length + overLeaveJobs.length + doubleBookedJobs.length;

  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  useEffect(() => {
    function update() {
      setNowMinutes(minuteOfDayInTimeZone(new Date(), timezone));
    }
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [timezone]);
  const showNowLine = dayIso === todayIso && nowMinutes !== null && nowMinutes >= windowStart && nowMinutes <= windowEnd;
  const nowOffsetMinutes = nowMinutes !== null ? Math.max(0, Math.min(nowMinutes - windowStart, windowMinutes)) : 0;

  const dayAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.scheduledDate === dayIso && !appointment.isAllDay),
    [appointments, dayIso],
  );

  // Escape cancels placement, matching the prototype's global handler.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && selectedJobId) {
        setSelectedJobId(null);
        setPlacement(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedJobId]);

  // Axis-toggle stagger: lanes enter at 50ms intervals, 440ms each. No-ops
  // under prefers-reduced-motion and on first mount.
  useEffect(() => {
    if (isFirstAxisRender.current) {
      isFirstAxisRender.current = false;
      return;
    }
    if (prefersReducedMotion()) return;
    const selector = axis === "vertical" ? "[data-lane-slot]" : "[data-lane-row]";
    const lanes = gridRef.current ? Array.from(gridRef.current.querySelectorAll<HTMLElement>(selector)) : [];
    lanes.forEach((lane, index) => {
      lane.animate(
        [
          { opacity: 0, transform: axis === "vertical" ? "translateY(12px)" : "translateX(-14px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 440, delay: index * 50, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" },
      );
    });
  }, [axis]);

  // FLIP assign animation: the card flies from its rail position to its
  // landed grid position, then a land-pop keyframe. No-ops under
  // prefers-reduced-motion (still applies the land pop, just without the fly).
  useLayoutEffect(() => {
    const pending = pendingFlyRef.current;
    if (!pending) return;
    pendingFlyRef.current = null;
    const toEl = jobCardRefs.current.get(pending.jobId);
    if (!toEl) return;
    if (prefersReducedMotion()) {
      toEl.classList.add("co-board-landed");
      window.setTimeout(() => toEl.classList.remove("co-board-landed"), 520);
      return;
    }
    const toRect = toEl.getBoundingClientRect();
    const flyer = document.createElement("div");
    flyer.textContent = pending.label;
    flyer.style.cssText = [
      "position:fixed",
      "z-index:90",
      "border-radius:9px",
      "pointer-events:none",
      "display:flex",
      "align-items:center",
      "overflow:hidden",
      "padding:6px 9px",
      "font-size:12px",
      "font-weight:700",
      "color:var(--co-ink)",
      `left:${pending.from.left}px`,
      `top:${pending.from.top}px`,
      `width:${pending.from.width}px`,
      `height:${pending.from.height}px`,
      `background:color-mix(in srgb, ${pending.color} 14%, var(--co-surface))`,
      `border:1px solid color-mix(in srgb, ${pending.color} 46%, var(--co-surface))`,
      "box-shadow:0 8px 16px -8px rgba(20,26,46,.18), 0 24px 56px -24px rgba(36,54,104,.34)",
    ].join(";");
    document.body.appendChild(flyer);
    toEl.style.opacity = "0";
    const animation = flyer.animate(
      [
        { left: `${pending.from.left}px`, top: `${pending.from.top}px`, width: `${pending.from.width}px`, height: `${pending.from.height}px` },
        { left: `${toRect.left}px`, top: `${toRect.top}px`, width: `${toRect.width}px`, height: `${toRect.height}px` },
      ],
      { duration: 540, easing: "cubic-bezier(.16,1,.3,1)" },
    );
    animation.onfinish = () => {
      flyer.remove();
      toEl.style.opacity = "";
      toEl.classList.add("co-board-landed");
      window.setTimeout(() => toEl.classList.remove("co-board-landed"), 520);
    };
  }, [jobs]);

  function selectJob(jobId: string) {
    setSelectedJobId((current) => (current === jobId ? null : jobId));
    setPlacement(null);
  }

  function minutesFromPointerEvent(event: { clientX: number; clientY: number; currentTarget: HTMLElement }) {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = axis === "vertical" ? (event.clientY - rect.top) / rect.height : (event.clientX - rect.left) / rect.width;
    const raw = windowStart + fraction * windowMinutes;
    const snapped = Math.round(raw / PLACEMENT_SNAP_MINUTES) * PLACEMENT_SNAP_MINUTES;
    return Math.min(Math.max(snapped, windowStart), windowEnd - PLACEMENT_SNAP_MINUTES);
  }

  function laneVerdict(employeeId: string, start: number): Verdict {
    const data = laneData.get(employeeId);
    const duration = selectedJob ? jobDuration(selectedJob) : 0;
    return evaluatePlacement({
      ptoInterval: ptoByEmployee.intervals.get(employeeId) ?? null,
      otherJobs: (data?.jobs ?? []).filter((job) => job.id !== selectedJobId),
      start,
      duration,
      windowEnd,
      capacity: data?.capacity ?? { usedMinutes: 0, availableMinutes: workdayMinutes },
    });
  }

  function commitPlacement(employeeId: string, minutesOverride?: number) {
    if (!selectedJob) return;
    const employee = employeesById.get(employeeId);
    if (!employee) return;
    const wasTimed = hasArrivalTime(selectedJob);
    const start = wasTimed ? minutesFromTime(selectedJob.scheduledStartTime) : (minutesOverride ?? placement?.minutes ?? windowStart);
    const verdict = laneVerdict(employeeId, start);
    if (verdict.state === "blocked") {
      setWarning(`${employee.firstName} ${employee.lastName} is on leave then — pick another crew or a different time.`);
      window.setTimeout(() => setWarning((current) => (current === `${employee.firstName} ${employee.lastName} is on leave then — pick another crew or a different time.` ? null : current)), 4000);
      return;
    }
    const job = selectedJob;
    const previousAssigned = job.assignedUserIds;
    const previousTime = job.scheduledStartTime;
    const nextTime = wasTimed ? previousTime : minutesToTime(start);
    const sourceEl = railCardRefs.current.get(job.id);
    const fromRect = sourceEl ? sourceEl.getBoundingClientRect() : null;
    const employeeName = `${employee.firstName} ${employee.lastName}`;
    commitJobPatch(
      job.id,
      { employeeIds: [employeeId], scheduledStartTime: nextTime ?? null },
      {
        onOptimistic: () => {
          setSelectedJobId(null);
          setPlacement(null);
          setJobs((current) => current.map((entry) => (entry.id === job.id ? { ...entry, assignedUserIds: [employeeId], scheduledStartTime: nextTime } : entry)));
          if (fromRect) pendingFlyRef.current = { jobId: job.id, from: fromRect, color: employee.calendarColor ?? employeeColor(employeeId), label: displayCustomer(job) };
        },
        onSuccess: () => {
          router.refresh();
          showUndo(`${displayCustomer(job)} placed with ${employeeName}${!wasTimed ? ` at ${clockLabelFromMinutes(start)}` : ""}`, () =>
            commitJobPatch(
              job.id,
              { employeeIds: previousAssigned, scheduledStartTime: previousTime ?? null },
              {
                onOptimistic: () => setJobs((current) => current.map((entry) => (entry.id === job.id ? { ...entry, assignedUserIds: previousAssigned, scheduledStartTime: previousTime } : entry))),
                onSuccess: () => router.refresh(),
                onError: setError,
              },
            ),
          );
        },
        onWarning: setWarning,
        onError: (message) => {
          setError(message);
          setJobs((current) => current.map((entry) => (entry.id === job.id ? { ...entry, assignedUserIds: previousAssigned, scheduledStartTime: previousTime } : entry)));
        },
      },
    );
  }

  function minutesFromDragEvent(event: { clientX: number; clientY: number; currentTarget: HTMLElement }) {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = axis === "vertical" ? (event.clientY - rect.top) / rect.height : (event.clientX - rect.left) / rect.width;
    const raw = windowStart + fraction * windowMinutes;
    const snapped = Math.round(raw / PLACEMENT_SNAP_MINUTES) * PLACEMENT_SNAP_MINUTES;
    return Math.min(Math.max(snapped, windowStart), windowEnd - PLACEMENT_SNAP_MINUTES);
  }

  // Cross-lane drag: kept working exactly as before the merge. Dragging
  // within a lane, or from the tray/rail (no source lane), adds the target
  // lane. Dragging out of one lane into another *moves* it — only the lane
  // it was dragged out of is replaced, not the whole crew.
  function dropOnEmployee(event: React.DragEvent<HTMLDivElement>, employeeId: string) {
    event.preventDefault();
    setDragOverEmployeeId(null);
    const jobId = event.dataTransfer.getData("text/plain");
    const sourceEmployeeId = event.dataTransfer.getData("application/x-cleanops-source-employee") || null;
    const job = jobs.find((entry) => entry.id === jobId);
    if (!job || LOCKED_STATUSES.includes(job.status)) return;

    const previousEmployees = job.assignedUserIds;
    // Settled product decision (confirmed 2026-08-20): replacing only the
    // cleaner whose lane the job was dragged out of — and keeping the rest
    // of the crew — is the correct behaviour, not a bug to "fix" back to an
    // additive merge. Do not change this.
    const nextEmployees = sourceEmployeeId
      ? Array.from(new Set(previousEmployees.map((id) => (id === sourceEmployeeId ? employeeId : id))))
      : Array.from(new Set([...previousEmployees, employeeId]));
    const isExistingLane = previousEmployees.includes(employeeId);
    const isCrossLaneMove = Boolean(sourceEmployeeId) && sourceEmployeeId !== employeeId;
    const previousTime = job.scheduledStartTime;
    const clampedMinutes = minutesFromDragEvent(event);
    const nextTime = minutesToTime(clampedMinutes);

    if (JSON.stringify(previousEmployees) === JSON.stringify(nextEmployees) && previousTime === nextTime) return;
    setJobs((current) => current.map((entry) => (entry.id === job.id ? { ...entry, assignedUserIds: nextEmployees, scheduledStartTime: nextTime } : entry)));
    commitJobPatch(
      job.id,
      { employeeIds: nextEmployees, scheduledStartTime: nextTime ?? null },
      {
        onOptimistic: () => undefined,
        onSuccess: () => {
          router.refresh();
          const targetEmployee = employeesById.get(employeeId);
          const targetName = targetEmployee ? `${targetEmployee.firstName} ${targetEmployee.lastName}` : "the new lane";
          showUndo(isExistingLane ? "Job time updated" : isCrossLaneMove ? `Moved to ${targetName}` : "Technician added to the crew", () =>
            commitJobPatch(
              job.id,
              { employeeIds: previousEmployees, scheduledStartTime: previousTime ?? null },
              {
                onOptimistic: () => setJobs((current) => current.map((entry) => (entry.id === job.id ? { ...entry, assignedUserIds: previousEmployees, scheduledStartTime: previousTime } : entry))),
                onSuccess: () => router.refresh(),
                onError: setError,
              },
            ),
          );
        },
        onWarning: setWarning,
        onError: (message) => {
          setError(message);
          setJobs((current) => current.map((entry) => (entry.id === job.id ? { ...entry, assignedUserIds: previousEmployees, scheduledStartTime: previousTime } : entry)));
        },
      },
    );
  }

  // Rail -> lane drag ("No crew yet" cards only). Dragstart selects the job
  // exactly like clicking its rail card would — that's what makes the rest
  // of this share the click-to-place path instead of duplicating it:
  // laneDragOver/laneDrop below run through the same selectedJob-driven
  // laneVerdict/renderGhostAndNote/commitPlacement the click flow already
  // uses, so a blocked lane refuses the drop and a warn lane still warns,
  // with the identical ghost (z-2) + note (z-8) affordance.
  function startRailDrag(event: React.DragEvent<HTMLButtonElement>, job: CalendarJob) {
    event.dataTransfer.setData("text/plain", job.id);
    event.dataTransfer.setData("application/x-cleanops-source-rail", "1");
    event.dataTransfer.effectAllowed = "move";
    setSelectedJobId(job.id);
    setPlacement(null);
  }

  function laneDragOver(event: React.DragEvent<HTMLDivElement>, employeeId: string) {
    event.preventDefault();
    setDragOverEmployeeId(employeeId);
    if (!event.dataTransfer.types.includes("application/x-cleanops-source-rail") || !selectedJob) return;
    // Untimed job: the hovered position is a placement preview, same as
    // laneMouseMove for the click path — drag suppresses native mousemove,
    // so this is the drag equivalent.
    if (!hasArrivalTime(selectedJob)) {
      const minutes = minutesFromDragEvent(event);
      setPlacement((current) => (current && current.employeeId === employeeId && current.minutes === minutes ? current : { employeeId, minutes }));
    }
  }

  function laneDrop(event: React.DragEvent<HTMLDivElement>, employeeId: string) {
    if (event.dataTransfer.types.includes("application/x-cleanops-source-rail")) {
      event.preventDefault();
      setDragOverEmployeeId(null);
      // Untimed job: drop position sets the arrival time (15-minute snap,
      // same rule as click-to-place). Timed jobs ignore this override —
      // commitPlacement keeps the job's own scheduledStartTime.
      commitPlacement(employeeId, minutesFromDragEvent(event));
      return;
    }
    dropOnEmployee(event, employeeId);
  }

  // Lane -> rail drag: dropping an assigned job onto the attention rail
  // unassigns it entirely (all crew, not just the dragged-from lane) and it
  // reappears in "No crew yet". Goes through the same commitJobPatch/undo
  // path as every other board mutation.
  function dropOnRail(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setRailDropActive(false);
    const sourceEmployeeId = event.dataTransfer.getData("application/x-cleanops-source-employee") || null;
    if (!sourceEmployeeId) return;
    const jobId = event.dataTransfer.getData("text/plain");
    const job = jobs.find((entry) => entry.id === jobId);
    if (!job || LOCKED_STATUSES.includes(job.status) || !job.assignedUserIds.length) return;

    const previousAssigned = job.assignedUserIds;
    setJobs((current) => current.map((entry) => (entry.id === job.id ? { ...entry, assignedUserIds: [] } : entry)));
    commitJobPatch(
      job.id,
      { employeeIds: [] },
      {
        onOptimistic: () => undefined,
        onSuccess: () => {
          router.refresh();
          showUndo(`${displayCustomer(job)} unassigned — back in No crew yet`, () =>
            commitJobPatch(
              job.id,
              { employeeIds: previousAssigned },
              {
                onOptimistic: () => setJobs((current) => current.map((entry) => (entry.id === job.id ? { ...entry, assignedUserIds: previousAssigned } : entry))),
                onSuccess: () => router.refresh(),
                onError: setError,
              },
            ),
          );
        },
        onWarning: setWarning,
        onError: (message) => {
          setError(message);
          setJobs((current) => current.map((entry) => (entry.id === job.id ? { ...entry, assignedUserIds: previousAssigned } : entry)));
        },
      },
    );
  }

  function scrollBoardWhileDragging(event: React.DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("text/plain")) return;
    const board = gridScrollRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const edgeSize = 80;
    const scrollStep = 28;
    if (axis === "vertical") {
      if (event.clientX < rect.left + edgeSize) board.scrollLeft -= scrollStep;
      if (event.clientX > rect.right - edgeSize) board.scrollLeft += scrollStep;
    } else {
      if (event.clientY < rect.top + edgeSize) board.scrollTop -= scrollStep;
      if (event.clientY > rect.bottom - edgeSize) board.scrollTop += scrollStep;
    }
  }

  function laneKeyDown(event: React.KeyboardEvent<HTMLDivElement>, employeeId: string) {
    if (!selectedJob) return;
    const untimed = !hasArrivalTime(selectedJob);
    if (untimed) {
      const forward = axis === "vertical" ? "ArrowDown" : "ArrowRight";
      const backward = axis === "vertical" ? "ArrowUp" : "ArrowLeft";
      if (event.key === forward || event.key === backward) {
        event.preventDefault();
        setPlacement((current) => {
          const base = current && current.employeeId === employeeId ? current.minutes : windowStart;
          const next = base + (event.key === forward ? PLACEMENT_SNAP_MINUTES : -PLACEMENT_SNAP_MINUTES);
          return { employeeId, minutes: Math.min(Math.max(next, windowStart), windowEnd - PLACEMENT_SNAP_MINUTES) };
        });
        return;
      }
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commitPlacement(employeeId, placement?.employeeId === employeeId ? placement.minutes : windowStart);
    }
  }

  function laneFocus(employeeId: string) {
    if (!selectedJob || hasArrivalTime(selectedJob)) return;
    setPlacement((current) => (current && current.employeeId === employeeId ? current : { employeeId, minutes: windowStart }));
  }

  function laneMouseMove(event: React.MouseEvent<HTMLDivElement>, employeeId: string) {
    if (!selectedJob || hasArrivalTime(selectedJob)) return;
    const minutes = minutesFromPointerEvent(event);
    setPlacement((current) => (current && current.employeeId === employeeId && current.minutes === minutes ? current : { employeeId, minutes }));
  }

  function laneClick(event: React.MouseEvent<HTMLDivElement>, employeeId: string) {
    if (!selectedJob) return;
    const minutes = hasArrivalTime(selectedJob) ? minutesFromTime(selectedJob.scheduledStartTime) : minutesFromPointerEvent(event);
    commitPlacement(employeeId, minutes);
  }

  const jobsPlacedCount = cleanedJobs.filter((job) => job.assignedUserIds.length && hasArrivalTime(job)).length;
  const ordinalByJobId = useMemo(() => stopOrdinals(cleanedJobs), [cleanedJobs]);

  function jobCardRefCallback(jobId: string) {
    return (el: HTMLElement | null) => {
      if (el) jobCardRefs.current.set(jobId, el);
      else jobCardRefs.current.delete(jobId);
    };
  }

  function openJobDetail(jobId: string) {
    setDetailJobId(jobId);
  }

  function renderJobCard(
    job: CalendarJob,
    style: React.CSSProperties,
    compact: boolean,
    overflowCount: number,
    resize?: { isResizing: boolean; onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void; onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void; onPointerUp: () => void },
  ) {
    const ordinal = ordinalByJobId.get(job.id);
    const isConflict = doubleBookedJobIds.has(job.id);
    const isOnLeave = !isConflict && overLeaveJobIds.has(job.id);
    const leadEmployee = employeesById.get(job.assignedUserIds[0]);
    const crewColor = leadEmployee?.calendarColor ?? employeeColor(job.assignedUserIds[0]);
    const isLocked = LOCKED_STATUSES.includes(job.status);
    const tone = isConflict
      ? "border-[var(--co-danger)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--co-danger)_40%,transparent)]"
      : isOnLeave
        ? "border-[var(--co-warning)]"
        : "";
    const card = (
      <Link
        ref={jobCardRefCallback(job.id) as unknown as React.Ref<HTMLAnchorElement>}
        href={`/jobs/${job.id}`}
        draggable={!isLocked}
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", job.id);
          const lane = job.assignedUserIds.find((id) => laneData.has(id));
          if (lane) event.dataTransfer.setData("application/x-cleanops-source-employee", lane);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          // Safety net: a drag cancelled outside any drop target (Escape,
          // released off-window) may skip the rail's own dragleave.
          setRailDropActive(false);
        }}
        onClick={(event) => {
          if (selectedJobId) {
            event.preventDefault();
            return;
          }
          if (!isPlainClick(event)) return;
          event.preventDefault();
          openJobDetail(job.id);
        }}
        aria-label={`${displayCustomer(job)}, ${clockLabelFromMinutes(minutesFromTime(job.scheduledStartTime))}, ${leadEmployee ? `${leadEmployee.firstName} ${leadEmployee.lastName}` : ""}`}
        className={`block h-full overflow-hidden rounded-lg border text-left shadow-[0_1px_2px_rgba(20,26,46,.06)] transition hover:z-[5] hover:-translate-y-px hover:shadow-[0_1px_2px_rgba(20,26,46,.05),0_8px_24px_-12px_rgba(36,54,104,.22)] ${compact ? "px-[7px] py-[3px]" : "px-2 py-[5px] pb-1.5"} ${tone}`}
        style={{
          background: `color-mix(in srgb, ${crewColor} 10%, var(--co-surface))`,
          borderColor: isConflict || isOnLeave ? undefined : `color-mix(in srgb, ${crewColor} 36%, var(--co-surface))`,
        }}
      >
        <div className="flex min-w-0 items-center gap-[5px]">
          {ordinal ? (
            <span className="inline-flex h-[15px] shrink-0 items-center rounded border border-[var(--co-line-soft)] bg-[var(--co-surface)] px-1 text-[9.5px] font-bold text-[var(--co-muted)]">
              {ordinalLabel(ordinal)}
            </span>
          ) : null}
          <span className="min-w-0 truncate text-xs font-bold text-[var(--co-ink)]">{displayCustomer(job)}</span>
          <JobMarks job={job} warn={isConflict || isOnLeave} />
        </div>
        <div className="mt-px truncate text-[10.5px] font-semibold text-[var(--co-body)]">
          {clockLabelFromMinutes(minutesFromTime(job.scheduledStartTime))} – {clockLabelFromMinutes(minutesFromTime(job.scheduledStartTime) + jobWallClockDuration(job))}
        </div>
        {!compact ? (
          <div className="mt-px truncate text-[10.5px] text-[var(--co-faint)]">
            {TYPE_LABELS[job.type] ?? job.type} · {job.customerAddress ?? job.customerCity ?? "No address"}
          </div>
        ) : null}
        {overflowCount > 0 ? (
          <span className="absolute bottom-1 right-1 rounded bg-[var(--co-ink)] px-1.5 py-0.5 text-[10px] font-semibold text-white">+{overflowCount} more</span>
        ) : null}
      </Link>
    );
    return (
      <div key={job.id} className={`group absolute ${resize?.isResizing ? "z-[6]" : "z-[3] hover:z-[5]"}`} style={style}>
        {card}
        {resize && !isLocked ? (
          <div
            role="presentation"
            aria-label="Drag to extend job duration"
            data-job-id={job.id}
            onPointerDown={resize.onPointerDown}
            onPointerMove={resize.onPointerMove}
            onPointerUp={resize.onPointerUp}
            onPointerCancel={resize.onPointerUp}
            className={`absolute inset-x-0 bottom-0 z-20 flex h-3 cursor-ns-resize touch-none items-end justify-center pb-0.5 transition-opacity ${resize.isResizing ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          >
            <span className="h-1 w-8 rounded-full bg-[var(--co-ink)]/40" />
          </div>
        ) : null}
      </div>
    );
  }

  function renderAppointment(appointment: CalendarAppointment, style: React.CSSProperties) {
    return (
      <button
        key={appointment.id}
        type="button"
        onClick={() => setEditingAppointmentId(appointment.id)}
        className={`absolute z-[3] flex flex-col items-start gap-0.5 overflow-hidden rounded-md px-2 py-1 text-left text-[10px] font-semibold shadow-sm ${appointment.status === "cancelled" ? APPOINTMENT_COLOR_CANCELLED : APPOINTMENT_COLOR}`}
        style={style}
      >
        <span className="truncate">{appointment.title}</span>
        <span className="truncate font-normal">{formatAppointmentTime(appointment.startTime, appointment.durationMinutes)}</span>
      </button>
    );
  }

  function renderPto(employeeId: string) {
    const interval = ptoByEmployee.intervals.get(employeeId);
    if (!interval) return null;
    const note = ptoByEmployee.notes.get(employeeId);
    const period = ptoByEmployee.periods.get(employeeId);
    const label = note ?? `On leave${period && period !== "full" ? ` — ${period}` : ""}`;
    const style: React.CSSProperties =
      axis === "vertical"
        ? { left: 4, right: 4, top: ((interval.from - windowStart) / 60) * HOUR_HEIGHT, height: ((interval.to - interval.from) / 60) * HOUR_HEIGHT }
        : { top: 4, bottom: 4, left: ((interval.from - windowStart) / 60) * HOUR_WIDTH, width: ((interval.to - interval.from) / 60) * HOUR_WIDTH };
    return (
      <div
        className="absolute z-[1] flex items-center justify-center rounded-[7px] border border-dashed border-[var(--co-line)] bg-[var(--co-surface-muted)] p-1"
        style={{
          ...style,
          backgroundImage: "repeating-linear-gradient(-45deg, color-mix(in srgb, var(--co-faint) 22%, transparent) 0 5px, transparent 5px 11px)",
        }}
      >
        <span className="whitespace-nowrap rounded border border-[var(--co-line-soft)] bg-[var(--co-surface)] px-[7px] py-0.5 text-[10.5px] font-bold text-[var(--co-muted)]">{label}</span>
      </div>
    );
  }

  function renderGhostAndNote(employeeId: string) {
    if (!selectedJob) return null;
    const untimed = !hasArrivalTime(selectedJob);
    const isActiveLane = !untimed || placement?.employeeId === employeeId;
    if (untimed && !isActiveLane) {
      // Generic invitation until this specific lane is hovered/focused.
      return (
        <>
          <div
            className={`pointer-events-none absolute inset-0 z-[1] rounded-[8px] ${verdictClasses("ok")}`}
          />
          <span
            className="pointer-events-none absolute z-[8] flex items-center gap-[5px] whitespace-nowrap rounded-[7px] px-[9px] py-1 text-[11px] font-bold text-white shadow-[0_1px_2px_rgba(20,26,46,.05),0_8px_24px_-12px_rgba(36,54,104,.22)]"
            style={axis === "vertical" ? { left: "50%", top: 14, transform: "translateX(-50%)" } : { left: 200, top: 26 }}
          >
            <Clock3 className="h-3 w-3" aria-hidden strokeWidth={1.75} />
            Click to set the time
          </span>
        </>
      );
    }
    const start = untimed ? (placement?.minutes ?? windowStart) : minutesFromTime(selectedJob.scheduledStartTime);
    const duration = jobDuration(selectedJob);
    const verdict = laneVerdict(employeeId, start);
    const ghostStyle: React.CSSProperties =
      axis === "vertical"
        ? { left: 4, right: 4, top: ((start - windowStart) / 60) * HOUR_HEIGHT, height: (duration / 60) * HOUR_HEIGHT }
        : { top: 4, bottom: 4, left: ((start - windowStart) / 60) * HOUR_WIDTH, width: (duration / 60) * HOUR_WIDTH };
    const noteStyle: React.CSSProperties =
      axis === "vertical"
        ? { left: "50%", top: (ghostStyle.top as number) + (ghostStyle.height as number) / 2 - 13, transform: "translateX(-50%)" }
        : { left: (ghostStyle.left as number) + (ghostStyle.width as number) / 2, top: 26, transform: "translateX(-50%)" };
    return (
      <>
        <div className={`pointer-events-none absolute inset-0 z-[1] rounded-[8px] ${verdictClasses(verdict.state)}`} />
        <div
          className={`pointer-events-none absolute z-[2] rounded-[8px] border-2 border-dashed ${
            verdict.state === "blocked" ? "border-[var(--co-faint)]" : verdict.state === "warn" ? "border-[var(--co-warning)]" : "border-[var(--co-accent-fill)]"
          }`}
          style={{ ...ghostStyle, background: `color-mix(in srgb, ${verdict.state === "blocked" ? "var(--co-faint)" : verdict.state === "warn" ? "var(--co-warning)" : "var(--co-accent-fill)"} 12%, var(--co-surface))` }}
        />
        <span
          className={`pointer-events-none absolute z-[8] flex items-center gap-[5px] whitespace-nowrap rounded-[7px] px-[9px] py-1 text-[11px] font-bold shadow-[0_1px_2px_rgba(20,26,46,.05),0_8px_24px_-12px_rgba(36,54,104,.22)] ${verdictNoteClasses(verdict.state)}`}
          style={noteStyle}
        >
          <VerdictIcon state={verdict.state} className="h-3 w-3" />
          {verdict.message}
        </span>
      </>
    );
  }

  function laneAriaLabel(employee: CalendarEmployee) {
    const data = laneData.get(employee.id);
    const capacityLabel = data ? `${formatDuration(data.capacity.usedMinutes)} of ${data.capacity.availableMinutes ? formatDuration(data.capacity.availableMinutes) : "0m"} used` : "";
    if (selectedJob) {
      const start = hasArrivalTime(selectedJob) ? minutesFromTime(selectedJob.scheduledStartTime) : placement?.employeeId === employee.id ? (placement?.minutes ?? windowStart) : null;
      if (start !== null) {
        const verdict = laneVerdict(employee.id, start);
        return `${employee.firstName} ${employee.lastName}. ${verdict.message}.`;
      }
      return `${employee.firstName} ${employee.lastName}. Press Enter to set the time here.`;
    }
    return `${employee.firstName} ${employee.lastName}. ${capacityLabel}.`;
  }

  function renderLaneHeader(employee: CalendarEmployee) {
    const data = laneData.get(employee.id);
    const hasLeave = ptoByEmployee.intervals.has(employee.id);
    const color = employee.calendarColor ?? employeeColor(employee.id);
    return (
      <div className="min-w-0 border-b border-r border-[var(--co-line)] bg-[var(--co-surface)] px-[11px] py-[9px]" style={{ borderBottomColor: "var(--co-line)" }}>
        <div className="flex items-center gap-[7px] text-[12.8px] font-bold text-[var(--co-ink)]">
          <span className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 0 2px color-mix(in srgb, ${color} 22%, transparent)` }} />
          <span className="truncate">{employee.firstName} {employee.lastName}</span>
          <span className="ml-auto shrink-0 text-[11px] font-semibold text-[var(--co-faint)]">{data?.jobs.length ?? 0}</span>
        </div>
        <CapacityMeter usedMinutes={data?.capacity.usedMinutes ?? 0} availableMinutes={data?.capacity.availableMinutes ?? 0} isOver={data?.capacity.isOver ?? false} onLeave={hasLeave} />
        {hasLeave ? (
          <div className="mt-1">
            <span className="co-badge-muted inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold">
              <Ban className="h-[11px] w-[11px]" aria-hidden strokeWidth={1.75} />
              {(data?.capacity.availableMinutes ?? 0) === 0 ? "Off today" : "Half day"}
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  function jobStyleVertical(job: CalendarJob, lane: number, laneCount: number, durationOverrideMinutes?: number) {
    const start = minutesFromTime(job.scheduledStartTime);
    const duration = durationOverrideMinutes ?? jobWallClockDuration(job);
    return {
      top: ((start - windowStart) / 60) * HOUR_HEIGHT,
      height: Math.max((duration / 60) * HOUR_HEIGHT - 3, 14),
      left: `calc(${(lane * 100) / laneCount}% + 3px)`,
      width: `calc(${100 / laneCount}% - 6px)`,
    } as React.CSSProperties;
  }

  // Resize handlers (vertical axis only) — pointer-drag the bottom edge of a
  // job card to change its estimated duration. Ported from the pre-merge
  // vertical board, adapted to the new geometry constants.
  function startResize(event: React.PointerEvent<HTMLDivElement>, job: CalendarJob) {
    if (LOCKED_STATUSES.includes(job.status)) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing({ jobId: job.id, startY: event.clientY, initialDuration: job.estimatedDurationMinutes ?? 75, previewDuration: job.estimatedDurationMinutes ?? 75 });
  }

  function onResizeMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!resizing || resizing.jobId !== event.currentTarget.dataset.jobId) return;
    const job = jobs.find((entry) => entry.id === resizing.jobId);
    if (!job) return;
    const deltaMinutes = ((event.clientY - resizing.startY) / (HOUR_HEIGHT * hours)) * windowMinutes;
    const rawDuration = resizing.initialDuration + deltaMinutes;
    const snapped = Math.round(rawDuration / PLACEMENT_SNAP_MINUTES) * PLACEMENT_SNAP_MINUTES;
    const maxDuration = Math.max(windowEnd - minutesFromTime(job.scheduledStartTime), PLACEMENT_SNAP_MINUTES);
    const clamped = Math.min(Math.max(snapped, PLACEMENT_SNAP_MINUTES), maxDuration);
    setResizing((current) => (current ? { ...current, previewDuration: clamped } : current));
  }

  function endResize() {
    if (!resizing) return;
    const { jobId, initialDuration, previewDuration } = resizing;
    setResizing(null);
    if (previewDuration === initialDuration) return;
    setJobs((current) => current.map((entry) => (entry.id === jobId ? { ...entry, estimatedDurationMinutes: previewDuration } : entry)));
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
                onOptimistic: () => setJobs((current) => current.map((entry) => (entry.id === jobId ? { ...entry, estimatedDurationMinutes: initialDuration } : entry))),
                onSuccess: () => router.refresh(),
                onError: setError,
              },
            ),
          );
        },
        onWarning: setWarning,
        onError: (message) => {
          setError(message);
          setJobs((current) => current.map((entry) => (entry.id === jobId ? { ...entry, estimatedDurationMinutes: initialDuration } : entry)));
        },
      },
    );
  }

  function jobStyleHorizontal(job: CalendarJob, lane: number, laneCount: number, rowHeight: number) {
    const start = minutesFromTime(job.scheduledStartTime);
    const duration = jobWallClockDuration(job);
    const laneSlot = (rowHeight - 8) / laneCount;
    return {
      left: ((start - windowStart) / 60) * HOUR_WIDTH + 3,
      width: Math.max((duration / 60) * HOUR_WIDTH - 6, 14),
      top: 4 + lane * laneSlot,
      height: Math.max(laneSlot - 2, 14),
    } as React.CSSProperties;
  }

  const untimedTrayJobs = noTimeJobs;

  return (
    <div className="grid grid-cols-1 items-start gap-3.5 min-[1180px]:grid-cols-[286px_minmax(0,1fr)]">
      {/* -------------------------------------------------------------- */}
      {/* Attention rail — always visible, four groups in priority order */}
      {/* -------------------------------------------------------------- */}
      <aside
        id="calendar-attention-rail"
        tabIndex={-1}
        aria-label="Needs attention"
        className="co-card sticky top-3 overflow-hidden outline-none"
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("application/x-cleanops-source-employee")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setRailDropActive(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setRailDropActive(false);
        }}
        onDrop={dropOnRail}
      >
        {railDropActive ? (
          <div
            role="presentation"
            className="pointer-events-none absolute inset-0 z-[20] flex flex-col items-center justify-center gap-1.5 rounded-[inherit] border-2 border-dashed border-[var(--co-danger)] bg-[color-mix(in_srgb,var(--co-danger)_10%,var(--co-surface))]"
          >
            <Ban className="h-5 w-5 text-[var(--co-danger)]" aria-hidden strokeWidth={1.75} />
            <span className="text-[13px] font-bold text-[var(--co-danger)]">Drop to remove the crew</span>
          </div>
        ) : null}
        <div className="border-b border-[var(--co-line-soft)] px-[15px] py-[13px] pb-[11px]">
          <div className="flex items-center gap-2 text-[13px] font-bold text-[var(--co-ink)]">
            <AlertCircle className="h-[13px] w-[13px] text-[var(--co-warning)]" aria-hidden strokeWidth={1.75} />
            Needs attention
            <span className="ml-auto flex h-5 min-w-[22px] items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--co-warning)_30%,var(--co-tint-base))] bg-[color-mix(in_srgb,var(--co-warning)_15%,var(--co-tint-base))] px-1.5 text-[11.5px] font-bold text-[var(--co-warning)] tabular-nums">
              {attentionTotal}
            </span>
          </div>
          <p className="mt-[5px] text-xs leading-[1.4] text-[var(--co-faint)]">
            {attentionTotal ? "Pick a job, then choose a crew. The board shows you where it fits before you commit." : "Every job today has a crew and a time."}
          </p>
        </div>
        <div className="max-h-[calc(100vh-190px)] overflow-y-auto">
          <RailGroup icon={<Users className="h-[13px] w-[13px]" aria-hidden strokeWidth={1.75} />} label="No crew yet" jobs={noCrewJobs}>
            {noCrewJobs.map((job) => (
              <RailCard
                key={job.id}
                job={job}
                selected={selectedJobId === job.id}
                onSelect={() => selectJob(job.id)}
                draggable
                onDragStart={(event) => startRailDrag(event, job)}
                onDragEnd={() => setDragOverEmployeeId(null)}
                refCallback={(el) => {
                  if (el) railCardRefs.current.set(job.id, el);
                  else railCardRefs.current.delete(job.id);
                }}
              />
            ))}
          </RailGroup>
          <RailGroup icon={<Clock3 className="h-[13px] w-[13px]" aria-hidden strokeWidth={1.75} />} label="No arrival time" jobs={noTimeJobs}>
            {noTimeJobs.map((job) => {
              const crew = employeesById.get(job.assignedUserIds[0]);
              return (
                <RailCard
                  key={job.id}
                  job={job}
                  crewLabel={crew ? `${crew.firstName} ${crew.lastName}` : undefined}
                  crewColor={crew?.calendarColor ?? employeeColor(job.assignedUserIds[0])}
                  selected={selectedJobId === job.id}
                  onSelect={() => selectJob(job.id)}
                  refCallback={(el) => {
                    if (el) railCardRefs.current.set(job.id, el);
                    else railCardRefs.current.delete(job.id);
                  }}
                />
              );
            })}
          </RailGroup>
          <RailGroup icon={<TriangleAlert className="h-[13px] w-[13px]" aria-hidden strokeWidth={1.75} />} label="Assigned over leave" jobs={overLeaveJobs}>
            {overLeaveJobs.map((job) => {
              const crew = employeesById.get(job.assignedUserIds[0]);
              return <InfoRailCard key={job.id} job={job} crewLabel={crew ? `${crew.firstName} ${crew.lastName} is on leave` : "On leave"} tone="warn" message="Conflicts with leave" />;
            })}
          </RailGroup>
          <RailGroup icon={<TriangleAlert className="h-[13px] w-[13px]" aria-hidden strokeWidth={1.75} />} label="Double-booked" jobs={doubleBookedJobs}>
            {doubleBookedJobs.map((job) => {
              const crew = employeesById.get(job.assignedUserIds[0]);
              return <InfoRailCard key={job.id} job={job} crewLabel={crew ? `${crew.firstName} ${crew.lastName}` : undefined} tone="danger" message="Overlaps another stop" />;
            })}
          </RailGroup>
          {attentionTotal === 0 ? (
            <div className="px-[15px] py-[22px] text-center text-[12.5px] text-[var(--co-faint)]">
              <CheckCircle2 className="mx-auto mb-1.5 h-5 w-5 text-[var(--co-success)]" aria-hidden strokeWidth={1.75} />
              <div>Nothing needs a decision.</div>
            </div>
          ) : null}
        </div>
      </aside>

      {/* -------------------------------------------------------------- */}
      {/* Board */}
      {/* -------------------------------------------------------------- */}
      <section className="co-card min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--co-line-soft)] px-4 py-3">
          <span className="text-[15px] font-bold text-[var(--co-ink)]">{dayLabel}</span>
          <span className="text-xs tabular-nums text-[var(--co-faint)]">
            {jobsPlacedCount} of {cleanedJobs.length} placed · workday {clockLabelFromMinutes(windowStart)}–{clockLabelFromMinutes(windowEnd)}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-[13px]">
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--co-faint)]">
              <span
                className="h-3 w-3.5 rounded-[3px] border border-[var(--co-line)] bg-[var(--co-surface-muted-2)]"
                style={{ backgroundImage: "repeating-linear-gradient(-45deg, var(--co-surface-muted-2) 0 4px, transparent 4px 8px)" }}
              />
              Leave
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--co-faint)]">
              <span className="h-3 w-3.5 rounded-[3px] border border-[color-mix(in_srgb,var(--co-danger)_40%,var(--co-tint-base))] bg-[color-mix(in_srgb,var(--co-danger)_16%,var(--co-tint-base))]" />
              Double-booked
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--co-faint)]">
              <span className="h-0.5 w-3.5 rounded-full bg-[var(--co-danger)]" />
              Now (company time)
            </span>
          </div>
        </div>

        {error ? (
          <p role="alert" className="border-b border-[var(--co-danger)]/30 bg-[var(--co-danger)]/10 px-4 py-2 text-xs font-medium text-[var(--co-danger)]">
            {error}
          </p>
        ) : null}
        {warning ? (
          <p role="status" className="border-b border-[var(--co-warning)]/30 bg-[var(--co-warning)]/10 px-4 py-2 text-xs font-medium text-[var(--co-warning)]">
            {warning}
          </p>
        ) : null}

        {untimedTrayJobs.length ? (
          <div className="flex flex-wrap items-center gap-[10px] border-b border-[var(--co-line-soft)] bg-[color-mix(in_srgb,var(--co-spark-text)_6%,var(--co-tint-base))] px-4 py-[10px]">
            <span className="flex items-center gap-[7px] text-xs font-bold text-[var(--co-spark-text)]">
              <Clock3 className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />
              No arrival time
            </span>
            <div className="flex flex-wrap gap-2">
              {untimedTrayJobs.map((job) => {
                const crew = employeesById.get(job.assignedUserIds[0]);
                const color = crew?.calendarColor ?? employeeColor(job.assignedUserIds[0]);
                return (
                  <div key={job.id} className="flex items-center gap-[9px] rounded-lg border px-2.5 py-1.5 text-xs transition hover:-translate-y-px hover:shadow-[0_1px_2px_rgba(20,26,46,.05),0_8px_24px_-12px_rgba(36,54,104,.22)]" style={{ borderColor: "color-mix(in srgb, var(--co-spark-text) 30%, var(--co-tint-base))" }}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                    <b className="font-bold text-[var(--co-ink)]">{displayCustomer(job)}</b>
                    <span className="tabular-nums text-[var(--co-faint)]">
                      {formatDuration(jobDuration(job))} · {crew?.firstName ?? "Unassigned"}
                    </span>
                    <button type="button" className="text-[11.5px] font-bold text-[var(--co-accent-text)] hover:underline" onClick={() => selectJob(job.id)}>
                      Set time
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div ref={gridScrollRef} onDragOver={scrollBoardWhileDragging} className="max-h-[calc(100dvh-232px)] overflow-auto overscroll-contain [scrollbar-gutter:stable]">
          {sortedEmployees.length === 0 ? (
            <div className="flex items-center justify-center px-4 py-16 text-sm text-[var(--co-muted)]">Create or activate a technician to use the dispatch board.</div>
          ) : axis === "vertical" ? (
            <div ref={gridRef} style={{ minWidth: `${TIME_GUTTER_WIDTH + sortedEmployees.length * CREW_COLUMN_MIN_WIDTH}px` }}>
              <div className="sticky top-0 z-[12] grid bg-[var(--co-surface)]" style={{ gridTemplateColumns: `${TIME_GUTTER_WIDTH}px repeat(${sortedEmployees.length}, minmax(${CREW_COLUMN_MIN_WIDTH}px, 1fr))` }}>
                <div className="border-b border-r border-[var(--co-line-soft)] border-b-[var(--co-line)]" />
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
                    className={laneEmployeeId ? "" : "cursor-grab active:cursor-grabbing"}
                  >
                    {renderLaneHeader(employee)}
                  </div>
                ))}
              </div>
              <div className="relative grid" style={{ gridTemplateColumns: `${TIME_GUTTER_WIDTH}px repeat(${sortedEmployees.length}, minmax(${CREW_COLUMN_MIN_WIDTH}px, 1fr))` }}>
                <div className="sticky left-0 z-[4] border-r border-[var(--co-line)] bg-[var(--co-surface)]" style={{ height: hours * HOUR_HEIGHT }}>
                  {Array.from({ length: hours }, (_, index) => (
                    <div key={index} className="relative flex items-start justify-end px-2 text-[11px] font-medium text-[var(--co-faint)]" style={{ height: HOUR_HEIGHT }}>
                      <span className="relative -top-[7px]">{clockLabelFromMinutes(windowStart + index * 60).replace(":00", "")}</span>
                    </div>
                  ))}
                </div>
                {sortedEmployees.map((employee) => {
                  const data = laneData.get(employee.id);
                  return (
                    <div
                      key={employee.id}
                      data-lane-slot
                      role="group"
                      tabIndex={0}
                      aria-label={laneAriaLabel(employee)}
                      onMouseMove={(event) => laneMouseMove(event, employee.id)}
                      onFocus={() => laneFocus(employee.id)}
                      onKeyDown={(event) => laneKeyDown(event, employee.id)}
                      onClick={(event) => laneClick(event, employee.id)}
                      onDragOver={(event) => laneDragOver(event, employee.id)}
                      onDragLeave={() => setDragOverEmployeeId(null)}
                      onDrop={(event) => laneDrop(event, employee.id)}
                      className={`relative border-r border-[var(--co-line-soft)] outline-none ${dragOverEmployeeId === employee.id ? "bg-[var(--co-accent-tint)]" : ""} ${selectedJob ? "cursor-copy" : ""}`}
                      style={{ height: hours * HOUR_HEIGHT, backgroundImage: "repeating-linear-gradient(to bottom, var(--co-line-soft) 0 1px, transparent 1px 100%)", backgroundSize: `100% ${HOUR_HEIGHT}px` }}
                    >
                      {renderPto(employee.id)}
                      {dayAppointments
                        .filter((appointment) => appointment.attendeeUserIds.includes(employee.id))
                        .map((appointment) => {
                          const start = Math.max(windowStart, minutesFromTime(appointment.startTime));
                          const duration = Math.max(30, appointment.durationMinutes ?? 60);
                          return renderAppointment(appointment, { left: 4, right: 4, top: ((start - windowStart) / 60) * HOUR_HEIGHT, height: Math.max((duration / 60) * HOUR_HEIGHT - 3, 16) });
                        })}
                      {(data?.jobs ?? []).map((job) => {
                        const lane = data!.lanes.get(job.id);
                        if (!lane) return null;
                        const isResizingThis = resizing?.jobId === job.id;
                        const style = jobStyleVertical(job, lane.lane, lane.laneCount, isResizingThis ? resizing.previewDuration : undefined);
                        return renderJobCard(job, style, (style.height as number) < COMPACT_HEIGHT_VERTICAL, lane.overflowCount, {
                          isResizing: isResizingThis,
                          onPointerDown: (event) => startResize(event, job),
                          onPointerMove: onResizeMove,
                          onPointerUp: endResize,
                        });
                      })}
                      {renderGhostAndNote(employee.id)}
                    </div>
                  );
                })}
                {showNowLine ? (
                  <>
                    <div className="pointer-events-none absolute z-[6] h-0.5 bg-[var(--co-danger)]" style={{ left: TIME_GUTTER_WIDTH, right: 0, top: (nowOffsetMinutes / 60) * HOUR_HEIGHT }} />
                    <span
                      className="pointer-events-none absolute z-[7] whitespace-nowrap rounded bg-[var(--co-danger)] px-[5px] py-[1.5px] text-[10px] font-bold text-white shadow-[0_2px_6px_-2px_rgba(0,0,0,.4)]"
                      style={{ left: 5, top: (nowOffsetMinutes / 60) * HOUR_HEIGHT - 9 }}
                    >
                      {nowMinutes !== null ? clockLabelFromMinutes(nowMinutes) : ""}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <div ref={gridRef} style={{ minWidth: `${LANE_HEADER_WIDTH + hours * HOUR_WIDTH}px` }}>
              <div className="sticky top-0 z-[12] grid bg-[var(--co-surface)]" style={{ gridTemplateColumns: `${LANE_HEADER_WIDTH}px ${hours * HOUR_WIDTH}px` }}>
                <div className="sticky left-0 z-[3] border-b border-r border-[var(--co-line)] bg-[var(--co-surface)]" />
                <div className="grid border-b border-[var(--co-line)]" style={{ gridTemplateColumns: `repeat(${hours}, ${HOUR_WIDTH}px)` }}>
                  {Array.from({ length: hours }, (_, index) => (
                    <span key={index} className="border-r border-[var(--co-line-soft)] py-[6px] pb-1.5 pl-2 text-[11px] font-semibold text-[var(--co-faint)]">
                      {clockLabelFromMinutes(windowStart + index * 60).replace(":00", "")}
                    </span>
                  ))}
                </div>
              </div>
              <div className="relative">
                {sortedEmployees.map((employee) => {
                  const data = laneData.get(employee.id);
                  const rowHeight = Math.max(LANE_HEIGHT_BASE, 46 * (data?.maxLanes ?? 1) + 8);
                  return (
                    <div key={employee.id} data-lane-row className="grid border-b border-[var(--co-line-soft)] last:border-b-0" style={{ gridTemplateColumns: `${LANE_HEADER_WIDTH}px ${hours * HOUR_WIDTH}px` }}>
                      <div className="sticky left-0 z-[4] flex flex-col justify-center border-r border-[var(--co-line)] bg-[var(--co-surface)]">{renderLaneHeader(employee)}</div>
                      <div
                        role="group"
                        tabIndex={0}
                        aria-label={laneAriaLabel(employee)}
                        onMouseMove={(event) => laneMouseMove(event, employee.id)}
                        onFocus={() => laneFocus(employee.id)}
                        onKeyDown={(event) => laneKeyDown(event, employee.id)}
                        onClick={(event) => laneClick(event, employee.id)}
                        onDragOver={(event) => laneDragOver(event, employee.id)}
                        onDragLeave={() => setDragOverEmployeeId(null)}
                        onDrop={(event) => laneDrop(event, employee.id)}
                        className={`relative outline-none ${dragOverEmployeeId === employee.id ? "bg-[var(--co-accent-tint)]" : ""} ${selectedJob ? "cursor-copy" : ""}`}
                        style={{ width: hours * HOUR_WIDTH, height: rowHeight, backgroundImage: "repeating-linear-gradient(to right, var(--co-line-soft) 0 1px, transparent 1px 100%)", backgroundSize: `${HOUR_WIDTH}px 100%` }}
                      >
                        {renderPto(employee.id)}
                        {dayAppointments
                          .filter((appointment) => appointment.attendeeUserIds.includes(employee.id))
                          .map((appointment) => {
                            const start = Math.max(windowStart, minutesFromTime(appointment.startTime));
                            const duration = Math.max(30, appointment.durationMinutes ?? 60);
                            return renderAppointment(appointment, { top: 4, bottom: 4, left: ((start - windowStart) / 60) * HOUR_WIDTH, width: Math.max((duration / 60) * HOUR_WIDTH - 6, 16) });
                          })}
                        {(data?.jobs ?? []).map((job) => {
                          const lane = data!.lanes.get(job.id);
                          if (!lane) return null;
                          const style = jobStyleHorizontal(job, lane.lane, lane.laneCount, rowHeight);
                          return renderJobCard(job, style, (style.height as number) < COMPACT_HEIGHT_HORIZONTAL, lane.overflowCount);
                        })}
                        {renderGhostAndNote(employee.id)}
                      </div>
                    </div>
                  );
                })}
                {showNowLine ? (
                  <>
                    <div
                      className="pointer-events-none absolute z-[6] w-0.5 bg-[var(--co-danger)]"
                      style={{ left: LANE_HEADER_WIDTH + (nowOffsetMinutes / 60) * HOUR_WIDTH, top: 0, bottom: 0 }}
                    />
                    <span
                      className="pointer-events-none absolute z-[7] whitespace-nowrap rounded bg-[var(--co-danger)] px-[5px] py-[1.5px] text-[10px] font-bold text-white shadow-[0_2px_6px_-2px_rgba(0,0,0,.4)]"
                      style={{ left: LANE_HEADER_WIDTH + (nowOffsetMinutes / 60) * HOUR_WIDTH + 4, top: 3 }}
                    >
                      {nowMinutes !== null ? clockLabelFromMinutes(nowMinutes) : ""}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </section>

      <UndoToast toast={toast} onDismiss={dismiss} />
      <JobDetailPanel jobId={detailJobId} employees={employees} onClose={() => setDetailJobId(null)} />
      {editingAppointmentId ? (
        <AppointmentPanel
          mode="edit"
          eventId={editingAppointmentId}
          staffRoster={staffRoster}
          defaultDate={appointments.find((appointment) => appointment.id === editingAppointmentId)?.scheduledDate ?? dayIso}
          onClose={() => setEditingAppointmentId(null)}
        />
      ) : null}
    </div>
  );
}

function RailGroup({ icon, label, jobs, children }: { icon: React.ReactNode; label: string; jobs: CalendarJob[]; children: React.ReactNode }) {
  if (!jobs.length) return null;
  return (
    <div className="border-b border-[var(--co-line-soft)] last:border-b-0">
      <div className="flex items-center gap-[7px] bg-[var(--co-surface-muted)] px-[15px] py-[9px] text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--co-faint)]">
        {icon}
        {label}
        <span className="ml-auto text-[11px] font-semibold text-[var(--co-muted)]">{jobs.length}</span>
      </div>
      <div className="flex flex-col gap-[7px] p-[9px]">{children}</div>
    </div>
  );
}

function RailCard({
  job,
  crewLabel,
  crewColor,
  selected,
  onSelect,
  refCallback,
  draggable = false,
  onDragStart,
  onDragEnd,
}: {
  job: CalendarJob;
  crewLabel?: string;
  crewColor?: string;
  selected: boolean;
  onSelect: () => void;
  refCallback: (el: HTMLButtonElement | null) => void;
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: (event: React.DragEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      ref={refCallback}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`relative w-full rounded-[10px] border px-[11px] py-[9px] pb-2.5 text-left shadow-[0_1px_1px_rgba(20,26,46,.03)] transition hover:-translate-y-px hover:border-[var(--co-accent-text)] hover:shadow-[0_1px_2px_rgba(20,26,46,.05),0_8px_24px_-12px_rgba(36,54,104,.22)] ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${
        selected ? "border-[var(--co-accent-fill)] bg-[var(--co-accent-tint)] shadow-[0_0_0_3px_var(--co-focus-ring)]" : "border-[var(--co-line)] bg-[var(--co-surface)]"
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[13.5px] font-bold leading-[1.3] text-[var(--co-ink)]">{displayCustomer(job)}</span>
        <span className="ml-auto text-xs font-bold text-[var(--co-body)] tabular-nums">{job.scheduledStartTime ? clockLabelFromMinutes(minutesFromTime(job.scheduledStartTime)) : "—"}</span>
      </div>
      <div className="mt-[3px] flex items-center gap-[5px] text-[11.5px] leading-[1.35] text-[var(--co-faint)]">
        {crewLabel ? (
          <>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: crewColor ?? "var(--co-faint)" }} />
            {crewLabel}
          </>
        ) : (
          <>{job.customerAddress ?? job.customerCity ?? "No address"}</>
        )}
      </div>
      <div className="mt-[7px] flex flex-wrap gap-1">
        <span className="co-badge-muted inline-flex h-[19px] items-center rounded px-1.5 text-[10.5px] font-bold">{TYPE_LABELS[job.type] ?? job.type}</span>
        <span className="co-badge-muted inline-flex h-[19px] items-center rounded px-1.5 text-[10.5px] font-bold tabular-nums">{formatDuration(jobDuration(job))}</span>
        {job.petNotes ? (
          <span className="co-badge-spark inline-flex h-[19px] items-center gap-1 rounded px-1.5 text-[10.5px] font-bold">
            <PawPrint className="h-[11px] w-[11px]" aria-hidden strokeWidth={1.75} />
            Pets
          </span>
        ) : null}
      </div>
      {selected ? (
        <div className="mt-2 flex items-center gap-[5px] border-t border-dashed border-[var(--co-line)] pt-[7px] text-[11.5px] font-semibold text-[var(--co-accent-text)]">Choose a crew lane on the board</div>
      ) : null}
    </button>
  );
}

function InfoRailCard({ job, crewLabel, tone, message }: { job: CalendarJob; crewLabel?: string; tone: "warn" | "danger"; message: string }) {
  return (
    <div className="w-full cursor-default rounded-[10px] border border-[var(--co-line)] bg-[var(--co-surface)] px-[11px] py-[9px] pb-2.5 text-left shadow-[0_1px_1px_rgba(20,26,46,.03)]">
      <div className="flex items-baseline gap-2">
        <span className="text-[13.5px] font-bold leading-[1.3] text-[var(--co-ink)]">{displayCustomer(job)}</span>
        <span className="ml-auto text-xs font-bold text-[var(--co-body)] tabular-nums">
          {job.scheduledStartTime ? `${clockLabelFromMinutes(minutesFromTime(job.scheduledStartTime))} – ${clockLabelFromMinutes(minutesFromTime(job.scheduledStartTime) + jobWallClockDuration(job))}` : "—"}
        </span>
      </div>
      {crewLabel ? <div className="mt-[3px] text-[11.5px] text-[var(--co-faint)]">{crewLabel}</div> : null}
      <div className="mt-[7px] flex flex-wrap gap-1">
        <span className={`inline-flex h-[19px] items-center gap-1 rounded px-1.5 text-[10.5px] font-bold ${tone === "danger" ? "co-badge-danger" : "co-badge-warning"}`}>
          <TriangleAlert className="h-[11px] w-[11px]" aria-hidden strokeWidth={1.75} />
          {message}
        </span>
      </div>
    </div>
  );
}
