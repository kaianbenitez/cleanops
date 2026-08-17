"use client";

import { useState } from "react";

export default function AccountPage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (newPassword.length < 10) {
      setError("Password must be at least 10 characters.");
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

    setMessage("Password updated.");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <p className="eyebrow">My account</p>
        <h1 className="page-title mt-2">Change password</h1>
        <p className="page-subtitle">Update the password for your own Shimmer login.</p>
      </div>

      <form onSubmit={changePassword} className="co-card space-y-4 p-5">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">New password</span>
          <input
            type="password"
            className="co-input w-full"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={10}
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
            minLength={10}
          />
        </label>

        {error ? <p className="text-sm font-medium text-[var(--co-danger)]">{error}</p> : null}
        {message ? <p className="text-sm font-medium text-[var(--co-accent-text)]">{message}</p> : null}

        <button type="submit" disabled={saving} className="co-button-primary w-full justify-center">
          {saving ? "Saving…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
