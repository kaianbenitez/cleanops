import { minutesToTime, timeToMinutes, wallClockMinutes } from "./wall-clock";

export type BookingWindow = { key: "morning" | "afternoon"; startTime: string; endTime: string; label?: string };
export type SchedulingSettings = { bookingWindows: BookingWindow[]; workdayEndTime: string; transitionMinutes: number; maximumCrewSize: number; workingDays: number[]; holidays: string[] };
export type RecommendationEmployee = { id: string; firstName: string; lastName: string; isActive: boolean; isFieldStaff: boolean; serviceLocationIds: string[] };
export type RecommendationPto = { userId: string; startDate: string; endDate: string; startPeriod: "full" | "morning" | "afternoon"; endPeriod: "full" | "morning" | "afternoon" };
export type RecommendationJob = { id: string; scheduledDate: string; scheduledStartTime: string | null; estimatedDurationMinutes: number | null; status: string; assignedUserIds: string[] };
export type RecommendationEvent = { id: string; scheduledDate: string; startTime: string | null; durationMinutes: number | null; isAllDay: boolean; status: string; attendeeUserIds: string[] };
export type SchedulingRecommendation = { date: string; arrivalWindowStartTime: string; arrivalWindowEndTime: string; employeeIds: string[]; employeeNames: string[]; crewSize: number; totalJthMinutes: number; expectedWallClockMinutes: number; expectedFinishTime: string; reasonCodes: string[]; explanations: string[]; warnings: string[] };
export type RecommendationInputs = { startDate: string; endDate: string; serviceLocationId: string; serviceType: string; totalJthMinutes: number; preferredWindow?: "morning" | "afternoon" | null; employees: RecommendationEmployee[]; pto: RecommendationPto[]; jobs: RecommendationJob[]; calendarEvents: RecommendationEvent[]; settings?: Partial<SchedulingSettings> };

export const DEFAULT_SCHEDULING_SETTINGS: SchedulingSettings = {
  bookingWindows: [
    { key: "morning", startTime: "09:00:00", endTime: "09:30:00", label: "Morning" },
    { key: "afternoon", startTime: "13:00:00", endTime: "13:30:00", label: "Afternoon" },
  ],
  workdayEndTime: "17:00:00",
  transitionMinutes: 60,
  maximumCrewSize: 3,
  workingDays: [1, 2, 3, 4, 5],
  holidays: [],
};

/** Parses only known settings, keeping a malformed company JSON from silently
 * producing impossible schedules. */
export function parseSchedulingSettings(raw: Record<string, unknown> | null | undefined): SchedulingSettings {
  const value = raw ?? {};
  const configuredWindows = Array.isArray(value.bookingWindows) ? value.bookingWindows.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const key = item.key === "morning" || item.key === "afternoon" ? item.key : null;
    const startTime = typeof item.startTime === "string" ? item.startTime : null;
    const endTime = typeof item.endTime === "string" ? item.endTime : null;
    return key && /^\d{2}:\d{2}(:\d{2})?$/.test(startTime ?? "") && /^\d{2}:\d{2}(:\d{2})?$/.test(endTime ?? "") ? [{ key, startTime, endTime, label: typeof item.label === "string" ? item.label : undefined } as BookingWindow] : [];
  }) : [];
  const workingDays = Array.isArray(value.workingDays) ? [...new Set(value.workingDays.filter((day): day is number => typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6))] : [];
  const holidays = Array.isArray(value.holidays) ? value.holidays.filter((day): day is string => typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) : [];
  return {
    bookingWindows: configuredWindows.length ? configuredWindows : DEFAULT_SCHEDULING_SETTINGS.bookingWindows,
    workdayEndTime: typeof value.workdayEndTime === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(value.workdayEndTime) ? value.workdayEndTime : DEFAULT_SCHEDULING_SETTINGS.workdayEndTime,
    transitionMinutes: typeof value.transitionMinutes === "number" && value.transitionMinutes >= 0 ? Math.round(value.transitionMinutes) : DEFAULT_SCHEDULING_SETTINGS.transitionMinutes,
    maximumCrewSize: typeof value.maximumCrewSize === "number" && value.maximumCrewSize >= 1 ? Math.min(3, Math.floor(value.maximumCrewSize)) : DEFAULT_SCHEDULING_SETTINGS.maximumCrewSize,
    workingDays: workingDays.length ? workingDays : DEFAULT_SCHEDULING_SETTINGS.workingDays,
    holidays,
  };
}

function datesBetween(startDate: string, endDate: string) { const dates: string[] = []; const cursor = new Date(`${startDate}T00:00:00.000Z`); const end = new Date(`${endDate}T00:00:00.000Z`); while (cursor <= end) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); } return dates; }
function periodForDate(pto: RecommendationPto, date: string) { if (pto.startDate === pto.endDate) return pto.startPeriod === pto.endPeriod ? pto.startPeriod : "full"; return date === pto.startDate ? pto.startPeriod : date === pto.endDate ? pto.endPeriod : "full"; }
function ptoBlocks(pto: RecommendationPto[], employeeId: string, date: string, window: BookingWindow) { const requested = timeToMinutes(window.startTime) < 12 * 60 ? "morning" : "afternoon"; return pto.some((row) => row.userId === employeeId && row.startDate <= date && date <= row.endDate && (periodForDate(row, date) === "full" || periodForDate(row, date) === requested)); }
function combinations<T>(items: T[], size: number): T[][] { if (size === 0) return [[]]; if (items.length < size) return []; const [head, ...tail] = items; return [...combinations(tail, size - 1).map((group) => [head, ...group]), ...combinations(tail, size)]; }
function serviceCrewOrder(serviceType: string, maximum: number) { const recurring = ["weekly", "biweekly", "four_weeks", "recurring"].includes(serviceType); const firstOrDeep = ["first_time", "first_clean", "deep", "supreme_deep", "deep_clean", "move_in_out", "move_out"].includes(serviceType); const preferred = recurring ? 1 : firstOrDeep ? 2 : 1; return [...Array(maximum)].map((_, index) => index + 1).sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred) || a - b); }

export function getSchedulingRecommendations(inputs: RecommendationInputs): SchedulingRecommendation[] {
  const settings = { ...DEFAULT_SCHEDULING_SETTINGS, ...parseSchedulingSettings(inputs.settings), ...inputs.settings, bookingWindows: parseSchedulingSettings(inputs.settings).bookingWindows } as SchedulingSettings;
  const windows = [...settings.bookingWindows].sort((a, b) => (a.key === inputs.preferredWindow ? -1 : b.key === inputs.preferredWindow ? 1 : timeToMinutes(a.startTime) - timeToMinutes(b.startTime)));
  const eligible = inputs.employees.filter((employee) => employee.isActive && employee.isFieldStaff && employee.serviceLocationIds.includes(inputs.serviceLocationId));
  const recommendations: SchedulingRecommendation[] = [];
  const cutoff = timeToMinutes(settings.workdayEndTime);
  for (const date of datesBetween(inputs.startDate, inputs.endDate)) {
    const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    if (!settings.workingDays.includes(day) || settings.holidays.includes(date)) continue;
    for (const window of windows) {
      const arrival = timeToMinutes(window.startTime); const conservativeStart = timeToMinutes(window.endTime);
      for (const crewSize of serviceCrewOrder(inputs.serviceType, Math.min(3, settings.maximumCrewSize))) {
        const wallClock = wallClockMinutes(inputs.totalJthMinutes, crewSize); const finish = conservativeStart + wallClock;
        if (finish > cutoff) continue;
        const available = eligible.filter((employee) => !ptoBlocks(inputs.pto, employee.id, date, window));
        const crew = combinations(available, crewSize).find((candidate) => candidate.every((employee) => {
          const jobs = inputs.jobs.filter((job) => job.scheduledDate === date && !["cancelled", "no_show"].includes(job.status) && job.assignedUserIds.includes(employee.id));
          const events = inputs.calendarEvents.filter((event) => event.scheduledDate === date && event.status !== "cancelled" && event.attendeeUserIds.includes(employee.id));
          if (events.some((event) => event.isAllDay || !event.startTime || (arrival < timeToMinutes(event.startTime) + (event.durationMinutes ?? 60) && timeToMinutes(event.startTime) < finish))) return false;
          return jobs.every((job) => {
            const otherStart = timeToMinutes(job.scheduledStartTime); const otherFinish = otherStart + wallClockMinutes(job.estimatedDurationMinutes, Math.max(1, job.assignedUserIds.length));
            return finish + settings.transitionMinutes <= otherStart || otherFinish + settings.transitionMinutes <= arrival;
          });
        }));
        if (!crew) continue;
        const preferredCrew = serviceCrewOrder(inputs.serviceType, settings.maximumCrewSize)[0];
        recommendations.push({ date, arrivalWindowStartTime: window.startTime, arrivalWindowEndTime: window.endTime, employeeIds: crew.map((employee) => employee.id), employeeNames: crew.map((employee) => `${employee.firstName} ${employee.lastName}`), crewSize, totalJthMinutes: inputs.totalJthMinutes, expectedWallClockMinutes: wallClock, expectedFinishTime: minutesToTime(finish), reasonCodes: ["BRANCH_ELIGIBLE", "CONTINUOUS_OPENING", ...(crewSize === preferredCrew ? ["PREFERRED_CREW_SIZE"] : ["CREW_INCREASED_TO_FIT"]), ...(window.key === inputs.preferredWindow ? ["CUSTOMER_WINDOW_PREFERENCE"] : [])], explanations: [`${crew.map((employee) => employee.firstName).join(" + ")} can work in this branch and have a continuous opening.`, `About ${Math.floor(wallClock / 60)} hour${Math.floor(wallClock / 60) === 1 ? "" : "s"}${wallClock % 60 ? ` ${wallClock % 60} min` : ""} onsite; finishes by ${minutesToTime(finish).slice(0, 5)}.`], warnings: [] });
        break;
      }
    }
  }
  // One complete recommendation per date/window; different crew variants are
  // not useful choices for a coordinator. Earliest eligible slot wins.
  return recommendations.filter((item, index, list) => list.findIndex((other) => other.date === item.date && other.arrivalWindowStartTime === item.arrivalWindowStartTime) === index).slice(0, 3);
}
