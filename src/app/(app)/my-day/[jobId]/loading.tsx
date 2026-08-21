export default function JobExecutionLoading() {
  return (
    <div className="mx-auto max-w-[560px] animate-pulse" aria-label="Loading stop" role="status">
      <div className="h-8 w-28 rounded bg-[var(--co-surface-muted)]" />
      <div className="mt-4 h-28 rounded-[var(--co-radius-card)] bg-[var(--co-surface-muted)]" />
      <div className="mt-4 h-32 rounded-[var(--co-radius-card)] bg-[var(--co-surface-muted)]" />
      <div className="mt-4 h-14 rounded-full bg-[var(--co-surface-muted)]" />
    </div>
  );
}
