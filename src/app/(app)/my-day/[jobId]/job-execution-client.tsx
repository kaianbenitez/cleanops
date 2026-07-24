"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { dateLabel, formatElapsed, groupNotes, jobAddress, jobTypeLabel, timeLabel } from "@/lib/my-day/job-format";

type Job = {
  jobId: string;
  customerId: string;
  role: "lead" | "helper";
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
  preferredDays?: string[] | null;
  preferredTimeOfDay?: string | null;
  subdivision: string | null;
};

type TimeEntry = { clockIn: string; clockOut: string | null } | null;

type Photo = { id: string; slot: "before" | "after" | "extra"; url: string | null; caption: string | null };

export default function JobExecutionClient({
  job,
  timeEntry,
  officePhone,
  companyTimezone,
}: {
  job: Job;
  timeEntry: TimeEntry;
  officePhone: string | null;
  companyTimezone: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSlotRef = useRef<"before" | "after" | "extra">("before");
  const [now, setNow] = useState(0);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(job.status === "completed" || Boolean(timeEntry?.clockOut));
  const [error, setError] = useState<string | null>(null);

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
      .catch(() => setPhotos([]));
  }, [job.jobId]);

  const started = Boolean(timeEntry);
  const elapsed = timeEntry ? formatElapsed(timeEntry.clockIn, timeEntry.clockOut ? new Date(timeEntry.clockOut).getTime() : now) : "00:00";
  const address = jobAddress(job) || "Address not set";
  const notes = groupNotes(job);
  const clientNote = job.generalNotes ?? "";
  const beforePhotos = photos.filter((photo) => photo.slot === "before");
  const afterPhotos = photos.filter((photo) => photo.slot === "after");
  const extraPhotos = photos.filter((photo) => photo.slot === "extra");

  const statusLabel = useMemo(() => {
    if (completed) return "Completed";
    if (started) return "Active job";
    return "Scheduled";
  }, [completed, started]);

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
    const body = new FormData();
    body.set("photo", file);
    body.set("slot", slot);
    const response = await fetch(`/api/jobs/${job.jobId}/photos`, { method: "POST", body });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return setError(typeof result.error === "string" ? result.error : "Could not upload photo.");
    setPhotos((current) => [result.photo, ...current]);
  }

  async function clockIn() {
    setError(null);
    const res = await fetch(`/api/jobs/${job.jobId}/clock-in`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof body.error === "string" ? body.error : "Could not clock in.");
      return;
    }
    router.refresh();
  }

  async function completeJob() {
    setError(null);
    setCompleting(true);
    const res = await fetch(`/api/jobs/${job.jobId}/clock-out`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setCompleting(false);
    if (!res.ok) {
      setError(typeof body.error === "string" ? body.error : "Could not complete this job.");
      return;
    }
    setCompleted(true);
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
                  completed ? "co-badge-success" : started ? "bg-[var(--co-evergreen)] text-white" : "bg-[var(--co-surface-muted)] text-[var(--co-muted)]"
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
          <p className="text-sm text-[var(--co-muted)]">You haven&apos;t clocked in to this job yet.</p>
          <button type="button" onClick={clockIn} className="co-button-primary mt-4">
            Arrive &amp; clock in
          </button>
        </section>
      ) : (
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
                  <span className="text-sm font-semibold text-[var(--co-ink)]">{Math.round(job.estimatedDurationMinutes / 60)}h</span>
                </div>
              ) : null}
              {job.keyNumber || job.garageCode || job.gateCode || job.alarmCode ? (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-[var(--co-muted)]">Access</span>
                  <span className="text-right text-sm font-semibold text-[var(--co-ink)]">
                    {[job.keyNumber && `Key #${job.keyNumber}`, job.garageCode && `Garage ${job.garageCode}`, job.gateCode && `Gate ${job.gateCode}`, job.alarmCode && `Alarm ${job.alarmCode}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
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
                <p className="text-sm text-[var(--co-ink)]">{clientNote}</p>
              </div>
            ) : null}

            {notes.length > 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {notes.map((note) => (
                  <div key={note} className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-3 py-2 text-xs leading-5 text-[var(--co-ink)]">
                    {note}
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          {!completed ? (
            <>
              <section className="co-card p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-[var(--co-ink)]">Photo evidence</h2>
                  <button type="button" onClick={() => openUpload("extra")} className="co-button-primary px-4 py-2 text-xs">
                    Upload photo
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
                            className="relative flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-[var(--co-line)] bg-[var(--co-surface-muted)] text-[var(--co-faint)] hover:border-[var(--co-evergreen)] hover:text-[var(--co-evergreen)]"
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
                    className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] text-[var(--co-faint)] hover:text-[var(--co-evergreen)]"
                  >
                    <span className="text-2xl">+</span>
                    <span className="px-4 text-center text-[10px] font-bold uppercase">Add more photos</span>
                  </button>
                </div>
                <p className="mt-3 text-xs text-[var(--co-faint)]">Photos are securely saved to this job for office review.</p>
              </section>
            </>
          ) : (
            <section className="co-card p-5 text-center">
              <p className="text-lg font-semibold text-[var(--co-evergreen)]">Job completed</p>
              <p className="mt-1 text-sm text-[var(--co-muted)]">
                Worked {elapsed} · finished {timeEntry?.clockOut ? timeLabel(new Date(timeEntry.clockOut).toISOString()) : timeLabel(new Date().toISOString())}
              </p>
              <Link href="/my-day" className="co-button-primary mt-4 inline-flex">
                Back to My day
              </Link>
            </section>
          )}
        </div>
      )}

      {started && !completed ? (
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
