"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type JobCard = {
  jobId: string;
  customerId: string;
  role: "lead" | "helper";
  status: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  type: string;
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
  importantToCustomer: string | null;
  doNotClean: string | null;
  petNotes: string | null;
  operationalNotes: string | null;
  preferredCommunication: string | null;
  preferredDay: string | null;
  preferredTime: string | null;
  subdivision: string | null;
};

type TimeEntry = {
  id: string;
  jobId: string;
  clockIn: string;
  clockOut: string | null;
  minutesWorked: number | null;
  notes: string | null;
};

type UndoAction = {
  label: string;
  onUndo: () => void | Promise<void>;
};

function timeLabel(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dateLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function jobAddress(job: Pick<JobCard, "addressLine1" | "city" | "state" | "zip">) {
  return [job.addressLine1, job.city, job.state, job.zip].filter(Boolean).join(", ");
}

function groupNotes(job: JobCard) {
  return [
    job.accessInstructions,
    job.keyNumber ? `Key #: ${job.keyNumber}` : null,
    job.garageCode ? `Garage: ${job.garageCode}` : null,
    job.gateCode ? `Gate: ${job.gateCode}` : null,
    job.alarmCode ? `Alarm: ${job.alarmCode}` : null,
    job.vacuumLocation ? `Vacuum: ${job.vacuumLocation}` : null,
    job.mopHeadsNeeded ? `Mop heads: ${job.mopHeadsNeeded}` : null,
    job.trashBags ? `Trash bags: ${job.trashBags}` : null,
    job.importantToCustomer ? `Important: ${job.importantToCustomer}` : null,
    job.doNotClean ? `Do not clean: ${job.doNotClean}` : null,
    job.petNotes ? `Pets: ${job.petNotes}` : null,
    job.operationalNotes ? job.operationalNotes : null,
    job.preferredCommunication ? `Prefers ${job.preferredCommunication}` : null,
    job.preferredDay ? `Prefers ${job.preferredDay}` : null,
    job.preferredTime ? `Prefers ${job.preferredTime}` : null,
    job.subdivision ? `Subdivision: ${job.subdivision}` : null,
  ].filter((entry): entry is string => Boolean(entry));
}

function customerSnapshot(job: JobCard) {
  return [
    job.preferredCommunication ? `Prefers ${job.preferredCommunication}` : null,
    job.preferredDay ? `Preferred day: ${job.preferredDay}` : null,
    job.preferredTime ? `Preferred time: ${job.preferredTime}` : null,
    job.subdivision ? `Subdivision: ${job.subdivision}` : null,
    job.importantToCustomer ? `Important: ${job.importantToCustomer}` : null,
    job.doNotClean ? `Do not clean: ${job.doNotClean}` : null,
    job.petNotes ? `Pets: ${job.petNotes}` : null,
  ].filter((entry): entry is string => Boolean(entry));
}

function customerProfile(job: JobCard) {
  return [
    { label: "Preferred communication", value: job.preferredCommunication ?? "Not set" },
    { label: "Preferred day", value: job.preferredDay ?? "Not set" },
    { label: "Preferred time", value: job.preferredTime ?? "Not set" },
    { label: "Subdivision", value: job.subdivision ?? "Not set" },
    { label: "Pets", value: job.petNotes ?? "None noted" },
    { label: "Important to customer", value: job.importantToCustomer ?? "Not noted" },
    { label: "Do not clean", value: job.doNotClean ?? "None noted" },
    { label: "Access notes", value: job.accessInstructions ?? "No access notes" },
  ];
}

function formatElapsed(startedAt: string | number | null, now: number) {
  if (!startedAt) return "00:00";
  const start = typeof startedAt === "string" ? new Date(startedAt).getTime() : startedAt;
  if (Number.isNaN(start)) return "00:00";
  const totalSeconds = Math.max(0, Math.floor((now - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function MyDayClient({
  employeeName,
  employeeTitle,
  employeeId,
  companyName,
  companyLogoUrl,
  companyBrandColor,
  officePhone,
  companyTimezone,
  mileageMiles,
  mileageRateCents,
  weeklyHours,
  weeklyMinutes,
  currentJob,
  openEntry,
  todayJobs,
  upcomingJobs,
  completedJobs,
  dayLabel,
}: {
  employeeName: string;
  employeeTitle: string;
  employeeId: string;
  companyName: string;
  companyLogoUrl: string | null;
  companyBrandColor: string;
  officePhone: string | null;
  companyTimezone: string;
  mileageMiles: number;
  mileageRateCents: number;
  weeklyHours: number;
  weeklyMinutes: number;
  currentJob: JobCard | null;
  openEntry: TimeEntry | null;
  todayJobs: JobCard[];
  upcomingJobs: JobCard[];
  completedJobs: JobCard[];
  dayLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [travelingJobId, setTravelingJobId] = useState<string | null>(null);
  const [travelStartedAt, setTravelStartedAt] = useState<number | null>(null);
  const [breakStartedAt, setBreakStartedAt] = useState<number | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(currentJob?.jobId ?? todayJobs[0]?.jobId ?? upcomingJobs[0]?.jobId ?? completedJobs[0]?.jobId ?? null);
  const [localTodayJobs, setLocalTodayJobs] = useState<JobCard[]>(todayJobs);
  const [localUpcomingJobs, setLocalUpcomingJobs] = useState<JobCard[]>(upcomingJobs);
  const [localCompletedJobs, setLocalCompletedJobs] = useState<JobCard[]>(completedJobs);
  const [now, setNow] = useState(Date.now());
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mileageDraft, setMileageDraft] = useState(mileageMiles.toFixed(1));

  const brandColor = /^#[0-9a-fA-F]{6}$/.test(companyBrandColor) ? companyBrandColor : "#14211f";

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!undoAction) return;
    const id = window.setTimeout(() => setUndoAction(null), 8000);
    return () => window.clearTimeout(id);
  }, [undoAction]);

  useEffect(() => {
    setLocalTodayJobs(todayJobs);
    setLocalUpcomingJobs(upcomingJobs);
    setLocalCompletedJobs(completedJobs);
  }, [todayJobs, upcomingJobs, completedJobs]);

  useEffect(() => {
    setMileageDraft(mileageMiles.toFixed(1));
  }, [mileageMiles]);

  useEffect(() => {
    if (!selectedJobId) {
      setSelectedJobId(currentJob?.jobId ?? todayJobs[0]?.jobId ?? upcomingJobs[0]?.jobId ?? completedJobs[0]?.jobId ?? null);
      return;
    }
    const present =
      todayJobs.some((job) => job.jobId === selectedJobId) ||
      upcomingJobs.some((job) => job.jobId === selectedJobId) ||
      completedJobs.some((job) => job.jobId === selectedJobId);
    if (!present) {
      setSelectedJobId(currentJob?.jobId ?? todayJobs[0]?.jobId ?? upcomingJobs[0]?.jobId ?? completedJobs[0]?.jobId ?? null);
    }
  }, [completedJobs, currentJob?.jobId, selectedJobId, todayJobs, upcomingJobs]);

  const activeJob = useMemo(() => {
    const chosenId = openEntry?.jobId ?? travelingJobId ?? selectedJobId;
    if (chosenId) {
      return (
        localTodayJobs.find((job) => job.jobId === chosenId) ??
        localUpcomingJobs.find((job) => job.jobId === chosenId) ??
        localCompletedJobs.find((job) => job.jobId === chosenId) ??
        currentJob ??
        null
      );
    }
    return currentJob ?? localTodayJobs[0] ?? localUpcomingJobs[0] ?? null;
  }, [currentJob, localCompletedJobs, localTodayJobs, localUpcomingJobs, openEntry?.jobId, selectedJobId, travelingJobId]);

  const activeTimerStartedAt = breakStartedAt ?? openEntry?.clockIn ?? travelStartedAt ?? null;
  const activeTimerLabel = formatElapsed(activeTimerStartedAt, now);
  const activeStatus = openEntry ? "Working" : breakStartedAt ? "On break" : travelingJobId ? "Traveling" : "Ready";
  const routeNotes = activeJob ? groupNotes(activeJob).slice(0, 3) : [];
  const routeNoteCount = activeJob ? Math.max(groupNotes(activeJob).length - routeNotes.length, 0) : 0;
  const remainingJobs = localTodayJobs.filter((job) => job.jobId !== activeJob?.jobId).length > 0 ? localTodayJobs.filter((job) => job.jobId !== activeJob?.jobId) : localUpcomingJobs.slice(0, 3);
  const routeJobs = [...localTodayJobs].sort((a, b) => (a.scheduledStartTime ?? "").localeCompare(b.scheduledStartTime ?? ""));

  function completeJobLocally(jobId: string) {
    const completedJob =
      localTodayJobs.find((job) => job.jobId === jobId) ??
      localUpcomingJobs.find((job) => job.jobId === jobId) ??
      activeJob;

    const nextTodayJobs = localTodayJobs.filter((job) => job.jobId !== jobId);
    const nextUpcomingJobs = localUpcomingJobs.filter((job) => job.jobId !== jobId);
    const nextCompletedJobs = completedJob
      ? [completedJob, ...localCompletedJobs.filter((job) => job.jobId !== jobId)]
      : localCompletedJobs;

    setLocalTodayJobs(nextTodayJobs);
    setLocalUpcomingJobs(nextUpcomingJobs);
    setLocalCompletedJobs(nextCompletedJobs);

    const nextSelected = nextTodayJobs[0]?.jobId ?? nextUpcomingJobs[0]?.jobId ?? nextCompletedJobs[0]?.jobId ?? null;
    setSelectedJobId((current) => (current === jobId ? nextSelected : current));
  }

  async function clockIn(jobId: string, options?: { undoLabel?: string; undoAction?: () => void | Promise<void> }) {
    setError(null);
    const res = await fetch(`/api/jobs/${jobId}/clock-in`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof body.error === "string" ? body.error : "Could not clock in.");
      return;
    }
    setTravelingJobId(null);
    setTravelStartedAt(null);
    setBreakStartedAt(null);
    setSelectedJobId(jobId);
    if (options?.undoAction) setUndoAction({ label: options.undoLabel ?? "Clock in saved", onUndo: options.undoAction });
    startTransition(() => router.refresh());
  }

  async function clockOut(jobId: string, options?: { undoLabel?: string; undoAction?: () => void | Promise<void> }) {
    setError(null);
    const res = await fetch(`/api/jobs/${jobId}/clock-out`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof body.error === "string" ? body.error : "Could not clock out.");
      return;
    }
    setTravelingJobId(null);
    setTravelStartedAt(null);
    setBreakStartedAt(null);
    if (options?.undoAction) setUndoAction({ label: options.undoLabel ?? "Action saved", onUndo: options.undoAction });
    completeJobLocally(jobId);
    startTransition(() => router.refresh());
  }

  function startTravel(jobId: string) {
    setError(null);
    setSelectedJobId(jobId);
    setTravelingJobId(jobId);
    setTravelStartedAt(Date.now());
    setBreakStartedAt(null);
    setUndoAction({
      label: "Travel started",
      onUndo: () => {
        setTravelingJobId(null);
        setTravelStartedAt(null);
      },
    });
  }

  function startBreak() {
    setError(null);
    setBreakStartedAt(Date.now());
    setUndoAction({
      label: "Break started",
      onUndo: () => setBreakStartedAt(null),
    });
  }

  function resumeWork(jobId: string) {
    setError(null);
    setSelectedJobId(jobId);
    setBreakStartedAt(null);
  }

  async function saveMileage() {
    const response = await fetch("/api/employee-browser/mileage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, mileageMiles: Number(mileageDraft || 0) }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(typeof body.error === "string" ? body.error : "Mileage could not be saved.");
      return;
    }
    startTransition(() => router.refresh());
  }

  const activeAddress = activeJob ? jobAddress(activeJob) : "";

  return (
    <div className="mx-auto max-w-[560px] space-y-4 pb-10">
      <section className="co-card overflow-hidden">
        <div className="px-4 py-4 text-white sm:px-5 sm:py-5" style={{ background: `linear-gradient(135deg, ${brandColor}, #1d2d28)` }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/10">
                  {companyLogoUrl ? (
                    <img src={companyLogoUrl} alt={`${companyName} logo`} className="h-full w-full object-contain p-1.5" />
                  ) : (
                    <span className="text-sm font-semibold">{companyName.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">My day</p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-[-0.05em]">{employeeName}</h1>
                </div>
              </div>
              <p className="mt-3 text-sm text-white/70">
                {dayLabel} · {todayJobs.length} stops · {weeklyHours.toFixed(2)}h this week
              </p>
              <p className="sr-only">
                {employeeTitle} at {companyName}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80">{activeStatus}</span>
              <div className="rounded-2xl bg-white/10 px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/55">Timer</p>
                <p className="mt-1 font-mono text-lg font-semibold">{activeTimerLabel}</p>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/70">
            <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 font-medium text-white/80">
              Tracking: {activeJob ? `${activeJob.customerFirstName} ${activeJob.customerLastName}` : "No job selected"}
            </span>
            {activeJob ? <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 font-medium text-white/80">{activeJob.scheduledDate} · {timeLabel(activeJob.scheduledStartTime)}</span> : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {officePhone ? (
              <a href={`tel:${officePhone}`} className="co-button-secondary bg-white/10 text-white hover:bg-white/15">
                Call office
              </a>
            ) : (
              <span className="rounded-full border border-white/15 px-3 py-2 text-xs text-white/70">Office phone not set</span>
            )}
            <button
              type="button"
              onClick={() => router.refresh()}
              className="co-button-secondary border-white/15 bg-white/10 text-white hover:bg-white/15"
              disabled={pending}
            >
              Refresh
            </button>
          </div>

          {activeJob ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {!openEntry ? (
                <>
                  <button type="button" onClick={() => startTravel(activeJob.jobId)} className="co-button-secondary justify-center bg-white/10 text-white hover:bg-white/15" disabled={pending}>
                    Start travel
                  </button>
                  <button
                    type="button"
                    onClick={() => clockIn(activeJob.jobId, { undoLabel: "Clock in saved", undoAction: () => clockOut(activeJob.jobId) })}
                    className="co-button-primary justify-center"
                    disabled={pending}
                  >
                    Arrive &amp; clock in
                  </button>
                </>
              ) : breakStartedAt ? (
                <button type="button" onClick={() => resumeWork(activeJob.jobId)} className="co-button-primary justify-center" disabled={pending}>
                  Resume work
                </button>
              ) : (
                <>
                  <button type="button" onClick={startBreak} className="co-button-secondary justify-center bg-white/10 text-white hover:bg-white/15" disabled={pending}>
                    Start break
                  </button>
                  <button
                    type="button"
                    onClick={() => clockOut(activeJob.jobId, { undoLabel: "Job finished", undoAction: () => clockIn(activeJob.jobId) })}
                    className="co-button-primary justify-center"
                    disabled={pending}
                  >
                    Finish job
                  </button>
                </>
              )}
            </div>
          ) : null}

          <p className="mt-3 text-sm leading-6 text-white/68">
            {openEntry
              ? "You're clocked in. Use break or finish when you're done."
              : travelingJobId
                ? "You're on the way. Tap arrive when you get there."
                : breakStartedAt
                  ? "Break is running. Tap resume when you're back."
                  : activeJob
                    ? "Read the job details, then start travel or clock in."
                    : "No job selected yet."}
          </p>
        </div>
      </section>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Job details</p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] sm:text-xl">
                {activeJob ? `${activeJob.customerFirstName} ${activeJob.customerLastName}` : "No job selected"}
              </h2>
              <p className="mt-1 text-sm text-[var(--co-muted)]">
                {activeJob ? `${dateLabel(activeJob.scheduledDate, companyTimezone)} · ${timeLabel(activeJob.scheduledStartTime)}` : "Nothing is assigned yet"}
              </p>
            </div>
            <span className="rounded-full bg-[var(--co-surface-muted)] px-3 py-1 text-xs font-medium text-[var(--co-muted)]">
              {activeJob ? activeJob.status.replaceAll("_", " ") : "Ready"}
            </span>
          </div>
          {activeJob ? (
            <div className="mt-3">
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                  activeJob.role === "lead"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                {activeJob.role === "lead" ? "Lead / driver" : "Helper"}
              </span>
            </div>
          ) : null}
        </div>

        {activeJob ? (
          <div className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-[var(--co-line-soft)] bg-[linear-gradient(180deg,#fbfcfa,#f6f8f2)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Contact</p>
                <p className="mt-2 text-base font-semibold text-[var(--co-ink)]">
                  {activeJob.customerFirstName} {activeJob.customerLastName}
                </p>
                <div className="mt-3 space-y-2 text-sm text-[var(--co-muted)]">
                  {activeJob.customerPhone ? (
                    <a href={`tel:${activeJob.customerPhone}`} className="block text-[var(--co-evergreen)]">
                      {activeJob.customerPhone}
                    </a>
                  ) : (
                    <p>No customer phone</p>
                  )}
                  {activeJob.preferredCommunication ? <p>Prefers {activeJob.preferredCommunication}</p> : null}
                </div>
              </div>

              <div className="rounded-[22px] border border-[var(--co-line-soft)] bg-[linear-gradient(180deg,#fbfcfa,#f6f8f2)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Address</p>
                <p className="mt-2 text-base font-semibold text-[var(--co-ink)]">{activeAddress || "Address not set"}</p>
                <p className="mt-2 text-sm text-[var(--co-muted)]">{activeJob.type.replaceAll("_", " ")}</p>
                <a
                  className="mt-3 inline-flex text-sm font-medium text-[var(--co-evergreen)]"
                  href={`https://maps.google.com/?q=${encodeURIComponent(activeAddress || "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open map
                </a>
              </div>
            </div>

            {routeNotes.length > 0 ? (
              <div className="rounded-[22px] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Job notes</p>
                  {routeNoteCount > 0 ? (
                    <span className="rounded-full border border-[var(--co-line-soft)] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">
                      +{routeNoteCount} more
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {routeNotes.map((note) => (
                    <div key={note} className="rounded-2xl border border-[var(--co-line-soft)] bg-white px-3 py-2 text-xs leading-5 text-[var(--co-ink)]">
                      {note}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {activeJob ? (
              <div className="rounded-[22px] border border-[var(--co-line-soft)] bg-[linear-gradient(180deg,#fbfcfa,#f6f8f2)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Customer profile</p>
                  <Link href={`/customers/${activeJob.customerId}`} className="text-xs font-medium text-[var(--co-evergreen)]">
                    Open profile
                  </Link>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {customerProfile(activeJob).map((item) => (
                    <div key={item.label} className="rounded-2xl border border-[var(--co-line-soft)] bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">{item.label}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--co-ink)]">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(activeAddress || "")}`}
                target="_blank"
                rel="noreferrer"
                className="co-button-secondary justify-center"
              >
                Directions
              </a>
              <a href={activeJob.customerPhone ? `tel:${activeJob.customerPhone}` : `tel:${officePhone ?? ""}`} className="co-button-secondary justify-center">
                Call
              </a>
              <Link href={`/customers/${activeJob.customerId}`} className="co-button-secondary justify-center">
                View customer
              </Link>
              {!openEntry ? (
                <>
                  <button type="button" onClick={() => startTravel(activeJob.jobId)} className="co-button-secondary justify-center" disabled={pending}>
                    Start travel
                  </button>
                  <button
                    type="button"
                    onClick={() => clockIn(activeJob.jobId, { undoLabel: "Clock in saved", undoAction: () => clockOut(activeJob.jobId) })}
                    className="co-button-primary justify-center"
                    disabled={pending}
                  >
                    Arrive &amp; clock in
                  </button>
                </>
              ) : (
                <>
                  {breakStartedAt ? (
                    <button type="button" onClick={() => resumeWork(activeJob.jobId)} className="co-button-primary justify-center" disabled={pending}>
                      Resume work
                    </button>
                  ) : (
                    <button type="button" onClick={startBreak} className="co-button-secondary justify-center" disabled={pending}>
                      Start break
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      breakStartedAt
                        ? setError("Resume work before finishing the job.")
                        : clockOut(activeJob.jobId, { undoLabel: "Job finished", undoAction: () => clockIn(activeJob.jobId) })
                    }
                    className="co-button-primary justify-center"
                    disabled={pending || Boolean(breakStartedAt)}
                  >
                    {breakStartedAt ? "Resume first" : "Finish job"}
                  </button>
                </>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {travelingJobId ? (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Travel timer: {activeTimerLabel}
                </p>
              ) : null}
              {breakStartedAt ? (
                <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Break timer: {activeTimerLabel}
                </p>
              ) : null}
              {openEntry ? (
                <p className="rounded-2xl border border-[#dce8cf] bg-[#f4f8ef] px-4 py-3 text-sm text-[#4f6530]">
                  Working timer: {activeTimerLabel}
                </p>
              ) : null}
            </div>

            {error ? (
              <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="p-4 sm:p-5">
            <p className="text-sm text-[var(--co-muted)]">No assigned job is available for today.</p>
          </div>
        )}
      </section>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Route preview</p>
              <h2 className="mt-1 text-lg font-semibold">Today&apos;s path</h2>
            </div>
            <span className="rounded-full bg-[#edf3e9] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5c7436]">
              {routeJobs.length} stops
            </span>
          </div>
          <p className="mt-2 text-sm text-[var(--co-muted)]">
            {routeJobs.length > 0 ? `${routeJobs[0].scheduledDate} service order` : "No route stops scheduled for today."}
          </p>
        </div>
        <div className="divide-y divide-[var(--co-line-soft)]">
          {routeJobs.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--co-muted)] sm:px-5">No jobs scheduled today.</p>
          ) : (
            routeJobs.map((job, index) => (
              <div key={job.jobId} className="flex items-center gap-3 px-4 py-4 sm:px-5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--co-surface-muted)] text-xs font-semibold text-[var(--co-ink)]">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--co-ink)]">
                        {job.customerFirstName} {job.customerLastName}
                      </p>
                      <p className="mt-1 text-xs text-[var(--co-muted)]">
                        {timeLabel(job.scheduledStartTime)} · {jobAddress(job) || "Address not set"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                          job.role === "lead"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                        }`}
                      >
                        {job.role === "lead" ? "Lead / driver" : "Helper"}
                      </span>
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(jobAddress(job) || "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="co-button-secondary shrink-0"
                      >
                        Directions
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {upcomingJobs.length > 0 ? (
        <section className="co-card overflow-hidden">
          <div className="border-b border-[var(--co-line-soft)] px-4 py-4 sm:px-5">
            <p className="eyebrow">Up next</p>
            <h2 className="mt-1 text-lg font-semibold">Remaining jobs</h2>
          </div>
          <div className="divide-y divide-[var(--co-line-soft)]">
            {remainingJobs.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[var(--co-muted)] sm:px-5">No more jobs after this one.</p>
            ) : (
              remainingJobs.map((job, index) => (
                <article key={job.jobId} className="px-4 py-4 sm:px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--co-ink)]">
                        {index + 2}. {job.customerFirstName} {job.customerLastName}
                      </p>
                      <p className="mt-1 text-xs text-[var(--co-muted)]">
                        {dateLabel(job.scheduledDate, companyTimezone)} · {timeLabel(job.scheduledStartTime)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--co-muted)]">{jobAddress(job) || "Address not set"}</p>
                      {groupNotes(job)[0] ? <p className="mt-2 text-xs text-[var(--co-muted)]">{groupNotes(job)[0]}</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                          job.role === "lead"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                        }`}
                      >
                        {job.role === "lead" ? "Lead / driver" : "Helper"}
                      </span>
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(jobAddress(job) || "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="co-button-secondary shrink-0"
                      >
                        Directions
                      </a>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-4 py-4 sm:px-5">
          <p className="eyebrow">Completed today</p>
          <h2 className="mt-1 text-lg font-semibold">Finished jobs</h2>
        </div>
        <div className="divide-y divide-[var(--co-line-soft)]">
          {completedJobs.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--co-muted)] sm:px-5">No completed jobs yet.</p>
          ) : (
            completedJobs.map((job) => (
              <article key={job.jobId} className="px-4 py-4 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--co-ink)]">
                      {job.customerFirstName} {job.customerLastName}
                    </p>
                    <p className="mt-1 text-xs text-[var(--co-muted)]">
                      {dateLabel(job.scheduledDate, companyTimezone)} · {timeLabel(job.scheduledStartTime)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--co-muted)]">{jobAddress(job) || "Address not set"}</p>
                  </div>
                  <span className="rounded-full bg-[#edf3e9] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5c7436]">
                    Completed
                  </span>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="co-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Mileage</p>
            <h2 className="mt-1 text-lg font-semibold">Weekly mileage for payroll</h2>
            <p className="mt-1 text-sm text-[var(--co-muted)]">
              {weeklyHours.toFixed(2)} hours logged this week, {Math.round(weeklyMinutes)} minutes total.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
          <input value={mileageDraft} onChange={(event) => setMileageDraft(event.target.value)} inputMode="decimal" className="co-input w-full" />
          <button type="button" className="co-button-primary px-4" onClick={saveMileage}>
            Save
          </button>
        </div>
        <p className="mt-3 text-xs text-[var(--co-muted)]">
          Mileage pay rate: ${(mileageRateCents / 100).toFixed(2)} / mile
        </p>
      </section>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-4 py-4 sm:px-5">
          <p className="eyebrow">Recent activity</p>
          <h2 className="mt-1 text-lg font-semibold">Latest time entries</h2>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-sm text-[var(--co-muted)]">Time entries still come from the employee clock-in / clock-out flow, so this remains the clean audit trail.</p>
        </div>
      </section>

      {undoAction ? (
        <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 rounded-2xl border border-[var(--co-line-soft)] bg-white px-4 py-3 shadow-[0_10px_32px_rgba(18,24,19,0.12)]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--co-ink)]">{undoAction.label}</p>
              <p className="text-xs text-[var(--co-muted)]">Tap undo if you hit the wrong button.</p>
            </div>
            <button
              type="button"
              className="co-button-secondary shrink-0"
              onClick={async () => {
                const action = undoAction;
                setUndoAction(null);
                if (action) await action.onUndo();
              }}
            >
              Undo
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
