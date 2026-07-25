"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type EligibleCustomerRow = {
  id: string;
  name: string;
  clientTypeLabel: string;
  status: string;
  statusLabel: string;
  statusClassName: string;
  address: string;
};

/** Selectable table for the "eligible for archive" filtered view — a distinct, simpler
 * mode from the main paginated customers table, so it's a self-contained client component
 * rather than threading selection state through the server-rendered table. */
export function BulkArchiveTable({ rows }: { rows: EligibleCustomerRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) => (current.size === rows.length ? new Set() : new Set(rows.map((row) => row.id))));
  }

  async function archiveSelected() {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError("");
    const response = await fetch("/api/customers/bulk-archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerIds: [...selected] }),
    });
    setSubmitting(false);
    if (!response.ok) {
      setError("Could not archive the selected customers.");
      return;
    }
    setSelected(new Set());
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <div className="p-12 text-center">
        <p className="font-medium">No customers are currently eligible for archive.</p>
        <p className="mt-1 text-sm text-[var(--co-muted)]">Eligible means: served at least once, no upcoming job, and never signed up for a recurring plan.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 px-5 py-3 text-sm">
        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--co-muted)]">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-[var(--co-evergreen)]" />
          Select all {rows.length} eligible
        </label>
        <div className="flex items-center gap-3">
          {error ? <span className="text-xs text-rose-600">{error}</span> : null}
          <button type="button" className="co-button-primary" disabled={selected.size === 0 || submitting} onClick={archiveSelected}>
            {submitting ? "Archiving..." : `Archive ${selected.size} selected`}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[var(--co-surface-muted)] text-xs uppercase tracking-[0.1em] text-[var(--co-muted)]">
            <tr>
              <th className="w-10 px-5 py-3"></th>
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Address</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--co-line-soft)]">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-[var(--co-surface-muted)]/50">
                <td className="px-5 py-4">
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} className="accent-[var(--co-evergreen)]" />
                </td>
                <td className="px-5 py-4">
                  <p className="font-semibold text-[var(--co-ink)]">{row.name}</p>
                  <p className="text-xs text-[var(--co-muted)]">{row.clientTypeLabel}</p>
                </td>
                <td className="px-5 py-4">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${row.statusClassName}`}>{row.statusLabel}</span>
                </td>
                <td className="px-5 py-4 text-[var(--co-muted)]">{row.address}</td>
                <td className="px-5 py-4 text-right">
                  <Link href={`/customers/${row.id}`} className="font-medium text-[var(--co-evergreen)]">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
