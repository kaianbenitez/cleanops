"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { CalendarPicker } from "./calendar-picker";

interface DateInputProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  name?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  showCapacity?: boolean;
  neededHours?: number | null;
  ariaLabel?: string;
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, defaultValue, onChange, onBlur, label, required, disabled, className = "", name, placeholder = "Select a date", min, max, showCapacity, neededHours }, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const [displayValue, setDisplayValue] = useState(value ?? defaultValue ?? "");
    const triggerRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
      if (value !== undefined) {
        setDisplayValue(value);
      }
    }, [value]);

    const handleChange = (newValue: string) => {
      setDisplayValue(newValue);
      onChange?.(newValue);
    };

    const formatDisplay = (dateStr: string) => {
      if (!dateStr) return "";
      const d = new Date(dateStr + "T00:00:00");
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };

    return (
      <label className={`block ${className}`}>
        {label && <span className="block text-xs font-semibold text-[var(--co-muted)] mb-2">{label}</span>}
        <div className="relative">
          <button
            ref={triggerRef}
            type="button"
            disabled={disabled}
            onClick={() => setIsOpen(!isOpen)}
            className="co-date-input w-full text-left"
            aria-label={ariaLabel ?? label}
          >
            <span className={`whitespace-nowrap ${displayValue ? "text-[var(--co-ink)]" : "text-[var(--co-input-placeholder)]"}`}>
              {displayValue ? formatDisplay(displayValue) : placeholder}
            </span>
          </button>
          <svg
            className="co-date-input-icon pointer-events-none"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <input
            ref={ref}
            type="date"
            name={name}
            min={min}
            max={max}
            value={displayValue}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={onBlur}
            required={required}
            disabled={disabled}
            className="sr-only"
            aria-hidden="true"
          />
          {isOpen && (
            <CalendarPicker
              value={displayValue}
              onChange={handleChange}
              onClose={() => setIsOpen(false)}
              anchorRef={triggerRef}
              min={min}
              max={max}
              showCapacity={showCapacity}
              neededHours={neededHours}
            />
          )}
        </div>
      </label>
    );
  }
);

DateInput.displayName = "DateInput";
