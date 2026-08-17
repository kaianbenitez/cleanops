"use client";

import Link from "next/link";
import { useState } from "react";

export default function WeekendOrphanBanner({ count, firstDate }: { count: number; firstDate: string }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
  }

  return (
    <div role="status" className="mb-3 flex items-center gap-3 border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <p><strong>{count}</strong> job{count === 1 ? " is" : "s are"} scheduled on a weekend and hidden from Week and Month views.</p>
      <Link href={`/calendar?view=staff&day=${firstDate}`} className="font-semibold text-[var(--co-accent-text)] hover:underline">View</Link>
      <button type="button" onClick={dismiss} className="ml-auto text-sm font-semibold text-amber-950 hover:underline" aria-label="Dismiss weekend jobs notice">Dismiss</button>
    </div>
  );
}
