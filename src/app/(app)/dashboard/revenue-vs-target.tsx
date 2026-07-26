import Link from "next/link";
import { money } from "@/lib/format";
import { getRevenueSeries } from "@/lib/dashboard/queries";
import type { DashboardRange } from "@/lib/dashboard/types";

function formatDay(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00.000Z`));
}

function linePath(values: number[], max: number, width: number, height: number, padding: number) {
  return values.map((value, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
    const y = height - padding - (value / Math.max(max, 1)) * (height - padding * 2);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

function comparisonPhrase(current: number, previous: number) {
  if (previous === 0) return current === 0 ? "with no change from the previous period" : "from no payments in the previous period";
  const percent = Math.round(Math.abs((current - previous) / previous) * 100);
  if (current === previous) return "unchanged from the previous period";
  return `${current > previous ? "up" : "down"} ${percent}% from the previous period`;
}

export default async function RevenueVsTarget({ companyId, range, targetCents }: { companyId: string; range: DashboardRange; targetCents?: number | null }) {
  const series = await getRevenueSeries(companyId, range, targetCents);
  const max = Math.max(1, ...series.actualCents, ...series.priorCents, ...(series.targetCents ?? []));
  const targetDifference = series.targetTotalCents === null ? null : series.actualTotalCents - series.targetTotalCents;
  const hasPayments = series.actualTotalCents > 0 || series.priorTotalCents > 0;
  const comparisonPeriod = `${formatDay(range.prevFromIso)}–${formatDay(range.prevToIso)}`;
  const summary = targetDifference === null
    ? `Revenue is ${money(series.actualTotalCents)} for ${range.label}, ${comparisonPhrase(series.actualTotalCents, series.priorTotalCents)} (${comparisonPeriod}).`
    : `Revenue is ${money(Math.abs(targetDifference))} ${targetDifference >= 0 ? "above" : "below"} the ${money(series.targetTotalCents ?? 0)} target for ${range.label}, ${comparisonPhrase(series.actualTotalCents, series.priorTotalCents)} (${comparisonPeriod}).`;
  const width = 720;
  const height = 240;
  const padding = 20;

  return (
    <section className="co-card overflow-hidden" aria-labelledby="revenue-vs-target-title">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--co-line-soft)] px-4 py-4">
        <div>
          <h2 id="revenue-vs-target-title" className="text-lg font-semibold">Revenue vs target</h2>
          <p className="mt-1 text-sm text-[var(--co-muted)]">Daily payments received for {formatDay(range.fromIso)}–{formatDay(range.toIso)}. Compared with {comparisonPeriod}.</p>
        </div>
        <div className="text-sm text-[var(--co-muted)]">
          <p><span className="font-semibold text-[var(--co-ink)]">Actual:</span> {money(series.actualTotalCents)}</p>
          {series.targetTotalCents !== null ? <p><span className="font-semibold text-[var(--co-ink)]">Target:</span> {money(series.targetTotalCents)}</p> : null}
        </div>
      </div>
      <div className="px-4 py-4">
        <p className="sr-only">{summary}</p>
        {hasPayments ? (
          <>
            <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--co-muted)]" aria-hidden="true">
              <span><i className="mr-1 inline-block h-0.5 w-4 bg-[#006c49] align-middle" />Actual revenue</span>
              <span><i className="mr-1 inline-block h-0.5 w-4 bg-[#465a51] align-middle" />Prior period</span>
              {series.targetCents ? <span><i className="mr-1 inline-block h-0.5 w-4 bg-[#704c00] align-middle" />Target</span> : null}
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-2">
              <div className="flex h-60 flex-col justify-between py-1 text-right text-xs text-[var(--co-muted)]" aria-hidden="true">
                <span>{money(max)}</span><span>{money(max / 2)}</span><span>$0</span>
              </div>
              <div>
                <svg aria-hidden="true" className="h-60 w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" fill="none">
                  <path d={`M ${padding} ${padding} H ${width - padding} M ${padding} ${height / 2} H ${width - padding} M ${padding} ${height - padding} H ${width - padding}`} stroke="var(--co-line-soft)" strokeWidth="1" />
                  <path d={linePath(series.priorCents, max, width, height, padding)} stroke="#465a51" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  {series.targetCents ? <path d={linePath(series.targetCents, max, width, height, padding)} stroke="#704c00" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" /> : null}
                  <path d={linePath(series.actualCents, max, width, height, padding)} stroke="#006c49" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="mt-1 flex justify-between text-xs text-[var(--co-muted)]" aria-hidden="true"><span>{formatDay(series.dates[0]!)}</span><span>Daily paid revenue</span><span>{formatDay(series.dates[series.dates.length - 1]!)}</span></div>
              </div>
            </div>
          </>
        ) : <p className="py-12 text-center text-sm text-[var(--co-muted)]">No payments recorded in this period.</p>}
        {series.targetCents && series.dates.length === 7 ? <p className="mt-4 text-xs text-[var(--co-muted)]">Monthly target is prorated for this 7-day view.</p> : null}
        {series.targetCents === null ? <p className="mt-4 text-sm text-[var(--co-muted)]">Set a monthly revenue target to add it to this comparison. <Link href="/settings" className="font-semibold text-[var(--co-evergreen)] hover:underline">Set target in settings</Link></p> : null}
      </div>
    </section>
  );
}
