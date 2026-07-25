import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { customers, ghlSyncLog } from "@/db/schema";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { PaginationControls } from "@/components/ui/pagination";

const PAGE_SIZE = 25;
const STATUS_COLORS: Record<string, string> = { retrying: "bg-amber-100 text-amber-800", failed: "bg-rose-100 text-rose-800" };

export default async function SyncIssuesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/my-day");

  const sp = await searchParams;
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  const conditions = and(eq(ghlSyncLog.companyId, admin.companyId), ne(ghlSyncLog.status, "ok"));

  const [rows, [counts]] = await Promise.all([
    db
      .select({
        id: ghlSyncLog.id,
        eventType: ghlSyncLog.eventType,
        status: ghlSyncLog.status,
        attempts: ghlSyncLog.attempts,
        lastAttemptAt: ghlSyncLog.lastAttemptAt,
        response: ghlSyncLog.response,
        createdAt: ghlSyncLog.createdAt,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
      })
      .from(ghlSyncLog)
      .leftJoin(customers, eq(ghlSyncLog.customerId, customers.id))
      .where(conditions)
      .orderBy(desc(ghlSyncLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({
        total: sql<number>`count(*)`,
        failed: sql<number>`count(*) filter (where ${ghlSyncLog.status} = 'failed')`,
        retrying: sql<number>`count(*) filter (where ${ghlSyncLog.status} = 'retrying')`,
      })
      .from(ghlSyncLog)
      .where(conditions),
  ]);

  const total = Number(counts.total);
  const failed = Number(counts.failed);
  const retrying = Number(counts.retrying);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Control room</p>
          <h1 className="page-title mt-2">Sync issues</h1>
          <p className="page-subtitle">Review GHL and Square events that need attention. Successful events stay out of this queue.</p>
        </div>
        <Link href="/settings/ghl" className="co-button-secondary">
          Integration settings →
        </Link>
      </header>
      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Open issues" value={String(total)} tone={total ? "warn" : "good"} />
        <Metric label="Failed" value={String(failed)} tone={failed ? "bad" : "good"} />
        <Metric label="Retrying" value={String(retrying)} tone={retrying ? "warn" : "good"} />
      </section>
      <section className="co-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--co-line-soft)] px-5 py-4">
          <div>
            <p className="eyebrow">Event queue</p>
            <h2 className="mt-1 text-lg font-semibold">Needs attention</h2>
          </div>
          <span className="text-xs text-[var(--co-muted)]">Newest first</span>
        </div>
        {rows.length === 0 ? (
          <div className="p-14 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f2d3] text-xl text-[#5c7436]">✓</div>
            <p className="mt-4 font-semibold">Everything is up to date</p>
            <p className="mt-1 text-sm text-[var(--co-muted)]">No failed or retrying syncs are waiting.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-[var(--co-surface-muted)] text-xs uppercase tracking-[0.1em] text-[var(--co-muted)]">
                <tr>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Event</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Attempts</th>
                  <th className="px-5 py-3">Last attempt</th>
                  <th className="px-5 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--co-line-soft)]">
                {rows.map((row) => {
                  const response = row.response as { error?: string } | null;
                  return (
                    <tr key={row.id} className="hover:bg-[var(--co-surface-muted)]/50">
                      <td className="px-5 py-4 font-medium">
                        {row.customerFirstName || row.customerLastName ? `${row.customerFirstName ?? ""} ${row.customerLastName ?? ""}` : "System event"}
                      </td>
                      <td className="px-5 py-4 text-[var(--co-muted)]">{row.eventType}</td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[row.status] ?? "bg-slate-100 text-slate-700"}`}>{row.status}</span>
                      </td>
                      <td className="px-5 py-4">{row.attempts}</td>
                      <td className="px-5 py-4 text-xs text-[var(--co-muted)]">{row.lastAttemptAt ? new Date(row.lastAttemptAt).toLocaleString() : "—"}</td>
                      <td className="max-w-[340px] truncate px-5 py-4 text-xs text-rose-700" title={response?.error ?? ""}>
                        {response?.error ?? "No response details"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <PaginationControls
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          itemLabel="issue"
          hrefForPage={(target) => (target > 1 ? `/sync-issues?page=${target}` : "/sync-issues")}
        />
      </section>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "bad" }) { const color = tone === "bad" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : "text-[var(--co-evergreen)]"; return <div className="co-card p-5"><p className="text-xs text-[var(--co-muted)]">{label}</p><p className={`mt-2 text-2xl font-semibold ${color}`}>{value}</p></div>; }
