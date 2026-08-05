"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { emailToUsername } from "@/lib/auth/username";

const SECTIONS = [
  {
    href: "/settings/pricing",
    label: "Pricing & service locations",
    desc: "Hourly rates, minimums, dirty-code discounts, and travel-zone fees.",
  },
  {
    href: "/settings/room-types",
    label: "Room types & pricing weights",
    desc: "Room counts and hours-per-room that drive quote calculations.",
  },
  {
    href: "/settings/services",
    label: "Service catalog",
    desc: "The service options available when creating one-off jobs.",
  },
  {
    href: "/settings/payroll-tiers",
    label: "Payroll tiers",
    desc: "Weekly-hour brackets used to set commission employees' pay rates.",
  },
  {
    href: "/settings/branding",
    label: "Company branding",
    desc: "Logo, color, contact details, and proposal identity.",
  },
  {
    href: "/settings/ghl",
    label: "GHL integration",
    desc: "Workflow tags and connection settings for GoHighLevel.",
  },
  {
    href: "/settings/integrations",
    label: "Square & Google Maps",
    desc: "Encrypted Square invoicing and Google Maps connection keys.",
  },
  {
    href: "/settings/quote-template",
    label: "Quote page content",
    desc: "Intro letter and terms shown on customer proposals.",
  },
];

type AdminRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  isFieldStaff: boolean;
  payType: "commission_jth" | "office_hourly" | null;
  hourlyRateCents: number | null;
};
type CompanySettings = {
  quoteTemplate?: {
    introLetter?: string;
    terms?: string;
    ownerName?: string;
    ownerTitle?: string;
  };
  ghlTagMap?: Record<string, string>;
  ghlWorkflowMap?: Record<string, string>;
  branding?: {
    logoUrl?: string | null;
    brandColor?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  mileageRateCents?: number;
  revenueTargetCents?: number | null;
  holidays?: string[];
  workingDays?: number[];
  inventory?: Array<{ id: string; name: string }>;
};

type ApiConfig = {
  ghl?: {
    apiKeyConfigured?: boolean;
    locationConfigured?: boolean;
    webhookSecretConfigured?: boolean;
  };
  square?: { configured?: boolean; webhookConfigured?: boolean };
};

type GhlTestStatus = {
  ok: boolean;
  reason?: string;
  status?: number;
  body?: unknown;
};

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="co-card p-5">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--co-muted)]">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{value}</p>
      <p className="mt-2 text-xs text-[var(--co-muted)]">{hint}</p>
    </div>
  );
}

function Panel({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="co-card overflow-hidden">
      <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-[var(--co-muted)]">{description}</p>
        ) : null}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Chicago");
  const [mileageRate, setMileageRate] = useState("0.35");
  const [revenueTarget, setRevenueTarget] = useState("");
  const [holidays, setHolidays] = useState("");
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [settings, setSettings] = useState<CompanySettings>({});
  const [apiConfig, setApiConfig] = useState<ApiConfig>({});
  const [ghlTest, setGhlTest] = useState<GhlTestStatus | null>(null);
  const [testingGhl, setTestingGhl] = useState(false);
  const [message, setMessage] = useState("");
  const [payrollMessage, setPayrollMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetch("/api/settings"), fetch("/api/admins")])
      .then(async ([settingsResponse, adminsResponse]) => {
        const settingsData = await settingsResponse.json().catch(() => ({}));
        const adminData = await adminsResponse.json().catch(() => ({}));

        if (settingsResponse.ok) {
          setName(settingsData.company.name ?? "");
          setTimezone(settingsData.company.timezone ?? "America/Chicago");
          setMileageRate(
            (
              (settingsData.company.settings?.mileageRateCents ?? 35) / 100
            ).toFixed(2),
          );
          setRevenueTarget(
            settingsData.company.settings?.revenueTargetCents == null
              ? ""
              : (
                  settingsData.company.settings.revenueTargetCents / 100
                ).toFixed(2),
          );
          setHolidays(
            Array.isArray(settingsData.company.settings?.holidays)
              ? settingsData.company.settings.holidays.join("\n")
              : "",
          );
          setWorkingDays(
            Array.isArray(settingsData.company.settings?.workingDays)
              ? settingsData.company.settings.workingDays
              : [1, 2, 3, 4, 5],
          );
          setSettings(settingsData.company.settings ?? {});
          setApiConfig(settingsData.apiConfig ?? {});
        } else {
          setMessage(settingsData.error ?? "Settings could not be loaded.");
        }

        if (adminsResponse.ok) {
          setAdmins(adminData.admins ?? []);
        }
      })
      .catch(() => setMessage("Settings could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  const status = useMemo(() => {
    const quoteTemplateReady = Boolean(
      settings.quoteTemplate?.introLetter && settings.quoteTemplate?.terms,
    );
    const ghlReady = Boolean(
      settings.ghlTagMap && Object.keys(settings.ghlTagMap).length >= 5,
    );
    const workflowReady = Boolean(
      settings.ghlWorkflowMap &&
      Object.values(settings.ghlWorkflowMap).some((value) => Boolean(value)),
    );
    const brandingReady = Boolean(
      settings.branding?.brandColor ||
      settings.branding?.logoUrl ||
      settings.branding?.phone ||
      settings.branding?.email,
    );
    const inventoryCount = settings.inventory?.length ?? 0;
    return [
      {
        label: "Quote template",
        value: quoteTemplateReady ? "Ready" : "Needs setup",
        hint: quoteTemplateReady
          ? "Intro + terms are configured"
          : "Set up proposal copy",
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
        hint: brandingReady
          ? "Proposal identity saved"
          : "Add logo/contact details",
      },
      {
        label: "Inventory items",
        value: String(inventoryCount),
        hint: inventoryCount > 0 ? "Items are tracked" : "Add supplies later",
      },
    ];
  }, [settings]);

  const apiCards = [
    {
      label: "GHL API",
      status: apiConfig.ghl?.apiKeyConfigured ? "Configured" : "Needs setup",
      hint:
        apiConfig.ghl?.locationConfigured &&
        apiConfig.ghl?.webhookSecretConfigured
          ? "Location + webhook ready"
          : "Set API key, location ID, and webhook secret",
    },
    {
      label: "Square",
      status: apiConfig.square?.configured ? "Configured" : "Needs setup",
      hint: apiConfig.square?.webhookConfigured
        ? "Payment + webhook ready"
        : "Set Square token and webhook secret",
    },
  ];

  async function saveCompany() {
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, timezone }),
    });
    setMessage(
      response.ok
        ? "Company settings saved."
        : "Could not save company settings.",
    );
  }

  async function savePayrollDefaults() {
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mileageRateCents: Math.round(Number(mileageRate || 0) * 100),
      }),
    });
    setPayrollMessage(
      response.ok
        ? "Payroll defaults saved."
        : "Could not save payroll defaults.",
    );
  }

  async function saveRevenueTarget() {
    const dollars = Number(revenueTarget);
    if (
      revenueTarget.trim() !== "" &&
      (!Number.isFinite(dollars) || dollars < 0)
    ) {
      setMessage("Enter a valid non-negative monthly revenue target.");
      return;
    }
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        revenueTargetCents:
          revenueTarget.trim() === "" ? null : Math.round(dollars * 100),
      }),
    });
    setMessage(
      response.ok
        ? "Monthly revenue target saved."
        : "Could not save monthly revenue target.",
    );
  }

  async function saveHolidays() {
    const values = [
      ...new Set(
        holidays
          .split(/\r?\n|,/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ].sort();
    if (values.some((value) => !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
      setMessage("Enter holidays as YYYY-MM-DD, one date per line.");
      return;
    }
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holidays: values }),
    });
    setMessage(
      response.ok
        ? "Calendar holidays saved."
        : "Could not save calendar holidays.",
    );
  }

  async function saveWorkingDays() {
    if (!workingDays.length) {
      setMessage("Select at least one working day.");
      return;
    }
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workingDays }),
    });
    setMessage(
      response.ok
        ? "Calendar working days saved."
        : "Could not save calendar working days.",
    );
  }

  async function testGhlConnection() {
    setTestingGhl(true);
    setGhlTest(null);
    try {
      const response = await fetch("/api/integrations/ghl/test");
      const body = (await response.json().catch(() => ({}))) as GhlTestStatus;
      setGhlTest(body);
    } finally {
      setTestingGhl(false);
    }
  }

  if (loading) {
    return (
      <div className="co-card p-8 text-sm text-[var(--co-muted)]">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Control room</p>
          <h1 className="page-title mt-2">Settings</h1>
          <p className="page-subtitle">
            Configure how ServiceSpark represents your company and runs daily
            operations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/sync-issues" className="co-button-secondary">
            Sync issues
          </Link>
          <Link href="/dashboard" className="co-button-primary">
            Back to dashboard
          </Link>
        </div>
      </header>

      {message ? (
        <p className="text-sm font-medium text-[var(--co-evergreen)]">
          {message}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {status.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            hint={card.hint}
          />
        ))}
      </section>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
          <p className="eyebrow">API configuration</p>
          <h2 className="mt-1 text-lg font-semibold">Connected services</h2>
          <p className="mt-1 text-sm text-[var(--co-muted)]">
            These are the integration switches ServiceSpark expects to find in your
            environment and connected accounts.
          </p>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-3">
          {apiCards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{card.label}</p>
                  <p className="mt-1 text-xs text-[var(--co-muted)]">
                    {card.hint}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${card.status === "Configured" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                >
                  {card.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="co-card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--co-line-soft)] px-5 py-4">
          <div>
            <p className="eyebrow">GHL smoke test</p>
            <h2 className="mt-1 text-lg font-semibold">
              Verify the test subaccount
            </h2>
            <p className="mt-1 text-sm text-[var(--co-muted)]">
              This checks whether ServiceSpark can reach GHL with the configured API
              key and location ID.
            </p>
          </div>
          <button
            onClick={testGhlConnection}
            disabled={testingGhl}
            className="co-button-primary"
          >
            {testingGhl ? "Testing…" : "Test GHL connection"}
          </button>
        </div>
        <div className="px-5 py-5 text-sm">
          {ghlTest ? (
            <div
              className={`rounded-2xl border px-4 py-3 ${ghlTest.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}
            >
              <p className="font-semibold">
                {ghlTest.ok
                  ? "GHL connection looks good."
                  : "GHL connection needs attention."}
              </p>
              <p className="mt-1 text-xs leading-5 opacity-80">
                {ghlTest.reason ??
                  (ghlTest.ok
                    ? "The configured API key and location responded successfully."
                    : "The test request did not succeed.")}
              </p>
              {ghlTest.status ? (
                <p className="mt-2 text-xs opacity-70">
                  Status: {ghlTest.status}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-[var(--co-muted)]">
              Run this after you plug in the test account credentials so we can
              confirm the integration end to end.
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <Panel
          eyebrow="Company profile"
          title="Identity and time"
          description="These values shape the app and payroll behavior."
        >
          <div className="grid gap-4">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">
                Company name
              </span>
              <input
                className="co-input w-full"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">
                Company timezone
              </span>
              <input
                className="co-input w-full"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                placeholder="America/Chicago"
              />
            </label>
          </div>
          <button onClick={saveCompany} className="co-button-primary mt-5">
            Save company settings
          </button>
        </Panel>

        <Panel
          eyebrow="Payroll defaults"
          title="Mileage policy"
          description="This is used when a new payroll period is generated."
        >
          <label className="block max-w-xs text-sm">
            <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">
              Mileage rate ($ / mile)
            </span>
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
          <button
            onClick={savePayrollDefaults}
            className="co-button-secondary mt-5"
          >
            Save payroll defaults
          </button>
          {payrollMessage ? (
            <p className="mt-3 text-sm text-[var(--co-evergreen)]">
              {payrollMessage}
            </p>
          ) : null}
        </Panel>

        <Panel
          eyebrow="Revenue goal"
          title="Monthly target"
          description="Used to compare paid revenue on the dashboard."
        >
          <label className="block max-w-xs text-sm">
            <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">
              Monthly revenue target ($)
            </span>
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
          <button
            onClick={saveRevenueTarget}
            className="co-button-secondary mt-5"
          >
            Save monthly target
          </button>
        </Panel>

        <Panel
          eyebrow="Calendar"
          title="Company holidays"
          description="Jobs remain visible for review, but dispatch capacity is marked closed on these dates."
        >
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">
              Holiday dates
            </span>
            <textarea
              className="co-input min-h-32 w-full font-mono text-xs"
              value={holidays}
              onChange={(event) => setHolidays(event.target.value)}
              placeholder={"2026-01-01\n2026-12-25"}
            />
            <span className="mt-2 block text-xs leading-5 text-[var(--co-muted)]">
              One YYYY-MM-DD date per line. Leave empty if no closures are
              scheduled.
            </span>
          </label>
          <button onClick={saveHolidays} className="co-button-secondary mt-5">
            Save holidays
          </button>
        </Panel>

        <Panel
          eyebrow="Calendar"
          title="Working days"
          description="Week and Month views use these days for dispatch capacity."
        >
          <div className="flex flex-wrap gap-2">
            {[
              [0, "Sun"],
              [1, "Mon"],
              [2, "Tue"],
              [3, "Wed"],
              [4, "Thu"],
              [5, "Fri"],
              [6, "Sat"],
            ].map(([value, label]) => (
              <label
                key={String(value)}
                className="flex items-center gap-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={workingDays.includes(value as number)}
                  onChange={() =>
                    setWorkingDays((current) =>
                      current.includes(value as number)
                        ? current.filter((day) => day !== value)
                        : [...current, value as number].sort(),
                    )
                  }
                  className="h-4 w-4 accent-[var(--co-evergreen)]"
                />
                {label}
              </label>
            ))}
          </div>
          <button
            onClick={saveWorkingDays}
            className="co-button-secondary mt-5"
          >
            Save working days
          </button>
        </Panel>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel
          eyebrow="Configuration"
          title="Workspace settings"
          description="Open the subpages that control quoting, branding, integration, and pricing."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {SECTIONS.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="co-card group p-5 transition hover:-translate-y-0.5 hover:border-[var(--co-evergreen)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold">{section.label}</h3>
                  <span className="text-lg text-[var(--co-evergreen)] transition group-hover:translate-x-1">
                    →
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--co-muted)]">
                  {section.desc}
                </p>
              </Link>
            ))}
            <Link
              href="/employees"
              className="co-card group p-5 transition hover:-translate-y-0.5 hover:border-[var(--co-evergreen)]"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold">Employees & pay</h3>
                <span className="text-lg text-[var(--co-evergreen)] transition group-hover:translate-x-1">
                  →
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--co-muted)]">
                Manage employee records, pay types, rates, and commissions.
              </p>
            </Link>
            <Link
              href="/sync-issues"
              className="co-card group p-5 transition hover:-translate-y-0.5 hover:border-[var(--co-evergreen)]"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold">Sync monitoring</h3>
                <span className="text-lg text-[var(--co-evergreen)] transition group-hover:translate-x-1">
                  →
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--co-muted)]">
                Review failed GHL or Square syncs before they become support
                issues.
              </p>
            </Link>
          </div>
        </Panel>

        <Panel
          eyebrow="Access"
          title="Administrators"
          description="The people who can manage the company settings."
        >
          <div className="divide-y divide-[var(--co-line-soft)]">
            {admins.map((admin) => (
              <AdminRow key={admin.id} admin={admin} />
            ))}
            {admins.length === 0 ? (
              <p className="py-3 text-sm text-[var(--co-muted)]">
                No administrators found.
              </p>
            ) : null}
          </div>
          <p className="mt-4 text-xs leading-5 text-[var(--co-muted)]">
            Login is by username, not email, so there is no self-service
            &quot;forgot password&quot; link. Any admin can reset another
            admin&apos;s password here and share it with them directly.
          </p>
        </Panel>
      </section>
    </div>
  );
}

function AdminRow({ admin }: { admin: AdminRow }) {
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFieldStaff, setIsFieldStaff] = useState(admin.isFieldStaff);
  const [fieldStaffSaving, setFieldStaffSaving] = useState(false);
  const [fieldStaffError, setFieldStaffError] = useState<string | null>(null);

  async function toggleFieldStaff() {
    const next = !isFieldStaff;
    setFieldStaffSaving(true);
    setFieldStaffError(null);
    const response = await fetch(`/api/employees/${admin.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFieldStaff: next }),
    });
    setFieldStaffSaving(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setFieldStaffError(data.error ?? "Could not update this.");
      return;
    }
    setIsFieldStaff(next);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    const response = await fetch(`/api/employees/${admin.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, confirmPassword }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(data.error ?? "Could not change the password.");
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setMessage("Password changed. Share the new password securely.");
  }

  return (
    <div className="py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            {admin.firstName} {admin.lastName}
          </p>
          <p className="text-xs text-[var(--co-muted)]">
            {emailToUsername(admin.email)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${admin.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
          >
            {admin.isActive ? "Active" : "Inactive"}
          </span>
          <button
            type="button"
            onClick={() => {
              setResetting((value) => !value);
              setMessage(null);
              setError(null);
            }}
            className="co-button-secondary text-xs"
          >
            {resetting ? "Cancel" : "Reset password"}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs font-medium text-[var(--co-muted)]">
          <input
            type="checkbox"
            checked={isFieldStaff}
            disabled={fieldStaffSaving}
            onChange={toggleFieldStaff}
            className="h-4 w-4 rounded border-[var(--co-line)]"
          />
          Also a field cleaner (assignable to jobs, included in payroll)
        </label>
        {isFieldStaff ? (
          <Link href={`/employees/${admin.id}`} className="text-xs font-medium text-[var(--co-evergreen)] hover:underline">
            Set up pay type & rate →
          </Link>
        ) : null}
      </div>
      {fieldStaffError ? <p className="mt-1 text-xs font-semibold text-rose-600">{fieldStaffError}</p> : null}
      {isFieldStaff && !admin.payType ? (
        <p className="mt-1 text-xs text-[var(--co-warning)]">
          No pay type set yet — payroll will skip {admin.firstName} until one is set.
        </p>
      ) : null}

      {resetting ? (
        <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block text-xs font-semibold text-[var(--co-muted)]">
            New password
            <input
              aria-label={`New password for ${admin.firstName} ${admin.lastName}`}
              type="password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="co-input mt-1.5 w-full text-sm"
              placeholder="At least 8 characters"
              required
            />
          </label>
          <label className="block text-xs font-semibold text-[var(--co-muted)]">
            Confirm password
            <input
              aria-label={`Confirm password for ${admin.firstName} ${admin.lastName}`}
              type="password"
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="co-input mt-1.5 w-full text-sm"
              placeholder="Repeat password"
              required
            />
          </label>
          <button type="submit" className="co-button-primary text-xs" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </form>
      ) : null}

      {message ? <p className="mt-2 text-xs font-semibold text-[var(--co-evergreen)]">{message}</p> : null}
      {error ? <p className="mt-2 text-xs font-semibold text-rose-600">{error}</p> : null}
    </div>
  );
}
