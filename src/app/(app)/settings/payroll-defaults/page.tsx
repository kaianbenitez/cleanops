"use client";

import { useEffect, useState } from "react";

export default function PayrollDefaultsSettingsPage() {
  const [mileageRate, setMileageRate] = useState("0.35");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return;
        setMileageRate(((data.company.settings?.mileageRateCents ?? 35) / 100).toFixed(2));
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mileageRateCents: Math.round(Number(mileageRate || 0) * 100) }),
    });
    setMessage(response.ok ? "Payroll defaults saved." : "Could not save payroll defaults.");
  }

  if (loading) {
    return <div className="co-card p-8 text-sm text-[var(--co-muted)]">Loading payroll defaults…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Payroll</p>
        <h1 className="page-title mt-2">Mileage rate</h1>
        <p className="page-subtitle">This is used when a new payroll period is generated.</p>
      </div>

      <section className="co-card p-5">
        <label className="block max-w-xs text-sm">
          <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Mileage rate ($ / mile)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            className="co-input w-full"
            value={mileageRate}
            onChange={(event) => setMileageRate(event.target.value)}
          />
          <span className="mt-2 block text-xs leading-5 text-[var(--co-muted)]">
            Existing payroll lines stay editable after generation.
          </span>
        </label>
        <button onClick={save} className="co-button-primary mt-5">
          Save mileage rate
        </button>
        {message ? <p className="mt-3 text-sm font-medium text-[var(--co-accent-text)]">{message}</p> : null}
      </section>
    </div>
  );
}
