"use client";

import { useEffect, useState } from "react";
import { DEFAULT_WORKDAY_END_MINUTES, DEFAULT_WORKDAY_START_MINUTES } from "../../calendar/shared";

const DAYS: Array<[number, string]> = [
  [0, "Sun"],
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
];

const DEFAULT_CANCELLATION_POLICY = `Skip & Cancellation Fees: We truly value your time—and our team’s time too! While we’d much rather clean your home than charge a fee, last-minute changes do impact our techs’ schedules and income.

Our policy:
Less than 24 hours’ notice: 50% of your service rate will be charged. This goes directly to your tech to cover lost wages.
Same-day cancellations: 100% of your service fee will be charged.
Skip fees: If you cancel or skip a scheduled cleaning, a skip fee may be applied to your next “catch-up” cleaning to get your home back on track.
Recurring clients: Missing two consecutive cleanings means your next visit will be billed at the First-Time Cleaning rate.`;

function minutesToTimeInput(totalMinutes: number) {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function timeInputToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

export default function CalendarSettingsPage() {
  const [holidays, setHolidays] = useState("");
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [workdayHours, setWorkdayHours] = useState("8");
  const [workdayStart, setWorkdayStart] = useState(minutesToTimeInput(DEFAULT_WORKDAY_START_MINUTES));
  const [workdayEnd, setWorkdayEnd] = useState(minutesToTimeInput(DEFAULT_WORKDAY_END_MINUTES));
  const [cancellationPolicy, setCancellationPolicy] = useState(DEFAULT_CANCELLATION_POLICY);
  const [loading, setLoading] = useState(true);
  const [holidaysMessage, setHolidaysMessage] = useState("");
  const [workingDaysMessage, setWorkingDaysMessage] = useState("");
  const [workdayHoursMessage, setWorkdayHoursMessage] = useState("");
  const [workdayWindowMessage, setWorkdayWindowMessage] = useState("");
  const [cancellationPolicyMessage, setCancellationPolicyMessage] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return;
        setHolidays(Array.isArray(data.company.settings?.holidays) ? data.company.settings.holidays.join("\n") : "");
        setWorkingDays(
          Array.isArray(data.company.settings?.workingDays) ? data.company.settings.workingDays : [1, 2, 3, 4, 5],
        );
        setWorkdayHours(String(data.company.settings?.workdayHoursPerCleaner ?? 8));
        setWorkdayStart(
          minutesToTimeInput(
            Number.isInteger(data.company.settings?.workdayStartMinutes)
              ? data.company.settings.workdayStartMinutes
              : DEFAULT_WORKDAY_START_MINUTES,
          ),
        );
        setWorkdayEnd(
          minutesToTimeInput(
            Number.isInteger(data.company.settings?.workdayEndMinutes)
              ? data.company.settings.workdayEndMinutes
              : DEFAULT_WORKDAY_END_MINUTES,
          ),
        );
        setCancellationPolicy(typeof data.company.settings?.cancellationPolicy === "string" ? data.company.settings.cancellationPolicy : DEFAULT_CANCELLATION_POLICY);
      })
      .finally(() => setLoading(false));
  }, []);

  async function saveHolidays() {
    const values = [
      ...new Set(
        holidays
          .split(/\r?\n|,/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ].sort();
    if (values.some((value) => !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
      setHolidaysMessage("Enter holidays as YYYY-MM-DD, one date per line.");
      return;
    }
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holidays: values }),
    });
    setHolidaysMessage(response.ok ? "Calendar holidays saved." : "Could not save calendar holidays.");
  }

  async function saveWorkingDays() {
    if (!workingDays.length) {
      setWorkingDaysMessage("Select at least one working day.");
      return;
    }
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workingDays }),
    });
    setWorkingDaysMessage(response.ok ? "Calendar working days saved." : "Could not save calendar working days.");
  }

  async function saveWorkdayHours() {
    const hours = Number(workdayHours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      setWorkdayHoursMessage("Enter a number of hours between 0 and 24.");
      return;
    }
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workdayHoursPerCleaner: hours }),
    });
    setWorkdayHoursMessage(response.ok ? "Hours per cleaner saved." : "Could not save hours per cleaner.");
  }

  async function saveWorkdayWindow() {
    const startMinutes = timeInputToMinutes(workdayStart);
    const endMinutes = timeInputToMinutes(workdayEnd);
    if (startMinutes === null || endMinutes === null) {
      setWorkdayWindowMessage("Enter a valid start and end time.");
      return;
    }
    if (endMinutes <= startMinutes) {
      setWorkdayWindowMessage("Workday end must be after workday start.");
      return;
    }
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workdayStartMinutes: startMinutes, workdayEndMinutes: endMinutes }),
    });
    setWorkdayWindowMessage(response.ok ? "Working hours saved." : "Could not save working hours.");
  }

  async function saveCancellationPolicy() {
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancellationPolicy: cancellationPolicy.trim() }),
    });
    setCancellationPolicyMessage(response.ok ? "Cancellation policy saved." : "Could not save cancellation policy.");
  }

  if (loading) {
    return <div className="co-card p-8 text-sm text-[var(--co-muted)]">Loading calendar settings…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Calendar</p>
        <h1 className="page-title mt-2">Holidays & working days</h1>
        <p className="page-subtitle">
          Jobs remain visible for review, but dispatch capacity is marked closed on holidays. Week and Month views
          use working days for dispatch capacity.
        </p>
      </div>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
          <p className="eyebrow">Closures</p>
          <h2 className="mt-1 text-lg font-semibold">Company holidays</h2>
        </div>
        <div className="p-5">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Holiday dates</span>
            <textarea
              className="co-input min-h-32 w-full font-mono text-xs"
              value={holidays}
              onChange={(event) => setHolidays(event.target.value)}
              placeholder={"2026-01-01\n2026-12-25"}
            />
            <span className="mt-2 block text-xs leading-5 text-[var(--co-muted)]">
              One YYYY-MM-DD date per line. Leave empty if no closures are scheduled.
            </span>
          </label>
          <button onClick={saveHolidays} className="co-button-primary mt-5">
            Save holidays
          </button>
          {holidaysMessage ? <p className="mt-3 text-sm font-medium text-[var(--co-accent-text)]">{holidaysMessage}</p> : null}
        </div>
      </section>

      <section id="cancellation-policy" className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
          <p className="eyebrow">Client policy</p>
          <h2 className="mt-1 text-lg font-semibold">Skip & cancellation fees</h2>
          <p className="mt-1 text-sm text-[var(--co-muted)]">This copy is shown to the team when a recurring visit is skipped from Calendar.</p>
        </div>
        <div className="p-5">
          <textarea value={cancellationPolicy} onChange={(event) => setCancellationPolicy(event.target.value)} rows={10} className="co-input w-full resize-y text-sm leading-6" />
          <button onClick={saveCancellationPolicy} className="co-button-primary mt-5">Save cancellation policy</button>
          {cancellationPolicyMessage ? <p className="mt-3 text-sm font-medium text-[var(--co-accent-text)]">{cancellationPolicyMessage}</p> : null}
        </div>
      </section>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
          <p className="eyebrow">Dispatch capacity</p>
          <h2 className="mt-1 text-lg font-semibold">Working days</h2>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap gap-2">
            {DAYS.map(([value, label]) => (
              <label key={value} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={workingDays.includes(value)}
                  onChange={() =>
                    setWorkingDays((current) =>
                      current.includes(value) ? current.filter((day) => day !== value) : [...current, value].sort(),
                    )
                  }
                  className="h-4 w-4 accent-[var(--co-accent-fill)]"
                />
                {label}
              </label>
            ))}
          </div>
          <button onClick={saveWorkingDays} className="co-button-primary mt-5">
            Save working days
          </button>
          {workingDaysMessage ? (
            <p className="mt-3 text-sm font-medium text-[var(--co-accent-text)]">{workingDaysMessage}</p>
          ) : null}
        </div>
      </section>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
          <p className="eyebrow">Dispatch capacity</p>
          <h2 className="mt-1 text-lg font-semibold">Hours per cleaner</h2>
        </div>
        <div className="p-5">
          <label className="block max-w-xs text-sm">
            <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Hours per working day, per cleaner</span>
            <input
              type="number"
              step="0.5"
              min="0"
              max="24"
              className="co-input w-full"
              value={workdayHours}
              onChange={(event) => setWorkdayHours(event.target.value)}
            />
            <span className="mt-2 block text-xs leading-5 text-[var(--co-muted)]">
              Used on the scheduling calendar to show how many hours are free on a given day. Time off reduces this
              per cleaner, including half-days.
            </span>
          </label>
          <button onClick={saveWorkdayHours} className="co-button-primary mt-5">
            Save hours per cleaner
          </button>
          {workdayHoursMessage ? (
            <p className="mt-3 text-sm font-medium text-[var(--co-accent-text)]">{workdayHoursMessage}</p>
          ) : null}
        </div>
      </section>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
          <p className="eyebrow">Dispatch capacity</p>
          <h2 className="mt-1 text-lg font-semibold">Working hours</h2>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap gap-4">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Board starts at</span>
              <input
                type="time"
                className="co-input"
                value={workdayStart}
                onChange={(event) => setWorkdayStart(event.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Board ends at</span>
              <input
                type="time"
                className="co-input"
                value={workdayEnd}
                onChange={(event) => setWorkdayEnd(event.target.value)}
              />
            </label>
          </div>
          <span className="mt-2 block max-w-md text-xs leading-5 text-[var(--co-muted)]">
            The working range the dispatch board draws jobs against. Untimed jobs and hours outside this window
            aren&apos;t hidden, just kept off the hourly grid.
          </span>
          <button onClick={saveWorkdayWindow} className="co-button-primary mt-5">
            Save working hours
          </button>
          {workdayWindowMessage ? (
            <p className="mt-3 text-sm font-medium text-[var(--co-accent-text)]">{workdayWindowMessage}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
