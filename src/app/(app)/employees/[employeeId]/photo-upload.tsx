"use client";

import { useRef, useState } from "react";

export default function PhotoUpload({ employeeId, photoUrl, initials, onUploaded }: { employeeId: string; photoUrl: string | null; initials: string; onUploaded: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(file: File) {
    setBusy(true); setError(null);
    const body = new FormData(); body.set("photo", file);
    const response = await fetch(`/api/employees/${employeeId}/photo`, { method: "POST", body });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Photo upload failed.");
    await onUploaded();
  }
  return <div className="relative h-[76px] w-[76px] shrink-0">
    {photoUrl ? <img src={photoUrl} alt="Employee profile" className="h-full w-full rounded-2xl border-2 border-[var(--co-evergreen)] object-cover" /> : <div className="flex h-full w-full items-center justify-center rounded-2xl border-2 border-[var(--co-evergreen)] bg-[var(--co-surface-muted)] text-2xl font-semibold text-[var(--co-evergreen)]">{initials}</div>}
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
    <button type="button" onClick={() => input.current?.click()} disabled={busy} className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border bg-white px-2 py-0.5 text-[9px] font-bold text-[var(--co-evergreen)]">{busy ? "Uploading" : "Photo"}</button>
    {error ? <p className="absolute top-full mt-4 w-44 text-[10px] text-rose-600">{error}</p> : null}
  </div>;
}
