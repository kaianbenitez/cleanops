export default function MyDayLoading() {
  return (
    <div className="mx-auto max-w-[560px] animate-pulse" aria-label="Loading My Day" role="status">
      <div className="px-4 pb-3 pt-1 sm:px-5">
        <div className="h-6 w-32 rounded bg-[var(--co-surface-muted)]" />
        <div className="mt-2 h-4 w-64 max-w-full rounded bg-[var(--co-surface-muted)]" />
      </div>
      <div className="h-[76px] border-y border-[var(--co-line-soft)] bg-[var(--co-surface)] px-4 py-4 sm:px-5">
        <div className="h-5 w-48 rounded bg-[var(--co-surface-muted)]" />
        <div className="mt-2 h-4 w-32 rounded bg-[var(--co-surface-muted)]" />
      </div>
      <div className="mt-3 space-y-2 px-4 sm:px-5">
        <div className="h-20 rounded-[var(--co-radius-card)] bg-[var(--co-surface-muted)]" />
        <div className="h-16 rounded-[var(--co-radius-card)] bg-[var(--co-surface-muted)]" />
        <div className="h-16 rounded-[var(--co-radius-card)] bg-[var(--co-surface-muted)]" />
      </div>
    </div>
  );
}
