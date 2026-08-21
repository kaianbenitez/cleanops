import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, quotes, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { StatusPill, statusOptions } from "@/components/ui/status-pill";
import { LocalDateTime } from "@/components/local-date-time";

type SearchParams = { q?: string; status?: string };

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const SERVICE_LABELS: Record<string, string> = {
  supreme_deep: "Supreme Deep",
  deep: "Deep Clean",
  first_time: "First Time",
  weekly: "Weekly",
  biweekly: "Bi-Weekly",
  four_weeks: "Every 4 Weeks",
  move_in_out: "Move In / Out",
};

function hrefWith(params: SearchParams, key: keyof SearchParams, value: string) {
  const next = new URLSearchParams();
  Object.entries(params).forEach(([name, current]) => {
    if (name !== key && current) next.set(name, current);
  });
  if (value) next.set(key, value);
  const query = next.toString();
  return query ? `/quotes?${query}` : "/quotes";
}

export default async function QuotesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/my-day");

  const sp = await searchParams;

  // The stat tiles are status-filter links, so they must stay independent of the
  // status filter currently applied — otherwise selecting "Accepted" zeroes every
  // other tile and there is no way to navigate back. They do follow the search
  // box, so the breakdown stays scoped to whatever the admin is looking at.
  const baseConditions = [eq(quotes.companyId, admin.companyId)];

  if (sp.q?.trim()) {
    const query = `%${sp.q.trim()}%`;
    // quotes.id is a uuid column — ILIKE has no operator for uuid without an
    // explicit text cast, so this previously threw a SQL error on every search.
    baseConditions.push(or(ilike(customers.firstName, query), ilike(customers.lastName, query), sql`${quotes.id}::text ilike ${query}`)!);
  }

  const conditions = [...baseConditions];
  if (sp.status === "accepted_needs_scheduling") {
    conditions.push(eq(quotes.status, "accepted"), isNull(quotes.bookedAt));
  } else if (sp.status && sp.status !== "all") {
    conditions.push(eq(quotes.status, sp.status as typeof quotes.status.enumValues[number]));
  }

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: quotes.id,
        status: quotes.status,
        totalCents: quotes.totalCents,
        requestedServiceType: quotes.requestedServiceType,
        acceptedServiceType: quotes.acceptedServiceType,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        createdAt: quotes.createdAt,
        sentAt: quotes.sentAt,
        viewedAt: quotes.viewedAt,
        acceptedAt: quotes.acceptedAt,
        desiredCleaningDate: quotes.desiredCleaningDate,
        bookedAt: quotes.bookedAt,
        publicToken: quotes.publicToken,
        createdByFirstName: users.firstName,
        createdByLastName: users.lastName,
      })
      .from(quotes)
      .innerJoin(customers, eq(quotes.customerId, customers.id))
      .leftJoin(users, eq(quotes.createdByUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(quotes.createdAt)),
    db
      .select({
        all: sql<number>`count(*)`,
        draft: sql<number>`count(*) filter (where ${quotes.status} = 'draft')`,
        sent: sql<number>`count(*) filter (where ${quotes.status} in ('sent', 'viewed'))`,
        accepted: sql<number>`count(*) filter (where ${quotes.status} = 'accepted' and ${quotes.bookedAt} is null)`,
      })
      .from(quotes)
      .innerJoin(customers, eq(quotes.customerId, customers.id))
      .where(and(...baseConditions)),
  ]);

  const counts = {
    all: Number(countRow.all),
    draft: Number(countRow.draft),
    sent: Number(countRow.sent),
    accepted: Number(countRow.accepted),
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Operations / Sales</p>
          <h1 className="page-title">Quotes</h1>
          <p className="page-subtitle">Build thoughtful proposals, track decisions, and turn accepted options into scheduled work.</p>
        </div>
        <Link href="/quotes/new" className="co-button-primary">
          + New quote
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["All quotes", counts.all, "all", "All records"],
          ["Drafts", counts.draft, "draft", "Needs sending"],
          ["Sent / viewed", counts.sent, "sent", "Waiting on customer"],
          ["Accepted — needs scheduling", counts.accepted, "accepted_needs_scheduling", "Call and schedule"],
        ].map(([label, value, status, detail]) => (
          <Link key={String(label)} href={hrefWith(sp, "status", String(status))} className="co-card flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-[var(--co-muted)]">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
              <p className="mt-2 text-xs text-[var(--co-muted)]">{detail}</p>
            </div>
            <span className="text-xl text-[var(--co-accent-text)]">{label === "Accepted" ? "✓" : "◧"}</span>
          </Link>
        ))}
      </section>

      <section className="co-card overflow-hidden">
        <form className="flex flex-wrap gap-3 border-b border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-4">
          <input name="q" defaultValue={sp.q} placeholder="Search customer or quote" className="co-input min-w-[240px] flex-1" />
          <select name="status" defaultValue={sp.status ?? "all"} className="co-input w-full sm:w-auto">
            <option value="all">All statuses</option>
            <option value="accepted_needs_scheduling">Accepted — needs scheduling</option>
            {statusOptions("quote").map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button type="submit" className="co-button-secondary">
            Filter quotes
          </button>
          {Object.keys(sp).length ? (
            <Link href="/quotes" className="self-center text-sm font-medium text-[var(--co-accent-text)]">
              Clear
            </Link>
          ) : null}
        </form>

        {rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-medium">No quotes found.</p>
            <p className="mt-1 text-sm text-[var(--co-muted)]">Create a quote when a GHL prospect is ready for pricing.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-[var(--co-surface-muted)] text-xs uppercase tracking-[0.1em] text-[var(--co-muted)]">
                <tr>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Suggested service</th>
                  <th className="px-5 py-3">Accepted option</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Requested date</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Quoted by</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--co-line-soft)]">
                {rows.map((quote) => (
                  <tr key={quote.id} className="hover:bg-[var(--co-surface-muted)]/50">
                    <td className="px-5 py-4 whitespace-nowrap text-xs text-[var(--co-muted)]">{quote.desiredCleaningDate ?? "—"}</td>
                    <td className="px-5 py-4">
                      <Link href={`/quotes/${quote.id}`} className="font-semibold text-[var(--co-ink)] hover:text-[var(--co-accent-text)]">
                        {quote.customerFirstName} {quote.customerLastName}
                      </Link>
                      <span className="mt-1 block text-xs text-[var(--co-muted)]">Q-{quote.id.slice(0, 6).toUpperCase()}</span>
                    </td>
                    <td className="px-5 py-4 text-[var(--co-muted)]">{SERVICE_LABELS[quote.requestedServiceType ?? ""] ?? "Not selected"}</td>
                    <td className="px-5 py-4 text-[var(--co-muted)]">{SERVICE_LABELS[quote.acceptedServiceType ?? ""] ?? "—"}</td>
                    <td className="px-5 py-4 font-semibold">{quote.acceptedServiceType || quote.requestedServiceType ? dollars(quote.totalCents) : "—"}</td>
                    <td className="px-5 py-4">
                      <StatusPill domain="quote" status={quote.status} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs text-[var(--co-muted)]">
                      <LocalDateTime value={quote.createdAt} options={{ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-[var(--co-muted)]">
                      {quote.createdByFirstName ? `${quote.createdByFirstName} ${quote.createdByLastName}` : "—"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/quotes/${quote.id}`} className="rounded-lg border border-[var(--co-line)] px-3 py-2 text-xs font-medium text-[var(--co-accent-text)]">
                          {quote.status === "accepted" && !quote.bookedAt ? "Call and schedule" : "Open"}
                        </Link>
                        <Link href={`/quote/${quote.publicToken}`} target="_blank" className="rounded-lg border border-[var(--co-line)] px-3 py-2 text-xs font-medium text-[var(--co-ink)]">
                          Proposal
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-[var(--co-line-soft)] px-5 py-3 text-xs text-[var(--co-muted)]">Showing {rows.length} quote{rows.length === 1 ? "" : "s"}</div>
      </section>
    </div>
  );
}
