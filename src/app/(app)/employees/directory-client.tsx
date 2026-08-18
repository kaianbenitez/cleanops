"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity, ArrowRight, BriefcaseBusiness, Check, Filter, Search, SlidersHorizontal, UsersRound } from "lucide-react";

export type EmployeeDirectoryRow = {
  id: string;
  name: string;
  initials: string;
  photoUrl: string | null;
  title: string;
  isActive: boolean;
  status: "Scheduled" | "Available";
  todayJobs: Array<{ id: string; time: string; customer: string; type: string; city: string }>;
  hoursThisWeek: number;
  mileageMiles: number;
  tipsCents: number;
  bonusCents: number;
};

const FILTERS = ["All", "Active", "Scheduled", "Available", "Archived"] as const;
function money(cents: number) { return `$${(cents / 100).toFixed(2)}`; }
function roleLabel(title: string) { return title.toLowerCase().includes("clean") ? "Cleaner" : title || "Team member"; }
function statusTone(row: EmployeeDirectoryRow) { if (!row.isActive) return "text-[var(--co-faint)]"; return row.status === "Scheduled" ? "text-[var(--co-warning)]" : "text-[var(--co-accent-text)]"; }

function Avatar({ row, large = false }: { row: EmployeeDirectoryRow; large?: boolean }) {
  const sizeClass = large ? "h-11 w-11 text-xs" : "h-9 w-9 text-[10px]";
  if (row.photoUrl) {
    return <img src={row.photoUrl} alt={row.name} className={`inline-flex shrink-0 rounded-full border border-white object-cover shadow-sm ${sizeClass}`} />;
  }
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-full border border-white bg-[var(--co-surface-muted-strong)] font-semibold text-[var(--co-accent-text)] shadow-sm ${sizeClass}`}>{row.initials}</span>;
}
function FilterChip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${active ? "bg-[var(--co-accent-fill)] text-white" : "bg-[var(--co-surface-muted)] text-[var(--co-muted)] hover:bg-[var(--co-surface-muted-strong)]"}`}>{children}</button>;
}

export default function EmployeeDirectory({ rows }: { rows: EmployeeDirectoryRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Active");
  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery = !normalized || `${row.name} ${row.title} ${row.todayJobs.map((job) => `${job.customer} ${job.city}`).join(" ")}`.toLowerCase().includes(normalized);
      const matchesFilter = filter === "All" || filter === "Active" ? (filter === "All" ? true : row.isActive) : filter === "Archived" ? !row.isActive : row.isActive && row.status === filter;
      return matchesQuery && matchesFilter;
    });
  }, [filter, query, rows]);
  const active = rows.filter((row) => row.isActive);
  const scheduled = active.filter((row) => row.status === "Scheduled");
  const available = active.filter((row) => row.status === "Available");
  const utilization = active.length ? Math.round((scheduled.length / active.length) * 100) : 0;
  const totalHours = active.reduce((sum, row) => sum + row.hoursThisWeek, 0);
  const totalExtras = active.reduce((sum, row) => sum + row.tipsCents + row.bonusCents, 0);

  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">{[
      ["Active cleaners", String(active.length), "Current roster"], ["Scheduled today", String(scheduled.length), "On the job board"], ["Available today", String(available.length), "Open for assignment"], ["Hours this week", totalHours.toFixed(1), "Clocked time"], ["Extras pending", money(totalExtras), "Tips + bonuses"],
    ].map(([label, value, detail]) => <div key={label} className="co-card px-4 py-3.5"><p className="eyebrow text-[10px]">{label}</p><p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">{value}</p><p className="mt-1 text-[11px] text-[var(--co-faint)]">{detail}</p></div>)}</section>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_224px]">
      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-4 py-4 sm:px-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">People operations</p><h2 className="mt-1 text-lg font-semibold tracking-[-0.02em]">Team directory</h2></div><Link href="/employees/new" className="co-button-primary"><UsersRound className="h-4 w-4" /> Add new member</Link></div><div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--co-faint)]"><Filter className="h-3 w-3" /> Filter by</span>{FILTERS.map((option) => <FilterChip key={option} active={filter === option} onClick={() => setFilter(option)}>{option}</FilterChip>)}</div><label className="relative block w-full lg:max-w-[290px]"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--co-faint)]" /><input aria-label="Search team members" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search team members, roles, or regions..." className="co-input w-full pl-9 text-xs" /></label></div></div>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[700px] text-left"><thead className="bg-[var(--co-surface-muted)] text-[10px] uppercase tracking-[0.12em] text-[var(--co-faint)]"><tr><th className="px-5 py-3 font-medium">Team member</th><th className="px-4 py-3 font-medium">Role & area</th><th className="px-4 py-3 font-medium">Workload</th><th className="px-4 py-3 font-medium">Status</th><th className="px-5 py-3 text-right font-medium">Actions</th></tr></thead><tbody className="divide-y divide-[var(--co-line-soft)]">{filteredRows.map((row) => <tr key={row.id} className="group hover:bg-[var(--co-surface-muted)]/45"><td className="px-5 py-3.5"><div className="flex items-center gap-3"><Avatar row={row} /><div><p className="text-sm font-semibold">{row.name}</p><p className="mt-0.5 text-[11px] text-[var(--co-faint)]">{row.todayJobs[0]?.customer ?? "No job assigned today"}</p></div></div></td><td className="px-4 py-3.5"><p className="text-xs font-semibold">{roleLabel(row.title)}</p><p className="mt-0.5 text-[11px] text-[var(--co-faint)]">{row.todayJobs[0]?.city ?? "Service area not set"}</p></td><td className="px-4 py-3.5"><p className="text-xs font-semibold">{row.todayJobs.length} job{row.todayJobs.length === 1 ? "" : "s"}</p><p className="mt-0.5 text-[11px] text-[var(--co-faint)]">{row.hoursThisWeek.toFixed(1)} hrs this week</p></td><td className={`px-4 py-3.5 text-xs font-semibold ${statusTone(row)}`}><span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-current" />{row.isActive ? row.status : "Archived"}</td><td className="px-5 py-3.5 text-right"><Link href={`/employees/${row.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--co-accent-text)] hover:underline">View profile <ArrowRight className="h-3.5 w-3.5" /></Link></td></tr>)}</tbody></table></div>
        <div className="divide-y divide-[var(--co-line-soft)] md:hidden">{filteredRows.map((row) => <Link key={row.id} href={`/employees/${row.id}`} className="flex items-center justify-between gap-3 px-4 py-4"><div className="flex items-center gap-3"><Avatar row={row} /><div><p className="text-sm font-semibold">{row.name}</p><p className="text-xs text-[var(--co-faint)]">{roleLabel(row.title)} · {row.todayJobs.length} jobs today</p></div></div><ArrowRight className="h-4 w-4 text-[var(--co-accent-text)]" /></Link>)}</div>
        {filteredRows.length === 0 && <div className="px-6 py-14 text-center text-sm text-[var(--co-muted)]">No team members match this view.</div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/60 px-5 py-3 text-[11px] text-[var(--co-faint)]"><span>Showing {filteredRows.length} of {rows.length}</span><span className="inline-flex items-center gap-1"><SlidersHorizontal className="h-3.5 w-3.5" /> Live roster data</span></div>
      </section>
      <aside className="space-y-5"><section className="co-card relative overflow-hidden p-5"><div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[var(--co-accent-tint)]" /><div className="relative"><div className="flex items-center gap-2"><Activity className="h-4 w-4 text-[var(--co-accent-text)]" /><h2 className="text-sm font-semibold">Team health</h2></div><div className="mt-5 flex items-end justify-between"><div><p className="text-[11px] text-[var(--co-faint)]">Active cleaners</p><p className="mt-1 text-2xl font-semibold">{active.length}</p></div><span className="text-xs font-bold text-[var(--co-accent-text)]">{utilization}% deployed</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--co-line-soft)]"><div className="h-full rounded-full bg-[var(--co-accent-fill)]" style={{ width: `${utilization}%` }} /></div><div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-lg border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] p-3"><p className="text-[10px] uppercase tracking-[0.08em] text-[var(--co-faint)]">Available</p><p className="mt-1 text-lg font-semibold">{available.length}</p></div><div className="rounded-lg border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] p-3"><p className="text-[10px] uppercase tracking-[0.08em] text-[var(--co-faint)]">Scheduled</p><p className="mt-1 text-lg font-semibold">{scheduled.length}</p></div></div></div></section><section className="co-card p-5"><div className="flex items-center gap-2"><BriefcaseBusiness className="h-4 w-4 text-[var(--co-accent-text)]" /><h2 className="text-sm font-semibold">Today’s coverage</h2></div><div className="mt-4 space-y-3">{active.slice(0, 4).map((row) => <div key={row.id} className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><Avatar row={row} /><p className="truncate text-xs font-semibold">{row.name}</p></div><span className={`shrink-0 text-[11px] font-semibold ${statusTone(row)}`}>{row.todayJobs.length} job{row.todayJobs.length === 1 ? "" : "s"}</span></div>)}</div><Link href="/calendar" className="mt-5 flex items-center justify-between border-t border-[var(--co-line-soft)] pt-4 text-xs font-bold text-[var(--co-accent-text)]">Open calendar <ArrowRight className="h-3.5 w-3.5" /></Link></section><section className="rounded-xl border border-dashed border-[var(--co-line)] bg-[var(--co-surface-muted)]/60 p-5"><div className="flex items-start gap-3"><Check className="mt-0.5 h-4 w-4 text-[var(--co-accent-text)]" /><div><p className="text-sm font-semibold">Ready for payroll review</p><p className="mt-1 text-xs leading-5 text-[var(--co-muted)]">Mileage, tips, and bonuses are available from the live employee records.</p><Link href="/payroll" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[var(--co-accent-text)]">Review payroll <ArrowRight className="h-3.5 w-3.5" /></Link></div></div></section></aside>
    </div>
  </div>;
}
