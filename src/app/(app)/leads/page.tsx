import { getCurrentUser } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { productLeads } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { PaginationControls, parsePageSize } from "@/components/ui/pagination";

const PAGE_SIZE = 25;
const CREW_SIZE_LABELS: Record<string, string> = { "1-5": "1-5", "6-15": "6-15", "16+": "16+" };

type SearchParams = { page?: string; pageSize?: string };

function hrefForPage(params: SearchParams, page: number) {
  const next = new URLSearchParams();
  Object.entries(params).forEach(([name, current]) => {
    if (name !== "page" && current) next.set(name, current);
  });
  if (page > 1) next.set("page", String(page));
  const query = next.toString();
  return query ? `/leads?${query}` : "/leads";
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/my-day");

  const sp = await searchParams;
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  const pageSize = parsePageSize(sp.pageSize, PAGE_SIZE);

  const [rows, [counts]] = await Promise.all([
    db
      .select({
        id: productLeads.id,
        businessName: productLeads.businessName,
        contactName: productLeads.contactName,
        email: productLeads.email,
        phone: productLeads.phone,
        crewSize: productLeads.crewSize,
        message: productLeads.message,
        createdAt: productLeads.createdAt,
      })
      .from(productLeads)
      .orderBy(desc(productLeads.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)` }).from(productLeads),
  ]);

  const total = Number(counts.total);

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Control room</p>
        <h1 className="page-title mt-2">Leads</h1>
        <p className="page-subtitle">Signups from the landing page&apos;s &ldquo;Join the beta&rdquo; form. Newest first.</p>
      </header>
      <section className="co-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--co-line-soft)] px-5 py-4">
          <div>
            <p className="eyebrow">Beta signups</p>
            <h2 className="mt-1 text-lg font-semibold">{total} lead{total === 1 ? "" : "s"}</h2>
          </div>
          <span className="text-xs text-[var(--co-muted)]">Newest first</span>
        </div>
        {rows.length === 0 ? (
          <div className="p-14 text-center">
            <p className="mt-4 font-semibold">No leads yet</p>
            <p className="mt-1 text-sm text-[var(--co-muted)]">Submissions from the landing page will show up here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-[var(--co-surface-muted)] text-xs uppercase tracking-[0.1em] text-[var(--co-muted)]">
                <tr>
                  <th className="px-5 py-3">Business</th>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Crew size</th>
                  <th className="px-5 py-3">Message</th>
                  <th className="px-5 py-3">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--co-line-soft)]">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-[var(--co-surface-muted)]/50">
                    <td className="px-5 py-4 font-medium">{row.businessName}</td>
                    <td className="px-5 py-4 text-[var(--co-muted)]">{row.contactName ?? "—"}</td>
                    <td className="px-5 py-4">
                      <a href={`mailto:${row.email}`} className="text-[var(--co-accent-text)] hover:underline">
                        {row.email}
                      </a>
                    </td>
                    <td className="px-5 py-4 text-[var(--co-muted)]">{row.phone ?? "—"}</td>
                    <td className="px-5 py-4 text-[var(--co-muted)]">{row.crewSize ? (CREW_SIZE_LABELS[row.crewSize] ?? row.crewSize) : "—"}</td>
                    <td className="max-w-[280px] truncate px-5 py-4 text-xs text-[var(--co-muted)]" title={row.message ?? ""}>
                      {row.message ?? "—"}
                    </td>
                    <td className="px-5 py-4 text-xs text-[var(--co-muted)]">{new Date(row.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={total}
          itemLabel="lead"
          basePath="/leads"
          searchParams={sp}
          hrefForPage={(target) => hrefForPage(sp, target)}
        />
      </section>
    </div>
  );
}
