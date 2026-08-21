import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Star } from "lucide-react";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasFieldAccess } from "@/lib/auth/field-staff";
import { resolveRange } from "@/lib/dashboard/range";
import { getEmployeeQualityReport } from "@/lib/reports/queries";

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

export default async function MyScoresPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasFieldAccess(user)) redirect("/quality");
  const [company] = await db.select({ timezone: companies.timezone }).from(companies).where(eq(companies.id, user.companyId)).limit(1);
  if (!company) redirect("/my-day");
  // Fixed period — no admin date-range controls on this phone-first employee
  // view (WP-D §8.2). "all_time" mirrors the range this page used before.
  const range = resolveRange({ preset: "all_time" }, company.timezone);
  const quality = await getEmployeeQualityReport(user.companyId, user.id, range);

  return <div className="max-w-4xl space-y-6">
    <header>
      <div className="flex items-center gap-2 text-[var(--co-accent-text)]"><Star className="h-5 w-5" /><p className="eyebrow">Customer feedback</p></div>
      <h1 className="page-title mt-2">My scores</h1>
      <p className="page-subtitle type-field-body">See how customers have rated your completed jobs.</p>
      <p className="mt-1 type-field-meta text-[var(--co-muted)]">{range.label}</p>
    </header>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="co-card p-4"><p className="eyebrow">Completed jobs</p><p className="mt-2 text-2xl font-semibold">{quality.completedJobs}</p></div>
      <div className="co-card p-4"><p className="eyebrow">Responses</p><p className="mt-2 text-2xl font-semibold">{quality.responses}</p><p className="mt-1 type-field-micro text-[var(--co-muted)]">{quality.responseRate}% response rate</p></div>
      <div className="co-card p-4"><p className="eyebrow">Average rating</p><p className="mt-2 text-2xl font-semibold text-[var(--co-accent-text)]">{quality.responses ? `${quality.averageRating}/5` : "—"}</p></div>
      <div className="co-card p-4"><p className="eyebrow">5-star ratings</p><p className="mt-2 text-2xl font-semibold text-[var(--co-accent-text)]">{quality.fiveStars}</p></div>
    </div>

    <section className="co-card overflow-hidden">
      <div className="border-b border-[var(--co-line-soft)] p-5">
        <h2 className="font-semibold">Your completed jobs</h2>
        <p className="mt-1 type-field-body text-[var(--co-muted)]">Includes jobs you were assigned to as lead, helper, or trainer.</p>
      </div>
      {quality.entries.length === 0 ? (
        <p className="px-5 py-8 text-center type-field-body text-[var(--co-muted)]">No completed jobs in this period.</p>
      ) : (
        <ul className="divide-y divide-[var(--co-line-soft)]">
          {quality.entries.map((entry) => (
            <li key={entry.jobId} className="space-y-2 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="type-field-body font-semibold text-[var(--co-ink)]">{entry.customerName}</p>
                <span className={`type-field-micro rounded-full px-2.5 py-1 font-semibold ${statusClass(entry.feedbackStatus)}`}>{feedbackLabel(entry.feedbackStatus)}</span>
              </div>
              <p className="type-field-meta text-[var(--co-muted)]">{dateLabel(entry.serviceDate)}</p>
              <p>{entry.rating ? <span className="font-semibold text-[var(--co-warning)]">{"★".repeat(entry.rating)}<span className="text-[var(--co-faint)]">{"★".repeat(5 - entry.rating)}</span></span> : <span className="type-field-meta text-[var(--co-faint)]">No rating yet</span>}</p>
              {entry.comment ? <p className="type-field-body text-[var(--co-muted)]">“{entry.comment}”</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  </div>;
}
