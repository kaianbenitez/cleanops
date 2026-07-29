export const TYPE_LABELS: Record<string, string> = {
  first_clean: "First clean",
  recurring: "Recurring",
  one_time: "One-time",
  deep_clean: "Deep clean",
  move_out: "Move in/out",
};

export const TYPE_COLORS: Record<string, string> = {
  first_clean: "border-sky-300 bg-sky-50 text-sky-700",
  recurring: "border-emerald-300 bg-emerald-50 text-emerald-700",
  one_time: "border-violet-300 bg-violet-50 text-violet-700",
  deep_clean: "border-indigo-300 bg-indigo-50 text-indigo-700",
  move_out: "border-orange-300 bg-orange-50 text-orange-700",
};

export const EMPLOYEE_PALETTE = ["#f6ed00", "#f4c542", "#9bd8ad", "#008c99", "#e600d0", "#4ed66c", "#a7c8ef", "#e31b16", "#a899d1", "#d4a500", "#8f9698", "#ff7a00", "#fff3ca", "#f4d5cf", "#b9d8e8", "#5687d8"];

export const STAFF_RANGE_START = 9 * 60;
export const STAFF_RANGE_MINUTES = 9 * 60;

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

export function employeeCardStyle(id: string | null | undefined) {
  const color = id?.startsWith("#") ? id : employeeColor(id);
  return {
    backgroundColor: `${color}66`,
    borderColor: `${color}d9`,
    borderLeftColor: color,
    borderLeftWidth: "3px",
  };
}

export function displayCustomer(job: { customerFirstName: string; customerLastName: string; companyName?: string | null }) {
  return job.companyName?.trim() || `${job.customerFirstName} ${job.customerLastName}`;
}

export function recurrenceLabel(value: string | null | undefined) {
  if (!value || value === "none") return "One-time";
  if (value === "every4weeks") return "Every 4 weeks";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function jobDuration(job: { estimatedDurationMinutes: number | null }) {
  return Math.max(job.estimatedDurationMinutes ?? 75, 45);
}

/** hh:mm, matching the Jobs list and Job Detail convention (`formatEstimatedTime`). */
export function formatEstimatedTime(minutes: number | null | undefined) {
  if (!minutes) return "Est. pending";
  return `Est. ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
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
