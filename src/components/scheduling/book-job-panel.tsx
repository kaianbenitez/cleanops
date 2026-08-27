"use client";

import { useState } from "react";
import { DateInput } from "@/components/date-input";

type Recommendation = { date: string; arrivalWindowStartTime: string; arrivalWindowEndTime: string; employeeIds: string[]; employeeNames: string[]; crewSize: number; totalJthMinutes: number; expectedWallClockMinutes: number; expectedFinishTime: string; explanations: string[]; warnings: string[] };
type Employee = { id: string; firstName: string; lastName: string };
type Props = { quoteId: string; quoteStatus: string; serviceType: string; customerName: string; address: string; serviceLabel: string; priceLabel: string; branchName: string; totalJthMinutes: number | null; onBooked: (redirectTo: string) => void };

function displayTime(value: string) { const [hour, minute] = value.slice(0, 5).split(":").map(Number); return `${((hour + 11) % 12) + 1}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`; }
function displayDate(value: string) { return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`)); }
function duration(minutes: number) { const hours = Math.floor(minutes / 60); return `${hours ? `${hours} hour${hours === 1 ? "" : "s"}` : ""}${hours && minutes % 60 ? " " : ""}${minutes % 60 ? `${minutes % 60} min` : ""}`; }

/** A focused, shared booking surface: it is intentionally small enough to be
 * embedded in quote detail or quote creation without teaching Calendar first. */
export function BookJobPanel(props: Props) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]); const [employees, setEmployees] = useState<Employee[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [selected, setSelected] = useState<Recommendation | null>(null); const [manual, setManual] = useState(false); const [date, setDate] = useState(""); const [windowKey, setWindowKey] = useState<"morning" | "afternoon">("morning"); const [crew, setCrew] = useState<string[]>([]); const [agreedByPhone, setAgreedByPhone] = useState(props.quoteStatus !== "accepted"); const [agreementNote, setAgreementNote] = useState("");
  async function checkAvailability() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/scheduling/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quoteId: props.quoteId, serviceType: props.serviceType }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return setError(body.error ?? "Availability could not be checked.");
      setRecommendations(body.recommendations ?? []);
      setEmployees(body.eligibleEmployees ?? []);
    } catch (cause) {
      console.error("Guided booking availability check failed", cause);
      setError("Availability could not be checked. Please try again.");
    } finally {
      setLoading(false);
    }
  }
  const manualStart = windowKey === "morning" ? "09:00:00" : "13:00:00"; const manualEnd = windowKey === "morning" ? "09:30:00" : "13:30:00";
  async function confirm() { const selection = selected ?? (manual && date ? { date, arrivalWindowStartTime: manualStart, arrivalWindowEndTime: manualEnd, employeeIds: crew } : null); if (!selection) return setError("Choose a recommendation or complete the manual schedule."); setLoading(true); setError(""); const response = await fetch(`/api/quotes/${props.quoteId}/convert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startDate: selection.date, arrivalWindowStartTime: selection.arrivalWindowStartTime, arrivalWindowEndTime: selection.arrivalWindowEndTime, employeeIds: selection.employeeIds, serviceType: props.serviceType, customerAgreedByPhone: agreedByPhone || undefined, agreementNote: agreedByPhone ? agreementNote : undefined }) }); const body = await response.json().catch(() => ({})); setLoading(false); if (!response.ok) return setError(body.error ?? "Booking could not be confirmed."); props.onBooked(body.redirectTo); }
  const review = selected ?? (manual && date ? { date, arrivalWindowStartTime: manualStart, arrivalWindowEndTime: manualEnd, employeeIds: crew, employeeNames: crew.map((id) => employees.find((employee) => employee.id === id)).filter(Boolean).map((employee) => `${employee!.firstName} ${employee!.lastName}`), expectedWallClockMinutes: props.totalJthMinutes ? Math.ceil(props.totalJthMinutes / Math.max(crew.length, 1)) : 0 } : null);
  return <section className="co-card overflow-hidden" aria-label="Book job">
    <div className="border-b border-[var(--co-line-soft)] px-5 py-4"><p className="eyebrow">Guided booking</p><h2 className="type-admin-title mt-1 font-semibold">Book this job</h2><p className="type-admin-meta mt-1 text-[var(--co-muted)]">Choose a complete date, arrival window, and crew before confirming.</p></div>
    <div className="space-y-5 p-5"><div className="grid gap-2 rounded-[var(--co-radius-control)] bg-[var(--co-surface-muted)] p-3 type-admin-meta"><p><strong>{props.customerName}</strong>{props.address ? ` · ${props.address}` : ""}</p><p>{props.serviceLabel} · {props.priceLabel} · {props.totalJthMinutes != null ? `${(props.totalJthMinutes / 60).toFixed(1)} total JTH` : "JTH pending"} · {props.branchName || "Branch not recorded"}</p></div>
      {props.quoteStatus !== "accepted" ? <label className="block rounded-[var(--co-radius-control)] border border-[var(--co-warning)]/30 p-3 type-admin-meta"><span className="flex gap-2"><input type="checkbox" checked={agreedByPhone} onChange={(event) => setAgreedByPhone(event.target.checked)} /><span><strong>Customer agreed by phone</strong><br />Record this before booking an unsigned quote.</span></span>{agreedByPhone ? <input className="co-input mt-3 w-full" value={agreementNote} onChange={(event) => setAgreementNote(event.target.value)} placeholder="Brief call note" /> : null}</label> : <p className="co-badge-info p-3 type-admin-meta">Accepted — needs scheduling. Call the customer to confirm one of these choices.</p>}
      {recommendations.length === 0 ? <button type="button" className="co-button-primary w-full" onClick={checkAvailability} disabled={loading}>{loading ? "Checking availability…" : "Check availability"}</button> : <div className="space-y-2"><p className="type-admin-body font-semibold">Recommended schedules</p>{recommendations.map((item) => <button type="button" key={`${item.date}-${item.arrivalWindowStartTime}`} onClick={() => { setSelected(item); setManual(false); }} className={`w-full rounded-[var(--co-radius-control)] border p-3 text-left type-admin-meta ${selected === item ? "border-[var(--co-accent-fill)] bg-[var(--co-accent-tint)]" : "border-[var(--co-line)]"}`}><strong>{displayDate(item.date)} · {displayTime(item.arrivalWindowStartTime)}–{displayTime(item.arrivalWindowEndTime)}</strong><br />{item.employeeNames.join(" + ")} · about {duration(item.expectedWallClockMinutes)} onsite.<span className="mt-1 block text-[var(--co-muted)]">{item.explanations[0]}</span></button>)}</div>}
      {recommendations.length ? <div><button type="button" className="co-button-secondary" onClick={() => { setManual(!manual); setSelected(null); }}>Pick manually</button>{manual ? <div className="mt-3 grid gap-3 rounded-[var(--co-radius-control)] border border-[var(--co-line-soft)] p-3 type-admin-meta"><DateInput label="Date" value={date} onChange={setDate} /><select className="co-input" value={windowKey} onChange={(event) => setWindowKey(event.target.value as "morning" | "afternoon")}><option value="morning">Morning · 9:00–9:30 AM</option><option value="afternoon">Afternoon · 1:00–1:30 PM</option></select><div className="grid gap-2">{employees.map((employee) => <label key={employee.id} className="flex gap-2"><input type="checkbox" checked={crew.includes(employee.id)} onChange={() => setCrew((current) => current.includes(employee.id) ? current.filter((id) => id !== employee.id) : current.length < 3 ? [...current, employee.id] : current)} />{employee.firstName} {employee.lastName}</label>)}</div></div> : null}</div> : null}
      {review ? <p className="rounded-[var(--co-radius-control)] bg-[var(--co-surface-muted)] p-3 type-admin-meta"><strong>Review:</strong> {displayDate(review.date)} · {displayTime(review.arrivalWindowStartTime)}–{displayTime(review.arrivalWindowEndTime)} arrival · {review.employeeNames.join(" + ") || "crew not selected"} · about {duration(review.expectedWallClockMinutes)} onsite.</p> : null}
      {error ? <p role="alert" className="co-badge-danger p-3 type-admin-meta">{error}</p> : null}
      {(selected || manual) ? <button type="button" className="co-button-primary w-full" onClick={confirm} disabled={loading || (agreedByPhone && !agreementNote.trim())}>{loading ? "Confirming…" : "Confirm booking"}</button> : null}
    </div>
  </section>;
}
