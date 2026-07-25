export function ComingSoonStat({ label }: { label: string }) {
  return (
    <section className="rounded-2xl border border-dashed border-[var(--co-line)] bg-[var(--co-surface-muted)]/30 p-5">
      <p className="text-xs font-semibold text-[var(--co-muted)]">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[var(--co-muted)]">—</p>
      <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--co-surface-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--co-muted)]">
        Coming soon
      </p>
    </section>
  );
}
