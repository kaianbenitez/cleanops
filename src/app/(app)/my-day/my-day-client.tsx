"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Phone, ArrowRight, MapPin, Car, CheckCircle2, Play, X, ChevronRight, CalendarCheck, Shirt, WashingMachine, Wind } from "lucide-react";
import { timeLabel, dateLabel, jobAddress, formatElapsed, formatEstimatedTime, jobTypeLabel } from "@/lib/my-day/job-format";
import { MaskedCode } from "@/components/ui/masked-code";

type JobCard = {
  jobId: string;
  customerId: string;
  role: "lead" | "helper" | "trainer";
  mileageMiles: string;
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
  mopHeadCount?: number | null;
  ragCount?: number | null;
  vacuumCount?: number | null;
  mopHeadEstimate?: number | null;
  rotationalTaskReminder?: {
    currentWeek: number;
    everyTime: string;
    weeks: readonly { week: number; label: string; weekly: string; biweekly: string; monthly: string }[];
  } | null;
};

function RotationReminder({ reminder }: { reminder: NonNullable<JobCard["rotationalTaskReminder"]> }) {
  return (
    <details className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-950">
      <summary className="cursor-pointer font-semibold">All-day rotation · Week {reminder.currentWeek}</summary>
      <p className="mt-2 font-medium">Every time: {reminder.everyTime}</p>
      <div className="mt-1.5 space-y-1">
        {reminder.weeks.map((week) => (
          <p key={week.week} className={week.week === reminder.currentWeek ? "font-bold" : "text-violet-800"}>
            {week.label}: Weekly — {week.weekly}; Biweekly — {week.biweekly}; Monthly — {week.monthly}
          </p>
        ))}
      </div>
    </details>
  );
}

function EquipmentRow({ job }: { job: JobCard }) {
  const hasConfirmedMopCount = job.mopHeadCount !== null && job.mopHeadCount !== undefined;
  const mopHeads = hasConfirmedMopCount ? String(job.mopHeadCount) : job.mopHeadEstimate === null || job.mopHeadEstimate === undefined ? "Not set" : `~${job.mopHeadEstimate}`;
  return (
    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--co-muted)]" aria-label={`Equipment: Mop heads ${mopHeads}, rags ${job.ragCount ?? "not set"}, vacuum ${job.vacuumCount ?? "not set"}`}>
      <span className={hasConfirmedMopCount ? "inline-flex items-center gap-1 font-medium text-[var(--co-ink)]" : "inline-flex items-center gap-1"}><WashingMachine className="h-3.5 w-3.5 text-[var(--co-evergreen)]" aria-hidden />Mopheads {mopHeads}{!hasConfirmedMopCount && job.mopHeadEstimate !== null && job.mopHeadEstimate !== undefined ? <span className="sr-only"> estimated</span> : null}</span>
      <span className="inline-flex items-center gap-1"><Shirt className="h-3.5 w-3.5 text-[var(--co-evergreen)]" aria-hidden />Rags {job.ragCount ?? "Not set"}</span>
      <span className="inline-flex items-center gap-1"><Wind className="h-3.5 w-3.5 text-[var(--co-evergreen)]" aria-hidden />Vacuum {job.vacuumCount ?? "Not set"}</span>
    </div>
  );
}

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

export default function MyDayClient({
  employeeName,
  employeeTitle,
  companyName,
  companyLogoUrl,
  officePhone,
  companyTimezone,
  weeklyHours,
  currentJob,
  openEntry,
  todayJobs,
  upcomingJobs,
  completedJobs,
  dayLabel,
  currentYear,
}: {
  employeeName: string;
  employeeTitle: string;
  companyName: string;
  companyLogoUrl: string | null;
  officePhone: string | null;
  companyTimezone: string;
  weeklyHours: number;
  currentJob: JobCard | null;
  openEntry: TimeEntry | null;
  todayJobs: JobCard[];
  upcomingJobs: JobCard[];
  completedJobs: JobCard[];
  dayLabel: string;
  currentYear: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(currentJob?.jobId ?? todayJobs[0]?.jobId ?? upcomingJobs[0]?.jobId ?? completedJobs[0]?.jobId ?? null);
  const [localTodayJobs, setLocalTodayJobs] = useState<JobCard[]>(todayJobs);
  const [localUpcomingJobs, setLocalUpcomingJobs] = useState<JobCard[]>(upcomingJobs);
  const [localCompletedJobs, setLocalCompletedJobs] = useState<JobCard[]>(completedJobs);
  const [now, setNow] = useState(0);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [arrivedJobId, setArrivedJobId] = useState<string | null>(null);
  const [mileageDraft, setMileageDraft] = useState<Record<string, string>>({});
  const [editingMileage, setEditingMileage] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Initialize the client-only clock after hydration, then keep it current.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!undoAction) return;
    const id = window.setTimeout(() => setUndoAction(null), 8000);
    return () => window.clearTimeout(id);
  }, [undoAction]);

  useEffect(() => {
    // This state mirrors fresh server data after an action or manual refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalTodayJobs(todayJobs);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalUpcomingJobs(upcomingJobs);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalCompletedJobs(completedJobs);
  }, [todayJobs, upcomingJobs, completedJobs]);

  useEffect(() => {
    if (!selectedJobId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedJobId(currentJob?.jobId ?? todayJobs[0]?.jobId ?? upcomingJobs[0]?.jobId ?? completedJobs[0]?.jobId ?? null);
      return;
    }
    const present =
      todayJobs.some((job) => job.jobId === selectedJobId) ||
      upcomingJobs.some((job) => job.jobId === selectedJobId) ||
      completedJobs.some((job) => job.jobId === selectedJobId);
    if (!present) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedJobId(currentJob?.jobId ?? todayJobs[0]?.jobId ?? upcomingJobs[0]?.jobId ?? completedJobs[0]?.jobId ?? null);
    }
  }, [completedJobs, currentJob?.jobId, selectedJobId, todayJobs, upcomingJobs]);

  const activeJob = useMemo(() => {
    const chosenId = openEntry?.jobId ?? selectedJobId;
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
  }, [currentJob, localCompletedJobs, localTodayJobs, localUpcomingJobs, openEntry?.jobId, selectedJobId]);

  const activeTimerLabel = formatElapsed(openEntry?.clockIn ?? null, now);
  const routeJobs = [...localTodayJobs].sort((a, b) => (a.scheduledStartTime ?? "").localeCompare(b.scheduledStartTime ?? ""));
  const todayRotationJobs = localTodayJobs.filter((job) => job.rotationalTaskReminder);

  async function clockIn(jobId: string, options?: { undoLabel?: string; undoAction?: () => void | Promise<void>; onSuccess?: () => void }) {
    setError(null);
    const res = await fetch(`/api/jobs/${jobId}/clock-in`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof body.error === "string" ? body.error : "Could not clock in.");
      return;
    }
    setSelectedJobId(jobId);
    if (options?.undoAction) setUndoAction({ label: options.undoLabel ?? "Clock in saved", onUndo: options.undoAction });
    if (options?.onSuccess) {
      options.onSuccess();
    } else {
      startTransition(() => router.refresh());
    }
  }

  async function clockOut(jobId: string, options?: { undoLabel?: string; undoAction?: () => void | Promise<void> }) {
    setError(null);
    const res = await fetch(`/api/jobs/${jobId}/clock-out`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof body.error === "string" ? body.error : "Could not clock out.");
      return;
    }
    if (arrivedJobId === jobId) setArrivedJobId(null);
    if (options?.undoAction) setUndoAction({ label: options.undoLabel ?? "Action saved", onUndo: options.undoAction });
    startTransition(() => router.refresh());
  }

  function onMyWay(jobId: string) {
    clockIn(jobId, {
      undoLabel: "Clock in saved",
      undoAction: () => clockOut(jobId),
    });
  }

  function markArrived(jobId: string) {
    setArrivedJobId(jobId);
  }

  function beginJob(jobId: string) {
    router.push(`/my-day/${jobId}`);
  }

  async function saveMileage(job: JobCard) {
    const value = Number(mileageDraft[job.jobId] ?? job.mileageMiles ?? 0);
    const res = await fetch(`/api/jobs/${job.jobId}/mileage`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mileageMiles: value }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(typeof body.error === "string" ? body.error : "Could not save mileage.");
    else {
      setEditingMileage((current) => ({ ...current, [job.jobId]: false }));
      startTransition(() => router.refresh());
    }
  }

  function discardJob(jobId: string) {
    void undoClockIn(jobId);
  }

  async function undoClockIn(jobId: string) {
    setError(null);
    const res = await fetch(`/api/jobs/${jobId}/clock-in`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof body.error === "string" ? body.error : "Could not discard this clock-in.");
      return;
    }
    if (arrivedJobId === jobId) setArrivedJobId(null);
    setUndoAction({ label: "Clock in discarded", onUndo: () => onMyWay(jobId) });
    startTransition(() => router.refresh());
  }

  return (
    <div className="mx-auto max-w-[560px] space-y-4 pb-10">
      <section className="co-card overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]">
            {companyLogoUrl ? (
              <img src={companyLogoUrl} alt={`${companyName} logo`} className="h-full w-full object-contain p-1" />
            ) : (
              <span className="text-xs font-semibold text-[var(--co-ink)]">{companyName.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-[-0.03em] text-[var(--co-ink)]">{employeeName}</h1>
            <p className="text-xs text-[var(--co-muted)]">
              {dayLabel} · {todayJobs.length} stops · {weeklyHours.toFixed(2)}h this week
            </p>
            <p className="sr-only">
              {employeeTitle} at {companyName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="co-button-secondary shrink-0 gap-1.5 px-3 py-1.5 text-xs"
            disabled={pending}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Refresh
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--co-line-soft)] px-4 py-2.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${openEntry ? "animate-pulse bg-emerald-500" : "bg-[var(--co-line)]"}`} aria-hidden />
            <p className="truncate text-xs font-medium text-[var(--co-muted)]">
              {openEntry ? (
                <>
                  Clocked in · <span className="font-mono text-[var(--co-ink)]">{activeTimerLabel}</span>
                  {activeJob ? ` · ${activeJob.customerFirstName} ${activeJob.customerLastName}` : ""}
                </>
              ) : (
                "Not clocked in"
              )}
            </p>
          </div>
          {activeJob && openEntry ? (
            <Link href={`/my-day/${activeJob.jobId}`} className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--co-evergreen)]">
              Continue job
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : officePhone ? (
            <a href={`tel:${officePhone}`} className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--co-evergreen)]">
              <Phone className="h-3.5 w-3.5" aria-hidden />
              Call office
            </a>
          ) : null}
        </div>
      </section>

      {error ? (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <section className="co-card overflow-hidden">
        {todayRotationJobs.length ? (
          <div className="border-b border-violet-200 bg-violet-50 px-4 py-4 text-violet-950 sm:px-5">
            <p className="eyebrow text-violet-800">All-day client reminder</p>
            <h2 className="mt-1 text-lg font-semibold">Rotational tasks</h2>
            <div className="mt-3 space-y-4">
              {todayRotationJobs.map((job) => (
                <div key={job.jobId}>
                  <p className="font-semibold">{job.customerFirstName} {job.customerLastName}</p>
                  <RotationReminder reminder={job.rotationalTaskReminder!} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="border-b border-[var(--co-line-soft)] px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Route preview</p>
              <h2 className="mt-1 text-lg font-semibold">Today&apos;s jobs</h2>
            </div>
            <span className="rounded-full bg-[var(--co-accent-tint)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--co-evergreen)]">
              {routeJobs.length} stops
            </span>
          </div>
          <p className="mt-2 text-sm text-[var(--co-muted)]">
            {routeJobs.length > 0 ? `${routeJobs[0].scheduledDate} service order` : "No route stops scheduled for today."}
          </p>
        </div>
        <div className="space-y-3 p-4 sm:p-5">
          {routeJobs.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--co-surface-muted)]">
                <CalendarCheck className="h-7 w-7 text-[var(--co-muted)]" aria-hidden />
              </div>
              <p className="mt-4 text-base font-medium text-[var(--co-ink)]">That&apos;s everything for today.</p>
            </div>
          ) : (
            routeJobs.map((job, index) => {
              const isNextUp = job.jobId === activeJob?.jobId;
              const isWorking = openEntry?.jobId === job.jobId;
              const bannerLabel = isWorking ? "In progress" : "Next up";
              return (
                <div
                  key={job.jobId}
                  className={`overflow-hidden rounded-xl border bg-[var(--co-surface)] transition-colors ${
                    isNextUp ? "border-[var(--co-evergreen)]" : "border-[var(--co-line-soft)]"
                  }`}
                >
                  {isNextUp ? (
                    <div className="flex items-center justify-between bg-[var(--co-evergreen)] px-4 py-1.5 text-white">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]">{bannerLabel}</span>
                      <span className="text-xs font-medium">{timeLabel(job.scheduledStartTime)}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-3 px-4 py-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--co-surface-muted)] text-xs font-semibold text-[var(--co-ink)]">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--co-ink)]">
                            {job.customerFirstName} {job.customerLastName}
                          </p>
                          <span className="co-badge-neutral mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold">
                            {jobTypeLabel(job.type)}
                          </span>
                          <p className="mt-1 text-xs text-[var(--co-muted)]">
                            {isNextUp
                              ? `${jobAddress(job) || "Address not set"} · ${formatEstimatedTime(job.estimatedDurationMinutes)}`
                              : `${timeLabel(job.scheduledStartTime)} · ${jobAddress(job) || "Address not set"} · ${formatEstimatedTime(job.estimatedDurationMinutes)}`}
                          </p>
                          <EquipmentRow job={job} />
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                              job.role === "lead"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                            }`}
                          >
                            {job.role === "lead" ? "Lead / driver" : job.role === "trainer" ? "Trainer" : "Helper"}
                          </span>
                          {!isNextUp ? <span className="co-badge-neutral rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">Scheduled</span> : null}
                        </div>
                      </div>

                      {isNextUp ? (
                        <>
                          {job.rotationalTaskReminder ? <RotationReminder reminder={job.rotationalTaskReminder} /> : null}
                          {job.role === "lead" ? (
                            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-emerald-900">You are the driver</p>
                                {!editingMileage[job.jobId] ? (
                                  <button
                                    type="button"
                                    onClick={() => setEditingMileage((current) => ({ ...current, [job.jobId]: true }))}
                                    className="-my-1.5 py-1.5 text-xs font-semibold text-emerald-800 underline underline-offset-2"
                                  >
                                    {Number(job.mileageMiles) > 0 ? `${job.mileageMiles} mi logged · Edit` : "Log mileage"}
                                  </button>
                                ) : null}
                              </div>
                              {editingMileage[job.jobId] ? (
                                <div className="mt-2 flex items-center gap-2">
                                  <input aria-label="Mileage miles" type="number" min="0" step="0.1" autoFocus value={mileageDraft[job.jobId] ?? job.mileageMiles} onChange={(event) => setMileageDraft((current) => ({ ...current, [job.jobId]: event.target.value }))} className="co-input w-28 bg-white text-sm" />
                                  <span className="text-xs text-emerald-800">miles</span>
                                  <button type="button" onClick={() => saveMileage(job)} className="co-button-secondary px-2.5 py-1.5 text-xs">Save mileage</button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {job.accessInstructions || job.keyNumber || job.garageCode || job.gateCode || job.alarmCode ? (
                            <details open className="mt-3 rounded-lg border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-3 py-2">
                              <summary className="cursor-pointer text-xs font-semibold text-[var(--co-ink)]">Entry instructions</summary>
                              <div className="mt-2 space-y-2 text-xs text-[var(--co-muted)]">
                                {job.accessInstructions ? <p className="whitespace-pre-line">{job.accessInstructions}</p> : null}
                                {job.keyNumber || job.garageCode || job.gateCode || job.alarmCode ? (
                                  <MaskedCode className="max-w-full text-left text-xs">
                                    {[job.keyNumber && `Key #${job.keyNumber}`, job.garageCode && `Garage ${job.garageCode}`, job.gateCode && `Gate ${job.gateCode}`, job.alarmCode && `Alarm ${job.alarmCode}`].filter(Boolean).join(" · ")}
                                  </MaskedCode>
                                ) : null}
                              </div>
                            </details>
                          ) : null}
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <a
                            href={`https://maps.google.com/?q=${encodeURIComponent(jobAddress(job) || "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="co-button-secondary justify-center gap-1.5"
                          >
                            <MapPin className="h-4 w-4" aria-hidden />
                            Directions
                          </a>
                          <Link href={`/my-day/${job.jobId}`} className="co-button-secondary justify-center gap-1.5">
                            Job details
                          </Link>
                          {isWorking ? (
                            <button
                              type="button"
                              onClick={() => discardJob(job.jobId)}
                              className="co-button-secondary col-span-2 justify-center gap-1.5 border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50"
                              disabled={pending}
                            >
                              <X className="h-4 w-4" aria-hidden />
                              Discard
                            </button>
                          ) : (
                            <button type="button" onClick={() => onMyWay(job.jobId)} className="co-button-primary col-span-2 justify-center gap-1.5" disabled={pending}>
                              <Car className="h-4 w-4" aria-hidden />
                              On my way
                            </button>
                          )}
                          {isWorking ? (
                            arrivedJobId === job.jobId ? (
                              <button type="button" onClick={() => beginJob(job.jobId)} className="co-button-primary justify-center gap-1.5 col-span-2" disabled={pending}>
                                <Play className="h-4 w-4" aria-hidden />
                                Start
                              </button>
                            ) : (
                              <button type="button" onClick={() => markArrived(job.jobId)} className="co-button-primary justify-center gap-1.5 col-span-2" disabled={pending}>
                                <CheckCircle2 className="h-4 w-4" aria-hidden />
                                Arrived
                              </button>
                            )
                          ) : null}
                        </div>
                        </>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <a href={`https://maps.google.com/?q=${encodeURIComponent(jobAddress(job) || "")}`} target="_blank" rel="noreferrer" className="co-button-secondary gap-1.5">
                            <MapPin className="h-4 w-4" aria-hidden /> Directions
                          </a>
                          <Link href={`/my-day/${job.jobId}`} className="co-button-secondary">Job details</Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-4 py-4 sm:px-5">
          <p className="eyebrow">Completed today</p>
          <h2 className="mt-1 text-lg font-semibold">Finished jobs</h2>
        </div>
        <div className="space-y-3 p-4 sm:p-5">
          {completedJobs.length === 0 ? (
            <p className="text-sm text-[var(--co-muted)]">No completed jobs yet.</p>
          ) : (
            completedJobs.map((job) => (
              <Link
                key={job.jobId}
                href={`/my-day/${job.jobId}`}
                className="flex items-start justify-between gap-3 rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-4 py-4 opacity-80 transition-opacity hover:opacity-100"
              >
                <div className="min-w-0">
                  <p className="font-medium text-[var(--co-muted)] line-through decoration-[var(--co-line)]">
                    {job.customerFirstName} {job.customerLastName}
                  </p>
                  <p className="mt-1 text-xs text-[var(--co-faint)]">
                    {dateLabel(job.scheduledDate, companyTimezone)} · {timeLabel(job.scheduledStartTime)} · {formatEstimatedTime(job.estimatedDurationMinutes)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--co-faint)]">{jobAddress(job) || "Address not set"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="co-badge-success inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                    Completed
                  </span>
                  <ChevronRight className="h-4 w-4 text-[var(--co-faint)]" aria-hidden />
                </div>
              </Link>
            ))
          )}
        </div>
      </section>

      <footer className="border-t border-[var(--co-line-soft)] pt-4 text-center">
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-[var(--co-muted)]">
          <Link href="/help-center" className="hover:text-[var(--co-ink)]">
            Help Center
          </Link>
          <Link href="/privacy-policy" className="hover:text-[var(--co-ink)]">
            Privacy Policy
          </Link>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="font-medium text-[var(--co-muted)] hover:text-[var(--co-ink)]">
              Logout
            </button>
          </form>
        </nav>
        <p className="mt-3 text-xs text-[var(--co-faint)]">© {currentYear} ServiceSpark Professional Services</p>
      </footer>

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
