"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
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
  Users,
} from "lucide-react";
import { timeLabel, timestampLabel, jobAddress, jobTypeLabel, recurringFrequencyLabel } from "@/lib/my-day/job-format";
import type { LedgerEvent, PrimaryAction, WorkdayNow, WorkState } from "@/lib/my-day/workday-state";
import { MaskedCode } from "@/components/ui/masked-code";
import NowRegion from "./now-region";
import Ledger from "./ledger";

type StopCard = {
  jobId: string;
  customerId: string;
  role: "lead" | "helper" | "trainer";
  mileageMiles: string;
  status: string;
  workState: WorkState;
  scheduledDate: string;
  scheduledStartTime: string | null;
  type: string;
  recurrenceFrequency?: string | null;
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
  completedAt: string | null;
  travelStartedAt: string | null;
  arrivedAt: string | null;
  workStartedAt: string | null;
  myClosedEntry: { clockIn: string; clockOut: string; minutesWorked: number | null } | null;
  coworkers: Array<{ firstName: string; done: boolean }>;
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
  return <Icon className={className} aria-hidden strokeWidth={1.75} />;
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

function roleLabel(role: StopCard["role"]) {
  return role === "lead" ? "You're driving" : role === "trainer" ? "Training" : "Helping";
}

function serviceLabel(job: { type: string; recurrenceFrequency?: string | null }) {
  return job.type === "recurring" ? recurringFrequencyLabel(job.recurrenceFrequency) ?? jobTypeLabel(job.type) : jobTypeLabel(job.type);
}

function formatNameList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

const ACTION_ICON: Partial<Record<PrimaryAction["id"], typeof Car>> = {
  start_travel: Car,
  arrived: CheckCircle2,
  start_work: Play,
  wrap_up: CheckCircle2,
};

function RotationChecklist({ reminder }: { reminder: NonNullable<StopCard["rotationalTaskReminder"]> }) {
  const current = reminder.weeks.find((week) => week.week === reminder.currentWeek);
  const items = [reminder.everyTime, current?.weekly, current?.biweekly, current?.monthly].filter((item): item is string => Boolean(item));
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
  href?: string;
  time: string;
  name: string;
  meta: React.ReactNode;
  done?: boolean;
  flagged?: boolean;
}) {
  const inner = (
    <>
      <span className={`type-field-meta font-semibold tabular-nums ${flagged ? "text-[var(--co-spark-text)]" : done ? "text-[var(--co-success)]" : "text-[var(--co-ink)]"}`}>
        {time}
      </span>
      <span className="co-route-rail flex items-center justify-center">
        <span className={`co-route-node ${done ? "is-done" : ""} ${flagged ? "is-flagged" : ""}`} />
      </span>
      <span className="min-w-0">
        <p className={`truncate type-field-body font-medium ${done ? "text-[var(--co-muted)]" : "text-[var(--co-ink)]"}`}>{name}</p>
        <span className="mt-0.5 flex items-center gap-1.5 type-field-meta text-[var(--co-muted)]">{meta}</span>
      </span>
      {href ? <ChevronRight className="h-4 w-4 shrink-0 text-[var(--co-faint)]" aria-hidden /> : <span aria-hidden />}
    </>
  );
  const className =
    "co-route-row grid min-h-[64px] grid-cols-[50px_18px_minmax(0,1fr)_16px] items-center gap-2.5 border-t border-[var(--co-line-soft)] px-4 py-2.5 sm:px-5";
  return href ? (
    <Link href={href} className={`${className} transition-colors hover:bg-[var(--co-surface-muted)]`}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

type UndoAction = { label: string; onUndo: () => void | Promise<void> };

export default function MyDayClient({
  employeeName,
  companyTimezone,
  weeklyHours,
  officePhone,
  workdayNow,
  primaryAction,
  ledger,
  stops,
  upcomingJobs,
  dayLabel,
  currentYear,
  isAdmin,
}: {
  employeeName: string;
  officePhone: string | null;
  companyTimezone: string;
  weeklyHours: number;
  workdayNow: WorkdayNow;
  primaryAction: PrimaryAction;
  ledger: LedgerEvent[];
  stops: StopCard[];
  upcomingJobs: Array<Omit<StopCard, "workState" | "completedAt" | "travelStartedAt" | "arrivedAt" | "workStartedAt" | "myClosedEntry" | "coworkers">>;
  dayLabel: string;
  currentYear: number;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [mileageDraft, setMileageDraft] = useState<Record<string, string>>({});
  const [editingMileage, setEditingMileage] = useState<Record<string, boolean>>({});
  const [mileageBusy, setMileageBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!undoAction) return;
    const id = window.setTimeout(() => setUndoAction(null), 8000);
    return () => window.clearTimeout(id);
  }, [undoAction]);

  useEffect(() => {
    if (!receipt) return;
    const id = window.setTimeout(() => setReceipt(null), 6000);
    return () => window.clearTimeout(id);
  }, [receipt]);

  const currentStop = workdayNow.currentStopId ? stops.find((stop) => stop.jobId === workdayNow.currentStopId) ?? null : null;
  const isStale = workdayNow.state === "stale_entry";
  const todayStops = stops.filter((stop) => stop.workState !== "stale_entry");
  const routeStops = todayStops
    .filter((stop) => stop.jobId !== currentStop?.jobId && !stop.myClosedEntry)
    .sort((a, b) => (a.scheduledStartTime ?? "~").localeCompare(b.scheduledStartTime ?? "~"));
  const waitingStops = todayStops.filter((stop) => stop.jobId !== currentStop?.jobId && stop.myClosedEntry && !stop.completedAt);
  const dayStarted = todayStops.some((stop) => stop.travelStartedAt);
  const loadout = todayStops.reduce(
    (acc, stop) => {
      acc.mop += stop.mopHeadCount ?? stop.mopHeadEstimate ?? 0;
      acc.rag += stop.ragCount ?? 0;
      acc.vacuum += stop.vacuumCount ?? 0;
      return acc;
    },
    { mop: 0, rag: 0, vacuum: 0 }
  );
  const hasLoadout = loadout.mop > 0 || loadout.rag > 0 || loadout.vacuum > 0;
  // The day's first stop is the earliest of ALL today's stops — not the
  // earliest of the ones left. Deriving it from `routeStops` (which excludes
  // the current stop) made the header name the SECOND stop while the Now
  // region named the first, putting two different times on one screen.
  const firstStopToday = [...todayStops].sort((a, b) => (a.scheduledStartTime ?? "~").localeCompare(b.scheduledStartTime ?? "~"))[0];

  /** One request id per user tap, reused across retries of that same tap so a
   * repeat can be recognised as the same intent rather than a new one. */
  function newRequestId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  }

  async function runTransition(action: PrimaryAction) {
    if (!action.jobId || !action.transitionTo || busy) return;
    setError(null);
    setUncertain(false);
    setBusy(true);
    const stop = stops.find((item) => item.jobId === action.jobId);
    const name = stop ? `${stop.customerFirstName} ${stop.customerLastName}` : "this stop";
    try {
      const res = await fetch(`/api/jobs/${action.jobId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: action.transitionTo, clientRequestId: newRequestId() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "That didn't save. Call the office if it keeps happening.");
        return;
      }
      // `idempotent: true` means the transition was already recorded — that is
      // success, not an error. Showing a red message here is what made a
      // double-tap look like a failure.
      const stamp =
        action.transitionTo === "traveling"
          ? body.travelStartedAt
          : action.transitionTo === "arrived"
            ? body.arrivedAt
            : body.workStartedAt;
      const verb = action.transitionTo === "traveling" ? "Travel started" : action.transitionTo === "arrived" ? "Arrival recorded" : "Cleaning started";
      setReceipt(stamp ? `${verb} · ${timestampLabel(stamp, companyTimezone)}` : `${verb} · saved`);
      if (action.transitionTo === "traveling") {
        setUndoAction({ label: `${verb} at ${name}`, onUndo: () => discardStart(action.jobId!) });
      }
      startTransition(() => router.refresh());
    } catch {
      // The request may well have succeeded before the connection dropped.
      // Never invite a blind repeat of a mutation that might already be saved.
      setUncertain(true);
    } finally {
      setBusy(false);
    }
  }

  async function discardStart(jobId: string) {
    setError(null);
    setUncertain(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/clock-in`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not discard this start.");
        return;
      }
      setReceipt("Start discarded · this stop is back on your route");
      startTransition(() => router.refresh());
    } catch {
      setUncertain(true);
    } finally {
      setBusy(false);
    }
  }

  async function saveMileage(stop: StopCard) {
    setError(null);
    setMileageBusy((current) => ({ ...current, [stop.jobId]: true }));
    try {
      const value = Number(mileageDraft[stop.jobId] ?? stop.mileageMiles ?? 0);
      const res = await fetch(`/api/jobs/${stop.jobId}/mileage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mileageMiles: value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not save mileage.");
        return;
      }
      setEditingMileage((current) => ({ ...current, [stop.jobId]: false }));
      startTransition(() => router.refresh());
    } catch {
      setUncertain(true);
    } finally {
      setMileageBusy((current) => ({ ...current, [stop.jobId]: false }));
    }
  }

  function onPrimaryAction() {
    if (primaryAction.transitionTo) {
      void runTransition(primaryAction);
      return;
    }
    if (primaryAction.id === "wrap_up" && primaryAction.jobId) {
      router.push(`/my-day/${primaryAction.jobId}`);
      return;
    }
    if (primaryAction.id === "back_to_my_day" || primaryAction.id === "review_day") {
      startTransition(() => router.refresh());
    }
  }

  const ActionIcon = ACTION_ICON[primaryAction.id];
  const address = currentStop ? jobAddress(currentStop) : "";

  return (
    <div className="mx-auto max-w-[560px] pb-16">
      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-1 sm:px-5">
        <div className="min-w-0">
          <p className="type-field-title font-bold tracking-[-0.01em] text-[var(--co-ink)]">{dayLabel}</p>
          <p className="mt-0.5 type-field-meta tabular-nums text-[var(--co-muted)]">
            {todayStops.length > 0
              ? `${todayStops.length} ${todayStops.length === 1 ? "stop" : "stops"}${firstStopToday ? ` · first at ${timeLabel(firstStopToday.scheduledStartTime)}` : ""} · ${weeklyHours.toFixed(1)}h recorded this week`
              : `No stops today · ${weeklyHours.toFixed(1)}h recorded this week`}
          </p>
          <p className="sr-only">{employeeName}</p>
        </div>
        {isAdmin ? (
          <Link href="/my-day/pto" className="flex min-h-11 shrink-0 items-center gap-1.5 type-field-meta font-medium text-[var(--co-muted)] hover:text-[var(--co-ink)]">
            <CalendarCheck className="h-4 w-4" aria-hidden strokeWidth={1.75} />
            Time off
          </Link>
        ) : null}
      </div>

      <NowRegion now={workdayNow} />

      {receipt ? (
        <p role="status" className="mx-4 mt-3 rounded-xl border px-3.5 py-2.5 type-field-meta font-medium sm:mx-5" style={{ background: "color-mix(in srgb, var(--co-success) 10%, var(--co-surface))", borderColor: "color-mix(in srgb, var(--co-success) 26%, transparent)", color: "var(--co-ink)" }}>
          {receipt}
        </p>
      ) : null}

      {uncertain ? (
        <div role="alert" className="mx-4 mt-3 rounded-xl border border-[var(--co-line)] bg-[var(--co-surface-muted)] px-3.5 py-3 sm:mx-5">
          <p className="type-field-body font-semibold text-[var(--co-ink)]">We couldn&apos;t confirm whether that was saved.</p>
          <p className="mt-1 type-field-meta text-[var(--co-muted)]">Check before trying again — it may already be recorded.</p>
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
        <p role="alert" className="co-badge-danger mx-4 mt-3 rounded-xl px-4 py-3 type-field-body sm:mx-5">
          {error}
        </p>
      ) : null}

      {isStale && officePhone ? (
        <div className="mx-4 mt-3 rounded-xl border border-[var(--co-line)] bg-[var(--co-spark-tint)] px-3.5 py-3 sm:mx-5">
          <p className="type-field-meta text-[var(--co-spark-text)]">
            Call the office to get this closed at the right time — starting a new stop isn&apos;t possible until it is.
          </p>
          <a href={`tel:${officePhone}`} className="mt-2 inline-flex min-h-11 items-center gap-1.5 type-field-meta font-semibold text-[var(--co-spark-text)]">
            <Phone className="h-3.5 w-3.5" aria-hidden />
            Call the office
          </a>
        </div>
      ) : null}

      {!dayStarted && hasLoadout ? (
        <div className="mx-4 mb-3.5 mt-3 rounded-[var(--co-radius-card)] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-3.5 py-3 sm:mx-5">
          <p className="type-field-meta font-semibold text-[var(--co-muted)]">Load out for today</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} className="h-[21px] w-[21px] shrink-0 text-[var(--co-muted)]" aria-hidden>
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} className="h-[21px] w-[21px] shrink-0 text-[var(--co-muted)]" aria-hidden>
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} className="h-[21px] w-[21px] shrink-0 text-[var(--co-muted)]" aria-hidden>
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

      {currentStop && !isStale ? (
        <div className="mt-3 border-y border-[var(--co-line-soft)] bg-[var(--co-surface)] px-4 py-5 sm:px-5">
          <p className="type-field-display font-semibold text-[var(--co-ink)]">
            {currentStop.customerFirstName} {currentStop.customerLastName}
          </p>
          <p className="mt-0.5 type-field-meta tabular-nums text-[var(--co-muted)]">
            Scheduled {timeLabel(currentStop.scheduledStartTime)}
          </p>

          {address ? (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 border-b type-field-body font-medium text-[var(--co-accent-text)]"
              style={{ borderColor: "color-mix(in srgb, var(--co-accent-text) 35%, transparent)" }}
            >
              <MapPin className="h-4 w-4 shrink-0" aria-hidden strokeWidth={1.75} />
              {address}
            </a>
          ) : officePhone ? (
            <a href={`tel:${officePhone}`} className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--co-spark-tint)] px-2.5 py-1.5 type-field-meta font-semibold text-[var(--co-spark-text)]">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
              Address not set · call the office
            </a>
          ) : (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--co-spark-tint)] px-2.5 py-1 type-field-meta font-semibold text-[var(--co-spark-text)]">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
              Address not set
            </p>
          )}

          <p className="mt-2.5 flex items-center gap-1.5 type-field-meta text-[var(--co-muted)]">
            <ServiceTypeIcon type={currentStop.type} className="h-[17px] w-[17px] shrink-0 text-[var(--co-ink)]" />
            {serviceLabel(currentStop)} · {shortDuration(currentStop.estimatedDurationMinutes) ?? "Est. pending"} · {roleLabel(currentStop.role)}
          </p>

          {currentStop.petNotes || currentStop.doNotClean ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {currentStop.petNotes ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-2.5 py-1 type-field-micro font-semibold text-[var(--co-muted)]">
                  <PawPrint className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
                  {currentStop.petNotes}
                </span>
              ) : null}
              {currentStop.doNotClean ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-2.5 py-1 type-field-micro font-semibold text-[var(--co-muted)]">
                  <CircleSlash className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
                  {currentStop.doNotClean}
                </span>
              ) : null}
            </div>
          ) : null}

          {primaryAction.id !== "none" ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={onPrimaryAction}
                disabled={busy}
                className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[var(--co-accent-fill)] px-5 text-[17px] font-semibold text-white transition-colors hover:bg-[var(--co-accent-fill-hover)] disabled:opacity-60"
              >
                {ActionIcon ? <ActionIcon className="h-[19px] w-[19px]" aria-hidden /> : null}
                {busy ? "Saving…" : primaryAction.label}
              </button>
            </div>
          ) : null}

          {currentStop.accessInstructions || currentStop.keyNumber || currentStop.garageCode || currentStop.gateCode || currentStop.alarmCode ? (
            <details className="mt-3.5">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 type-field-body font-semibold text-[var(--co-muted)] [&::-webkit-details-marker]:hidden">
                <ChevronRight className="h-[15px] w-[15px] shrink-0 transition-transform [details[open]_&]:rotate-90" aria-hidden />
                Entry instructions
              </summary>
              <div className="mt-1 space-y-2 rounded-[10px] bg-[var(--co-surface-muted)] px-3.5 py-3 type-field-meta text-[var(--co-ink)]">
                {currentStop.accessInstructions ? <p className="whitespace-pre-line">{currentStop.accessInstructions}</p> : null}
                {currentStop.keyNumber || currentStop.garageCode || currentStop.gateCode || currentStop.alarmCode ? (
                  <MaskedCode className="max-w-full text-left type-field-meta">
                    {[currentStop.keyNumber && `Key #${currentStop.keyNumber}`, currentStop.garageCode && `Garage ${currentStop.garageCode}`, currentStop.gateCode && `Gate ${currentStop.gateCode}`, currentStop.alarmCode && `Alarm ${currentStop.alarmCode}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </MaskedCode>
                ) : null}
              </div>
            </details>
          ) : null}

          {currentStop.rotationalTaskReminder ? <RotationChecklist reminder={currentStop.rotationalTaskReminder} /> : null}

          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <Link href={`/my-day/${currentStop.jobId}`} className="flex min-h-11 items-center border-b border-[var(--co-line)] type-field-meta font-semibold text-[var(--co-muted)] hover:text-[var(--co-ink)]">
              Job details
            </Link>
            {currentStop.role === "lead" && !editingMileage[currentStop.jobId] ? (
              <button
                type="button"
                onClick={() => setEditingMileage((current) => ({ ...current, [currentStop.jobId]: true }))}
                className="flex min-h-11 items-center border-b border-[var(--co-line)] type-field-meta font-semibold text-[var(--co-muted)] hover:text-[var(--co-ink)]"
              >
                {Number(currentStop.mileageMiles) > 0 ? `${currentStop.mileageMiles} mi logged` : "Log mileage"}
              </button>
            ) : null}
            {currentStop.travelStartedAt && !currentStop.myClosedEntry ? (
              <button
                type="button"
                onClick={() => void discardStart(currentStop.jobId)}
                disabled={busy}
                className="flex min-h-11 items-center border-b border-[var(--co-danger)]/40 type-field-meta font-semibold text-[var(--co-danger)] hover:border-[var(--co-danger)] disabled:opacity-60"
              >
                <X className="mr-1 h-3.5 w-3.5" aria-hidden />
                Discard start
              </button>
            ) : null}
          </div>

          {editingMileage[currentStop.jobId] ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                aria-label="Mileage miles"
                type="number"
                min="0"
                step="0.1"
                autoFocus
                value={mileageDraft[currentStop.jobId] ?? currentStop.mileageMiles}
                onChange={(event) => setMileageDraft((current) => ({ ...current, [currentStop.jobId]: event.target.value }))}
                className="co-input w-28 text-sm"
              />
              <span className="type-field-meta text-[var(--co-muted)]">miles</span>
              <button type="button" onClick={() => void saveMileage(currentStop)} className="co-button-secondary px-2.5 py-1.5 type-field-meta" disabled={mileageBusy[currentStop.jobId]}>
                {mileageBusy[currentStop.jobId] ? "Saving…" : "Save"}
              </button>
            </div>
          ) : null}
        </div>
      ) : !currentStop ? (
        <div className="mt-3 flex flex-col items-center border-y border-[var(--co-line-soft)] px-4 py-10 text-center sm:px-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--co-surface-muted)]">
            <CalendarCheck className="h-7 w-7 text-[var(--co-muted)]" aria-hidden />
          </div>
          <p className="mt-4 type-field-body font-medium text-[var(--co-ink)]">
            {todayStops.length === 0 ? "No stops today." : "That's everything for today."}
          </p>
        </div>
      ) : null}

      {waitingStops.length > 0 ? (
        <div>
          <p className="px-4 pb-2 pt-5 type-field-meta font-semibold text-[var(--co-muted)] sm:px-5">Waiting on your crew</p>
          {waitingStops.map((stop) => (
            <RouteRow
              key={stop.jobId}
              time={timeLabel(stop.scheduledStartTime)}
              name={`${stop.customerFirstName} ${stop.customerLastName}`}
              done
              meta={
                <>
                  <Users className="h-[15px] w-[15px] shrink-0" aria-hidden strokeWidth={1.75} />
                  Your work is saved · waiting on {formatNameList(stop.coworkers.filter((coworker) => !coworker.done).map((coworker) => coworker.firstName)) || "the rest of the crew"}
                </>
              }
            />
          ))}
        </div>
      ) : null}

      {routeStops.length > 0 ? (
        <div>
          <p className="px-4 pb-2 pt-5 type-field-meta font-semibold text-[var(--co-muted)] sm:px-5">Rest of today</p>
          {routeStops.map((stop) => {
            const flagged = !jobAddress(stop);
            return (
              <RouteRow
                key={stop.jobId}
                href={`/my-day/${stop.jobId}`}
                time={timeLabel(stop.scheduledStartTime)}
                name={`${stop.customerFirstName} ${stop.customerLastName}`}
                flagged={flagged}
                meta={
                  flagged ? (
                    <>
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-[var(--co-spark-text)]" aria-hidden strokeWidth={1.75} />
                      <span className="text-[var(--co-spark-text)]">No address · call office</span>
                    </>
                  ) : (
                    <>
                      <ServiceTypeIcon type={stop.type} className="h-[15px] w-[15px] shrink-0" />
                      {serviceLabel(stop)} · {stop.city ?? "No city"} · {shortDuration(stop.estimatedDurationMinutes) ?? "Est. pending"}
                    </>
                  )
                }
              />
            );
          })}
        </div>
      ) : null}

      <Ledger events={ledger} timeZone={companyTimezone} />

      {upcomingJobs.length > 0 ? (
        <div>
          <p className="px-4 pb-2 pt-5 type-field-meta font-semibold text-[var(--co-muted)] sm:px-5">Rest of the week</p>
          {upcomingJobs.map((stop) => {
            const flagged = !jobAddress(stop);
            return (
              <RouteRow
                key={stop.jobId}
                href={`/my-day/${stop.jobId}`}
                time={weekdayLabel(stop.scheduledDate, companyTimezone)}
                name={`${stop.customerFirstName} ${stop.customerLastName}`}
                flagged={flagged}
                meta={
                  flagged ? (
                    <>
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-[var(--co-spark-text)]" aria-hidden strokeWidth={1.75} />
                      <span className="text-[var(--co-spark-text)]">No address · call office</span>
                    </>
                  ) : (
                    <>
                      <ServiceTypeIcon type={stop.type} className="h-[15px] w-[15px] shrink-0" />
                      {serviceLabel(stop)} · {stop.city ?? "No city"} · {timeLabel(stop.scheduledStartTime)}
                    </>
                  )
                }
              />
            );
          })}
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
        <p className="mt-3 type-field-micro text-[var(--co-faint)]">© {currentYear} Shimmer Professional Services</p>
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
