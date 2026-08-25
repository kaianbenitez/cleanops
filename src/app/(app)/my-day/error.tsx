"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function MyDayError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <h1 className="type-field-display font-semibold text-[var(--co-ink)]">My Day couldn&apos;t load</h1>
      <p className="type-field-meta text-[var(--co-muted)]">
        This screen is unavailable right now. Work already saved remains safe. Check My Day before trying another action,
        then try again. If it still will not load, contact the office.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={reset} className="co-button-primary">
          Try again
        </button>
        <Link href="/my-day" className="co-button-secondary">
          Back to My day
        </Link>
      </div>
    </div>
  );
}
