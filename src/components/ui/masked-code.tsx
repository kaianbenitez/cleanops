"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Garage/gate/alarm/key codes are effectively a house key — hidden by default
 * so they aren't sitting in plain view on a glanced-at or screenshotted
 * screen, one tap away for whoever actually needs to get in.
 */
export function MaskedCode({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setRevealed((current) => !current)}
      className={`inline-flex items-center gap-1.5 rounded-md border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-2 py-1 text-right font-mono text-sm font-semibold tracking-wide text-[var(--co-ink)] ${className}`}
      aria-label={revealed ? "Hide access codes" : "Tap to reveal access codes"}
    >
      <span>{revealed ? children : "•••• Tap to reveal"}</span>
      {revealed ? <EyeOff className="h-3.5 w-3.5 shrink-0 text-[var(--co-muted)]" /> : <Eye className="h-3.5 w-3.5 shrink-0 text-[var(--co-muted)]" />}
    </button>
  );
}
