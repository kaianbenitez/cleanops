"use client";

import { useEffect, useState } from "react";
import { DateInput } from "@/components/date-input";

type Note = { id: string; note: string; reportDate: string; createdAt: string; authorFirstName: string; authorLastName: string };

export default function ReportNotes({ employeeId }: { employeeId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const reportDate = `${reportMonth}-01`;
  async function load() {
    const response = await fetch(`/api/employees/${employeeId}/report-notes`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (response.ok) setNotes(body.notes ?? []);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() updates state only after the API response resolves.
  useEffect(() => { void load(); }, [employeeId]);
  async function save() {
    if (!note.trim()) return;
    setSaving(true); setError("");
    const response = await fetch(`/api/employees/${employeeId}/report-notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note, reportDate }) });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return setError(body.error?.formErrors?.[0] ?? "Could not save this note.");
    setNote(""); await load();
  }
  return <section className="co-card p-5"><h2 className="text-sm font-semibold">Monthly report notes</h2><p className="mt-1 text-xs text-[var(--co-muted)]">Saved with today&apos;s date and kept as history.</p><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Add a manager note…" className="co-input mt-4 w-full resize-y" /><div className="mt-3 flex items-end justify-between gap-3"><DateInput label="Report month" required value={`${reportMonth}-01`} onChange={(value) => setReportMonth(value.slice(0, 7))} displayMode="month" className="w-52" /><button type="button" disabled={saving || !note.trim()} onClick={() => void save()} className="co-button-primary px-3 py-2 text-xs">{saving ? "Saving…" : "Save note"}</button></div>{error ? <p role="alert" className="mt-2 text-xs text-[var(--co-danger)]">{error}</p> : null}<div className="mt-4 divide-y divide-[var(--co-line-soft)] border-t border-[var(--co-line-soft)]">{notes.length ? notes.map((entry) => <article key={entry.id} className="py-3"><div className="flex justify-between gap-3 text-xs text-[var(--co-muted)]"><span>{entry.authorFirstName} {entry.authorLastName}</span><time>{entry.reportDate}</time></div><p className="mt-1 whitespace-pre-wrap text-sm text-[var(--co-ink)]">{entry.note}</p></article>) : <p className="py-3 text-sm text-[var(--co-muted)]">No report notes yet.</p>}</div></section>;
}
