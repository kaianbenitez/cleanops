import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Star } from "lucide-react";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasFieldAccess } from "@/lib/auth/field-staff";
import { resolveRange } from "@/lib/dashboard/range";
import { getEmployeeQualityReport } from "@/lib/reports/queries";
import { ReportsFilters } from "../reports/reports-controls";

type SearchParams = Promise<{ from?: string; preset?: string; to?: string }>;

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
  if (status === "responded") return "co-badge-success";
  if (status === "expired") return "co-badge-warning";
  return "bg-[var(--co-surface-muted)] text-[var(--co-muted)]";
}

export default async function MyScoresPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasFieldAccess(user)) redirect("/quality");
  const params = await searchParams;
  const [company] = await db.select({ timezone: companies.timezone }).from(companies).where(eq(companies.id, user.companyId)).limit(1);
  if (!company) redirect("/my-day");
  const range = resolveRange({ preset: params.preset ?? "all_time", from: params.from, to: params.to }, company.timezone);
  const quality = await getEmployeeQualityReport(user.companyId, user.id, range);

  return <div className="max-w-4xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-[var(--co-accent-text)]"><Star className="h-5 w-5" /><p className="eyebrow">Customer feedback</p></div>
        <h1 className="page-title mt-2">My scores</h1>
        <p className="page-subtitle">See how customers have rated your completed jobs.</p>
      </div>
      <ReportsFilters areas={[]} fromIso={range.fromIso} toIso={range.toIso} preset={range.preset} />
    </header>

    <div className="grid gap-3 sm:grid-cols-4">
      <div className="co-card p-4"><p className="eyebrow">Completed jobs</p><p className="mt-2 text-2xl font-semibold">{quality.completedJobs}</p></div>
      <div className="co-card p-4"><p className="eyebrow">Responses</p><p className="mt-2 text-2xl font-semibold">{quality.responses}</p><p className="mt-1 text-xs text-[var(--co-muted)]">{quality.responseRate}% response rate</p></div>
      <div className="co-card p-4"><p className="eyebrow">Average rating</p><p className="mt-2 text-2xl font-semibold text-[var(--co-accent-text)]">{quality.responses ? `${quality.averageRating}/5` : "—"}</p></div>
      <div className="co-card p-4"><p className="eyebrow">5-star ratings</p><p className="mt-2 text-2xl font-semibold text-[var(--co-accent-text)]">{quality.fiveStars}</p></div>
    </div>

    <section className="co-card overflow-hidden">
      <div className="border-b border-[var(--co-line-soft)] p-5">
        <h2 className="font-semibold">Your completed jobs</h2>
        <p className="mt-1 text-sm text-[var(--co-muted)]">Includes jobs you were assigned to as lead, helper, or trainer.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--co-surface-muted)] text-[var(--co-muted)]">
            <tr>{["Service date", "Customer", "Status", "Rating", "Comment"].map((label) => <th key={label} className="whitespace-nowrap px-5 py-3 font-medium">{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-[var(--co-line-soft)]">
            {quality.entries.map((entry) => (
              <tr key={entry.jobId}>
                <td className="whitespace-nowrap px-5 py-4">{dateLabel(entry.serviceDate)}</td>
                <td className="px-5 py-4 font-semibold">{entry.customerName}</td>
                <td className="whitespace-nowrap px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(entry.feedbackStatus)}`}>{feedbackLabel(entry.feedbackStatus)}</span></td>
                <td className="whitespace-nowrap px-5 py-4">{entry.rating ? <span className="font-semibold text-[var(--co-warning)]">{"★".repeat(entry.rating)}<span className="text-[var(--co-faint)]">{"★".repeat(5 - entry.rating)}</span></span> : "—"}</td>
                <td className="min-w-64 max-w-md px-5 py-4 text-[var(--co-muted)]">{entry.comment ? `“${entry.comment}”` : "—"}</td>
              </tr>
            ))}
            {quality.entries.length === 0 ? <tr><td colSpan={5} className="px-5 py-8 text-center text-[var(--co-muted)]">No completed jobs in this period.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}
