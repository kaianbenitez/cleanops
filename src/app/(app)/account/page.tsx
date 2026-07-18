"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

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

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    const { error: updateError } = await createClient().auth.updateUser({ password: newPassword });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
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
        <p className="page-subtitle">Update the password for your own CleanOps login.</p>
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
            minLength={8}
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

        {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
        {message ? <p className="text-sm font-medium text-[var(--co-evergreen)]">{message}</p> : null}

        <button type="submit" disabled={saving} className="co-button-primary w-full justify-center">
          {saving ? "Saving…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
