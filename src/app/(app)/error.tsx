"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <h1 className="page-title !text-2xl">Something went wrong</h1>
      <p className="text-sm text-[var(--co-muted)]">
        We hit an unexpected error loading this page. Try again, or head back if it keeps happening.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={reset} className="co-button-primary">
          Try again
        </button>
        <Link href="/" className="co-button-secondary">
          Back to safety
        </Link>
      </div>
    </div>
  );
}
