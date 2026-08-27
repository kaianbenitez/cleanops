"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
}

function to12Hour(h: number) {
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { hour12, period };
}

export function TimePicker({ value, onChange, onClose, anchorRef }: TimePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedHourRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (containerRef.current && !containerRef.current.contains(target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, anchorRef]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useLayoutEffect(() => {
    function updatePosition() {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({ top: rect.bottom + 8, left: Math.min(rect.left, window.innerWidth - 272) });
    }
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [anchorRef]);

  useEffect(() => {
    // Only run on open — later hour changes shouldn't yank the scroll position.
    selectedHourRef.current?.scrollIntoView({ block: "center" });
  }, []);

  const [hours, minutes] = value ? value.split(":").map(Number) : [9, 0];

  const hours24 = Array.from({ length: 24 }, (_, i) => i);
  const { period } = to12Hour(hours);

  const handleTimeChange = (h: number, m: number) => {
    const newTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    onChange(newTime);
  };

  if (!position) return null;

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Choose time"
      className="co-date-popover fixed z-50 w-64 max-w-[calc(100vw-1rem)] p-3"
      style={{ top: position.top, left: Math.max(8, position.left) }}
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
                period === p ? "bg-[var(--co-accent-fill)] text-white" : "text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)]"
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
                    ? "bg-[var(--co-accent-fill)] text-white"
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
                    ? "bg-[var(--co-accent-fill)] text-white"
                    : "text-[var(--co-ink)] hover:bg-[var(--co-accent-tint)]"
                }`}
              >
                {String(m).padStart(2, "0")}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
