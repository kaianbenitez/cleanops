import { BarChart3, CircleDollarSign, FileCheck2, UsersRound, UserMinus, UserPlus } from "lucide-react";
import { money } from "@/lib/format";
import { getOperationsDashboard } from "@/lib/dashboard/queries";
import type { DashboardRange } from "@/lib/dashboard/types";

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function weekday(iso: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00.000Z`));
}

function dateLabel(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00.000Z`));
}

function KpiCard({ label, value, note, icon: Icon, tone = "var(--co-evergreen)" }: { label: string; value: string; note: string; icon: typeof UsersRound; tone?: string }) {
  return (
    <article className="co-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-[var(--co-muted)]">{label}</p>
        <Icon className="h-5 w-5 shrink-0" style={{ color: tone }} aria-hidden />
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-[var(--co-ink)]">{value}</p>
      <p className="mt-4 border-t border-[var(--co-line-soft)] pt-3 text-xs text-[var(--co-muted)]">{note}</p>
    </article>
  );
}

export default async function OperationsOverview({ companyId, range, revenueTargetCents }: { companyId: string; range: DashboardRange; revenueTargetCents: number | null }) {
  const data = await getOperationsDashboard(companyId, range, revenueTargetCents);
  const conversion = percent(data.quotes.accepted, data.quotes.sent);
  const previousConversion = percent(data.quotes.previousAccepted, data.quotes.previousSent);
  const maxRevenue = Math.max(...data.weeklyRevenue.amountsCents, 1);
  const targetReached = data.weeklyRevenueTargetCents !== null && data.weeklyRevenue.totalCents >= data.weeklyRevenueTargetCents;
  const insights = [
    data.quotes.sent === 0
      ? "No quotes were sent in the selected period."
      : conversion < previousConversion
        ? `Quote conversion is ${conversion}% for this period, down from ${previousConversion}% in the prior period.`
        : `Quote conversion is ${conversion}% for this period${data.quotes.previousSent > 0 ? `, compared with ${previousConversion}% in the prior period` : ""}.`,
    targetReached
      ? `Paid revenue has reached the prorated weekly target of ${money(data.weeklyRevenueTargetCents ?? 0)}.`
      : data.weeklyRevenueTargetCents !== null
        ? `${money(Math.max(0, data.weeklyRevenueTargetCents - data.weeklyRevenue.totalCents))} remains to reach the prorated weekly target.`
        : `${money(data.weeklyRevenue.totalCents)} in paid revenue was recorded in the week ending ${dateLabel(range.toIso)}.`,
    data.quotes.aging > 0
      ? `${data.quotes.aging} sent quote${data.quotes.aging === 1 ? " has" : "s have"} been waiting more than 7 days.`
      : "No sent quotes have been waiting more than 7 days.",
  ];

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Client and sales metrics">
        <KpiCard label="Total clients" value={String(data.clients.total)} note="Active clients today" icon={UsersRound} />
        <KpiCard label="Clients gained" value={String(data.clients.gained)} note={`Added during ${range.label.toLowerCase()}`} icon={UserPlus} tone="var(--co-success)" />
        <KpiCard label="Clients lost" value={String(data.clients.lost)} note={`Archived during ${range.label.toLowerCase()}`} icon={UserMinus} tone="var(--co-danger)" />
        <KpiCard label="Conversion rate" value={`${conversion}%`} note={`${data.quotes.accepted} accepted of ${data.quotes.sent} sent`} icon={FileCheck2} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <article className="co-card p-5" aria-labelledby="weekly-revenue-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-[var(--co-evergreen)]" aria-hidden /><h2 id="weekly-revenue-title" className="text-lg font-semibold">Weekly revenue</h2></div>
              <p className="mt-1 text-sm text-[var(--co-muted)]">Paid invoices for the week ending {dateLabel(range.toIso)}.</p>
            </div>
            <p className="text-sm text-[var(--co-muted)]">Total: <span className="text-lg font-semibold text-[var(--co-ink)]">{money(data.weeklyRevenue.totalCents)}</span></p>
          </div>
          <div className="mt-8 grid h-64 grid-cols-7 items-end gap-2 border-b border-[var(--co-line)] px-1 sm:gap-4" aria-label={`Weekly paid revenue total ${money(data.weeklyRevenue.totalCents)}`}>
            {data.weeklyRevenue.amountsCents.map((amount, index) => (
              <div key={data.weeklyRevenue.dates[index]} className="flex h-full min-w-0 flex-col justify-end gap-2 text-center">
                <span className="sr-only">{weekday(data.weeklyRevenue.dates[index]!)}: {money(amount)}</span>
                <div className="min-h-1 rounded-t-sm bg-[var(--co-evergreen)]" style={{ height: `${Math.max((amount / maxRevenue) * 100, amount > 0 ? 2 : 0)}%` }} aria-hidden />
                <span className="pb-2 text-xs font-medium text-[var(--co-muted)]" aria-hidden>{weekday(data.weeklyRevenue.dates[index]!)}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="co-card p-5" aria-labelledby="pipeline-title">
          <h2 id="pipeline-title" className="text-lg font-semibold">Quote pipeline</h2>
          <p className="mt-1 text-sm text-[var(--co-muted)]">Quotes created during {range.label.toLowerCase()}.</p>
          <div className="mt-7 space-y-5">
            {[
              ["Sent", data.quotes.sent, percent(data.quotes.sent, data.quotes.sent), "var(--co-muted)"],
              ["Accepted", data.quotes.accepted, percent(data.quotes.accepted, data.quotes.sent), "var(--co-evergreen)"],
              ["Booked", data.quotes.booked, percent(data.quotes.booked, data.quotes.accepted), "var(--co-success)"],
            ].map(([label, count, rate, color]) => (
              <div key={String(label)}>
                <div className="flex items-baseline justify-between gap-4 text-sm"><span className="font-medium text-[var(--co-ink)]">{label}</span><span className="text-[var(--co-muted)]">{count} <span className="text-xs">({rate}%)</span></span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-sm bg-[var(--co-surface-muted)]"><div className="h-full rounded-sm" style={{ width: `${rate}%`, backgroundColor: String(color) }} /></div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="co-card p-5" aria-labelledby="sales-summary-title">
          <div className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-[var(--co-evergreen)]" aria-hidden /><h2 id="sales-summary-title" className="text-lg font-semibold">Sales summary</h2></div>
          <dl className="mt-6 grid grid-cols-3 divide-x divide-[var(--co-line-soft)]">
            <div className="pr-3"><dt className="text-xs text-[var(--co-muted)]">Quotes sent</dt><dd className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{data.quotes.sent}</dd></div>
            <div className="px-3"><dt className="text-xs text-[var(--co-muted)]">Accepted</dt><dd className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{data.quotes.accepted}</dd></div>
            <div className="pl-3"><dt className="text-xs text-[var(--co-muted)]">Win rate</dt><dd className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{conversion}%</dd></div>
          </dl>
        </article>

        <article className="co-card p-5" aria-labelledby="insights-title">
          <h2 id="insights-title" className="text-lg font-semibold">System insights</h2>
          <ul className="mt-4 divide-y divide-[var(--co-line-soft)]">
            {insights.map((insight) => <li key={insight} className="py-3 text-sm leading-6 text-[var(--co-muted)]">{insight}</li>)}
          </ul>
        </article>
      </section>
    </div>
  );
}
