/** Returns the ISO date (YYYY-MM-DD) for the Monday of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  const day = copy.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  copy.setUTCDate(copy.getUTCDate() + diff);
  return copy;
}

export function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** User-facing dates are always MM/DD/YY. Date-only values are parsed in UTC
 * so a scheduled visit never shifts a day in a viewer's local timezone. */
export function formatDisplayDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

export function weekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function formatDayLabel(d: Date): string {
  return `${d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${formatDisplayDate(d)}`;
}
