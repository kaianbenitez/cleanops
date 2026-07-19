"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Employee = { id: string; firstName: string; lastName: string };
type Assignment = { id: string; userId: string; role: string };
type ChecklistItem = { id: string; label: string; done: boolean };
type JobDetail = {
  id: string;
  type: string;
  status: string;
  scheduledDate: string;
  scheduledStartTime: string;
  priceCents: number;
  completionNotes: string | null;
  customerId: string;
  customerFirstName: string;
  customerLastName: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};
type TimeEntry = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  clockIn: string;
  clockOut: string | null;
  minutesWorked: number | null;
  recordedByAdmin: boolean;
  notes: string | null;
};
type TimeEntryAudit = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  createdAt: string;
  editorFirstName: string | null;
  editorLastName: string | null;
};

const STATUSES = ["scheduled", "in_progress", "completed", "cancelled", "no_show"] as const;

const TYPE_LABELS: Record<string, string> = {
  first_clean: "First clean",
  recurring: "Recurring",
  one_time: "One-time",
  deep_clean: "Deep clean",
  move_out: "Move in/out",
};

const STATUS_STYLES: Record<string, string> = {
  scheduled: "border-slate-200 bg-slate-50 text-slate-600",
  in_progress: "border-amber-200 bg-amber-50 text-amber-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelled: "border-slate-200 bg-slate-50 text-slate-400",
  no_show: "border-rose-200 bg-rose-50 text-rose-700",
};

const CHECKLIST: ChecklistItem[] = [
  { id: "arrival", label: "Arrival and access confirmed", done: false },
  { id: "kitchen", label: "Kitchen and high-touch surfaces", done: false },
  { id: "bathrooms", label: "Bathrooms completed", done: false },
  { id: "floors", label: "Floors vacuumed and mopped", done: false },
  { id: "trash", label: "Trash and supplies handled", done: false },
  { id: "walkthrough", label: "Final walkthrough complete", done: false },
];

function readableError(body: { error?: unknown }) {
  if (!body.error) return "Something went wrong. Please try again.";
  return typeof body.error === "string" ? body.error : JSON.stringify(body.error);
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toDateTimeInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status] ?? "border-slate-200 bg-slate-50 text-slate-600"}`}>
      {statusLabel(status)}
    </span>
  );
}

function Panel({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="co-card overflow-hidden">
      <div className="border-b border-[var(--co-line-soft)] px-5 py-4 sm:px-6">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[var(--co-muted)]">{description}</p> : null}
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="co-card p-5">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--co-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{value}</p>
      {hint ? <p className="mt-1 text-sm text-[var(--co-muted)]">{hint}</p> : null}
    </div>
  );
}

function RoutePreview({ address }: { address: string }) {
  return (
    <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[linear-gradient(180deg,#f5f7f3,white)] p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--co-muted)]">Route preview</p>
          <p className="mt-1 text-sm font-semibold">Technician route snapshot</p>
        </div>
        <span className="rounded-full bg-[var(--co-surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--co-evergreen)]">Calendar-linked</span>
      </div>
      <div className="mt-4 rounded-2xl border border-[var(--co-line-soft)] bg-white p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--co-evergreen)] text-xs font-semibold text-white">1</span>
            <div className="min-w-0">
              <p className="text-sm font-medium">Assigned stop</p>
              <p className="truncate text-xs text-[var(--co-muted)]">{address || "Address not recorded yet"}</p>
            </div>
          </div>
          <div className="h-16 rounded-2xl border border-dashed border-[var(--co-line)] bg-[linear-gradient(135deg,#f7faf4,#eef3e8)]" />
          <div className="flex items-center justify-between text-xs text-[var(--co-muted)]">
            <span>Visual placeholder until full routing is connected.</span>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[var(--co-evergreen)] hover:underline"
            >
              Open Maps
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<TimeEntryAudit[]>([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(CHECKLIST);
  const [timeEmployeeId, setTimeEmployeeId] = useState("");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [timeNotes, setTimeNotes] = useState("");
  const [timeRefreshNotice, setTimeRefreshNotice] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoaded(false);
    const [jobResponse, employeeResponse] = await Promise.all([
      fetch(`/api/jobs/${jobId}`, { cache: "no-store" }),
      fetch("/api/employees", { cache: "no-store" }),
    ]);

    const jobBody = await jobResponse.json().catch(() => ({}));
    const employeeBody = await employeeResponse.json().catch(() => ({}));

    if (!jobResponse.ok || !jobBody.job) throw new Error(readableError(jobBody));

    setJob(jobBody.job);
    setEmployees(employeeBody.employees ?? []);
    setAssignments(jobBody.assignments ?? []);
    setSelectedEmployeeIds((jobBody.assignments ?? []).map((assignment: Assignment) => assignment.userId));
    setTimeEntries(jobBody.timeEntries ?? []);
    setAuditLogs(
      [...(jobBody.jobAuditLogs ?? []), ...(jobBody.timeEntryAuditLogs ?? [])].sort(
        (a: TimeEntryAudit, b: TimeEntryAudit) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    );
    setLoaded(true);
  }, [jobId]);

  useEffect(() => {
    // Load the server-backed job detail when the route changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Job could not be loaded.");
      setLoaded(true);
    });
  }, [load]);

  const assignedEmployees = useMemo(
    () => employees.filter((employee) => selectedEmployeeIds.includes(employee.id)),
    [employees, selectedEmployeeIds]
  );
  const recordedHours = useMemo(() => timeEntries.reduce((total, entry) => total + (entry.minutesWorked ?? 0), 0) / 60, [timeEntries]);
  const openEntries = useMemo(() => timeEntries.filter((entry) => !entry.clockOut).length, [timeEntries]);
  const auditCount = auditLogs.length;
  const completionState = job?.status === "completed" ? "Ready to invoice" : openEntries > 0 ? "Waiting on clock-out" : "Not yet completed";
  const jobLocation = job ? [job.addressLine1, job.city, job.state, job.zip].filter(Boolean).join(", ") : "";
  const jobDateTime = job ? `${job.scheduledDate} · ${job.scheduledStartTime?.slice(0, 5) ?? "No time"}` : "";

  async function save(fields: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(readableError(body));
      return false;
    }
    await load();
    return true;
  }

  async function refreshJob() {
    const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!body.job) return;
    setJob(body.job);
    setAssignments(body.assignments ?? []);
    setTimeEntries(body.timeEntries ?? []);
    setAuditLogs(
      [...(body.jobAuditLogs ?? []), ...(body.timeEntryAuditLogs ?? [])].sort(
        (a: TimeEntryAudit, b: TimeEntryAudit) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    );
  }

  async function recordTime() {
    if (!timeEmployeeId || !clockIn || !clockOut) {
      setError("Select a technician and enter both times.");
      return;
    }

    setError(null);
    const response = await fetch(`/api/jobs/${jobId}/time-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: timeEmployeeId,
        clockIn: new Date(clockIn).toISOString(),
        clockOut: new Date(clockOut).toISOString(),
        notes: timeNotes || null,
      }),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(readableError(body));
      return;
    }

    setClockIn("");
    setClockOut("");
    setTimeNotes("");
    setTimeRefreshNotice(
      body.payrollPeriodsRefreshed?.length
        ? `Refreshed ${body.payrollPeriodsRefreshed.length} open payroll period${body.payrollPeriodsRefreshed.length === 1 ? "" : "s"}.`
        : "Time saved and payroll recalculated."
    );
    await refreshJob();
  }

  function beginEdit(entry: TimeEntry) {
    setEditingEntryId(entry.id);
    setEditClockIn(toDateTimeInputValue(entry.clockIn));
    setEditClockOut(toDateTimeInputValue(entry.clockOut));
    setEditNotes(entry.notes ?? "");
    setError(null);
  }

  async function updateTime(entryId: string) {
    if (!editClockIn || !editClockOut) {
      setError("Enter both start and end times.");
      return;
    }

    const response = await fetch(`/api/jobs/${jobId}/time-entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clockIn: new Date(editClockIn).toISOString(),
        clockOut: new Date(editClockOut).toISOString(),
        notes: editNotes || null,
      }),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(readableError(body));
      return;
    }

    setEditingEntryId(null);
    setTimeRefreshNotice(
      body.payrollPeriodsRefreshed?.length
        ? `Refreshed ${body.payrollPeriodsRefreshed.length} open payroll period${body.payrollPeriodsRefreshed.length === 1 ? "" : "s"}.`
        : "Time saved and payroll recalculated."
    );
    await refreshJob();
  }

  async function createInvoice() {
    if (!job) return;
    const response = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: job.customerId, jobId: job.id, totalCents: job.priceCents }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(readableError(body));
      return;
    }
    router.push(`/invoices/${body.invoice.id}`);
  }

  if (!loaded) {
    return (
      <div className="space-y-4">
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--co-line)]" />
        <div className="h-32 animate-pulse rounded-2xl bg-[var(--co-surface)]" />
        <div className="h-64 animate-pulse rounded-2xl bg-[var(--co-surface)]" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="co-card p-8 text-center">
        <p className="font-medium">Unable to load this job.</p>
        <p className="mt-2 text-sm text-[var(--co-muted)]">{error}</p>
        <button className="co-button-secondary mt-5" type="button" onClick={() => load()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <Link href="/jobs" className="text-sm font-medium text-[var(--co-evergreen)] hover:underline">
            Back to jobs
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="eyebrow">Operations / Job detail</p>
            <StatusPill status={job.status} />
          </div>
          <h1 className="page-title mt-2">
            {job.customerFirstName} {job.customerLastName}
          </h1>
          <p className="page-subtitle mt-2 max-w-4xl">
            {TYPE_LABELS[job.type] ?? job.type} · {jobDateTime} · {jobLocation || "No address recorded"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={`/customers/${job.customerId}`} className="co-button-secondary">
            Customer profile
          </Link>
          <Link href="/calendar" className="co-button-secondary">
            Open calendar
          </Link>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(jobLocation)}`}
            target="_blank"
            rel="noreferrer"
            className="co-button-secondary"
          >
            Open map
          </a>
          {job.status === "completed" ? (
            <button disabled={saving} className="co-button-primary" type="button" onClick={createInvoice}>
              {saving ? "Saving..." : "Create invoice"}
            </button>
          ) : (
            <button disabled={saving} className="co-button-primary" type="button" onClick={() => save({ status: "completed" })}>
              {saving ? "Saving..." : "Mark completed"}
            </button>
          )}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Status" value={job.status.replaceAll("_", " ")} hint={completionState} />
        <StatCard
          label="Crew"
          value={`${assignedEmployees.length} assigned`}
          hint={assignedEmployees.length ? assignedEmployees.map((employee) => `${employee.firstName} ${employee.lastName}`).join(" · ") : "No technicians assigned"}
        />
        <StatCard label="Recorded hours" value={`${recordedHours.toFixed(2)} hrs`} hint={`${timeEntries.length} time entr${timeEntries.length === 1 ? "y" : "ies"}`} />
        <StatCard label="Invoice handoff" value={money(job.priceCents)} hint={job.status === "completed" ? "Ready to invoice" : "Complete the job first"} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.18fr_0.82fr]">
        <div className="space-y-5">
          <section className="co-card overflow-hidden">
            <div className="border-b border-[var(--co-line-soft)] px-5 py-5 sm:px-6">
              <p className="eyebrow">Job overview</p>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--co-ink)]">Service record</h2>
                  <p className="mt-1 max-w-2xl text-sm text-[var(--co-muted)]">This is the office view for assignment, scheduling, payroll, and invoice handoff.</p>
                </div>
                <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/45 px-4 py-3 text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Job ID</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{job.id.slice(0, 8).toUpperCase()}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4 sm:p-6">
              <div className="rounded-[24px] border border-[var(--co-line-soft)] bg-[linear-gradient(180deg,#fbfcfa,#f3f6ef)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Date / time</p>
                <p className="mt-2 text-lg font-semibold text-[var(--co-ink)]">{job.scheduledDate}</p>
                <p className="mt-1 text-sm text-[var(--co-muted)]">{job.scheduledStartTime?.slice(0, 5) ?? "No time"}</p>
              </div>
              <div className="rounded-[24px] border border-[var(--co-line-soft)] bg-[linear-gradient(180deg,#fbfcfa,#f3f6ef)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Service type</p>
                <p className="mt-2 text-lg font-semibold text-[var(--co-ink)]">{TYPE_LABELS[job.type] ?? job.type}</p>
                <p className="mt-1 text-sm text-[var(--co-muted)]">Budgeted from the quote</p>
              </div>
              <div className="rounded-[24px] border border-[var(--co-line-soft)] bg-[linear-gradient(180deg,#fbfcfa,#f3f6ef)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Location</p>
                <p className="mt-2 text-lg font-semibold text-[var(--co-ink)]">{job.addressLine1 ?? "No address recorded"}</p>
                <p className="mt-1 text-sm text-[var(--co-muted)]">
                  {job.city ?? ""}{job.state ? `, ${job.state}` : ""} {job.zip ?? ""}
                </p>
              </div>
              <div className="rounded-[24px] border border-[var(--co-line-soft)] bg-[linear-gradient(180deg,#fbfcfa,#f3f6ef)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Close-out</p>
                <p className="mt-2 text-lg font-semibold text-[var(--co-ink)]">{job.completionNotes ? "Notes recorded" : "No notes yet"}</p>
                <p className="mt-1 text-sm text-[var(--co-muted)]">Editable from this page</p>
              </div>
            </div>
          </section>

          <Panel eyebrow="Assigned crew" title="Who is cleaning this home?" description="Select the technicians now or save it for later from Calendar.">
            <div className="grid gap-2 sm:grid-cols-2">
              {employees.map((employee) => {
                const selected = selectedEmployeeIds.includes(employee.id);
                const role = assignments.find((assignment) => assignment.userId === employee.id)?.role;

                return (
                  <label
                    key={employee.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition ${
                      selected ? "border-[var(--co-evergreen)] bg-[var(--co-surface-muted)]/85" : "border-[var(--co-line-soft)] hover:border-[var(--co-line)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        setSelectedEmployeeIds((current) => (selected ? current.filter((id) => id !== employee.id) : [...current, employee.id]))
                      }
                      className="h-4 w-4 accent-[var(--co-evergreen)]"
                    />
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--co-surface-muted)] text-xs font-bold text-[var(--co-evergreen)]">
                      {employee.firstName[0]}
                      {employee.lastName[0]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {employee.firstName} {employee.lastName}
                      </span>
                      <span className="block text-xs text-[var(--co-muted)]">{selected ? role ?? "Assigned" : "Available to assign"}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className="co-button-primary" type="button" onClick={() => save({ employeeIds: selectedEmployeeIds })}>
                Save assignment
              </button>
              <p className="text-sm text-[var(--co-muted)]">Crew selection updates the job, payroll, and route planning.</p>
            </div>
          </Panel>

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel eyebrow="Scheduling assistant" title="Reschedule / place the visit" description="Keep the office in control of the appointment without giving up manual scheduling.">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-xs font-semibold text-[var(--co-muted)]">
                  Date
                  <input type="date" defaultValue={job.scheduledDate} onBlur={(event) => save({ scheduledDate: event.target.value })} className="co-input mt-1 w-full" />
                </label>
                <label className="block text-xs font-semibold text-[var(--co-muted)]">
                  Start time
                  <input type="time" defaultValue={job.scheduledStartTime?.slice(0, 5)} onBlur={(event) => save({ scheduledStartTime: `${event.target.value}:00` })} className="co-input mt-1 w-full" />
                </label>
              </div>
              <label className="mt-3 block text-xs font-semibold text-[var(--co-muted)]">
                Status
                <select value={job.status} onChange={(event) => save({ status: event.target.value })} className="co-input mt-1 w-full">
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-4 grid gap-2">
                <button className="co-button-secondary w-full justify-center" type="button" onClick={() => save({ status: "scheduled" })}>
                  Return to scheduled
                </button>
                <button className="co-button-secondary w-full justify-center" type="button" onClick={() => save({ status: "in_progress" })}>
                  Move to in progress
                </button>
                <Link href="/calendar" className="co-button-secondary justify-center">
                  Open calendar
                </Link>
              </div>
              <p className="mt-3 text-xs text-[var(--co-muted)]">Use this as the manual scheduling assistant until drag-and-drop scheduling is connected.</p>
            </Panel>

            <Panel eyebrow="Close-out" title="Checklist" description="Use this as the internal completion guide.">
              <div className="space-y-1">
                {checklist.map((item) => (
                  <label key={item.id} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-[var(--co-surface-muted)]">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => setChecklist((current) => current.map((entry) => (entry.id === item.id ? { ...entry, done: !entry.done } : entry)))}
                      className="h-4 w-4 accent-[var(--co-evergreen)]"
                    />
                    <span className={item.done ? "text-[var(--co-muted)] line-through" : "text-[var(--co-ink)]"}>{item.label}</span>
                  </label>
                ))}
              </div>
            </Panel>
          </div>

          <Panel eyebrow="History" title="Change history" description="Job and time-entry edits are recorded here for review.">
            <div className="grid gap-3">
              {auditLogs.slice(0, 8).map((log) => (
                <div key={log.id} className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--co-ink)]">
                        {log.editorFirstName ?? "Admin"} {log.editorLastName ?? ""} · {log.action.replaceAll(".", " ")}
                      </p>
                      <p className="mt-1 text-xs text-[var(--co-muted)]">{formatDateTime(log.createdAt)}</p>
                    </div>
                    <span className="rounded-full border border-[var(--co-line)] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">
                      {log.entityType.replaceAll("_", " ")}
                    </span>
                  </div>
                </div>
              ))}
              {auditLogs.length === 0 ? <p className="text-sm text-[var(--co-muted)]">No changes have been logged yet.</p> : null}
            </div>
          </Panel>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
          <Panel eyebrow="Record job time" title="Internal time entry" description="Use this when you are logging the crew manually.">
            {timeRefreshNotice ? (
              <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{timeRefreshNotice}</div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <select value={timeEmployeeId} onChange={(event) => setTimeEmployeeId(event.target.value)} className="co-input md:col-span-2">
                <option value="">Select technician</option>
                {assignedEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.firstName} {employee.lastName}
                  </option>
                ))}
              </select>
              <input aria-label="Clock in" type="datetime-local" value={clockIn} onChange={(event) => setClockIn(event.target.value)} className="co-input" />
              <input aria-label="Clock out" type="datetime-local" value={clockOut} onChange={(event) => setClockOut(event.target.value)} className="co-input" />
              <input type="text" value={timeNotes} onChange={(event) => setTimeNotes(event.target.value)} placeholder="Note (optional)" className="co-input md:col-span-2" />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button className="co-button-primary" type="button" onClick={recordTime}>
                Add manual time
              </button>
              <button
                className="co-button-secondary"
                type="button"
                onClick={() => {
                  setTimeEmployeeId("");
                  setClockIn("");
                  setClockOut("");
                  setTimeNotes("");
                }}
              >
                Clear
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Job value</p>
                <p className="mt-1 text-sm font-semibold">{money(job.priceCents)}</p>
              </div>
              <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Recorded hours</p>
                <p className="mt-1 text-sm font-semibold">{recordedHours.toFixed(2)} hrs</p>
              </div>
              <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">Open entries</p>
                <p className="mt-1 text-sm font-semibold">{openEntries}</p>
              </div>
            </div>
          </Panel>

          <Panel eyebrow="Edit hours" title="Time entries" description="Office staff can adjust hours and keep the log current.">
            <div className="overflow-x-auto rounded-2xl border border-[var(--co-line-soft)]">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-[var(--co-surface-muted)] text-xs uppercase tracking-[0.08em] text-[var(--co-muted)]">
                  <tr>
                    <th className="px-4 py-3">Technician</th>
                    <th className="px-4 py-3">Start</th>
                    <th className="px-4 py-3">End</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--co-line-soft)]">
                  {timeEntries.map((entry) => {
                    const entryLogs = auditLogs.filter((log) => log.entityId === entry.id);
                    return (
                      <tr key={entry.id} className="hover:bg-[var(--co-surface-muted)]/30">
                        <td className="px-4 py-3 font-medium">
                          {entry.firstName} {entry.lastName}
                          {entry.recordedByAdmin ? <span className="ml-2 rounded-full bg-[var(--co-surface-muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--co-evergreen)]">Manual</span> : null}
                        </td>
                        <td className="px-4 py-3 text-[var(--co-muted)]">{formatTime(entry.clockIn)}</td>
                        <td className="px-4 py-3 text-[var(--co-muted)]">{formatTime(entry.clockOut)}</td>
                        <td className="px-4 py-3 text-[var(--co-muted)]">{((entry.minutesWorked ?? 0) / 60).toFixed(2)} hrs</td>
                        <td className="px-4 py-3 text-right">
                          <button className="text-xs font-medium text-[var(--co-evergreen)] hover:underline" type="button" onClick={() => beginEdit(entry)}>
                            Edit
                          </button>
                          {entryLogs.length > 0 ? <span className="ml-2 text-xs text-[var(--co-muted)]">logged</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {timeEntries.length === 0 ? <p className="px-4 py-8 text-center text-sm text-[var(--co-muted)]">No time recorded yet.</p> : null}
            </div>

            {editingEntryId ? (
              <div className="mt-4 rounded-2xl border border-[var(--co-line)] bg-[var(--co-surface-muted)] p-4">
                <p className="text-sm font-semibold">Edit time entry</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <input aria-label="Edited clock in" type="datetime-local" value={editClockIn} onChange={(event) => setEditClockIn(event.target.value)} className="co-input" />
                  <input aria-label="Edited clock out" type="datetime-local" value={editClockOut} onChange={(event) => setEditClockOut(event.target.value)} className="co-input" />
                </div>
                <input value={editNotes} onChange={(event) => setEditNotes(event.target.value)} placeholder="Note (optional)" className="co-input mt-3 w-full" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="co-button-primary" type="button" onClick={() => updateTime(editingEntryId)}>
                    Save change
                  </button>
                  <button className="co-button-secondary" type="button" onClick={() => setEditingEntryId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </Panel>

          <Panel eyebrow="Route" title="Preview" description="A lightweight placeholder until maps are fully connected.">
            <RoutePreview address={jobLocation} />
          </Panel>

          <Panel eyebrow="Completion notes" title="Close-out memo" description="Capture anything the next person needs to know.">
            <textarea
              defaultValue={job.completionNotes ?? ""}
              onBlur={(event) => save({ completionNotes: event.target.value })}
              placeholder="Add notes about the completed service..."
              rows={6}
              className="co-input w-full resize-none"
            />
            <p className="mt-2 text-xs text-[var(--co-muted)]">Notes save when you leave the field.</p>
          </Panel>
        </aside>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--co-line)] bg-[var(--co-surface-muted)]/50 p-4">
        <div>
          <p className="font-semibold text-[var(--co-ink)]">Ready for the next handoff?</p>
          <p className="text-sm text-[var(--co-muted)]">Finish the service, log the time, then create the invoice from this record.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/customers/${job.customerId}`} className="co-button-secondary">
            Open customer
          </Link>
          <Link href="/payroll" className="co-button-secondary">
            Review payroll
          </Link>
          {job.status === "completed" ? (
            <button className="co-button-primary" type="button" onClick={createInvoice}>
              Create invoice
            </button>
          ) : (
            <button className="co-button-primary" type="button" onClick={() => save({ status: "completed" })}>
              Mark completed
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}
