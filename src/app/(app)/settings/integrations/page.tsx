"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ApiConfig = { square?: { configured?: boolean; webhookConfigured?: boolean }; googleMaps?: { configured?: boolean } };

export default function IntegrationsSettingsPage() {
  const [apiConfig, setApiConfig] = useState<ApiConfig>({});
  const [squareAccessToken, setSquareAccessToken] = useState("");
  const [squareEnvironment, setSquareEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [squareWebhookSignatureKey, setSquareWebhookSignatureKey] = useState("");
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/settings").then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error();
      setApiConfig(body.apiConfig ?? {});
    }).catch(() => setMessage("Could not load integration status."));
  }, []);

  async function save() {
    setSaving(true);
    setMessage("");
    const body: Record<string, string> = { squareEnvironment };
    if (squareAccessToken.trim()) body.squareAccessToken = squareAccessToken.trim();
    if (squareWebhookSignatureKey.trim()) body.squareWebhookSignatureKey = squareWebhookSignatureKey.trim();
    if (googleMapsApiKey.trim()) body.googleMapsApiKey = googleMapsApiKey.trim();
    const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error ?? "Could not save integration settings.");
      return;
    }
    setSquareAccessToken("");
    setSquareWebhookSignatureKey("");
    setGoogleMapsApiKey("");
    setMessage("Integration settings saved. Entered keys are not shown again.");
    const refreshed = await fetch("/api/settings").then((value) => value.json()).catch(() => ({}));
    setApiConfig(refreshed.apiConfig ?? {});
  }

  return <div className="max-w-3xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Settings / Integrations</p><h1 className="page-title mt-2">Square & Google Maps</h1><p className="page-subtitle">Keys are encrypted before storage. Paste a replacement only when you need to change one.</p></div><Link href="/settings" className="co-button-secondary">← Settings</Link></header>
    <section className="co-card space-y-5 p-5"><div><p className="eyebrow">Square invoicing</p><h2 className="mt-1 text-lg font-semibold">Payments connection</h2><p className="mt-1 text-sm text-[var(--co-muted)]">Access token: {apiConfig.square?.configured ? "Configured" : "Not configured"} · Webhook key: {apiConfig.square?.webhookConfigured ? "Configured" : "Not configured"}</p></div>
      <label className="block text-sm font-medium">Environment<select className="co-input mt-2 w-full" value={squareEnvironment} onChange={(event) => setSquareEnvironment(event.target.value as "sandbox" | "production")}><option value="sandbox">Sandbox</option><option value="production">Production</option></select></label>
      <label className="block text-sm font-medium">Square access token<input type="password" autoComplete="off" className="co-input mt-2 w-full" value={squareAccessToken} onChange={(event) => setSquareAccessToken(event.target.value)} placeholder="Paste a new token to replace the saved one" /></label>
      <label className="block text-sm font-medium">Square webhook signature key<input type="password" autoComplete="off" className="co-input mt-2 w-full" value={squareWebhookSignatureKey} onChange={(event) => setSquareWebhookSignatureKey(event.target.value)} placeholder="Paste a new key to replace the saved one" /></label>
    </section>
    <section className="co-card space-y-4 p-5"><div><p className="eyebrow">Google Maps</p><h2 className="mt-1 text-lg font-semibold">Maps connection</h2><p className="mt-1 text-sm text-[var(--co-muted)]">Maps key: {apiConfig.googleMaps?.configured ? "Configured" : "Not configured"}</p></div><label className="block text-sm font-medium">Google Maps API key<input type="password" autoComplete="off" className="co-input mt-2 w-full" value={googleMapsApiKey} onChange={(event) => setGoogleMapsApiKey(event.target.value)} placeholder="Paste a new key to replace the saved one" /></label><p className="text-xs leading-5 text-[var(--co-muted)]">Maps JavaScript keys are visible to browsers when in use; protect this key with HTTP-referrer restrictions in Google Cloud.</p></section>
    <div className="flex flex-wrap items-center gap-3"><button className="co-button-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save integration settings"}</button><p className="text-sm text-[var(--co-muted)]">Leave key fields blank to keep the existing saved value.</p></div>
    {message ? <p className="text-sm font-medium text-[var(--co-evergreen)]">{message}</p> : null}
  </div>;
}
