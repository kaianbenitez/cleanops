"use client";

import { useEffect, useMemo, useState } from "react";

type InventoryItem = {
  id: string;
  name: string;
  category: string;
  onHand: number;
  reorderAt: number;
  unitCostCents: number;
  supplier?: string;
};

type CompanyPayload = {
  company?: {
    settings?: {
      inventory?: InventoryItem[];
    };
    updatedAt?: string;
  };
};

const CATEGORIES = ["All", "Chemicals", "Cloths", "Bags", "Equipment", "PPE", "Other"];

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function stockTone(item: InventoryItem) {
  return item.onHand <= item.reorderAt
    ? "co-badge-warning"
    : item.onHand <= item.reorderAt * 1.5
      ? "co-badge-info"
      : "co-badge-success";
}

function stockLabel(item: InventoryItem) {
  if (item.onHand <= item.reorderAt) return "Low stock";
  if (item.onHand <= item.reorderAt * 1.5) return "Watch";
  return "In stock";
}

function SummaryStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs text-[var(--co-muted)]">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        {sub ? <p className="text-xs text-[var(--co-muted)]">{sub}</p> : null}
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="co-card overflow-hidden">
      <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

export default function SuppliesPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [lowOnly, setLowOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: CompanyPayload) => {
        const inventory = Array.isArray(data.company?.settings?.inventory) ? data.company!.settings!.inventory! : [];
        setItems(inventory);
        setUpdatedAt(data.company?.updatedAt ?? null);
      })
      .catch(() => setMessage("Could not load inventory."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          `${item.name} ${item.supplier ?? ""}`.toLowerCase().includes(search.toLowerCase()) &&
          (category === "All" || item.category === category) &&
          (!lowOnly || item.onHand <= item.reorderAt)
      ),
    [items, search, category, lowOnly]
  );

  const inventoryValue = items.reduce((sum, item) => sum + item.onHand * item.unitCostCents, 0);
  const lowStockItems = items.filter((item) => item.onHand <= item.reorderAt);
  const watchItems = items.filter((item) => item.onHand > item.reorderAt && item.onHand <= item.reorderAt * 1.5);
  async function save(next: InventoryItem[]) {
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inventory: next }),
    });
    if (res.ok) {
      setItems(next);
      setMessage("Inventory saved.");
      const body = (await res.json().catch(() => ({}))) as CompanyPayload;
      setUpdatedAt(body.company?.updatedAt ?? new Date().toISOString());
    } else {
      setMessage("Could not save inventory.");
    }
    setSaving(false);
  }

  function addItem() {
    const item: InventoryItem = {
      id: `item-${Date.now()}`,
      name: "New supply",
      category: "Other",
      onHand: 0,
      reorderAt: 5,
      unitCostCents: 0,
      supplier: "",
    };
    setItems((current) => [item, ...current]);
  }

  function update(id: string, field: keyof InventoryItem, value: string | number) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-[var(--co-line)]" />
        <div className="h-40 animate-pulse rounded-2xl bg-[var(--co-surface)]" />
        <div className="h-80 animate-pulse rounded-2xl bg-[var(--co-surface)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="page-title">Supplies</h1>
        <div className="flex flex-wrap gap-2">
          <button className="co-button-secondary" onClick={addItem}>
            + Add item
          </button>
          <button className="co-button-primary" disabled={saving} onClick={() => save(items)}>
            {saving ? "Saving..." : "Save inventory"}
          </button>
        </div>
      </header>

      {message ? <p className="text-sm font-medium text-[var(--co-accent-text)]">{message}</p> : null}

      <section className="co-card grid divide-y divide-[var(--co-line-soft)] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <SummaryStat label="Items" value={`${items.length}`} />
        <SummaryStat label="Low stock" value={`${lowStockItems.length}`} />
        <SummaryStat label="Watch list" value={`${watchItems.length}`} />
        <SummaryStat label="Inventory value" value={dollars(inventoryValue)} sub={updatedAt ? `Saved ${new Date(updatedAt).toLocaleDateString()}` : undefined} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">
        <div className="space-y-5">
          <Panel title="Inventory">
            <div className="flex flex-wrap gap-3 border-b border-[var(--co-line-soft)] pb-4">
              <input
                className="co-input min-w-[240px] flex-1"
                placeholder="Search supplies..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select className="co-input" value={category} onChange={(event) => setCategory(event.target.value)}>
                {CATEGORIES.map((entry) => (
                  <option key={entry}>{entry}</option>
                ))}
              </select>
              <button
                type="button"
                className={`co-button-secondary ${lowOnly ? "border-[var(--co-accent-text)] bg-[var(--co-surface-muted)]" : ""}`}
                onClick={() => setLowOnly((current) => !current)}
              >
                Low stock
              </button>
            </div>

            <div className="overflow-x-auto pt-4">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-[var(--co-surface-muted)] text-xs uppercase tracking-[0.12em] text-[var(--co-muted)]">
                  <tr>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">On hand</th>
                    <th className="px-4 py-3">Reorder at</th>
                    <th className="px-4 py-3">Unit cost</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--co-line-soft)]">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm text-[var(--co-muted)]">
                        No supplies match this view. Add an item to start tracking stock.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item) => {
                      const low = item.onHand <= item.reorderAt;
                      return (
                        <tr key={item.id} className={low ? "bg-[var(--co-warning)]/10" : ""}>
                          <td className="px-4 py-3">
                            <input className="co-input w-48" value={item.name} onChange={(event) => update(item.id, "name", event.target.value)} />
                          </td>
                          <td className="px-4 py-3">
                            <select className="co-input" value={item.category} onChange={(event) => update(item.id, "category", event.target.value)}>
                              {CATEGORIES.filter((entry) => entry !== "All").map((entry) => (
                                <option key={entry}>{entry}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <input className="co-input w-24" type="number" min="0" value={item.onHand} onChange={(event) => update(item.id, "onHand", Number(event.target.value))} />
                          </td>
                          <td className="px-4 py-3">
                            <input className="co-input w-24" type="number" min="0" value={item.reorderAt} onChange={(event) => update(item.id, "reorderAt", Number(event.target.value))} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <span>$</span>
                              <input
                                className="co-input w-24"
                                type="number"
                                min="0"
                                step="0.01"
                                value={(item.unitCostCents / 100).toFixed(2)}
                                onChange={(event) => update(item.id, "unitCostCents", Math.round(Number(event.target.value) * 100))}
                                onFocus={(event) => event.target.select()}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              className="co-input w-36"
                              placeholder="Supplier"
                              value={item.supplier ?? ""}
                              onChange={(event) => update(item.id, "supplier", event.target.value)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${stockTone(item)}`}>{stockLabel(item)}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

        </div>

        <div className="space-y-5">
          <Panel title="Low stock">
            <div className="space-y-3">
              {lowStockItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/30 p-4 text-sm text-[var(--co-muted)]">
                  No low-stock items right now.
                </div>
              ) : (
                lowStockItems.slice(0, 5).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-[var(--co-ink)]">{item.name}</p>
                        <p className="mt-1 text-xs text-[var(--co-muted)]">
                          {item.onHand} on hand · reorder at {item.reorderAt}
                        </p>
                      </div>
                      <span className="co-badge-warning rounded-full px-2.5 py-1 text-xs font-medium">Reorder</span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-[var(--co-surface-muted)]">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-[var(--co-warning)] to-[var(--co-danger)]"
                        style={{ width: `${Math.max(Math.min((item.onHand / Math.max(item.reorderAt, 1)) * 100, 100), 6)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-[var(--co-muted)]">
                      <span>{dollars(item.onHand * item.unitCostCents)} on hand</span>
                      <span>{item.category}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>

        </div>
      </section>
    </div>
  );
}
