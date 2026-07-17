"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type GmailStatus = { connected: boolean; senderEmail?: string; senderName?: string | null; connectedAt?: string; lastUsedAt?: string | null };

export default function GmailSettingsPage() {
  const [status, setStatus] = useState<GmailStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        setStatus(data.integrations?.gmail ?? { connected: false });
        setLoading(false);
      })
      .catch(() => {
        setMessage("Could not load Gmail connection.");
        setLoading(false);
      });
  }, []);

  async function disconnect() {
    setWorking(true);
    setMessage("");
    const response = await fetch("/api/integrations/gmail/disconnect", { method: "POST" });
    setWorking(false);
    if (response.ok) {
      setStatus({ connected: false });
      setMessage("Gmail disconnected.");
    } else {
      setMessage("Could not disconnect Gmail.");
    }
  }

  if (loading) {
    return <div className="co-card p-8 text-sm text-[var(--co-muted)]">Loading Gmail settings…</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Settings / Integrations</p>
          <h1 className="page-title mt-2">Gmail sending</h1>
          <p className="page-subtitle">Connect a company mailbox so CleanOps can send quotes and invoices from Gmail.</p>
        </div>
        <Link href="/settings" className="co-button-secondary">← Settings</Link>
      </header>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
          <p className="eyebrow">Connection</p>
          <h2 className="mt-1 text-lg font-semibold">Mailbox status</h2>
        </div>
        <div className="grid gap-5 px-5 py-5 md:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-3">
            <p className="text-sm text-[var(--co-muted)]">
              CleanOps only asks for Gmail send access plus basic Google identity so we can know which company mailbox is connected.
            </p>
            <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--co-muted)]">Current mailbox</p>
              <p className="mt-2 text-base font-semibold">{status.connected ? status.senderEmail ?? "Connected" : "Not connected"}</p>
              {status.senderName ? <p className="mt-1 text-sm text-[var(--co-muted)]">{status.senderName}</p> : null}
              {status.connectedAt ? <p className="mt-1 text-xs text-[var(--co-muted)]">Connected {new Date(status.connectedAt).toLocaleString()}</p> : null}
            </div>
            {message ? <p className="text-sm font-medium text-[var(--co-evergreen)]">{message}</p> : null}
          </div>
          <div className="flex flex-col gap-3">
            <a href="/api/integrations/gmail/connect" className="co-button-primary justify-center">
              {status.connected ? "Reconnect Gmail" : "Connect Gmail"}
            </a>
            <button onClick={disconnect} disabled={!status.connected || working} className="co-button-secondary justify-center">
              {working ? "Working…" : "Disconnect Gmail"}
            </button>
          </div>
        </div>
      </section>

      <section className="co-card p-5">
        <p className="eyebrow">Notes</p>
        <h2 className="mt-1 text-lg font-semibold">What this does</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--co-muted)]">
          <li>Sends outgoing quote emails from the connected company mailbox.</li>
          <li>Does not require SMTP credentials.</li>
          <li>Uses Google OAuth, so you can revoke access later from Google if needed.</li>
          <li>Can stay separate from any paid Google Cloud services if you only enable the Gmail API.</li>
        </ul>
      </section>
    </div>
  );
}

