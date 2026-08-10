"use client";

import { useEffect, useRef } from "react";

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

function to12Hour(h: number) {
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { hour12, period };
}

export function TimePicker({ value, onChange, onClose }: TimePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedHourRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    selectedHourRef.current?.scrollIntoView({ block: "center" });
    // Only run on open — later hour changes shouldn't yank the scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [hours, minutes] = value ? value.split(":").map(Number) : [9, 0];

  const hours24 = Array.from({ length: 24 }, (_, i) => i);
  const { period } = to12Hour(hours);

  const handleTimeChange = (h: number, m: number) => {
    const newTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    onChange(newTime);
  };

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Choose time"
      className="co-date-popover absolute top-full left-0 z-50 mt-2 w-64 p-3"
    >
      <div className="mb-2 flex items-center justify-between border-b border-[var(--co-line-soft)] pb-2">
        <p className="text-sm font-semibold text-[var(--co-ink)]">
          {String(to12Hour(hours).hour12).padStart(2, "0")}:{String(minutes).padStart(2, "0")}
        </p>
        <div className="flex overflow-hidden rounded-md border border-[var(--co-line-soft)]">
          {(["AM", "PM"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handleTimeChange(p === period ? hours : (hours + 12) % 24, minutes)}
              className={`px-2 py-1 text-[11px] font-semibold transition-colors ${
                period === p ? "bg-[var(--co-evergreen)] text-white" : "text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)]"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <div className="mb-1 text-xs font-semibold text-[var(--co-muted)]">Hour</div>
          <div className="max-h-40 overflow-y-auto rounded-md border border-[var(--co-line-soft)]">
            {hours24.map((h) => (
              <button
                key={h}
                ref={hours === h ? selectedHourRef : undefined}
                type="button"
                onClick={() => handleTimeChange(h, minutes)}
                className={`w-full px-2 py-1.5 text-sm font-medium transition-colors ${
                  hours === h
                    ? "bg-[var(--co-evergreen)] text-white"
                    : "text-[var(--co-ink)] hover:bg-[var(--co-accent-tint)]"
                }`}
              >
                {String(to12Hour(h).hour12).padStart(2, "0")} {to12Hour(h).period}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1">
          <div className="mb-1 text-xs font-semibold text-[var(--co-muted)]">Min</div>
          <div className="max-h-40 overflow-y-auto rounded-md border border-[var(--co-line-soft)]">
            {[0, 15, 30, 45].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleTimeChange(hours, m)}
                className={`w-full px-2 py-1.5 text-sm font-medium transition-colors ${
                  minutes === m
                    ? "bg-[var(--co-evergreen)] text-white"
                    : "text-[var(--co-ink)] hover:bg-[var(--co-accent-tint)]"
                }`}
              >
                {String(m).padStart(2, "0")}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
