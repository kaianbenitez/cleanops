"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapPin, User, CalendarDays, History } from "lucide-react";
import { emailToUsername } from "@/lib/auth/username";
import PtoEditor, { type EmployeePto } from "./pto-editor";
import PhotoUpload from "./photo-upload";
import { ComingSoonStat } from "@/components/ui/coming-soon-stat";
import { statusLabel } from "@/components/ui/status-pill";
import ReportNotes from "./report-notes";
import PendingPtoRequests from "./pending-pto-requests";
import EmployeeTags from "./employee-tags";
import { DateInput } from "@/components/date-input";

type PayTier = { minHours: number; maxHours: number | null; rateCents: number };
type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  contactEmail: string | null;
  phone: string | null;
  title: string | null;
  birthday: string | null;
  hiredDate: string | null;
  payType: "commission_jth" | "office_hourly" | null;
  hourlyRateCents: number | null;
  payTiers: PayTier[] | null;
  gustoEmployeeId: string | null;
  isActive: boolean;
  serviceLocationIds: string[];
  serviceLocationNames: string[];
  profilePhotoUrl: string | null;
  tags: string[];
};
type Stats = {
  jobsCompleted: number;
  hoursWorked: number;
  thisMonthPayCents: number;
  completionRate: number | null;
  teamRank: number | null;
  teamSize: number;
};
type WeekDay = { date: string; jobCount: number };
type CalendarBlock = {
  id: string;
  title: string;
  scheduledDate: string;
  startTime: string | null;
  durationMinutes: number | null;
  isAllDay: boolean;
  category: "meeting" | "reminder" | "training";
  status: "scheduled" | "cancelled";
  timeOffType: "paid" | "unpaid" | null;
  note: string | null;
};
type ServiceLocation = { id: string; name: string };
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
type PayTierBracket = { minHours: number; maxHours: number | null; label: string };

const JOB_TYPE_LABELS: Record<EmployeeJob["type"], string> = {
  first_clean: "First clean",
  recurring: "Recurring",
  one_time: "One time",
  deep_clean: "Deep clean",
  move_out: "Move out",
};

const JOB_STATUS_CLASSES: Record<EmployeeJob["status"], string> = {
  scheduled: "co-badge-success",
  in_progress: "co-badge-info",
  completed: "co-badge-success",
  cancelled: "co-badge-danger",
  no_show: "co-badge-warning",
};

function dollars(cents: number) {
  return (cents / 100).toFixed(2);
}

function formatClock(value: string | null) {
  return value ? value.slice(0, 5) : "—";
}

function formatBlockTime(block: CalendarBlock) {
  if (block.isAllDay) return "All day";
  if (!block.startTime) return "Time not set";
  const start = formatClock(block.startTime);
  return `${start}${block.durationMinutes ? ` · ${block.durationMinutes} min` : ""}`;
}

/** hh:mm, matching the Jobs list / Job Detail / Calendar convention. */
function formatEstimatedTime(minutes: number | null) {
  if (!minutes) return "No estimate";
  return `Est. ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function tenureLabel(hiredDate: string | null) {
  if (!hiredDate) return null;
  const hired = new Date(`${hiredDate}T00:00:00.000Z`);
  if (Number.isNaN(hired.getTime())) return null;
  const months = Math.max(0, Math.floor((Date.now() - hired.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
  if (months < 1) return "New this month";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} tenured`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  return remMonths === 0 ? `${years} year${years === 1 ? "" : "s"} tenured` : `${years}.${Math.floor((remMonths / 12) * 10)} years tenured`;
}

function milestoneCountdown(value: string | null, label: string) {
  if (!value) return null;
  const source = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(source.getTime())) return null;
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
  if (next < new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))) next.setUTCFullYear(next.getUTCFullYear() + 1);
  const days = Math.round((next.getTime() - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000);
  const countdown = days === 0 ? "today" : days < 45 ? `in ${days} day${days === 1 ? "" : "s"}` : `in ${Math.round(days / 30.44)} months`;
  return `${label} ${countdown}`;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function WeekStrip({ days, pto = [] }: { days: WeekDay[]; pto?: EmployeePto[] }) {
  if (days.length === 0) return null;
  const todayISO = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day, i) => {
        const isToday = day.date === todayISO;
        const ptoEntry = pto.find((entry) => entry.startDate <= day.date && entry.endDate >= day.date);
        const isPto = Boolean(ptoEntry);
        const isOff = day.jobCount === 0 && !isPto;
        const dayNumber = Number(day.date.slice(8, 10));
        return (
          <div
            key={day.date}
            className={`rounded-xl border px-2 py-2.5 text-center ${
              isPto
                ? "border-[var(--co-warning)]/30 bg-[var(--co-warning)]/10"
                : isOff
                ? "border-[var(--co-danger)]/30 bg-[var(--co-danger)]/10"
                : isToday
                  ? "border-[var(--co-accent-text)] bg-[var(--co-accent-text)]/5"
                  : "border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40"
            }`}
          >
            <p className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${isPto ? "text-[var(--co-warning)]" : isOff ? "text-[var(--co-danger)]" : "text-[var(--co-muted)]"}`}>
              {WEEKDAY_LABELS[i]}
            </p>
            <p className={`mt-0.5 text-sm font-semibold ${isPto ? "text-[var(--co-warning)]" : isOff ? "text-[var(--co-danger)]" : "text-[var(--co-ink)]"}`}>{dayNumber}</p>
            {isPto ? (
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--co-warning)]">Time off</p>
            ) : isOff ? (
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--co-danger)]">Off</p>
            ) : (
              <p className="mt-1 text-[11px] font-semibold text-[var(--co-accent-text)]">
                {day.jobCount} job{day.jobCount === 1 ? "" : "s"}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}


export default function EmployeeProfilePage({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = use(params);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentJobs, setRecentJobs] = useState<EmployeeJob[]>([]);
  const [, setPayTierBrackets] = useState<PayTierBracket[]>([]);
  const [weeklySchedule, setWeeklySchedule] = useState<WeekDay[]>([]);
  const [calendarBlocks, setCalendarBlocks] = useState<CalendarBlock[]>([]);
  const [serviceLocations, setServiceLocations] = useState<ServiceLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managementMessage, setManagementMessage] = useState<string | null>(null);
  const [managementError, setManagementError] = useState<string | null>(null);
  const [linkedRecords, setLinkedRecords] = useState<Record<string, number> | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [pto, setPto] = useState<EmployeePto[]>([]);
  const employeeInfoRef = useRef<HTMLDivElement>(null);

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
    setRecentJobs(data.recentJobs ?? []);
    setPayTierBrackets(data.payTierBrackets ?? []);
    setWeeklySchedule(data.weeklySchedule ?? []);
    setCalendarBlocks(data.calendarBlocks ?? []);
    setError(null);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => {
    // This is the page loader for the employee profile route.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    // Loads the service areas available in the employee's checkbox list.
    void fetch("/api/service-locations")
      .then((res) => res.json())
      .then((data) => setServiceLocations(data.locations ?? []))
      .catch(() => setServiceLocations([]));
  }, []);

  async function save(fields: Record<string, unknown>) {
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
    await load();
  }

  async function setPassword(password: string, confirmPassword: string) {
    setManagementMessage(null);
    setManagementError(null);
    const response = await fetch(`/api/employees/${employeeId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, confirmPassword }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setManagementError(data.error ?? "Could not change the password.");
      return;
    }
    setManagementMessage("Password changed. Share the new password securely with the employee — they'll be asked to set their own on next login.");
  }

  async function deleteEmployee(force = false) {
    setManagementMessage(null);
    setManagementError(null);
    if (!force) setLinkedRecords(null);
    const response = await fetch(`/api/employees/${employeeId}${force ? "?force=true" : ""}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 409 && data.linkedRecords) {
        setLinkedRecords(data.linkedRecords);
        return;
      }
      setManagementError(data.error ?? "This employee could not be deleted.");
      return;
    }
    window.location.href = "/employees";
  }

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (error || !employee || !stats) {
    return <div className="co-badge-danger rounded-2xl p-6 text-sm">{error ?? "Employee not found."}</div>;
  }

  const fullName = `${employee.firstName} ${employee.lastName}`;
  const initials = `${employee.firstName[0] ?? ""}${employee.lastName[0] ?? ""}`.toUpperCase();
  const tenure = tenureLabel(employee.hiredDate);

  return <CompactProfile
    employee={employee}
    stats={stats}
    recentJobs={recentJobs}
    weeklySchedule={weeklySchedule}
    calendarBlocks={calendarBlocks}
    pto={pto}
    serviceLocations={serviceLocations}
    editMode={editMode}
    setEditMode={setEditMode}
    employeeInfoRef={employeeInfoRef}
    save={save}
    setPto={setPto}
    fullName={fullName}
    initials={initials}
    tenure={tenure}
    setPassword={setPassword}
    deleteEmployee={deleteEmployee}
    managementMessage={managementMessage}
    managementError={managementError}
    linkedRecords={linkedRecords}
    load={load}
  />;
}

type CompactProfileProps = {
  employee: Employee;
  stats: Stats;
  recentJobs: EmployeeJob[];
  weeklySchedule: WeekDay[];
  calendarBlocks: CalendarBlock[];
  pto: EmployeePto[];
  serviceLocations: ServiceLocation[];
  editMode: boolean;
  setEditMode: (value: boolean) => void;
  employeeInfoRef: React.RefObject<HTMLDivElement | null>;
  save: (fields: Record<string, unknown>) => Promise<void>;
  setPto: (pto: EmployeePto[]) => void;
  fullName: string;
  initials: string;
  tenure: string | null;
  setPassword: (password: string, confirmPassword: string) => Promise<void>;
  deleteEmployee: (force?: boolean) => Promise<void>;
  managementMessage: string | null;
  managementError: string | null;
  linkedRecords: Record<string, number> | null;
  load: () => Promise<void>;
};

function CompactProfile({
  employee,
  stats,
  recentJobs,
  weeklySchedule,
  calendarBlocks,
  pto,
  serviceLocations,
  editMode,
  setEditMode,
  employeeInfoRef,
  save,
  setPto,
  fullName,
  initials,
  tenure,
  setPassword,
  deleteEmployee,
  managementMessage,
  managementError,
  linkedRecords,
  load,
}: CompactProfileProps) {
  const anniversary = milestoneCountdown(employee.hiredDate, "Work anniversary");
  const birthday = milestoneCountdown(employee.birthday, "Birthday");
  return (
    <div className="mx-auto max-w-[1180px] space-y-5 pb-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/employees" className="text-xs font-semibold text-[var(--co-accent-text)] hover:underline">← Team directory</Link>
          <p className="mt-2 text-xs text-[var(--co-muted)]">Cleaners <span className="mx-1">›</span> <span className="text-[var(--co-ink)]">{fullName}</span></p>
        </div>
        <button type="button" onClick={() => void save({ isActive: !employee.isActive })} className="co-button-secondary text-xs">
          {employee.isActive ? "Archive" : "Restore"}
        </button>
      </div>

      <section className="co-card flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-2xl border-2 border-[var(--co-accent-text)] bg-[var(--co-surface-muted)] text-2xl font-semibold text-[var(--co-accent-text)]">
            {employee.profilePhotoUrl ? <img src={employee.profilePhotoUrl} alt={`${fullName} profile`} className="h-full w-full rounded-[14px] object-cover" /> : initials}
            <span className={`absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] ${employee.isActive ? "co-badge-success" : "co-badge-muted"}`}>{employee.isActive ? "Active" : "Inactive"}</span>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--co-ink)]">{fullName}</h1>
              <span className="co-badge-info rounded-full px-2.5 py-1 text-[11px] font-semibold">{employee.title ?? "Team member"}</span>
              {employee.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--co-muted)]">{tag}</span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--co-muted)]">
              <span className="flex items-center gap-1"><MapPin aria-hidden="true" className="h-3.5 w-3.5" />{employee.serviceLocationNames.join(" · ") || "No service areas"}</span>
              {tenure ? <span>{tenure}</span> : null}
            </div>
            {anniversary || birthday ? <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium text-[var(--co-muted)]"><span className="rounded-md border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-2 py-1">{anniversary ?? "Work anniversary not set"}</span><span className="rounded-md border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-2 py-1">{birthday ?? "Birthday not set"}</span></div> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-4 border-t border-[var(--co-line-soft)] pt-4 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button type="button" onClick={() => { setEditMode(true); employeeInfoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="co-button-primary">Edit profile</button>
            <Link href={`/calendar?view=staff&employeeId=${employee.id}`} className="co-button-secondary">View schedule</Link>
          </div>
          <div className="flex gap-7">
          <div><p className="eyebrow">Total jobs</p><p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--co-accent-text)]">{stats.jobsCompleted.toLocaleString()}</p></div>
          <div><p className="eyebrow">Team rank</p><p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--co-accent-text)]">{stats.teamRank == null ? "—" : `#${stats.teamRank}`}</p>{stats.teamRank != null ? <p className="text-[11px] text-[var(--co-muted)]">of {stats.teamSize}</p> : null}</div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <ComingSoonStat label="Avg rating" />
        <Stat label="Hours worked" value={stats.hoursWorked.toFixed(1)} detail="Lifetime tracked hours" />
        <ComingSoonStat label="Attendance" />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[285px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section ref={employeeInfoRef} className="co-card scroll-mt-5 p-5">
            <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><User className="h-4 w-4 text-[var(--co-accent-text)]" /><h2 className="text-sm font-semibold">Personnel details</h2></div>{editMode ? <button type="button" onClick={() => setEditMode(false)} className="text-xs font-semibold text-[var(--co-muted)] hover:text-[var(--co-ink)]">Done</button> : null}</div>
            {editMode ? (
              <div className="mt-5 space-y-3">
                <div className="rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] p-3">
                  <p className="text-xs font-semibold text-[var(--co-ink)]">Profile photo</p>
                  <p className="mt-1 text-[11px] text-[var(--co-muted)]">Upload a JPG, PNG, or WebP image (up to 5 MB).</p>
                  <div className="mt-3"><PhotoUpload employeeId={employee.id} photoUrl={employee.profilePhotoUrl} initials={initials} onUploaded={load} /></div>
                </div>
                <Field label="First name" defaultValue={employee.firstName} onSave={(v) => save({ firstName: v })} />
                <Field label="Last name" defaultValue={employee.lastName} onSave={(v) => save({ lastName: v })} />
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--co-muted)]">Username</label>
                  <p className="co-input flex w-full items-center text-sm text-[var(--co-muted)]">{emailToUsername(employee.email)}</p>
                </div>
                <Field label="Email" type="email" defaultValue={employee.contactEmail ?? ""} onSave={(v) => save({ contactEmail: v })} />
                <Field label="Phone" defaultValue={employee.phone ?? ""} onSave={(v) => save({ phone: v })} />
                <Field label="Title" defaultValue={employee.title ?? ""} onSave={(v) => save({ title: v })} />
                <Field label="Hire date" type="date" defaultValue={employee.hiredDate ?? ""} onSave={(v) => save({ hiredDate: v || null })} />
                <Field label="Birthday" type="date" defaultValue={employee.birthday ?? ""} onSave={(v) => save({ birthday: v || null })} />
                <Field label="Gusto employee ID" defaultValue={employee.gustoEmployeeId ?? ""} onSave={(v) => save({ gustoEmployeeId: v })} />
              </div>
            ) : (
              <div className="mt-5 space-y-4 text-xs">
                <div><p className="eyebrow">Contact info</p><p className="mt-1 font-medium text-[var(--co-ink)]">{employee.contactEmail ?? "No email on file"}</p><p className="text-[var(--co-muted)]">{employee.phone ?? "No phone number"}</p><p className="mt-1 text-[var(--co-muted)]">Username: {emailToUsername(employee.email)}</p></div>
                <div><p className="eyebrow">Hire date</p><p className="mt-1 text-[var(--co-ink)]">{employee.hiredDate ?? "Not set"}</p></div>
                <div><p className="eyebrow">Birthday</p><p className="mt-1 text-[var(--co-ink)]">{employee.birthday ?? "Not set"}</p></div>
                <div><p className="eyebrow">Employment</p><div className="mt-1 flex flex-wrap gap-1.5"><span className="rounded bg-[var(--co-surface-muted)] px-2 py-1 text-[11px]">{employee.payType === "office_hourly" ? "Hourly" : "Commission"}</span><span className="rounded bg-[var(--co-surface-muted)] px-2 py-1 text-[11px]">{employee.isActive ? "Active" : "Archived"}</span></div></div>
                <div><p className="eyebrow">Gusto employee ID</p><p className="mt-1 text-[var(--co-ink)]">{employee.gustoEmployeeId ?? "Not set"}</p></div>
              </div>
            )}
          </section>

          <section className="co-card p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Works in</h2><span className="text-[var(--co-accent-text)]">Booking eligibility</span></div><p className="mt-4 rounded-xl bg-[var(--co-surface-muted)] px-3 py-3 text-xs font-medium text-[var(--co-ink)]">{employee.serviceLocationNames.join(" · ") || "No service areas assigned"}</p>{editMode ? <div className="mt-3 grid gap-2 text-xs">{serviceLocations.map((location) => { const selected = employee.serviceLocationIds.includes(location.id); const onlySelection = selected && employee.serviceLocationIds.length === 1; return <label key={location.id} className="flex gap-2"><input type="checkbox" checked={selected} disabled={onlySelection} title={onlySelection ? "Each cleaner needs at least one service area." : undefined} onChange={(event) => { const ids = new Set(employee.serviceLocationIds); if (event.target.checked) ids.add(location.id); else ids.delete(location.id); void save({ serviceLocationIds: [...ids] }); }} />{location.name}</label>; })}</div> : null}</section>

          <EmployeeTags tags={employee.tags} onSave={(tags) => void save({ tags })} />
        </aside>

        <div className="space-y-5">
          <section className="co-card overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--co-line-soft)] px-5 py-4"><div className="flex items-center gap-2"><History className="h-4 w-4 text-[var(--co-accent-text)]" /><h2 className="text-sm font-semibold">Recent jobs</h2></div><Link href="/jobs" className="text-xs font-semibold text-[var(--co-accent-text)] hover:underline">View full history ↗</Link></div><div className="divide-y divide-[var(--co-line-soft)]">{recentJobs.length === 0 ? <div className="px-5 py-6"><EmptyState label="No recent jobs yet." detail="Completed work will appear here." /></div> : recentJobs.map((job) => <JobRow key={job.id} job={job} compact />)}</div></section>

          <section className="co-card p-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[var(--co-accent-text)]" /><h2 className="text-sm font-semibold">Weekly schedule preview</h2></div><Link href={`/calendar?view=staff_vertical&employeeId=${employee.id}`} className="text-xs font-semibold text-[var(--co-accent-text)] hover:underline">View schedule</Link></div><p className="mt-1 text-xs text-[var(--co-muted)]">Assignments and planned time off for this week.</p><div className="mt-4"><WeekStrip days={weeklySchedule} pto={pto} /></div><PtoEditor employeeId={employee.id} onChange={setPto} /></section>
          <section className="co-card overflow-hidden"><div className="border-b border-[var(--co-line-soft)] px-5 py-4"><div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[var(--co-accent-text)]" /><h2 className="text-sm font-semibold">Calendar blocks</h2></div><p className="mt-1 text-xs text-[var(--co-muted)]">Meetings and blocked time assigned to this employee.</p></div><div className="divide-y divide-[var(--co-line-soft)]">{calendarBlocks.length === 0 ? <p className="px-5 py-5 text-sm text-[var(--co-muted)]">No calendar blocks assigned.</p> : calendarBlocks.map((block) => <div key={block.id} className={`flex items-start justify-between gap-3 px-5 py-3 ${block.status === "cancelled" ? "opacity-55" : ""}`}><div className="min-w-0"><p className="truncate text-sm font-medium text-[var(--co-ink)]">{block.title}</p><p className="mt-1 text-xs text-[var(--co-muted)]">{block.scheduledDate} · {formatBlockTime(block)}{block.timeOffType ? ` · ${block.timeOffType}` : ""}</p>{block.note ? <p className="mt-1 truncate text-xs text-[var(--co-muted)]">{block.note}</p> : null}</div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${block.status === "cancelled" ? "co-badge-danger" : block.category === "reminder" ? "co-badge-warning" : "co-badge-info"}`}>{block.status === "cancelled" ? "Cancelled" : block.category === "reminder" ? "Blocked" : "Meeting"}</span></div>)}</div></section>
          <PendingPtoRequests employeeId={employee.id} />
          <ReportNotes employeeId={employee.id} />

        </div>
      </div>

      <EmployeeAccountManagement
        employeeName={fullName}
        isActive={employee.isActive}
        onSetPassword={setPassword}
        onDelete={deleteEmployee}
        message={managementMessage}
        error={managementError}
        linkedRecords={linkedRecords}
      />
    </div>
  );
}

const LINKED_RECORD_LABELS: Record<string, string> = {
  jobAssignments: "job assignment",
  timeEntries: "time entry",
  payrollLines: "payroll line",
  auditEntries: "audit log entry",
  preferredByCustomers: "customer with them as preferred cleaner",
};

function describeLinkedRecords(linkedRecords: Record<string, number>) {
  return Object.entries(linkedRecords)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${count} ${LINKED_RECORD_LABELS[key] ?? key}${count === 1 ? "" : "s"}`)
    .join(", ");
}

function EmployeeAccountManagement({
  employeeName,
  isActive,
  onSetPassword,
  onDelete,
  message,
  error,
  linkedRecords,
}: {
  employeeName: string;
  isActive: boolean;
  onSetPassword: (password: string, confirmPassword: string) => Promise<void>;
  onDelete: (force?: boolean) => Promise<void>;
  message: string | null;
  error: string | null;
  linkedRecords: Record<string, number> | null;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await onSetPassword(password, confirmPassword);
    setSaving(false);
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <section className="co-card p-6">
      <p className="eyebrow">Administration</p>
      <h2 className="mt-2 text-lg font-semibold text-[var(--co-ink)]">Account access</h2>
      <p className="mt-1 text-sm leading-6 text-[var(--co-muted)]">
        Manage sign-in access for {employeeName}, or archive this employee when they leave. Archived employees stay in historical payroll and job records.
      </p>

      <form onSubmit={submitPassword} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block text-xs font-semibold text-[var(--co-muted)]">
          New password
          <input
            aria-label="New employee password"
            type="password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="co-input mt-1.5 w-full text-sm"
            placeholder="At least 8 characters"
            required
          />
        </label>
        <label className="block text-xs font-semibold text-[var(--co-muted)]">
          Confirm password
          <input
            aria-label="Confirm employee password"
            type="password"
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="co-input mt-1.5 w-full text-sm"
            placeholder="Repeat password"
            required
          />
        </label>
        <button type="submit" className="co-button-secondary" disabled={saving}>
          {saving ? "Saving…" : "Change password"}
        </button>
      </form>

      {message ? <p className="mt-3 text-xs font-semibold text-[var(--co-accent-text)]">{message}</p> : null}
      {error ? <p className="mt-3 text-xs font-semibold text-[var(--co-danger)]">{error}</p> : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--co-line-soft)] pt-5">
        <div>
          <p className="text-sm font-semibold text-[var(--co-ink)]">{isActive ? "Archive employee" : "Employee is archived"}</p>
          <p className="mt-1 text-xs text-[var(--co-muted)]">{isActive ? "Stops this person from appearing in active assignment pickers." : "Restore them from the button above when needed."}</p>
        </div>
        {!linkedRecords ? (
          <button
            type="button"
            className="rounded-xl border border-[var(--co-danger)]/30 px-3.5 py-2.5 text-xs font-semibold text-[var(--co-danger)] hover:bg-[var(--co-danger)]/10"
            onClick={() => {
              if (window.confirm(`Permanently delete ${employeeName}? This cannot be undone. Employees with job, payroll, or audit history must be archived instead.`)) {
                void onDelete();
              }
            }}
          >
            Delete permanently
          </button>
        ) : null}
      </div>

      {linkedRecords ? (
        <div className="co-badge-warning mt-4 rounded-xl p-4">
          <p className="text-sm font-semibold">{employeeName} has history in Shimmer</p>
          <p className="mt-1 text-xs leading-5">
            {describeLinkedRecords(linkedRecords)}. They can&apos;t be permanently removed without losing that history — archive
            them instead (button above), or force-delete: their profile is marked inactive and their login is revoked so they
            can&apos;t sign in or be assigned new work, but their name stays on every past job, time entry, and payroll line,
            shown with an &quot;Inactive&quot; badge.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-xl border border-[var(--co-danger)]/40 bg-[var(--co-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--co-danger)] hover:bg-[var(--co-danger)]/10"
              onClick={() => {
                if (window.confirm(`Force-delete ${employeeName}? Their login will be revoked immediately and they'll no longer be assignable, but their name stays on past jobs and payroll. This cannot be undone.`)) {
                  void onDelete(true);
                }
              }}
            >
              Force delete anyway
            </button>
            <button type="button" className="co-button-secondary py-2 text-xs" onClick={() => void onDelete(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <section className="co-card p-5">
      <p className="text-xs font-semibold text-[var(--co-muted)]">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[var(--co-ink)]">{value}</p>
      <p className="mt-2 text-xs text-[var(--co-muted)]">{detail}</p>
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="h-5 w-36 animate-pulse rounded bg-[var(--co-surface-muted)]" />
      <div className="h-36 animate-pulse rounded-2xl bg-[var(--co-surface-muted)]" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-28 animate-pulse rounded-2xl bg-[var(--co-surface-muted)]" />
        <div className="h-28 animate-pulse rounded-2xl bg-[var(--co-surface-muted)]" />
        <div className="h-28 animate-pulse rounded-2xl bg-[var(--co-surface-muted)]" />
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
  if (type === "date") {
    return <DateInput label={label} defaultValue={defaultValue} onChange={(value) => value !== defaultValue && onSave(value)} />;
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-[var(--co-muted)]">{label}</label>
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
      className={`block border-b border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-5 py-4 transition-colors last:border-b-0 hover:bg-[var(--co-surface)] ${compact ? "text-xs" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-[var(--co-ink)]">
            {job.customerFirstName} {job.customerLastName}
          </div>
          <div className="mt-1 text-[var(--co-muted)]">{JOB_TYPE_LABELS[job.type]}</div>
          <div className="mt-1 text-[var(--co-muted)]">
            {job.addressLine1 ?? "No address"}
            {job.city ? `, ${job.city}` : ""}
            {job.state ? `, ${job.state}` : ""}
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${JOB_STATUS_CLASSES[job.status]}`}>
          {statusLabel("job", job.status)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--co-muted)]">
        <span>{job.scheduledDate}</span>
        <span>{formatClock(job.scheduledStartTime)}</span>
        <span>{formatEstimatedTime(job.estimatedDurationMinutes)}</span>
        {job.completedAt ? <span>Completed</span> : null}
      </div>
    </Link>
  );
}

function EmptyState({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-4 py-5">
      <p className="text-sm font-medium text-[var(--co-ink)]">{label}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--co-muted)]">{detail}</p>
    </div>
  );
}

function TierRatesEditor({
  employeeId,
  payTiers,
  brackets,
  fallbackRateCents,
  onSaved,
}: {
  employeeId: string;
  payTiers: PayTier[] | null;
  brackets: PayTierBracket[];
  fallbackRateCents: number;
  onSaved: () => void;
}) {
  const [rates, setRates] = useState<string[]>(() => {
    if (payTiers && payTiers.length === brackets.length) {
      return payTiers.map((tier) => dollars(tier.rateCents));
    }
    const fallback = dollars(fallbackRateCents);
    return brackets.map(() => fallback);
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setError("");
    const tierRatesCents = rates.map((rate) => Math.round(parseFloat(rate || "0") * 100));
    const response = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tierRatesCents }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not save tier rates.");
      return;
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onSaved();
  }

  if (brackets.length === 0) {
    return null;
  }

  return (
    <div className="mt-5 border-t border-[var(--co-line-soft)] pt-5">
      <label className="mb-3 block text-xs font-semibold text-[var(--co-muted)]">Tier rate schedule by weekly job ticket hours</label>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {brackets.map((bracket, index) => (
          <div key={bracket.label} className="min-w-0">
            <label className="mb-1.5 block truncate text-[11px] text-[var(--co-muted)]" title={bracket.label}>{bracket.label}</label>
            <div className="relative">
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm leading-none text-[var(--co-muted)]">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={rates[index] ?? "0.00"}
                onChange={(e) => {
                  const next = [...rates];
                  next[index] = e.target.value;
                  setRates(next);
                }}
                className="co-input block w-full min-w-0 !pl-8 text-sm tabular-nums"
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={handleSave} className="co-button-primary">
          Save tier rates
        </button>
        {saved && <span className="text-xs font-semibold text-[var(--co-accent-text)]">Saved</span>}
        {error && <span className="text-xs font-semibold text-[var(--co-danger)]">{error}</span>}
      </div>
    </div>
  );
}
