export const TYPE_LABELS: Record<string, string> = {
  first_clean: "First clean",
  recurring: "Recurring",
  one_time: "One-time",
  deep_clean: "Deep clean",
  move_out: "Move in/out",
};

export const STATUS_STYLES: Record<string, string> = {
  scheduled: "border-slate-200 bg-slate-50 text-slate-600",
  in_progress: "border-amber-200 bg-amber-50 text-amber-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelled: "border-slate-200 bg-slate-50 text-slate-400",
  no_show: "border-rose-200 bg-rose-50 text-rose-700",
};

export const TYPE_COLORS: Record<string, string> = {
  first_clean: "border-sky-300 bg-sky-50 text-sky-700",
  recurring: "border-emerald-300 bg-emerald-50 text-emerald-700",
  one_time: "border-violet-300 bg-violet-50 text-violet-700",
  deep_clean: "border-indigo-300 bg-indigo-50 text-indigo-700",
  move_out: "border-orange-300 bg-orange-50 text-orange-700",
};

export const EMPLOYEE_PALETTE = ["#2563eb", "#0f766e", "#7c3aed", "#ea580c", "#be123c", "#15803d", "#b45309", "#4f46e5"];

export const STAFF_RANGE_START = 7 * 60;
export const STAFF_RANGE_MINUTES = 12 * 60;

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

export function jobDuration(job: { estimatedDurationMinutes: number | null }) {
  return Math.max(job.estimatedDurationMinutes ?? 75, 45);
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
 */
export function assignDayLanes<T extends { id: string; scheduledStartTime: string | null; estimatedDurationMinutes: number | null }>(
  dayJobs: T[]
): Map<string, { lane: number; laneCount: number }> {
  const result = new Map<string, { lane: number; laneCount: number }>();
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
    const laneCount = laneEndTimes.length;
    for (const job of cluster) {
      result.set(job.id, { lane: laneOf.get(job.id)!, laneCount });
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
