"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
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
  generalNotes: string;
  doNotClean: string;
  petNotes: string;
  importantToCustomer: string;
  entryCode: string;
  garageCode: string;
  gateCode: string;
  alarmCode: string;
  keyNumber: string;
  vacuumLocation: string;
  mopHeadsNeeded: string;
  trashBags: string;
};

const MASKED_ACCESS_CODE_KEYS = ["entryCode", "garageCode", "gateCode", "alarmCode"] as const;
const PLAIN_ACCESS_KEYS = ["keyNumber", "vacuumLocation", "mopHeadsNeeded", "trashBags"] as const;

type RoomType = { id: string; name: string };

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

const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  phone: "Phone",
  addressLine1: "Address",
  city: "City",
  state: "State",
  zip: "Zip",
  county: "County",
  ghlContactId: "GHL contact ID",
  clientType: "Client type",
  companyName: "Company name",
  generalNotes: "General notes",
  doNotClean: "Do not clean",
  petNotes: "Pet notes",
  importantToCustomer: "Important to customer",
  roomCounts: "Room counts",
  entryCode: "Entry code",
  garageCode: "Garage code",
  gateCode: "Gate code",
  alarmCode: "Alarm code",
  keyNumber: "Key location",
  vacuumLocation: "Vacuum location",
  mopHeadsNeeded: "Mop heads needed",
  trashBags: "Trash bags",
};

function parseApiError(error: unknown) {
  if (typeof error === "string" && error.trim()) return { message: error, fieldErrors: {} };
  if (error && typeof error === "object") {
    const shape = error as { formErrors?: unknown; fieldErrors?: unknown };
    const fieldErrors: Record<string, string> = {};
    if (shape.fieldErrors && typeof shape.fieldErrors === "object") {
      for (const [field, messages] of Object.entries(shape.fieldErrors as Record<string, unknown>)) {
        if (Array.isArray(messages) && messages.some((message) => typeof message === "string" && Boolean(message.trim()))) {
          fieldErrors[field] = messages.filter((message): message is string => typeof message === "string" && Boolean(message.trim())).join(" ");
        }
      }
    }
    const formErrors = Array.isArray(shape.formErrors)
      ? shape.formErrors.filter((message): message is string => typeof message === "string" && Boolean(message.trim()))
      : [];
    const fieldMessage = Object.entries(fieldErrors).map(([field, message]) => `${FIELD_LABELS[field] ?? field}: ${message}`);
    if (formErrors.length || fieldMessage.length) return { message: [...formErrors, ...fieldMessage].join(" "), fieldErrors };
  }
  return { message: "Could not create customer. Please check the form and try again.", fieldErrors: {} };
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
      <div className="border-b border-[var(--co-line-soft)] p-6">
        <h2 className="text-lg font-semibold">{title}</h2>
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
    generalNotes: "",
    doNotClean: "",
    petNotes: "",
    importantToCustomer: "",
    entryCode: "",
    garageCode: "",
    gateCode: "",
    alarmCode: "",
    keyNumber: "",
    vacuumLocation: "",
    mopHeadsNeeded: "",
    trashBags: "",
  });
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [roomCounts, setRoomCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [revealedCodes, setRevealedCodes] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/room-types")
      .then((response) => response.json())
      .then((body) => setRoomTypes(body.roomTypes ?? []))
      .catch(() => setRoomTypes([]));
  }, []);

  function update(key: keyof CustomerForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function setRoomCount(id: string, count: number) {
    setRoomCounts((current) => ({ ...current, [id]: Math.max(0, count) }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.roomCounts;
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
    const populatedRoomCounts = Object.fromEntries(Object.entries(roomCounts).filter(([, count]) => count > 0));
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
      generalNotes: form.generalNotes || undefined,
      doNotClean: form.doNotClean || undefined,
      petNotes: form.petNotes || undefined,
      importantToCustomer: form.importantToCustomer || undefined,
      roomCounts: Object.keys(populatedRoomCounts).length ? populatedRoomCounts : undefined,
      entryCode: form.addressLine1 ? form.entryCode || undefined : undefined,
      garageCode: form.addressLine1 ? form.garageCode || undefined : undefined,
      gateCode: form.addressLine1 ? form.gateCode || undefined : undefined,
      alarmCode: form.addressLine1 ? form.alarmCode || undefined : undefined,
      keyNumber: form.addressLine1 ? form.keyNumber || undefined : undefined,
      vacuumLocation: form.addressLine1 ? form.vacuumLocation || undefined : undefined,
      mopHeadsNeeded: form.addressLine1 ? form.mopHeadsNeeded || undefined : undefined,
      trashBags: form.addressLine1 ? form.trashBags || undefined : undefined,
    };

    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const parsedError = parseApiError(data.error);
      setError(parsedError.message);
      setFieldErrors(parsedError.fieldErrors);
      setSaving(false);
      return;
    }

    router.push(`/customers/${data.customer.id}`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link href="/customers" className="text-sm font-medium text-[var(--co-accent-text)] hover:underline">
          Back to customers
        </Link>
      </div>

      <header>
        <h1 className="page-title">Add customer</h1>
      </header>

      <section className="space-y-5">
        <Panel title="Customer details">
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
                    className={`co-input w-full ${fieldErrors[key] ? "border-[var(--co-danger)] focus:border-[var(--co-danger)]" : ""}`}
                    value={form[key]}
                    onChange={(e) => update(key, e.target.value)}
                    placeholder={placeholder}
                    aria-invalid={fieldErrors[key] ? true : undefined}
                  />
                )}
                {fieldErrors[key] ? <p className="mt-1 text-xs text-[var(--co-danger)]">{fieldErrors[key]}</p> : null}
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
              {fieldErrors.clientType ? <p className="mt-1 text-xs text-[var(--co-danger)]">{fieldErrors.clientType}</p> : null}
            </label>
            {form.clientType === "commercial" ? (
              <label>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">Company name</span>
                <input
                  className={`co-input w-full ${fieldErrors.companyName ? "border-[var(--co-danger)] focus:border-[var(--co-danger)]" : ""}`}
                  value={form.companyName}
                  onChange={(event) => update("companyName", event.target.value)}
                  placeholder="e.g. State Farm"
                  aria-invalid={fieldErrors.companyName ? true : undefined}
                />
                {fieldErrors.companyName ? <p className="mt-1 text-xs text-[var(--co-danger)]">{fieldErrors.companyName}</p> : null}
              </label>
            ) : null}
            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">GHL contact ID</span>
              <input
                className={`co-input w-full ${fieldErrors.ghlContactId ? "border-[var(--co-danger)] focus:border-[var(--co-danger)]" : ""}`}
                value={form.ghlContactId}
                onChange={(event) => update("ghlContactId", event.target.value)}
                placeholder="Optional if manually linking a contact"
                aria-invalid={fieldErrors.ghlContactId ? true : undefined}
              />
              {fieldErrors.ghlContactId ? <p className="mt-1 text-xs text-[var(--co-danger)]">{fieldErrors.ghlContactId}</p> : null}
            </label>
          </div>
        </Panel>

        <details className="co-card overflow-hidden">
          <summary className="cursor-pointer border-b border-[var(--co-line-soft)] p-6 text-lg font-semibold">Home details (optional)</summary>
          <div className="space-y-6 p-6">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">Room counts</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {roomTypes.map((room) => {
                  const count = roomCounts[room.id] ?? 0;
                  return (
                    <div key={room.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 px-3 py-2.5">
                      <span className="truncate text-sm font-medium text-[var(--co-ink)]">{room.name}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <button type="button" onClick={() => setRoomCount(room.id, count - 1)} aria-label={`Decrease ${room.name}`} className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--co-line)] text-[var(--co-muted)] hover:bg-[var(--co-surface)]">
                          <Minus className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <span className="w-4 text-center text-sm font-semibold tabular-nums text-[var(--co-ink)]">{count}</span>
                        <button type="button" onClick={() => setRoomCount(room.id, count + 1)} aria-label={`Increase ${room.name}`} className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--co-accent-fill)] text-white hover:bg-[var(--co-accent-fill-hover)]">
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {roomTypes.length === 0 ? <p className="text-sm text-[var(--co-muted)]">No room types configured yet.</p> : null}
              </div>
              {fieldErrors.roomCounts ? <p className="mt-1 text-xs text-[var(--co-danger)]">{fieldErrors.roomCounts}</p> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {(["generalNotes", "doNotClean", "petNotes", "importantToCustomer"] as const).map((key) => (
                <label key={key}>
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">{FIELD_LABELS[key]}</span>
                  <textarea className="co-input w-full resize-none" rows={3} value={form[key]} onChange={(event) => update(key, event.target.value)} />
                  {fieldErrors[key] ? <p className="mt-1 text-xs text-[var(--co-danger)]">{fieldErrors[key]}</p> : null}
                </label>
              ))}
            </div>

            {form.addressLine1 ? (
              <div className="space-y-4">
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">Access codes</p>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {MASKED_ACCESS_CODE_KEYS.map((key) => {
                      const revealed = revealedCodes[key] ?? false;
                      return (
                        <label key={key}>
                          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">{FIELD_LABELS[key]}</span>
                          <div className="relative">
                            <input
                              type={revealed ? "text" : "password"}
                              autoComplete="off"
                              className="co-input w-full pr-10"
                              value={form[key]}
                              onChange={(event) => update(key, event.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => setRevealedCodes((current) => ({ ...current, [key]: !revealed }))}
                              aria-label={revealed ? `Hide ${FIELD_LABELS[key].toLowerCase()}` : `Show ${FIELD_LABELS[key].toLowerCase()}`}
                              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--co-muted)]"
                            >
                              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          {fieldErrors[key] ? <p className="mt-1 text-xs text-[var(--co-danger)]">{fieldErrors[key]}</p> : null}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">Access details</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {PLAIN_ACCESS_KEYS.map((key) => (
                      <label key={key}>
                        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">{FIELD_LABELS[key]}</span>
                        <input className="co-input w-full" value={form[key]} onChange={(event) => update(key, event.target.value)} />
                        {fieldErrors[key] ? <p className="mt-1 text-xs text-[var(--co-danger)]">{fieldErrors[key]}</p> : null}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </details>

      </section>

      <section className="co-card flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="text-sm text-[var(--co-muted)]">
          {error ? <span className="text-[var(--co-danger)]">{error}</span> : null}
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
