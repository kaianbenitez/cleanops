"use client";

import Link from "next/link";
import { Fragment, memo, useCallback, useEffect, useRef, useState } from "react";

type Calculation = {
  jobId: string;
  date: string;
  customerName: string;
  cleaningType: string;
  crewRole?: "lead" | "helper";
  budgetHours?: number;
  estimatedMinutes?: number;
  hoursSpent?: number;
  paidHours?: number;
  varianceStatus?: "pending" | "approved" | "rejected";
  clientTipCents?: number;
  bonusCents?: number;
  rateCents: number;
  amountCents: number;
  averageCentsPerHour?: number;
  isAppointment?: boolean;
  appointmentTitle?: string;
};

type Line = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  role: "admin" | "employee";
  title: string | null;
  payType: string | null;
  hourlyRateCents: number | null;
  jobsCount: number;
  regularHours: string;
  commissionCents: number;
  officeHours: string;
  manualOfficeHours: string;
  officePayCents: number;
  mileageMiles: string;
  mileageRateCents: number;
  tipsPaycheckCents: number;
  tipsCashCents: number;
  clientTipsCents: number;
  bonusCents: number;
  teamLeadBonusCents: number;
  trainerBonusCents: number;
  trainingCents: number;
  finalCents: number;
  calculation: Calculation[];
};

type Period = { id: string; startDate: string; endDate: string; status: "open" | "reviewed" | "exported" };
type ExportReadiness = { ok: boolean; blockers: Array<{ lineId: string; employee: string; reason: string }> };
type JobReview = { id: string; jobId: string; userId: string; jthMinutes: number; loggedMinutes: number; approvedMinutes: number | null; status: "pending" | "approved" | "rejected"; note: string | null };

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function addDaysISO(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function lastCompletedPayrollMonday() {
  const date = new Date();
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day) - 7);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function formatLongRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  return `${start.toLocaleDateString([], { month: "short", day: "numeric" })} - ${end.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
}

function StatusPill({ status }: { status: Period["status"] }) {
  const cls =
    status === "open"
      ? "co-badge-success"
      : status === "reviewed"
        ? "co-badge-warning"
        : "bg-[var(--co-surface-muted)] text-[var(--co-accent-text)] border-[var(--co-line-soft)]";
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>{status.replaceAll("_", " ")}</span>;
}

function SmallStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--co-muted)]">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs text-[var(--co-muted)]">{sub}</p>
    </div>
  );
}

function Metric({ label, value, hint, className }: { label: string; value: string; hint: string; className?: string }) {
  return (
    <div className={`co-card p-5 ${className ?? ""}`}>
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--co-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs text-[var(--co-muted)]">{hint}</p>
    </div>
  );
}

function EditableCell({ value, onSave, prefix, suffix, label }: { value: string; onSave: (value: number) => void; prefix?: string; suffix?: string; label: string }) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <span className="text-[var(--co-muted)]">{prefix}</span>
      <input
        aria-label={label}
        type="number"
        step="0.01"
        min="0"
        defaultValue={value}
        onBlur={(event) => onSave(Number(event.target.value || 0))}
        className="min-h-11 w-20 border-b border-dashed border-[var(--co-line)] bg-transparent text-right focus:border-[var(--co-accent-text)] focus-visible:outline-2 focus-visible:outline-[var(--co-accent-text)] focus-visible:outline-offset-2"
      />
      <span className="text-[var(--co-muted)]">{suffix}</span>
    </div>
  );
}

function Step({ number }: { number: string }) {
  return <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--co-accent-fill)] text-xs text-white">{number}</span>;
}

function ReviewQueue({ reviews, lines, onDecide }: { reviews: JobReview[]; lines: Line[]; onDecide: (reviewId: string, status: "approved" | "rejected", approvedMinutes?: number) => Promise<void> }) {
  const pending = reviews.filter((review) => review.status === "pending");
  if (!pending.length) return null;
  return <section className="co-badge-warning rounded-2xl p-5 text-sm">
    <p className="font-semibold">Logged-time approvals required</p>
    <p className="mt-1 text-xs">These multi-cleaner jobs ran longer than JTH. Approve the logged time before approving payroll.</p>
    <div className="mt-3 space-y-2">
      {pending.map((review) => {
        const line = lines.find((item) => item.userId === review.userId);
        const calculation = line?.calculation.find((item) => item.jobId === review.jobId);
        return <div key={review.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--co-warning)]/30 bg-[var(--co-surface)] px-3 py-3">
          <div><p className="font-medium">{line ? `${line.firstName} ${line.lastName}` : "Employee"} · {calculation?.customerName ?? "Job"}</p><p className="text-xs text-[var(--co-warning)]">JTH {(review.jthMinutes / 60).toFixed(2)}h · logged {(review.loggedMinutes / 60).toFixed(2)}h · proposed pay {(review.loggedMinutes / 60).toFixed(2)}h</p></div>
          <div className="flex gap-2"><button type="button" onClick={() => onDecide(review.id, "rejected")} className="co-button-secondary px-3 py-1.5 text-xs">Keep JTH</button><button type="button" onClick={() => onDecide(review.id, "approved", review.loggedMinutes)} className="co-button-primary px-3 py-1.5 text-xs">Approve overage</button></div>
        </div>;
      })}
    </div>
  </section>;
}

function PayrollDetail({
  line,
}: {
  line: Line;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Employee detail</p>
          <p className="mt-1 font-semibold">
            {line.firstName} {line.lastName}&apos;s job calculations
          </p>
        </div>
        <p className="text-xs text-[var(--co-muted)]">Edit hours from the linked job; changes are audit logged.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1020px] text-left text-xs">
          <caption className="sr-only">
            Job-level calculations for {line.firstName} {line.lastName}
          </caption>
          <thead className="border-b border-[var(--co-line)] text-[var(--co-muted)]">
            <tr>
              <th className="py-2">Date</th>
              <th className="py-2">Customer / job</th>
              <th className="py-2">Crew role</th>
              <th className="py-2">Cleaning type</th>
              <th className="py-2 text-right">JTH hrs</th>
              <th className="py-2 text-right">Logged hrs</th>
              <th className="py-2 text-right">Paid hrs</th>
              <th className="py-2 text-right">Hourly rate</th>
              <th className="py-2 text-right">Average</th>
              <th className="py-2 text-right">Commission</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--co-line)]">
            {line.calculation.map((calculation) => (
              <tr key={calculation.jobId}>
                <td className="py-3">{calculation.date}</td>
                <td className="py-3">
                  {calculation.isAppointment ? (
                    <span className="font-medium text-[var(--co-spark-text)]">📅 {calculation.appointmentTitle ?? calculation.customerName}</span>
                  ) : (
                    <>
                      <Link href={`/jobs/${calculation.jobId}`} className="font-medium text-[var(--co-accent-text)] hover:underline">
                        {calculation.customerName}
                      </Link>
                      <div className="mt-1 flex items-center gap-2 text-[var(--co-muted)]">
                        <span>Job detail</span>
                        <Link href={`/jobs/${calculation.jobId}`} className="font-medium text-[var(--co-accent-text)] hover:underline">
                          Open
                        </Link>
                      </div>
                    </>
                  )}
                </td>
                <td className="py-3">
                  {calculation.isAppointment ? (
                    <span className="co-badge-spark rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em]">meeting</span>
                  ) : (
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${
                        calculation.crewRole === "lead"
                          ? "co-badge-success"
                          : "co-badge-neutral"
                      }`}
                    >
                      {calculation.crewRole ?? "unassigned"}
                    </span>
                  )}
                </td>
                <td className="py-3 text-[var(--co-muted)]">{calculation.isAppointment ? "Internal meeting" : calculation.cleaningType.replaceAll("_", " ")}</td>
                <td className="py-3 text-right">{(calculation.budgetHours ?? ((calculation.estimatedMinutes ?? 0) / 60)).toFixed(2)}</td>
                <td className="py-3 text-right font-medium">{(calculation.hoursSpent ?? 0).toFixed(2)}</td>
                <td className="py-3 text-right font-medium">{(calculation.paidHours ?? calculation.budgetHours ?? 0).toFixed(2)} {calculation.varianceStatus ? <span className="co-badge-warning ml-1 rounded px-1 text-xs">{calculation.varianceStatus}</span> : null}</td>
                <td className="py-3 text-right">{dollars(calculation.rateCents)}</td>
                <td className="py-3 text-right">{dollars(calculation.averageCentsPerHour ?? 0)}</td>
                <td className="py-3 text-right font-medium">{dollars(calculation.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {line.calculation.length === 0 ? <p className="py-4 text-sm text-[var(--co-muted)]">No job detail is available for this employee.</p> : null}
      </div>

      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-4">
        <SmallStat label="Mileage rate" value={dollars(line.mileageRateCents)} sub="Mileage reimbursement" />
        <SmallStat label="Client tips" value={dollars(line.clientTipsCents)} sub="Evenly allocated from client tip" />
        <SmallStat label="Paycheck tips" value={dollars(line.tipsPaycheckCents)} sub="Direct-to-paycheck tips" />
        <SmallStat label="Cash tips" value={dollars(line.tipsCashCents)} sub="Cash collected separately" />
        <SmallStat label="Lead / trainer bonus" value={`${dollars(line.teamLeadBonusCents)} / ${dollars(line.trainerBonusCents)}`} sub="Separate bonus buckets" />
      </div>
      <p className="mt-3 text-xs text-[var(--co-muted)]">
        Mileage should be entered on the lead / driver row only so helpers do not get reimbursed for the same trip.
      </p>
    </div>
  );
}

const PayrollMobileCard = memo(function PayrollMobileCard({
  line,
  expanded,
  toggleLine,
}: {
  line: Line;
  expanded: boolean;
  toggleLine: (id: string) => void;
}) {
  const detailId = `payroll-detail-mobile-${line.id}`;
  return (
    <article className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={() => toggleLine(line.id)} aria-expanded={expanded} aria-controls={detailId} className="min-h-11 text-left font-semibold text-[var(--co-ink)]">
            {line.firstName} {line.lastName}
          </button>
          <p className="mt-1 text-sm text-[var(--co-muted)]">{line.title || "Team member"} · {line.jobsCount} job{line.jobsCount === 1 ? "" : "s"}</p>
        </div>
        <p className="text-right text-lg font-semibold">{dollars(line.finalCents)}</p>
      </div>
      <p className="text-sm text-[var(--co-muted)]">{line.payType === "commission_jth" ? "Job ticket hours" : "Office hourly"} · {line.calculation.length} job details</p>
      <button type="button" onClick={() => toggleLine(line.id)} aria-expanded={expanded} aria-controls={detailId} className="min-h-11 w-full rounded-[var(--co-radius-control)] border border-[var(--co-line)] px-3 text-sm font-semibold text-[var(--co-accent-text)]">
        {expanded ? "Hide job details" : "View job details"}
      </button>
      {expanded ? <div id={detailId} className="overflow-x-auto"><PayrollDetail line={line} /></div> : null}
    </article>
  );
});

const PayrollRow = memo(function PayrollRow({
  line,
  expanded,
  toggleLine,
  updateLine,
}: {
  line: Line;
  expanded: boolean;
  toggleLine: (id: string) => void;
  updateLine: (id: string, fields: Record<string, number>) => Promise<void>;
}) {
  const clockedHours = line.payType === "commission_jth" ? Number(line.regularHours) : Number(line.officeHours);
  const manualOfficeHours = line.payType === "office_hourly" ? Number(line.manualOfficeHours) : 0;
  const totalPaidHours = clockedHours + manualOfficeHours;
  const commission = line.payType === "commission_jth" ? line.commissionCents : line.officePayCents;
  const bonuses = line.bonusCents + line.teamLeadBonusCents + line.trainerBonusCents + line.trainingCents;
  const tips = line.clientTipsCents + line.tipsPaycheckCents + line.tipsCashCents;
  const mileageEligible = line.calculation.some((entry) => entry.crewRole === "lead");
  const workTypeLabel = line.payType === "commission_jth" ? "Job ticket hours" : "Office hourly";
  const detailId = `payroll-detail-${line.id}`;
  return (
    <Fragment>
      <tr className="hover:bg-[var(--co-surface-muted)]/50">
        <td className="px-3 py-4 xl:px-5">
          <button type="button" onClick={() => toggleLine(line.id)} aria-expanded={expanded} aria-controls={detailId} className="text-left font-semibold text-[var(--co-ink)]">
            {line.calculation.length ? (expanded ? "▾ " : "▸ ") : ""}
            {line.firstName} {line.lastName}
          </button>
          <span className="mt-1 block text-xs text-[var(--co-muted)]">
            {workTypeLabel} · {line.title || "Team member"} · {line.jobsCount} job{line.jobsCount === 1 ? "" : "s"}
          </span>
        </td>
        <td className="px-3 py-4 xl:px-5 text-right">
          <div className="font-medium">{totalPaidHours.toFixed(2)} hrs</div>
          <div className="text-xs text-[var(--co-muted)]">{clockedHours.toFixed(2)} clocked</div>
        </td>
        <td className="px-3 py-4 xl:px-5 text-right">
          {line.role === "admin" && line.payType === "office_hourly" ? (
            <EditableCell key={`manual-${line.id}-${line.manualOfficeHours}`} label={`${line.firstName} ${line.lastName} manual office hours`} value={line.manualOfficeHours} onSave={(value) => updateLine(line.id, { manualOfficeHours: value })} suffix=" hrs" />
          ) : (
            <span className="text-[var(--co-muted)]">—</span>
          )}
        </td>
        <td className="px-3 py-4 xl:px-5 text-right">
          <div className="font-medium">{dollars(commission)}</div>
          {line.hourlyRateCents ? <div className="text-xs text-[var(--co-muted)]">{dollars(line.hourlyRateCents)}/hr</div> : null}
        </td>
        <td className="px-3 py-4 xl:px-5 text-right">
          {mileageEligible ? (
            <EditableCell key={`mileage-${line.id}-${line.mileageMiles}`} label={`${line.firstName} ${line.lastName} mileage miles`} value={line.mileageMiles} onSave={(value) => updateLine(line.id, { mileageMiles: value })} suffix=" mi" />
          ) : (
            <div className="text-right">
              <div className="font-medium text-[var(--co-ink)]">{line.mileageMiles} mi</div>
              <div className="text-xs text-[var(--co-muted)]">Lead row only</div>
            </div>
          )}
        </td>
        <td className="px-3 py-4 xl:px-5 text-right">
          <div className="text-xs text-[var(--co-muted)]">{dollars(tips)} tips</div>
          <EditableCell key={`bonus-${line.id}-${bonuses}`} label={`${line.firstName} ${line.lastName} bonuses`} value={dollars(bonuses)} onSave={(value) => updateLine(line.id, { bonusCents: Math.round(value * 100) })} prefix="$" suffix=" bonus" />
        </td>
        <td className="px-3 py-4 xl:px-5 text-right font-semibold">{dollars(line.finalCents)}</td>
        <td className="px-3 py-4 xl:px-5 text-right">
          <button type="button" className="min-h-11 min-w-11 px-2 text-xs font-medium text-[var(--co-accent-text)]" aria-expanded={expanded} aria-controls={detailId} onClick={() => toggleLine(line.id)}>
            {expanded ? "Hide" : "Details"}
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr id={detailId}>
          <td colSpan={8} className="bg-[var(--co-surface-muted)]/60 px-5 py-5">
            <PayrollDetail line={line} />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
});

function PayrollTable({
  lines,
  expandedLineId,
  toggleLine,
  updateLine,
  totalPay,
}: {
  lines: Line[];
  expandedLineId: string | null;
  toggleLine: (id: string) => void;
  updateLine: (id: string, fields: Record<string, number>) => Promise<void>;
  totalPay: number;
}) {
  return (
    <section className="co-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--co-line-soft)] px-5 py-4">
        <div>
          <p className="eyebrow">Payroll review</p>
          <h2 className="mt-1 text-lg font-semibold">Employee summary</h2>
        </div>
        <p className="text-sm text-[var(--co-muted)]">Manual office hours, mileage, tips, bonuses, and adjustments are logged while the period is open.</p>
      </div>

      <div className="divide-y divide-[var(--co-line-soft)] border-t border-[var(--co-line-soft)] sm:hidden">
        {lines.map((line) => (
          <PayrollMobileCard key={line.id} line={line} expanded={expandedLineId === line.id} toggleLine={toggleLine} />
        ))}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Payroll summary by employee, with pay breakdown and totals</caption>
          <thead className="bg-[var(--co-accent-fill)] text-xs uppercase tracking-[0.08em] text-white">
            <tr>
              <th className="px-3 py-3 xl:px-5">Employee</th>
              <th className="px-3 py-3 xl:px-5 text-right">Hours</th>
              <th className="px-3 py-3 xl:px-5 text-right">Manual office hrs</th>
              <th className="px-3 py-3 xl:px-5 text-right">Base pay</th>
              <th className="px-3 py-3 xl:px-5 text-right">Mileage</th>
              <th className="px-3 py-3 xl:px-5 text-right">Tips &amp; bonuses</th>
              <th className="px-3 py-3 xl:px-5 text-right">Total pay</th>
              <th className="px-3 py-3 xl:px-5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--co-line-soft)]">
            {lines.map((line) => (
              <PayrollRow key={line.id} line={line} expanded={expandedLineId === line.id} toggleLine={toggleLine} updateLine={updateLine} />
            ))}
          </tbody>
          <tfoot className="border-t-2 border-[var(--co-accent-text)] bg-[var(--co-surface-muted)]">
            <tr>
              <td className="px-3 py-4 xl:px-5 font-semibold" colSpan={6}>
                Total payroll
              </td>
              <td className="px-3 py-4 xl:px-5 text-right text-lg font-semibold">{dollars(totalPay)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

export default function PayrollPage() {
  const [weekStart, setWeekStart] = useState(lastCompletedPayrollMonday());
  const [period, setPeriod] = useState<Period | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [jobReviews, setJobReviews] = useState<JobReview[]>([]);
  const [exportReadiness, setExportReadiness] = useState<ExportReadiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const weekEnd = addDaysISO(weekStart, 6);
  const payDate = addDaysISO(weekEnd, 5);
  const linesRef = useRef<Line[]>(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const toggleLine = useCallback((id: string) => {
    setExpandedLineId((current) => (current === id ? null : id));
  }, []);

  const loadDetail = useCallback(async (periodId: string) => {
    const response = await fetch(`/api/payroll-periods/${periodId}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "Payroll lines could not be loaded.");
    setLines(body.lines ?? []);
    setJobReviews(body.jobReviews ?? []);
    setExportReadiness(body.exportReadiness ?? null);
  }, []);

  const loadPeriod = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/payroll-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: weekStart, endDate: weekEnd }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.period) throw new Error(body.error ?? "Payroll period could not be loaded.");
      const nextPeriod = body.period as Period;
      setPeriod(nextPeriod);
      if (nextPeriod.status === "open") {
        const generate = await fetch(`/api/payroll-periods/${nextPeriod.id}/generate`, { method: "POST" });
        if (!generate.ok) {
          const generateBody = await generate.json().catch(() => ({}));
          throw new Error(generateBody.error ?? "Payroll could not be refreshed.");
        }
      }
      await loadDetail(nextPeriod.id);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Payroll could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [loadDetail, weekEnd, weekStart]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load server-backed payroll data on mount
    loadPeriod();
  }, [loadPeriod]);

  async function refreshPayroll() {
    if (!period) return;
    setGenerating(true);
    const response = await fetch(`/api/payroll-periods/${period.id}/generate`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error ?? "Payroll could not be refreshed.");
    else await loadDetail(period.id);
    setGenerating(false);
  }

  const updateLine = useCallback(async (lineId: string, fields: Record<string, number>) => {
    if (!period) return;
    const current = linesRef.current.find((line) => line.id === lineId);
    const normalized = { ...fields };
    if (current && fields.tipsPaycheckCents !== undefined) normalized.tipsPaycheckCents = Math.max(0, fields.tipsPaycheckCents - current.tipsCashCents);
    if (current && fields.bonusCents !== undefined) normalized.bonusCents = Math.max(0, fields.bonusCents - current.teamLeadBonusCents - current.trainerBonusCents - current.trainingCents);
    const response = await fetch(`/api/payroll-periods/${period.id}/lines/${lineId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(normalized) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "Could not save this payroll change.");
      return;
    }
    await loadDetail(period.id);
  }, [period, loadDetail]);

  async function decideReview(reviewId: string, status: "approved" | "rejected", approvedMinutes?: number) {
    if (!period) return;
    const response = await fetch(`/api/payroll-periods/${period.id}/job-reviews/${reviewId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, approvedMinutes }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error ?? "Could not update this time review.");
    else await loadDetail(period.id);
  }

  async function changeStatus(status: Period["status"]) {
    if (!period) return;
    const response = await fetch(`/api/payroll-periods/${period.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (response.ok) setPeriod({ ...period, status });
  }

  async function reopenPeriod() {
    if (period && confirm(`Reopen this ${period.status} payroll period?`)) await changeStatus("open");
  }

  const totalPay = lines.reduce((sum, line) => sum + line.finalCents, 0);
  const totalCommission = lines.reduce((sum, line) => sum + line.commissionCents, 0);
  const totalTips = lines.reduce((sum, line) => sum + line.tipsPaycheckCents + line.tipsCashCents + line.clientTipsCents, 0);
  const totalBonuses = lines.reduce((sum, line) => sum + line.bonusCents + line.teamLeadBonusCents + line.trainerBonusCents + line.trainingCents, 0);
  const totalClockedHours = lines.reduce((sum, line) => sum + Number(line.payType === "commission_jth" ? line.regularHours : line.officeHours), 0);
  const totalManualOfficeHours = lines.reduce((sum, line) => sum + (line.payType === "office_hourly" ? Number(line.manualOfficeHours) : 0), 0);
  const totalPaidHours = totalClockedHours + totalManualOfficeHours;
  const totalMiles = lines.reduce((sum, line) => sum + Number(line.mileageMiles), 0);
  const reviewedCount = lines.filter((line) => line.calculation.length > 0).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Operations / Payroll</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="page-title">Payroll</h1>
            <span className="rounded-full bg-[var(--co-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--co-accent-text)]">Paid Friday morning</span>
          </div>
          <p className="page-subtitle">Review last week&apos;s hours and prepare the exact amount to enter in Gusto.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setWeekStart(addDaysISO(weekStart, -7))} className="co-button-secondary">
            ← Previous week
          </button>
          <button onClick={() => setWeekStart(addDaysISO(weekStart, 7))} className="co-button-secondary">
            Next week →
          </button>
          {period ? exportReadiness?.ok && period.status !== "open" ? (
            <a href={`/api/payroll-periods/${period.id}/export`} className="co-button-primary">
              Export Gusto CSV
            </a>
          ) : (
            <button
              type="button"
              aria-disabled="true"
              title={period.status === "open" ? "Approve the period before exporting." : "Resolve export blockers before exporting."}
              onClick={(event) => event.preventDefault()}
              className="co-button-secondary cursor-not-allowed opacity-60"
            >
              Export blocked
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div role="alert" className="co-badge-danger rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      {period && period.status !== "open" && exportReadiness && !exportReadiness.ok ? (
        <section role="status" className="co-badge-warning rounded-2xl px-5 py-4 text-sm">
          <p className="font-semibold">Gusto export is blocked until these items are resolved:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {exportReadiness.blockers.map((blocker, index) => <li key={`${blocker.lineId}-${index}`}><span className="font-medium">{blocker.employee}:</span> {blocker.reason}</li>)}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <div className="co-card p-5">
          <p className="eyebrow">Pay period</p>
          <p className="mt-2 font-semibold">{formatLongRange(weekStart, weekEnd)}</p>
          <p className="mt-1 text-xs text-[var(--co-muted)]">Previous Monday through Sunday</p>
        </div>
        <div className="co-card p-5">
          <p className="eyebrow">Pay date</p>
          <p className="mt-2 font-semibold">{payDate}</p>
          <p className="mt-1 text-xs text-[var(--co-muted)]">Friday morning</p>
        </div>
        <div className="co-card p-5">
          <p className="eyebrow">Status</p>
          <div className="mt-2">
            <StatusPill status={period?.status ?? "open"} />
          </div>
          <p className="mt-2 text-xs text-[var(--co-muted)]">{period?.status === "open" ? "Changes recalculate automatically" : "Protected until reopened"}</p>
        </div>
        <div className="flex items-end justify-start gap-2 md:justify-end">
          {period?.status === "open" ? (
            <>
              <button onClick={refreshPayroll} disabled={generating || loading} className="co-button-secondary">
                {generating ? "Refreshing…" : "Refresh payroll"}
              </button>
              <button onClick={() => changeStatus("reviewed")} className="co-button-primary">
                Approve payroll
              </button>
            </>
          ) : (
            <button onClick={reopenPeriod} className="co-button-secondary">
              Reopen period
            </button>
          )}
        </div>
      </section>

      {loading ? (
        <div className="co-card p-10 text-center text-sm text-[var(--co-muted)]">Loading payroll…</div>
      ) : lines.length === 0 ? (
        <div className="co-card p-10 text-center">
          <p className="font-medium">No payroll lines for this period.</p>
          <p className="mt-1 text-sm text-[var(--co-muted)]">Complete jobs or add time entries, then refresh the open period.</p>
        </div>
      ) : (
        <>
          <ReviewQueue reviews={jobReviews} lines={lines} onDecide={decideReview} />

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <Metric label="Employees" value={String(lines.length)} hint="included in this period" />
            <Metric label="Total paid hours" value={totalPaidHours.toFixed(2)} hint="clocked + manual office time" />
            <Metric label="Commission" value={dollars(totalCommission)} hint="service-based pay" />
            <Metric label="Tips" value={dollars(totalTips)} hint="client + manual tips" />
            <Metric label="Bonuses" value={dollars(totalBonuses)} hint="lead + trainer + training" />
            <Metric label="Mileage" value={`${totalMiles.toFixed(1)} mi`} hint="editable reimbursement" />
            <Metric label="Total pay" value={dollars(totalPay)} hint="ready for Gusto entry" className="lg:col-start-3 lg:col-span-2 xl:col-start-auto xl:col-span-1" />
          </section>

          <PayrollTable lines={lines} expandedLineId={expandedLineId} toggleLine={toggleLine} updateLine={updateLine} totalPay={totalPay} />

          <section className="co-card p-5">
            <p className="eyebrow">Before paying Friday morning</p>
            <h2 className="mt-1 text-lg font-semibold">Final checks</h2>
            <p className="mt-2 text-sm text-[var(--co-muted)]">
              {reviewedCount} of {lines.length} employee{lines.length === 1 ? "" : "s"} have job-level detail available to review.
            </p>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <p>
                <Step number="1" />
                Review expanded job rows and adjust manual entries.
              </p>
              <p>
                <Step number="2" />
                Approve the period when the numbers are ready.
              </p>
              <p>
                <Step number="3" />
                Export the CSV and enter exact amounts in Gusto.
              </p>
            </div>
            <div className="mt-5 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-4 text-sm">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--co-muted)]">Payroll status</p>
              <p className="mt-1 font-medium">{period?.status === "open" ? "Changes are still live." : "This period is locked unless reopened."}</p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
