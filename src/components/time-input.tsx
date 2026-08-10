"use client";

import { forwardRef } from "react";

interface TimeInputProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export const TimeInput = forwardRef<HTMLInputElement, TimeInputProps>(
  ({ value, defaultValue, onChange, onBlur, label, required, disabled, className = "" }, ref) => {
    return (
      <label className={`block ${className}`}>
        {label && <span className="block text-xs font-semibold text-[var(--co-muted)] mb-2">{label}</span>}
        <div className="relative">
          <input
            ref={ref}
            type="time"
            {...(value !== undefined ? { value, onChange: (e) => onChange?.(e.target.value) } : { defaultValue })}
            onBlur={onBlur}
            required={required}
            disabled={disabled}
            className="co-time-input w-full"
          />
          <svg
            className="co-time-input-icon pointer-events-none"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
      </label>
    );
  }
);

TimeInput.displayName = "TimeInput";
