import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Star } from "lucide-react";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveRange } from "@/lib/dashboard/range";
import { getQualityReport } from "@/lib/reports/queries";
import { ReportsFilters } from "../reports/reports-controls";

type SearchParams = Promise<{ from?: string; preset?: string; to?: string }>;

function exportHref(range: { fromIso: string; toIso: string; preset: string }) {
  const params = new URLSearchParams({ preset: range.preset, from: range.fromIso, to: range.toIso });
  return `/api/reports/quality/export?${params.toString()}`;
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function feedbackLabel(status: string) {
  if (status === "responded") return "Responded";
  if (status === "expired") return "Link expired";
  if (status === "awaiting_response") return "Awaiting response";
  return "Not sent";
}

function statusClass(status: string) {
  if (status === "responded") return "bg-[#e4f1e7] text-[var(--co-evergreen)]";
  if (status === "expired") return "bg-amber-50 text-amber-800";
  return "bg-[var(--co-surface-muted)] text-[var(--co-muted)]";
}

export default async function QualityPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/my-day");
  const params = await searchParams;
  const [company] = await db.select({ timezone: companies.timezone }).from(companies).where(eq(companies.id, user.companyId)).limit(1);
  if (!company) redirect("/dashboard");
  const range = resolveRange({ preset: params.preset, from: params.from, to: params.to }, company.timezone);
  const quality = await getQualityReport(user.companyId, range);

  return <div className="max-w-7xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><div className="flex items-center gap-2 text-[var(--co-evergreen)]"><Star className="h-5 w-5" /><p className="eyebrow">Customer experience</p></div><h1 className="page-title mt-2">Quality</h1><p className="page-subtitle">Track every completed job and see who has responded.</p></div>
      <div className="flex flex-wrap items-center gap-2"><ReportsFilters areas={[]} fromIso={range.fromIso} toIso={range.toIso} preset={range.preset} /><a href={exportHref(range)} className="co-button-primary">Export CSV</a></div>
    </header>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="co-card p-4"><p className="eyebrow">Completed jobs</p><p className="mt-2 text-2xl font-semibold">{quality.totalCompletedJobs}</p><p className="mt-1 text-xs text-[var(--co-muted)]">Based on service date</p></div>
      <div className="co-card p-4"><p className="eyebrow">Responses</p><p className="mt-2 text-2xl font-semibold">{quality.totalResponses}</p><p className="mt-1 text-xs text-[var(--co-muted)]">{quality.totalCompletedJobs ? Math.round((quality.totalResponses / quality.totalCompletedJobs) * 100) : 0}% response rate</p></div>
      <div className="co-card p-4"><p className="eyebrow">5-star ratings</p><p className="mt-2 text-2xl font-semibold text-[var(--co-evergreen)]">{quality.fiveStarTotal}</p></div>
    </div>

    <section className="co-card overflow-hidden"><div className="border-b border-[var(--co-line-soft)] p-5"><h2 className="font-semibold">Cleaner summary</h2><p className="mt-1 text-sm text-[var(--co-muted)]">Responses are attributed to every cleaner assigned to the job.</p></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[var(--co-surface-muted)] text-[var(--co-muted)]"><tr>{["Cleaner", "Completed", "Responses", "Response rate", "5 stars", "Average"].map((label) => <th key={label} className="whitespace-nowrap px-5 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-[var(--co-line-soft)]">{quality.summaries.map((row) => <tr key={row.employeeName}><td className="px-5 py-4 font-semibold">{row.employeeName}</td><td className="px-5 py-4">{row.completedJobs}</td><td className="px-5 py-4">{row.responses}</td><td className="px-5 py-4">{row.responseRate}%</td><td className="px-5 py-4 text-[var(--co-evergreen)]">{row.fiveStars}</td><td className="px-5 py-4">{row.averageRating}/5</td></tr>)}{quality.summaries.length === 0 ? <tr><td colSpan={6} className="px-5 py-8 text-center text-[var(--co-muted)]">No assigned cleaners in this period.</td></tr> : null}</tbody></table></div></section>

    <section className="co-card overflow-hidden"><div className="border-b border-[var(--co-line-soft)] p-5"><h2 className="font-semibold">Completed jobs</h2><p className="mt-1 text-sm text-[var(--co-muted)]">Every completed job stays here until its customer responds.</p></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[var(--co-surface-muted)] text-[var(--co-muted)]"><tr>{["Service date", "Customer", "Cleaner", "Status", "Rating", "Tip", "Comment"].map((label) => <th key={label} className="whitespace-nowrap px-5 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-[var(--co-line-soft)]">{quality.entries.map((entry, index) => <tr key={`${entry.jobId}-${entry.employeeId ?? "unassigned"}-${index}`}><td className="whitespace-nowrap px-5 py-4">{dateLabel(entry.serviceDate)}</td><td className="px-5 py-4 font-semibold">{entry.customerName}</td><td className="px-5 py-4">{entry.employeeName ?? "Unassigned"}</td><td className="whitespace-nowrap px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(entry.feedbackStatus)}`}>{feedbackLabel(entry.feedbackStatus)}</span></td><td className="whitespace-nowrap px-5 py-4">{entry.rating ? <span className="font-semibold text-amber-700">{"★".repeat(entry.rating)}<span className="text-[var(--co-faint)]">{"★".repeat(5 - entry.rating)}</span></span> : "—"}</td><td className="whitespace-nowrap px-5 py-4">{entry.tipCents ? `$${(entry.tipCents / 100).toFixed(2)}` : "—"}</td><td className="min-w-64 max-w-md px-5 py-4 text-[var(--co-muted)]">{entry.comment ? `“${entry.comment}”` : "—"}</td></tr>)}{quality.entries.length === 0 ? <tr><td colSpan={7} className="px-5 py-8 text-center text-[var(--co-muted)]">No completed jobs in this period.</td></tr> : null}</tbody></table></div></section>
  </div>;
}
