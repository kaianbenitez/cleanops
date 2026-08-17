"use client";

import { useCallback, useEffect, useState } from "react";

export type EmployeePto = {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  startPeriod: "full" | "morning" | "afternoon";
  endPeriod: "full" | "morning" | "afternoon";
  note: string | null;
};

const periodLabels = { full: "Full day", morning: "Morning", afternoon: "Afternoon" } as const;

export default function PtoEditor({ employeeId, onChange }: { employeeId: string; onChange?: (pto: EmployeePto[]) => void }) {
  const [pto, setPto] = useState<EmployeePto[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startPeriod, setStartPeriod] = useState<EmployeePto["startPeriod"]>("full");
  const [endPeriod, setEndPeriod] = useState<EmployeePto["endPeriod"]>("full");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/employees/${employeeId}/pto`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      setPto(data.pto ?? []);
      onChange?.(data.pto ?? []);
    }
  }, [employeeId, onChange]);

  useEffect(() => {
    // The profile owns the initial data fetch lifecycle; this component refreshes
    // its own list when a PTO mutation completes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function addPto(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSaving(true);
    const response = await fetch(`/api/employees/${employeeId}/pto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate: endDate || startDate, startPeriod, endPeriod, note: note || null }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(data.error ?? "PTO could not be saved.");
      return;
    }
    setStartDate("");
    setEndDate("");
    setStartPeriod("full");
    setEndPeriod("full");
    setNote("");
    setOpen(false);
    setMessage("PTO added.");
    await load();
  }

  async function removePto(id: string) {
    const response = await fetch(`/api/employees/${employeeId}/pto/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(data.error ?? "PTO could not be removed.");
      return;
    }
    await load();
  }

  return (
    <div className="mt-5 border-t border-[var(--co-line-soft)] pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--co-ink)]">Time off</p>
          <p className="mt-1 text-xs text-[var(--co-muted)]">Time off blocks new assignments and appears in this week’s preview.</p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="co-button-secondary px-3 py-2 text-xs">
          {open ? "Close" : "Set time off"}
        </button>
      </div>

      {pto.length > 0 ? (
        <div className="mt-3 space-y-2">
          {pto.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--co-surface-muted)] px-3 py-2 text-xs">
              <div>
                <span className="font-semibold text-[var(--co-ink)]">{entry.startDate === entry.endDate ? entry.startDate : `${entry.startDate} → ${entry.endDate}`}</span>
                <span className="ml-2 text-[var(--co-muted)]">{entry.startDate === entry.endDate ? periodLabels[entry.startPeriod] : `${periodLabels[entry.startPeriod]} → ${periodLabels[entry.endPeriod]}`}</span>
                {entry.note ? <span className="ml-2 text-[var(--co-muted)]">· {entry.note}</span> : null}
              </div>
              <button type="button" onClick={() => void removePto(entry.id)} className="font-semibold text-rose-600 hover:underline">Remove</button>
            </div>
          ))}
        </div>
      ) : null}

      {open ? (
        <form onSubmit={addPto} className="mt-4 grid gap-3 rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface)] p-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[var(--co-muted)]">Start date<input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="co-input mt-1 w-full text-sm" /></label>
          <label className="text-xs font-semibold text-[var(--co-muted)]">End date<input required type="date" value={endDate || startDate} onChange={(event) => setEndDate(event.target.value)} className="co-input mt-1 w-full text-sm" /></label>
          <label className="text-xs font-semibold text-[var(--co-muted)]">Start period<select value={startPeriod} onChange={(event) => setStartPeriod(event.target.value as EmployeePto["startPeriod"])} className="co-input mt-1 w-full text-sm">{Object.entries(periodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-xs font-semibold text-[var(--co-muted)]">End period<select value={endPeriod} onChange={(event) => setEndPeriod(event.target.value as EmployeePto["endPeriod"])} className="co-input mt-1 w-full text-sm">{Object.entries(periodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-xs font-semibold text-[var(--co-muted)] sm:col-span-2">Note (optional)<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Vacation, appointment, training…" className="co-input mt-1 w-full text-sm" /></label>
          <div className="flex items-center justify-between gap-3 sm:col-span-2"><span className="text-xs text-rose-600">{message}</span><button disabled={saving || !startDate} type="submit" className="co-button-primary px-4 py-2 text-xs">{saving ? "Saving…" : "Save time off"}</button></div>
        </form>
      ) : null}
      {!open && message ? <p className="mt-2 text-xs text-[var(--co-accent-text)]">{message}</p> : null}
    </div>
  );
}
