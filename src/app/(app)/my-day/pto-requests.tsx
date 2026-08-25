"use client";

import { useCallback, useEffect, useState } from "react";
import { DateInput } from "@/components/date-input";

type PtoRequest = {
  id: string;
  startDate: string;
  endDate: string;
  startPeriod: "full" | "morning" | "afternoon";
  endPeriod: "full" | "morning" | "afternoon";
  note: string | null;
  status: "pending" | "approved" | "denied" | "cancelled";
};

const periodLabels = { full: "Full day", morning: "Morning", afternoon: "Afternoon" } as const;
const statusClasses = {
  pending: "co-badge-warning",
  approved: "co-badge-success",
  denied: "co-badge-danger",
  cancelled: "co-badge-neutral",
} as const;

function requestLabel(request: PtoRequest) {
  const dates = request.startDate === request.endDate ? request.startDate : `${request.startDate} → ${request.endDate}`;
  const period = request.startDate === request.endDate ? periodLabels[request.startPeriod] : `${periodLabels[request.startPeriod]} → ${periodLabels[request.endPeriod]}`;
  return `${dates} · ${period}`;
}

export default function PtoRequests() {
  const [requests, setRequests] = useState<PtoRequest[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startPeriod, setStartPeriod] = useState<PtoRequest["startPeriod"]>("full");
  const [endPeriod, setEndPeriod] = useState<PtoRequest["endPeriod"]>("full");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/pto-requests", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setRequests(data.requests ?? []);
  }, []);

  useEffect(() => {
    // The request list is loaded from the API after the client mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSaving(true);
    const response = await fetch("/api/pto-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startDate, endDate: endDate || startDate, startPeriod, endPeriod, note: note || null }) });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setMessage(data.error ?? "Time-off request could not be submitted."); return; }
    setStartDate(""); setEndDate(""); setStartPeriod("full"); setEndPeriod("full"); setNote("");
    setMessage("Request sent to your admin team.");
    await load();
  }

  async function cancel(id: string) {
    const response = await fetch(`/api/pto-requests/${id}`, { method: "DELETE" });
    if (!response.ok) { const data = await response.json().catch(() => ({})); setMessage(data.error ?? "Request could not be cancelled."); return; }
    await load();
  }

  return (
    <section className="co-card overflow-hidden">
      <div className="border-b border-[var(--co-line-soft)] px-4 py-4 sm:px-5">
        <p className="eyebrow">Time off</p>
        <h2 className="mt-1 type-field-title font-semibold text-[var(--co-ink)]">Request time off</h2>
      </div>
      <form onSubmit={submit} className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        <DateInput label="Start date" required value={startDate} onChange={setStartDate} />
        <DateInput label="End date" value={endDate} min={startDate} onChange={setEndDate} />
        <label className="type-field-meta font-semibold text-[var(--co-muted)]">Start period<select value={startPeriod} onChange={(event) => setStartPeriod(event.target.value as PtoRequest["startPeriod"])} className="co-input mt-1 w-full type-field-meta">{Object.entries(periodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="type-field-meta font-semibold text-[var(--co-muted)]">End period<select value={endPeriod} onChange={(event) => setEndPeriod(event.target.value as PtoRequest["endPeriod"])} className="co-input mt-1 w-full type-field-meta">{Object.entries(periodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="type-field-meta font-semibold text-[var(--co-muted)] sm:col-span-2">Note (optional)<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={240} rows={2} className="co-input mt-1 w-full resize-none type-field-meta" placeholder="Vacation, appointment, or other reason" /></label>
        <div className="flex items-center justify-between gap-3 sm:col-span-2"><p aria-live="polite" className="type-field-meta text-[var(--co-accent-text)]">{message}</p><button type="submit" disabled={saving || !startDate} className="co-button-primary shrink-0">{saving ? "Sending…" : "Send request"}</button></div>
      </form>
      <div className="border-t border-[var(--co-line-soft)] px-4 py-4 sm:px-5">
        <h3 className="type-field-meta font-semibold text-[var(--co-ink)]">Your requests</h3>
        <div className="mt-3 divide-y divide-[var(--co-line-soft)]">
          {requests.length === 0 ? <p className="py-3 type-field-meta text-[var(--co-muted)]">No time-off requests yet.</p> : requests.map((request) => (
            <div key={request.id} className="flex items-start justify-between gap-3 py-3 type-field-meta">
              <div><p className="font-medium text-[var(--co-ink)]">{requestLabel(request)}</p>{request.note ? <p className="mt-1 type-field-meta text-[var(--co-muted)]">{request.note}</p> : null}</div>
              <div className="flex shrink-0 flex-col items-end gap-1.5"><span className={`rounded-md border px-2 py-1 type-field-meta font-semibold uppercase tracking-[0.08em] ${statusClasses[request.status]}`}>{request.status}</span>{request.status === "pending" ? <button type="button" onClick={() => void cancel(request.id)} className="flex min-h-11 items-center px-2 type-field-meta font-semibold text-[var(--co-danger)] underline underline-offset-2">Cancel</button> : null}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
