"use client";

import { useCallback, useEffect, useState } from "react";

type Request = { id: string; startDate: string; endDate: string; startPeriod: "full" | "morning" | "afternoon"; endPeriod: "full" | "morning" | "afternoon"; note: string | null; status: "pending" | "approved" | "denied" | "cancelled" };
const periodLabels = { full: "Full day", morning: "Morning", afternoon: "Afternoon" } as const;

export default function PendingPtoRequests({ employeeId }: { employeeId: string }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/employees/${employeeId}/pto-requests`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setRequests(data.requests ?? []);
  }, [employeeId]);
  useEffect(() => {
    // The request list is loaded from the API after the client mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function decide(id: string, decision: "approved" | "denied") {
    const response = await fetch(`/api/employees/${employeeId}/pto-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(data.error ?? "Request could not be updated."); return; }
    setMessage(`Request ${decision}.`);
    await load();
  }

  return <section className="co-card overflow-hidden"><div className="border-b border-[var(--co-line-soft)] px-5 py-4"><h2 className="text-sm font-semibold">Pending time-off requests</h2><p className="mt-1 text-xs text-[var(--co-muted)]">Approve requests to add them to the employee&apos;s PTO schedule.</p></div><div className="divide-y divide-[var(--co-line-soft)] px-5">{requests.length === 0 ? <p className="py-5 text-sm text-[var(--co-muted)]">No time-off requests yet.</p> : requests.map((request) => { const dates = request.startDate === request.endDate ? request.startDate : `${request.startDate} → ${request.endDate}`; const period = request.startDate === request.endDate ? periodLabels[request.startPeriod] : `${periodLabels[request.startPeriod]} → ${periodLabels[request.endPeriod]}`; return <div key={request.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">{dates} · {period}</p>{request.note ? <p className="mt-1 text-xs text-[var(--co-muted)]">{request.note}</p> : null}<p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">{request.status}</p></div>{request.status === "pending" ? <div className="flex gap-2"><button type="button" onClick={() => void decide(request.id, "denied")} className="co-button-secondary border-rose-200 px-3 py-2 text-xs text-rose-700">Deny</button><button type="button" onClick={() => void decide(request.id, "approved")} className="co-button-primary px-3 py-2 text-xs">Approve</button></div> : null}</div>; })}</div>{message ? <p className="border-t border-[var(--co-line-soft)] px-5 py-3 text-xs font-semibold text-[var(--co-evergreen)]">{message}</p> : null}</section>;
}
