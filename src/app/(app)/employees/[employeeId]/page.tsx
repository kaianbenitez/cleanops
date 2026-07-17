"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";

type PayTier = { minHours: number; maxHours: number | null; rateCents: number };
type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  title: string | null;
  birthday: string | null;
  hiredDate: string | null;
  payType: "commission_jth" | "office_hourly" | null;
  hourlyRateCents: number | null;
  payTiers: PayTier[] | null;
  gustoEmployeeId: string | null;
  isActive: boolean;
};
type Stats = { jobsCompleted: number; hoursWorked: number; thisMonthPayCents: number };
type EmployeeJob = {
  id: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled" | "no_show";
  type: "first_clean" | "recurring" | "one_time" | "deep_clean" | "move_out";
  scheduledDate: string;
  scheduledStartTime: string | null;
  completedAt: string | null;
  estimatedDurationMinutes: number | null;
  customerFirstName: string;
  customerLastName: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
};
type EmployeeTimeEntry = {
  id: string;
  jobId: string;
  clockIn: string;
  clockOut: string | null;
  minutesWorked: number | null;
  editedByAdmin: boolean;
  recordedByAdmin: boolean;
  notes: string | null;
  scheduledDate: string;
  type: EmployeeJob["type"];
  status: EmployeeJob["status"];
  customerFirstName: string;
  customerLastName: string;
};

const PAY_TIER_BRACKET_LABELS = ["Under 26 hrs", "26 to 29.99 hrs", "30 to 33.99 hrs", "34+ hrs"];

const JOB_TYPE_LABELS: Record<EmployeeJob["type"], string> = {
  first_clean: "First clean",
  recurring: "Recurring",
  one_time: "One time",
  deep_clean: "Deep clean",
  move_out: "Move out",
};

const JOB_STATUS_LABELS: Record<EmployeeJob["status"], string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

const JOB_STATUS_CLASSES: Record<EmployeeJob["status"], string> = {
  scheduled: "border-[#d9e5cf] bg-[#f6faf1] text-[#5c7436]",
  in_progress: "border-[#cfe3ff] bg-[#eef5ff] text-[#456c9a]",
  completed: "border-[#d9e5cf] bg-[#edf5e4] text-[#5c7436]",
  cancelled: "border-[#f0d4d4] bg-[#fbefef] text-[#a35c5c]",
  no_show: "border-[#f2d9c2] bg-[#fff5ea] text-[#a46a2e]",
};

function dollars(cents: number) {
  return (cents / 100).toFixed(2);
}

function formatClock(value: string | null) {
  return value ? value.slice(0, 5) : "—";
}

function formatHours(minutes: number | null) {
  return minutes == null ? "—" : (minutes / 60).toFixed(2);
}

export default function EmployeeProfilePage({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = use(params);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [upcomingJobs, setUpcomingJobs] = useState<EmployeeJob[]>([]);
  const [recentJobs, setRecentJobs] = useState<EmployeeJob[]>([]);
  const [recentTimeEntries, setRecentTimeEntries] = useState<EmployeeTimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/employees/${employeeId}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error ?? "Employee could not be loaded.");
      setLoading(false);
      return;
    }

    setEmployee(data.employee);
    setStats(data.stats);
    setUpcomingJobs(data.upcomingJobs ?? []);
    setRecentJobs(data.recentJobs ?? []);
    setRecentTimeEntries(data.recentTimeEntries ?? []);
    setError(null);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => {
    // This is the page loader for the employee profile route.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function save(fields: Record<string, unknown>) {
    setSaved(false);
    const response = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Could not save this change.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    await load();
  }

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (error || !employee || !stats) {
    return <div className="rounded-2xl border border-[#ecd8cf] bg-[#fff6f2] p-6 text-sm text-[#9b553d]">{error ?? "Employee not found."}</div>;
  }

  const fullName = `${employee.firstName} ${employee.lastName}`;
  const initials = `${employee.firstName[0] ?? ""}${employee.lastName[0] ?? ""}`.toUpperCase();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/employees" className="text-xs font-semibold text-[#668344] hover:text-[#40592b]">
            ← Back to employees
          </Link>
          <p className="mt-3 text-xs text-[#8a9b93]">
            Employees / <span className="text-[#52635b]">{fullName}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs font-semibold text-[#5c7436]">Saved</span>}
          <button
            type="button"
            onClick={() => save({ isActive: !employee.isActive })}
            className="co-button-secondary"
          >
            {employee.isActive ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      </div>

      <section className="grid gap-6 rounded-2xl border border-[#e1e8df] bg-white p-6 shadow-[0_16px_40px_rgba(27,41,37,0.05)] lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex items-center gap-4">
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#e5eedc] text-2xl font-semibold text-[#526d3a]">
            {initials}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[#1b2925]">{fullName}</h1>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  employee.isActive ? "bg-[#e8f2d3] text-[#5c7436]" : "bg-[#f1f2f0] text-[#7a8580]"
                }`}
              >
                {employee.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="mt-1 text-sm text-[#718179]">{employee.title ?? "Team member"}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#718179]">
              <span>{employee.email}</span>
              {employee.phone && <span>{employee.phone}</span>}
              <span>Hired {employee.hiredDate ?? "date not set"}</span>
            </div>
          </div>
        </div>
        <div className="border-t border-[#edf0ec] pt-4 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <p className="text-xs font-semibold text-[#718179]">Availability</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#526d3a]">
            <span className="h-2 w-2 rounded-full bg-[#6f9251]" />
            Managed manually
          </p>
          <p className="mt-1 text-xs text-[#8a9b93]">Use Calendar to assign work.</p>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Jobs completed" value={String(stats.jobsCompleted)} detail="Lifetime" />
        <Stat label="Hours worked" value={stats.hoursWorked.toFixed(1)} detail="Based on current pay type" />
        <Stat label="This month&apos;s pay" value={`$${dollars(stats.thisMonthPayCents)}`} detail="Generated payroll lines" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(330px,0.75fr)]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-[#e1e8df] bg-white p-6 shadow-[0_12px_30px_rgba(27,41,37,0.04)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Account</p>
                <h2 className="mt-2 text-lg font-semibold text-[#263631]">Employee information</h2>
              </div>
              <span className="text-xs text-[#5c7436]">Changes are saved as you edit</span>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="First name" defaultValue={employee.firstName} onSave={(v) => save({ firstName: v })} />
              <Field label="Last name" defaultValue={employee.lastName} onSave={(v) => save({ lastName: v })} />
              <Field label="Email" type="email" defaultValue={employee.email} onSave={(v) => save({ email: v })} />
              <Field label="Phone" defaultValue={employee.phone ?? ""} onSave={(v) => save({ phone: v })} />
              <Field label="Title" defaultValue={employee.title ?? ""} onSave={(v) => save({ title: v })} />
              <Field label="Gusto employee ID" defaultValue={employee.gustoEmployeeId ?? ""} onSave={(v) => save({ gustoEmployeeId: v })} />
              <Field label="Birthday" type="date" defaultValue={employee.birthday ?? ""} onSave={(v) => save({ birthday: v || null })} />
              <Field label="Hired date" type="date" defaultValue={employee.hiredDate ?? ""} onSave={(v) => save({ hiredDate: v || null })} />
            </div>
          </section>

          <section className="rounded-2xl border border-[#e1e8df] bg-white p-6 shadow-[0_12px_30px_rgba(27,41,37,0.04)]">
            <p className="eyebrow">Payroll</p>
            <h2 className="mt-2 text-lg font-semibold text-[#263631]">Pay setup</h2>
            <p className="mt-1 text-sm text-[#718179]">These values feed payroll calculations and the Gusto export.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#65775e]">Pay type</label>
                <select
                  defaultValue={employee.payType ?? "commission_jth"}
                  onChange={(e) => save({ payType: e.target.value })}
                  className="co-input w-full text-sm"
                >
                  <option value="commission_jth">Commission by job ticket hours</option>
                  <option value="office_hourly">Office hourly</option>
                </select>
              </div>
              {employee.payType === "office_hourly" && (
                <Field
                  label="Hourly rate ($/hr)"
                  type="number"
                  defaultValue={dollars(employee.hourlyRateCents ?? 0)}
                  onSave={(v) => save({ hourlyRateCents: Math.round(parseFloat(v || "0") * 100) })}
                />
              )}
            </div>
            {employee.payType === "commission_jth" && (
              <TierRatesEditor
                employeeId={employee.id}
                payTiers={employee.payTiers}
                fallbackRateCents={employee.hourlyRateCents ?? 0}
                onSaved={load}
              />
            )}
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-2xl border border-[#d9e5cf] bg-[#e8f0df] p-6">
            <p className="eyebrow text-[#718e49]">Operations</p>
            <h2 className="mt-3 text-xl font-semibold tracking-[-0.035em] text-[#27352c]">Keep the profile connected.</h2>
            <p className="mt-3 text-sm leading-6 text-[#65775e]">
              This page now shows the jobs and time entries tied to the employee so you can manage work without jumping across screens.
            </p>
            <div className="mt-6 space-y-2">
              <Link href="/calendar" className="block rounded-xl border border-[#cfdcc2] bg-white/60 px-4 py-3 text-sm font-semibold text-[#536d35] hover:bg-white">
                Open calendar →
              </Link>
              <Link href="/jobs" className="block rounded-xl border border-[#cfdcc2] bg-white/60 px-4 py-3 text-sm font-semibold text-[#536d35] hover:bg-white">
                Open jobs →
              </Link>
              <Link href="/payroll" className="block rounded-xl border border-[#cfdcc2] bg-white/60 px-4 py-3 text-sm font-semibold text-[#536d35] hover:bg-white">
                Open payroll →
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-[#e1e8df] bg-white p-6 shadow-[0_12px_30px_rgba(27,41,37,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Schedule</p>
                <h2 className="mt-2 text-lg font-semibold text-[#263631]">Upcoming jobs</h2>
              </div>
              <Link href="/calendar" className="text-xs font-semibold text-[#668344] hover:text-[#40592b]">
                Open calendar
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {upcomingJobs.length === 0 ? (
                <EmptyState label="No upcoming jobs assigned yet." detail="Once jobs are scheduled, they will appear here." />
              ) : (
                upcomingJobs.map((job) => <JobRow key={job.id} job={job} />)
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[#e1e8df] bg-white p-6 shadow-[0_12px_30px_rgba(27,41,37,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">History</p>
                <h2 className="mt-2 text-lg font-semibold text-[#263631]">Recent jobs</h2>
              </div>
              <Link href="/jobs" className="text-xs font-semibold text-[#668344] hover:text-[#40592b]">
                View all jobs
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {recentJobs.length === 0 ? (
                <EmptyState label="No recent jobs yet." detail="Completed, cancelled, and no-show jobs will show up here." />
              ) : (
                recentJobs.map((job) => <JobRow key={job.id} job={job} compact />)
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[#e1e8df] bg-white p-6 shadow-[0_12px_30px_rgba(27,41,37,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Hours</p>
                <h2 className="mt-2 text-lg font-semibold text-[#263631]">Recent time entries</h2>
              </div>
              <Link href="/payroll" className="text-xs font-semibold text-[#668344] hover:text-[#40592b]">
                Edit payroll
              </Link>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-[#edf0ec]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#fafbf8] text-[11px] uppercase tracking-[0.12em] text-[#8a9b93]">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Customer / job</th>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3 text-right">Hrs</th>
                    <th className="px-4 py-3">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf0ec]">
                  {recentTimeEntries.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-[#718179]" colSpan={5}>
                        No time entries recorded yet.
                      </td>
                    </tr>
                  ) : (
                    recentTimeEntries.map((entry) => (
                      <tr key={entry.id} className="align-top">
                        <td className="px-4 py-3 text-xs text-[#718179]">{entry.scheduledDate}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#263631]">
                            {entry.customerFirstName} {entry.customerLastName}
                          </div>
                          <div className="mt-1 text-xs text-[#8a9b93]">
                            {JOB_TYPE_LABELS[entry.type]} • {JOB_STATUS_LABELS[entry.status]}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-[#718179]">
                          <div>{formatClock(entry.clockIn)}</div>
                          <div>{formatClock(entry.clockOut)}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-[#263631]">{formatHours(entry.minutesWorked)}</td>
                        <td className="px-4 py-3 text-xs text-[#718179]">
                          {entry.editedByAdmin ? <div>Edited by admin</div> : null}
                          {entry.recordedByAdmin ? <div>Recorded by admin</div> : null}
                          {entry.notes ? <div className="mt-1 text-[#5c7436]">{entry.notes}</div> : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-[#e1e8df] bg-white p-6">
            <p className="eyebrow">Audit readiness</p>
            <h2 className="mt-2 text-lg font-semibold text-[#263631]">Change history</h2>
            <p className="mt-2 text-sm leading-6 text-[#718179]">
              Employee profile and pay changes are recorded with the admin who made them. Time edits stay visible in payroll and job views.
            </p>
            <div className="mt-5 rounded-xl bg-[#fafbf8] p-4 text-xs text-[#65775e]">Every saved profile change creates an audit record.</div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <section className="rounded-2xl border border-[#e1e8df] bg-white p-5 shadow-[0_12px_30px_rgba(27,41,37,0.04)]">
      <p className="text-xs font-semibold text-[#718179]">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#1b2925]">{value}</p>
      <p className="mt-2 text-xs text-[#8a9b93]">{detail}</p>
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="h-5 w-36 animate-pulse rounded bg-[#e5ebe4]" />
      <div className="h-36 animate-pulse rounded-2xl bg-white" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-28 animate-pulse rounded-2xl bg-white" />
        <div className="h-28 animate-pulse rounded-2xl bg-white" />
        <div className="h-28 animate-pulse rounded-2xl bg-white" />
      </div>
    </div>
  );
}

function Field({
  label,
  defaultValue,
  onSave,
  type = "text",
}: {
  label: string;
  defaultValue: string;
  onSave: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-[#65775e]">{label}</label>
      <input
        type={type}
        defaultValue={defaultValue}
        onBlur={(e) => {
          if (e.target.value !== defaultValue) {
            onSave(e.target.value);
          }
        }}
        className="co-input w-full text-sm"
      />
    </div>
  );
}

function JobRow({ job, compact = false }: { job: EmployeeJob; compact?: boolean }) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      className={`block rounded-xl border border-[#edf0ec] bg-[#fafbf8] px-4 py-3 transition-colors hover:border-[#cfdcc2] hover:bg-[#f5f8f1] ${compact ? "text-xs" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-[#263631]">
            {job.customerFirstName} {job.customerLastName}
          </div>
          <div className="mt-1 text-[#718179]">{JOB_TYPE_LABELS[job.type]}</div>
          <div className="mt-1 text-[#8a9b93]">
            {job.addressLine1 ?? "No address"}
            {job.city ? `, ${job.city}` : ""}
            {job.state ? `, ${job.state}` : ""}
          </div>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${JOB_STATUS_CLASSES[job.status]}`}>
          {JOB_STATUS_LABELS[job.status]}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#718179]">
        <span>{job.scheduledDate}</span>
        <span>{formatClock(job.scheduledStartTime)}</span>
        <span>{job.estimatedDurationMinutes ? `${Math.round((job.estimatedDurationMinutes / 60) * 10) / 10} hrs est.` : "No estimate"}</span>
        {job.completedAt ? <span>Completed</span> : null}
      </div>
    </Link>
  );
}

function EmptyState({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#dfe7dd] bg-[#fafbf8] px-4 py-5">
      <p className="text-sm font-medium text-[#263631]">{label}</p>
      <p className="mt-1 text-xs leading-5 text-[#8a9b93]">{detail}</p>
    </div>
  );
}

function TierRatesEditor({
  employeeId,
  payTiers,
  fallbackRateCents,
  onSaved,
}: {
  employeeId: string;
  payTiers: PayTier[] | null;
  fallbackRateCents: number;
  onSaved: () => void;
}) {
  const [rates, setRates] = useState<[string, string, string, string]>(() => {
    if (payTiers && payTiers.length === 4) {
      return payTiers.map((tier) => dollars(tier.rateCents)) as [string, string, string, string];
    }
    const fallback = dollars(fallbackRateCents);
    return [fallback, fallback, fallback, fallback];
  });
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const tierRatesCents = rates.map((rate) => Math.round(parseFloat(rate || "0") * 100)) as [number, number, number, number];
    const response = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tierRatesCents }),
    });

    if (!response.ok) {
      return;
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onSaved();
  }

  return (
    <div className="mt-5 border-t border-[#edf0ec] pt-5">
      <label className="mb-3 block text-xs font-semibold text-[#65775e]">Tier rate schedule by weekly job ticket hours</label>
      <div className="grid gap-2 sm:grid-cols-4">
        {PAY_TIER_BRACKET_LABELS.map((label, index) => (
          <div key={label}>
            <label className="mb-1.5 block text-[11px] text-[#8a9b93]">{label}</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-[#8a9b93]">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={rates[index]}
                onChange={(e) => {
                  const next = [...rates] as [string, string, string, string];
                  next[index] = e.target.value;
                  setRates(next);
                }}
                className="co-input w-full pl-7 text-sm"
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={handleSave} className="co-button-primary">
          Save tier rates
        </button>
        {saved && <span className="text-xs font-semibold text-[#5c7436]">Saved</span>}
      </div>
    </div>
  );
}
