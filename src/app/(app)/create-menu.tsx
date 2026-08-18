"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Plus, ChevronDown, FileText, ClipboardList, UserPlus } from "lucide-react";

export default function CreateMenu({
  compact = false,
  leadingItem,
}: {
  compact?: boolean;
  /** An extra menu item rendered above Customer/Quote/Job — e.g. Calendar's
   * own "Schedule job" shortcut. Additive only; omitting it (every existing
   * call site) renders the original 3-item menu unchanged. */
  leadingItem?: { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Create new"
          className="rounded-full p-2 text-[var(--co-muted)] transition-colors hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
        >
          <Plus className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </button>
      ) : (
        <button type="button" onClick={() => setOpen((current) => !current)} aria-haspopup="menu" aria-expanded={open} className="co-button-primary">
          <Plus className="h-4 w-4" aria-hidden />
          Create new
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      )}

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface)] py-1 shadow-[0_10px_32px_rgba(18,24,19,0.12)]"
        >
          {leadingItem ? (
            <Link
              href={leadingItem.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--co-ink)] transition hover:bg-[var(--co-surface-muted)]"
            >
              <leadingItem.icon className="h-4 w-4 text-[var(--co-muted)]" aria-hidden />
              {leadingItem.label}
            </Link>
          ) : null}
          <Link
            href="/customers/new"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--co-ink)] transition hover:bg-[var(--co-surface-muted)]"
          >
            <UserPlus className="h-4 w-4 text-[var(--co-muted)]" aria-hidden />
            Customer
          </Link>
          <Link
            href="/quotes/new"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--co-ink)] transition hover:bg-[var(--co-surface-muted)]"
          >
            <FileText className="h-4 w-4 text-[var(--co-muted)]" aria-hidden />
            Quote
          </Link>
          <Link
            href="/jobs/new"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--co-ink)] transition hover:bg-[var(--co-surface-muted)]"
          >
            <ClipboardList className="h-4 w-4 text-[var(--co-muted)]" aria-hidden />
            Job
          </Link>
        </div>
      ) : null}
    </div>
  );
}
