import Link from "next/link";
import { DeltaChip } from "@/components/ui/delta-chip";
import { KpiTile } from "@/components/ui/kpi-tile";
import { getPulseMetrics } from "@/lib/dashboard/queries";
import type { DashboardRange } from "@/lib/dashboard/types";
import { money, percent } from "@/lib/format";

export default async function PulseTiles({ companyId, range }: { companyId: string; range: DashboardRange }) {
  const metrics = await getPulseMetrics(companyId, range);
  const revenueDelta = metrics.revenue.previousCents > 0 ? ((metrics.revenue.receivedCents - metrics.revenue.previousCents) / metrics.revenue.previousCents) * 100 : null;
  const conversion = metrics.conversion.sent > 0 ? metrics.conversion.accepted / metrics.conversion.sent : 0;
  return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><KpiTile label="Total revenue" value={metrics.revenue.hasData ? money(metrics.revenue.receivedCents) : "—"} note="Received in selected range" delta={<DeltaChip value={revenueDelta} />} /><KpiTile label="Conversion rate" value={metrics.conversion.hasData ? percent(conversion) : "—"} note={`${metrics.conversion.accepted} accepted of ${metrics.conversion.sent} sent`} /><KpiTile label="Active jobs" value={String(metrics.jobsToday.scheduled + metrics.jobsToday.completed)} note={`${metrics.jobsToday.atRisk} need attention today`} /><Link href="/invoices?overdue=yes"><KpiTile label="Cash to collect" value={metrics.collections.overdueCount ? money(metrics.collections.overdueCents) : "—"} note={`${metrics.collections.overdueCount} overdue invoice${metrics.collections.overdueCount === 1 ? "" : "s"}`} /></Link></section>;
}
