"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { TriangleAlert } from "lucide-react";
import { useDialogFocus } from "@/app/(app)/calendar/dialog-focus";
import TeamSearchPicker from "@/components/team-search-picker";
import { DateInput } from "@/components/date-input";
import { TimeInput } from "@/components/time-input";
import { addDays, toISODate } from "@/lib/scheduling/dates";
import type {
  BookingWindowKey,
  CustomerSchedulingProfile,
  NearbyJob,
  RankedSlot,
  SlotFinderIntent,
  SlotRequest,
  SlotResponse,
  SlotSignal,
} from "@/lib/scheduling/slot-contract";

type Employee = { id: string; firstName: string; lastName: string };

/** What the panel hands back to the caller — already normalized to the
 * shape every host needs for `commitJobPatch`, whether the dispatcher
 * picked a ranked slot or dropped into manual override. */
export type SlotFinderSelection = {
  date: string;
  /** "HH:MM:SS", ready for `scheduledStartTime`. */
  startTime: string;
  employeeIds: string[];
  employeeNames: string[];
  /** Present when this came from a ranked recommendation, absent for manual override. */
  slot?: RankedSlot;
  /** The verb-first summary shown on the confirm button — reuse verbatim in
   * the resulting toast so the confirmation matches what was promised. */
  label: string;
};

export type SlotFinderProps = {
  intent: SlotFinderIntent;
  /** Every Calendar entry point acts on an existing job row — even "assign"
   * (crew not yet picked) and "rebook" (the same job re-opened after a
   * cancel), so the request always excludes this job's own time from
   * conflict checks per the contract. */
  jobId: string;
  customerName: string;
  /** Where the search starts. Never before today — callers clamp this. */
  anchorDate: string;
  /** Shown in the header context line for reschedule/rebook. Omit for assign. */
  currentSchedule?: { date: string; startTime: string | null } | null;
  /** Pre-fills "Pick a different time" when it differs from `currentSchedule`
   * (e.g. assign, where the header omits the date/time line but the manual
   * fallback should still default to the job's already-committed date). */
  manualDefaults?: { date?: string; startTime?: string | null };
  /** Seeds the manual crew picker — usually the job's current assignment. */
  currentEmployeeIds?: string[];
  employees: Employee[];
  onClose: () => void;
  onConfirm: (selection: SlotFinderSelection) => void;
  /** Wired up when the host can cancel this job (every current host can).
   * Called with a ready-to-use cancellation reason — built here from the
   * customer's own cadence — when the dispatcher decides not to book at all
   * because the customer isn't due yet. The host applies it through the same
   * `status: "cancelled" + skipOccurrence: true` patch the Calendar rail's
   * skip action already uses; this never invents a second cancel path. */
  onSkip?: (reason: string) => void;
  saving?: boolean;
  submitError?: string | null;
};

const DEFAULT_WINDOW_DAYS = 14;
/** The server rejects any startDate..endDate span over 60 calendar days
 * (`MAX_RANGE_DAYS` in the slots route) — cap widening here so "Look two
 * weeks further" never produces a request the server will 400. */
const MAX_WINDOW_DAYS = 60;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function weekdayLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(new Date(`${value}T00:00:00`));
}

function displayTime(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return `${((hour + 11) % 12) + 1}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

function crewNames(names: string[]) {
  const clean = names.filter(Boolean);
  if (clean.length === 0) return "no one yet";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}

function verbLabel(intent: SlotFinderIntent) {
  if (intent === "assign") return "Assign this visit";
  if (intent === "rebook") return "Rebook this visit";
  return "Move this visit";
}

function slotConfirmLabel(intent: SlotFinderIntent, slot: RankedSlot) {
  if (intent === "assign") return `Assign ${crewNames(slot.employeeNames)}`;
  if (intent === "rebook") return `Rebook for ${weekdayLabel(slot.date)}`;
  return `Move to ${weekdayLabel(slot.date)}`;
}

function manualConfirmLabel(intent: SlotFinderIntent, date: string, names: string[]) {
  if (intent === "assign") return `Assign ${crewNames(names)}`;
  if (intent === "rebook") return `Rebook for ${weekdayLabel(date)}`;
  return `Move to ${weekdayLabel(date)}`;
}

function endDateFor(anchorDate: string, windowDays: number) {
  return toISODate(addDays(new Date(`${anchorDate}T00:00:00Z`), Math.max(windowDays, 1) - 1));
}

function headlineSignal(signals: SlotSignal[]): SlotSignal | null {
  return signals.reduce<SlotSignal | null>((best, signal) => {
    if (signal.weight < 0) return best;
    if (!best || signal.weight > best.weight) return signal;
    return best;
  }, null);
}

/** Turns a measured/booked cadence into a word a dispatcher would say —
 * "monthly", "biweekly", "every 6 weeks" — falling back to a raw day count
 * only when the gap doesn't land on a clean weekly multiple. */
function cadenceLabel(gapDays: number | null): string | null {
  if (gapDays == null || gapDays <= 0) return null;
  if (gapDays === 7) return "weekly";
  if (gapDays === 14) return "biweekly";
  if (gapDays === 28) return "every 4 weeks";
  if (gapDays === 30) return "monthly";
  if (gapDays % 7 === 0) return `every ${gapDays / 7} weeks`;
  return `every ${gapDays} days`;
}

/** The always-visible recency line for the header: what the customer's
 * cadence actually is and whether they're due. Null (render nothing) when
 * there is no completed history yet — a first-ever visit says nothing about
 * recency rather than showing an empty or "never" row. */
function recencyLine(profile: CustomerSchedulingProfile, todayIso: string): { text: string; warning: boolean } | null {
  if (!profile.lastVisit) return null;
  const daysAgo = profile.lastVisit.daysAgo;
  const agoText = daysAgo <= 0 ? "today" : daysAgo === 1 ? "1 day ago" : `${daysAgo} days ago`;
  const crew = crewNames(profile.lastVisit.employees.map((employee) => `${employee.firstName} ${employee.lastName}`));
  const base = `Last cleaned ${agoText} by ${crew}`;
  if (!profile.nextDueDate) return { text: base, warning: false };
  const isFuture = profile.nextDueDate > todayIso;
  const cadenceDays = profile.expectedGapDays ?? profile.typicalGapDays;
  const cadenceWord = cadenceLabel(cadenceDays);
  const cadenceNoun = profile.expectedGapDays != null ? "service" : "cadence";
  const cadencePhrase = cadenceWord ? `${cadenceWord} ${cadenceNoun}` : null;
  const duePhrase = isFuture ? `not due until ${displayDate(profile.nextDueDate)}` : `next due ${displayDate(profile.nextDueDate)}`;
  const tail = cadencePhrase ? `${cadencePhrase}, ${duePhrase}` : duePhrase;
  return { text: `${base} · ${tail}`, warning: isFuture };
}

/** A ready-to-file cancellation reason for the "not due yet" skip action —
 * built from the same numbers the header already shows, so the audit trail
 * reads the same as what the dispatcher saw on screen. */
function buildSkipReason(profile: CustomerSchedulingProfile): string {
  const parts = ["Not due yet"];
  if (profile.lastVisit) parts.push(`cleaned ${profile.lastVisit.daysAgo} day${profile.lastVisit.daysAgo === 1 ? "" : "s"} ago`);
  if (profile.nextDueDate) parts.push(`next due ${displayDate(profile.nextDueDate)}`);
  return `${parts.join(" — ")}.`;
}

/**
 * The one scheduling-assistant panel, reused verbatim for assign, reschedule,
 * and rebook — only `intent` (and the props that follow from it) change.
 * Fetches ranked slots from `POST /api/scheduling/slots`, renders them as a
 * keyboard-navigable radiogroup with the confidence spine, and always keeps
 * a manual date/time/crew fallback one click away.
 */
export default function SlotFinder({
  intent,
  jobId,
  customerName,
  anchorDate,
  currentSchedule = null,
  manualDefaults,
  currentEmployeeIds = [],
  employees,
  onClose,
  onConfirm,
  onSkip,
  saving = false,
  submitError = null,
}: SlotFinderProps) {
  const titleId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>(true);
  const [windowDays, setWindowDays] = useState(DEFAULT_WINDOW_DAYS);
  const [preferredWindow, setPreferredWindow] = useState<BookingWindowKey | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [response, setResponse] = useState<SlotResponse | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [grown, setGrown] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDate, setManualDate] = useState(manualDefaults?.date ?? currentSchedule?.date ?? anchorDate);
  const [manualTime, setManualTime] = useState((manualDefaults?.startTime ?? currentSchedule?.startTime ?? "")?.slice(0, 5) ?? "");
  const [manualEmployeeIds, setManualEmployeeIds] = useState<string[]>(currentEmployeeIds);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const endDate = endDateFor(anchorDate, windowDays);
  const todayIso = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    // Kicking off a fresh fetch whenever the request shape changes (new
    // range, widened window, retry) — same pattern as the other calendar
    // panels' load effects.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setFetchFailed(false);
    // `preferredWindow` is only sent when the dispatcher explicitly overrides
    // it — omitted (not null) otherwise, so the server falls back to the
    // customer's own learned window instead of treating this as "any time".
    const body: SlotRequest = {
      jobId,
      startDate: anchorDate,
      endDate,
      ...(preferredWindow ? { preferredWindow } : {}),
    };
    fetch("/api/scheduling/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Scheduling assistant responded with ${res.status}`);
        return res.json() as Promise<SlotResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setResponse(data);
        setSelectedIndex(0);
        setExpanded(new Set());
      })
      .catch((cause) => {
        if (cancelled) return;
        console.error("Slot finder request failed", cause);
        setFetchFailed(true);
        setResponse(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, anchorDate, endDate, preferredWindow, refreshToken]);

  useEffect(() => {
    if (!response?.slots.length) return;
    if (prefersReducedMotion()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGrown(true);
      return;
    }
    setGrown(false);
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => setGrown(true));
    });
    return () => cancelAnimationFrame(raf1);
  }, [response]);

  const slots = response?.slots ?? [];
  const selectedSlot = slots[selectedIndex] ?? null;
  const recency = response ? recencyLine(response.profile, todayIso) : null;
  const allTooSoon = slots.length > 0 && slots.every((slot) => slot.signals.some((signal) => signal.code === "TOO_SOON"));
  const nearbyJobs = [...(response?.nearbyJobs ?? [])].sort((a, b) => Number(a.assignedNames.length > 0) - Number(b.assignedNames.length > 0));

  function confirmSlot(slot: RankedSlot) {
    onConfirm({
      date: slot.date,
      startTime: slot.arrivalWindowStartTime,
      employeeIds: slot.employeeIds,
      employeeNames: slot.employeeNames,
      slot,
      label: slotConfirmLabel(intent, slot),
    });
  }

  function confirmManual() {
    const names = manualEmployeeIds
      .map((id) => employees.find((employee) => employee.id === id))
      .filter((employee): employee is Employee => Boolean(employee))
      .map((employee) => `${employee.firstName} ${employee.lastName}`);
    onConfirm({
      date: manualDate,
      startTime: `${manualTime}:00`,
      employeeIds: manualEmployeeIds,
      employeeNames: names,
      label: manualConfirmLabel(intent, manualDate, names),
    });
  }

  function skipVisit() {
    if (!onSkip || !response) return;
    onSkip(buildSkipReason(response.profile));
  }

  function onRadiogroupKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!slots.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const next = (selectedIndex + direction + slots.length) % slots.length;
      setSelectedIndex(next);
      cardRefs.current[next]?.focus();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (selectedSlot) confirmSlot(selectedSlot);
    }
  }

  const manualNames = manualEmployeeIds
    .map((id) => employees.find((employee) => employee.id === id))
    .filter((employee): employee is Employee => Boolean(employee))
    .map((employee) => `${employee.firstName} ${employee.lastName}`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[var(--co-overlay)]" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[min(760px,calc(100dvh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--co-line)] bg-[var(--co-surface)] shadow-[var(--co-shadow-panel)]"
      >
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
          <p className="eyebrow">Scheduling</p>
          <h2 id={titleId} className="type-admin-title mt-1 font-semibold text-[var(--co-ink)]">
            {verbLabel(intent)}
          </h2>
          <p className="type-admin-meta mt-1 text-[var(--co-muted)]">
            {customerName}
            {currentSchedule
              ? ` · currently ${displayDate(currentSchedule.date)}${currentSchedule.startTime ? ` · ${displayTime(currentSchedule.startTime)}` : ""}`
              : ""}
          </p>
          {recency ? (
            <p className={`type-admin-meta mt-1 ${recency.warning ? "font-semibold text-[var(--co-warning)]" : "text-[var(--co-muted)]"}`}>{recency.text}</p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {submitError ? (
            <p role="alert" className="mb-3 text-xs font-medium text-[var(--co-danger)]">
              {submitError}
            </p>
          ) : null}

          {!manualOpen ? (
            <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Arrival window preference">
              {([null, "morning", "afternoon"] as const).map((value) => (
                <button
                  key={value ?? "any"}
                  type="button"
                  onClick={() => setPreferredWindow(value)}
                  className={`rounded-full border px-2.5 py-1 type-admin-micro font-semibold ${
                    preferredWindow === value
                      ? "border-[var(--co-accent-fill)] bg-[var(--co-accent-tint)] text-[var(--co-accent-text)]"
                      : "border-[var(--co-line)] text-[var(--co-muted)]"
                  }`}
                >
                  {value === null ? "Any time" : value === "morning" ? "Morning" : "Afternoon"}
                </button>
              ))}
            </div>
          ) : null}

          {manualOpen ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DateInput label="Date" value={manualDate} onChange={setManualDate} />
                <TimeInput label="Arrival time" value={manualTime} onChange={setManualTime} />
              </div>
              <div>
                <p className="type-admin-meta font-semibold text-[var(--co-muted)]">Crew</p>
                <div className="mt-1.5">
                  <TeamSearchPicker employees={employees} selectedIds={manualEmployeeIds} onChange={setManualEmployeeIds} />
                </div>
              </div>
            </div>
          ) : (
            <>
              {loading ? (
                <p role="status" className="type-admin-body text-[var(--co-muted)]">
                  Checking who&apos;s free…
                </p>
              ) : null}

              {!loading && fetchFailed ? (
                <div role="alert" className="rounded-[var(--co-radius-control)] border border-[var(--co-line)] p-4">
                  <p className="type-admin-body text-[var(--co-ink)]">We couldn&apos;t check availability.</p>
                  <p className="type-admin-meta mt-1 text-[var(--co-muted)]">Check your connection and try again, or pick a time manually below.</p>
                  <button type="button" onClick={() => setRefreshToken((token) => token + 1)} className="co-button-secondary mt-3">
                    Try again
                  </button>
                </div>
              ) : null}

              {!loading && !fetchFailed && response && slots.length === 0 ? (
                <EmptyState
                  reason={response.emptyReason}
                  anchorDate={anchorDate}
                  endDate={endDate}
                  canWiden={windowDays < MAX_WINDOW_DAYS}
                  onWiden={() => setWindowDays((current) => Math.min(current + 14, MAX_WINDOW_DAYS))}
                />
              ) : null}

              {!loading && !fetchFailed && slots.length && allTooSoon ? (
                <div className="mb-3 rounded-[var(--co-radius-control)] border border-[var(--co-warning)]/50 bg-[var(--co-warning)]/10 p-4">
                  <p className="type-admin-body font-semibold text-[var(--co-ink)]">
                    {customerName} isn&apos;t due yet{response?.profile.nextDueDate ? ` — not until ${displayDate(response.profile.nextDueDate)}` : ""}.
                  </p>
                  <p className="type-admin-meta mt-1 text-[var(--co-muted)]">Every time in this range still falls before then. The slots below are available if you book anyway.</p>
                  {onSkip ? (
                    <button type="button" disabled={saving} onClick={skipVisit} className="co-button-primary mt-3 disabled:opacity-50">
                      {saving ? "Saving…" : "Skip this visit"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {!loading && !fetchFailed && slots.length ? (
                <div role="radiogroup" aria-label="Available slots" onKeyDown={onRadiogroupKeyDown} className="space-y-2">
                  {slots.map((slot, index) => (
                    <SlotCard
                      key={`${slot.date}-${slot.arrivalWindowStartTime}-${slot.employeeIds.join(",")}`}
                      slot={slot}
                      index={index}
                      selected={index === selectedIndex}
                      grown={grown}
                      expanded={expanded.has(index)}
                      onSelect={() => setSelectedIndex(index)}
                      onToggleExpand={() =>
                        setExpanded((current) => {
                          const next = new Set(current);
                          if (next.has(index)) next.delete(index);
                          else next.add(index);
                          return next;
                        })
                      }
                      refCallback={(el) => {
                        cardRefs.current[index] = el;
                      }}
                    />
                  ))}
                </div>
              ) : null}

              {!loading && !fetchFailed && nearbyJobs.length ? (
                <div className="mt-4 border-t border-[var(--co-line-soft)] pt-3">
                  <button
                    type="button"
                    onClick={() => setNearbyOpen((current) => !current)}
                    aria-expanded={nearbyOpen}
                    className="flex w-full items-center justify-between type-admin-meta font-semibold text-[var(--co-muted)]"
                  >
                    <span>Nearby this week ({nearbyJobs.length})</span>
                    <span aria-hidden>{nearbyOpen ? "–" : "+"}</span>
                  </button>
                  {nearbyOpen ? (
                    <div className="mt-1.5 space-y-0.5">
                      {nearbyJobs.map((job) => (
                        <NearbyJobRow key={job.jobId} job={job} />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--co-line-soft)] px-5 py-4">
          <button type="button" onClick={() => setManualOpen((current) => !current)} className="type-admin-meta font-semibold text-[var(--co-accent-text)] hover:underline">
            {manualOpen ? "Use a recommended time instead" : "Pick a different time"}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="co-button-secondary">
              Cancel
            </button>
            {manualOpen ? (
              <button
                type="button"
                disabled={saving || !manualDate || !manualTime || manualEmployeeIds.length === 0}
                onClick={confirmManual}
                className="co-button-primary disabled:opacity-50"
              >
                {saving ? "Saving…" : manualConfirmLabel(intent, manualDate, manualNames)}
              </button>
            ) : selectedSlot ? (
              <button type="button" disabled={saving} onClick={() => confirmSlot(selectedSlot)} className="co-button-primary disabled:opacity-50">
                {saving ? "Saving…" : slotConfirmLabel(intent, selectedSlot)}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  reason,
  anchorDate,
  endDate,
  canWiden,
  onWiden,
}: {
  reason: SlotResponse["emptyReason"];
  anchorDate: string;
  endDate: string;
  canWiden: boolean;
  onWiden: () => void;
}) {
  if (reason === "no_eligible_staff") {
    return (
      <div className="rounded-[var(--co-radius-control)] border border-[var(--co-line)] p-4">
        <p className="type-admin-body text-[var(--co-ink)]">Nobody who serves this branch is active right now.</p>
        <Link href="/employees" className="type-admin-meta mt-2 inline-block font-semibold text-[var(--co-accent-text)] hover:underline">
          Review the employee roster
        </Link>
      </div>
    );
  }
  if (reason === "no_working_days") {
    return (
      <div className="rounded-[var(--co-radius-control)] border border-[var(--co-line)] p-4">
        <p className="type-admin-body text-[var(--co-ink)]">That range has no working days set.</p>
        <Link href="/settings/calendar" className="type-admin-meta mt-2 inline-block font-semibold text-[var(--co-accent-text)] hover:underline">
          Open calendar settings
        </Link>
      </div>
    );
  }
  return (
    <div className="rounded-[var(--co-radius-control)] border border-[var(--co-line)] p-4">
      <p className="type-admin-body text-[var(--co-ink)]">
        Every working day between {displayDate(anchorDate)} and {displayDate(endDate)} is fully booked.
      </p>
      {canWiden ? (
        <button type="button" onClick={onWiden} className="co-button-secondary mt-3">
          Look two weeks further
        </button>
      ) : (
        <p className="type-admin-meta mt-2 text-[var(--co-muted)]">That&apos;s as far out as this search goes — pick a time manually below.</p>
      )}
    </div>
  );
}

function SlotCard({
  slot,
  index,
  selected,
  grown,
  expanded,
  onSelect,
  onToggleExpand,
  refCallback,
}: {
  slot: RankedSlot;
  index: number;
  selected: boolean;
  grown: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
  refCallback: (el: HTMLDivElement | null) => void;
}) {
  const headline = headlineSignal(slot.signals);
  const caveats = slot.signals.filter((signal) => signal.weight < 0);
  // The header's recency line already states the cadence fact; showing it a
  // second time in the always-open disclosure would just repeat what's
  // already on screen, so the disclosure only surfaces signals that aren't
  // already visible as the headline or a caveat line.
  const shown = new Set<SlotSignal>([...(headline ? [headline] : []), ...caveats]);
  const extraSignals = slot.signals.filter((signal) => !shown.has(signal));
  const crew = crewNames(slot.employeeNames);
  const reduced = prefersReducedMotion();
  const confidencePct = Math.round(Math.min(Math.max(slot.confidence, 0), 1) * 100);
  const accessibleName = [
    `${displayDate(slot.date)}, ${displayTime(slot.arrivalWindowStartTime)} to ${displayTime(slot.arrivalWindowEndTime)}`,
    `crew ${crew}`,
    headline?.evidence,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      ref={refCallback}
      role="radio"
      aria-checked={selected}
      aria-label={accessibleName}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className={`flex cursor-pointer gap-3 rounded-[var(--co-radius-card)] border p-3 text-left transition-colors ${
        selected ? "border-[var(--co-accent-fill)] bg-[var(--co-accent-tint)]" : "border-[var(--co-line)] bg-[var(--co-surface)]"
      }`}
    >
      <div className="relative w-[3px] shrink-0 self-stretch overflow-hidden rounded-full bg-[var(--co-line-soft)]" aria-hidden>
        <div
          className="absolute inset-x-0 bottom-0 rounded-full bg-[var(--co-accent-fill)]"
          style={{
            height: grown ? `${confidencePct}%` : "0%",
            transitionProperty: reduced ? "none" : "height",
            transitionDuration: reduced ? "0ms" : "400ms",
            transitionTimingFunction: "cubic-bezier(.16,1,.3,1)",
            transitionDelay: reduced ? "0ms" : `${index * 40}ms`,
          }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="type-admin-body font-semibold text-[var(--co-ink)]">
          {displayDate(slot.date)} · {displayTime(slot.arrivalWindowStartTime)}–{displayTime(slot.arrivalWindowEndTime)}
        </p>
        <p className="type-admin-meta mt-0.5 text-[var(--co-body)]">{crew}</p>
        {headline ? <p className="type-admin-micro mt-1 text-[var(--co-muted)]">{headline.evidence}</p> : null}
        {caveats.map((signal) => (
          <p
            key={signal.code}
            className={`type-admin-micro mt-1 text-[var(--co-warning)] ${signal.code === "TOO_SOON" ? "font-semibold" : ""}`}
          >
            {signal.evidence}
          </p>
        ))}
        {slot.warnings.map((warning, warningIndex) => (
          <p key={warningIndex} className="type-admin-micro mt-1 flex items-center gap-1 font-medium text-[var(--co-warning)]">
            <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden strokeWidth={1.75} />
            {warning}
          </p>
        ))}
        {extraSignals.length ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpand();
            }}
            className="type-admin-micro mt-1.5 font-semibold text-[var(--co-accent-text)] hover:underline"
          >
            {expanded ? "Hide details" : "Why this slot"}
          </button>
        ) : null}
        {expanded ? (
          <ul className="mt-1.5 space-y-1 border-t border-dashed border-[var(--co-line-soft)] pt-1.5">
            {extraSignals.map((signal) => (
              <li key={signal.code} className={`type-admin-micro ${signal.weight < 0 ? "text-[var(--co-warning)]" : "text-[var(--co-muted)]"}`}>
                {signal.evidence}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function NearbyJobRow({ job }: { job: NearbyJob }) {
  return (
    <Link
      href={`/jobs/${job.jobId}`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between gap-3 rounded-[var(--co-radius-control)] px-2 py-1.5 hover:bg-[var(--co-surface-muted)]"
    >
      <span className="min-w-0 flex-1">
        <span className="type-admin-meta block truncate font-semibold text-[var(--co-ink)]">{job.customerName}</span>
        <span className="type-admin-micro block truncate text-[var(--co-muted)]">
          {job.city ?? "—"} · {displayDate(job.scheduledDate)}
          {job.scheduledStartTime ? ` · ${displayTime(job.scheduledStartTime)}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="type-admin-meta block font-semibold text-[var(--co-body)]">{job.miles.toFixed(1)} mi</span>
        <span className={`type-admin-micro block ${job.assignedNames.length ? "text-[var(--co-muted)]" : "font-semibold text-[var(--co-warning)]"}`}>
          {job.assignedNames.length ? crewNames(job.assignedNames) : "Unassigned"}
        </span>
      </span>
    </Link>
  );
}
