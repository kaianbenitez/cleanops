"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { DateInput } from "@/components/date-input";
import { TimeInput } from "@/components/time-input";
import AttendeePicker from "./attendee-picker";
import { useDialogFocus } from "./dialog-focus";

type StaffMember = { id: string; firstName: string; lastName: string };

type AppointmentForm = {
  title: string;
  scheduledDate: string;
  startTime: string;
  durationMinutes: number;
  durationMode: "full" | "half" | "custom";
  customHours: string;
  timeOffType: "paid" | "unpaid";
  employeeIds: string[];
  note: string;
};

const DURATION_OPTIONS = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
];

function emptyForm(defaultDate: string): AppointmentForm {
  return { title: "", scheduledDate: defaultDate, startTime: "09:00", durationMinutes: 60, durationMode: "custom", customHours: "1", timeOffType: "paid", employeeIds: [], note: "" };
}

function formSnapshot(form: AppointmentForm, appointmentKind: "meeting" | "blocker") {
  return JSON.stringify({ form, appointmentKind });
}

export default function AppointmentPanel({
  mode,
  kind = "meeting",
  eventId,
  staffRoster,
  defaultDate,
  onClose,
}: {
  mode: "create" | "edit";
  kind?: "meeting" | "blocker";
  eventId?: string;
  staffRoster: StaffMember[];
  defaultDate: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<AppointmentForm>(() => emptyForm(defaultDate));
  const [appointmentKind, setAppointmentKind] = useState(kind);
  const [status, setStatus] = useState<string>("scheduled");
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [initialSnapshot, setInitialSnapshot] = useState(() => formSnapshot(emptyForm(defaultDate), kind));
  const dialogRef = useDialogFocus(true);

  const isDirty = formSnapshot(form, appointmentKind) !== initialSnapshot;

  const requestClose = useCallback(() => {
    if (saving) return;
    if (!isDirty || window.confirm("Discard unsaved appointment changes? Your edits will be lost.")) onClose();
  }, [isDirty, onClose, saving]);

  useEffect(() => {
    if (mode !== "edit" || !eventId) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/calendar-events/${eventId}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.event) {
          setError("We couldn't load this appointment. Close the panel and try again.");
          return;
        }
        const loadedForm = {
          title: data.event.title,
          scheduledDate: data.event.scheduledDate,
          startTime: data.event.startTime?.slice(0, 5) ?? "09:00",
          durationMinutes: data.event.durationMinutes ?? 60,
          durationMode: data.event.isAllDay ? "full" : data.event.durationMinutes === 240 ? "half" : "custom",
          customHours: data.event.durationMinutes ? String(data.event.durationMinutes / 60) : "1",
          timeOffType: data.event.timeOffType ?? "paid",
          employeeIds: data.event.employeeIds ?? [],
          note: data.event.note ?? "",
        } satisfies AppointmentForm;
        const loadedKind = data.event.category === "reminder" ? "blocker" : "meeting";
        setForm(loadedForm);
        setAppointmentKind(loadedKind);
        setInitialSnapshot(formSnapshot(loadedForm, loadedKind));
        setStatus(data.event.status);
      } catch {
        if (!cancelled) setError("We couldn't load this appointment. Close the panel and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [mode, eventId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  async function save() {
    if (!form.title.trim()) {
      setError(`Enter a ${appointmentKind === "blocker" ? "reason" : "title"} for this appointment.`);
      return;
    }
    if (appointmentKind === "blocker" && form.employeeIds.length !== 1) {
      setError("Choose the crew member whose time should be blocked.");
      return;
    }
    const customHours = Number(form.customHours);
    if (appointmentKind === "blocker" && form.durationMode === "custom" && (!Number.isFinite(customHours) || customHours < 0.5 || customHours > 24)) {
      setError("Custom duration must be between 0.5 and 24 hours.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const isFullDayBlock = appointmentKind === "blocker" && form.durationMode === "full";
      const blockerDuration = form.durationMode === "half" ? 240 : Math.round(customHours * 60);
      const body = {
        title: form.title.trim(),
        scheduledDate: form.scheduledDate,
        isAllDay: isFullDayBlock,
        startTime: isFullDayBlock ? null : form.startTime,
        durationMinutes: appointmentKind === "blocker" ? (isFullDayBlock ? null : blockerDuration) : form.durationMinutes,
        timeOffType: appointmentKind === "blocker" ? form.timeOffType : null,
        employeeIds: form.employeeIds,
        note: form.note.trim() || null,
        ...(mode === "create"
          ? { category: appointmentKind === "blocker" ? ("reminder" as const) : ("meeting" as const) }
          : {}),
      };
      const res = await fetch(mode === "create" ? "/api/calendar-events" : `/api/calendar-events/${eventId}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error?.formErrors?.[0] ?? data.error ?? "We couldn't save this appointment. Check your connection and try again.");
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError("We couldn't save this appointment. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmCancel() {
    if (!cancellationReason.trim()) {
      setError("Enter a reason before cancelling this appointment.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar-events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled", note: cancellationReason.trim() }),
      });
      if (!res.ok) {
        setError("We couldn't cancel this appointment. Check your connection and try again.");
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError("We couldn't cancel this appointment. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close appointment panel" onClick={requestClose} className="absolute inset-0 bg-[var(--co-overlay)]" />
      <aside ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="calendar-appointment-title" className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[var(--co-line)] bg-[var(--co-surface)] shadow-[var(--co-shadow-panel)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--co-line-soft)] px-5 py-4">
          <div>
            <h2 id="calendar-appointment-title" className="text-lg font-semibold">
              {mode === "create"
                ? appointmentKind === "blocker"
                  ? "Block time"
                  : "New appointment"
                : "Edit appointment"}
            </h2>
          </div>
          <button type="button" onClick={requestClose} className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)]" aria-label="Close">
            <X className="h-4 w-4" aria-hidden strokeWidth={1.75} />
          </button>
        </div>

        {loading ? (
          <div role="status" className="p-5 text-sm text-[var(--co-muted)]">Loading appointment details…</div>
        ) : (
          <div className="flex-1 space-y-5 px-5 py-5">
            {error ? <p role="alert" className="text-xs font-medium text-[var(--co-danger)]">{error}</p> : null}
            {status === "cancelled" ? (
              <p className="co-badge-neutral rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em]">Cancelled</p>
            ) : null}

            <label className="block text-xs font-semibold text-[var(--co-muted)]">
              {appointmentKind === "blocker" ? "Reason" : "Title"}
              <input
                type="text"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder={appointmentKind === "blocker" ? "Dentist appointment, birthday…" : "Weekly team meeting"}
                className="co-input mt-1 w-full"
              />
            </label>

            <DateInput
              label="Date"
              value={form.scheduledDate}
              onChange={(value) => setForm((current) => ({ ...current, scheduledDate: value }))}
            />

            {appointmentKind === "blocker" ? (
              <>
                <fieldset>
                  <legend className="text-xs font-semibold text-[var(--co-muted)]">Duration</legend>
                  <div className="mt-1 grid grid-cols-3 gap-1 rounded-lg bg-[var(--co-surface-muted)] p-1">
                    {(["full", "half", "custom"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={form.durationMode === mode}
                        onClick={() => setForm((current) => ({ ...current, durationMode: mode }))}
                        className={`min-h-11 rounded-md px-2 py-2 text-xs font-semibold transition ${form.durationMode === mode ? "bg-[var(--co-surface)] text-[var(--co-accent-text)] shadow-sm" : "text-[var(--co-muted)] hover:text-[var(--co-ink)]"}`}
                      >
                        {mode === "full" ? "Full day" : mode === "half" ? "Half day" : "Custom"}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {form.durationMode !== "full" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <TimeInput
                      label="Start time"
                      value={form.startTime}
                      onChange={(value) => setForm((current) => ({ ...current, startTime: value }))}
                    />
                    {form.durationMode === "custom" ? (
                      <label className="block text-xs font-semibold text-[var(--co-muted)]">
                        How many hours?
                        <input
                          type="number"
                          min="0.5"
                          max="24"
                          step="0.5"
                          value={form.customHours}
                          onChange={(event) => setForm((current) => ({ ...current, customHours: event.target.value }))}
                          className="co-input mt-1 w-full"
                        />
                      </label>
                    ) : (
                      <p className="self-end pb-2 text-xs text-[var(--co-muted)]">4 hours</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--co-muted)]">The selected crew member will be unavailable for the whole day.</p>
                )}

                <fieldset>
                  <legend className="text-xs font-semibold text-[var(--co-muted)]">Time off type</legend>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {(["paid", "unpaid"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={form.timeOffType === type}
                        onClick={() => setForm((current) => ({ ...current, timeOffType: type }))}
                        className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold transition ${form.timeOffType === type ? "border-[var(--co-accent-fill)] bg-[var(--co-accent-tint)] text-[var(--co-accent-text)]" : "border-[var(--co-line)] text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)]"}`}
                      >
                        {type === "paid" ? "Paid Time Off" : "Unpaid"}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <TimeInput
                  label="Start time"
                  value={form.startTime}
                  onChange={(value) => setForm((current) => ({ ...current, startTime: value }))}
                />
                <label className="block text-xs font-semibold text-[var(--co-muted)]">
                  Duration
                  <select
                    value={form.durationMinutes}
                    onChange={(event) => setForm((current) => ({ ...current, durationMinutes: Number(event.target.value) }))}
                    className="co-input mt-1 w-full"
                  >
                    {DURATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[12px] font-normal normal-case text-[var(--co-muted)]">Each attendee is paid for this amount of time.</span>
                </label>
              </div>
            )}

            {appointmentKind === "meeting" ? (
              <div className="block text-xs font-semibold text-[var(--co-muted)]">
                Attendees
                <div className="mt-1">
                  <AttendeePicker staff={staffRoster} selectedIds={form.employeeIds} onChange={(ids) => setForm((current) => ({ ...current, employeeIds: ids }))} showSelectAll />
                </div>
              </div>
            ) : (
              <div className="block text-xs font-semibold text-[var(--co-muted)]">
                Cleaner
                <div className="mt-1">
                  <AttendeePicker
                    staff={staffRoster}
                    selectedIds={form.employeeIds}
                    onChange={(ids) =>
                      setForm((current) => ({
                        ...current,
                        employeeIds: ids.slice(-1),
                      }))
                    }
                    placeholder="Search crew member by name…"
                  />
                </div>
                <span className="mt-1 block text-[12px] font-normal normal-case text-[var(--co-muted)]">
                  This blocks the selected crew member&apos;s time. It does not create a job or affect payroll.
                </span>
              </div>
            )}

            <label className="block text-xs font-semibold text-[var(--co-muted)]">
              Notes
              <textarea
                value={form.note}
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                rows={3}
                placeholder={appointmentKind === "blocker" ? "Optional details" : "Agenda, location, or other notes"}
                className="co-input mt-1 w-full resize-none"
              />
            </label>

            <div className="flex flex-wrap gap-2 border-t border-[var(--co-line-soft)] pt-4">
              <button type="button" disabled={saving} onClick={save} className="co-button-primary disabled:opacity-50">
                {saving
                  ? "Saving changes…"
                  : mode === "create"
                    ? appointmentKind === "blocker"
                      ? "Block time"
                      : "Create appointment"
                    : "Save changes"}
              </button>
              {mode === "edit" && status !== "cancelled" ? (
                confirmingCancel ? (
                  <div className="w-full space-y-2 co-badge-danger rounded-lg p-3">
                    <label className="block text-xs font-semibold text-[var(--co-danger)]">
                      Cancellation reason
                      <textarea value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} rows={2} placeholder="Why is this appointment being cancelled?" className="co-input mt-1 w-full resize-none" />
                    </label>
                    <div className="flex gap-2">
                      <button type="button" disabled={saving} onClick={() => { setConfirmingCancel(false); setCancellationReason(""); }} className="co-button-secondary py-1 text-xs disabled:opacity-50">Keep appointment</button>
                      <button type="button" disabled={saving || !cancellationReason.trim()} onClick={confirmCancel} className="rounded-lg border border-[var(--co-danger)]/30 bg-[var(--co-danger)]/10 px-3 py-1 text-xs font-semibold text-[var(--co-danger)] hover:bg-[var(--co-danger)]/20 disabled:opacity-50">Confirm cancel</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmingCancel(true)} className="co-button-secondary">Cancel appointment</button>
                )
              ) : null}
            </div>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}
