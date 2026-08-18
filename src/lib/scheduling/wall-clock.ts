/** Total JTH is labor demand. Wall-clock time is shared across the assigned
 * crew and is deliberately separate from payroll's JTH accounting. */
export function wallClockMinutes(totalJthMinutes: number | null | undefined, crewSize: number): number {
  const safeCrewSize = Math.max(1, Math.floor(crewSize) || 1);
  return Math.max(0, Math.ceil((totalJthMinutes ?? 0) / safeCrewSize));
}

export function timeToMinutes(value: string | null | undefined, fallback = 9 * 60): number {
  if (!value) return fallback;
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : fallback;
}

export function minutesToTime(totalMinutes: number): string {
  const normalized = Math.max(0, Math.round(totalMinutes));
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}:00`;
}
