type RangeSearchParams = {
  from?: string;
  to?: string;
  preset?: string;
};

function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function addDaysIso(value: string, days: number): string {
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

export function monthRangeBefore(value: string) {
  const firstOfMonth = startOfMonthIso(value);
  const toIso = addDaysIso(firstOfMonth, -1);
  return { fromIso: addDaysIso(firstOfMonth, -new Date(`${toIso}T00:00:00.000Z`).getUTCDate()), toIso };
}

export function quarterRangeFor(value: string) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
  const fromIso = `${year}-${String(quarterStartMonth).padStart(2, "0")}-01`;
  const nextQuarter = new Date(Date.UTC(year, quarterStartMonth + 2, 1));
  nextQuarter.setUTCMonth(nextQuarter.getUTCMonth() + 1);
  return { fromIso, toIso: addDaysIso(nextQuarter.toISOString().slice(0, 10), -1) };
}

export function resolveRange(
  sp: RangeSearchParams,
  timeZone: string,
  now = new Date(),
) {
  const todayIso = todayInTimeZone(now, timeZone);
  const preset = sp.preset ?? (sp.from || sp.to ? "custom" : "last_30_days");
  const presetRange =
    preset === "last_7_days" || preset === "week"
      ? { fromIso: addDaysIso(todayIso, -6), toIso: todayIso }
      : preset === "last_30_days" || preset === "month"
        ? { fromIso: addDaysIso(todayIso, -29), toIso: todayIso }
        : preset === "last_90_days"
          ? { fromIso: addDaysIso(todayIso, -89), toIso: todayIso }
        : preset === "this_month"
            ? { fromIso: startOfMonthIso(todayIso), toIso: todayIso }
            : preset === "last_month"
              ? monthRangeBefore(todayIso)
              : preset === "quarter"
                ? quarterRangeFor(todayIso)
            : preset === "today"
              ? { fromIso: todayIso, toIso: todayIso }
              : null;
  const fromIso = isIsoDate(sp.from)
    ? sp.from
    : presetRange?.fromIso ?? addDaysIso(todayIso, -29);
  const toIso = isIsoDate(sp.to) ? sp.to : presetRange?.toIso ?? todayIso;
  const rangeDays = Math.max(
    1,
    Math.round(
      (new Date(`${toIso}T00:00:00.000Z`).getTime() -
        new Date(`${fromIso}T00:00:00.000Z`).getTime()) /
        86400000,
    ) + 1,
  );

  return {
    preset,
    fromIso,
    toIso,
    todayIso,
    prevFromIso: addDaysIso(fromIso, -rangeDays),
    prevToIso: addDaysIso(fromIso, -1),
    label:
      preset === "today"
        ? "Today"
        : preset === "last_7_days" || preset === "week"
          ? "Last 7 days"
          : preset === "last_30_days" || preset === "month"
            ? "Last 30 days"
            : preset === "last_90_days"
              ? "Last 90 days"
              : preset === "this_month"
                ? "This month"
                : preset === "last_month"
                  ? "Last month"
                  : preset === "quarter"
                    ? `Q${Math.floor((Number(todayIso.slice(5, 7)) - 1) / 3) + 1}`
                : preset === "custom"
                  ? "Custom range"
                  : "Last 30 days",
    timeZone,
  };
}
