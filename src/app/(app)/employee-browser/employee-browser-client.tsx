"use client";

import { useMemo, useState } from "react";
import { formatDayLabel } from "@/lib/scheduling/dates";
import { DateTimeInput } from "@/components/date-time-input";

type Job = {
  id: string;
  role: "lead" | "helper" | "trainer";
  status: string;
  type: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number | null;
  customerFirstName: string;
  customerLastName: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  accessNotes: string | null;
};

type TimeEntry = {
  id: string;
  jobId: string;
  clockIn: string;
  clockOut: string | null;
  minutesWorked: number | null;
  notes: string | null;
  editedByAdmin?: boolean;
  recordedByAdmin?: boolean;
  scheduledDate: string;
  scheduledStartTime: string | null;
  type: string;
  status: string;
  customerFirstName: string;
  customerLastName: string;
  addressLine1: string | null;
};

type Props = {
  employeeId: string;
  employeeName: string;
  currentPeriodLabel: string;
  mileageMiles: number;
  mileageRateCents: number;
  todayJobs: Job[];
  upcomingJobs: Job[];
  openEntry: TimeEntry | null;
  recentTimeEntries: TimeEntry[];
  weeklyHours: number;
  weeklyMinutes: number;
  routeCount: number;
  companyLogoUrl: string | null;
  companyBrandColor: string;
  officePhone: string | null;
};

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function timeLabel(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** hh:mm, matching the Jobs list / Job Detail / Calendar convention. */
function formatEstimatedTime(minutes: number | null) {
  if (!minutes) return "—";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function dateLabel(value: string) {
  return formatDayLabel(new Date(`${value}T00:00:00.000Z`));
}

function roleLabel(role: "lead" | "helper" | "trainer") {
  return role === "lead" ? "Lead / driver" : role === "trainer" ? "Trainer" : "Helper";
}

export default function EmployeeBrowserClient({
  employeeId,
  employeeName,
  currentPeriodLabel,
  mileageMiles,
  mileageRateCents,
  todayJobs,
  upcomingJobs,
  openEntry,
  recentTimeEntries,
  weeklyHours,
  weeklyMinutes,
  routeCount,
  companyLogoUrl,
  companyBrandColor,
  officePhone,
}: Props) {
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [manualJobId, setManualJobId] = useState(todayJobs[0]?.id ?? upcomingJobs[0]?.id ?? "");
  const [manualClockIn, setManualClockIn] = useState("");
  const [manualClockOut, setManualClockOut] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualSaving, setManualSaving] = useState(false);

  const allJobs = useMemo(() => [...todayJobs, ...upcomingJobs], [todayJobs, upcomingJobs]);
  const routeJobs = useMemo(() => {
    return [...todayJobs].sort((a, b) => {
      const aTime = a.scheduledStartTime ?? "";
      const bTime = b.scheduledStartTime ?? "";
      return aTime.localeCompare(bTime);
    });
  }, [todayJobs]);
  const routeMinutes = useMemo(
    () => routeJobs.reduce((sum, job) => sum + (job.estimatedDurationMinutes ?? 0), 0),
    [routeJobs]
  );
  const firstStop = routeJobs[0]?.scheduledStartTime ?? null;
  const lastStop = routeJobs.at(-1)?.scheduledStartTime ?? null;

  async function clockIn(jobId: string) {
    setPendingJobId(jobId);
    const response = await fetch("/api/employee-browser/clock-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, jobId }),
    });
    const body = await response.json().catch(() => ({}));
    setPendingJobId(null);
    if (!response.ok) {
      alert(typeof body.error === "string" ? body.error : "Could not clock in.");
      return;
    }
    window.location.reload();
  }

  async function clockOut(jobId: string) {
    setPendingJobId(jobId);
    const response = await fetch("/api/employee-browser/clock-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, jobId }),
    });
    const body = await response.json().catch(() => ({}));
    setPendingJobId(null);
    if (!response.ok) {
      alert(typeof body.error === "string" ? body.error : "Could not clock out.");
      return;
    }
    window.location.reload();
  }

  async function saveManualTime() {
    if (!manualJobId || !manualClockIn || !manualClockOut) {
      alert("Pick a job and both times.");
      return;
    }
    setManualSaving(true);
    const response = await fetch(`/api/jobs/${manualJobId}/time-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: employeeId,
        clockIn: new Date(manualClockIn).toISOString(),
        clockOut: new Date(manualClockOut).toISOString(),
        notes: manualNotes || null,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setManualSaving(false);
    if (!response.ok) {
      alert(typeof body.error === "string" ? body.error : "Could not save manual time.");
      return;
    }
    window.location.reload();
  }

  const activeOpenJobId = openEntry?.jobId ?? null;
  const openEntryLabel = openEntry
    ? `${openEntry.customerFirstName} ${openEntry.customerLastName} · started ${timeLabel(openEntry.clockIn)}`
    : "Not clocked in";
  const brandColor = /^#[0-9a-fA-F]{6}$/.test(companyBrandColor) ? companyBrandColor : "#14211f";

  return (
    <div className="space-y-5 pb-10">
      <section className="co-card overflow-hidden">
        <div
          className="border-b border-[var(--co-line-soft)] px-5 py-4"
          style={{
            background: `linear-gradient(135deg, ${brandColor}, var(--co-ink))`,
          }}
        >
          <p className="eyebrow">Shift overview</p>
          <div className="mt-1 flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/10">
                {companyLogoUrl ? (
                  <img src={companyLogoUrl} alt="Company logo" className="h-full w-full object-contain p-1.5" />
                ) : (
                  <span className="text-sm font-semibold text-white/85">CO</span>
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">{employeeName}</h2>
                <p className="mt-1 text-xs text-white/65">{currentPeriodLabel}</p>
              </div>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                openEntry ? "bg-white/15 text-white" : "bg-white/10 text-white/75"
              }`}
            >
              {openEntry ? "Clocked in" : "Ready"}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-sm text-white/75">
            <p className="min-w-0 flex-1">{openEntryLabel}</p>
            {activeOpenJobId ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${todayJobs.find((job) => job.id === activeOpenJobId)?.addressLine1 ?? ""} ${todayJobs.find((job) => job.id === activeOpenJobId)?.city ?? ""} ${todayJobs.find((job) => job.id === activeOpenJobId)?.state ?? ""}`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white transition hover:border-white/30 hover:bg-white/10"
              >
                Directions
              </a>
            ) : null}
            {officePhone ? (
              <a
                href={`tel:${officePhone}`}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white transition hover:border-white/30 hover:bg-white/10"
              >
                Call office
              </a>
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-[var(--co-line-soft)]">
          <Stat label="Today's stops" value={String(todayJobs.length)} />
          <Stat label="This period" value={`${weeklyHours.toFixed(2)}h`} />
          <Stat label="Route stops" value={String(routeCount)} />
          <Stat label="Mileage" value={`${mileageMiles.toFixed(1)} mi`} />
        </div>
        <div className="border-t border-[var(--co-line-soft)] px-5 py-3 text-xs text-[var(--co-muted)]">
          {Math.round(weeklyMinutes)} minutes recorded this period
        </div>
      </section>

      <section className="co-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Weekly mileage</p>
            <h2 className="mt-1 text-lg font-semibold">Update miles for payroll</h2>
            <p className="mt-1 text-sm text-[var(--co-muted)]">
              Current value: {mileageMiles.toFixed(1)} miles
            </p>
          </div>
          <span className="rounded-full co-badge-info px-3 py-1 text-xs font-medium">
            {dollars(Math.round(mileageMiles * mileageRateCents))}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
          <input
            id="mileage-input"
            defaultValue={mileageMiles.toFixed(1)}
            inputMode="decimal"
            className="co-input w-full"
          />
          <button
            type="button"
            className="co-button-primary px-4"
            onClick={async () => {
              const input = document.getElementById("mileage-input") as HTMLInputElement | null;
              const value = Number(input?.value || 0);
              const response = await fetch("/api/employee-browser/mileage", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeId, mileageMiles: value }),
              });
              const body = await response.json().catch(() => ({}));
              if (!response.ok) {
                alert(typeof body.error === "string" ? body.error : "Mileage could not be saved.");
                return;
              }
              window.location.reload();
            }}
          >
            Save
          </button>
        </div>
        <p className="mt-3 text-xs text-[var(--co-muted)]">
          Mileage pay rate is {dollars(mileageRateCents)} per mile for the selected employee.
        </p>
      </section>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
          <p className="eyebrow">Today</p>
          <h2 className="mt-1 text-lg font-semibold">Scheduled jobs</h2>
        </div>
        <div className="divide-y divide-[var(--co-line-soft)]">
          {todayJobs.length === 0 ? (
            <p className="px-5 py-8 text-sm text-[var(--co-muted)]">No jobs scheduled today.</p>
          ) : (
            todayJobs.map((job) => {
              const isOpen = activeOpenJobId === job.id;
              return (
                <article key={job.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--co-ink)]">
                        {job.customerFirstName} {job.customerLastName}
                      </p>
                      <p className="mt-1 text-xs text-[var(--co-muted)]">
                        {timeLabel(job.scheduledStartTime)} · {job.type.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 text-xs text-[var(--co-muted)]">
                        {job.addressLine1}
                        {job.city ? `, ${job.city}` : ""}
                        {job.state ? `, ${job.state}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="rounded-full bg-[var(--co-surface-muted)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">
                        {job.status.replaceAll("_", " ")}
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                        job.role === "lead"
                          ? "co-badge-success"
                          : "co-badge-neutral"
                      }`}>
                        {roleLabel(job.role)}
                      </span>
                    </div>
                  </div>
                  {job.accessNotes ? (
                    <p className="mt-3 rounded-2xl bg-[var(--co-surface-muted)]/60 px-3 py-2 text-xs leading-5 text-[var(--co-muted)]">
                      {job.accessNotes}
                    </p>
                  ) : null}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <a
                      className="co-button-secondary justify-center text-center"
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        `${job.addressLine1 ?? ""} ${job.city ?? ""} ${job.state ?? ""}`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Directions
                    </a>
                    {isOpen ? (
                      <button
                        type="button"
                        disabled={pendingJobId === job.id}
                        onClick={() => clockOut(job.id)}
                        className="co-button-primary justify-center"
                      >
                        {pendingJobId === job.id ? "Saving…" : "Clock out"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={pendingJobId !== null}
                        onClick={() => clockIn(job.id)}
                        className="co-button-primary justify-center"
                      >
                        {pendingJobId === job.id ? "Starting…" : "Clock in"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Route preview</p>
              <h2 className="mt-1 text-lg font-semibold">Employee path for today</h2>
            </div>
            <span className="rounded-full co-badge-info px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
              {routeJobs.length} stops
            </span>
          </div>
          <p className="mt-2 text-sm text-[var(--co-muted)]">
            {routeMinutes ? `${(routeMinutes / 60).toFixed(1)} hours of service` : "No route time yet"}
            {firstStop && lastStop ? ` · ${timeLabel(firstStop)} to ${timeLabel(lastStop)}` : ""}
          </p>
        </div>
        <div className="divide-y divide-[var(--co-line-soft)]">
          {routeJobs.length === 0 ? (
            <p className="px-5 py-8 text-sm text-[var(--co-muted)]">No route stops scheduled for today.</p>
          ) : (
            routeJobs.map((job, index) => (
              <div key={job.id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--co-surface-muted)] text-sm font-semibold text-[var(--co-ink)]">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--co-ink)]">
                        {job.customerFirstName} {job.customerLastName}
                      </p>
                      <p className="mt-1 text-xs text-[var(--co-muted)]">
                        {job.addressLine1}
                        {job.city ? `, ${job.city}` : ""}
                      </p>
                    </div>
                    <p className="text-right text-xs text-[var(--co-muted)]">
                      {timeLabel(job.scheduledStartTime)}
                      <br />
                      {formatEstimatedTime(job.estimatedDurationMinutes)}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {upcomingJobs.length > 0 ? (
        <section className="co-card overflow-hidden">
          <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
            <p className="eyebrow">Upcoming</p>
            <h2 className="mt-1 text-lg font-semibold">Next jobs</h2>
          </div>
          <div className="divide-y divide-[var(--co-line-soft)]">
            {upcomingJobs.map((job) => (
              <div key={job.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">
                      {job.customerFirstName} {job.customerLastName}
                    </p>
                    <p className="mt-1 text-xs text-[var(--co-muted)]">
                      {dateLabel(job.scheduledDate)} · {timeLabel(job.scheduledStartTime)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--co-muted)]">{job.addressLine1}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex flex-col items-end gap-2">
                      <span className="rounded-full co-badge-info px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                        Planned
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                        job.role === "lead"
                          ? "co-badge-success"
                          : "co-badge-neutral"
                      }`}>
                        {roleLabel(job.role)}
                      </span>
                    </div>
                    <a
                      className="text-xs font-medium text-[var(--co-accent-text)] hover:underline"
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${job.addressLine1 ?? ""} ${job.city ?? ""} ${job.state ?? ""}`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Directions
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="co-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Manual log</p>
            <h2 className="mt-1 text-lg font-semibold">Add hours for a completed job</h2>
            <p className="mt-1 text-sm text-[var(--co-muted)]">
              Use this when you want to enter a past clock-in / clock-out pair.
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Job</span>
            <select
              value={manualJobId}
              onChange={(event) => setManualJobId(event.target.value)}
              className="co-input w-full"
            >
              {allJobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.customerFirstName} {job.customerLastName} · {job.scheduledDate}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <DateTimeInput label="Clock in" value={manualClockIn} onChange={setManualClockIn} />
            <DateTimeInput label="Clock out" value={manualClockOut} onChange={setManualClockOut} />
          </div>
          <label className="block text-sm">
            <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Notes</span>
            <textarea
              value={manualNotes}
              onChange={(event) => setManualNotes(event.target.value)}
              rows={3}
              className="co-input w-full resize-none"
              placeholder="Optional note for the time entry"
            />
          </label>
          <button
            type="button"
            onClick={saveManualTime}
            disabled={manualSaving}
            className="co-button-primary w-full justify-center py-3"
          >
            {manualSaving ? "Saving time…" : "Save manual hours"}
          </button>
        </div>
      </section>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
          <p className="eyebrow">Recent activity</p>
          <h2 className="mt-1 text-lg font-semibold">Latest time entries</h2>
        </div>
        <div className="divide-y divide-[var(--co-line-soft)]">
          {recentTimeEntries.length === 0 ? (
            <p className="px-5 py-8 text-sm text-[var(--co-muted)]">No time entries yet.</p>
          ) : (
            recentTimeEntries.map((entry) => (
              <div key={entry.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">
                      {entry.customerFirstName} {entry.customerLastName}
                    </p>
                    <p className="mt-1 text-xs text-[var(--co-muted)]">
                      {dateLabel(entry.scheduledDate)} · {timeLabel(entry.clockIn)} â†’ {timeLabel(entry.clockOut)}
                    </p>
                    {entry.notes ? <p className="mt-2 text-xs text-[var(--co-muted)]">{entry.notes}</p> : null}
                  </div>
                  <span className="rounded-full bg-[var(--co-surface-muted)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">
                    {entry.minutesWorked ? `${(entry.minutesWorked / 60).toFixed(2)}h` : "Open"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--co-surface)] px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--co-ink)]">{value}</p>
    </div>
  );
}
