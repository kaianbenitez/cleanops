type RangeSearchParams = { from?: string; to?: string; preset?: string };

function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function addDaysIso(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function todayInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function startOfWeekIso(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

export function startOfMonthIso(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

export function resolveRange(sp: RangeSearchParams, timeZone: string, now = new Date()) {
  const todayIso = todayInTimeZone(now, timeZone);
  const preset = sp.preset ?? (sp.from || sp.to ? "custom" : "last_30_days");
  const presetRange =
    preset === "today"
      ? { fromIso: todayIso, toIso: todayIso }
      : preset === "week"
        ? { fromIso: startOfWeekIso(todayIso), toIso: todayIso }
        : preset === "month"
          ? { fromIso: startOfMonthIso(todayIso), toIso: todayIso }
          : null;
  const fromIso = isIsoDate(sp.from) ? sp.from : presetRange?.fromIso ?? addDaysIso(todayIso, -30);
  const toIso = isIsoDate(sp.to) ? sp.to : presetRange?.toIso ?? todayIso;
  const rangeDays = Math.max(1, Math.round((new Date(`${toIso}T00:00:00.000Z`).getTime() - new Date(`${fromIso}T00:00:00.000Z`).getTime()) / 86400000) + 1);

  return {
    preset,
    fromIso,
    toIso,
    todayIso,
    prevFromIso: addDaysIso(fromIso, -rangeDays),
    prevToIso: addDaysIso(fromIso, -1),
    label: preset === "today" ? "Today" : preset === "week" ? "This week" : preset === "month" ? "This month" : preset === "custom" ? "Custom range" : "Last 30 days",
  };
}
