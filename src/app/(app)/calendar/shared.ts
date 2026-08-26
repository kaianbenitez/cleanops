export const TYPE_LABELS: Record<string, string> = {
  first_clean: "First clean",
  recurring: "Recurring",
  one_time: "One-time",
  deep_clean: "Deep clean",
  move_out: "Move in/out",
};

// Internal meeting/appointment styling — deliberately not part of
// TYPE_COLORS (which is job-type specific) since appointments aren't jobs.
// Uses --co-spark-* per the design refinement handoff's §3.4 rule that
// violet (an attention-esque marker, not a status) maps to spark, not a
// seventh hue.
export const APPOINTMENT_COLOR = "co-badge-spark";
export const APPOINTMENT_COLOR_CANCELLED = "co-badge-muted line-through";
export const ATTENTION_RAIL_TOGGLE_EVENT = "cleanops:toggle-calendar-attention-rail";

export type JobReadinessState = "Needs crew" | "Needs time" | "Ready" | "Conflict" | "Over capacity";

export type JobReadiness = {
  primary: JobReadinessState;
  reasons: string[];
};

/**
 * One primary operational label for a job. Detailed signals remain in
 * `reasons` so views can keep their existing attention groups and warnings.
 * Conflict and capacity are intentionally more urgent than missing setup;
 * when both crew and time are missing, crew is the first actionable blocker.
 */
export function deriveJobReadiness({
  hasCrew,
  hasTime,
  conflictReasons = [],
  overCapacityReasons = [],
}: {
  hasCrew: boolean;
  hasTime: boolean;
  conflictReasons?: readonly string[];
  overCapacityReasons?: readonly string[];
}): JobReadiness {
  const reasons = [...new Set([...conflictReasons, ...overCapacityReasons])];
  if (conflictReasons.length) return { primary: "Conflict", reasons };
  if (overCapacityReasons.length) return { primary: "Over capacity", reasons };
  if (!hasCrew) return { primary: "Needs crew", reasons };
  if (!hasTime) return { primary: "Needs time", reasons };
  return { primary: "Ready", reasons };
}

export function readinessTone(primary: JobReadinessState) {
  switch (primary) {
    case "Conflict":
      return "co-badge-danger";
    case "Over capacity":
      return "co-badge-warning";
    case "Needs crew":
    case "Needs time":
      return "co-badge-spark";
    case "Ready":
      return "co-badge-success";
  }
}

export function readinessReason(readiness: JobReadiness): string {
  switch (readiness.primary) {
    case "Needs crew":
      return "Crew not assigned";
    case "Needs time":
      return "Time not scheduled";
    case "Conflict":
      return "Schedule conflict";
    case "Over capacity":
      return "Labor capacity exceeded";
    case "Ready":
      return "Ready to dispatch";
  }
}

export function readinessAction(readiness: JobReadiness): string {
  switch (readiness.primary) {
    case "Needs crew":
      return "Assign crew";
    case "Needs time":
      return "Set time";
    case "Conflict":
      return "Review conflict";
    case "Over capacity":
      return "Review placement";
    case "Ready":
      return "Open details";
  }
}

export function clockLabelFromMinutes(totalMinutes: number) {
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minute = Math.round(totalMinutes % 60);
  const hour12 = ((hour24 + 11) % 12) + 1;
  const suffix = hour24 < 12 ? "AM" : "PM";
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function crewKey(assignedUserIds: string[]) {
  return [...assignedUserIds].sort().join(",");
}

/** "1st", "2nd", "3rd", "4th", ... "11th", "21st" — standard English ordinal
 * suffix rules (11-13 are "th" even though they end in 1/2/3). */
export function ordinalLabel(n: number): string {
  const remainder100 = n % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Stop order within a crew's day: "Team 3's second house." Groups jobs by
 * exact crew signature (same set of assigned employees), sorts each group by
 * start time, and numbers from 1. Jobs with no crew or no start time get no
 * ordinal — they're already surfaced by categorizeForAttention. Presentation
 * only, derived from stored data — no stop-order field in the DB. */
export function stopOrdinals<T extends { id: string; assignedUserIds: string[]; scheduledStartTime: string | null }>(
  jobs: T[],
): Map<string, number> {
  const groups = new Map<string, T[]>();
  for (const job of jobs) {
    if (!job.assignedUserIds.length || !job.scheduledStartTime) continue;
    const key = crewKey(job.assignedUserIds);
    const group = groups.get(key);
    if (group) group.push(job);
    else groups.set(key, [job]);
  }
  const result = new Map<string, number>();
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => (a.scheduledStartTime ?? "").localeCompare(b.scheduledStartTime ?? ""));
    sorted.forEach((job, index) => result.set(job.id, index + 1));
  }
  return result;
}

export type AttentionCategory = "unassigned" | "no-time" | "conflict" | "overlap" | "over-capacity";
const RETAINED_JOB_STATUSES = ["cancelled", "no_show"];

export type CalendarPtoRecord = {
  userId: string;
  startDate: string;
  endDate: string;
  startPeriod?: "morning" | "afternoon" | "full";
  endPeriod?: "morning" | "afternoon" | "full";
};

export type CalendarAttentionOptions = {
  workdayMinutes?: number;
  windowStart?: number;
  windowEnd?: number;
};

export function ptoPeriodForDay(pto: CalendarPtoRecord, dayIso: string): "morning" | "afternoon" | "full" {
  if (pto.startDate === pto.endDate) return pto.startPeriod === pto.endPeriod ? (pto.startPeriod ?? "full") : "full";
  if (pto.startDate === dayIso) return pto.startPeriod ?? "full";
  if (pto.endDate === dayIso) return pto.endPeriod ?? "full";
  return "full";
}

export function ptoIntervalForDay(
  ptoRecords: CalendarPtoRecord[],
  employeeId: string,
  dayIso: string,
  windowStart: number,
  windowEnd: number,
): { from: number; to: number } | null {
  const periods = ptoRecords
    .filter((pto) => pto.userId === employeeId && pto.startDate <= dayIso && pto.endDate >= dayIso)
    .map((pto) => ptoPeriodForDay(pto, dayIso));
  if (!periods.length) return null;
  const period = periods.includes("full") || new Set(periods).size > 1 ? "full" : periods[0];
  const noon = 12 * 60;
  if (period === "morning") return { from: windowStart, to: Math.min(noon, windowEnd) };
  if (period === "afternoon") return { from: Math.max(noon, windowStart), to: windowEnd };
  return { from: windowStart, to: windowEnd };
}

function ptoOverlapsJob(
  ptoRecords: CalendarPtoRecord[],
  employeeId: string,
  job: { scheduledStartTime: string | null; estimatedDurationMinutes?: number | null; assignedUserIds: string[] },
  dayIso: string,
  windowStart: number,
  windowEnd: number,
) {
  if (!job.scheduledStartTime) return false;
  const pto = ptoIntervalForDay(ptoRecords, employeeId, dayIso, windowStart, windowEnd);
  if (!pto) return false;
  const start = minutesFromTime(job.scheduledStartTime);
  const end = start + jobWallClockDuration(job);
  return start < pto.to && pto.from < end;
}

/** Categorizes a day's active jobs for the Needs-attention strip: no crew,
 * no arrival time, or an assigned cleaner on PTO that day — in that priority
 * order, one bucket per job. Cancelled/no-show/completed jobs are excluded
 * (cancelled/no-show get their own collapsed list in the UI; completed jobs
 * need no action). Generic so it has no dependency on the page-level
 * CalendarJob type. */
export function categorizeForAttention<
  T extends { id: string; status: string; scheduledDate?: string; assignedUserIds: string[]; scheduledStartTime: string | null },
>(jobs: T[], ptoRecords: CalendarPtoRecord[], dayIso: string, options: CalendarAttentionOptions = {}): { job: T; category: AttentionCategory }[] {
  const entries: { job: T; category: AttentionCategory }[] = [];
  const windowStart = options.windowStart ?? DEFAULT_WORKDAY_START_MINUTES;
  const windowEnd = options.windowEnd ?? DEFAULT_WORKDAY_END_MINUTES;
  for (const job of jobs) {
    if (job.scheduledDate && job.scheduledDate !== dayIso) continue;
    if (RETAINED_JOB_STATUSES.includes(job.status) || job.status === "completed") continue;
    if (!job.assignedUserIds.length) {
      entries.push({ job, category: "unassigned" });
    } else if (!job.scheduledStartTime) {
      entries.push({ job, category: "no-time" });
    } else if (job.assignedUserIds.some((employeeId) => ptoOverlapsJob(ptoRecords, employeeId, job, dayIso, windowStart, windowEnd))) {
      entries.push({ job, category: "conflict" });
    }
  }
  return entries;
}

/** The complete attention union used by both the Board rail and toolbar.
 * Categories intentionally remain separate so a PTO + overlap job appears in
 * both rail groups exactly as it does on the Board. */
export function aggregateCalendarAttention<T extends CalendarReadinessJob>(
  jobs: T[],
  ptoRecords: CalendarPtoRecord[],
  dayIso: string,
  options: CalendarAttentionOptions = {},
): { job: T; category: AttentionCategory }[] {
  const entries = categorizeForAttention(jobs, ptoRecords, dayIso, options);
  const activeTimed = jobs.filter((job) =>
    job.scheduledDate === dayIso &&
    !RETAINED_JOB_STATUSES.includes(job.status) &&
    job.status !== "completed" &&
    job.assignedUserIds.length &&
    job.scheduledStartTime,
  );
  const seenOverlapIds = new Set<string>();
  for (let index = 0; index < activeTimed.length; index += 1) {
    for (let other = index + 1; other < activeTimed.length; other += 1) {
      const first = activeTimed[index];
      const second = activeTimed[other];
      if (!first.assignedUserIds.some((id) => second.assignedUserIds.includes(id))) continue;
      if (!jobsOverlap(first, jobWallClockDuration(first), second, jobWallClockDuration(second))) continue;
      for (const job of [first, second]) {
        if (!seenOverlapIds.has(job.id)) {
          entries.push({ job, category: "overlap" });
          seenOverlapIds.add(job.id);
        }
      }
    }
  }
  const readinessByJobId = deriveCalendarReadiness(jobs, ptoRecords, {
    workdayMinutes: options.workdayMinutes ?? 8 * 60,
    windowStart: options.windowStart ?? DEFAULT_WORKDAY_START_MINUTES,
    windowEnd: options.windowEnd ?? DEFAULT_WORKDAY_END_MINUTES,
  });
  for (const job of jobs) {
    if (job.scheduledDate !== dayIso) continue;
    if (readinessByJobId.get(job.id)?.reasons.some((reason) => reason.includes(" is over capacity on "))) {
      entries.push({ job, category: "over-capacity" });
    }
  }
  return entries;
}

export type CalendarReadinessJob = {
  id: string;
  status: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number | null;
  assignedUserIds: string[];
};

/** Shared server/Board readiness inputs. The Board can pass its optimistic
 * jobs here, while server views pass the freshly queried jobs. */
export function deriveCalendarReadiness<T extends CalendarReadinessJob>(
  jobs: T[],
  ptoRecords: CalendarPtoRecord[],
  { workdayMinutes, windowStart, windowEnd }: { workdayMinutes: number; windowStart: number; windowEnd: number },
): Map<string, JobReadiness> {
  const activeJobs = jobs.filter((job) => !RETAINED_JOB_STATUSES.includes(job.status) && job.status !== "completed");
  const conflicts = new Map<string, string[]>();
  const overCapacity = new Map<string, string[]>();
  for (const job of activeJobs) {
    if (job.assignedUserIds.some((employeeId) => ptoOverlapsJob(ptoRecords, employeeId, job, job.scheduledDate, windowStart, windowEnd))) {
      conflicts.set(job.id, ["Crew member is on leave"]);
    }
  }
  const jobsByEmployee = new Map<string, T[]>();
  for (const job of activeJobs) {
    for (const employeeId of job.assignedUserIds) {
      const key = `${job.scheduledDate}:${employeeId}`;
      jobsByEmployee.set(key, [...(jobsByEmployee.get(key) ?? []), job]);
    }
  }
  for (const [key, employeeJobs] of jobsByEmployee) {
    for (let index = 0; index < employeeJobs.length; index += 1) {
      for (let other = index + 1; other < employeeJobs.length; other += 1) {
        const first = employeeJobs[index];
        const second = employeeJobs[other];
        if (first.scheduledStartTime && second.scheduledStartTime && jobsOverlap(first, jobWallClockDuration(first), second, jobWallClockDuration(second))) {
          for (const job of [first, second]) conflicts.set(job.id, [...(conflicts.get(job.id) ?? []), "Overlaps another stop"]);
        }
      }
    }
    const separator = key.lastIndexOf(":");
    const dayIso = key.slice(0, separator);
    const employeeId = key.slice(separator + 1);
    const capacity = capacityForCrew({
      jobs: employeeJobs,
      pto: ptoIntervalForDay(ptoRecords, employeeId, dayIso, windowStart, windowEnd),
      workdayMinutes,
      windowStart,
      windowEnd,
    });
    if (capacity.isOver) {
      for (const job of employeeJobs) {
        const reasons = [`${employeeId} is over capacity on ${dayIso}`];
        // Keep the first conflict reason stable while allowing multiple
        // overlapping employees to contribute detail.
        overCapacity.set(job.id, [...(overCapacity.get(job.id) ?? []), ...reasons]);
      }
    }
  }
  return new Map(activeJobs.map((job) => [job.id, deriveJobReadiness({
    hasCrew: job.assignedUserIds.length > 0,
    hasTime: Boolean(job.scheduledStartTime),
    conflictReasons: conflicts.get(job.id) ?? [],
    overCapacityReasons: overCapacity.get(job.id) ?? [],
  })]));
}

export function formatAppointmentTime(startTime: string | null, durationMinutes: number | null) {
  if (!startTime) return "All day";
  const startMinutes = minutesFromTime(startTime);
  const start = clockLabelFromMinutes(startMinutes);
  if (!durationMinutes) return start;
  return `${start} – ${clockLabelFromMinutes(startMinutes + durationMinutes)}`;
}

// Order matters here, not just membership: employeeColorAt() assigns colors
// by *index* (0, 1, 2, ...) to employees in tenure order, so the first 8
// entries are the ones that actually get worn side-by-side on a normal-sized
// crew. They're picked and ordered so every pair among the first 8 is
// distinguishable at a glance — as a 1px card border and as a 9px lane dot —
// against both --co-surface (white) and its dark equivalent. The old order
// put #f6ed00 (yellow, near-invisible on white) and #fff3ca (cream, reads as
// blank) first, and put the near-identical #f6ed00/#f4c542 next to each
// other. The weakest colors (pale pastels, the near-duplicate second amber)
// are pushed to the tail, where they only surface once a company has more
// than 8 concurrent crews.
export const EMPLOYEE_PALETTE = ["#008c99", "#e31b16", "#5687d8", "#e600d0", "#4ed66c", "#ff7a00", "#a899d1", "#8f9698", "#d4a500", "#f4c542", "#9bd8ad", "#a7c8ef", "#b9d8e8", "#f4d5cf", "#fff3ca", "#f6ed00"];

// The one working window jobs render against on the calendar boards. Replaces
// three inconsistent hardcoded ranges (vertical-board.tsx's 9am-7pm,
// horizontal-board.tsx's 7am-7pm, and this file's old 9am-6pm) with a single
// default that's overridden by the company's saved workdayStartMinutes /
// workdayEndMinutes setting where present (see settings/calendar/page.tsx).
export const DEFAULT_WORKDAY_START_MINUTES = 7 * 60;
export const DEFAULT_WORKDAY_END_MINUTES = 19 * 60;

export function minutesFromTime(value: string | null | undefined) {
  if (!value) return 9 * 60;
  const [hours, minutes] = value.slice(0, 5).split(":").map((part) => Number(part || 0));
  return hours * 60 + minutes;
}

export function hourLabel(totalMinutes: number) {
  const hour24 = Math.floor(totalMinutes / 60);
  const hour12 = ((hour24 + 11) % 12) + 1;
  const suffix = hour24 < 12 ? "AM" : "PM";
  return `${hour12} ${suffix}`;
}

export function isPlainClick(event: { defaultPrevented: boolean; button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }) {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function formatClockLabel(time: string | null | undefined) {
  if (!time) return "no time";
  const [hourStr, minuteStr] = time.slice(0, 5).split(":");
  const hour24 = Number(hourStr);
  const hour12 = ((hour24 + 11) % 12) + 1;
  const suffix = hour24 < 12 ? "AM" : "PM";
  return `${hour12}:${minuteStr} ${suffix}`;
}

export function employeeColor(id: string | null | undefined) {
  if (!id) return "#94a3b8";
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return EMPLOYEE_PALETTE[hash % EMPLOYEE_PALETTE.length];
}

export function employeeColorAt(index: number) {
  if (index < EMPLOYEE_PALETTE.length) return EMPLOYEE_PALETTE[index];
  const hue = (index * 137.508) % 360;
  const chroma = 0.42;
  const lightness = 0.42;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = lightness - chroma / 2;
  const [red, green, blue] = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return `#${[red, green, blue].map((value) => Math.round((value + match) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** Matches the prototype's `.jc` rule: a uniform 1px border tinted from the
 * crew color plus a faint background tint, both mixed against the current
 * surface so they hold their contrast in light and dark. Crew identity is
 * carried by a dot (rendered by the caller), not by a heavier colored edge —
 * the old 3px `border-left` read as an alert rather than an identity mark. */
export function employeeCardStyle(id: string | null | undefined) {
  const color = id?.startsWith("#") ? id : employeeColor(id);
  return {
    backgroundColor: `color-mix(in srgb, ${color} 10%, var(--co-surface))`,
    borderColor: `color-mix(in srgb, ${color} 36%, var(--co-surface))`,
  };
}

export function displayCustomer(job: { customerFirstName: string; customerLastName: string; companyName?: string | null }) {
  return job.companyName?.trim() || `${job.customerLastName}, ${job.customerFirstName}`;
}

export function formatCustomerAddress(job: {
  customerAddress?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  customerZip?: string | null;
}) {
  return [job.customerAddress, job.customerCity, job.customerState, job.customerZip].filter(Boolean).join(", ") || "No address";
}

export function recurrenceLabel(value: string | null | undefined) {
  if (!value || value === "none") return "One-time";
  if (value === "every4weeks") return "Every 4 weeks";
  if (value === "biweekly") return "Bi-weekly";
  if (value === "custom") return "Custom recurring";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Cards show the customer's actual cadence (Weekly, Bi-weekly, Every 4
 * weeks, Monthly) instead of the generic "Recurring" job type — matches the
 * My Day convention (recurringFrequencyLabel in lib/my-day/job-format.ts). */
export function jobTypeLabel(job: { type: string; recurrenceFrequency?: string | null }) {
  if (job.type === "recurring" && job.recurrenceFrequency && job.recurrenceFrequency !== "none") {
    return recurrenceLabel(job.recurrenceFrequency);
  }
  return TYPE_LABELS[job.type] ?? job.type;
}

export function jobDuration(job: { estimatedDurationMinutes: number | null }) {
  return Math.max(job.estimatedDurationMinutes ?? 75, 45);
}

/** Calendar geometry is elapsed time, not payroll JTH per cleaner. */
export function jobWallClockDuration(job: { estimatedDurationMinutes?: number | null; assignedUserIds?: string[] }) {
  const crewSize = Math.max(1, job.assignedUserIds?.length ?? 1);
  return Math.max(Math.ceil((job.estimatedDurationMinutes ?? 75) / crewSize), 45);
}

/** hh:mm, matching the Jobs list and Job Detail convention (`formatEstimatedTime`). */
export function formatEstimatedTime(minutes: number | null | undefined) {
  if (!minutes) return "Est. pending";
  return `Est. ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Whether a job has a real scheduled arrival time. `minutesFromTime(null)`
 * still returns 9 AM for existing geometry math (kept as-is, see its own
 * comment) — this helper is how a caller distinguishes "actually at 9 AM"
 * from "no time yet" so an untimed job can be routed to a tray instead of
 * being drawn on top of a real 9 AM booking. */
export function hasArrivalTime(job: { scheduledStartTime: string | null | undefined }): boolean {
  return job.scheduledStartTime != null;
}

/** Minute-of-day (0-1439) as read in `timeZone`, not the caller's own clock.
 * The calendar boards' now-line must track dispatch time (e.g.
 * America/Chicago), not wherever the admin's laptop happens to be — from
 * Manila that used to put the line about 13 hours off. `hour12: false` can
 * report "24" at local midnight on some ICU builds, hence the `% 24`. */
export function minuteOfDayInTimeZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.hour) % 24;
  const minute = Number(values.minute);
  return hour * 60 + minute;
}

/**
 * Per-employee capacity for a working window, porting the prototype's
 * corrected `capacity()` maths exactly: PTO eats into the *working window*
 * (`windowStart`-`windowEnd`), not directly into the contracted workday, so a
 * cleaner on leave from noon still shows the morning as available. A
 * half-day cleaner reads e.g. "4h 30m / 5h" (window minus leave, capped at
 * the contracted day) — never "/ 1h" (window minus leave with no cap) and
 * never "/ 8h" (the full contracted day, ignoring the leave entirely).
 * A shared job's labor hours are split evenly across its assigned crew before
 * they are added to each employee's capacity.
 */
export function capacityForCrew({
  jobs,
  pto,
  workdayMinutes,
  windowStart,
  windowEnd,
}: {
  jobs: {
    scheduledStartTime: string | null | undefined;
    estimatedDurationMinutes: number | null;
    assignedUserIds: string[];
  }[];
  pto: { from: number; to: number } | null;
  workdayMinutes: number;
  windowStart: number;
  windowEnd: number;
}): { usedMinutes: number; availableMinutes: number; isOver: boolean } {
  const usedMinutes = jobs
    .filter((job) => job.scheduledStartTime != null)
    .reduce((sum, job) => {
      const crewSize = Math.max(1, job.assignedUserIds.length);
      return sum + jobDuration(job) / crewSize;
    }, 0);
  const off = pto ? Math.max(Math.min(pto.to, windowEnd) - Math.max(pto.from, windowStart), 0) : 0;
  const availableMinutes = Math.min(workdayMinutes, windowEnd - windowStart - off);
  const isOver = availableMinutes > 0 && usedMinutes > availableMinutes;
  return { usedMinutes, availableMinutes, isOver };
}

export function jobsOverlap(
  a: { scheduledStartTime: string | null },
  aDuration: number,
  b: { scheduledStartTime: string | null },
  bDuration: number
) {
  const aStart = minutesFromTime(a.scheduledStartTime);
  const bStart = minutesFromTime(b.scheduledStartTime);
  return aStart < bStart + bDuration && bStart < aStart + aDuration;
}

/**
 * Clusters a single day's jobs by time-overlap, then greedily assigns each
 * job a lane within its own cluster (classic interval-partitioning). Jobs
 * with no overlap anywhere that day land alone in a cluster of laneCount 1,
 * so non-overlapping days render at full width exactly as before this
 * existed — only genuinely concurrent jobs get split into side-by-side lanes.
 * The visible lane count is capped so dense clusters remain readable; callers
 * can replace hidden jobs with the returned overflow count.
 */
export function assignDayLanes<T extends { id: string; scheduledStartTime: string | null; estimatedDurationMinutes: number | null }>(
  dayJobs: T[],
  maxVisibleLanes = 3
): Map<string, { lane: number; laneCount: number; hidden: boolean; overflowCount: number }> {
  const result = new Map<string, { lane: number; laneCount: number; hidden: boolean; overflowCount: number }>();
  const sorted = [...dayJobs].sort((a, b) => minutesFromTime(a.scheduledStartTime) - minutesFromTime(b.scheduledStartTime));

  let cluster: T[] = [];
  let clusterEnd = -Infinity;

  function flushCluster() {
    if (cluster.length === 0) return;
    const laneEndTimes: number[] = [];
    const laneOf = new Map<string, number>();
    for (const job of cluster) {
      const start = minutesFromTime(job.scheduledStartTime);
      const end = start + jobDuration(job);
      let lane = laneEndTimes.findIndex((laneEnd) => laneEnd <= start);
      if (lane === -1) {
        lane = laneEndTimes.length;
        laneEndTimes.push(end);
      } else {
        laneEndTimes[lane] = end;
      }
      laneOf.set(job.id, lane);
    }
    const laneCount = Math.min(laneEndTimes.length, Math.max(maxVisibleLanes, 1));
    const hiddenJobs = cluster.filter((job) => (laneOf.get(job.id) ?? 0) >= laneCount);
    const overflowAnchor = cluster.find((job) => laneOf.get(job.id) === laneCount - 1);
    for (const job of cluster) {
      const lane = laneOf.get(job.id)!;
      result.set(job.id, {
        lane: Math.min(lane, laneCount - 1),
        laneCount,
        hidden: lane >= laneCount,
        overflowCount: job.id === overflowAnchor?.id ? hiddenJobs.length : 0,
      });
    }
    cluster = [];
  }

  for (const job of sorted) {
    const start = minutesFromTime(job.scheduledStartTime);
    if (start >= clusterEnd) {
      flushCluster();
      clusterEnd = start + jobDuration(job);
    } else {
      clusterEnd = Math.max(clusterEnd, start + jobDuration(job));
    }
    cluster.push(job);
  }
  flushCluster();

  return result;
}
