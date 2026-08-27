"use client";

import { DateInput } from "./date-input";
import { TimeInput } from "./time-input";

type DateTimeInputProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

export function DateTimeInput({ value, onChange, label, required, disabled, className = "" }: DateTimeInputProps) {
  const [date = "", time = ""] = value.split("T");
  const updateDate = (nextDate: string) => onChange(nextDate ? `${nextDate}T${time || "09:00"}` : "");
  const updateTime = (nextTime: string) => {
    if (!nextTime) return onChange("");
    const today = new Date();
    const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    onChange(`${date || localToday}T${nextTime}`);
  };

  return (
    <fieldset className={className}>
      <legend className="mb-2 text-xs font-semibold text-[var(--co-muted)]">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)]">
        <DateInput value={date} onChange={updateDate} required={required} disabled={disabled} ariaLabel={`${label} date`} />
        <TimeInput value={time} onChange={updateTime} required={required} disabled={disabled} ariaLabel={`${label} time`} />
      </div>
    </fieldset>
  );
}
