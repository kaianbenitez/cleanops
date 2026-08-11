"use client";

import { useEffect, useState } from "react";

export default function CompanyProfileSettingsPage() {
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Chicago");
  const [revenueTarget, setRevenueTarget] = useState("");
  const [loading, setLoading] = useState(true);
  const [companyMessage, setCompanyMessage] = useState("");
  const [revenueMessage, setRevenueMessage] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return;
        setName(data.company.name ?? "");
        setTimezone(data.company.timezone ?? "America/Chicago");
        setRevenueTarget(
          data.company.settings?.revenueTargetCents == null
            ? ""
            : (data.company.settings.revenueTargetCents / 100).toFixed(2),
        );
      })
      .finally(() => setLoading(false));
  }, []);

  async function saveCompany() {
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, timezone }),
    });
    setCompanyMessage(response.ok ? "Company profile saved." : "Could not save company profile.");
  }

  async function saveRevenueTarget() {
    const dollars = Number(revenueTarget);
    if (revenueTarget.trim() !== "" && (!Number.isFinite(dollars) || dollars < 0)) {
      setRevenueMessage("Enter a valid non-negative monthly revenue target.");
      return;
    }
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revenueTargetCents: revenueTarget.trim() === "" ? null : Math.round(dollars * 100) }),
    });
    setRevenueMessage(response.ok ? "Monthly revenue target saved." : "Could not save monthly revenue target.");
  }

  if (loading) {
    return <div className="co-card p-8 text-sm text-[var(--co-muted)]">Loading company profile…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Company</p>
        <h1 className="page-title mt-2">Profile & goals</h1>
        <p className="page-subtitle">These values shape the app, payroll behavior, and the dashboard&apos;s revenue goal.</p>
      </div>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
          <p className="eyebrow">Identity and time</p>
          <h2 className="mt-1 text-lg font-semibold">Company profile</h2>
        </div>
        <div className="grid gap-4 p-5 sm:max-w-sm">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Company name</span>
            <input className="co-input w-full" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Company timezone</span>
            <input
              className="co-input w-full"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              placeholder="America/Chicago"
            />
          </label>
          <div>
            <button onClick={saveCompany} className="co-button-primary">
              Save company profile
            </button>
            {companyMessage ? <p className="mt-3 text-sm font-medium text-[var(--co-evergreen)]">{companyMessage}</p> : null}
          </div>
        </div>
      </section>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
          <p className="eyebrow">Revenue goal</p>
          <h2 className="mt-1 text-lg font-semibold">Monthly target</h2>
          <p className="mt-1 text-sm text-[var(--co-muted)]">Used to compare paid revenue on the dashboard.</p>
        </div>
        <div className="p-5 sm:max-w-xs">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">Monthly revenue target ($)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              className="co-input w-full"
              value={revenueTarget}
              onChange={(event) => setRevenueTarget(event.target.value)}
              placeholder="Not set"
            />
            <span className="mt-2 block text-xs leading-5 text-[var(--co-muted)]">
              Leave blank and save to remove the target.
            </span>
          </label>
          <button onClick={saveRevenueTarget} className="co-button-secondary mt-5">
            Save monthly target
          </button>
          {revenueMessage ? <p className="mt-3 text-sm font-medium text-[var(--co-evergreen)]">{revenueMessage}</p> : null}
        </div>
      </section>
    </div>
  );
}
