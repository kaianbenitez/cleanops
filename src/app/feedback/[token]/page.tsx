"use client";

import { use, useEffect, useState } from "react";

type FeedbackData = { customerFirstName: string; companyName: string; jobDate: string; status: string; invoiceUrl: string | null };

export default function FeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<FeedbackData | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetch(`/api/public/feedback/${token}`).then((res) => res.ok ? res.json() : Promise.reject()).then(setData).catch(() => setError("This feedback link is unavailable or expired.")); }, [token]);
  async function submit() {
    if (!rating) return setError("Please choose a rating.");
    setBusy(true); setError(null);
    const res = await fetch(`/api/public/feedback/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qualityRating: rating, qualityComment: comment.trim() || undefined }) });
    const body = await res.json().catch(() => ({})); setBusy(false);
    if (!res.ok) return setError(typeof body.error === "string" ? body.error : "Could not save feedback.");
    setDone(true); if (body.invoiceUrl) window.setTimeout(() => window.location.assign(body.invoiceUrl), 700);
  }

  return <main className="min-h-[100dvh] bg-[var(--co-surface-muted)] px-4 py-10"><div className="mx-auto max-w-lg rounded-[28px] border border-[var(--co-line-soft)] bg-[var(--co-surface)] p-6 shadow-sm sm:p-8"><p className="eyebrow">{data?.companyName ?? "Service feedback"}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">How did we do{data?.customerFirstName ? `, ${data.customerFirstName}` : ""}?</h1>{error ? <p className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}{done ? <div className="mt-8 text-center"><p className="text-xl font-semibold text-[var(--co-accent-text)]">Thank you for your feedback.</p><p className="mt-2 text-sm text-[var(--co-muted)]">{data?.invoiceUrl ? "Taking you to Square, where you can pay your invoice and add a tip." : "Your response has been sent to the team."}</p></div> : <div className="mt-8 space-y-5"><div><p className="text-sm font-medium">Rate your cleaning</p><div className="mt-3 flex gap-2">{[1,2,3,4,5].map((n) => <button key={n} type="button" onClick={() => setRating(n)} className={`h-12 w-12 rounded-full border text-lg font-semibold ${rating === n ? "border-[var(--co-accent-text)] bg-[var(--co-accent-tint)] text-[var(--co-accent-text)]" : "border-[var(--co-line)]"}`}>{n}</button>)}</div></div><label className="block text-sm font-medium">Anything you would like us to know?<textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} className="co-input mt-2 w-full resize-none" /></label><button type="button" onClick={submit} disabled={busy || !data} className="co-button-primary w-full justify-center">{busy ? "Saving…" : data?.invoiceUrl ? "Submit & continue to payment" : "Submit feedback"}</button></div>}</div></main>;
}
