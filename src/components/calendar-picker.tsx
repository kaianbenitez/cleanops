"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CalendarPickerProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  min?: string;
  max?: string;
  // SF-7: opt-in per-day free-hours tinting. Off by default so every other
  // DateInput in the app (customer forms, PTO, etc.) is unaffected.
  showCapacity?: boolean;
  // Hours the job being scheduled needs, if known — lets a day tint relative
  // to *this* job ("4.2h needed vs 3.1h free") instead of a flat threshold.
  neededHours?: number | null;
}

type DayCapacity = {
  date: string;
  availableHours: number;
  committedHours: number;
  freeHours: number;
  staffCount: number;
  hasIncompleteEstimates: boolean;
};

// Local calendar date -> "YYYY-MM-DD" without going through UTC (toISOString
// shifts the date across midnight for any timezone not exactly at UTC+0).
function localISO(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatHours(hours: number) {
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}h`;
}

// Never a day-blocker — this only decides the tint. "over" reflects the day
// itself being over-committed; "tight" means it's open but doesn't comfortably
// fit this specific job when neededHours is known (or a small flat buffer
// otherwise). Thresholds are a starting hypothesis, not a tuned constant —
// expect to revisit after watching Stephanie actually schedule against it.
function tintFor(freeHours: number, neededHours: number | null | undefined): "comfortable" | "tight" | "over" {
  if (freeHours < 0) return "over";
  if (neededHours != null) return freeHours < neededHours ? "tight" : "comfortable";
  return freeHours < 2 ? "tight" : "comfortable";
}

const TINT_CLASS: Record<"comfortable" | "tight" | "over", string> = {
  comfortable: "co-badge-success",
  tight: "co-badge-warning",
  over: "co-badge-danger",
};

export function CalendarPicker({ value, onChange, onClose, min, max, showCapacity, neededHours }: CalendarPickerProps) {
  const [date, setDate] = useState<Date>(() => {
    const d = value ? new Date(value + "T00:00:00") : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [capacityByDate, setCapacityByDate] = useState<Record<string, DayCapacity> | null>(null);
  const [capacityFailed, setCapacityFailed] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const year = date.getFullYear();
  const month = date.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());

  const days: Date[] = [];
  const current = new Date(startDate);
  while (current <= lastDay || current.getDay() !== 0) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  const gridStartISO = localISO(days[0]);
  const gridEndISO = localISO(days[days.length - 1]);

  useEffect(() => {
    if (!showCapacity) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/scheduling/capacity?start=${gridStartISO}&end=${gridEndISO}`);
        if (!response.ok) throw new Error("capacity fetch failed");
        const data = await response.json();
        if (cancelled) return;
        const byDate: Record<string, DayCapacity> = {};
        for (const day of data.days ?? []) byDate[day.date] = day;
        setCapacityByDate(byDate);
        setCapacityFailed(false);
      } catch {
        // Degrade to a plain working picker — capacity is decoration, never a
        // blocker.
        if (!cancelled) setCapacityFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showCapacity, gridStartISO, gridEndISO]);

  const handleDateClick = (d: Date, disabled: boolean) => {
    if (disabled) return;
    onChange(localISO(d));
    onClose();
  };

  const formatDate = (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const todayISO = localISO(new Date());
  const capacityReady = showCapacity && !capacityFailed && capacityByDate !== null;

  return (
    <div
      ref={containerRef}
      className="co-date-popover absolute top-full left-0 z-50 mt-2 w-72 p-3"
    >
      <div className="flex items-center justify-between border-b border-[var(--co-line-soft)] pb-2">
        <button type="button" aria-label="Previous month" onClick={() => setDate(new Date(year, month - 1, 1))} className="co-date-nav">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <p className="text-sm font-semibold text-[var(--co-ink)]">{formatDate(date)}</p>
        <button type="button" aria-label="Next month" onClick={() => setDate(new Date(year, month + 1, 1))} className="co-date-nav">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {capacityReady && neededHours != null ? (
        <p className="mt-2 text-xs text-[var(--co-muted)]">This visit needs about {formatHours(neededHours)}.</p>
      ) : null}

      <div className="mt-2 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--co-faint)]">
        {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
          <span key={`${day}-${index}`} className="py-1.5">{day}</span>
        ))}
        {days.map((d) => {
          const isCurrentMonth = d.getMonth() === month;
          const dISO = localISO(d);
          const isSelected = dISO === value;
          const isToday = dISO === todayISO;
          const isOutOfRange = (min !== undefined && dISO < min) || (max !== undefined && dISO > max);
          const dayCapacity = capacityReady ? capacityByDate?.[dISO] : undefined;
          const tint = dayCapacity && !isSelected ? tintFor(dayCapacity.freeHours, neededHours) : null;

          return (
            <button
              key={dISO}
              type="button"
              disabled={isOutOfRange}
              onClick={() => handleDateClick(d, isOutOfRange)}
              aria-pressed={isSelected}
              title={
                dayCapacity
                  ? `${formatHours(dayCapacity.freeHours)} free of ${formatHours(dayCapacity.availableHours)}${dayCapacity.hasIncompleteEstimates ? " (some jobs use an estimated duration)" : ""}`
                  : undefined
              }
              className={`co-date-day flex flex-col items-center justify-center gap-0 ${tint ? "min-h-11" : ""} ${tint ? TINT_CLASS[tint] : ""} ${isSelected ? "co-date-day-selected" : ""} ${
                !isSelected && isToday ? "border border-[var(--co-evergreen)] font-semibold text-[var(--co-evergreen)]" : ""
              } ${!isSelected && !isToday && !isCurrentMonth ? "text-[var(--co-faint)]" : ""} ${
                isOutOfRange ? "opacity-30 cursor-not-allowed" : ""
              }`}
            >
              <span>{d.getDate()}</span>
              {tint ? <span className="text-[9px] font-semibold leading-none opacity-90">{formatHours(dayCapacity!.freeHours)}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
