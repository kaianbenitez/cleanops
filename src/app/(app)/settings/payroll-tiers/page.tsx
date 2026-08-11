"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PAY_TIER_BRACKETS,
  validatePayTierBrackets,
  type PayTierBracket,
} from "@/lib/payroll/brackets";

/** Hours are entered to two decimals; keep derived cutovers there too so
 * floating-point arithmetic doesn't produce 34.00000000000001. */
function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

export default function PayrollTiersSettingsPage() {
  const [brackets, setBrackets] = useState<PayTierBracket[]>(DEFAULT_PAY_TIER_BRACKETS);
  // Employee tier rates are stored as a positional array zipped against these
  // brackets, so adding or removing one desyncs every saved rate. Remember how
  // many were saved to warn before that happens.
  const [savedCount, setSavedCount] = useState(DEFAULT_PAY_TIER_BRACKETS.length);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        const existing = data.company?.settings?.payTierBrackets as PayTierBracket[] | undefined;
        if (existing && existing.length > 0) {
          setBrackets(existing);
          setSavedCount(existing.length);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const { errors, warnings } = useMemo(() => validatePayTierBrackets(brackets), [brackets]);

  function updateBracket(index: number, field: keyof PayTierBracket, value: string) {
    setMessage(null);
    setBrackets((current) =>
      current.map((bracket, i) => {
        if (i !== index) return bracket;
        if (field === "label") return { ...bracket, label: value };
        // A blank max-hours field means "no limit" — that's how the open-ended
        // top bracket is expressed, so empty must stay null rather than 0.
        if (field === "maxHours")
          return { ...bracket, maxHours: value.trim() === "" ? null : parseFloat(value) };
        return { ...bracket, minHours: parseFloat(value || "0") };
      })
    );
  }

  function addBracket() {
    setMessage(null);
    setConfirmingRemoval(null);
    setBrackets((current) => {
      const last = current[current.length - 1];
      if (!last) return [{ minHours: 0, maxHours: null, label: "All hours" }];

      // Brackets hand over at the ladder's .01 cutover (25.99 → 26) so the new
      // tier picks up exactly where the previous one stops, with no uncovered
      // band in between.
      if (last.maxHours !== null) {
        const nextMin = roundHours(last.maxHours + 0.01);
        return [...current, { minHours: nextMin, maxHours: null, label: `${nextMin}+ hrs` }];
      }

      // Only the final bracket may be open-ended — the payroll lookup returns
      // the first bracket the hours fall into, so an open-ended tier in the
      // middle makes every bracket after it unreachable. The new tier takes
      // over that role, so give the outgoing one a real ceiling. Its "34+ hrs"
      // style label no longer describes it, so restate it as a range.
      const nextMin = roundHours(last.minHours + 1);
      const cappedMax = roundHours(nextMin - 0.01);
      return [
        ...current.slice(0, -1),
        { ...last, maxHours: cappedMax, label: `${last.minHours}–${cappedMax} hrs` },
        { minHours: nextMin, maxHours: null, label: `${nextMin}+ hrs` },
      ];
    });
  }

  function removeBracket(index: number) {
    setMessage(null);
    setConfirmingRemoval(null);
    setBrackets((current) => current.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payTierBrackets: brackets }),
    });
    setSaving(false);
    if (response.ok) {
      setSavedCount(brackets.length);
      setMessage({ tone: "success", text: "Payroll tiers saved." });
      return;
    }
    setMessage({ tone: "error", text: "Could not save — check the bracket values." });
  }

  if (loading) return <div className="co-card p-8 text-sm text-[var(--co-muted)]">Loading payroll tiers…</div>;

  const countChanged = brackets.length !== savedCount;

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Payroll</p>
        <h1 className="page-title mt-2">Commission tiers</h1>
        <p className="page-subtitle">
          Weekly-hour brackets used to pick each commission employee&apos;s pay rate. Every business
          can use a different number of brackets and cutoffs — these aren&apos;t fixed. Changing this
          only affects new tier-rate entries; existing employees keep whatever rates were saved
          under the old brackets until you re-save their tier rates on their profile page.
        </p>
      </div>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
          <p className="eyebrow">Hour ladder</p>
          <h2 className="mt-1 text-lg font-semibold">Brackets</h2>
          <p className="mt-1 text-xs text-[var(--co-muted)]">
            Brackets run from fewest hours to most and must not overlap. Leave the last bracket&apos;s
            max hours blank so it covers everything above its start.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[var(--co-evergreen)] text-xs uppercase tracking-[0.08em] text-white">
              <tr>
                <th className="px-4 py-3">Label</th>
                <th className="px-3 py-3">Min hours</th>
                <th className="px-3 py-3">Max hours</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--co-line-soft)]">
              {brackets.map((bracket, i) => (
                <tr key={i} className="hover:bg-[var(--co-surface-muted)]/50">
                  <td className="px-4 py-3">
                    <input
                      value={bracket.label}
                      onChange={(event) => updateBracket(i, "label", event.target.value)}
                      aria-label={`Bracket ${i + 1} label`}
                      className="co-input w-44 font-medium"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={bracket.minHours}
                      onChange={(event) => updateBracket(i, "minHours", event.target.value)}
                      aria-label={`Bracket ${i + 1} min hours`}
                      className="co-input w-24"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="No limit"
                      value={bracket.maxHours ?? ""}
                      onChange={(event) => updateBracket(i, "maxHours", event.target.value)}
                      aria-label={`Bracket ${i + 1} max hours`}
                      className="co-input w-28"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {confirmingRemoval === i ? (
                      <span className="inline-flex items-center gap-3">
                        <button
                          onClick={() => removeBracket(i)}
                          className="text-xs font-semibold text-rose-600 hover:text-rose-800"
                        >
                          Confirm remove
                        </button>
                        <button
                          onClick={() => setConfirmingRemoval(null)}
                          className="text-xs font-medium text-[var(--co-muted)] hover:text-[var(--co-ink)]"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmingRemoval(i)}
                        disabled={brackets.length <= 1}
                        className="text-xs font-medium text-rose-600 hover:text-rose-800 disabled:cursor-not-allowed disabled:text-[var(--co-faint)]"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {errors.length > 0 && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <p className="font-semibold">Fix these before saving</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {(warnings.length > 0 || countChanged) && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <p className="font-semibold">Worth checking</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {countChanged && (
              <li>
                You&apos;re changing the number of brackets from {savedCount} to {brackets.length}.
                Saved per-employee tier rates line up with brackets by position, so every commission
                employee&apos;s rates will need re-saving on their profile page afterwards.
              </li>
            )}
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={addBracket} className="co-button-secondary">
          + Add bracket
        </button>
        <button
          onClick={save}
          disabled={saving || errors.length > 0}
          className="co-button-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save payroll tiers"}
        </button>
        {message && (
          <p
            className={`text-sm font-medium ${
              message.tone === "success" ? "text-[var(--co-evergreen)]" : "text-rose-600"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
