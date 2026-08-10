"use client";

import { forwardRef } from "react";

interface DateInputProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, defaultValue, onChange, onBlur, label, required, disabled, className = "" }, ref) => {
    return (
      <label className={`block ${className}`}>
        {label && <span className="block text-xs font-semibold text-[var(--co-muted)] mb-2">{label}</span>}
        <div className="relative">
          <input
            ref={ref}
            type="date"
            {...(value !== undefined ? { value, onChange: (e) => onChange?.(e.target.value) } : { defaultValue })}
            onBlur={onBlur}
            required={required}
            disabled={disabled}
            className="co-date-input w-full"
          />
          <svg
            className="co-date-input-icon pointer-events-none"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
      </label>
    );
  }
);

DateInput.displayName = "DateInput";
