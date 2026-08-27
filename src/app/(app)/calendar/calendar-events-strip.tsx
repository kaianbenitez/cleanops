"use client";

import { useCallback, useEffect, useState } from "react";
import { TimeInput } from "@/components/time-input";

type Employee = { id: string; firstName: string; lastName: string; isActive: boolean };
type Event = {
  id: string;
  title: string;
  scheduledDate: string;
  isAllDay: boolean;
  startTime: string | null;
  durationMinutes: number | null;
  employeeIds: string[];
};

export default function CalendarEventsStrip({ dayIso, employees }: { dayIso: string; employees: Employee[] }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/calendar-events?start=${dayIso}&end=${dayIso}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "We couldn't load internal events.");
      setEvents(Array.isArray(body.events) ? body.events : []);
      setError("");
    } catch {
      setError("We couldn't load internal events. Try again.");
    } finally {
      setLoading(false);
    }
  }, [dayIso]);

  // The async fetch resolves outside the effect; the state update belongs to that response.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function save() {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Add a title for this event.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/calendar-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: cleanTitle, scheduledDate: dayIso, isAllDay: allDay, startTime: allDay ? null : startTime, durationMinutes: allDay ? null : durationMinutes, employeeIds }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error?.formErrors?.[0] ?? "We couldn't add this event. Try again.");
        return;
      }
      setTitle("");
      setEmployeeIds([]);
      setOpen(false);
      await load();
    } catch {
      setError("We couldn't add this event. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-b border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/60 px-4 py-3" aria-busy={loading || saving}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          {loading ? <span className="type-admin-meta text-[var(--co-muted)]">Loading internal events…</span> : null}
          {!loading && events.map((event) => (
            <span key={event.id} title={event.title} className="co-badge-spark inline-flex min-w-0 max-w-full items-center rounded-md px-2 py-1 text-xs font-semibold"><span className="truncate">{event.isAllDay ? "All day" : event.startTime?.slice(0, 5)} · {event.title}</span></span>
          ))}
          {!loading && events.length === 0 && !error ? <span className="type-admin-meta text-[var(--co-muted)]">No internal events</span> : null}
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="co-button-secondary shrink-0 px-3 py-2 text-xs">{open ? "Close" : "Add event"}</button>
      </div>

      {error ? <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--co-danger)]" role="alert"><span>{error}</span>{!open ? <button type="button" onClick={() => void load()} className="min-h-11 px-1 font-semibold underline underline-offset-2">Try again</button> : null}</div> : null}

      {open ? (
        <form className="mt-3 grid gap-3 border-t border-[var(--co-line-soft)] pt-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <label className="text-xs font-semibold text-[var(--co-muted)]">Title<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className="co-input mt-1 w-full" placeholder="Training, meeting, reminder" /></label>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} />All day</label>
          {!allDay ? <><TimeInput label="Start" value={startTime} onChange={setStartTime} /><label className="text-xs font-semibold text-[var(--co-muted)]">Duration<select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="co-input mt-1 w-full"><option value={30}>30 min</option><option value={60}>1 hour</option><option value={120}>2 hours</option></select></label></> : null}
          <fieldset className="sm:col-span-2"><legend className="text-xs font-semibold text-[var(--co-muted)]">Employees</legend><div className="mt-1 flex flex-wrap gap-2">{employees.filter((employee) => employee.isActive).map((employee) => <label key={employee.id} className="flex items-center gap-1 break-words text-xs"><input type="checkbox" checked={employeeIds.includes(employee.id)} onChange={() => setEmployeeIds((current) => current.includes(employee.id) ? current.filter((id) => id !== employee.id) : [...current, employee.id])} />{employee.firstName}</label>)}</div></fieldset>
          <button className="co-button-primary justify-center sm:col-span-2 disabled:cursor-wait disabled:opacity-60" type="submit" disabled={saving}>{saving ? "Saving…" : "Save event"}</button>
        </form>
      ) : null}
    </div>
  );
}
