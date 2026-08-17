"use client";

import { useEffect, useMemo, useState } from "react";

type CompanySettings = {
  quoteTemplate?: {
    introLetter?: string;
    terms?: string;
  };
  ghlTagMap?: Record<string, string>;
  ghlWorkflowMap?: Record<string, string>;
  branding?: {
    logoUrl?: string | null;
    brandColor?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  inventory?: Array<{ id: string; name: string }>;
};

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="co-card p-5">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--co-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{value}</p>
      <p className="mt-2 text-xs text-[var(--co-muted)]">{hint}</p>
    </div>
  );
}

export default function SettingsOverviewPage() {
  const [settings, setSettings] = useState<CompanySettings>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setMessage(data.error ?? "Settings could not be loaded.");
          return;
        }
        setSettings(data.company.settings ?? {});
      })
      .catch(() => setMessage("Settings could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  const status = useMemo(() => {
    const quoteTemplateReady = Boolean(settings.quoteTemplate?.introLetter && settings.quoteTemplate?.terms);
    const ghlReady = Boolean(settings.ghlTagMap && Object.keys(settings.ghlTagMap).length >= 5);
    const workflowReady = Boolean(
      settings.ghlWorkflowMap && Object.values(settings.ghlWorkflowMap).some((value) => Boolean(value)),
    );
    const brandingReady = Boolean(
      settings.branding?.brandColor || settings.branding?.logoUrl || settings.branding?.phone || settings.branding?.email,
    );
    const inventoryCount = settings.inventory?.length ?? 0;
    return [
      {
        label: "Quote template",
        value: quoteTemplateReady ? "Ready" : "Needs setup",
        hint: quoteTemplateReady ? "Intro + terms are configured" : "Set up proposal copy",
      },
      {
        label: "GHL tags",
        value: ghlReady ? "Mapped" : "Needs setup",
        hint: ghlReady ? "Workflow tags saved" : "Connect workflow tags",
      },
      {
        label: "GHL workflows",
        value: workflowReady ? "Mapped" : "Needs setup",
        hint: workflowReady ? "Workflow IDs saved" : "Map workflow IDs",
      },
      {
        label: "Branding",
        value: brandingReady ? "Configured" : "Needs setup",
        hint: brandingReady ? "Proposal identity saved" : "Add logo/contact details",
      },
      {
        label: "Inventory items",
        value: String(inventoryCount),
        hint: inventoryCount > 0 ? "Items are tracked" : "Add supplies later",
      },
    ];
  }, [settings]);

  if (loading) {
    return <div className="co-card p-8 text-sm text-[var(--co-muted)]">Loading settings…</div>;
  }

  return (
    <div className="space-y-6">
      {message ? <p className="text-sm font-medium text-[var(--co-danger)]">{message}</p> : null}

      <section>
        <p className="eyebrow">At a glance</p>
        <h2 className="mt-1 text-lg font-semibold">Setup status</h2>
        <p className="mt-1 text-sm text-[var(--co-muted)]">
          What still needs attention before quoting and automations run end to end. Pick a section from the menu
          to fix any of these.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {status.map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value} hint={card.hint} />
          ))}
        </div>
      </section>
    </div>
  );
}
