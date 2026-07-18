"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Bracket = { minHours: number; maxHours: number | null; label: string };

const DEFAULT_BRACKETS: Bracket[] = [
  { minHours: 0, maxHours: 25.99, label: "Under 26 hrs" },
  { minHours: 26, maxHours: 29.99, label: "26–29.99 hrs" },
  { minHours: 30, maxHours: 33.99, label: "30–33.99 hrs" },
  { minHours: 34, maxHours: null, label: "34+ hrs" },
];

export default function PayrollTiersSettingsPage() {
  const [brackets, setBrackets] = useState<Bracket[]>(DEFAULT_BRACKETS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        const existing = data.company?.settings?.payTierBrackets as Bracket[] | undefined;
        if (existing && existing.length > 0) setBrackets(existing);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function updateBracket(index: number, field: keyof Bracket, value: string) {
    setBrackets((current) =>
      current.map((b, i) => {
        if (i !== index) return b;
        if (field === "label") return { ...b, label: value };
        if (field === "maxHours") return { ...b, maxHours: value.trim() === "" ? null : parseFloat(value) };
        return { ...b, minHours: parseFloat(value || "0") };
      })
    );
  }

  function addBracket() {
    setBrackets((current) => {
      const last = current[current.length - 1];
      const nextMin = last ? (last.maxHours ?? last.minHours) + 1 : 0;
      // Open-ended brackets can only be the last one — cap the previous
      // "last" bracket so there's exactly one open-ended tier at the end.
      const withCappedLast = last && last.maxHours === null ? current.map((b, i) => (i === current.length - 1 ? { ...b, maxHours: nextMin - 1 } : b)) : current;
      return [...withCappedLast, { minHours: nextMin, maxHours: null, label: `${nextMin}+ hrs` }];
    });
  }

  function removeBracket(index: number) {
    setBrackets((current) => current.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payTierBrackets: brackets }),
    });
    setSaving(false);
    setMessage(res.ok ? "Saved." : "Could not save — check the bracket values.");
  }

  if (loading) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/settings" className="text-sm text-blue-600 underline">
        ← Settings
      </Link>
      <div>
        <h1 className="text-xl font-semibold">Payroll Tiers</h1>
        <p className="text-sm text-gray-500">
          Weekly-hour brackets used to pick each commission employee&apos;s pay rate. Every business
          can use a different number of brackets and cutoffs — these aren&apos;t fixed. Changing this
          only affects new tier-rate entries; existing employees keep whatever rates were saved
          under the old brackets until you re-save their tier rates on their profile page.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="text-left px-3 py-2">Label</th>
              <th className="text-left px-3 py-2">Min hours</th>
              <th className="text-left px-3 py-2">Max hours</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {brackets.map((bracket, i) => (
              <tr key={i}>
                <td className="px-3 py-2">
                  <input
                    value={bracket.label}
                    onChange={(e) => updateBracket(i, "label", e.target.value)}
                    className="w-40 rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={bracket.minHours}
                    onChange={(e) => updateBracket(i, "minHours", e.target.value)}
                    className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="No limit"
                    value={bracket.maxHours ?? ""}
                    onChange={(e) => updateBracket(i, "maxHours", e.target.value)}
                    className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => removeBracket(i)} className="text-xs text-red-600" disabled={brackets.length <= 1}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={addBracket} className="rounded border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
          + Add bracket
        </button>
        <button onClick={save} disabled={saving} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Saving..." : "Save payroll tiers"}
        </button>
        {message && <p className="text-sm text-gray-600">{message}</p>}
      </div>
    </div>
  );
}
