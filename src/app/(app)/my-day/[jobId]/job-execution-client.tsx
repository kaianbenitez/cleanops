"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { dateLabel, formatElapsed, formatEstimatedTime, groupNotes, jobAddress, jobTypeLabel, PAYMENT_METHOD_OPTIONS, timeLabel } from "@/lib/my-day/job-format";
import { cleanNoteText } from "@/lib/format";
import { MaskedCode } from "@/components/ui/masked-code";
import { Cat, CircleAlert, Sparkles, Send } from "lucide-react";

type Job = {
  jobId: string;
  customerId: string;
  role: "lead" | "helper" | "trainer";
  status: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  type: string;
  estimatedDurationMinutes: number | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  customerFirstName: string;
  customerLastName: string;
  customerPhone: string | null;
  accessInstructions: string | null;
  keyNumber: string | null;
  garageCode: string | null;
  gateCode: string | null;
  alarmCode: string | null;
  vacuumLocation: string | null;
  mopHeadsNeeded: string | null;
  trashBags: string | null;
  generalNotes?: string | null;
  doNotClean?: string | null;
  petNotes?: string | null;
  importantToCustomer?: string | null;
  preferredDays?: string[] | null;
  preferredTimeOfDay?: string | null;
  subdivision: string | null;
};

type TimeEntry = { clockIn: string; clockOut: string | null } | null;

type Photo = { id: string; slot: "before" | "after" | "extra"; url: string | null; caption: string | null };

type Coworker = { firstName: string; lastName: string; done: boolean };

const OFFLINE_ERROR = "Couldn't reach the office — check your signal and try again.";

const DOWNSCALE_MAX_EDGE = 1600;
const DOWNSCALE_QUALITY = 0.8;

/** Shrinks a photo to ~1600px on its long edge before upload — modern phone
 * cameras routinely produce files over the server's 5 MB cap, with no way
 * for the employee to shrink one from the field. Falls back to the original
 * file untouched if the browser can't decode it (e.g. HEIC). */
async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, DOWNSCALE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale >= 1) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", DOWNSCALE_QUALITY));
  if (!blob) return file;
  const name = file.name.replace(/\.\w+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

function formatNameList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export default function JobExecutionClient({
  job,
  timeEntry,
  officePhone,
  companyTimezone,
  coworkers,
}: {
  job: Job;
  timeEntry: TimeEntry;
  officePhone: string | null;
  companyTimezone: string;
  coworkers: Coworker[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSlotRef = useRef<"before" | "after" | "extra">("before");
  const [now, setNow] = useState(0);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [completing, setCompleting] = useState(false);
  // "My part done" (this employee clocked out) is not the same as the job
  // itself finishing — a multi-cleaner job only completes once every
  // assignee has clocked out. Conflating these previously showed a plain
  // "Job completed" screen to whoever finished first, even while a
  // coworker was still on-site.
  const [myPortionDone, setMyPortionDone] = useState(Boolean(timeEntry?.clockOut));
  const [jobFullyCompleted, setJobFullyCompleted] = useState(job.status === "completed");
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [cleanerNotes, setCleanerNotes] = useState("");
  const [feedbackUrl, setFeedbackUrl] = useState<string | null>(null);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [clockingIn, setClockingIn] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    fetch(`/api/jobs/${job.jobId}/photos`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => setPhotos(body.photos ?? []))
      .catch(() => {
        setPhotos([]);
        setError("Couldn't load photos already on this job — check your signal and try refreshing.");
      });
  }, [job.jobId]);

  const started = Boolean(timeEntry);
  const elapsed = timeEntry ? formatElapsed(timeEntry.clockIn, timeEntry.clockOut ? new Date(timeEntry.clockOut).getTime() : now) : "00:00";
  const address = jobAddress(job) || "Address not set";
  const notes = groupNotes(job);
  const clientNote = cleanNoteText(job.generalNotes);
  const instructions = [
    job.doNotClean ? { label: "Do not clean", value: cleanNoteText(job.doNotClean), icon: CircleAlert, tone: "border-rose-200 bg-rose-50 text-rose-800" } : null,
    job.petNotes ? { label: "Pets", value: cleanNoteText(job.petNotes), icon: Cat, tone: "border-amber-200 bg-amber-50 text-amber-900" } : null,
    job.importantToCustomer ? { label: "Important", value: cleanNoteText(job.importantToCustomer), icon: Sparkles, tone: "border-violet-200 bg-violet-50 text-violet-900" } : null,
  ].filter(Boolean) as Array<{ label: string; value: string; icon: typeof CircleAlert; tone: string }>;
  const beforePhotos = photos.filter((photo) => photo.slot === "before");
  const afterPhotos = photos.filter((photo) => photo.slot === "after");
  const extraPhotos = photos.filter((photo) => photo.slot === "extra");

  const waitingOnCoworkers = coworkers.filter((coworker) => !coworker.done);
  const waitingOnLabel = waitingOnCoworkers.length ? formatNameList(waitingOnCoworkers.map((coworker) => coworker.firstName)) : "the rest of the crew";

  const statusLabel = useMemo(() => {
    if (jobFullyCompleted) return "Completed";
    if (myPortionDone) return "Awaiting teammate";
    if (started) return "Active job";
    return "Scheduled";
  }, [jobFullyCompleted, myPortionDone, started]);

  function openUpload(slot: "before" | "after" | "extra") {
    pendingSlotRef.current = slot;
    fileInputRef.current?.click();
  }

  async function handleFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const slot = pendingSlotRef.current;
    setError(null);
    setUploading(true);
    try {
      const uploadFile = await downscaleImage(file);
      const body = new FormData();
      body.set("photo", uploadFile);
      body.set("slot", slot);
      const response = await fetch(`/api/jobs/${job.jobId}/photos`, { method: "POST", body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof result.error === "string" ? result.error : "Could not upload photo.");
        return;
      }
      setPhotos((current) => [result.photo, ...current]);
    } catch {
      setError(OFFLINE_ERROR);
    } finally {
      setUploading(false);
    }
  }

  async function clockIn() {
    setError(null);
    setClockingIn(true);
    try {
      const res = await fetch(`/api/jobs/${job.jobId}/clock-in`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not clock in.");
        return;
      }
      router.refresh();
    } catch {
      setError(OFFLINE_ERROR);
    } finally {
      setClockingIn(false);
    }
  }

  async function completeJob() {
    setError(null);
    setCompleting(true);
    try {
      const res = await fetch(`/api/jobs/${job.jobId}/clock-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethodCollected: paymentMethod || undefined,
          checkNumberCollected: paymentMethod === "check" ? checkNumber.trim() || undefined : undefined,
          cleanerNotes: cleanerNotes.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not complete this job.");
        return;
      }
      setMyPortionDone(true);
      setJobFullyCompleted(Boolean(body.jobCompleted));
      if (body.jobCompleted) await requestCustomerFeedback();
    } catch {
      setError(OFFLINE_ERROR);
    } finally {
      setCompleting(false);
    }
  }

  async function requestCustomerFeedback() {
    setSendingFeedback(true);
    try {
      const response = await fetch(`/api/jobs/${job.jobId}/feedback-link`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not create feedback link.");
        return;
      }
      setFeedbackUrl(body.feedbackUrl ?? null);
    } catch {
      setError(OFFLINE_ERROR);
    } finally {
      setSendingFeedback(false);
    }
  }

  return (
    <div className="mx-auto max-w-[720px] pb-32">
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChosen} />

      <div className="mb-4">
        <Link href="/my-day" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--co-muted)] hover:text-[var(--co-ink)]">
          ← Back to My day
        </Link>
      </div>

      <section className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  jobFullyCompleted
                    ? "co-badge-success"
                    : myPortionDone
                      ? "co-badge-warning"
                      : started
                        ? "bg-[var(--co-evergreen)] text-white"
                        : "bg-[var(--co-surface-muted)] text-[var(--co-muted)]"
                }`}
              >
                {statusLabel}
              </span>
              <span className="font-mono text-[10px] text-[var(--co-faint)]">ID: #{job.jobId.slice(0, 8).toUpperCase()}</span>
            </div>
            <h1 className="page-title !text-2xl">{address}</h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-[var(--co-muted)]">
              {started ? (
                <>Started at {timeLabel(timeEntry!.clockIn)} · {elapsed} elapsed</>
              ) : (
                <>Scheduled {dateLabel(job.scheduledDate, companyTimezone)} · {timeLabel(job.scheduledStartTime)}</>
              )}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noreferrer"
              className="co-button-secondary"
            >
              View map
            </a>
            <a href={officePhone ? `tel:${officePhone}` : undefined} className={`co-button-secondary ${officePhone ? "" : "pointer-events-none opacity-50"}`}>
              Contact support
            </a>
          </div>
        </div>
      </section>

      {error ? (
        <p role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {!started ? (
        <section className="co-card p-5">
          <p className="text-sm text-[var(--co-muted)]">Previewing this job before departure. Review the address and entry details, then return to My Day when you&apos;re ready to head out.</p>
          <button type="button" onClick={clockIn} disabled={clockingIn} className="co-button-primary mt-4">
            {clockingIn ? "Clocking in…" : "Clock in when you arrive"}
          </button>
        </section>
      ) : null}

      <div className="space-y-4">
          <section className="co-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--co-ink)]">Service details</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--co-line-soft)] py-2">
                <span className="text-sm text-[var(--co-muted)]">Service type</span>
                <span className="text-sm font-semibold text-[var(--co-ink)]">{jobTypeLabel(job.type)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-[var(--co-line-soft)] py-2">
                <span className="text-sm text-[var(--co-muted)]">Role</span>
                <span className="text-sm font-semibold text-[var(--co-ink)]">{job.role === "lead" ? "Lead / driver" : "Helper"}</span>
              </div>
              {job.estimatedDurationMinutes ? (
                <div className="flex items-center justify-between border-b border-[var(--co-line-soft)] py-2">
                  <span className="text-sm text-[var(--co-muted)]">Est. duration</span>
                  <span className="text-sm font-semibold text-[var(--co-ink)]">{formatEstimatedTime(job.estimatedDurationMinutes)}</span>
                </div>
              ) : null}
              {job.keyNumber || job.garageCode || job.gateCode || job.alarmCode ? (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-[var(--co-muted)]">Access</span>
                  <MaskedCode>
                    {[job.keyNumber && `Key #${job.keyNumber}`, job.garageCode && `Garage ${job.garageCode}`, job.gateCode && `Gate ${job.gateCode}`, job.alarmCode && `Alarm ${job.alarmCode}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </MaskedCode>
                </div>
              ) : null}
              {job.customerPhone ? (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-[var(--co-muted)]">Customer</span>
                  <a href={`tel:${job.customerPhone}`} className="text-sm font-semibold text-[var(--co-evergreen)]">
                    {job.customerFirstName} {job.customerLastName} · {job.customerPhone}
                  </a>
                </div>
              ) : null}
            </div>

            {clientNote ? (
              <div className="mt-4 rounded-lg bg-[var(--co-accent-tint)] p-4">
                <p className="mb-1 text-xs font-bold uppercase tracking-tight text-[var(--co-evergreen)]">Client notes</p>
                <p className="whitespace-pre-line text-sm text-[var(--co-ink)]">{clientNote}</p>
              </div>
            ) : null}

            {instructions.length ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {instructions.map((instruction) => {
                  const Icon = instruction.icon;
                  return <section key={instruction.label} className={`rounded-lg border p-3 ${instruction.tone}`}><div className="flex items-center gap-2 text-xs font-bold"><Icon className="h-4 w-4" />{instruction.label}</div><p className="mt-2 whitespace-pre-line text-sm leading-5">{instruction.value}</p></section>;
                })}
              </div>
            ) : null}

            {notes.length > 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {notes.map((note) => (
                  <div key={note} className="whitespace-pre-line rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-3 py-2 text-xs leading-5 text-[var(--co-ink)]">
                    {note}
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          {started && !myPortionDone ? (
            <>
              <section className="co-card p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-[var(--co-ink)]">Photo evidence</h2>
                  <button type="button" onClick={() => openUpload("extra")} disabled={uploading} className="co-button-primary px-4 py-2 text-xs">
                    {uploading ? "Uploading…" : "Upload photo"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(["before", "after"] as const).map((slot) => {
                    const slotPhotos = slot === "before" ? beforePhotos : afterPhotos;
                    const photo = slotPhotos[0];
                    return (
                      <div key={slot} className="flex flex-col gap-2">
                        {photo ? (
                          <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--co-line-soft)]">
                            {photo.url ? <img src={photo.url} alt={`${slot} photo`} className="h-full w-full object-cover" /> : null}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openUpload(slot)}
                            disabled={uploading}
                            className="relative flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-[var(--co-line)] bg-[var(--co-surface-muted)] text-[var(--co-faint)] hover:border-[var(--co-evergreen)] hover:text-[var(--co-evergreen)] disabled:opacity-60"
                          >
                            <span className="text-3xl">+</span>
                            <span className="absolute bottom-2 left-2 rounded bg-[var(--co-ink)]/70 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Required</span>
                          </button>
                        )}
                        <span className="text-center text-xs font-medium text-[var(--co-muted)]">{slot === "before" ? "Before" : "After"}</span>
                      </div>
                    );
                  })}
                  {extraPhotos.map((photo) => (
                    <div key={photo.id} className="flex flex-col gap-2">
                      <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--co-line-soft)]">
                        {photo.url ? <img src={photo.url} alt="Additional evidence" className="h-full w-full object-cover" /> : null}
                      </div>
                      <span className="text-center text-xs font-medium text-[var(--co-muted)]">Additional</span>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => openUpload("extra")}
                    disabled={uploading}
                    className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] text-[var(--co-faint)] hover:text-[var(--co-evergreen)] disabled:opacity-60"
                  >
                    <span className="text-2xl">+</span>
                    <span className="px-4 text-center text-[10px] font-bold uppercase">Add more photos</span>
                  </button>
                </div>
                <p className="mt-3 text-xs text-[var(--co-faint)]">Photos are securely saved to this job for office review.</p>
              </section>

              <section className="co-card p-5">
                <h2 className="mb-4 text-base font-semibold text-[var(--co-ink)]">Close out</h2>
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] p-4">
                    <div className="flex items-start gap-3">
                      <Send className="mt-0.5 h-5 w-5 shrink-0 text-[var(--co-evergreen)]" />
                      <div>
                        <p className="font-semibold text-[var(--co-ink)]">Customer feedback link</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--co-muted)]">Send the customer a private link. They submit their own rating, feedback, tip, and payment.</p>
                      </div>
                    </div>
                    {feedbackUrl ? <div className="mt-4 rounded-xl border border-[var(--co-line)] bg-[var(--co-surface)] p-3"><p className="text-xs font-semibold text-[var(--co-evergreen)]">Link ready — share it with the customer:</p><input readOnly value={feedbackUrl} className="co-input mt-2 w-full text-xs" onFocus={(event) => event.currentTarget.select()} /></div> : <button type="button" onClick={requestCustomerFeedback} disabled={sendingFeedback} className="co-button-secondary mt-4 w-full justify-center">{sendingFeedback ? "Creating link…" : "Create customer link"}</button>}
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-sm text-[var(--co-muted)]">Payment collected on-site</span>
                    <select
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value)}
                      className="co-input w-full"
                    >
                      <option value="">Select…</option>
                      {PAYMENT_METHOD_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {paymentMethod === "check" ? (
                    <label className="block">
                      <span className="mb-1 block text-sm text-[var(--co-muted)]">Check number</span>
                      <input
                        type="text"
                        value={checkNumber}
                        onChange={(event) => setCheckNumber(event.target.value)}
                        placeholder="Optional, but helpful"
                        className="co-input w-full"
                      />
                    </label>
                  ) : null}
                  <label className="block">
                    <span className="mb-1 block text-sm text-[var(--co-muted)]">Damages / notes for the office</span>
                    <textarea
                      value={cleanerNotes}
                      onChange={(event) => setCleanerNotes(event.target.value)}
                      rows={3}
                      placeholder="Anything broken, missing, or the office should know about — optional."
                      className="co-input w-full resize-none"
                    />
                  </label>
                </div>
              </section>
            </>
          ) : jobFullyCompleted ? (
            <section className="co-card p-5 text-center">
              <p className="text-lg font-semibold text-[var(--co-evergreen)]">Job completed</p>
              <p className="mt-1 text-sm text-[var(--co-muted)]">
                Worked {elapsed} · finished {timeEntry?.clockOut ? timeLabel(new Date(timeEntry.clockOut).toISOString()) : timeLabel(new Date().toISOString())}
              </p>
              <Link href="/my-day" className="co-button-primary mt-4 inline-flex">
                Back to My day
              </Link>
            </section>
          ) : myPortionDone ? (
            <section className="co-card p-5 text-center">
              <p className="text-lg font-semibold text-[var(--co-ink)]">Your part is done</p>
              <p className="mt-1 text-sm text-[var(--co-muted)]">
                Worked {elapsed} · finished {timeEntry?.clockOut ? timeLabel(new Date(timeEntry.clockOut).toISOString()) : timeLabel(new Date().toISOString())}
              </p>
              <div className="mx-auto mt-4 max-w-sm rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left">
                <p className="text-sm font-semibold text-amber-900">Waiting on {waitingOnLabel}</p>
                <p className="mt-1 text-xs text-amber-800">This job finishes once everyone assigned has clocked out.</p>
              </div>
              <Link href="/my-day" className="co-button-primary mt-4 inline-flex">
                Back to My day
              </Link>
            </section>
          ) : null}
      </div>

      {started && !myPortionDone ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--co-line-soft)] bg-[var(--co-surface)] p-4">
          <div className="mx-auto max-w-[720px]">
            <button
              type="button"
              onClick={completeJob}
              disabled={completing}
              className="co-button-primary w-full justify-center py-4 text-base"
            >
              {completing ? "Finalizing…" : "Complete job"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
