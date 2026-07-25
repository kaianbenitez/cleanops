import Link from "next/link";
import { getCrewCoverage } from "@/lib/dashboard/queries";

function weekdayLabel(day: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${day}T00:00:00.000Z`));
}

function ptoLabel(period: "full" | "morning" | "afternoon" | null) {
  return period === "full" ? "PTO" : period === "morning" ? "PTO AM" : period === "afternoon" ? "PTO PM" : null;
}

export default async function CrewCapacity({ companyId, weekStartIso }: { companyId: string; weekStartIso: string }) {
  const coverage = await getCrewCoverage(companyId, weekStartIso);
  const maxHours = Math.max(1, ...coverage.employees.flatMap((employee) => employee.hoursByDay));
  return <section className="co-card overflow-hidden"><div className="px-4 py-3"><h2 className="text-lg font-semibold">Crew coverage</h2><p className="text-sm text-[var(--co-muted)]">Assigned job hours this week{coverage.ptoCount ? " with PTO marked below." : ". No PTO scheduled."}</p></div>{coverage.employees.length ? <div className="overflow-x-auto border-t border-[var(--co-line-soft)]"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-[var(--co-surface-muted)] text-xs font-semibold text-[var(--co-muted)]"><tr><th className="px-4 py-3">Employee</th>{coverage.days.map((day) => <th key={day} className="px-3 py-3">{weekdayLabel(day)}</th>)}</tr></thead><tbody className="divide-y divide-[var(--co-line-soft)]">{coverage.employees.map((employee) => <tr key={employee.id}><th scope="row" className="whitespace-nowrap px-4 py-3 font-semibold">{employee.name}</th>{employee.hoursByDay.map((hours, index) => { const pto = ptoLabel(employee.ptoByDay[index] ?? null); return <td key={coverage.days[index]} className="min-w-28 px-3 py-3"><div className="h-1.5 overflow-hidden rounded bg-[var(--co-surface-muted)]"><div className="h-full bg-[var(--co-evergreen)]" style={{ width: `${hours ? Math.max(8, (hours / maxHours) * 100) : 0}%` }} /></div><div className="mt-1 flex items-center justify-between gap-2 text-xs"><span>{hours ? `${hours % 1 ? hours.toFixed(1) : hours}h` : "—"}</span>{pto ? <span className={employee.ptoByDay[index] === "full" ? "font-semibold text-amber-700" : "font-semibold text-amber-700/80"}>{pto}</span> : null}</div></td>; })}</tr>)}</tbody></table></div> : <p className="border-t border-[var(--co-line-soft)] px-4 py-6 text-sm text-[var(--co-muted)]">No active employees are available for this week&apos;s coverage view.</p>}<div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--co-line-soft)] px-4 py-3"><Link href="/jobs?unassigned=yes" className="text-sm font-semibold text-[var(--co-evergreen)] hover:underline">Review unassigned jobs</Link><Link href="/reports#operations" className="text-sm font-semibold text-[var(--co-evergreen)] hover:underline">Open operations report</Link></div></section>;
}
