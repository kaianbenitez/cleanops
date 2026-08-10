"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CalendarPickerProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

// Local calendar date -> "YYYY-MM-DD" without going through UTC (toISOString
// shifts the date across midnight for any timezone not exactly at UTC+0).
function localISO(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function CalendarPicker({ value, onChange, onClose }: CalendarPickerProps) {
  const [date, setDate] = useState<Date>(() => {
    const d = value ? new Date(value + "T00:00:00") : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

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

  const handleDateClick = (d: Date) => {
    onChange(localISO(d));
    onClose();
  };

  const formatDate = (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const todayISO = localISO(new Date());

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

      <div className="mt-2 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--co-faint)]">
        {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
          <span key={`${day}-${index}`} className="py-1.5">{day}</span>
        ))}
        {days.map((d) => {
          const isCurrentMonth = d.getMonth() === month;
          const dISO = localISO(d);
          const isSelected = dISO === value;
          const isToday = dISO === todayISO;

          return (
            <button
              key={dISO}
              type="button"
              onClick={() => handleDateClick(d)}
              aria-pressed={isSelected}
              className={`co-date-day ${isSelected ? "co-date-day-selected" : ""} ${
                !isSelected && isToday ? "border border-[var(--co-evergreen)] font-semibold text-[var(--co-evergreen)]" : ""
              } ${!isSelected && !isToday && !isCurrentMonth ? "text-[var(--co-faint)]" : ""}`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
