"use client";

import { useEffect, useState } from "react";

type Branding = {
  logoUrl: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  brandColor: string;
  website: string;
  reviewUrl: string;
};

const EMPTY: Branding = {
  logoUrl: "",
  phone: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  zip: "",
  brandColor: "#14211f",
  website: "",
  reviewUrl: "",
};

export default function BrandingSettingsPage() {
  const [branding, setBranding] = useState<Branding>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        setBranding({ ...EMPTY, ...(data.company?.settings?.branding ?? {}) });
        setLoading(false);
      })
      .catch(() => {
        setMessage("Could not load branding.");
        setLoading(false);
      });
  }, []);

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branding }),
    });
    setSaving(false);
    setMessage(response.ok ? "Branding saved." : "Could not save branding.");
  }

  const update = (field: keyof Branding, value: string) => setBranding((current) => ({ ...current, [field]: value }));
  const color = /^#[0-9a-fA-F]{6}$/.test(branding.brandColor) ? branding.brandColor : "#14211f";

  if (loading) return <div className="co-card p-8 text-sm text-[var(--co-muted)]">Loading branding…</div>;

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Company</p>
        <h1 className="page-title mt-2">Branding</h1>
        <p className="page-subtitle">Control the identity customers see on proposals, invoices, and payment messages.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <section className="co-card p-5">
          <p className="eyebrow">Brand system</p>
          <h2 className="mt-1 text-lg font-semibold">Logo and contact details</h2>

          <label className="mt-5 block text-sm">
            <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Logo URL</span>
            <input className="co-input w-full" value={branding.logoUrl} onChange={(event) => update("logoUrl", event.target.value)} placeholder="https://..." />
          </label>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Phone</span>
              <input className="co-input w-full" value={branding.phone} onChange={(event) => update("phone", event.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Website</span>
              <input className="co-input w-full" value={branding.website} onChange={(event) => update("website", event.target.value)} placeholder="https://..." />
            </label>
          </div>

          <label className="mt-4 block text-sm">
            <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Google review link</span>
            <input className="co-input w-full" value={branding.reviewUrl} onChange={(event) => update("reviewUrl", event.target.value)} placeholder="https://g.page/r/..." />
          </label>

          <label className="mt-4 block text-sm">
            <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Customer-facing email</span>
            <input type="email" className="co-input w-full" value={branding.email} onChange={(event) => update("email", event.target.value)} />
          </label>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Brand color</span>
              <div className="flex gap-2">
                <input type="color" value={color} onChange={(event) => update("brandColor", event.target.value)} className="h-11 w-14 rounded-lg border border-[var(--co-line)] bg-white p-1" />
                <input className="co-input min-w-0 flex-1 font-mono" value={branding.brandColor} onChange={(event) => update("brandColor", event.target.value)} />
              </div>
            </label>
            <div className="rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] p-3">
              <p className="text-xs text-[var(--co-muted)]">Color preview</p>
              <div className="mt-2 h-8 rounded-lg" style={{ backgroundColor: color }} />
            </div>
          </div>

          <label className="mt-5 block text-sm">
            <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Address line 1</span>
            <input className="co-input w-full" value={branding.addressLine1} onChange={(event) => update("addressLine1", event.target.value)} />
          </label>
          <label className="mt-4 block text-sm">
            <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Address line 2</span>
            <input className="co-input w-full" value={branding.addressLine2} onChange={(event) => update("addressLine2", event.target.value)} />
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="City" value={branding.city} onChange={(value) => update("city", value)} />
            <Field label="State" value={branding.state} onChange={(value) => update("state", value)} />
            <Field label="ZIP" value={branding.zip} onChange={(value) => update("zip", value)} />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[var(--co-muted)]">These values will be used in future customer-facing documents.</p>
            <button onClick={save} disabled={saving} className="co-button-primary">
              {saving ? "Saving…" : "Save branding"}
            </button>
          </div>

          {message ? <p className="mt-3 text-sm font-medium text-[var(--co-evergreen)]">{message}</p> : null}
        </section>

        <aside className="co-card h-fit overflow-hidden xl:sticky xl:top-5">
          <div className="p-5" style={{ backgroundColor: color }}>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-sm font-black text-[var(--co-accent)]">CO</div>
            <p className="mt-5 text-xl font-semibold text-white">{branding.website || "Your company"}</p>
            <p className="mt-1 text-sm text-white/60">Proposal preview</p>
          </div>
          {branding.logoUrl ? (
            <div className="border-b border-[var(--co-line-soft)] p-5">
              <span className="sr-only">Logo preview</span>
              <div
                className="h-12 rounded border border-[var(--co-line)] bg-white"
                style={{ backgroundImage: `url(${branding.logoUrl})`, backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundSize: "contain" }}
              />
            </div>
          ) : null}
          <div className="space-y-2 p-5 text-sm">
            <p className="font-semibold">Contact details</p>
            <p className="text-[var(--co-muted)]">{branding.phone || "Phone not set"}</p>
            <p className="text-[var(--co-muted)]">{branding.email || "Email not set"}</p>
            <p className="text-[var(--co-muted)]">{[branding.addressLine1, branding.city, branding.state, branding.zip].filter(Boolean).join(", ") || "Address not set"}</p>
            <p className="text-[var(--co-muted)]">{branding.reviewUrl ? "Google review link is configured." : "Google review link not set."}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">{label}</span>
      <input className="co-input w-full" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
