"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Phone,
  MapPin,
  Car,
  CheckCircle2,
  Play,
  X,
  ChevronRight,
  CalendarCheck,
  PawPrint,
  CircleSlash,
  TriangleAlert,
  Sparkles,
  Repeat,
  Clock3,
  Star,
  Package,
} from "lucide-react";
import { timeLabel, jobAddress, formatElapsed, jobTypeLabel } from "@/lib/my-day/job-format";
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
  petNotes?: string | null;
  doNotClean?: string | null;
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

const SERVICE_TYPE_ICON: Record<string, typeof Sparkles> = {
  deep_clean: Sparkles,
  recurring: Repeat,
  one_time: Clock3,
  first_clean: Star,
  move_out: Package,
};

function ServiceTypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = SERVICE_TYPE_ICON[type] ?? Sparkles;
  return <Icon className={className} aria-hidden strokeWidth={1.8} />;
}

function shortDuration(minutes: number | null | undefined) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function weekdayLabel(dateIso: string, timezone: string) {
  const date = new Date(`${dateIso}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return dateIso;
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(date);
}

function relativeTime(scheduledStartTime: string | null, now: number) {
  if (!scheduledStartTime || !now) return null;
  const target = new Date(scheduledStartTime).getTime();
  if (Number.isNaN(target)) return null;
  const diffMin = Math.round((target - now) / 60000);
  if (diffMin > 90 || diffMin < -90) return null;
  if (diffMin > 1) return `in ${diffMin} min`;
  if (diffMin >= -1) return "now";
  return `${Math.abs(diffMin)} min ago`;
}

function roleLabel(role: JobCard["role"]) {
  return role === "lead" ? "You're driving" : role === "trainer" ? "Training" : "Helping";
}

/** Current week's rotation only — folded into the job card it belongs to. Full history stays on the job-detail page. */
function RotationChecklist({ reminder }: { reminder: NonNullable<JobCard["rotationalTaskReminder"]> }) {
  const current = reminder.weeks.find((week) => week.week === reminder.currentWeek);
  const items = [reminder.everyTime, current?.weekly, current?.biweekly, current?.monthly].filter(
    (item): item is string => Boolean(item)
  );
  if (!items.length) return null;
  return (
    <div className="mt-3 rounded-[10px] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-3 py-2.5">
      <p className="type-field-meta font-semibold text-[var(--co-ink)]">This week&apos;s extras</p>
      <ul className="mt-1 space-y-0.5 type-field-meta text-[var(--co-muted)]">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function RouteRow({
  href,
  time,
  name,
  meta,
  done,
  flagged,
}: {
  href: string;
  time: string;
  name: string;
  meta: React.ReactNode;
  done?: boolean;
  flagged?: boolean;
}) {
  return (
    <Link
      href={href}
      className="co-route-row grid min-h-[64px] grid-cols-[50px_18px_minmax(0,1fr)_16px] items-center gap-2.5 border-t border-[var(--co-line-soft)] px-4 py-2.5 transition-colors hover:bg-[var(--co-surface-muted)] sm:px-5"
    >
      <span
        className={`type-field-meta font-semibold tabular-nums ${
          flagged ? "text-[var(--co-spark-text)]" : done ? "text-[var(--co-success)]" : "text-[var(--co-ink)]"
        }`}
      >
        {time}
      </span>
      <span className="co-route-rail flex items-center justify-center">
        <span className={`co-route-node ${done ? "is-done" : ""} ${flagged ? "is-flagged" : ""}`} />
      </span>
      <span className="min-w-0">
        <p className={`type-field-body font-medium ${done ? "text-[var(--co-muted)]" : "text-[var(--co-ink)]"}`}>{name}</p>
        <span className="mt-0.5 flex items-center gap-1.5 type-field-meta text-[var(--co-muted)]">{meta}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--co-faint)]" aria-hidden />
    </Link>
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
  companyTimezone,
  weeklyHours,
  officePhone,
  currentJob,
  openEntry,
  todayJobs,
  upcomingJobs,
  completedJobs,
  dayLabel,
  currentYear,
  isAdmin,
}: {
  employeeName: string;
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
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
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
  const [busy, setBusyState] = useState<Record<string, boolean>>({});

  function setBusy(key: string, value: boolean) {
    setBusyState((current) => ({ ...current, [key]: value }));
  }

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
  const restOfToday = routeJobs.filter((job) => job.jobId !== activeJob?.jobId);
  const restOfWeekUpcoming = localUpcomingJobs.filter((job) => job.jobId !== activeJob?.jobId);
  const weekRows = [...localCompletedJobs, ...restOfWeekUpcoming];
  const dayStarted = Boolean(openEntry) || localCompletedJobs.length > 0;
  const loadout = routeJobs.reduce(
    (acc, job) => {
      acc.mop += job.mopHeadCount ?? job.mopHeadEstimate ?? 0;
      acc.rag += job.ragCount ?? 0;
      acc.vacuum += job.vacuumCount ?? 0;
      return acc;
    },
    { mop: 0, rag: 0, vacuum: 0 }
  );
  const hasLoadout = loadout.mop > 0 || loadout.rag > 0 || loadout.vacuum > 0;

  const isWorking = Boolean(activeJob) && openEntry?.jobId === activeJob?.jobId;
  const hasArrived = Boolean(activeJob) && arrivedJobId === activeJob?.jobId;
  const hasAddress = Boolean(activeJob && jobAddress(activeJob));
  const heroTime = activeJob ? timeLabel(activeJob.scheduledStartTime) : null;
  const hasTime = Boolean(heroTime) && heroTime !== "—" && heroTime !== "Time not set";
  const rel = activeJob ? relativeTime(activeJob.scheduledStartTime, now) : null;

  async function clockIn(jobId: string, options?: { undoLabel?: string; undoAction?: () => void | Promise<void>; onSuccess?: () => void }) {
    setError(null);
    setBusy(`clock:${jobId}`, true);
    try {
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
    } catch {
      setError("Couldn't reach the office — check your signal and try again.");
    } finally {
      setBusy(`clock:${jobId}`, false);
    }
  }

  async function clockOut(jobId: string, options?: { undoLabel?: string; undoAction?: () => void | Promise<void> }) {
    setError(null);
    setBusy(`clock:${jobId}`, true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/clock-out`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not clock out.");
        return;
      }
      if (arrivedJobId === jobId) setArrivedJobId(null);
      if (options?.undoAction) setUndoAction({ label: options.undoLabel ?? "Action saved", onUndo: options.undoAction });
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't reach the office — check your signal and try again.");
    } finally {
      setBusy(`clock:${jobId}`, false);
    }
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
    setError(null);
    setBusy(`mileage:${job.jobId}`, true);
    try {
      const value = Number(mileageDraft[job.jobId] ?? job.mileageMiles ?? 0);
      const res = await fetch(`/api/jobs/${job.jobId}/mileage`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mileageMiles: value }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not save mileage.");
        return;
      }
      setEditingMileage((current) => ({ ...current, [job.jobId]: false }));
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't reach the office — check your signal and try again.");
    } finally {
      setBusy(`mileage:${job.jobId}`, false);
    }
  }

  function discardJob(jobId: string) {
    void undoClockIn(jobId);
  }

  async function undoClockIn(jobId: string) {
    setError(null);
    setBusy(`clock:${jobId}`, true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/clock-in`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not discard this clock-in.");
        return;
      }
      if (arrivedJobId === jobId) setArrivedJobId(null);
      setUndoAction({ label: "Clock in discarded", onUndo: () => onMyWay(jobId) });
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't reach the office — check your signal and try again.");
    } finally {
      setBusy(`clock:${jobId}`, false);
    }
  }

  return (
    <div className="mx-auto max-w-[560px] pb-16">
      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-1 sm:px-5">
        <div className="min-w-0">
          <p className="type-field-title font-bold tracking-[-0.01em] text-[var(--co-ink)]">{dayLabel}</p>
          <p className="mt-0.5 type-field-meta tabular-nums text-[var(--co-muted)]">
            {routeJobs.length > 0
              ? `${routeJobs.length} ${routeJobs.length === 1 ? "stop" : "stops"} · first at ${timeLabel(routeJobs[0].scheduledStartTime)} · ${weeklyHours.toFixed(1)}h this week`
              : `No stops today · ${weeklyHours.toFixed(1)}h this week`}
          </p>
          <p className="sr-only">{employeeName}</p>
        </div>
        {isAdmin ? (
          <Link
            href="/my-day/pto"
            className="flex min-h-11 shrink-0 items-center gap-1.5 type-field-meta font-medium text-[var(--co-muted)] hover:text-[var(--co-ink)]"
          >
            <CalendarCheck className="h-4 w-4" aria-hidden strokeWidth={1.8} />
            Time off
          </Link>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="co-badge-danger mx-4 mb-3 rounded-xl px-4 py-3 type-field-body sm:mx-5">
          {error}
        </p>
      ) : null}

      {openEntry ? (
        <Link
          href={`/my-day/${openEntry.jobId}`}
          aria-label={`Clocked in, continue ${activeJob ? `${activeJob.customerFirstName} ${activeJob.customerLastName}'s job` : "your job"}`}
          className="mx-4 mb-3 flex items-baseline gap-2.5 rounded-[var(--co-radius-card)] border px-3.5 py-2.5 sm:mx-5"
          style={{ background: "color-mix(in srgb, var(--co-success) 12%, var(--co-surface))", borderColor: "color-mix(in srgb, var(--co-success) 26%, transparent)" }}
        >
          <span className="h-2 w-2 shrink-0 animate-pulse self-center rounded-full" style={{ background: "var(--co-success)" }} aria-hidden />
          <span className="font-mono text-[20px] font-semibold tabular-nums tracking-[-0.01em]" style={{ color: "var(--co-success)" }}>
            {activeTimerLabel}
          </span>
          <span className="type-field-meta font-medium text-[var(--co-muted)]">on this house</span>
          <span className="ml-auto type-field-meta font-medium tabular-nums text-[var(--co-muted)]">since {timeLabel(openEntry.clockIn)}</span>
        </Link>
      ) : null}

      {!dayStarted && hasLoadout ? (
        <div className="mx-4 mb-3.5 rounded-[var(--co-radius-card)] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-3.5 py-3 sm:mx-5">
          <p className="type-field-meta font-semibold text-[var(--co-muted)]">Load out for today</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} className="h-[21px] w-[21px] shrink-0 text-[var(--co-muted)]" aria-hidden>
                <path d="M12 2v7" />
                <path d="M7.5 9h9" />
                <path d="M8.6 9 7 21M11 9l-.7 12M13 9l.7 12M15.4 9 17 21" />
              </svg>
              <span>
                <span className="block type-field-body font-bold tabular-nums leading-none">{loadout.mop}</span>
                <span className="block type-field-micro font-medium leading-tight text-[var(--co-muted)]">mop heads</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} className="h-[21px] w-[21px] shrink-0 text-[var(--co-muted)]" aria-hidden>
                <path d="m3 12 9 5 9-5" />
                <path d="m3 7.5 9 5 9-5" />
                <path d="m3 16.5 9 5 9-5" />
              </svg>
              <span>
                <span className="block type-field-body font-bold tabular-nums leading-none">{loadout.rag}</span>
                <span className="block type-field-micro font-medium leading-tight text-[var(--co-muted)]">rags</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} className="h-[21px] w-[21px] shrink-0 text-[var(--co-muted)]" aria-hidden>
                <circle cx="17" cy="6.5" r="3.5" />
                <path d="M17 10v2a5 5 0 0 1-5 5h-1v4" />
                <path d="M4 21h9v-3.5H6.5A2.5 2.5 0 0 0 4 20v1Z" />
              </svg>
              <span>
                <span className="block type-field-body font-bold tabular-nums leading-none">{loadout.vacuum}</span>
                <span className="block type-field-micro font-medium leading-tight text-[var(--co-muted)]">vacuums</span>
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {activeJob ? (
        <div className="border-y border-[var(--co-line-soft)] bg-[var(--co-surface)] px-4 py-5 sm:px-5">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <p className={`type-field-hero tabular-nums ${hasTime ? "text-[var(--co-ink)]" : "text-[var(--co-spark-text)]"}`}>
              {hasTime ? heroTime : "Time not set"}
            </p>
            {rel ? <span className="type-field-meta font-semibold text-[var(--co-muted)]">{rel}</span> : null}
          </div>
          <p className="type-field-display mt-1.5 font-semibold text-[var(--co-ink)]">
            {activeJob.customerFirstName} {activeJob.customerLastName}
          </p>

          {hasAddress ? (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(jobAddress(activeJob))}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 border-b type-field-body font-medium text-[var(--co-accent-text)]"
              style={{ borderColor: "color-mix(in srgb, var(--co-accent-text) 35%, transparent)" }}
            >
              <MapPin className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2.1} />
              {jobAddress(activeJob)}
            </a>
          ) : officePhone ? (
            <a
              href={`tel:${officePhone}`}
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--co-spark-tint)] px-2.5 py-1.5 type-field-meta font-semibold text-[var(--co-spark-text)]"
            >
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={2.1} />
              Address not set · call the office
            </a>
          ) : (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--co-spark-tint)] px-2.5 py-1 type-field-meta font-semibold text-[var(--co-spark-text)]">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={2.1} />
              Address not set
            </p>
          )}

          <p className="mt-2.5 flex items-center gap-1.5 type-field-meta text-[var(--co-muted)]">
            <ServiceTypeIcon type={activeJob.type} className="h-[17px] w-[17px] shrink-0 text-[var(--co-ink)]" />
            {jobTypeLabel(activeJob.type)} · {shortDuration(activeJob.estimatedDurationMinutes) ?? "Est. pending"} · {roleLabel(activeJob.role)}
          </p>

          {activeJob.petNotes || activeJob.doNotClean ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {activeJob.petNotes ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-2.5 py-1 type-field-micro font-semibold text-[var(--co-muted)]">
                  <PawPrint className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.9} />
                  {activeJob.petNotes}
                </span>
              ) : null}
              {activeJob.doNotClean ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-2.5 py-1 type-field-micro font-semibold text-[var(--co-muted)]">
                  <CircleSlash className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.9} />
                  {activeJob.doNotClean}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4">
            {isWorking ? (
              hasArrived ? (
                <button type="button" onClick={() => beginJob(activeJob.jobId)} className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[var(--co-accent-fill)] px-5 text-[17px] font-semibold text-white transition-colors hover:bg-[var(--co-accent-fill-hover)]">
                  <Play className="h-[19px] w-[19px]" aria-hidden />
                  Start
                </button>
              ) : (
                <button type="button" onClick={() => markArrived(activeJob.jobId)} className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[var(--co-accent-fill)] px-5 text-[17px] font-semibold text-white transition-colors hover:bg-[var(--co-accent-fill-hover)]">
                  <CheckCircle2 className="h-[19px] w-[19px]" aria-hidden />
                  Arrived
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => onMyWay(activeJob.jobId)}
                disabled={busy[`clock:${activeJob.jobId}`]}
                className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[var(--co-accent-fill)] px-5 text-[17px] font-semibold text-white transition-colors hover:bg-[var(--co-accent-fill-hover)] disabled:opacity-60"
              >
                <Car className="h-[19px] w-[19px]" aria-hidden />
                {busy[`clock:${activeJob.jobId}`] ? "Saving…" : "On my way"}
              </button>
            )}
          </div>

          {activeJob.accessInstructions || activeJob.keyNumber || activeJob.garageCode || activeJob.gateCode || activeJob.alarmCode ? (
            <details className="mt-3.5">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 type-field-body font-semibold text-[var(--co-muted)] [&::-webkit-details-marker]:hidden">
                <ChevronRight className="h-[15px] w-[15px] shrink-0 transition-transform [details[open]_&]:rotate-90" aria-hidden />
                Entry instructions
              </summary>
              <div className="mt-1 space-y-2 rounded-[10px] bg-[var(--co-surface-muted)] px-3.5 py-3 type-field-meta text-[var(--co-ink)]">
                {activeJob.accessInstructions ? <p className="whitespace-pre-line">{activeJob.accessInstructions}</p> : null}
                {activeJob.keyNumber || activeJob.garageCode || activeJob.gateCode || activeJob.alarmCode ? (
                  <MaskedCode className="max-w-full text-left type-field-meta">
                    {[activeJob.keyNumber && `Key #${activeJob.keyNumber}`, activeJob.garageCode && `Garage ${activeJob.garageCode}`, activeJob.gateCode && `Gate ${activeJob.gateCode}`, activeJob.alarmCode && `Alarm ${activeJob.alarmCode}`].filter(Boolean).join(" · ")}
                  </MaskedCode>
                ) : null}
              </div>
            </details>
          ) : null}

          {activeJob.rotationalTaskReminder ? <RotationChecklist reminder={activeJob.rotationalTaskReminder} /> : null}

          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <Link href={`/my-day/${activeJob.jobId}`} className="flex min-h-11 items-center border-b border-[var(--co-line)] type-field-meta font-semibold text-[var(--co-muted)] hover:text-[var(--co-ink)]">
              Job details
            </Link>
            {activeJob.role === "lead" ? (
              !editingMileage[activeJob.jobId] ? (
                <button
                  type="button"
                  onClick={() => setEditingMileage((current) => ({ ...current, [activeJob.jobId]: true }))}
                  className="flex min-h-11 items-center border-b border-[var(--co-line)] type-field-meta font-semibold text-[var(--co-muted)] hover:text-[var(--co-ink)]"
                >
                  {Number(activeJob.mileageMiles) > 0 ? `${activeJob.mileageMiles} mi logged` : "Log mileage"}
                </button>
              ) : null
            ) : null}
            {isWorking ? (
              <button
                type="button"
                onClick={() => discardJob(activeJob.jobId)}
                disabled={busy[`clock:${activeJob.jobId}`]}
                className="flex min-h-11 items-center border-b border-[var(--co-danger)]/40 type-field-meta font-semibold text-[var(--co-danger)] hover:border-[var(--co-danger)]"
              >
                <X className="mr-1 h-3.5 w-3.5" aria-hidden />
                Discard
              </button>
            ) : null}
          </div>

          {editingMileage[activeJob.jobId] ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                aria-label="Mileage miles"
                type="number"
                min="0"
                step="0.1"
                autoFocus
                value={mileageDraft[activeJob.jobId] ?? activeJob.mileageMiles}
                onChange={(event) => setMileageDraft((current) => ({ ...current, [activeJob.jobId]: event.target.value }))}
                className="co-input w-28 text-sm"
              />
              <span className="type-field-meta text-[var(--co-muted)]">miles</span>
              <button type="button" onClick={() => saveMileage(activeJob)} className="co-button-secondary px-2.5 py-1.5 type-field-meta" disabled={busy[`mileage:${activeJob.jobId}`]}>
                {busy[`mileage:${activeJob.jobId}`] ? "Saving…" : "Save"}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col items-center border-y border-[var(--co-line-soft)] px-4 py-10 text-center sm:px-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--co-surface-muted)]">
            <CalendarCheck className="h-7 w-7 text-[var(--co-muted)]" aria-hidden />
          </div>
          <p className="mt-4 type-field-body font-medium text-[var(--co-ink)]">That&apos;s everything for today.</p>
        </div>
      )}

      {restOfToday.length > 0 ? (
        <div>
          <p className="px-4 pb-2 pt-5 type-field-meta font-semibold text-[var(--co-muted)] sm:px-5">Rest of today</p>
          <div>
            {restOfToday.map((job) => {
              const flagged = !jobAddress(job);
              return (
                <RouteRow
                  key={job.jobId}
                  href={`/my-day/${job.jobId}`}
                  time={timeLabel(job.scheduledStartTime)}
                  name={`${job.customerFirstName} ${job.customerLastName}`}
                  flagged={flagged}
                  meta={
                    flagged ? (
                      <>
                        <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-[var(--co-spark-text)]" aria-hidden strokeWidth={2.1} />
                        <span className="text-[var(--co-spark-text)]">No address · call office</span>
                      </>
                    ) : (
                      <>
                        <ServiceTypeIcon type={job.type} className="h-[15px] w-[15px] shrink-0" />
                        {jobTypeLabel(job.type)} · {job.city ?? "No city"} · {shortDuration(job.estimatedDurationMinutes) ?? "Est. pending"}
                      </>
                    )
                  }
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {weekRows.length > 0 ? (
        <div>
          <p className="px-4 pb-2 pt-5 type-field-meta font-semibold text-[var(--co-muted)] sm:px-5">Rest of the week</p>
          <div>
            {localCompletedJobs.map((job) => (
              <RouteRow
                key={job.jobId}
                href={`/my-day/${job.jobId}`}
                time="Today"
                name={`${job.customerFirstName} ${job.customerLastName}`}
                done
                meta={
                  <>
                    <ServiceTypeIcon type={job.type} className="h-[15px] w-[15px] shrink-0" />
                    {jobTypeLabel(job.type)} · Completed
                  </>
                }
              />
            ))}
            {restOfWeekUpcoming.map((job) => {
              const flagged = !jobAddress(job);
              return (
                <RouteRow
                  key={job.jobId}
                  href={`/my-day/${job.jobId}`}
                  time={weekdayLabel(job.scheduledDate, companyTimezone)}
                  name={`${job.customerFirstName} ${job.customerLastName}`}
                  flagged={flagged}
                  meta={
                    flagged ? (
                      <>
                        <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-[var(--co-spark-text)]" aria-hidden strokeWidth={2.1} />
                        <span className="text-[var(--co-spark-text)]">No address · call office</span>
                      </>
                    ) : (
                      <>
                        <ServiceTypeIcon type={job.type} className="h-[15px] w-[15px] shrink-0" />
                        {jobTypeLabel(job.type)} · {job.city ?? "No city"} · {timeLabel(job.scheduledStartTime)}
                      </>
                    )
                  }
                />
              );
            })}
          </div>
        </div>
      ) : null}

      <footer className="mt-8 border-t border-[var(--co-line-soft)] px-4 pt-4 text-center sm:px-5">
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 type-field-meta font-medium text-[var(--co-muted)]">
          {isAdmin ? (
            <>
              <Link href="/help-center" className="inline-flex min-h-11 items-center hover:text-[var(--co-ink)]">
                Help Center
              </Link>
              <Link href="/privacy-policy" className="inline-flex min-h-11 items-center hover:text-[var(--co-ink)]">
                Privacy Policy
              </Link>
            </>
          ) : null}
          {officePhone ? (
            <a href={`tel:${officePhone}`} className="inline-flex min-h-11 items-center gap-1 hover:text-[var(--co-ink)]">
              <Phone className="h-3.5 w-3.5" aria-hidden />
              Call office
            </a>
          ) : null}
          {isAdmin ? (
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="inline-flex min-h-11 items-center font-medium text-[var(--co-muted)] hover:text-[var(--co-ink)]">
                Logout
              </button>
            </form>
          ) : null}
        </nav>
        <p className="mt-3 type-field-micro text-[var(--co-faint)]">© {currentYear} ServiceSpark Professional Services</p>
      </footer>

      {undoAction ? (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] left-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface)] px-4 py-3 shadow-[0_10px_32px_rgba(18,24,19,0.12)]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="type-field-body font-medium text-[var(--co-ink)]">{undoAction.label}</p>
              <p className="type-field-meta text-[var(--co-muted)]">Tap undo if you hit the wrong button.</p>
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
