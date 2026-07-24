"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RecalculateEstimatesButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function recalculate() {
    setState("working");
    const response = await fetch("/api/jobs/recalculate-estimates", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState("error");
      setMessage(body.error ?? "Could not recalculate estimates.");
      return;
    }
    setState("done");
    setMessage(`${body.updated ?? 0} updated${body.unresolved?.length ? ` · ${body.unresolved.length} need an area` : ""}`);
    router.refresh();
  }

  return <div className="flex items-center gap-2"><button type="button" onClick={recalculate} disabled={state === "working"} className="co-button-secondary">{state === "working" ? "Recalculating…" : "Recalculate est. hours"}</button>{message ? <span className={`text-xs ${state === "error" ? "text-rose-700" : "text-[var(--co-muted)]"}`}>{message}</span> : null}</div>;
}
