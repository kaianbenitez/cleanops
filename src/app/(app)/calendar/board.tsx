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
import { useDialogFocus } from "./dialog-focus";
import { UndoToast, useUndoToast } from "./undo-toast";
import JobDetailPanel from "./job-detail-panel";
import AppointmentPanel from "./appointment-panel";
import {
  APPOINTMENT_COLOR,
  APPOINTMENT_COLOR_CANCELLED,
  assignDayLanes,
  aggregateCalendarAttention,
  capacityForCrew,
  clockLabelFromMinutes,
  DEFAULT_WORKDAY_END_MINUTES,
  DEFAULT_WORKDAY_START_MINUTES,
  displayCustomer,
  deriveCalendarReadiness,
  deriveJobReadiness,
  employeeColor,
  formatAppointmentTime,
  formatCustomerAddress,
  hasArrivalTime,
  isPlainClick,
  jobDuration,
  jobsOverlap,
  jobWallClockDuration,
  minuteOfDayInTimeZone,
  minutesFromTime,
  ordinalLabel,
  readinessAction,
  readinessReason,
  readinessTone,
  stopOrdinals,
  jobTypeLabel,
  ptoIntervalForDay,
  ptoPeriodForDay,
  ATTENTION_RAIL_TOGGLE_EVENT,
} from "./shared";
import type { EmployeePtoRecord } from "@/lib/scheduling/pto";
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
const VIRTUAL_ROW_HEIGHT = 92;
const VIRTUAL_OVERSCAN = 4;
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

function minutesToTimeInput(totalMinutes: number) {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
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
    return { state: "warn", message: `Over ${formatDuration(capacity.availableMinutes)} labor capacity` };
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
  if (state === "warn") return "bg-[var(--co-warning)] text-[var(--co-surface)]";
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
          className="h-full w-full origin-left rounded-full"
          style={{ transform: `scaleX(${percent / 100})`, background: fillColor, transition: "transform 550ms cubic-bezier(.16,1,.3,1)" }}
        />
      </div>
      <span className={`whitespace-nowrap text-[12px] font-bold ${isOver ? "text-[var(--co-warning)]" : "text-[var(--co-faint)]"}`}>
        Labor hours: {formatDuration(usedMinutes)} of {availableMinutes ? formatDuration(availableMinutes) : "off"}
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
  cancellationPolicy,
  initialAttentionRailOpen = false,
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
  cancellationPolicy?: string;
  initialAttentionRailOpen?: boolean;
}) {
  const router = useRouter();
  const windowStart = workdayStartMinutes ?? DEFAULT_WORKDAY_START_MINUTES;
  const windowEnd = workdayEndMinutes ?? DEFAULT_WORKDAY_END_MINUTES;
  const windowMinutes = windowEnd - windowStart;
  const hours = Math.max(1, Math.round(windowMinutes / 60));
  const workdayMinutes = workdayMinutesPerCleaner ?? 8 * 60;

  const [jobs, setJobs] = useState(initialJobs);
  useEffect(() => {
    // Keep server refreshes out of render. React only runs this when the
    // server-provided array changes, so ordinary local state updates do not
    // replace an optimistic edit.
    // This effect intentionally mirrors server refreshes into the optimistic
    // local board model; the lint exception prevents a false positive here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJobs(initialJobs);
  }, [initialJobs]);
  const cleanedJobs = useMemo(
    () => jobs.map((job) => {
      const customerNotes = cleanNoteText(job.customerNotes);
      const gateCodeOrKeyNotes = cleanNoteText(job.gateCodeOrKeyNotes);
      const petNotes = cleanNoteText(job.petNotes);
      return customerNotes === job.customerNotes && gateCodeOrKeyNotes === job.gateCodeOrKeyNotes && petNotes === job.petNotes
        ? job
        : { ...job, customerNotes, gateCodeOrKeyNotes, petNotes };
    }),
    [jobs],
  );

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [timeAssignmentJob, setTimeAssignmentJob] = useState<CalendarJob | null>(null);
  const [railAction, setRailAction] = useState<{ job: CalendarJob; mode: "bump" | "skip" } | null>(null);
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
  const [boardScrollTop, setBoardScrollTop] = useState(0);
  // Attention-rail drop affordance for the lane->rail unassign gesture below.
  const [railDropActive, setRailDropActive] = useState(false);
  const [attentionRailOpen, setAttentionRailOpen] = useState(initialAttentionRailOpen);
  const [error, setError] = useState<string | null>(null);
  const [errorJobId, setErrorJobId] = useState<string | null>(null);
  const [errorRetry, setErrorRetry] = useState<(() => void) | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const { toast, showUndo, dismiss } = useUndoToast();

  function showJobError(jobId: string, message: string, retry?: () => void) {
    setErrorJobId(jobId);
    setErrorRetry(() => retry ?? null);
    setError(message);
  }

  const gridScrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const railCardRefs = useRef(new Map<string, HTMLElement>());
  const jobCardRefs = useRef(new Map<string, HTMLElement>());
  const pendingFlyRef = useRef<{ jobId: string; from: DOMRect; color: string; label: string } | null>(null);
  const isFirstAxisRender = useRef(true);
  const dragScrollFrameRef = useRef<number | null>(null);
  const dragPointRef = useRef({ x: 0, y: 0 });
  const dragMinutesRef = useRef<number | null>(null);

  useEffect(() => {
    function toggleAttentionRail() {
      setAttentionRailOpen((current) => !current);
    }
    window.addEventListener(ATTENTION_RAIL_TOGGLE_EVENT, toggleAttentionRail);
    return () => window.removeEventListener(ATTENTION_RAIL_TOGGLE_EVENT, toggleAttentionRail);
  }, []);

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
  const virtualRowsEnabled = axis !== "vertical" && sortedEmployees.length > 20;
  const virtualStart = virtualRowsEnabled ? Math.max(0, Math.floor(boardScrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN) : 0;
  const virtualEnd = virtualRowsEnabled ? Math.min(sortedEmployees.length, Math.ceil((boardScrollTop + 720) / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN) : sortedEmployees.length;
  const visibleEmployees = virtualRowsEnabled ? sortedEmployees.slice(virtualStart, virtualEnd) : sortedEmployees;

  async function saveColumnOrder(nextOrder: string[]) {
    setColumnOrder(nextOrder);
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffColumnOrder: nextOrder }),
    });
    if (!response.ok) {
      setColumnOrder(savedColumnOrder);
      setError("We couldn't save the crew order. Check your connection and try again.");
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
    const periods = new Map<string, "morning" | "afternoon" | "full">();
    const notes = new Map<string, string>();
    for (const pto of ptoRecords) {
      if (pto.userId && pto.startDate <= dayIso && pto.endDate >= dayIso) {
        const current = periods.get(pto.userId);
        const next = ptoPeriodForDay(pto, dayIso);
        periods.set(pto.userId, current && current !== next ? "full" : next);
        if (pto.note && !notes.has(pto.userId)) notes.set(pto.userId, pto.note);
      }
    }
    const intervals = new Map<string, { from: number; to: number }>();
    for (const employeeId of periods.keys()) {
      const interval = ptoIntervalForDay(ptoRecords, employeeId, dayIso, windowStart, windowEnd);
      if (interval) intervals.set(employeeId, interval);
    }
    return { periods, notes, intervals };
  }, [dayIso, ptoRecords, windowStart, windowEnd]);

  const dayAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.scheduledDate === dayIso && !appointment.isAllDay),
    [appointments, dayIso],
  );
  const dayAllDayAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.scheduledDate === dayIso && appointment.isAllDay),
    [appointments, dayIso],
  );
  const jobsByEmployee = useMemo(() => {
    const map = new Map<string, CalendarJob[]>();
    for (const job of cleanedJobs) {
      for (const employeeId of job.assignedUserIds) {
        const employeeJobs = map.get(employeeId);
        if (employeeJobs) employeeJobs.push(job);
        else map.set(employeeId, [job]);
      }
    }
    return map;
  }, [cleanedJobs]);
  const appointmentsByEmployee = useMemo(() => {
    const map = new Map<string, { allDay: CalendarAppointment[]; timed: CalendarAppointment[] }>();
    for (const appointment of dayAllDayAppointments) {
      for (const employeeId of appointment.attendeeUserIds) {
        const employeeAppointments = map.get(employeeId) ?? { allDay: [], timed: [] };
        employeeAppointments.allDay.push(appointment);
        map.set(employeeId, employeeAppointments);
      }
    }
    for (const appointment of dayAppointments) {
      for (const employeeId of appointment.attendeeUserIds) {
        const employeeAppointments = map.get(employeeId) ?? { allDay: [], timed: [] };
        employeeAppointments.timed.push(appointment);
        map.set(employeeId, employeeAppointments);
      }
    }
    return map;
  }, [dayAllDayAppointments, dayAppointments]);

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
      const employeeJobs = (jobsByEmployee.get(employee.id) ?? [])
        .filter((job) => hasArrivalTime(job))
        .sort((a, b) => (a.scheduledStartTime ?? "").localeCompare(b.scheduledStartTime ?? ""));
      const lanes = assignDayLanes(employeeJobs, Math.max(employeeJobs.length, 1));
      const maxLanes = employeeJobs.length ? Math.max(...employeeJobs.map((job) => lanes.get(job.id)?.laneCount ?? 1)) : 1;
      const capacity = capacityForCrew({
        jobs: jobsByEmployee.get(employee.id) ?? [],
        pto: ptoByEmployee.intervals.get(employee.id) ?? null,
        workdayMinutes,
        windowStart,
        windowEnd,
      });
      map.set(employee.id, { jobs: employeeJobs, lanes, maxLanes, capacity });
    }
    return map;
  }, [sortedEmployees, jobsByEmployee, ptoByEmployee, workdayMinutes, windowStart, windowEnd]);

  // Double-booked detection — jobsOverlap() is currently exported and used
  // by nothing; this is the one place that ports the prototype's
  // conflictsIn() using it.
  const doubleBookedJobIds = useMemo(() => {
    const ids = new Set<string>();
    for (const employee of activeEmployees) {
      const list = (jobsByEmployee.get(employee.id) ?? []).filter(
        (job) =>
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
  }, [activeEmployees, jobsByEmployee]);

  const attentionEntries = useMemo(() => aggregateCalendarAttention(cleanedJobs, ptoRecords, dayIso, { workdayMinutes, windowStart, windowEnd }), [cleanedJobs, ptoRecords, dayIso, workdayMinutes, windowStart, windowEnd]);
  const noCrewJobs = attentionEntries.filter((entry) => entry.category === "unassigned").map((entry) => entry.job);
  const noTimeJobs = attentionEntries.filter((entry) => entry.category === "no-time").map((entry) => entry.job);
  const overLeaveJobs = attentionEntries.filter((entry) => entry.category === "conflict").map((entry) => entry.job);
  const overLeaveJobIds = useMemo(() => new Set(overLeaveJobs.map((job) => job.id)), [overLeaveJobs]);
  const doubleBookedJobs = attentionEntries.filter((entry) => entry.category === "overlap").map((entry) => entry.job);
  const overCapacityJobs = attentionEntries.filter((entry) => entry.category === "over-capacity").map((entry) => entry.job);
  const attentionTotal = attentionEntries.length;
  const readinessByJobId = useMemo(
    () => deriveCalendarReadiness(cleanedJobs, ptoRecords, { workdayMinutes, windowStart, windowEnd }),
    [cleanedJobs, ptoRecords, workdayMinutes, windowStart, windowEnd],
  );

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
      "box-shadow:var(--co-shadow-panel)",
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

  function focusJob(jobId: string) {
    setSelectedJobId(jobId);
    setPlacement(null);
    window.requestAnimationFrame(() => {
      const element = jobCardRefs.current.get(jobId);
      if (!element) return;
      element.focus({ preventScroll: true });
      element.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "nearest", inline: "nearest" });
    });
  }

  function openTimeAssignment(job: CalendarJob) {
    setSelectedJobId(job.id);
    setPlacement({ employeeId: "", minutes: 13 * 60 });
    setTimeAssignmentJob(job);
  }

  function applyRailAction(job: CalendarJob, mode: "bump" | "skip", fields: { scheduledDate?: string; scheduledStartTime?: string; cancellationReason?: string }) {
    const previous = { scheduledDate: job.scheduledDate, scheduledStartTime: job.scheduledStartTime, status: job.status };
    const patch = mode === "skip"
      ? { status: "cancelled", cancellationReason: fields.cancellationReason ?? "Skipped from calendar.", skipOccurrence: true }
      : { scheduledDate: fields.scheduledDate!, scheduledStartTime: fields.scheduledStartTime ?? null };
    const optimisticFields = mode === "skip"
      ? { status: "cancelled" as const }
      : { scheduledDate: fields.scheduledDate!, scheduledStartTime: fields.scheduledStartTime ?? null };
    commitJobPatch(job.id, patch, {
      onOptimistic: () => {
        setRailAction(null);
        setSelectedJobId(null);
        setJobs((current) => current.map((entry) => (entry.id === job.id ? { ...entry, ...optimisticFields } : entry)));
      },
      onSuccess: () => {
        router.refresh();
        showUndo(mode === "skip" ? `${displayCustomer(job)} skipped for this visit` : `${displayCustomer(job)} bumped to ${fields.scheduledDate}`, () =>
          commitJobPatch(job.id, previous, {
            onOptimistic: () => setJobs((current) => current.map((entry) => (entry.id === job.id ? { ...entry, ...previous } : entry))),
            onSuccess: () => router.refresh(),
        onError: (message) => showJobError(job.id, message),
          }),
        );
      },
      onWarning: setWarning,
      onError: (message, retry) => showJobError(job.id, message, retry),
    });
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
    // An unassigned job may already carry the legacy/default 09:00 value even
    // though the dispatcher is choosing its real arrival time now. An explicit
    // placement time must always win; only preserve the existing time when the
    // caller did not provide a new one.
    const start = minutesOverride ?? (wasTimed ? minutesFromTime(selectedJob.scheduledStartTime) : (placement?.minutes ?? windowStart));
    const verdict = laneVerdict(employeeId, start);
    if (verdict.state === "blocked") {
      setWarning(`${employee.firstName} ${employee.lastName} is on leave then — pick another crew or a different time.`);
      window.setTimeout(() => setWarning((current) => (current === `${employee.firstName} ${employee.lastName} is on leave then — pick another crew or a different time.` ? null : current)), 4000);
      return;
    }
    const job = selectedJob;
    const previousAssigned = job.assignedUserIds;
    const previousTime = job.scheduledStartTime;
    const nextTime = minutesToTime(start);
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
        onError: (message, retry) => {
          showJobError(job.id, message, retry);
          setJobs((current) => current.map((entry) => (entry.id === job.id ? { ...entry, assignedUserIds: previousAssigned, scheduledStartTime: previousTime } : entry)));
        },
      },
    );
  }

  function minutesFromCoordinates(rect: DOMRect, clientX: number, clientY: number) {
    const raw = axis === "vertical"
      ? windowStart + ((clientY - rect.top) / HOUR_HEIGHT) * 60
      : windowStart + ((clientX - rect.left) / HOUR_WIDTH) * 60;
    const snapped = Math.round(raw / PLACEMENT_SNAP_MINUTES) * PLACEMENT_SNAP_MINUTES;
    return Math.min(Math.max(snapped, windowStart), windowEnd - PLACEMENT_SNAP_MINUTES);
  }

  function minutesFromDragEvent(event: { clientX: number; clientY: number; currentTarget: HTMLElement }) {
    return minutesFromCoordinates(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY);
  }

  // Cross-lane drag: kept working exactly as before the merge. Dragging
  // within a lane, or from the tray/rail (no source lane), adds the target
  // lane. Dragging out of one lane into another *moves* it — only the lane
  // it was dragged out of is replaced, not the whole crew.
  function dropOnEmployee(event: React.DragEvent<HTMLDivElement>, employeeId: string) {
    event.preventDefault();
    stopDragAutoScroll();
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
    const clampedMinutes = dragMinutesRef.current;
    dragMinutesRef.current = null;
    if (clampedMinutes === null) {
      setWarning("Drop the job inside a crew member's time lane so its arrival time is clear.");
      return;
    }
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
          showUndo(isExistingLane ? "Job time updated" : isCrossLaneMove ? `Moved to ${targetName}` : "Crew member added to the job", () =>
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
        onError: (message, retry) => {
          showJobError(jobId, message, retry);
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
    dragMinutesRef.current = null;
  }

  function laneDragOver(event: React.DragEvent<HTMLDivElement>, employeeId: string) {
    event.preventDefault();
    setDragOverEmployeeId(employeeId);
    if (!event.dataTransfer.types.includes("text/plain")) return;
    const minutes = minutesFromDragEvent(event);
    dragMinutesRef.current = minutes;
    if (!event.dataTransfer.types.includes("application/x-cleanops-source-rail") || !selectedJob) return;
    // Untimed job: the hovered position is a placement preview, same as
    // laneMouseMove for the click path — drag suppresses native mousemove,
    // so this is the drag equivalent.
    if (!hasArrivalTime(selectedJob)) {
      setPlacement((current) => (current && current.employeeId === employeeId && current.minutes === minutes ? current : { employeeId, minutes }));
    }
  }

  function laneDrop(event: React.DragEvent<HTMLDivElement>, employeeId: string) {
    if (event.dataTransfer.types.includes("application/x-cleanops-source-rail")) {
      event.preventDefault();
      stopDragAutoScroll();
      setDragOverEmployeeId(null);
      // Untimed job: drop position sets the arrival time (15-minute snap,
      // same rule as click-to-place). Timed jobs ignore this override —
      // commitPlacement keeps the job's own scheduledStartTime.
      const minutes = dragMinutesRef.current;
      dragMinutesRef.current = null;
      if (minutes === null) {
        setWarning("Drop the job inside a crew member's time lane so its arrival time is clear.");
        return;
      }
      commitPlacement(employeeId, minutes);
      return;
    }
    stopDragAutoScroll();
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
          showUndo(`${displayCustomer(job)} unassigned — back in Crew not assigned`, () =>
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
        onError: (message, retry) => {
          showJobError(job.id, message, retry);
          setJobs((current) => current.map((entry) => (entry.id === job.id ? { ...entry, assignedUserIds: previousAssigned } : entry)));
        },
      },
    );
  }

  function stopDragAutoScroll() {
    if (dragScrollFrameRef.current !== null) {
      cancelAnimationFrame(dragScrollFrameRef.current);
      dragScrollFrameRef.current = null;
    }
  }

  function scrollBoardWhileDragging(event: React.DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("text/plain")) return;
    const board = gridScrollRef.current;
    if (!board) return;
    dragPointRef.current = { x: event.clientX, y: event.clientY };
    if (dragScrollFrameRef.current !== null) return;
    const edgeSize = 140;
    const tick = () => {
      const currentBoard = gridScrollRef.current;
      if (!currentBoard) return stopDragAutoScroll();
      const rect = currentBoard.getBoundingClientRect();
      const { x, y } = dragPointRef.current;
      const laneUnderPointer = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-calendar-time-lane]");
      if (laneUnderPointer) dragMinutesRef.current = minutesFromCoordinates(laneUnderPointer.getBoundingClientRect(), x, y);
      const horizontalEdge = Math.max(0, edgeSize - Math.min(x - rect.left, rect.right - x));
      const verticalEdge = Math.max(0, edgeSize - Math.min(y - rect.top, rect.bottom - y));
      const speed = (distance: number) => Math.min(44, Math.max(5, Math.round(distance / 2.5)));
      if (axis === "vertical") {
        if (x < rect.left + edgeSize) currentBoard.scrollLeft -= speed(horizontalEdge);
        else if (x > rect.right - edgeSize) currentBoard.scrollLeft += speed(horizontalEdge);
      } else {
        if (y < rect.top + edgeSize) currentBoard.scrollTop -= speed(verticalEdge);
        else if (y > rect.bottom - edgeSize) currentBoard.scrollTop += speed(verticalEdge);
      }
      dragScrollFrameRef.current = requestAnimationFrame(tick);
    };
    dragScrollFrameRef.current = requestAnimationFrame(tick);
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
    /** The crew whose lane is rendering this card. A multi-cleaner job draws
     * one card per assigned crew member, so this is the only way to know
     * which lane a drag actually started from. */
    laneOwnerId?: string,
  ) {
    const ordinal = ordinalByJobId.get(job.id);
    const isConflict = doubleBookedJobIds.has(job.id);
    const isOnLeave = !isConflict && overLeaveJobIds.has(job.id);
    const readiness = readinessByJobId.get(job.id) ?? deriveJobReadiness({
      hasCrew: job.assignedUserIds.length > 0,
      hasTime: hasArrivalTime(job),
    });
    const leadEmployee = employeesById.get(job.assignedUserIds[0]);
    const crewColor = leadEmployee?.calendarColor ?? employeeColor(job.assignedUserIds[0]);
    const isLocked = LOCKED_STATUSES.includes(job.status);
    const tone = isConflict
      ? "border-[var(--co-danger)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--co-danger)_40%,transparent)]"
      : isOnLeave
        ? "border-[var(--co-warning)]"
        : "";
    const resizeMaxDuration = Math.max(windowEnd - minutesFromTime(job.scheduledStartTime), PLACEMENT_SNAP_MINUTES);
    const resizeDuration = Math.min(
      Math.max(resize?.isResizing ? resizing?.previewDuration ?? job.estimatedDurationMinutes ?? 75 : job.estimatedDurationMinutes ?? 75, PLACEMENT_SNAP_MINUTES),
      resizeMaxDuration,
    );
    const card = (
      <Link
        ref={jobCardRefCallback(job.id) as unknown as React.Ref<HTMLAnchorElement>}
        href={`/jobs/${job.id}`}
        draggable={!isLocked}
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", job.id);
          // Must be the lane this card was dragged OUT of, not merely the
          // first assigned cleaner: the same job renders a card in every
          // assigned crew member's lane, so find() would always name the
          // first one and drop the wrong person off the crew. Dragging
          // replaces the cleaner whose lane you grabbed it from — a settled
          // product decision (confirmed 2026-08-20).
          const lane = laneOwnerId ?? job.assignedUserIds.find((id) => laneData.has(id));
          if (lane) event.dataTransfer.setData("application/x-cleanops-source-employee", lane);
          event.dataTransfer.effectAllowed = "move";
          dragMinutesRef.current = null;
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
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !event.shiftKey) return;
          event.preventDefault();
          selectJob(job.id);
        }}
        aria-label={`${displayCustomer(job)}, ${clockLabelFromMinutes(minutesFromTime(job.scheduledStartTime))}, ${leadEmployee ? `${leadEmployee.firstName} ${leadEmployee.lastName}` : ""}. Press Shift+Enter to select this job, then use a crew lane to move it.`}
        className={`block h-full overflow-hidden rounded-lg border text-left shadow-[var(--co-shadow-control)] transition hover:z-[5] hover:-translate-y-px hover:shadow-[var(--co-shadow-control)] ${compact ? "px-[7px] py-[3px]" : "px-2 py-[5px] pb-1.5"} ${tone}`}
        style={{
          background: `color-mix(in srgb, ${crewColor} 10%, var(--co-surface))`,
          borderColor: isConflict || isOnLeave ? undefined : `color-mix(in srgb, ${crewColor} 36%, var(--co-surface))`,
        }}
      >
        <div className="flex min-w-0 items-center gap-[5px]">
          {ordinal ? (
            <span className="inline-flex h-[18px] shrink-0 items-center rounded border border-[var(--co-line-soft)] bg-[var(--co-surface)] px-1 text-[12px] font-bold text-[var(--co-muted)]">
              {ordinalLabel(ordinal)}
            </span>
          ) : null}
          <span className="min-w-0 truncate text-xs font-bold text-[var(--co-ink)]">{displayCustomer(job)}</span>
          <span className={`${readinessTone(readiness.primary)} shrink-0 rounded px-1.5 py-0.5 text-[12px] font-bold`} title={readiness.reasons.join("; ") || undefined}>{readiness.primary}</span>
          <JobMarks job={job} warn={isConflict || isOnLeave} />
        </div>
        <div className="mt-px truncate text-xs font-semibold text-[var(--co-body)]">
          {clockLabelFromMinutes(minutesFromTime(job.scheduledStartTime))} – {clockLabelFromMinutes(minutesFromTime(job.scheduledStartTime) + jobWallClockDuration(job))}
        </div>
        {!compact ? (
          <div className="mt-px break-words text-xs leading-4 text-[var(--co-faint)]" title={formatCustomerAddress(job)}>
            {job.recurringSeriesId ? "↻ " : ""}{jobTypeLabel(job)} · {formatCustomerAddress(job)}
          </div>
        ) : null}
        {!compact && readiness.primary !== "Ready" ? (
          <div className="mt-px truncate text-[12px] font-semibold text-[var(--co-accent-text)]">
            {readinessReason(readiness)} · {readinessAction(readiness)}
          </div>
        ) : null}
        {overflowCount > 0 ? (
          <span className="absolute bottom-1 right-1 rounded bg-[var(--co-faint)] px-1.5 py-0.5 text-[12px] font-semibold text-[var(--co-surface)]">+{overflowCount} more</span>
        ) : null}
      </Link>
    );
    return (
      <div key={job.id} className={`group absolute ${resize?.isResizing ? "z-[6]" : "z-[3] hover:z-[5]"}`} style={style}>
        {card}
        {resize && !isLocked ? (
          <div
            role="slider"
            tabIndex={0}
            aria-label={`Duration for ${displayCustomer(job)}`}
            aria-orientation="vertical"
            aria-valuemin={PLACEMENT_SNAP_MINUTES}
            aria-valuemax={resizeMaxDuration}
            aria-valuenow={resizeDuration}
            aria-valuetext={formatDuration(resizeDuration)}
            data-job-id={job.id}
            onPointerDown={resize.onPointerDown}
            onPointerMove={resize.onPointerMove}
            onPointerUp={resize.onPointerUp}
            onPointerCancel={resize.onPointerUp}
            onKeyDown={(event) => {
              const maxDuration = resizeMaxDuration;
              const currentDuration = resizeDuration;
              let nextDuration: number | null = null;
              if (event.key === "ArrowDown" || event.key === "ArrowRight") nextDuration = Math.min(currentDuration + PLACEMENT_SNAP_MINUTES, maxDuration);
              if (event.key === "ArrowUp" || event.key === "ArrowLeft") nextDuration = Math.max(currentDuration - PLACEMENT_SNAP_MINUTES, PLACEMENT_SNAP_MINUTES);
              if (event.key === "Home") nextDuration = PLACEMENT_SNAP_MINUTES;
              if (event.key === "End") nextDuration = maxDuration;
              if (nextDuration === null) return;
              event.preventDefault();
              if (resize.isResizing) {
                setResizing((current) => current ? { ...current, previewDuration: nextDuration! } : current);
              } else {
                commitResize(job.id, currentDuration, nextDuration);
              }
            }}
            className={`absolute inset-x-0 bottom-0 z-20 flex h-11 cursor-ns-resize touch-none items-end justify-center pb-0.5 transition-opacity focus-visible:opacity-100 ${resize.isResizing ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          >
            <span className="h-1 w-8 rounded-full bg-[var(--co-faint)]/40" />
          </div>
        ) : null}
      </div>
    );
  }

  function renderAppointment(appointment: CalendarAppointment, style: React.CSSProperties) {
    const appointmentLabel = `${appointment.title}, ${formatAppointmentTime(appointment.startTime, appointment.durationMinutes)}`;
    return (
      <div
        key={appointment.id}
        className={`pointer-events-none absolute z-[3] overflow-visible rounded-md text-left shadow-sm ${appointment.status === "cancelled" ? APPOINTMENT_COLOR_CANCELLED : APPOINTMENT_COLOR}`}
        style={style}
      >
        <div aria-hidden className="flex h-full min-w-0 flex-col items-start gap-0.5 overflow-hidden rounded-md px-2 py-1 text-[12px] font-semibold">
          <span className="truncate">{appointment.title}</span>
          <span className="truncate font-normal">{formatAppointmentTime(appointment.startTime, appointment.durationMinutes)}</span>
        </div>
        <button
          type="button"
          aria-label={`Edit appointment: ${appointmentLabel}`}
          onClick={() => setEditingAppointmentId(appointment.id)}
          className="pointer-events-auto absolute inset-x-0 top-1/2 min-h-11 -translate-y-1/2 rounded-md border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--co-focus-ring)]"
        />
      </div>
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
        <span className="whitespace-nowrap rounded border border-[var(--co-line-soft)] bg-[var(--co-surface)] px-[7px] py-0.5 text-[12px] font-bold text-[var(--co-muted)]">{label}</span>
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
            className="pointer-events-none absolute z-[8] flex items-center gap-[5px] whitespace-nowrap rounded-[7px] px-[9px] py-1 text-[12px] font-bold text-[var(--co-accent-text)] shadow-[var(--co-shadow-control)]"
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
          className={`pointer-events-none absolute z-[8] flex items-center gap-[5px] whitespace-nowrap rounded-[7px] px-[9px] py-1 text-[12px] font-bold shadow-[var(--co-shadow-control)] ${verdictNoteClasses(verdict.state)}`}
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
    const capacityLabel = data ? `${formatDuration(data.capacity.usedMinutes)} of ${data.capacity.availableMinutes ? formatDuration(data.capacity.availableMinutes) : "0m"} labor hours used` : "";
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
          <span className="ml-auto shrink-0 text-[12px] font-semibold text-[var(--co-faint)]">{data?.jobs.length ?? 0}</span>
        </div>
        <CapacityMeter usedMinutes={data?.capacity.usedMinutes ?? 0} availableMinutes={data?.capacity.availableMinutes ?? 0} isOver={data?.capacity.isOver ?? false} onLeave={hasLeave} />
        {hasLeave ? (
          <div className="mt-1">
            <span className="co-badge-muted inline-flex min-h-6 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold">
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

  function commitResize(jobId: string, initialDuration: number, previewDuration: number) {
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
        onError: (message, retry) => {
          showJobError(jobId, message, retry);
          setJobs((current) => current.map((entry) => (entry.id === jobId ? { ...entry, estimatedDurationMinutes: initialDuration } : entry)));
        },
      },
    );
  }

  function endResize() {
    if (!resizing) return;
    const { jobId, initialDuration, previewDuration } = resizing;
    setResizing(null);
    commitResize(jobId, initialDuration, previewDuration);
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
    <div className={`grid grid-cols-1 items-start gap-4 ${attentionRailOpen ? "min-[1180px]:grid-cols-[286px_minmax(0,1fr)]" : "min-[1180px]:grid-cols-1"}`}>
      {/* -------------------------------------------------------------- */}
      {/* Attention rail — always visible, four groups in priority order */}
      {/* -------------------------------------------------------------- */}
      <aside
        id="calendar-attention-rail"
        tabIndex={-1}
        aria-label="Needs attention"
        className={`co-card sticky top-4 overflow-hidden outline-none ${attentionRailOpen ? "" : "hidden"}`}
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
            <span className="text-[13px] font-bold text-[var(--co-danger)]">Drop to unassign this job</span>
          </div>
        ) : null}
        <div className="border-b border-[var(--co-line-soft)] px-[15px] py-[13px] pb-[11px]">
          <div className="flex items-center gap-2 text-[13px] font-bold text-[var(--co-ink)]">
            <button
              type="button"
              onClick={() => setAttentionRailOpen(false)}
              aria-label="Hide needs attention"
              title="Hide needs attention"
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--co-warning)] transition hover:bg-[color-mix(in_srgb,var(--co-warning)_10%,var(--co-tint-base))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--co-accent-fill)]"
            >
              <AlertCircle className="h-[13px] w-[13px]" aria-hidden strokeWidth={1.75} />
            </button>
            Needs attention
            <span className="ml-auto flex h-5 min-w-[22px] items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--co-warning)_30%,var(--co-tint-base))] bg-[color-mix(in_srgb,var(--co-warning)_15%,var(--co-tint-base))] px-1.5 text-[12px] font-bold text-[var(--co-warning)] tabular-nums">
              {attentionTotal}
            </span>
          </div>
          <p className="mt-[5px] text-xs leading-[1.4] text-[var(--co-faint)]">
            {attentionTotal ? "Choose a job, then assign its crew and time. The Board shows where it fits before you save." : "Every job today has a crew and a scheduled time."}
          </p>
          {attentionTotal ? <p className="mt-1 text-[12px] leading-[1.35] text-[var(--co-muted)]">Use <strong className="font-semibold text-[var(--co-body)]">Assign crew &amp; time</strong> for a guided path. Dragging is optional on desktop.</p> : null}
        </div>
        <div className="max-h-[calc(100dvh-190px)] overflow-y-auto">
          <RailGroup icon={<Users className="h-[13px] w-[13px]" aria-hidden strokeWidth={1.75} />} label="Crew not assigned" jobs={noCrewJobs} collapsible defaultCollapsed>
            {noCrewJobs.map((job) => (
              <RailCard
                key={job.id}
                job={job}
                selected={selectedJobId === job.id}
                onSelect={() => openTimeAssignment(job)}
                draggable
                onDragStart={(event) => startRailDrag(event, job)}
                onDragEnd={() => setDragOverEmployeeId(null)}
                onBump={() => setRailAction({ job, mode: "bump" })}
                onSkip={job.recurringSeriesId ? () => setRailAction({ job, mode: "skip" }) : undefined}
                onAssignAtTime={() => openTimeAssignment(job)}
                refCallback={(el) => {
                  if (el) railCardRefs.current.set(job.id, el);
                  else railCardRefs.current.delete(job.id);
                }}
              />
            ))}
          </RailGroup>
          <RailGroup icon={<Clock3 className="h-[13px] w-[13px]" aria-hidden strokeWidth={1.75} />} label="Time not scheduled" jobs={noTimeJobs}>
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
          <RailGroup icon={<TriangleAlert className="h-[13px] w-[13px]" aria-hidden strokeWidth={1.75} />} label="Crew unavailable" jobs={overLeaveJobs}>
            {overLeaveJobs.map((job) => {
              const crew = employeesById.get(job.assignedUserIds[0]);
              return <InfoRailCard key={job.id} job={job} readiness={readinessByJobId.get(job.id)} crewLabel={crew ? `${crew.firstName} ${crew.lastName} is on leave` : "Crew member on leave"} reason="Crew member is on leave" actionLabel="Change crew or time" onAction={() => openTimeAssignment(job)} onFocus={() => focusJob(job.id)} />;
            })}
          </RailGroup>
          <RailGroup icon={<TriangleAlert className="h-[13px] w-[13px]" aria-hidden strokeWidth={1.75} />} label="Overlapping jobs" jobs={doubleBookedJobs}>
            {doubleBookedJobs.map((job) => {
              const crew = employeesById.get(job.assignedUserIds[0]);
              return <InfoRailCard key={job.id} job={job} readiness={readinessByJobId.get(job.id)} crewLabel={crew ? `${crew.firstName} ${crew.lastName}` : undefined} reason="Overlaps another stop" actionLabel="Change crew or time" onAction={() => openTimeAssignment(job)} onFocus={() => focusJob(job.id)} />;
            })}
          </RailGroup>
          <RailGroup icon={<TriangleAlert className="h-[13px] w-[13px]" aria-hidden strokeWidth={1.75} />} label="Over capacity" jobs={overCapacityJobs}>
            {overCapacityJobs.map((job) => {
              const crew = employeesById.get(job.assignedUserIds[0]);
              return <InfoRailCard key={job.id} job={job} readiness={readinessByJobId.get(job.id)} crewLabel={crew ? `${crew.firstName} ${crew.lastName}` : undefined} reason="Over labor capacity" actionLabel="Review placement" onAction={() => openTimeAssignment(job)} onFocus={() => focusJob(job.id)} />;
            })}
          </RailGroup>
          {attentionTotal === 0 ? (
            <div className="px-[15px] py-[22px] text-center text-[12.5px] text-[var(--co-faint)]">
              <CheckCircle2 className="mx-auto mb-1.5 h-5 w-5 text-[var(--co-success)]" aria-hidden strokeWidth={1.75} />
              <div>No dispatch issues for this day.</div>
            </div>
          ) : null}
        </div>
      </aside>

      {/* -------------------------------------------------------------- */}
      {/* Board */}
      {/* -------------------------------------------------------------- */}
      <section className="co-card min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--co-line-soft)] px-4 py-3 sm:px-5 sm:py-3.5">
          <span className="type-admin-body font-bold text-[var(--co-ink)]">{dayLabel}</span>
          <span className="type-admin-meta tabular-nums text-[var(--co-faint)]">
            {jobsPlacedCount} of {cleanedJobs.length} placed · workday {clockLabelFromMinutes(windowStart)}–{clockLabelFromMinutes(windowEnd)}
          </span>
          <details className="relative ml-auto">
            <summary className="co-button-secondary flex min-h-9 cursor-pointer list-none items-center px-2.5 text-[12px] font-semibold [&::-webkit-details-marker]:hidden">Legend</summary>
            <div className="absolute right-0 top-full z-20 mt-2 flex min-w-56 flex-col gap-2 rounded-xl border border-[var(--co-line)] bg-[var(--co-surface)] p-3 shadow-[var(--co-shadow-popover)]">
            <span className="type-admin-micro inline-flex items-center gap-1.5 font-semibold text-[var(--co-faint)]">
              <span
                className="h-3 w-3.5 rounded-[3px] border border-[var(--co-line)] bg-[var(--co-surface-muted-2)]"
                style={{ backgroundImage: "repeating-linear-gradient(-45deg, var(--co-surface-muted-2) 0 4px, transparent 4px 8px)" }}
              />
              Leave
            </span>
            <span className="type-admin-micro inline-flex items-center gap-1.5 font-semibold text-[var(--co-faint)]">
              <span className="h-3 w-3.5 rounded-[3px] border border-[color-mix(in_srgb,var(--co-danger)_40%,var(--co-tint-base))] bg-[color-mix(in_srgb,var(--co-danger)_16%,var(--co-tint-base))]" />
              Overlapping jobs
            </span>
            <span className="type-admin-micro inline-flex items-center gap-1.5 font-semibold text-[var(--co-faint)]">
              <span className="h-0.5 w-3.5 rounded-full bg-[var(--co-danger)]" />
              Now (company time)
            </span>
            </div>
          </details>
        </div>

        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-[var(--co-danger)]/30 bg-[var(--co-danger)]/10 px-4 py-2 text-xs font-medium text-[var(--co-danger)]">
            <span>{error}</span>
            {errorRetry ? <button type="button" onClick={() => { const retry = errorRetry; setError(null); setErrorJobId(null); setErrorRetry(null); retry(); }} className="min-h-11 rounded-md border border-[var(--co-danger)]/30 px-3 py-2 font-semibold text-[var(--co-danger)] hover:bg-[var(--co-danger)]/10">Try again</button> : null}
            {errorJobId ? <button type="button" onClick={() => { setDetailJobId(errorJobId); setError(null); setErrorJobId(null); setErrorRetry(null); }} className="min-h-11 rounded-md border border-[var(--co-danger)]/30 px-3 py-2 font-semibold text-[var(--co-danger)] hover:bg-[var(--co-danger)]/10">Open job details</button> : null}
          </div>
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
              Time not scheduled
            </span>
            <div className="flex flex-wrap gap-2">
              {untimedTrayJobs.map((job) => {
                const crew = employeesById.get(job.assignedUserIds[0]);
                const color = crew?.calendarColor ?? employeeColor(job.assignedUserIds[0]);
                return (
                  <div key={job.id} className="flex items-center gap-[9px] rounded-lg border px-2.5 py-1.5 text-xs transition hover:-translate-y-px hover:shadow-[var(--co-shadow-control)]" style={{ borderColor: "color-mix(in srgb, var(--co-spark-text) 30%, var(--co-tint-base))" }}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                    <b className="font-bold text-[var(--co-ink)]">{displayCustomer(job)}</b>
                    <span className="tabular-nums text-[var(--co-faint)]">
                      {formatDuration(jobDuration(job))} · {crew?.firstName ?? "Crew not assigned"}
                    </span>
                    <button type="button" className="text-[12px] font-bold text-[var(--co-accent-text)] hover:underline" onClick={() => selectJob(job.id)}>
                      Schedule time
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div ref={gridScrollRef} onScroll={(event) => setBoardScrollTop(event.currentTarget.scrollTop)} onDragEnter={scrollBoardWhileDragging} onDragOver={scrollBoardWhileDragging} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) stopDragAutoScroll(); }} className="max-h-[calc(100dvh-232px)] overflow-auto overscroll-contain [scrollbar-gutter:stable]">
          {sortedEmployees.length === 0 ? (
            <div className="flex items-center justify-center px-4 py-16 text-sm text-[var(--co-muted)]">Add or activate a crew member to use the dispatch Board.</div>
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
                    tabIndex={laneEmployeeId ? -1 : 0}
                    role={laneEmployeeId ? undefined : "button"}
                    aria-label={laneEmployeeId ? undefined : `${employee.firstName} ${employee.lastName} crew lane. Use left and right arrow keys to reorder.`}
                    onKeyDown={(event) => {
                      if (laneEmployeeId || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                      const ids = sortedEmployees.map((candidate) => candidate.id);
                      const index = ids.indexOf(employee.id);
                      const nextIndex = event.key === "ArrowLeft" ? index - 1 : index + 1;
                      if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
                      event.preventDefault();
                      const next = [...ids];
                      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
                      void saveColumnOrder(next);
                    }}
                    className={laneEmployeeId ? "" : "cursor-grab rounded-sm outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-[var(--co-focus-ring)]"}
                  >
                    {renderLaneHeader(employee)}
                  </div>
                ))}
              </div>
              <div className="relative grid" style={{ gridTemplateColumns: `${TIME_GUTTER_WIDTH}px repeat(${sortedEmployees.length}, minmax(${CREW_COLUMN_MIN_WIDTH}px, 1fr))` }}>
                <div className="sticky left-0 z-[4] border-r border-[var(--co-line)] bg-[var(--co-surface)]" style={{ height: hours * HOUR_HEIGHT }}>
                  {Array.from({ length: hours }, (_, index) => (
                    <div key={index} className="relative flex items-start justify-end px-2 text-[12px] font-medium text-[var(--co-faint)]" style={{ height: HOUR_HEIGHT }}>
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
                      data-calendar-time-lane
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
                      className={`relative border-r border-[var(--co-line-soft)] outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--co-focus-ring)] ${dragOverEmployeeId === employee.id ? "bg-[var(--co-accent-tint)]" : ""} ${selectedJob ? "cursor-copy" : ""}`}
                      style={{ height: hours * HOUR_HEIGHT, backgroundImage: "repeating-linear-gradient(to bottom, color-mix(in srgb, var(--co-line-soft) 58%, transparent) 0 1px, transparent 1px 16px), repeating-linear-gradient(to bottom, var(--co-line-soft) 0 1px, transparent 1px 100%)", backgroundSize: `100% ${HOUR_HEIGHT / 4}px, 100% ${HOUR_HEIGHT}px` }}
                    >
                      {renderPto(employee.id)}
                      {(appointmentsByEmployee.get(employee.id)?.allDay ?? [])
                        .map((appointment) => renderAppointment(appointment, { left: 4, right: 4, top: 4, bottom: 4 }))}
                      {(appointmentsByEmployee.get(employee.id)?.timed ?? [])
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
                        }, employee.id);
                      })}
                      {renderGhostAndNote(employee.id)}
                    </div>
                  );
                })}
                {showNowLine ? (
                  <>
                    <div className="pointer-events-none absolute z-[6] h-0.5 bg-[var(--co-danger)]" style={{ left: TIME_GUTTER_WIDTH, right: 0, top: (nowOffsetMinutes / 60) * HOUR_HEIGHT }} />
                    <span
                      className="pointer-events-none absolute z-[7] whitespace-nowrap rounded bg-[var(--co-danger)] px-[5px] py-[1.5px] text-[12px] font-bold text-[var(--co-surface)] shadow-[var(--co-shadow-control)]"
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
                    <span key={index} className="border-r border-[var(--co-line-soft)] py-[6px] pb-1.5 pl-2 text-[12px] font-semibold text-[var(--co-faint)]">
                      {clockLabelFromMinutes(windowStart + index * 60).replace(":00", "")}
                    </span>
                  ))}
                </div>
              </div>
              <div className="relative">
                {virtualRowsEnabled ? <div aria-hidden style={{ height: virtualStart * VIRTUAL_ROW_HEIGHT }} /> : null}
                {visibleEmployees.map((employee) => {
                  const data = laneData.get(employee.id);
                  const rowHeight = Math.max(LANE_HEIGHT_BASE, 46 * (data?.maxLanes ?? 1) + 8);
                  return (
                    <div key={employee.id} data-lane-row className="grid border-b border-[var(--co-line-soft)] last:border-b-0 [content-visibility:auto] [contain-intrinsic-size:0_300px]" style={{ gridTemplateColumns: `${LANE_HEADER_WIDTH}px ${hours * HOUR_WIDTH}px` }}>
                      <div className="sticky left-0 z-[4] flex flex-col justify-center border-r border-[var(--co-line)] bg-[var(--co-surface)]">{renderLaneHeader(employee)}</div>
                      <div
                        data-calendar-time-lane
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
                        className={`relative outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--co-focus-ring)] ${dragOverEmployeeId === employee.id ? "bg-[var(--co-accent-tint)]" : ""} ${selectedJob ? "cursor-copy" : ""}`}
                        style={{ width: hours * HOUR_WIDTH, height: rowHeight, backgroundImage: "repeating-linear-gradient(to right, color-mix(in srgb, var(--co-line-soft) 58%, transparent) 0 1px, transparent 1px 16px), repeating-linear-gradient(to right, var(--co-line-soft) 0 1px, transparent 1px 100%)", backgroundSize: `${HOUR_WIDTH / 4}px 100%, ${HOUR_WIDTH}px 100%` }}
                      >
                        {renderPto(employee.id)}
                        {(appointmentsByEmployee.get(employee.id)?.allDay ?? [])
                          .map((appointment) => renderAppointment(appointment, { left: 4, right: 4, top: 4, bottom: 4 }))}
                        {(appointmentsByEmployee.get(employee.id)?.timed ?? [])
                          .map((appointment) => {
                            const start = Math.max(windowStart, minutesFromTime(appointment.startTime));
                            const duration = Math.max(30, appointment.durationMinutes ?? 60);
                            return renderAppointment(appointment, { top: 4, bottom: 4, left: ((start - windowStart) / 60) * HOUR_WIDTH, width: Math.max((duration / 60) * HOUR_WIDTH - 6, 16) });
                          })}
                        {(data?.jobs ?? []).map((job) => {
                          const lane = data!.lanes.get(job.id);
                          if (!lane) return null;
                          const style = jobStyleHorizontal(job, lane.lane, lane.laneCount, rowHeight);
                          return renderJobCard(job, style, (style.height as number) < COMPACT_HEIGHT_HORIZONTAL, lane.overflowCount, undefined, employee.id);
                        })}
                        {renderGhostAndNote(employee.id)}
                      </div>
                    </div>
                  );
                })}
                {virtualRowsEnabled ? <div aria-hidden style={{ height: Math.max(0, sortedEmployees.length - virtualEnd) * VIRTUAL_ROW_HEIGHT }} /> : null}
                {showNowLine ? (
                  <>
                    <div
                      className="pointer-events-none absolute z-[6] w-0.5 bg-[var(--co-danger)]"
                      style={{ left: LANE_HEADER_WIDTH + (nowOffsetMinutes / 60) * HOUR_WIDTH, top: 0, bottom: 0 }}
                    />
                    <span
                      className="pointer-events-none absolute z-[7] whitespace-nowrap rounded bg-[var(--co-danger)] px-[5px] py-[1.5px] text-[12px] font-bold text-[var(--co-surface)] shadow-[var(--co-shadow-control)]"
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
      {railAction ? (
        <RailActionDialog
          job={railAction.job}
          mode={railAction.mode}
          onClose={() => setRailAction(null)}
          policy={cancellationPolicy}
          onConfirm={(fields) => applyRailAction(railAction.job, railAction.mode, fields)}
        />
      ) : null}
      {timeAssignmentJob ? (
        <AssignAtTimeDialog
          job={timeAssignmentJob}
          employees={sortedEmployees}
          initialMinutes={placement?.minutes ?? 13 * 60}
          getVerdict={(employeeId, minutes) => laneVerdict(employeeId, minutes)}
          onClose={() => { setTimeAssignmentJob(null); setSelectedJobId(null); setPlacement(null); }}
          onConfirm={(employeeId, minutes) => {
            setTimeAssignmentJob(null);
            setPlacement({ employeeId, minutes });
            commitPlacement(employeeId, minutes);
          }}
        />
      ) : null}
    </div>
  );
}

function RailGroup({ icon, label, jobs, children, collapsible = false, defaultCollapsed = false }: { icon: React.ReactNode; label: string; jobs: CalendarJob[]; children: React.ReactNode; collapsible?: boolean; defaultCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed);
  if (!jobs.length) return null;
  return (
    <div className="border-b border-[var(--co-line-soft)] last:border-b-0">
      <button type="button" onClick={() => collapsible && setCollapsed((current) => !current)} aria-expanded={collapsible ? !collapsed : undefined} className={`flex w-full items-center gap-[7px] bg-[var(--co-surface-muted)] px-[15px] py-[9px] text-left text-[12px] font-bold uppercase tracking-[0.07em] text-[var(--co-faint)] ${collapsible ? "cursor-pointer hover:bg-[var(--co-surface-muted-2)]" : "cursor-default"}`}>
        {icon}
        {label}
        <span className="ml-auto text-[12px] font-semibold text-[var(--co-muted)]">{jobs.length}</span>
        {collapsible ? <span className="ml-1 text-[13px] text-[var(--co-muted)]" aria-hidden>{collapsed ? "＋" : "−"}</span> : null}
      </button>
      {!collapsed ? <div className="flex flex-col gap-[7px] p-[9px]">{children}</div> : null}
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
  onBump,
  onSkip,
  onAssignAtTime,
}: {
  job: CalendarJob;
  crewLabel?: string;
  crewColor?: string;
  selected: boolean;
  onSelect: () => void;
  refCallback: (el: HTMLElement | null) => void;
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: (event: React.DragEvent<HTMLButtonElement>) => void;
  onBump?: () => void;
  onSkip?: () => void;
  onAssignAtTime?: () => void;
}) {
  const readiness = deriveJobReadiness({ hasCrew: job.assignedUserIds.length > 0, hasTime: hasArrivalTime(job) });
  return (
    <div
      ref={refCallback}
      className={`relative w-full rounded-[10px] border px-[11px] py-[9px] pb-2.5 text-left shadow-[var(--co-shadow-control)] transition hover:-translate-y-px hover:border-[var(--co-accent-text)] hover:shadow-[var(--co-shadow-control)] ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${
        selected ? "border-[var(--co-accent-fill)] bg-[var(--co-accent-tint)] shadow-[0_0_0_3px_var(--co-focus-ring)]" : "border-[var(--co-line)] bg-[var(--co-surface)]"
      }`}
    >
      <button type="button" onClick={onSelect} aria-pressed={selected} draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} className="block w-full text-left">
      <div className="flex items-baseline gap-2">
        <span className="text-[13.5px] font-bold leading-[1.3] text-[var(--co-ink)]">{displayCustomer(job)}</span>
        <span className={`${readinessTone(readiness.primary)} rounded px-1.5 py-0.5 text-[12px] font-bold`}>{readiness.primary}</span>
        <span className="ml-auto text-xs font-bold text-[var(--co-body)] tabular-nums">{job.scheduledStartTime ? clockLabelFromMinutes(minutesFromTime(job.scheduledStartTime)) : "—"}</span>
      </div>
      <div className="mt-[3px] flex items-center gap-[5px] text-xs leading-[1.35] text-[var(--co-faint)]">
        {crewLabel ? (
          <>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: crewColor ?? "var(--co-faint)" }} />
            {crewLabel}
          </>
        ) : (
          <>{formatCustomerAddress(job)}</>
        )}
      </div>
      <div className="mt-[7px] flex flex-wrap gap-1">
        <span className="co-badge-muted inline-flex min-h-6 items-center rounded px-1.5 text-xs font-bold">{job.recurringSeriesId ? "↻ " : ""}{jobTypeLabel(job)}</span>
        <span className="co-badge-muted inline-flex min-h-6 items-center rounded px-1.5 text-xs font-bold tabular-nums">{formatDuration(jobDuration(job))}</span>
        {job.petNotes ? (
          <span className="co-badge-spark inline-flex min-h-6 items-center gap-1 rounded px-1.5 text-xs font-bold">
            <PawPrint className="h-[11px] w-[11px]" aria-hidden strokeWidth={1.75} />
            Pets
          </span>
        ) : null}
      </div>
      {selected ? (
        <div className="mt-2 flex items-center gap-[5px] border-t border-dashed border-[var(--co-line)] pt-[7px] text-xs font-semibold text-[var(--co-accent-text)]">Choose a crew lane on the Board</div>
      ) : null}
      </button>
      {onBump || onSkip || onAssignAtTime ? (
        <div className="mt-2 flex gap-1.5 border-t border-[var(--co-line-soft)] pt-2">
          {onAssignAtTime ? <button type="button" onClick={(event) => { event.stopPropagation(); onAssignAtTime(); }} className="min-h-11 rounded-md border border-[var(--co-accent-fill)] bg-[var(--co-accent-tint)] px-3 py-2 text-xs font-bold text-[var(--co-accent-text)] hover:border-[var(--co-accent-text)]">Assign crew &amp; time</button> : null}
          {onBump ? <button type="button" onClick={(event) => { event.stopPropagation(); onBump(); }} className="min-h-11 rounded-md border border-[var(--co-line)] px-3 py-2 text-xs font-bold text-[var(--co-body)] hover:border-[var(--co-accent-text)] hover:text-[var(--co-accent-text)]">Move to another date</button> : null}
          {onSkip ? <button type="button" onClick={(event) => { event.stopPropagation(); onSkip(); }} className="min-h-11 rounded-md border border-[var(--co-danger)]/30 px-3 py-2 text-xs font-bold text-[var(--co-danger)] hover:bg-[var(--co-danger)]/10">Skip this visit</button> : null}
        </div>
      ) : null}
    </div>
  );
}

function AssignAtTimeDialog({ job, employees, initialMinutes, getVerdict, onClose, onConfirm }: { job: CalendarJob; employees: CalendarEmployee[]; initialMinutes: number; getVerdict: (employeeId: string, minutes: number) => Verdict; onClose: () => void; onConfirm: (employeeId: string, minutes: number) => void }) {
  const [time, setTime] = useState(minutesToTimeInput(initialMinutes));
  const minutes = Math.max(0, Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const selectedVerdict = selectedEmployeeId ? getVerdict(selectedEmployeeId, minutes) : null;
  const dialogRef = useDialogFocus<HTMLDivElement>(true);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[var(--co-overlay)]" />
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="assign-at-time-title" className="relative flex max-h-[min(760px,calc(100dvh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--co-line)] bg-[var(--co-surface)] shadow-[var(--co-shadow-panel)]">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4"><h2 id="assign-at-time-title" className="text-lg font-semibold">Assign {displayCustomer(job)} at a time</h2><p className="mt-1 text-sm text-[var(--co-muted)]">Cleaner colors are calculated for this exact arrival time, including their other houses and time off.</p></div>
        <div className="min-h-0 overflow-y-auto p-5">
          <div className="flex flex-wrap items-end gap-3"><label className="text-sm font-semibold">Arrival time<input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="co-input mt-1 block" /></label><div className="flex gap-2"><button type="button" onClick={() => setTime("09:00")} className="co-button-secondary py-2 text-xs">Morning · 9 AM</button><button type="button" onClick={() => setTime("13:00")} className="co-button-secondary py-2 text-xs">Afternoon · 1 PM</button><button type="button" onClick={() => setTime("14:00")} className="co-button-secondary py-2 text-xs">Second house · 2 PM</button></div></div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">{employees.map((employee) => { const verdict = getVerdict(employee.id, minutes); const selected = selectedEmployeeId === employee.id; return <button key={employee.id} type="button" onClick={() => setSelectedEmployeeId(employee.id)} className={`rounded-xl border p-3 text-left ${selected ? "border-[var(--co-accent-fill)] bg-[var(--co-accent-tint)] shadow-[0_0_0_3px_var(--co-focus-ring)]" : verdict.state === "blocked" ? "border-[var(--co-line)] bg-[var(--co-surface-muted)]" : verdict.state === "warn" ? "border-[var(--co-warning)]/50 bg-[var(--co-warning)]/10" : "border-[var(--co-accent-fill)]/40 bg-[var(--co-accent-tint)]/40"}`}><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: employee.calendarColor ?? employeeColor(employee.id) }} /><span className="font-semibold">{employee.firstName} {employee.lastName}</span><span className="ml-auto text-xs font-bold">{verdict.state === "ok" ? "Available" : verdict.state === "warn" ? "Review labor capacity" : "Unavailable"}</span></div><p className="mt-1 text-xs text-[var(--co-muted)]">{verdict.message}</p></button>; })}</div>
          {selectedVerdict?.state === "blocked" ? <p className="mt-3 text-sm font-medium text-[var(--co-danger)]">Choose an available crew member or another time.</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--co-line-soft)] px-5 py-4"><button type="button" onClick={onClose} className="co-button-secondary">Cancel</button><button type="button" disabled={!selectedEmployeeId || selectedVerdict?.state === "blocked"} onClick={() => selectedEmployeeId && onConfirm(selectedEmployeeId, minutes)} className="co-button-primary disabled:opacity-50">Assign crew member</button></div>
      </div>
    </div>
  );
}

function RailActionDialog({ job, mode, policy, onClose, onConfirm }: { job: CalendarJob; mode: "bump" | "skip"; policy?: string; onClose: () => void; onConfirm: (fields: { scheduledDate?: string; scheduledStartTime?: string; cancellationReason?: string }) => void }) {
  const [date, setDate] = useState(job.scheduledDate);
  const [period, setPeriod] = useState<"morning" | "afternoon">(job.scheduledStartTime && Number(job.scheduledStartTime.slice(0, 2)) >= 12 ? "afternoon" : "morning");
  const [reason, setReason] = useState("");
  const [fee, setFee] = useState<"50" | "100" | "0">("50");
  const startTime = period === "afternoon" ? "13:00:00" : "09:00:00";
  const canSubmit = mode === "bump" ? Boolean(date) : Boolean(reason.trim());
  const dialogRef = useDialogFocus<HTMLDivElement>(true);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[var(--co-overlay)]" />
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="rail-action-title" className="relative w-full max-w-md rounded-2xl border border-[var(--co-line)] bg-[var(--co-surface)] p-5 shadow-[var(--co-shadow-panel)]">
        <h2 id="rail-action-title" className="text-lg font-semibold">{mode === "bump" ? "Move this visit" : "Skip this visit"}</h2>
        <p className="mt-1 text-sm text-[var(--co-muted)]">{displayCustomer(job)} · {job.scheduledDate}</p>
        {mode === "bump" ? (
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-semibold">New date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="co-input mt-1 w-full" /></label>
            <fieldset><legend className="text-sm font-semibold">Arrival window</legend><div className="mt-2 grid grid-cols-2 gap-2">{(["morning", "afternoon"] as const).map((value) => <button key={value} type="button" onClick={() => setPeriod(value)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${period === value ? "border-[var(--co-accent-fill)] bg-[var(--co-accent-tint)] text-[var(--co-accent-text)]" : "border-[var(--co-line)]"}`}>{value === "morning" ? "Morning · 9:00 AM" : "Afternoon · 1:00 PM"}</button>)}</div></fieldset>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-semibold">Why is this visit being skipped?<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="co-input mt-1 w-full resize-none" placeholder="Required for the client record" /></label>
            <fieldset><legend className="text-sm font-semibold">Bill a cancellation fee?</legend><div className="mt-2 space-y-2 text-sm">{([["50", "50% of service rate"], ["100", "100% of service rate"], ["0", "Do not bill a fee"]] as const).map(([value, label]) => <label key={value} className="flex items-center gap-2"><input type="radio" name="skip-fee" value={value} checked={fee === value} onChange={() => setFee(value)} />{label}</label>)}</div></fieldset>
            <p className="whitespace-pre-line rounded-lg bg-[var(--co-surface-muted)] p-3 text-xs leading-5 text-[var(--co-muted)]">{policy ?? "Policy: less than 24 hours’ notice is 50%; same-day cancellations are 100%. A skip fee may be applied to the next catch-up cleaning."}</p>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="co-button-secondary">Keep visit</button><button type="button" disabled={!canSubmit} onClick={() => onConfirm(mode === "bump" ? { scheduledDate: date, scheduledStartTime: startTime } : { cancellationReason: `${reason.trim()} (Cancellation fee: ${fee === "0" ? "not billed" : `${fee}% billed`})` })} className="co-button-primary disabled:opacity-50">{mode === "bump" ? "Move visit" : "Skip this visit"}</button></div>
      </div>
    </div>
  );
}

function InfoRailCard({ job, readiness, crewLabel, reason, actionLabel, onAction, onFocus }: { job: CalendarJob; readiness?: ReturnType<typeof deriveJobReadiness>; crewLabel?: string; reason: string; actionLabel: string; onAction: () => void; onFocus: () => void }) {
  const primary = readiness?.primary ?? (reason === "Over labor capacity" ? "Over capacity" : "Conflict");
  const displayReason = primary === "Over capacity"
    ? "Over labor capacity"
    : readiness?.reasons.find((entry) => entry === "Crew member is on leave" || entry === "Overlaps another stop") ?? reason;
  return (
    <div className="w-full cursor-default rounded-[10px] border border-[var(--co-line)] bg-[var(--co-surface)] px-[11px] py-[9px] pb-2.5 text-left shadow-[var(--co-shadow-control)]">
      <div className="flex items-baseline gap-2">
        <span className="text-[13.5px] font-bold leading-[1.3] text-[var(--co-ink)]">{displayCustomer(job)}</span>
        <span className="ml-auto text-xs font-bold text-[var(--co-body)] tabular-nums">
          {job.scheduledStartTime ? `${clockLabelFromMinutes(minutesFromTime(job.scheduledStartTime))} – ${clockLabelFromMinutes(minutesFromTime(job.scheduledStartTime) + jobWallClockDuration(job))}` : "—"}
        </span>
      </div>
      {crewLabel ? <div className="mt-[3px] text-xs leading-[1.35] text-[var(--co-faint)]">{crewLabel}</div> : null}
      <div className="mt-[7px] flex flex-wrap gap-1">
        <span className={`${readinessTone(primary)} inline-flex h-[19px] items-center rounded px-1.5 text-[12px] font-bold`}>
          {primary}
        </span>
        <span className={`${readinessTone(primary)} inline-flex h-[19px] items-center gap-1 rounded px-1.5 text-[12px] font-bold`}>
          <TriangleAlert className="h-[11px] w-[11px]" aria-hidden strokeWidth={1.75} />
          {displayReason}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={onAction} aria-label={`${actionLabel} for ${displayCustomer(job)}`} className="co-button-primary min-h-11 px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--co-focus-ring)]">{actionLabel}</button>
        <button type="button" onClick={onFocus} aria-label={`Focus ${displayCustomer(job)} on board`} className="co-button-secondary min-h-11 px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--co-focus-ring)]">Focus on board</button>
      </div>
    </div>
  );
}
