"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AddressAutocomplete from "../address-autocomplete";

type CustomerForm = {
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  phone: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  ghlContactId: string;
  clientType: string;
};

const FIELD_ORDER: Array<{ key: keyof CustomerForm; label: string; placeholder?: string }> = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email", placeholder: "name@example.com" },
  { key: "phone", label: "Phone", placeholder: "(555) 555-5555" },
  { key: "addressLine1", label: "Address", placeholder: "123 Main St" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "Zip" },
];

const FIELD_LABELS: Record<keyof CustomerForm, string> = {
  firstName: "First name",
  lastName: "Last name",
  companyName: "Company name",
  email: "Email",
  phone: "Phone",
  addressLine1: "Address",
  city: "City",
  state: "State",
  zip: "Zip",
  county: "County",
  ghlContactId: "GHL contact ID",
  clientType: "Client type",
};

/** Turn a plain string, a zod .flatten() object, or an unknown shape into a
 *  human-readable message plus a per-field map for inline display. */
function parseApiError(error: unknown): { message: string; fields: Partial<Record<keyof CustomerForm, string>> } {
  if (typeof error === "string" && error.trim()) return { message: error, fields: {} };

  if (error && typeof error === "object" && ("fieldErrors" in error || "formErrors" in error)) {
    const flat = error as { formErrors?: string[]; fieldErrors?: Partial<Record<keyof CustomerForm, string[]>> };
    const fields: Partial<Record<keyof CustomerForm, string>> = {};
    for (const [key, messages] of Object.entries(flat.fieldErrors ?? {})) {
      if (messages && messages.length) fields[key as keyof CustomerForm] = messages[0];
    }
    const messages = [
      ...(flat.formErrors ?? []),
      ...Object.entries(fields).map(([key, message]) => `${FIELD_LABELS[key as keyof CustomerForm] ?? key}: ${message}`),
    ];
    return { message: messages.length ? messages.join(" ") : "Please check the highlighted fields.", fields };
  }

  return { message: "Could not create customer. Please try again.", fields: {} };
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
      <div className="border-b border-[var(--co-line-soft)] p-6">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-2 text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[var(--co-muted)]">{description}</p> : null}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

export default function NewCustomerPage() {
  const router = useRouter();
  const [form, setForm] = useState<CustomerForm>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    addressLine1: "",
    city: "",
    state: "OK",
    zip: "",
    county: "",
    ghlContactId: "",
    clientType: "residential",
    companyName: "",
  });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CustomerForm, string>>>({});
  const [saving, setSaving] = useState(false);

  function update(key: keyof CustomerForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function save() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("First and last name are required.");
      setFieldErrors({
        ...(form.firstName.trim() ? {} : { firstName: "First name is required." }),
        ...(form.lastName.trim() ? {} : { lastName: "Last name is required." }),
      });
      return;
    }

    setSaving(true);
    setError("");
    setFieldErrors({});
    const payload = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      addressLine1: form.addressLine1,
      city: form.city,
      state: form.state,
      zip: form.zip,
      county: form.county,
      ghlContactId: form.ghlContactId,
      clientType: form.clientType,
      companyName: form.companyName,
    };

    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const { message, fields } = parseApiError(data.error);
      setError(message);
      setFieldErrors(fields);
      setSaving(false);
      return;
    }

    router.push(`/customers/${data.customer.id}`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/customers" className="text-sm font-medium text-[var(--co-evergreen)] hover:underline">
          Back to customers
        </Link>
        <span className="rounded-full border border-[var(--co-line)] bg-[var(--co-surface)] px-3 py-1 text-xs text-[var(--co-muted)]">Manual customer record</span>
      </div>

      <header className="space-y-2">
        <p className="eyebrow">Operations / Relationships</p>
        <h1 className="page-title">Add customer</h1>
        <p className="page-subtitle max-w-3xl">
          GHL leads and form submissions can still flow in automatically. Use this when you need to create or correct a customer record by hand.
        </p>
      </header>

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel eyebrow="Customer details" title="Create the record" description="The information below is enough to get the customer into the system immediately.">
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELD_ORDER.map(({ key, label, placeholder }) => (
              <label key={key} className={key === "addressLine1" ? "sm:col-span-2" : ""}>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">{label}</span>
                {key === "addressLine1" ? (
                  <AddressAutocomplete
                    value={form.addressLine1}
                    onChange={(value) => update("addressLine1", value)}
                    onAddressSelected={(parts) => {
                      update("addressLine1", parts.addressLine1);
                      update("city", parts.city);
                      update("state", parts.state);
                      update("zip", parts.zip);
                      update("county", parts.county);
                    }}
                  />
                ) : (
                  <input
                    className={`co-input w-full ${fieldErrors[key] ? "border-rose-400 focus:border-rose-400" : ""}`}
                    value={form[key]}
                    onChange={(e) => update(key, e.target.value)}
                    placeholder={placeholder}
                    aria-invalid={fieldErrors[key] ? true : undefined}
                  />
                )}
                {fieldErrors[key] ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors[key]}</span> : null}
              </label>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">Client type</span>
              <select className="co-input w-full" value={form.clientType} onChange={(event) => update("clientType", event.target.value)}>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
              </select>
            </label>
            {form.clientType === "commercial" ? (
              <label>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">Company name</span>
                <input
                  className={`co-input w-full ${fieldErrors.companyName ? "border-rose-400 focus:border-rose-400" : ""}`}
                  value={form.companyName}
                  onChange={(event) => update("companyName", event.target.value)}
                  placeholder="e.g. State Farm"
                  aria-invalid={fieldErrors.companyName ? true : undefined}
                />
                {fieldErrors.companyName ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.companyName}</span> : null}
              </label>
            ) : null}
            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">GHL contact ID</span>
              <input
                className={`co-input w-full ${fieldErrors.ghlContactId ? "border-rose-400 focus:border-rose-400" : ""}`}
                value={form.ghlContactId}
                onChange={(event) => update("ghlContactId", event.target.value)}
                placeholder="Optional if manually linking a contact"
                aria-invalid={fieldErrors.ghlContactId ? true : undefined}
              />
              {fieldErrors.ghlContactId ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.ghlContactId}</span> : null}
            </label>
            <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4 text-sm text-[var(--co-muted)] sm:col-span-2">
              Keep this minimal if you’re creating the record by hand. The fuller house notes, room profile, and scheduling preferences can be filled in on the customer profile next.
            </div>
          </div>
        </Panel>

        <Panel eyebrow="Beta workflow" title="How this fits the office side" description="This is the manual fallback while automatic lead sync stays in place.">
          <div className="space-y-4 text-sm text-[var(--co-muted)]">
            <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4">
              <p className="font-medium text-[var(--co-ink)]">Use this when:</p>
              <ul className="mt-2 space-y-2">
                <li>• A client is not yet in GHL</li>
                <li>• You need a correction or duplicate cleanup</li>
                <li>• You want to start scheduling before automation is connected</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4">
              <p className="font-medium text-[var(--co-ink)]">What happens next</p>
              <ul className="mt-2 space-y-2">
                <li>• The customer opens in CleanOps right after save</li>
                <li>• You can add locations, notes, and jobs from the profile</li>
                <li>• Later we can map GHL contacts into the same profile automatically</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-dashed border-[var(--co-line-soft)] bg-white p-4 text-xs">
              Address autocomplete is supported when your Google Maps key is present. If not, you can still type the address manually.
            </div>
          </div>
        </Panel>
      </section>

      <section className="co-card flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="text-sm text-[var(--co-muted)]">
          {error ? <span className="text-rose-600">{error}</span> : "The customer will appear in CleanOps immediately after saving."}
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.push("/customers")} className="co-button-secondary">
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="co-button-primary">
            {saving ? "Creating..." : "Create customer"}
          </button>
        </div>
      </section>
    </div>
  );
}
