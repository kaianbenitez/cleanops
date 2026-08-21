"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dateLabel, formatEstimatedTime, groupNotes, jobAddress, jobTypeLabel, PAYMENT_METHOD_OPTIONS, timeLabel } from "@/lib/my-day/job-format";
import { cleanNoteText } from "@/lib/format";
import { MaskedCode } from "@/components/ui/masked-code";
import { Cat, Check, CircleAlert, KeyRound, Phone, Sparkles, Send, TriangleAlert } from "lucide-react";
import { deriveJobState, deriveWorkdayNow, type StopInput } from "@/lib/my-day/workday-state";
import NowRegion from "../now-region";
import {
  applySavedWork,
  closeOutBlockedMessage,
  closeOutReady,
  closeOutRequirements,
  crewWaitingSentence,
  nextStopAfter,
  receiptFor,
  savedWorkFromResponse,
  wrappingUp,
  type SavedWork,
} from "./close-out";

type Job = {
  jobId: string;
  customerId: string;
  role: "lead" | "helper" | "trainer";
  status: string;
  completedAt: string | null;
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

type Photo = { id: string; slot: "before" | "after" | "extra"; url: string | null; caption: string | null };

type Coworker = { firstName: string; lastName: string; done: boolean };

const PHOTO_OFFLINE_ERROR = "We couldn't reach the server, so this photo was not uploaded. Check your signal and try again.";

function serverErrorMessage(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? `${value} No change was recorded. Check your current status before trying again.` : fallback;
}

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

/** The badge is a label for the state the shared derivation reports — it is
 * never derived from local booleans, which is how this screen and My Day
 * used to end up describing the same stop two different ways. */
const STATE_BADGE: Record<string, string> = {
  day_not_started: "Not started",
  between_jobs: "Not started",
  traveling: "On the way",
  arrived: "At the stop",
  job_active: "Cleaning",
  wrapping_up: "Wrapping up",
  employee_done_crew_active: "Your work saved",
  whole_job_completed: "Marked done",
  day_complete: "Your work saved",
  stale_entry: "Still recording",
};

export default function JobExecutionClient({
  job,
  stops,
  todayIso,
  officePhone,
  companyTimezone,
  coworkers,
}: {
  job: Job;
  stops: StopInput[];
  todayIso: string;
  officePhone: string | null;
  companyTimezone: string;
  coworkers: Coworker[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSlotRef = useRef<"before" | "after" | "extra">("before");
  /** One request id per user tap, reused across retries of that same tap so a
   * repeat is recognisable as the same intent rather than a new one. */
  const saveRequestIdRef = useRef<string | null>(null);

  const customerName = `${job.customerFirstName} ${job.customerLastName}`;
  const serverStop = useMemo(
    () => stops.find((stop) => stop.jobId === job.jobId) ?? null,
    [stops, job.jobId]
  );

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [saving, setSaving] = useState(false);
  const [travelling, setTravelling] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [cleanerNotes, setCleanerNotes] = useState("");
  const [feedbackUrl, setFeedbackUrl] = useState<string | null>(null);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  /** Set once, from the server's own persisted clockIn/clockOut/minutesWorked.
   * Nothing here is recomputed on a later render, which is why the receipt
   * stops moving. */
  const [saved, setSaved] = useState<SavedWork | null>(
    // Only when there is no open entry: an open entry outranks a closed one in
    // `deriveJobState`, and seeding from the closed one regardless made this
    // screen announce "your work is saved" while My Day was still counting.
    serverStop?.myClosedEntry && !serverStop.myOpenEntry
      ? { ...serverStop.myClosedEntry, jobCompleted: Boolean(serverStop.completedAt) }
      : null
  );

  useEffect(() => {
    fetch(`/api/jobs/${job.jobId}/photos`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => setPhotos(body.photos ?? []))
      .catch(() => {
        setPhotos([]);
        setError("Couldn't load photos already on this job — check your signal and try refreshing.");
      });
  }, [job.jobId]);

  // All state comes from the shared derivation. The saved values are folded
  // into its input the moment the server returns them, so the Now region's
  // counter stops immediately instead of waiting for a refresh to arrive.
  const effectiveStops = useMemo(() => (saved ? applySavedWork(stops, job.jobId, saved) : stops), [stops, job.jobId, saved]);
  const effectiveStop = effectiveStops.find((stop) => stop.jobId === job.jobId) ?? null;
  const workdayNow = useMemo(
    () => wrappingUp(deriveWorkdayNow({ stops: effectiveStops, todayIso, timeZone: companyTimezone }), job.jobId, customerName),
    [effectiveStops, todayIso, companyTimezone, job.jobId, customerName]
  );
  const jobState = effectiveStop ? deriveJobState(effectiveStop, todayIso) : "day_not_started";
  const badge = workdayNow.currentStopId === job.jobId ? STATE_BADGE[workdayNow.state] ?? STATE_BADGE[jobState] : STATE_BADGE[jobState] ?? "Not started";

  const recording = Boolean(effectiveStop?.myOpenEntry);
  const receipt = effectiveStop ? receiptFor(effectiveStop, companyTimezone) : null;
  const otherRecording = effectiveStops.find((stop) => stop.jobId !== job.jobId && stop.myOpenEntry) ?? null;
  const nextStop = receipt ? nextStopAfter(effectiveStops, job.jobId, todayIso) : null;

  const actualAddress = jobAddress(job);
  const address = actualAddress || "Address not set";
  const hasAccessInfo = Boolean(job.accessInstructions || job.keyNumber || job.garageCode || job.gateCode || job.alarmCode);
  const notes = groupNotes(job);
  const clientNote = cleanNoteText(job.generalNotes);
  const instructions = [
    job.doNotClean ? { label: "Do not clean", value: cleanNoteText(job.doNotClean), icon: CircleAlert, tone: "co-badge-danger" } : null,
    job.petNotes ? { label: "Pets", value: cleanNoteText(job.petNotes), icon: Cat, tone: "co-badge-warning" } : null,
    job.importantToCustomer ? { label: "Important", value: cleanNoteText(job.importantToCustomer), icon: Sparkles, tone: "co-badge-spark" } : null,
  ].filter(Boolean) as Array<{ label: string; value: string; icon: typeof CircleAlert; tone: string }>;
  const beforePhotos = photos.filter((photo) => photo.slot === "before");
  const afterPhotos = photos.filter((photo) => photo.slot === "after");
  const extraPhotos = photos.filter((photo) => photo.slot === "extra");

  const closeOutInput = { hasBeforePhoto: beforePhotos.length > 0, hasAfterPhoto: afterPhotos.length > 0, paymentMethod };
  const requirements = closeOutRequirements(closeOutInput);
  const ready = closeOutReady(closeOutInput);
  const blockedMessage = closeOutBlockedMessage(closeOutInput);

  function newRequestId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  }

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
      setError(PHOTO_OFFLINE_ERROR);
    } finally {
      setUploading(false);
    }
  }

  /** Closes this employee's entry only. Whether the whole job is finished is
   * the server's call — never assumed here (state model, Invariant 4). */
  async function saveMyWork() {
    if (saving || !ready) return;
    setError(null);
    setUncertain(false);
    setSaving(true);
    saveRequestIdRef.current = saveRequestIdRef.current ?? newRequestId();
    try {
      const res = await fetch(`/api/jobs/${job.jobId}/clock-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRequestId: saveRequestIdRef.current,
          paymentMethodCollected: paymentMethod || undefined,
          checkNumberCollected: paymentMethod === "check" ? checkNumber.trim() || undefined : undefined,
          cleanerNotes: cleanerNotes.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(serverErrorMessage(body.error, "The server rejected your saved work, so it was not recorded. Check your current status before trying again."));
        return;
      }
      // A duplicate tap answers `{ idempotent: true }` with the same persisted
      // values — a receipt, not an error.
      const savedWork = savedWorkFromResponse(body);
      if (!savedWork) {
        setError("The server did not return a saved work record. Check your current status before trying again.");
        return;
      }
      saveRequestIdRef.current = null;
      setSaved(savedWork);
      if (savedWork.jobCompleted) await requestCustomerFeedback();
      startTransition(() => router.refresh());
    } catch {
      // The request may well have succeeded before the connection dropped.
      // Never invite a blind repeat of a mutation that might already be saved.
      setUncertain(true);
    } finally {
      setSaving(false);
    }
  }

  /** The continuation after a saved stop. Recorded time can only ever start
   * on this transition, and the server refuses it while another entry is
   * open (Invariant 3), so there is still exactly one way to start a stop. */
  async function startTravelToNext(nextJobId: string) {
    if (travelling) return;
    setError(null);
    setUncertain(false);
    setTravelling(true);
    try {
      const res = await fetch(`/api/jobs/${nextJobId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "traveling", clientRequestId: newRequestId() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(serverErrorMessage(body.error, "Travel to the next stop was not recorded. Check your current status before trying again."));
        return;
      }
      router.push("/my-day");
    } catch {
      setUncertain(true);
    } finally {
      setTravelling(false);
    }
  }

  async function requestCustomerFeedback() {
    setSendingFeedback(true);
    try {
      const response = await fetch(`/api/jobs/${job.jobId}/feedback-link`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof body.error === "string" ? `Your work was saved, but the customer link could not be created: ${body.error}` : "Your work was saved, but the customer link is not ready. Refresh or call the office.");
        return;
      }
      setFeedbackUrl(body.feedbackUrl ?? null);
    } catch {
      setError("Your work was saved, but the customer link could not be reached. Refresh or call the office.");
    } finally {
      setSendingFeedback(false);
    }
  }

  return (
    <div className="mx-auto max-w-[720px] pb-40">
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChosen} />

      <NowRegion now={workdayNow} />

      <div className="px-4 sm:px-5">
        <div className="mb-3 mt-2">
          <Link href="/my-day" className="-ml-2 flex min-h-11 w-fit items-center gap-1 px-2 text-sm font-medium text-[var(--co-muted)] hover:text-[var(--co-ink)]">
            ← Back to My Day
          </Link>
        </div>

        <section className="mb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 type-field-micro font-bold uppercase tracking-wider ${
                    jobState === "whole_job_completed"
                      ? "co-badge-success"
                      : jobState === "employee_done_crew_active"
                        ? "co-badge-warning"
                        : recording
                          ? "bg-[var(--co-accent-fill)] text-white"
                          : "bg-[var(--co-surface-muted)] text-[var(--co-muted)]"
                  }`}
                >
                  {badge}
                </span>
                <span className="font-mono type-field-micro text-[var(--co-faint)]">ID: #{job.jobId.slice(0, 8).toUpperCase()}</span>
              </div>
              <h1 className="page-title !text-2xl">{address}</h1>
              {/* The scheduled slot, not a second clock. The only counter on
                  this screen is the labelled one in the Now region above. */}
              <p className="mt-1 text-sm text-[var(--co-muted)]">
                Scheduled {dateLabel(job.scheduledDate, companyTimezone)} · {timeLabel(job.scheduledStartTime)}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <a
                href={actualAddress ? `https://maps.google.com/?q=${encodeURIComponent(actualAddress)}` : undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!actualAddress}
                className={`co-button-secondary min-h-11 ${actualAddress ? "" : "pointer-events-none opacity-50"}`}
              >
                View map
              </a>
              <a href={officePhone ? `tel:${officePhone}` : undefined} className={`co-button-secondary min-h-11 ${officePhone ? "" : "pointer-events-none opacity-50"}`}>
                Contact support
              </a>
            </div>
          </div>
        </section>

        {uncertain ? (
          <div role="alert" className="co-badge-warning mb-4 rounded-2xl px-4 py-3">
            <div className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
              <div>
                <p className="type-field-body font-semibold">We couldn&apos;t confirm whether that was saved.</p>
                <p className="mt-1 type-field-meta">Check before trying again — it may already be recorded.</p>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setUncertain(false);
                  startTransition(() => router.refresh());
                }}
                className="co-button-secondary min-h-11 px-3 type-field-meta"
              >
                Check status
              </button>
              {officePhone ? (
                <a href={`tel:${officePhone}`} className="inline-flex min-h-11 items-center gap-1.5 type-field-meta font-medium text-[var(--co-muted)] hover:text-[var(--co-ink)]">
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  Call the office
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="co-badge-danger mb-4 rounded-2xl px-4 py-3">
            <div className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
              <p className="type-field-body font-semibold">{error}</p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => { setError(null); startTransition(() => router.refresh()); }} className="co-button-secondary min-h-11 px-3 type-field-meta">
                Check status
              </button>
              {officePhone ? <a href={`tel:${officePhone}`} className="inline-flex min-h-11 items-center type-field-meta font-semibold">Call the office</a> : null}
            </div>
          </div>
        ) : null}

        <div className="space-y-4">
          {!actualAddress || !hasAccessInfo ? (
            <section className={`${!actualAddress ? "co-badge-danger" : "co-badge-warning"} rounded-2xl px-4 py-3`}>
              <div className="flex items-start gap-2">
                {!actualAddress ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden strokeWidth={2} /> : <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />}
                <div>
                  <p className="type-field-body font-semibold">{!actualAddress ? "This stop has no address on file." : "No entry instructions are on file for this stop."}</p>
                  <p className="mt-1 type-field-meta">{!actualAddress ? "Do not leave until the office confirms where to go." : "Confirm how to enter before you leave."}</p>
                </div>
              </div>
              {officePhone ? <a href={`tel:${officePhone}`} className="mt-2 inline-flex min-h-11 items-center type-field-meta font-semibold">Call the office</a> : <p className="mt-2 type-field-meta font-semibold">Contact your manager before heading out.</p>}
            </section>
          ) : null}

          {receipt ? (
            <section role="status" className="co-card p-5">
              <p className="text-base font-semibold text-[var(--co-ink)]">{receipt.receiptLine}</p>
              <p className="mt-2 text-sm text-[var(--co-muted)]">
                {receipt.jobCompleted ? receipt.completionLine : crewWaitingSentence(receipt.completionLine)}
              </p>
              {receipt.jobCompleted && feedbackUrl ? (
                <div className="mt-4 rounded-xl border border-[var(--co-line)] bg-[var(--co-surface-muted)] p-3">
                  <p className="type-field-meta font-semibold text-[var(--co-accent-text)]">Customer link ready — share it before you go:</p>
                  <input readOnly value={feedbackUrl} className="co-input mt-2 w-full type-field-meta" onFocus={(event) => event.currentTarget.select()} />
                </div>
              ) : null}
            </section>
          ) : null}

          {!recording && !receipt ? (
            <section className="co-card p-5">
              <p className="text-sm text-[var(--co-ink)]">You haven&apos;t started this stop. Start travel from My Day when you&apos;re ready.</p>
              {otherRecording ? (
                <p className="mt-2 text-sm font-semibold text-[var(--co-muted)]">
                  You&apos;re recording time at {otherRecording.customerFirstName} {otherRecording.customerLastName} right now.
                </p>
              ) : null}
              <p className="mt-2 type-field-meta text-[var(--co-faint)]">Everything below is here to read before you head out.</p>
            </section>
          ) : null}

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
              {coworkers.length ? (
                <div className="flex items-start justify-between gap-3 border-b border-[var(--co-line-soft)] py-2">
                  <span className="text-sm text-[var(--co-muted)]">With you</span>
                  <span className="flex flex-col items-end gap-1">
                    {coworkers.map((coworker) => (
                      <span key={`${coworker.firstName}-${coworker.lastName}`} className="flex items-center gap-1.5 text-sm font-semibold text-[var(--co-ink)]">
                        {coworker.firstName} {coworker.lastName}
                        <span className={`type-field-micro font-medium ${coworker.done ? "text-[var(--co-success)]" : "text-[var(--co-muted)]"}`}>
                          {/* "still on site" is a claim about right now, and it
                              was false on every stop nobody had started yet. */}
                          {coworker.done ? "· work saved" : "· not saved yet"}
                        </span>
                      </span>
                    ))}
                  </span>
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
                  <a href={`tel:${job.customerPhone}`} className="text-sm font-semibold text-[var(--co-accent-text)]">
                    {customerName} · {job.customerPhone}
                  </a>
                </div>
              ) : null}
            </div>

            {clientNote ? (
              <div className="mt-4 rounded-lg bg-[var(--co-accent-tint)] p-4">
                <p className="mb-1 type-field-meta font-bold uppercase tracking-tight text-[var(--co-accent-text)]">Client notes</p>
                <p className="whitespace-pre-line text-sm text-[var(--co-ink)]">{clientNote}</p>
              </div>
            ) : null}

            {instructions.length ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {instructions.map((instruction) => {
                  const Icon = instruction.icon;
                  return <section key={instruction.label} className={`rounded-lg p-3 ${instruction.tone}`}><div className="flex items-center gap-2 type-field-meta font-bold"><Icon className="h-4 w-4" />{instruction.label}</div><p className="mt-2 whitespace-pre-line text-sm leading-5">{instruction.value}</p></section>;
                })}
              </div>
            ) : null}

            {notes.length > 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {notes.map((note) => (
                  <div key={note} className="whitespace-pre-line rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-3 py-2 type-field-meta leading-5 text-[var(--co-ink)]">
                    {note}
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          {recording ? (
            <>
              <section className="co-card p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-[var(--co-ink)]">Photos</h2>
                  <button type="button" onClick={() => openUpload("extra")} disabled={uploading} className="co-button-primary min-h-11 px-4 py-2 type-field-meta">
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
                            {photo.url ? <img src={photo.url} alt={`${slot === "before" ? "Before" : "After"} photo at ${address}`} className="h-full w-full object-cover" /> : null}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openUpload(slot)}
                            disabled={uploading}
                            className="relative flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-[var(--co-line)] bg-[var(--co-surface-muted)] text-[var(--co-faint)] hover:border-[var(--co-accent-text)] hover:text-[var(--co-accent-text)] disabled:opacity-60"
                          >
                            <span className="text-3xl">+</span>
                            {/* Photos are not a gate (Kaian, 2026-08-20) — a
                                badge saying "Required" over a button that
                                blocks nothing is just a lie with a deadline. */}
                            <span className="absolute bottom-2 left-2 rounded bg-[var(--co-ink)]/70 px-2 py-0.5 type-field-micro font-bold uppercase text-white">Recommended</span>
                          </button>
                        )}
                        <span className="text-center type-field-meta font-medium text-[var(--co-muted)]">{slot === "before" ? "Before" : "After"}</span>
                      </div>
                    );
                  })}
                  {extraPhotos.map((photo) => (
                    <div key={photo.id} className="flex flex-col gap-2">
                      <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--co-line-soft)]">
                        {photo.url ? <img src={photo.url} alt={`Additional photo at ${address}`} className="h-full w-full object-cover" /> : null}
                      </div>
                      <span className="text-center type-field-meta font-medium text-[var(--co-muted)]">Additional</span>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => openUpload("extra")}
                    disabled={uploading}
                    className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] text-[var(--co-faint)] hover:text-[var(--co-accent-text)] disabled:opacity-60"
                  >
                    <span className="text-2xl">+</span>
                    <span className="px-4 text-center type-field-micro font-bold uppercase">Add more photos</span>
                  </button>
                </div>
                <p className="mt-3 type-field-meta text-[var(--co-faint)]">Photos are securely saved to this job for office review.</p>
              </section>

              <section className="co-card p-5">
                <h2 className="mb-4 text-base font-semibold text-[var(--co-ink)]">Close out</h2>
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] p-4">
                    <div className="flex items-start gap-3">
                      <Send className="mt-0.5 h-5 w-5 shrink-0 text-[var(--co-accent-text)]" />
                      <div>
                        <p className="font-semibold text-[var(--co-ink)]">Customer feedback link</p>
                        <p className="mt-1 type-field-meta leading-5 text-[var(--co-muted)]">Send the customer a private link. They submit their own rating, feedback, tip, and payment.</p>
                      </div>
                    </div>
                    {feedbackUrl ? <div className="mt-4 rounded-xl border border-[var(--co-line)] bg-[var(--co-surface)] p-3"><p className="type-field-meta font-semibold text-[var(--co-accent-text)]">Link ready — share it with the customer:</p><input readOnly value={feedbackUrl} className="co-input mt-2 w-full type-field-meta" onFocus={(event) => event.currentTarget.select()} /></div> : <button type="button" onClick={requestCustomerFeedback} disabled={sendingFeedback} className="co-button-secondary mt-4 min-h-11 w-full justify-center">{sendingFeedback ? "Creating link…" : "Create customer link"}</button>}
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-sm text-[var(--co-muted)]">Payment collected on-site</span>
                    <select
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value)}
                      className="co-input min-h-11 w-full"
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
                        className="co-input min-h-11 w-full"
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
          ) : null}
        </div>
      </div>

      {/* One primary action, pinned within thumb reach and clear of the home
          indicator. Progress is named tasks and text, never colour alone.
          Also clear of the mobile field bottom nav (app-nav.tsx) — this bar
          used to share the same `bottom-0`, so at z-40 it rendered directly
          on top of the nav instead of above it. */}
      <div className="fixed inset-x-0 bottom-[calc(var(--app-nav-mobile-height)+env(safe-area-inset-bottom))] z-40 border-t border-[var(--co-line-soft)] bg-[var(--co-surface)] px-4 pb-3 pt-3 xl:bottom-0">
        <div className="mx-auto max-w-[720px]">
          {recording ? (
            <>
              <ul className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                {requirements.map((requirement) => (
                  <li key={requirement.id} className={`flex items-center gap-1 type-field-meta font-medium ${requirement.done ? "text-[var(--co-success)]" : "text-[var(--co-muted)]"}`}>
                    {requirement.done ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-full border border-current" />}
                    {requirement.label}
                    {!requirement.done && !requirement.required ? <span className="type-field-micro text-[var(--co-faint)]">(optional)</span> : null}
                    <span className="sr-only">{requirement.done ? " added" : requirement.required ? " still needed" : " optional"}</span>
                  </li>
                ))}
              </ul>
              {blockedMessage ? <p className="mb-2 type-field-meta text-[var(--co-muted)]">{blockedMessage}</p> : null}
              <button
                type="button"
                onClick={saveMyWork}
                disabled={saving || !ready}
                className="co-button-primary min-h-[56px] w-full justify-center py-4 text-base disabled:opacity-60"
              >
                {saving ? "Saving…" : `Save my work at ${customerName}`}
              </button>
            </>
          ) : nextStop ? (
            <button
              type="button"
              onClick={() => startTravelToNext(nextStop.jobId)}
              disabled={travelling}
              className="co-button-primary min-h-[56px] w-full justify-center py-4 text-base disabled:opacity-60"
            >
              {travelling ? "Starting…" : `Start travel to ${nextStop.customerFirstName} ${nextStop.customerLastName}`}
            </button>
          ) : (
            <Link href="/my-day" className="co-button-primary flex min-h-[56px] w-full items-center justify-center py-4 text-base">
              Back to My Day
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
