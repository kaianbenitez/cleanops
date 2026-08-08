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

export default async function QualityPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/my-day");
  const params = await searchParams;
  const [company] = await db.select({ timezone: companies.timezone }).from(companies).where(eq(companies.id, user.companyId)).limit(1);
  if (!company) redirect("/dashboard");
  const range = resolveRange({ preset: params.preset, from: params.from, to: params.to }, company.timezone);
  const quality = await getQualityReport(user.companyId, range);
  return <div className="max-w-6xl space-y-6"><header className="flex flex-wrap items-end justify-between gap-4"><div><div className="flex items-center gap-2 text-[var(--co-evergreen)]"><Star className="h-5 w-5" /><p className="eyebrow">Customer experience</p></div><h1 className="page-title mt-2">Quality</h1><p className="page-subtitle">Monthly and all-time ratings by lead cleaner.</p></div><div className="flex flex-wrap items-center gap-2"><ReportsFilters areas={[]} fromIso={range.fromIso} toIso={range.toIso} preset={range.preset} /><a href={exportHref(range)} className="co-button-primary">Export CSV</a></div></header><div className="grid gap-3 sm:grid-cols-3"><div className="co-card p-4"><p className="eyebrow">Ratings</p><p className="mt-2 text-2xl font-semibold">{quality.totalResponses}</p></div><div className="co-card p-4"><p className="eyebrow">5-star ratings</p><p className="mt-2 text-2xl font-semibold text-[var(--co-evergreen)]">{quality.fiveStarTotal}</p></div><div className="co-card p-4"><p className="eyebrow">Cleaners reviewed</p><p className="mt-2 text-2xl font-semibold">{quality.summaries.length}</p></div></div><section className="co-card overflow-hidden"><div className="border-b border-[var(--co-line-soft)] p-5"><h2 className="font-semibold">Cleaner summary</h2><p className="mt-1 text-sm text-[var(--co-muted)]">Use total ratings alongside the average so small samples have context.</p></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[var(--co-surface-muted)] text-[var(--co-muted)]"><tr>{["Employee", "Ratings", "5 stars", "Average"].map((label) => <th key={label} className="whitespace-nowrap px-5 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-[var(--co-line-soft)]">{quality.summaries.map((row) => <tr key={row.employeeName}><td className="px-5 py-4 font-semibold">{row.employeeName}</td><td className="px-5 py-4">{row.ratings}</td><td className="px-5 py-4 text-[var(--co-evergreen)]">{row.fiveStars}</td><td className="px-5 py-4">{row.averageRating}/5</td></tr>)}{quality.summaries.length === 0 ? <tr><td colSpan={4} className="px-5 py-8 text-center text-[var(--co-muted)]">No customer ratings in this period.</td></tr> : null}</tbody></table></div></section><section className="co-card overflow-hidden"><div className="border-b border-[var(--co-line-soft)] p-5"><h2 className="font-semibold">Customer notes</h2></div><div className="divide-y divide-[var(--co-line-soft)]">{quality.entries.filter((entry) => entry.comment).slice(0, 50).map((entry, index) => <div key={`${entry.employeeName}-${entry.submittedAt}-${index}`} className="grid gap-2 px-5 py-4 sm:grid-cols-[180px_100px_1fr]"><div><p className="font-semibold">{entry.employeeName}</p><p className="text-xs text-[var(--co-muted)]">{entry.customerName}</p></div><p className="font-semibold text-amber-700">{entry.rating}/5</p><p className="text-sm text-[var(--co-muted)]">“{entry.comment}”</p></div>)}{quality.entries.every((entry) => !entry.comment) ? <p className="px-5 py-8 text-center text-[var(--co-muted)]">No written comments in this period.</p> : null}</div></section></div>;
}
