"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { TimePicker } from "./time-picker";

interface TimeInputProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  name?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
}

export const TimeInput = forwardRef<HTMLInputElement, TimeInputProps>(
  ({ value, defaultValue, onChange, onBlur, label, required, disabled, className = "", name, ariaLabel, ariaDescribedBy }, ref) => {
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

    return (
      <label className={`block ${className}`}>
        {label && <span className="block text-xs font-semibold text-[var(--co-muted)] mb-2">{label}</span>}
        <div className="relative">
          <button
            ref={triggerRef}
            type="button"
            disabled={disabled}
            onClick={() => setIsOpen(!isOpen)}
            className="co-time-input w-full text-left"
            aria-label={ariaLabel ?? label}
            aria-describedby={ariaDescribedBy}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
          >
            <span className={displayValue ? "text-[var(--co-ink)]" : "text-[var(--co-input-placeholder)]"}>
              {displayValue || "Select a time"}
            </span>
          </button>
          <svg
            className="co-time-input-icon pointer-events-none"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <input
            ref={ref}
            type="time"
            name={name}
            value={displayValue}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={onBlur}
            required={required}
            disabled={disabled}
            className="sr-only"
            tabIndex={-1}
          />
          {isOpen && (
            <TimePicker value={displayValue} onChange={handleChange} onClose={() => setIsOpen(false)} anchorRef={triggerRef} />
          )}
        </div>
      </label>
    );
  }
);

TimeInput.displayName = "TimeInput";
