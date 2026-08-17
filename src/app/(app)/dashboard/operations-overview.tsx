import Link from "next/link";
import {
  BarChart3,
  CircleDollarSign,
  ClipboardList,
  UsersRound,
  UserMinus,
  UserPlus,
  Sparkles,
} from "lucide-react";
import { money } from "@/lib/format";
import { getOperationsDashboard } from "@/lib/dashboard/queries";
import type { DashboardRange } from "@/lib/dashboard/types";

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function weekday(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00.000Z`));
}

function dateLabel(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00.000Z`));
}

function KpiCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "var(--co-accent-text)",
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof UsersRound;
  tone?: string;
}) {
  return (
    <article className="co-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-[var(--co-muted)]">{label}</p>
        <Icon
          className="h-5 w-5 shrink-0"
          style={{ color: tone }}
          aria-hidden
        />
      </div>
      <p className="type-admin-display tabular-nums mt-4 font-semibold text-[var(--co-ink)]">
        {value}
      </p>
      <p className="mt-4 border-t border-[var(--co-line-soft)] pt-3 text-xs text-[var(--co-muted)]">
        {note}
      </p>
    </article>
  );
}

export default async function OperationsOverview({
  companyId,
  range,
  revenueTargetCents,
}: {
  companyId: string;
  range: DashboardRange;
  revenueTargetCents: number | null;
}) {
  const data = await getOperationsDashboard(
    companyId,
    range,
    revenueTargetCents,
  );
  const conversion = percent(data.quotes.accepted, data.quotes.sent);
  const maxRevenue = Math.max(...data.weeklyRevenue.amountsCents, 1);
  const targetReached =
    data.weeklyRevenueTargetCents !== null &&
    data.weeklyRevenue.totalCents >= data.weeklyRevenueTargetCents;
  const attentionItems = [
    {
      label: "Unassigned jobs today",
      count: data.needsAttention.unassignedToday,
      href: `/jobs?unassigned=yes&start=${range.todayIso}&end=${range.todayIso}`,
    },
    {
      label: "Jobs missing hours today",
      count: data.needsAttention.missingHoursToday,
      href: `/jobs?missingHours=yes&start=${range.todayIso}&end=${range.todayIso}`,
    },
    {
      label: "Overdue invoices",
      count: data.needsAttention.overdueInvoices,
      href: "/invoices?overdue=yes",
    },
  ];

  return (
    <div className="space-y-5">
      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Client and sales metrics"
      >
        <KpiCard
          label="Active clients"
          value={String(data.clients.active)}
          note="On a recurring subscription"
          icon={UsersRound}
        />
        <KpiCard
          label="New leads"
          value={String(data.clients.newLeads)}
          note={`Added during ${range.label.toLowerCase()}`}
          icon={Sparkles}
        />
        <KpiCard
          label="Clients gained"
          value={`+${data.clients.gained}`}
          note={`Added during ${range.label.toLowerCase()}`}
          icon={UserPlus}
          tone="var(--co-success)"
        />
        <KpiCard
          label="Clients lost"
          value={`−${data.clients.lost}`}
          note={`Archived during ${range.label.toLowerCase()}`}
          icon={UserMinus}
          tone="var(--co-danger)"
        />
      </section>

      <section>
        <article className="co-card p-5" aria-labelledby="weekly-revenue-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3
                  className="h-5 w-5 text-[var(--co-accent-text)]"
                  aria-hidden
                />
                <h2 id="weekly-revenue-title" className="text-lg font-semibold">
                  Weekly revenue
                </h2>
              </div>
              <p className="mt-1 text-sm text-[var(--co-muted)]">
                Paid invoices for the week ending {dateLabel(range.toIso)}.
              </p>
            </div>
            <p className="text-sm text-[var(--co-muted)]">
              Total:{" "}
              <span className="type-admin-title tabular-nums font-semibold text-[var(--co-ink)]">
                {money(data.weeklyRevenue.totalCents)}
              </span>
              {data.weeklyRevenueTargetCents !== null && (
                <span className="ml-1">
                  {targetReached
                    ? ` · target of ${money(data.weeklyRevenueTargetCents)} reached`
                    : ` · ${money(Math.max(0, data.weeklyRevenueTargetCents - data.weeklyRevenue.totalCents))} to target`}
                </span>
              )}
            </p>
          </div>
          <div
            className="mt-8 grid h-64 grid-cols-7 items-end gap-2 border-b border-[var(--co-line)] px-1 sm:gap-4"
            aria-label={`Weekly paid revenue total ${money(data.weeklyRevenue.totalCents)}`}
          >
            {data.weeklyRevenue.amountsCents.map((amount, index) => (
              <div
                key={data.weeklyRevenue.dates[index]}
                className="flex h-full min-w-0 flex-col justify-end gap-2 text-center"
              >
                <span className="sr-only">
                  {weekday(data.weeklyRevenue.dates[index]!)}: {money(amount)}
                </span>
                <div
                  className="min-h-1 rounded-t-sm bg-[var(--co-accent-fill)]"
                  style={{
                    height: `${Math.max((amount / maxRevenue) * 100, amount > 0 ? 2 : 0)}%`,
                  }}
                  aria-hidden
                />
                <span
                  className="pb-2 text-xs font-medium text-[var(--co-muted)]"
                  aria-hidden
                >
                  {weekday(data.weeklyRevenue.dates[index]!)}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="co-card p-5" aria-labelledby="sales-summary-title">
          <div className="flex items-center gap-2">
            <CircleDollarSign
              className="h-5 w-5 text-[var(--co-accent-text)]"
              aria-hidden
            />
            <h2 id="sales-summary-title" className="text-lg font-semibold">
              Sales summary
            </h2>
          </div>
          <dl className="mt-6 grid grid-cols-3 divide-x divide-[var(--co-line-soft)]">
            <div className="pr-3">
              <dt className="text-xs text-[var(--co-muted)]">Quotes sent</dt>
              <dd className="type-admin-title tabular-nums mt-2 font-semibold">
                {data.quotes.sent}
              </dd>
            </div>
            <div className="px-3">
              <dt className="text-xs text-[var(--co-muted)]">Accepted</dt>
              <dd className="type-admin-title tabular-nums mt-2 font-semibold">
                {data.quotes.accepted}
              </dd>
            </div>
            <div className="pl-3">
              <dt className="text-xs text-[var(--co-muted)]">Win rate</dt>
              <dd className="type-admin-title tabular-nums mt-2 font-semibold">
                {conversion}%
              </dd>
            </div>
          </dl>
        </article>

        <article className="co-card p-5" aria-labelledby="attention-title">
          <div className="flex items-center gap-2">
            <ClipboardList
              className="h-5 w-5 text-[var(--co-accent-text)]"
              aria-hidden
            />
            <h2 id="attention-title" className="text-lg font-semibold">
              Needs attention
            </h2>
          </div>
          <ul className="mt-4 divide-y divide-[var(--co-line-soft)]">
            {attentionItems.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between gap-3 py-3 text-sm hover:underline"
                >
                  <span className="text-[var(--co-muted)]">{item.label}</span>
                  <span
                    className={`type-admin-title tabular-nums ${
                      item.count > 0
                        ? "font-semibold text-[var(--co-danger)]"
                        : "text-[var(--co-muted)]"
                    }`}
                  >
                    {item.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}
