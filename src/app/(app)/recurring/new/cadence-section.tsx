"use client";

import { DAYS, FREQUENCIES, FREQUENCY_LABELS, type SeriesFrequency } from "./constants";
import { DateInput } from "@/components/date-input";

/** Repeat pattern: how often, on which weekday, starting when.
 *
 * `monthly` hides the weekday picker because the generator anchors monthly
 * series to the start date's day-of-month and ignores `dayOfWeek` entirely —
 * showing a control that has no effect would be a lie. */
export default function CadenceSection({
  frequency,
  onFrequencyChange,
  intervalWeeks,
  onIntervalWeeksChange,
  dayOfWeek,
  onDayOfWeekChange,
  startDate,
  onStartDateChange,
}: {
  frequency: SeriesFrequency;
  onFrequencyChange: (frequency: SeriesFrequency) => void;
  intervalWeeks: number;
  onIntervalWeeksChange: (intervalWeeks: number) => void;
  dayOfWeek: number;
  onDayOfWeekChange: (dayOfWeek: number) => void;
  startDate: string;
  onStartDateChange: (startDate: string) => void;
}) {
  return (
    <section className="co-card p-5">
      <p className="eyebrow">Cadence</p>
      <h2 className="mt-1 text-lg font-semibold">How often should we visit?</h2>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {FREQUENCIES.map((entry) => (
          <label
            key={entry}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${
              frequency === entry ? "border-[var(--co-accent-text)] bg-[var(--co-surface-muted)]" : "border-[var(--co-line)]"
            }`}
          >
            <input
              type="radio"
              name="frequency"
              checked={frequency === entry}
              onChange={() => onFrequencyChange(entry)}
              className="accent-[#14211f]"
            />
            <span className="font-medium">{FREQUENCY_LABELS[entry]}</span>
          </label>
        ))}
      </div>

      {frequency !== "monthly" ? (
        <>
        {frequency === "custom" ? (
          <label className="mt-5 block text-sm">
            <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Repeat every</span>
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={52} step={1} className="co-input w-28" value={intervalWeeks} onChange={(event) => onIntervalWeeksChange(Number(event.target.value))} />
              <span className="text-sm text-[var(--co-muted)]">weeks</span>
            </div>
          </label>
        ) : null}
        <label className="mt-5 block text-sm">
          <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Preferred day</span>
          <select className="co-input w-full" value={dayOfWeek} onChange={(event) => onDayOfWeekChange(Number(event.target.value))}>
            {DAYS.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
        </label>
        </>
      ) : null}

      <DateInput label="First visit" className="mt-4" required value={startDate} onChange={onStartDateChange} />
    </section>
  );
}
