"use client";

import { useEffect, useRef, useState } from "react";

interface CalendarPickerProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
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
    const iso = d.toISOString().split("T")[0];
    onChange(iso);
    onClose();
  };

  const formatDate = (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div
      ref={containerRef}
      className="absolute top-full left-0 z-50 mt-2 w-72 rounded-lg border border-[var(--co-line)] bg-white p-4 shadow-lg"
    >
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => setDate(new Date(year, month - 1, 1))}
          className="rounded p-1 text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
        >
          ←
        </button>
        <h3 className="text-sm font-semibold text-[var(--co-ink)]">{formatDate(date)}</h3>
        <button
          onClick={() => setDate(new Date(year, month + 1, 1))}
          className="rounded p-1 text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
        >
          →
        </button>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="text-center text-xs font-semibold text-[var(--co-muted)]">
            {day[0]}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          const isCurrentMonth = d.getMonth() === month;
          const isSelected = d.toISOString().split("T")[0] === value;
          const isToday = d.toISOString().split("T")[0] === new Date().toISOString().split("T")[0];

          return (
            <button
              key={i}
              onClick={() => handleDateClick(d)}
              className={`aspect-square rounded text-xs font-medium transition-colors ${
                isSelected
                  ? "bg-[var(--co-evergreen)] text-white font-semibold"
                  : isToday
                    ? "border border-[var(--co-evergreen)] text-[var(--co-evergreen)]"
                    : isCurrentMonth
                      ? "text-[var(--co-ink)] hover:bg-[var(--co-surface-muted)]"
                      : "text-[var(--co-faint)] hover:bg-[var(--co-surface-muted)]"
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
