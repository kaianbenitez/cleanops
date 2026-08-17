"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Blocks the rest of the app until a temporary password (issued at
 * creation or an admin reset) is replaced. Rendered by `layout.tsx` in place
 * of `children` whenever `mustChangePassword` is set on the current user. */
export default function MustChangePassword() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword, confirmPassword }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to update password.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
      <div className="co-card space-y-4 p-6">
        <div>
          <p className="eyebrow">Security</p>
          <h1 className="page-title mt-2">Set a new password</h1>
          <p className="page-subtitle">
            This account is still using the one-time temporary password. Set your own
            password to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">New password</span>
            <input
              type="password"
              className="co-input w-full"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              autoFocus
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Confirm new password</span>
            <input
              type="password"
              className="co-input w-full"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
            />
          </label>

          {error ? <p className="text-sm font-medium text-[var(--co-danger)]">{error}</p> : null}

          <button type="submit" disabled={saving} className="co-button-primary w-full justify-center">
            {saving ? "Saving…" : "Set password"}
          </button>
        </form>

        <form action="/api/auth/logout" method="post">
          <button type="submit" className="text-sm font-medium text-[var(--co-muted)] hover:underline">
            Sign out instead
          </button>
        </form>
      </div>
    </div>
  );
}
