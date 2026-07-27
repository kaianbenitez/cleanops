// Shown while the server component loads the customer/employee/service lists.
// The form used to render immediately with empty pickers and fill in after
// three client fetches; this holds the layout's shape instead of showing
// controls that aren't usable yet.
export default function NewRecurringSeriesLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden>
      <header className="space-y-2">
        <div className="h-3 w-40 rounded bg-[var(--co-line)]" />
        <div className="h-8 w-72 rounded bg-[var(--co-line)]" />
        <div className="h-4 w-96 max-w-full rounded bg-[var(--co-line-soft)]" />
      </header>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="h-40 rounded-2xl border border-[var(--co-line)] bg-[var(--co-surface)]" />
          <div className="h-72 rounded-2xl border border-[var(--co-line)] bg-[var(--co-surface)]" />
          <div className="h-56 rounded-2xl border border-[var(--co-line)] bg-[var(--co-surface)]" />
          <div className="h-44 rounded-2xl border border-[var(--co-line)] bg-[var(--co-surface)]" />
        </div>
        <div className="h-96 rounded-2xl border border-[var(--co-line)] bg-[var(--co-surface)]" />
      </div>

      <span className="sr-only">Loading the new recurring series form</span>
    </div>
  );
}
