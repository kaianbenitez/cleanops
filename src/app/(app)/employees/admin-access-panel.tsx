"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { emailToUsername } from "@/lib/auth/username";

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

export default function AdminAccessPanel() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/admins")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (response.ok) setAdmins(data.admins ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  return (
    <section className="co-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <p className="eyebrow">Access</p>
          <h2 className="mt-1 text-lg font-semibold">Administrators</h2>
          <p className="mt-1 text-sm text-[var(--co-muted)]">
            {admins.length} {admins.length === 1 ? "person" : "people"} can manage company settings.
          </p>
        </div>
        <span className="co-button-secondary text-xs">{open ? "Hide" : "Show"}</span>
      </button>

      {open ? (
        <div className="border-t border-[var(--co-line-soft)] px-5 py-4">
          <div className="divide-y divide-[var(--co-line-soft)]">
            {admins.map((admin) => (
              <AdminRowItem key={admin.id} admin={admin} />
            ))}
            {admins.length === 0 ? (
              <p className="py-3 text-sm text-[var(--co-muted)]">No administrators found.</p>
            ) : null}
          </div>
          <p className="mt-4 text-xs leading-5 text-[var(--co-muted)]">
            Login is by username, not email, so there is no self-service &quot;forgot password&quot; link. Any
            admin can reset another admin&apos;s password here and share it with them directly.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function AdminRowItem({ admin }: { admin: AdminRow }) {
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
          <p className="text-xs text-[var(--co-muted)]">{emailToUsername(admin.email)}</p>
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
          <Link href={`/employees/${admin.id}`} className="text-xs font-medium text-[var(--co-accent-text)] hover:underline">
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

      {message ? <p className="mt-2 text-xs font-semibold text-[var(--co-accent-text)]">{message}</p> : null}
      {error ? <p className="mt-2 text-xs font-semibold text-rose-600">{error}</p> : null}
    </div>
  );
}
