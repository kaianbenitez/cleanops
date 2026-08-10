"use client";

import { useEffect, useRef } from "react";

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

export function TimePicker({ value, onChange, onClose }: TimePickerProps) {
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

  const [hours, minutes] = value ? value.split(":").map(Number) : [9, 0];

  const hours24 = Array.from({ length: 24 }, (_, i) => i);

  const handleTimeChange = (h: number, m: number) => {
    const newTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    onChange(newTime);
  };

  return (
    <div
      ref={containerRef}
      className="absolute top-full left-0 z-50 mt-2 w-64 rounded-lg border border-[var(--co-line)] bg-white p-4 shadow-lg"
    >
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.05em] text-[var(--co-muted)]">
        Select time
      </div>

      <div className="flex gap-2">
        {/* Hours */}
        <div className="flex-1">
          <div className="mb-1 text-xs font-semibold text-[var(--co-muted)]">Hour</div>
          <div className="max-h-40 overflow-y-auto rounded border border-[var(--co-line-soft)]">
            {hours24.map((h) => (
              <button
                key={h}
                onClick={() => handleTimeChange(h, minutes)}
                className={`w-full px-2 py-2 text-sm font-medium transition-colors ${
                  hours === h
                    ? "bg-[var(--co-evergreen)] text-white"
                    : "text-[var(--co-ink)] hover:bg-[var(--co-surface-muted)]"
                }`}
              >
                {String(h).padStart(2, "0")}
              </button>
            ))}
          </div>
        </div>

        {/* Minutes */}
        <div className="flex-1">
          <div className="mb-1 text-xs font-semibold text-[var(--co-muted)]">Min</div>
          <div className="max-h-40 overflow-y-auto rounded border border-[var(--co-line-soft)]">
            {[0, 15, 30, 45].map((m) => (
              <button
                key={m}
                onClick={() => handleTimeChange(hours, m)}
                className={`w-full px-2 py-2 text-sm font-medium transition-colors ${
                  minutes === m
                    ? "bg-[var(--co-evergreen)] text-white"
                    : "text-[var(--co-ink)] hover:bg-[var(--co-surface-muted)]"
                }`}
              >
                {String(m).padStart(2, "0")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-[var(--co-surface-muted)] px-3 py-2 text-center text-sm font-semibold text-[var(--co-ink)]">
        {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}
      </div>
    </div>
  );
}
