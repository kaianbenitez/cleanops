"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Result = { id: string; kind: string; title: string; subtitle: string; meta?: string[]; href: string };

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    const value = query.trim();
    if (!value) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search failed");
        const data = (await response.json()) as { results?: Result[] };
        setResults(data.results ?? []);
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setError(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const showResults = open && Boolean(query.trim());

  return <div ref={searchRef} className="relative hidden min-w-0 sm:block">
    <label className="relative block w-[min(38vw,360px)]">
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[var(--co-muted)]" aria-hidden />
      <input
        value={query}
        onChange={(event) => { setQuery(event.target.value); setResults([]); setError(false); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
        placeholder="Search jobs, clients, cleaners..."
        aria-label="Search jobs, clients, and cleaners"
        role="combobox"
        aria-expanded={showResults}
        aria-controls="global-search-results"
        style={{ paddingLeft: "2.5rem" }}
        className="co-input h-10 w-full rounded-lg bg-[var(--co-surface-muted)] pr-3 text-sm"
      />
    </label>
    {showResults ? <div id="global-search-results" role="listbox" className="absolute left-0 top-full z-50 mt-2 w-[min(38vw,420px)] overflow-hidden rounded-xl border border-[var(--co-line)] bg-white shadow-[0_12px_32px_rgba(18,24,19,0.16)]">
      {loading ? <p className="px-3 py-4 text-xs text-[var(--co-muted)]">Searching...</p> : error ? <p className="px-3 py-4 text-xs text-rose-700">Search is unavailable right now. Try again.</p> : results.length ? results.map((result) => <Link key={`${result.kind}-${result.id}`} href={result.href} onClick={() => setOpen(false)} role="option" className="block border-b border-[var(--co-line-soft)] px-3 py-2.5 last:border-0 hover:bg-[var(--co-surface-muted)]"><p className="text-sm font-semibold">{result.title}</p><p className="mt-0.5 text-xs text-[var(--co-muted)]">{result.kind} · {result.subtitle}</p>{result.meta?.length ? <p className="mt-1 truncate text-[11px] text-[var(--co-faint)]">{result.meta.join(" · ")}</p> : null}</Link>) : <p className="px-3 py-4 text-xs text-[var(--co-muted)]">No matching customers, invoices, quotes, or employees.</p>}
    </div> : null}
  </div>;
}
