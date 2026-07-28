"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** The API returns either a plain string or a zod `.flatten()` shape
 * ({formErrors, fieldErrors}) for validation failures. Turn either into a
 * sentence instead of dumping the raw object with JSON.stringify. */
function describeApiError(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const shape = error as { formErrors?: unknown; fieldErrors?: unknown };
    const messages: string[] = [];
    if (Array.isArray(shape.formErrors)) {
      messages.push(...shape.formErrors.filter((m): m is string => typeof m === "string"));
    }
    if (shape.fieldErrors && typeof shape.fieldErrors === "object") {
      for (const value of Object.values(shape.fieldErrors as Record<string, unknown>)) {
        if (Array.isArray(value)) messages.push(...value.filter((m): m is string => typeof m === "string"));
      }
    }
    if (messages.length) return messages.join(" ");
  }
  return "Something went wrong creating this account. Please check the form and try again.";
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">{label}</span>
      {children}
    </label>
  );
}

export default function NewEmployeePage() {
  const router = useRouter();

  const [role, setRole] = useState<"employee" | "admin">("employee");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [hiredDate, setHiredDate] = useState("");
  const [payType, setPayType] = useState<"commission_jth" | "office_hourly">("commission_jth");
  const [hourlyRate, setHourlyRate] = useState("0");
  const [gustoEmployeeId, setGustoEmployeeId] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ username: string; password: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!firstName || !lastName) {
      setError("First name and last name are required.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        firstName,
        lastName,
        contactEmail: contactEmail || undefined,
        phone: phone || undefined,
        title: title || undefined,
        hiredDate: hiredDate || undefined,
        payType: role === "employee" ? payType : undefined,
        hourlyRateCents: role === "employee" ? Math.round(parseFloat(hourlyRate || "0") * 100) : undefined,
        gustoEmployeeId: role === "employee" ? gustoEmployeeId || undefined : undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(describeApiError(body?.error));
      setSubmitting(false);
      return;
    }

    const data = await res.json();
    setResult({ username: data.username, password: data.password });
    setSubmitting(false);
  }

  if (result) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <header className="space-y-2">
          <p className="eyebrow">Operations / Team</p>
          <h1 className="page-title">{role === "admin" ? "Admin" : "Employee"} created</h1>
        </header>
        <section className="co-card space-y-4 p-6">
          <p className="text-sm text-[var(--co-muted)]">
            Share these login details with {firstName} directly (not over an unsecured channel):
          </p>
          <div className="space-y-1 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-4 text-sm">
            <div>
              <span className="text-[var(--co-faint)]">Username:</span> <span className="font-mono">{result.username}</span>
            </div>
            <div>
              <span className="text-[var(--co-faint)]">Password:</span>{" "}
              <span className="font-mono">{result.password}</span>
            </div>
          </div>
          <p className="text-xs text-[var(--co-warning)]">
            This is the default password for every new account — have them change it from Account settings after their first login.
          </p>
          <button
            onClick={() => router.push(role === "admin" ? "/settings" : "/employees")}
            className="co-button-primary w-full"
          >
            Done
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/employees" className="text-sm font-medium text-[var(--co-evergreen)] hover:underline">
          Back to employees
        </Link>
      </div>

      <header className="space-y-2">
        <p className="eyebrow">Operations / Team</p>
        <h1 className="page-title">{role === "admin" ? "New admin" : "New employee"}</h1>
        <p className="page-subtitle max-w-3xl">
          Get the account created — title, pay, and the rest of the profile can be filled in afterward.
        </p>
      </header>

      <form onSubmit={handleSubmit}>
        <section className="co-card overflow-hidden">
          <div className="border-b border-[var(--co-line-soft)] p-6">
            <p className="eyebrow">Account</p>
            <h2 className="mt-2 text-lg font-semibold">Create the record</h2>
          </div>

          <div className="space-y-4 p-6">
            <Field label="Account type">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
                className="co-input w-full"
              >
                <option value="employee">Employee (cleaner)</option>
                <option value="admin">Admin (full access)</option>
              </select>
              {role === "admin" && (
                <p className="mt-1.5 text-xs text-[var(--co-muted)]">
                  Admins get full access to customers, quotes, scheduling, and payroll — no pay/title fields needed.
                </p>
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name">
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="co-input w-full"
                />
              </Field>
              <Field label="Last name">
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="co-input w-full"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email (optional)">
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Personal contact email — not used to log in"
                  className="co-input w-full"
                />
              </Field>
              <Field label="Phone">
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="co-input w-full"
                />
              </Field>
            </div>

            {firstName && lastName ? (
              <p className="text-xs text-[var(--co-muted)]">
                Username will be <span className="font-mono">{`${firstName}${lastName}`.toLowerCase().replace(/[^a-z0-9]/g, "")}</span>, default password <span className="font-mono">password123</span>.
              </p>
            ) : null}

            {role === "employee" && (
              <Field label="Title">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Cleaning Tech (Primary)"
                  className="co-input w-full"
                />
              </Field>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Hired date">
                <input
                  type="date"
                  value={hiredDate}
                  onChange={(e) => setHiredDate(e.target.value)}
                  className="co-input w-full"
                />
              </Field>
            </div>

            {role === "employee" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Pay type">
                    <select
                      value={payType}
                      onChange={(e) => setPayType(e.target.value as typeof payType)}
                      className="co-input w-full"
                    >
                      <option value="commission_jth">Commission (Job Ticket Hours)</option>
                      <option value="office_hourly">Office Hourly</option>
                    </select>
                  </Field>
                  <Field label={payType === "commission_jth" ? "Fallback rate ($/hr)" : "Hourly rate ($/hr)"}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)}
                      className="co-input w-full"
                    />
                  </Field>
                </div>

                <Field label="Gusto employee ID (optional)">
                  <input
                    value={gustoEmployeeId}
                    onChange={(e) => setGustoEmployeeId(e.target.value)}
                    className="co-input w-full"
                  />
                </Field>
              </>
            )}
          </div>
        </section>

        <section className="co-card mt-6 flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="text-sm text-[var(--co-muted)]">
            {error ? <span className="text-rose-600">{error}</span> : "Login details are generated automatically after saving."}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => router.push("/employees")} className="co-button-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="co-button-primary">
              {submitting ? "Creating..." : role === "admin" ? "Create admin" : "Create employee"}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
